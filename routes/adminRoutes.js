import { Router } from 'express';
import { crearAdminParqueo, editarParqueo, getBitacoraParqueo } from '../controllers/adminController.js';
import { authRequired, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);
router.post('/crear-admin-parqueo', requireRole('admin'), crearAdminParqueo);          // HU-15
router.patch('/:parqueoId/editar', requireRole('admin', 'admin_parqueo'), editarParqueo); // HU-16
router.get('/:parqueoId/bitacora', requireRole('admin', 'admin_parqueo'), getBitacoraParqueo); // HU-14
export default router;
