import pool from '../config/db.js';

// Función para registrar en la bitácora
export const registrarEnBitacora = async (usuario_id, accion, tabla, registro_id, valor_anterior, valor_nuevo) => {
    try {
        await pool.query(
            `INSERT INTO bitacora_cambios (usuario_id, accion, tabla_afectada, registro_id, valor_anterior, valor_nuevo) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [usuario_id, accion, tabla, registro_id, JSON.stringify(valor_anterior), JSON.stringify(valor_nuevo)]
        );
    } catch (error) {
        console.error('Error al registrar en bitácora:', error);
    }
};

// Función para verificar que el admin_parqueo es dueño del parqueo (Prevención de IDOR)
export const verificarPropiedadParqueo = async (usuario_id, parqueo_id) => {
    const [rows] = await pool.query(
        'SELECT id FROM usuarios WHERE id = ? AND rol = 'admin_parqueo' AND parqueo_id = ?',
        [usuario_id, parqueo_id]
    );
    return rows.length > 0;
};