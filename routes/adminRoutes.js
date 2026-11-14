import { Router } from 'express';
import { crearAdminParqueo } from '../controllers/adminController.js';
const router = Router();
router.post('/crear-admin-parqueo', crearAdminParqueo);
export default router;