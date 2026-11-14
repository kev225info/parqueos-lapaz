import { Router } from 'express';
import { 
    getParqueos, 
    getFavoritos, 
    toggleFavorito, 
    updateDisponibilidad, 
    getMiParqueo,
    getParqueoCompleto  
} from '../controllers/parqueoController.js';

const router = Router();

router.get('/', getParqueos);
router.get('/favoritos/:usuarioId', getFavoritos);
router.post('/favoritos', toggleFavorito);
router.patch('/:parqueoId/disponibilidad', updateDisponibilidad);
router.get('/mi-parqueo', getMiParqueo);
router.get('/parqueo-completo', getParqueoCompleto); 

export default router;