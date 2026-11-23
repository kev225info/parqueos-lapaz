import { registrarEnBitacora } from '../utils/auditoria.js';

export const crearAdminParqueo = async (req, res) => {
    const { 
        admin_nombre, admin_email, admin_celular, admin_password, 
        parqueo_nombre, parqueo_direccion, parqueo_lat, parqueo_lng, 
        parqueo_tarifa, parqueo_capacidad 
    } = req.body;

    try {
        // 1. Crear el parqueo primero
        const [parqueoResult] = await pool.query(
            `INSERT INTO parqueos (nombre, direccion, latitud, longitud, capacidad_total, tarifa_por_hora, horario_apertura, horario_cierre, tipo_vehiculo, activo) 
             VALUES (?, ?, ?, ?, ?, ?, '08:00:00', '20:00:00', 'auto', TRUE)`,
            [parqueo_nombre, parqueo_direccion, parqueo_lat, parqueo_lng, parqueo_capacidad, parqueo_tarifa]
        );
        const nuevoParqueoId = parqueoResult.insertId;

        // 2. Crear la disponibilidad inicial
        await pool.query(
            'INSERT INTO disponibilidad (parqueo_id, cupos_libres, cupos_ocupados) VALUES (?, ?, 0)',
            [nuevoParqueoId, parqueo_capacidad]
        );

        // 3. Crear el usuario administrador de ese parqueo
        const bcrypt = await import('bcryptjs');
        const hashedPassword = await bcrypt.hash(admin_password, 10);

        await pool.query(
            `INSERT INTO usuarios (nombre, email, telefono, password, rol, parqueo_id) 
             VALUES (?, ?, ?, ?, 'admin_parqueo', ?)`,
            [admin_nombre, admin_email, admin_celular, hashedPassword, nuevoParqueoId]
        );

         await registrarEnBitacora(
            req.body.usuario_id_super_admin || null, 
            'CREAR_PARQUEO', 
            'parqueos', 
            nuevoParqueoId, 
            null, 
            { nombre: parqueo_nombre, capacidad: parqueo_capacidad, tarifa: parqueo_tarifa }
        );

        res.status(201).json({ 
            mensaje: 'Administrador de parqueo y parqueo creados exitosamente',
            parqueo_id: nuevoParqueoId
        });
    } catch (error) {
        console.error('Error en crearAdminParqueo:', error);
        res.status(500).json({ 
            mensaje: 'Error al crear el administrador de parqueo',
            error: error.message 
        });
    }
};

// HU-16: Editar Información del Parqueo (NUEVO ENDPOINT)
export const editarParqueo = async (req, res) => {
    const { parqueoId } = req.params;
    const { nombre, direccion, tarifa_por_hora, usuario_id, client_updated_at } = req.body;

    try {
        // 1. Validar propiedad
        const esDueno = await verificarPropiedadParqueo(usuario_id, parqueoId);
        const [adminCheck] = await pool.query('SELECT rol FROM usuarios WHERE id = ?', [usuario_id]);
        const esSuperAdmin = adminCheck.length > 0 && adminCheck[0].rol === 'admin';

        if (!esDueno && !esSuperAdmin) {
            return res.status(403).json({ mensaje: 'No tienes permisos para editar este parqueo.' });
        }

        // 2. Control de concurrencia
        const [currentParqueo] = await pool.query('SELECT updated_at, nombre, direccion, tarifa_por_hora FROM parqueos WHERE id = ?', [parqueoId]);
        const dbUpdatedAt = new Date(currentParqueo[0].updated_at).getTime();
        const clientUpdatedAt = client_updated_at ? new Date(client_updated_at).getTime() : 0;

        if (clientUpdatedAt > 0 && dbUpdatedAt > clientUpdatedAt) {
            return res.status(409).json({ 
                mensaje: 'CONFLICTO: Los datos del parqueo cambiaron recientemente. Recarga el formulario.',
                codigo: 'CONCURRENCY_CONFLICT'
            });
        }

        const valorAnterior = { 
            nombre: currentParqueo[0].nombre, 
            direccion: currentParqueo[0].direccion, 
            tarifa: currentParqueo[0].tarifa_por_hora 
        };
        const valorNuevo = { nombre, direccion, tarifa: tarifa_por_hora };

        // 3. Actualizar
        await pool.query(
            'UPDATE parqueos SET nombre = ?, direccion = ?, tarifa_por_hora = ? WHERE id = ?',
            [nombre, direccion, tarifa_por_hora, parqueoId]
        );

        // 4. Bitácora (HU-16)
        await registrarEnBitacora(usuario_id, 'EDITAR_INFO', 'parqueos', parqueoId, valorAnterior, valorNuevo);

        res.json({ mensaje: 'Información del parqueo actualizada correctamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: 'Error al editar el parqueo' });
    }
};