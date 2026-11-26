import pool from '../config/db.js';
import { registrarEnBitacora, verificarPropiedadParqueo } from '../utils/auditoria.js';
import { aNumero, normalizar, horaLaPaz, TIPOS_PARQUEO } from '../utils/validaciones.js';

const ZONAS_LA_PAZ = [
    'Centro', 'Sopocachi', 'Miraflores', 'San Miguel', 'Calacoto', 'San Pedro', 'Obrajes',
    'Cota Cota', 'Irpavi', 'Achumani', 'Villa Fátima', 'Pampahasi', 'Munaypata', 'Gran Poder'
];

const COLUMNAS = `
    p.id, p.nombre, p.direccion, p.latitud, p.longitud,
    p.tarifa_por_hora, p.tarifa_por_dia, p.horario_apertura, p.horario_cierre,
    p.tipo_vehiculo, p.tipo, p.servicios, p.descripcion, p.imagen_url, p.activo, p.capacidad_total,
    d.cupos_libres, d.cupos_ocupados, d.updated_at AS ultima_actualizacion,
    u.telefono AS telefono_contacto`;

const FROM = `
    FROM parqueos p
    LEFT JOIN disponibilidad d ON p.id = d.parqueo_id
    LEFT JOIN usuarios u ON p.id = u.parqueo_id AND u.rol = 'admin_parqueo'`;

// HU-10: distancia en metros con la fórmula de Haversine (parámetros: lat, lng, lat)
const DISTANCIA_SQL = `(6371000 * ACOS(LEAST(1,
    COS(RADIANS(?)) * COS(RADIANS(CAST(p.latitud AS DECIMAL(10,8)))) *
    COS(RADIANS(CAST(p.longitud AS DECIMAL(11,8))) - RADIANS(?)) +
    SIN(RADIANS(?)) * SIN(RADIANS(CAST(p.latitud AS DECIMAL(10,8)))))))`;

/**
 * Construye la consulta con búsqueda (HU-06) y filtros combinados con AND (HU-07):
 * query, tarifa_max, tipo, radio_km (requiere lat/lng), abierto=true. Con lat/lng calcula distancia_m (HU-10).
 */
const construirConsulta = (q, limite = 200) => {
    const selArgs = [], whereArgs = [], havArgs = [];
    const where = ['p.activo = TRUE'];
    let select = COLUMNAS, having = '', order = 'p.nombre ASC';

    const lat = aNumero(q.lat), lng = aNumero(q.lng);
    const conUbicacion = lat !== null && lng !== null;
    if (conUbicacion) {
        select += `, ${DISTANCIA_SQL} AS distancia_m`;
        selArgs.push(lat, lng, lat);
        order = 'distancia_m ASC, p.nombre ASC';
    }

    if (q.id !== undefined) { where.push('p.id = ?'); whereArgs.push(Number(q.id)); }

    const texto = (q.query || '').trim();
    if (texto.length >= 2) {
        const norm = normalizar(texto);
        where.push('(p.nombre_normalizado LIKE ? OR LOWER(p.direccion) LIKE ? OR LOWER(p.nombre) LIKE ?)');
        whereArgs.push(`%${norm}%`, `%${norm}%`, `%${texto.toLowerCase()}%`);
    }

    const tarifaMax = aNumero(q.tarifa_max);
    if (tarifaMax !== null) { where.push('p.tarifa_por_hora <= ?'); whereArgs.push(tarifaMax); }

    if (q.tipo && TIPOS_PARQUEO.includes(q.tipo)) { where.push('p.tipo = ?'); whereArgs.push(q.tipo); }

    if (q.abierto === 'true') {
        const ahora = horaLaPaz();
        // Soporta horarios que cruzan la medianoche (cierre < apertura)
        where.push(`((p.horario_apertura <= p.horario_cierre AND ? BETWEEN p.horario_apertura AND p.horario_cierre)
                  OR (p.horario_apertura > p.horario_cierre AND (? >= p.horario_apertura OR ? <= p.horario_cierre)))`);
        whereArgs.push(ahora, ahora, ahora);
    }

    const radioKm = aNumero(q.radio_km);
    if (radioKm !== null && radioKm > 0 && conUbicacion) {
        having = 'HAVING distancia_m <= ?';
        havArgs.push(radioKm * 1000);
    }

    const sql = `SELECT ${select} ${FROM} WHERE ${where.join(' AND ')} ${having} ORDER BY ${order} LIMIT ${Number(limite)}`;
    return { sql, args: [...selArgs, ...whereArgs, ...havArgs] };
};

const hayFiltros = (q) =>
    (q.query || '').trim().length >= 2 || aNumero(q.tarifa_max) !== null || !!q.tipo ||
    q.abierto === 'true' || (aNumero(q.radio_km) !== null && aNumero(q.radio_km) > 0);

// HU-05 / HU-08: LISTA DE PARQUEOS CON DISPONIBILIDAD (acepta los mismos filtros)
export const getParqueos = async (req, res) => {
    try {
        const { sql, args } = construirConsulta(req.query);
        const [rows] = await pool.query(sql, args);
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: 'Error al obtener parqueos' });
    }
};

// HU-09: DETALLE DE UN PARQUEO
export const getParqueoDetalle = async (req, res) => {
    try {
        const { sql, args } = construirConsulta({ lat: req.query.lat, lng: req.query.lng, id: req.params.id }, 1);
        const [rows] = await pool.query(sql, args);
        const p = rows[0];
        if (!p) return res.status(404).json({ mensaje: 'Parqueo no encontrado' });
        res.json(p);
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: 'Error al obtener el parqueo' });
    }
};

// HU-06 / HU-07: BÚSQUEDA CON FILTROS
export const buscarParqueos = async (req, res) => {
    const q = req.query;
    try {
        if (!hayFiltros(q)) {
            return res.json({
                resultados: [], sugerencias: ZONAS_LA_PAZ.slice(0, 5), total: 0,
                mensaje: 'Escribe al menos 2 caracteres para buscar'
            });
        }
        const { sql, args } = construirConsulta(q, 50);
        const [resultados] = await pool.query(sql, args);

        if (resultados.length > 0) {
            return res.json({ resultados, sugerencias: [], total: resultados.length });
        }

        const norm = normalizar(q.query || '');
        let sugerencias = norm
            ? ZONAS_LA_PAZ.filter(z => normalizar(z).includes(norm) || norm.includes(normalizar(z).substring(0, 3)))
            : [];
        if (sugerencias.length === 0) sugerencias = ZONAS_LA_PAZ.slice(0, 5);

        res.json({
            resultados: [], sugerencias, total: 0,
            mensaje: q.query
                ? `No se encontraron parqueos para "${q.query}". Prueba buscar por zona.`
                : 'No se encontraron parqueos con esos filtros.'
        });
    } catch (error) {
        console.error('Error en buscarParqueos:', error);
        res.status(500).json({ mensaje: 'Error al buscar parqueos' });
    }
};

// ---------------- FAVORITOS (HU-12) ----------------
export const getFavoritos = async (req, res) => {
    if (String(req.params.usuarioId) !== String(req.user.id)) {
        return res.status(403).json({ mensaje: 'No puedes ver los favoritos de otro usuario' });
    }
    try {
        const [rows] = await pool.query('SELECT parqueo_id FROM favoritos WHERE usuario_id = ?', [req.user.id]);
        res.json(rows.map(r => r.parqueo_id));
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: 'Error al obtener favoritos' });
    }
};

export const getFavoritosDetalle = async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT ${COLUMNAS}, f.notificar, f.id AS favorito_id ${FROM}
             JOIN favoritos f ON f.parqueo_id = p.id
             WHERE f.usuario_id = ? AND p.activo = TRUE ORDER BY f.id DESC`, [req.user.id]);
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: 'Error al obtener favoritos' });
    }
};

export const toggleFavorito = async (req, res) => {
    const parqueo_id = aNumero(req.body.parqueo_id);
    if (parqueo_id === null) return res.status(400).json({ mensaje: 'parqueo_id es requerido' });
    try {
        const [existing] = await pool.query(
            'SELECT id FROM favoritos WHERE usuario_id = ? AND parqueo_id = ?', [req.user.id, parqueo_id]);
        if (existing.length > 0) {
            await pool.query('DELETE FROM favoritos WHERE id = ?', [existing[0].id]);
            return res.json({ mensaje: 'Favorito eliminado', estado: 'eliminado' });
        }
        await pool.query('INSERT INTO favoritos (usuario_id, parqueo_id) VALUES (?, ?)', [req.user.id, parqueo_id]);
        res.json({ mensaje: 'Favorito agregado', estado: 'agregado' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: 'Error al actualizar favoritos' });
    }
};

// HU-17: activar/desactivar avisos de un favorito concreto
export const setNotificarFavorito = async (req, res) => {
    try {
        const activo = req.body.activo === true || req.body.activo === 1 ? 1 : 0;
        const [r] = await pool.query(
            'UPDATE favoritos SET notificar = ? WHERE usuario_id = ? AND parqueo_id = ?',
            [activo, req.user.id, req.params.parqueoId]);
        if (r.affectedRows === 0) return res.status(404).json({ mensaje: 'El parqueo no está en tus favoritos' });
        res.json({ mensaje: activo ? 'Notificaciones activadas' : 'Notificaciones desactivadas', notificar: activo });
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: 'Error al actualizar notificaciones' });
    }
};

// ---------------- HISTORIAL (HU-13) ----------------
export const registrarVisita = async (req, res) => {
    const parqueo_id = aNumero(req.body.parqueo_id);
    if (parqueo_id === null) return res.status(400).json({ mensaje: 'parqueo_id es requerido' });
    try {
        await pool.query('DELETE FROM historial_visitas WHERE usuario_id = ? AND parqueo_id = ?', [req.user.id, parqueo_id]);
        await pool.query('INSERT INTO historial_visitas (usuario_id, parqueo_id) VALUES (?, ?)', [req.user.id, parqueo_id]);
        // Conservar solo las 10 visitas más recientes
        await pool.query(
            `DELETE FROM historial_visitas WHERE usuario_id = ? AND id NOT IN (
                SELECT id FROM (SELECT id FROM historial_visitas WHERE usuario_id = ? ORDER BY visitado_en DESC, id DESC LIMIT 10) t)`,
            [req.user.id, req.user.id]);
        res.status(201).json({ mensaje: 'Visita registrada' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: 'Error al registrar la visita' });
    }
};

export const getHistorial = async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT ${COLUMNAS}, h.id AS historial_id, h.visitado_en ${FROM}
             JOIN historial_visitas h ON h.parqueo_id = p.id
             WHERE h.usuario_id = ? ORDER BY h.visitado_en DESC, h.id DESC LIMIT 10`, [req.user.id]);
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: 'Error al obtener el historial' });
    }
};

export const eliminarDelHistorial = async (req, res) => {
    try {
        const [r] = await pool.query('DELETE FROM historial_visitas WHERE id = ? AND usuario_id = ?', [req.params.id, req.user.id]);
        if (r.affectedRows === 0) return res.status(404).json({ mensaje: 'Entrada no encontrada' });
        res.json({ mensaje: 'Entrada eliminada del historial' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: 'Error al eliminar del historial' });
    }
};

// ---------------- DISPONIBILIDAD (HU-14) ----------------
export const updateDisponibilidad = async (req, res) => {
    const parqueoId = Number(req.params.parqueoId);
    const usuario_id = req.user.id; // viene del JWT, no del body
    const cuposLibres = aNumero(req.body.cupos_libres);
    const capacidadNueva = aNumero(req.body.capacidad_total);
    const clientUpdatedAt = req.body.client_updated_at ? new Date(req.body.client_updated_at).getTime() : 0;

    if (!Number.isInteger(cuposLibres) || cuposLibres < 0) {
        return res.status(400).json({ mensaje: 'Los cupos libres deben ser un número entero mayor o igual a 0' });
    }
    if (capacidadNueva !== null && (!Number.isInteger(capacidadNueva) || capacidadNueva <= 0)) {
        return res.status(400).json({ mensaje: 'La capacidad total debe ser un entero mayor a 0' });
    }

    const conn = await pool.getConnection();
    try {
        const esDueno = await verificarPropiedadParqueo(usuario_id, parqueoId);
        if (!esDueno && req.user.rol !== 'admin') {
            return res.status(403).json({ mensaje: 'No tienes permisos para modificar este parqueo.' });
        }

        await conn.beginTransaction();
        const [rows] = await conn.query(
            `SELECT p.capacidad_total, d.cupos_libres, d.updated_at
             FROM parqueos p JOIN disponibilidad d ON d.parqueo_id = p.id WHERE p.id = ? FOR UPDATE`, [parqueoId]);
        if (rows.length === 0) { await conn.rollback(); return res.status(404).json({ mensaje: 'Disponibilidad no encontrada' }); }
        const actual = rows[0];

        // Control de concurrencia optimista
        if (clientUpdatedAt > 0 && new Date(actual.updated_at).getTime() > clientUpdatedAt) {
            await conn.rollback();
            return res.status(409).json({
                mensaje: 'CONFLICTO: Otro administrador modificó este registro mientras editabas. Recarga los datos.',
                codigo: 'CONCURRENCY_CONFLICT'
            });
        }

        const capacidad = capacidadNueva ?? actual.capacidad_total;
        if (cuposLibres > capacidad) {
            await conn.rollback();
            return res.status(400).json({ mensaje: 'Los cupos libres no pueden exceder la capacidad total' });
        }
        const cuposOcupados = capacidad - cuposLibres; // siempre consistente

        if (capacidad !== actual.capacidad_total) {
            await conn.query('UPDATE parqueos SET capacidad_total = ?, updated_at = NOW() WHERE id = ?', [capacidad, parqueoId]);
        }
        await conn.query(
            'UPDATE disponibilidad SET cupos_libres = ?, cupos_ocupados = ?, updated_at = NOW() WHERE parqueo_id = ?',
            [cuposLibres, cuposOcupados, parqueoId]);

        // HU-17: si pasó de LLENO a con cupo, generar avisos para quienes lo tienen en favoritos
        if (actual.cupos_libres === 0 && cuposLibres > 0) {
            await conn.query(
                `INSERT INTO notificaciones (usuario_id, parqueo_id, mensaje)
                 SELECT f.usuario_id, p.id, CONCAT('¡Hay ', ?, ' espacio(s) libre(s) en ', p.nombre, '!')
                 FROM favoritos f JOIN parqueos p ON p.id = f.parqueo_id
                 WHERE f.parqueo_id = ? AND f.notificar = 1`, [cuposLibres, parqueoId]);
        }
        await conn.commit();

        await registrarEnBitacora(usuario_id, 'ACTUALIZAR_DISP', 'disponibilidad', parqueoId,
            { cupos_libres: actual.cupos_libres, capacidad_total: actual.capacidad_total },
            { cupos_libres: cuposLibres, cupos_ocupados: cuposOcupados, capacidad_total: capacidad });

        res.json({ mensaje: 'Disponibilidad actualizada y registrada en bitácora' });
    } catch (error) {
        try { await conn.rollback(); } catch { /* ya cerrada */ }
        console.error(error);
        res.status(500).json({ mensaje: 'Error al actualizar la disponibilidad' });
    } finally {
        conn.release();
    }
};

export const getMiParqueo = async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT ${COLUMNAS} ${FROM.replace('LEFT JOIN usuarios u ON p.id = u.parqueo_id AND u.rol = \'admin_parqueo\'', 'JOIN usuarios u ON p.id = u.parqueo_id')}
             WHERE u.id = ? AND u.rol = 'admin_parqueo'`, [req.user.id]);
        if (rows.length === 0) return res.status(404).json({ mensaje: 'No tienes un parqueo asignado' });
        res.json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: 'Error al obtener tu parqueo' });
    }
};

export const getParqueoCompleto = async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT p.updated_at, d.updated_at AS disponibilidad_updated_at,
                   p.id AS parqueo_id, p.nombre AS parqueo_nombre, p.direccion, p.latitud, p.longitud,
                   p.capacidad_total, p.tarifa_por_hora, p.tarifa_por_dia, p.horario_apertura, p.horario_cierre,
                   p.tipo_vehiculo, p.tipo, p.servicios, p.descripcion, p.imagen_url, p.activo,
                   u.id AS admin_id, u.nombre AS admin_nombre, u.email AS admin_email,
                   u.telefono AS admin_telefono, u.rol, d.cupos_libres, d.cupos_ocupados
            FROM parqueos p
            JOIN usuarios u ON p.id = u.parqueo_id
            LEFT JOIN disponibilidad d ON p.id = d.parqueo_id
            WHERE u.id = ? AND u.rol = 'admin_parqueo'`, [req.user.id]);
        if (rows.length === 0) return res.status(404).json({ mensaje: 'No tienes un parqueo asignado' });
        res.json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: 'Error al obtener información del parqueo' });
    }
};

// ---------------- NOTIFICACIONES (HU-17) ----------------
export const getNotificaciones = async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT id, parqueo_id, mensaje, creada_en FROM notificaciones
             WHERE usuario_id = ? AND leida = 0 ORDER BY id DESC LIMIT 20`, [req.user.id]);
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: 'Error al obtener notificaciones' });
    }
};

export const marcarNotificacionesLeidas = async (req, res) => {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : [];
    if (ids.length === 0) return res.json({ mensaje: 'Nada que marcar' });
    try {
        await pool.query('UPDATE notificaciones SET leida = 1 WHERE usuario_id = ? AND id IN (?)', [req.user.id, ids]);
        res.json({ mensaje: 'Notificaciones marcadas como leídas' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: 'Error al actualizar notificaciones' });
    }
};

// ---------------- RUTA (HU-11) ----------------
// Proxy de Google Directions: la clave de servidor queda en el backend (GOOGLE_MAPS_SERVER_KEY)
export const obtenerRuta = async (req, res) => {
    const olat = aNumero(req.query.olat), olng = aNumero(req.query.olng);
    const dlat = aNumero(req.query.dlat), dlng = aNumero(req.query.dlng);
    const modo = req.query.modo === 'walking' ? 'walking' : 'driving';
    if ([olat, olng, dlat, dlng].some(v => v === null)) {
        return res.status(400).json({ mensaje: 'Faltan coordenadas de origen o destino' });
    }
    const key = process.env.GOOGLE_MAPS_SERVER_KEY;
    if (!key) return res.status(503).json({ mensaje: 'Servicio de rutas no configurado en el servidor' });

    try {
        const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${olat},${olng}` +
            `&destination=${dlat},${dlng}&mode=${modo}&language=es&key=${key}`;
        const r = await fetch(url);
        const data = await r.json();
        if (data.status !== 'OK' || !data.routes?.length) {
            return res.status(502).json({ mensaje: 'No se pudo calcular la ruta', estado: data.status });
        }
        const ruta = data.routes[0];
        const leg = ruta.legs[0];
        res.json({
            distancia_m: leg.distance.value, distancia_texto: leg.distance.text,
            duracion_s: leg.duration.value, duracion_texto: leg.duration.text,
            polyline: ruta.overview_polyline.points,
            pasos: leg.steps.map(s => ({
                instruccion: s.html_instructions.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
                distancia: s.distance.text
            }))
        });
    } catch (error) {
        console.error('Error en obtenerRuta:', error);
        res.status(500).json({ mensaje: 'Error al calcular la ruta' });
    }
};
