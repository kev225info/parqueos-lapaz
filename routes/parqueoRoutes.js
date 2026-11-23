import { Router } from 'express';
import { 
    getParqueos, 
    getFavoritos, 
    toggleFavorito, 
    updateDisponibilidad, 
    getMiParqueo,
    getParqueoCompleto,
    buscarParqueos,
} from '../controllers/parqueoController.js';

const router = Router();

router.get('/', getParqueos);
router.get('/buscar', buscarParqueos);
router.get('/favoritos/:usuarioId', getFavoritos);
router.post('/favoritos', toggleFavorito);
router.patch('/:parqueoId/disponibilidad', updateDisponibilidad);
router.get('/mi-parqueo', getMiParqueo);
router.get('/parqueo-completo', getParqueoCompleto); 
router.patch('/:parqueoId/editar', editarParqueo); // HU-16

export default router;