import { Request, Response, NextFunction } from 'express';
import { taskService } from '../services/taskService';

export class TaskController {
  async listByProject(req: Request, res: Response, next: NextFunction) {
    try {
      const { status, assignee, cursor, limit } = req.query;
      const result = await taskService.listByProject(
        req.params.id as string,
        req.user!.userId,
        {
          status: status as string | undefined,
          assignee: assignee as string | undefined,
        },
        cursor as string | undefined,
        limit ? parseInt(limit as string, 10) : undefined
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const task = await taskService.create(
        req.params.id as string,
        req.user!.userId,
        req.body
      );
      res.status(201).json(task);
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const task = await taskService.update(
        req.params.id as string,
        req.user!.userId,
        req.body
      );
      res.json(task);
    } catch (err) {
      next(err);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await taskService.delete(req.params.id as string, req.user!.userId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
}

export const taskController = new TaskController();
