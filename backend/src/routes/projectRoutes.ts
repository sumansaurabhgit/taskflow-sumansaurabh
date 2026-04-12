import { Router } from 'express';
import { projectController } from '../controllers/projectController';
import { authMiddleware } from '../middlewares/auth';

const router = Router();

router.use(authMiddleware);

router.get('/', (req, res, next) => projectController.list(req, res, next));
router.post('/', (req, res, next) => projectController.create(req, res, next));
router.get('/:id', (req, res, next) => projectController.getById(req, res, next));
router.patch('/:id', (req, res, next) => projectController.update(req, res, next));
router.delete('/:id', (req, res, next) => projectController.delete(req, res, next));
router.get('/:id/stats', (req, res, next) => projectController.getStats(req, res, next));

export { router as projectRoutes };
