import pool from '../config/db.js';
import { registrarEnBitacora, verificarPropiedadParqueo } from '../utils/auditoria.js';
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
                p.tipo_vehiculo, p.imagen_url, p.activo, p.capacidad_total,
                d.cupos_libres, d.cupos_ocupados,
                u.telefono AS telefono_contacto 
            FROM parqueos p
            LEFT JOIN disponibilidad d ON p.id = d.parqueo_id
            LEFT JOIN usuarios u ON p.id = u.parqueo_id AND u.rol = 'admin_parqueo'
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
    const { cupos_libres, cupos_ocupados, usuario_id, client_updated_at } = req.body;

    try {
        // 1. VALIDACIÓN DE PROPIEDAD (Restricción por propiedad)
        // No confiamos en el parqueoId del body, verificamos que el usuario sea dueño de ese parqueoId
        const esDueno = await verificarPropiedadParqueo(usuario_id, parqueoId);
        const [adminCheck] = await pool.query('SELECT rol FROM usuarios WHERE id = ?', [usuario_id]);
        const esSuperAdmin = adminCheck.length > 0 && adminCheck[0].rol === 'admin';

        if (!esDueno && !esSuperAdmin) {
            return res.status(403).json({ mensaje: 'No tienes permisos para modificar este parqueo.' });
        }

        // 2. CONTROL DE CONCURRENCIA (Optimistic Locking)
        const [currentDisp] = await pool.query('SELECT updated_at, cupos_libres FROM disponibilidad WHERE parqueo_id = ?', [parqueoId]);
        if (currentDisp.length === 0) return res.status(404).json({ mensaje: 'Disponibilidad no encontrada' });

        const dbUpdatedAt = new Date(currentDisp[0].updated_at).getTime();
        const clientUpdatedAt = client_updated_at ? new Date(client_updated_at).getTime() : 0;

        if (clientUpdatedAt > 0 && dbUpdatedAt > clientUpdatedAt) {
            return res.status(409).json({ 
                mensaje: 'CONFLICTO: Otro administrador modificó este registro mientras editabas. Por favor, recarga los datos.',
                codigo: 'CONCURRENCY_CONFLICT'
            });
        }

        const valorAnterior = { cupos_libres: currentDisp[0].cupos_libres };
        const valorNuevo = { cupos_libres, cupos_ocupados };

        // 3. Actualizar disponibilidad
        await pool.query(
            'UPDATE disponibilidad SET cupos_libres = ?, cupos_ocupados = ? WHERE parqueo_id = ?',
            [cupos_libres, cupos_ocupados, parqueoId]
        );

        // 4. Registrar en bitácora (HU-14)
        await registrarEnBitacora(usuario_id, 'ACTUALIZAR_DISP', 'disponibilidad', parqueoId, valorAnterior, valorNuevo);

        res.json({ mensaje: 'Disponibilidad actualizada y registrada en bitácora' });
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
                p.updated_at,
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

// BÚSQUEDA INTELIGENTE DE PARQUEOS
export const buscarParqueos = async (req, res) => {
    const { query, lat, lng, radio_km } = req.query;

    try {
        // Zonas conocidas de La Paz para sugerencias
        const zonasLaPaz = [
            'Centro', 'Sopocachi', 'Miraflores', 'San Miguel', 'Calacoto',
            'San Pedro', 'Obrajes', 'Cota Cota', 'Irpavi', 'Achumani',
            'Villa Fátima', 'Pampahasi', 'Munaypata', 'Gran Poder'
        ];

        if (!query || query.trim().length < 2) {
            return res.json({ 
                resultados: [], 
                sugerencias: zonasLaPaz.slice(0, 5),
                mensaje: 'Escribe al menos 2 caracteres para buscar'
            });
        }

        // Normalizar query (quitar tildes, lowercase, trim)
        const queryNormalizada = query.toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();

        // Búsqueda principal: por nombre o dirección normalizada
        const [resultados] = await pool.query(`
            SELECT 
                p.id, p.nombre, p.direccion, p.latitud, p.longitud,
                p.tarifa_por_hora, p.horario_apertura, p.horario_cierre,
                p.tipo_vehiculo, p.imagen_url, p.activo, p.capacidad_total,
                d.cupos_libres, d.cupos_ocupados,
                u.telefono AS telefono_contacto
            FROM parqueos p
            LEFT JOIN disponibilidad d ON p.id = d.parqueo_id
            LEFT JOIN usuarios u ON p.id = u.parqueo_id AND u.rol = 'admin_parqueo'
            WHERE p.activo = TRUE
            AND (
                p.nombre_normalizado LIKE ? 
                OR LOWER(p.direccion) LIKE ?
                OR LOWER(p.nombre) LIKE ?
            )
            ORDER BY p.nombre ASC
            LIMIT 20
        `, [`%${queryNormalizada}%`, `%${queryNormalizada}%`, `%${query.toLowerCase()}%`]);

        // Si hay resultados, devolverlos
        if (resultados.length > 0) {
            return res.json({
                resultados,
                sugerencias: [],
                total: resultados.length
            });
        }

        // Si no hay resultados, sugerir zonas cercanas o ampliar búsqueda
        let sugerencias = [];
        
        // Si el usuario proporcionó ubicación, sugerir zonas cercanas
        if (lat && lng && radio_km) {
            const [parqueosCercanos] = await pool.query(`
                SELECT DISTINCT 
                    SUBSTRING_INDEX(p.direccion, ',', -1) AS zona
                FROM parqueos p
                WHERE p.activo = TRUE
                AND (
                    6371 * ACOS(
                        COS(RADIANS(?)) * COS(RADIANS(CAST(p.latitud AS DECIMAL(10,8)))) *
                        COS(RADIANS(CAST(p.longitud AS DECIMAL(11,8))) - RADIANS(?)) +
                        SIN(RADIANS(?)) * SIN(RADIANS(CAST(p.latitud AS DECIMAL(10,8))))
                    )
                ) <= ?
                LIMIT 5
            `, [lat, lng, lat, radio_km * 2]); // Duplicar radio para sugerencias

            sugerencias = parqueosCercanos
                .map(p => p.zona.trim())
                .filter(zona => zona.length > 3)
                .slice(0, 5);
        }

        // Si no hay sugerencias de zonas cercanas, usar zonas populares
        if (sugerencias.length === 0) {
            sugerencias = zonasLaPaz.filter(zona => 
                zona.toLowerCase().includes(queryNormalizada) ||
                queryNormalizada.includes(zona.toLowerCase().substring(0, 3))
            );
            
            if (sugerencias.length === 0) {
                sugerencias = zonasLaPaz.slice(0, 5);
            }
        }

        res.json({
            resultados: [],
            sugerencias,
            mensaje: `No encontramos parqueos para "${query}". Prueba buscar por zona.`,
            total: 0
        });

    } catch (error) {
        console.error('Error en buscarParqueos:', error);
        res.status(500).json({ mensaje: 'Error al buscar parqueos' });
    }
};