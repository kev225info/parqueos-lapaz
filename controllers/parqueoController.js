import pool from '../config/db.js';
// OBTENER FAVORITOS DE UN USUARIO
export const getFavoritos = async (req, res) => {
    const { usuarioId } = req.params;
    try {
        const [rows] = await pool.query(
            'SELECT parqueo_id FROM favoritos WHERE usuario_id = ?', 
            [usuarioId]
        );
        // Retornamos un array simple con los IDs de los parqueos favoritos
        const favoritos = rows.map(row => row.parqueo_id);
        res.json(favoritos);
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: 'Error al obtener favoritos' });
    }
};

// AGREGAR O ELIMINAR FAVORITO (TOGGLE)
export const toggleFavorito = async (req, res) => {
    const { usuario_id, parqueo_id } = req.body;
    try {
        // Verificar si ya es favorito
        const [existing] = await pool.query(
            'SELECT id FROM favoritos WHERE usuario_id = ? AND parqueo_id = ?', 
            [usuario_id, parqueo_id]
        );

        if (existing.length > 0) {
            // Si existe, lo eliminamos
            await pool.query('DELETE FROM favoritos WHERE id = ?', [existing[0].id]);
            return res.json({ mensaje: 'Favorito eliminado', estado: 'eliminado' });
        } else {
            // Si no existe, lo insertamos
            await pool.query(
                'INSERT INTO favoritos (usuario_id, parqueo_id) VALUES (?, ?)', 
                [usuario_id, parqueo_id]
            );
            return res.json({ mensaje: 'Favorito agregado', estado: 'agregado' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: 'Error al actualizar favoritos' });
    }
};

// OBTENER TODOS LOS PARQUEOS CON DISPONIBILIDAD
export const getParqueos = async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT 
                p.id, p.nombre, p.direccion, p.latitud, p.longitud, 
                p.tarifa_por_hora, p.horario_apertura, p.horario_cierre, 
                p.tipo_vehiculo, p.imagen_url, p.activo,
                d.cupos_libres, d.cupos_ocupados, p.capacidad_total
            FROM parqueos p
            LEFT JOIN disponibilidad d ON p.id = d.parqueo_id
            WHERE p.activo = TRUE
        `);
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: 'Error al obtener parqueos' });
    }
};

// ACTUALIZAR DISPONIBILIDAD Y REGISTRAR HISTORIAL
export const updateDisponibilidad = async (req, res) => {
    const { parqueoId } = req.params;
    const { cupos_libres, cupos_ocupados, usuario_id } = req.body;

    try {
        // 1. Verificar permisos del usuario
        const [user] = await pool.query('SELECT rol, parqueo_id FROM usuarios WHERE id = ?', [usuario_id]);
        if (user.length === 0) return res.status(401).json({ mensaje: 'Usuario no encontrado' });

        const esSuperAdmin = user[0].rol === 'admin';
        const esDueno = user[0].rol === 'admin_parqueo' && user[0].parqueo_id == parqueoId;

        if (!esSuperAdmin && !esDueno) {
            return res.status(403).json({ mensaje: 'No tienes permisos para modificar este parqueo' });
        }

        // 2. Obtener cupos anteriores para el historial
        const [current] = await pool.query('SELECT cupos_libres FROM disponibilidad WHERE parqueo_id = ?', [parqueoId]);
        const cupos_anteriores = current.length > 0 ? current[0].cupos_libres : 0;

        // 3. Actualizar disponibilidad
        await pool.query(
            'UPDATE disponibilidad SET cupos_libres = ?, cupos_ocupados = ? WHERE parqueo_id = ?',
            [cupos_libres, cupos_ocupados, parqueoId]
        );

        // 4. Registrar en historial
        await pool.query(
            'INSERT INTO historial_disponibilidad (parqueo_id, cupos_libres_anterior, cupos_libres_nuevo, usuario_id) VALUES (?, ?, ?, ?)',
            [parqueoId, cupos_anteriores, cupos_libres, usuario_id]
        );

        res.json({ mensaje: 'Disponibilidad actualizada correctamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: 'Error al actualizar la disponibilidad' });
    }
};

export const getMiParqueo = async (req, res) => {
    const { usuario_id } = req.query;
    try {
        const [rows] = await pool.query(`
            SELECT p.id, p.nombre, p.direccion, p.latitud, p.longitud, p.tarifa_por_hora, 
                   p.horario_apertura, p.horario_cierre, p.tipo_vehiculo, p.imagen_url, p.activo, p.capacidad_total,
                   d.cupos_libres, d.cupos_ocupados
            FROM parqueos p
            JOIN usuarios u ON p.id = u.parqueo_id
            LEFT JOIN disponibilidad d ON p.id = d.parqueo_id
            WHERE u.id = ? AND u.rol = 'admin_parqueo'
        `, [usuario_id]);
        
        if (rows.length === 0) return res.status(404).json({ mensaje: 'No tienes un parqueo asignado' });
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener tu parqueo' });
    }
};

// OBTENER INFORMACIÓN COMPLETA DEL PARQUEO Y SU ADMINISTRADOR
export const getParqueoCompleto = async (req, res) => {
    const { usuario_id } = req.query;
    try {
        const [rows] = await pool.query(`
            SELECT 
                p.id AS parqueo_id,
                p.nombre AS parqueo_nombre,
                p.direccion,
                p.latitud,
                p.longitud,
                p.capacidad_total,
                p.tarifa_por_hora,
                p.horario_apertura,
                p.horario_cierre,
                p.tipo_vehiculo,
                p.descripcion,
                p.imagen_url,
                p.activo,
                u.id AS admin_id,
                u.nombre AS admin_nombre,
                u.email AS admin_email,
                u.telefono AS admin_telefono,
                u.rol,
                d.cupos_libres,
                d.cupos_ocupados
            FROM parqueos p
            JOIN usuarios u ON p.id = u.parqueo_id
            LEFT JOIN disponibilidad d ON p.id = d.parqueo_id
            WHERE u.id = ? AND u.rol = 'admin_parqueo'
        `, [usuario_id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ mensaje: 'No tienes un parqueo asignado' });
        }
        
        res.json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: 'Error al obtener información del parqueo' });
    }
};