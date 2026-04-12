import { Router } from 'express';
import { taskController } from '../controllers/taskController';
import { authMiddleware } from '../middlewares/auth';

const router = Router();

router.use(authMiddleware);

// Tasks nested under /projects/:id/tasks
router.get('/:id/tasks', (req, res, next) => taskController.listByProject(req, res, next));
router.post('/:id/tasks', (req, res, next) => taskController.create(req, res, next));

export { router as projectTaskRoutes };
