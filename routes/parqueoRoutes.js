import { Router } from 'express';
import {
    getParqueos, getParqueoDetalle, buscarParqueos, obtenerRuta,
    getFavoritos, getFavoritosDetalle, toggleFavorito, setNotificarFavorito,
    registrarVisita, getHistorial, eliminarDelHistorial,
    updateDisponibilidad, getMiParqueo, getParqueoCompleto,
    getNotificaciones, marcarNotificacionesLeidas
} from '../controllers/parqueoController.js';
import { authRequired, requireRole } from '../middleware/auth.js';

const router = Router();

// Públicas (modo invitado)
router.get('/', getParqueos);
router.get('/buscar', buscarParqueos);
router.get('/ruta', obtenerRuta);

// Conductor autenticado (las rutas fijas van ANTES de '/:id')
router.get('/favoritos/detalle', authRequired, getFavoritosDetalle);
router.get('/favoritos/:usuarioId', authRequired, getFavoritos);
router.post('/favoritos', authRequired, toggleFavorito);
router.patch('/favoritos/:parqueoId/notificar', authRequired, setNotificarFavorito);
router.get('/historial', authRequired, getHistorial);
router.post('/historial', authRequired, registrarVisita);
router.delete('/historial/:id', authRequired, eliminarDelHistorial);
router.get('/notificaciones', authRequired, getNotificaciones);
router.post('/notificaciones/leidas', authRequired, marcarNotificacionesLeidas);

// Administradores
router.get('/mi-parqueo', authRequired, requireRole('admin_parqueo'), getMiParqueo);
router.get('/parqueo-completo', authRequired, requireRole('admin_parqueo'), getParqueoCompleto);
router.patch('/:parqueoId/disponibilidad', authRequired, requireRole('admin', 'admin_parqueo'), updateDisponibilidad);

router.get('/:id', getParqueoDetalle);

export default router;
