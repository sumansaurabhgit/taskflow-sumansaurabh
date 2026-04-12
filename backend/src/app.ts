import express from 'express';
import cors from 'cors';
import { config } from './config';
import { requestLogger } from './middlewares/requestLogger';
import { errorHandler } from './middlewares/errorHandler';
import { authRoutes } from './routes/authRoutes';
import { projectRoutes } from './routes/projectRoutes';
import { projectTaskRoutes } from './routes/projectTaskRoutes';
import { taskRoutes } from './routes/taskRoutes';
import { eventRoutes } from './routes/eventRoutes';

export function createApp() {
  const app = express();

  // Global middleware
  app.use(cors({ origin: config.cors.origin }));
  app.use(express.json());
  app.use(requestLogger);

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Routes
  app.use('/auth', authRoutes);
  app.use('/projects', projectRoutes);
  app.use('/projects', projectTaskRoutes);
  app.use('/tasks', taskRoutes);
  app.use('/', eventRoutes);

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}
