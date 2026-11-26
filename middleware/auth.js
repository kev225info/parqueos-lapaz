import jwt from 'jsonwebtoken';

const leerToken = (req) => {
    const h = req.headers.authorization || '';
    return h.startsWith('Bearer ') ? h.slice(7) : null;
};

// Exige un JWT válido. Deja el usuario en req.user = { id, rol }
export const authRequired = (req, res, next) => {
    const token = leerToken(req);
    if (!token) return res.status(401).json({ mensaje: 'No autorizado. Inicia sesión.' });
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        req.user = { id: payload.id, rol: payload.rol };
        next();
    } catch {
        return res.status(401).json({ mensaje: 'Sesión expirada o token inválido.' });
    }
};

// Igual que authRequired pero permite continuar sin token (modo invitado)
export const authOptional = (req, _res, next) => {
    const token = leerToken(req);
    if (token) {
        try {
            const p = jwt.verify(token, process.env.JWT_SECRET);
            req.user = { id: p.id, rol: p.rol };
        } catch { /* se trata como invitado */ }
    }
    next();
};

// Autorización por rol: requireRole('admin', 'admin_parqueo')
export const requireRole = (...roles) => (req, res, next) =>
    roles.includes(req.user?.rol)
        ? next()
        : res.status(403).json({ mensaje: 'No tienes permisos para esta acción.' });
