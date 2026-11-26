import pool from '../config/db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { esEmail } from '../utils/validaciones.js';

// HU-01: REGISTRAR CONDUCTOR
export const register = async (req, res) => {
    const nombre = (req.body.nombre || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    const telefono = (req.body.telefono || '').trim();
    const { password } = req.body;

    // Validaciones (criterios de aceptación HU-01)
    if (!nombre || !email || !telefono || !password) {
        return res.status(400).json({ mensaje: 'Completa nombre, correo, teléfono y contraseña' });
    }
    if (!esEmail(email)) return res.status(400).json({ mensaje: 'El correo no tiene un formato válido' });
    if (String(password).length < 8) {
        return res.status(400).json({ mensaje: 'La contraseña debe tener mínimo 8 caracteres' });
    }

    try {
        const [existing] = await pool.query('SELECT id FROM usuarios WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(409).json({ mensaje: 'El correo ya está registrado' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);

        // SEGURIDAD: el rol NUNCA viene del cliente. Los registros públicos son siempre conductores.
        const [result] = await pool.query(
            'INSERT INTO usuarios (nombre, email, telefono, password, rol) VALUES (?, ?, ?, ?, ?)',
            [nombre, email, telefono, hashedPassword, 'conductor']
        );
        res.status(201).json({ mensaje: 'Usuario registrado exitosamente', id: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: 'Error en el servidor' });
    }
};

// HU-02: INICIAR SESIÓN
export const login = async (req, res) => {
    const email = (req.body.email || '').trim().toLowerCase();
    const { password } = req.body;
    if (!email || !password) return res.status(400).json({ mensaje: 'Completa correo y contraseña' });

    try {
        const [users] = await pool.query('SELECT * FROM usuarios WHERE email = ?', [email]);
        // Mismo mensaje para correo inexistente y contraseña errónea
        if (users.length === 0) return res.status(401).json({ mensaje: 'Credenciales incorrectas' });

        const user = users[0];
        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return res.status(401).json({ mensaje: 'Credenciales incorrectas' });

        const token = jwt.sign({ id: user.id, rol: user.rol }, process.env.JWT_SECRET, { expiresIn: '24h' });

        res.json({
            mensaje: 'Login exitoso',
            token,
            usuario: { id: user.id, nombre: user.nombre, rol: user.rol, parqueo_id: user.parqueo_id ?? null }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: 'Error en el servidor' });
    }
};
