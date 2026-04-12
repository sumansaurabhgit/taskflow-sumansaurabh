import { Request, Response, NextFunction } from 'express';
import { projectService } from '../services/projectService';

export class ProjectController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const cursor = req.query.cursor as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const result = await projectService.list(req.user!.userId, cursor, limit);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const project = await projectService.getById(req.params.id as string, req.user!.userId);
      res.json(project);
    } catch (err) {
      next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const project = await projectService.create(req.user!.userId, req.body);
      res.status(201).json(project);
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const project = await projectService.update(
        req.params.id as string,
        req.user!.userId,
        req.body
      );
      res.json(project);
    } catch (err) {
      next(err);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await projectService.delete(req.params.id as string, req.user!.userId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }

  async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await projectService.getStats(req.params.id as string);
      res.json(stats);
    } catch (err) {
      next(err);
    }
  }
}

export const projectController = new ProjectController();
