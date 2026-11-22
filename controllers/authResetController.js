import pool from '../config/db.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { enviarCorreoRestablecimiento } from '../config/email.js';

// SOLICITAR RESTABLECIMIENTO DE CONTRASEÑA
export const forgotPassword = async (req, res) => {
    const { email } = req.body;

    try {
        // 1. Buscar el usuario por email
        const [users] = await pool.query('SELECT id FROM usuarios WHERE email = ?', [email]);

        // ⚠️ SEGURIDAD: Siempre mostrar el mismo mensaje, exista o no el correo
        // Esto evita que atacantes descubran qué correos están registrados
        const mensajeExito = 'Si el correo está registrado, recibirás un enlace de restablecimiento.';

        if (users.length === 0) {
            // No hacer nada, pero retornar mensaje genérico
            return res.json({ mensaje: mensajeExito });
        }

        const usuarioId = users[0].id;

        // 2. Invalidar tokens anteriores del mismo usuario (por seguridad)
        await pool.query(
            'UPDATE password_reset_tokens SET usado = TRUE WHERE usuario_id = ? AND usado = FALSE',
            [usuarioId]
        );

        // 3. Generar token criptográficamente seguro
        const token = crypto.randomBytes(32).toString('hex');

        // 4. Calcular fecha de expiración (30 minutos desde ahora)
        const expiraEn = new Date(Date.now() + 30 * 60 * 1000);

        // 5. Guardar token en la base de datos
        await pool.query(
            'INSERT INTO password_reset_tokens (usuario_id, token, expira_en) VALUES (?, ?, ?)',
            [usuarioId, token, expiraEn]
        );

        // 6. Enviar correo (en producción) / Simular en desarrollo
        const resultado = await enviarCorreoRestablecimiento(email, token);

        // Si el envío de correo falla, loguear pero no revelar al usuario
        if (!resultado.success) {
            console.error('No se pudo enviar el correo, pero el token fue generado:', token);
        }

        // 7. Retornar mensaje genérico (siempre el mismo)
        res.json({ 
            mensaje: mensajeExito,
            // Solo en desarrollo: retornar el token para facilitar pruebas
            ...(process.env.NODE_ENV !== 'production' && { token_debug: token })
        });

    } catch (error) {
        console.error('Error en forgotPassword:', error);
        res.status(500).json({ mensaje: 'Error en el servidor' });
    }
};

// RESTABLECER CONTRASEÑA CON TOKEN
export const resetPassword = async (req, res) => {
    const { token, nueva_password } = req.body;

    try {
        // 1. Validaciones básicas
        if (!token || !nueva_password) {
            return res.status(400).json({ mensaje: 'Token y nueva contraseña son requeridos' });
        }

        if (nueva_password.length < 6) {
            return res.status(400).json({ mensaje: 'La contraseña debe tener al menos 6 caracteres' });
        }

        // 2. Buscar el token en la base de datos
        const [tokens] = await pool.query(
            'SELECT * FROM password_reset_tokens WHERE token = ? AND usado = FALSE',
            [token]
        );

        if (tokens.length === 0) {
            return res.status(400).json({ mensaje: 'Token inválido o ya utilizado' });
        }

        const tokenData = tokens[0];

        // 3. Verificar si el token expiró
        const ahora = new Date();
        const expiraEn = new Date(tokenData.expira_en);

        if (ahora > expiraEn) {
            // Marcar token como usado aunque haya expirado
            await pool.query('UPDATE password_reset_tokens SET usado = TRUE WHERE id = ?', [tokenData.id]);
            return res.status(400).json({ mensaje: 'El token ha expirado. Solicita uno nuevo.' });
        }

        // 4. Hashear la nueva contraseña con bcrypt
        const hashedPassword = await bcrypt.hash(nueva_password, 10);

        // 5. Actualizar la contraseña del usuario
        await pool.query(
            'UPDATE usuarios SET password = ? WHERE id = ?',
            [hashedPassword, tokenData.usuario_id]
        );

        // 6. Marcar el token como usado (un solo uso)
        await pool.query('UPDATE password_reset_tokens SET usado = TRUE WHERE id = ?', [tokenData.id]);

        res.json({ mensaje: 'Contraseña actualizada exitosamente. Ya puedes iniciar sesión.' });

    } catch (error) {
        console.error('Error en resetPassword:', error);
        res.status(500).json({ mensaje: 'Error en el servidor' });
    }
};