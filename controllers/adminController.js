import pool from '../config/db.js';

export const crearAdminParqueo = async (req, res) => {
    const { 
        admin_nombre, admin_email, admin_password, 
        parqueo_nombre, parqueo_direccion, parqueo_lat, parqueo_lng, 
        parqueo_tarifa, parqueo_capacidad 
    } = req.body;

    // Verificar que quien hace la petición sea super admin (esto se valida con middleware en el futuro, por ahora confiamos en la ruta)
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
            [admin_nombre, admin_email, admin_celular, hashedPassword, nuevoParqueoId] // <-- Agregado admin_celular
        );

        res.status(201).json({ mensaje: 'Administrador de parqueo y parqueo creados exitosamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: 'Error al crear el administrador de parqueo' });
    }
};