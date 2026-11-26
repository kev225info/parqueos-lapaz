import pool from '../config/db.js';
import bcrypt from 'bcryptjs';
import { registrarEnBitacora, verificarPropiedadParqueo } from '../utils/auditoria.js';
import { esEmail, aNumero, esHora, completarHora, normalizar, TIPOS_PARQUEO } from '../utils/validaciones.js';

const validarDatosParqueo = (b) => {
    const tarifa = aNumero(b.tarifa_por_hora);
    if (tarifa === null || tarifa < 0) return 'La tarifa por hora debe ser un número mayor o igual a 0';
    const dia = aNumero(b.tarifa_por_dia);
    if (b.tarifa_por_dia !== undefined && b.tarifa_por_dia !== null && b.tarifa_por_dia !== '' && (dia === null || dia < 0))
        return 'La tarifa por día no es válida';
    if (b.horario_apertura && !esHora(b.horario_apertura)) return 'Horario de apertura inválido (HH:MM)';
    if (b.horario_cierre && !esHora(b.horario_cierre)) return 'Horario de cierre inválido (HH:MM)';
    if (b.tipo && !TIPOS_PARQUEO.includes(b.tipo)) return 'El tipo debe ser publico o privado';
    return null;
};

// HU-15: Registrar parqueo + su administrador (solo super admin)
export const crearAdminParqueo = async (req, res) => {
    const b = req.body;
    const email = (b.admin_email || '').trim().toLowerCase();
    const lat = aNumero(b.parqueo_lat), lng = aNumero(b.parqueo_lng);
    const capacidad = aNumero(b.parqueo_capacidad);

    if (!b.admin_nombre || !email || !b.admin_celular || !b.admin_password || !b.parqueo_nombre || !b.parqueo_direccion)
        return res.status(400).json({ mensaje: 'Completa todos los campos obligatorios' });
    if (!esEmail(email)) return res.status(400).json({ mensaje: 'Correo inválido' });
    if (String(b.admin_password).length < 8) return res.status(400).json({ mensaje: 'La contraseña debe tener mínimo 8 caracteres' });
    if (lat === null || lng === null) return res.status(400).json({ mensaje: 'Selecciona la ubicación en el mapa' });
    if (!Number.isInteger(capacidad) || capacidad <= 0) return res.status(400).json({ mensaje: 'La capacidad debe ser un entero mayor a 0' });
    const err = validarDatosParqueo({ ...b, tarifa_por_hora: b.parqueo_tarifa, tarifa_por_dia: b.parqueo_tarifa_dia,
        horario_apertura: b.parqueo_apertura, horario_cierre: b.parqueo_cierre, tipo: b.parqueo_tipo });
    if (err) return res.status(400).json({ mensaje: err });

    const conn = await pool.getConnection();
    try {
        const [dup] = await conn.query('SELECT id FROM usuarios WHERE email = ?', [email]);
        if (dup.length > 0) return res.status(409).json({ mensaje: 'El correo ya está registrado' });

        await conn.beginTransaction();
        const [pr] = await conn.query(
            `INSERT INTO parqueos (nombre, nombre_normalizado, direccion, latitud, longitud, capacidad_total,
                tarifa_por_hora, tarifa_por_dia, horario_apertura, horario_cierre, tipo_vehiculo, tipo, servicios,
                descripcion, imagen_url, activo)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'auto', ?, ?, ?, ?, TRUE)`,
            [b.parqueo_nombre.trim(), normalizar(b.parqueo_nombre), b.parqueo_direccion.trim(), lat, lng, capacidad,
             aNumero(b.parqueo_tarifa), aNumero(b.parqueo_tarifa_dia),
             completarHora(b.parqueo_apertura || '08:00'), completarHora(b.parqueo_cierre || '20:00'),
             b.parqueo_tipo || 'privado', b.parqueo_servicios || null, b.parqueo_descripcion || null, b.parqueo_imagen_url || null]);
        const parqueoId = pr.insertId;

        await conn.query('INSERT INTO disponibilidad (parqueo_id, cupos_libres, cupos_ocupados) VALUES (?, ?, 0)', [parqueoId, capacidad]);
        const hash = await bcrypt.hash(b.admin_password, 10);
        await conn.query(
            `INSERT INTO usuarios (nombre, email, telefono, password, rol, parqueo_id) VALUES (?, ?, ?, ?, 'admin_parqueo', ?)`,
            [b.admin_nombre.trim(), email, b.admin_celular.trim(), hash, parqueoId]);
        await conn.commit();

        await registrarEnBitacora(req.user.id, 'CREAR_PARQUEO', 'parqueos', parqueoId, null,
            { nombre: b.parqueo_nombre, capacidad, tarifa: b.parqueo_tarifa });
        res.status(201).json({ mensaje: 'Administrador de parqueo y parqueo creados exitosamente', parqueo_id: parqueoId });
    } catch (error) {
        try { await conn.rollback(); } catch { /* sin transacción */ }
        console.error('Error en crearAdminParqueo:', error);
        res.status(500).json({ mensaje: 'Error al crear el administrador de parqueo' });
    } finally {
        conn.release();
    }
};

const CAMPOS_EDITABLES = ['nombre', 'direccion', 'tarifa_por_hora', 'tarifa_por_dia', 'horario_apertura', 'horario_cierre',
    'tipo', 'servicios', 'descripcion', 'imagen_url', 'latitud', 'longitud'];

// HU-16: Editar información del parqueo (dueño o super admin)
export const editarParqueo = async (req, res) => {
    const { parqueoId } = req.params;
    const b = req.body;
    try {
        const esDueno = await verificarPropiedadParqueo(req.user.id, parqueoId);
        if (!esDueno && req.user.rol !== 'admin')
            return res.status(403).json({ mensaje: 'No tienes permisos para editar este parqueo.' });

        const err = validarDatosParqueo({ ...b, tarifa_por_hora: b.tarifa_por_hora ?? 0 });
        if (err) return res.status(400).json({ mensaje: err });
        if (b.nombre !== undefined && !String(b.nombre).trim()) return res.status(400).json({ mensaje: 'El nombre no puede estar vacío' });
        if ((b.latitud !== undefined && aNumero(b.latitud) === null) || (b.longitud !== undefined && aNumero(b.longitud) === null))
            return res.status(400).json({ mensaje: 'Coordenadas inválidas' });

        const [cur] = await pool.query('SELECT * FROM parqueos WHERE id = ?', [parqueoId]);
        if (cur.length === 0) return res.status(404).json({ mensaje: 'Parqueo no encontrado' });

        const clientUpdatedAt = b.client_updated_at ? new Date(b.client_updated_at).getTime() : 0;
        if (clientUpdatedAt > 0 && new Date(cur[0].updated_at).getTime() > clientUpdatedAt) {
            return res.status(409).json({ mensaje: 'CONFLICTO: Los datos del parqueo cambiaron recientemente. Recarga el formulario.', codigo: 'CONCURRENCY_CONFLICT' });
        }

        const sets = [], args = [], anterior = {}, nuevo = {};
        for (const campo of CAMPOS_EDITABLES) {
            if (b[campo] === undefined) continue;
            let v = b[campo];
            if (campo === 'horario_apertura' || campo === 'horario_cierre') v = completarHora(v);
            if (['tarifa_por_hora', 'tarifa_por_dia', 'latitud', 'longitud'].includes(campo)) v = aNumero(v);
            sets.push(`${campo} = ?`); args.push(v);
            anterior[campo] = cur[0][campo]; nuevo[campo] = v;
            if (campo === 'nombre') { sets.push('nombre_normalizado = ?'); args.push(normalizar(v)); }
        }
        if (sets.length === 0) return res.status(400).json({ mensaje: 'No hay cambios para guardar' });

        await pool.query(`UPDATE parqueos SET ${sets.join(', ')}, updated_at = NOW() WHERE id = ?`, [...args, parqueoId]);
        await registrarEnBitacora(req.user.id, 'EDITAR_INFO', 'parqueos', parqueoId, anterior, nuevo);
        res.json({ mensaje: 'Información del parqueo actualizada correctamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: 'Error al editar el parqueo' });
    }
};

// HU-14 (criterio 4): historial de cambios del parqueo
export const getBitacoraParqueo = async (req, res) => {
    const { parqueoId } = req.params;
    try {
        const esDueno = await verificarPropiedadParqueo(req.user.id, parqueoId);
        if (!esDueno && req.user.rol !== 'admin') return res.status(403).json({ mensaje: 'Sin permisos' });
        const [rows] = await pool.query(
            `SELECT * FROM bitacora_cambios WHERE registro_id = ? AND tabla_afectada IN ('disponibilidad','parqueos')
             ORDER BY id DESC LIMIT 20`, [parqueoId]);
        res.json(rows.map(r => ({
            accion: r.accion,
            valor_anterior: r.valor_anterior, valor_nuevo: r.valor_nuevo,
            fecha: r.fecha ?? r.created_at ?? r.fecha_cambio ?? r.timestamp ?? null
        })));
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: 'Error al obtener el historial de cambios' });
    }
};
