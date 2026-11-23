import { Router } from 'express';
import { crearAdminParqueo, editarParqueo } from '../controllers/adminController.js';
const router = Router();
router.patch('/:parqueoId/editar', editarParqueo); // HU-16
router.post('/crear-admin-parqueo', crearAdminParqueo);
export default router;