import { z } from 'zod';
import { projectRepository } from '../repositories/projectRepository';
import { AppError } from '../utils/errors';

const createProjectSchema = z.object({
  name: z.string().min(1, 'is required').max(200),
  description: z.string().max(1000).optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1, 'is required').max(200).optional(),
  description: z.string().max(1000).optional(),
});

export class ProjectService {
  async list(userId: string, cursor?: string, limit?: number) {
    return projectRepository.findAccessibleByUser(userId, cursor, limit);
  }

  async getById(id: string, userId: string) {
    const project = await projectRepository.findById(id);
    if (!project) {
      throw AppError.notFound('project not found');
    }
    return project;
  }

  async create(userId: string, body: unknown) {
    const parsed = createProjectSchema.safeParse(body);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fields[issue.path.join('.')] = issue.message;
      }
      throw AppError.badRequest('validation failed', fields);
    }

    return projectRepository.create({
      ...parsed.data,
      ownerId: userId,
      history: {
        create: {
          actorId: userId,
          action: 'CREATED',
          newValue: parsed.data,
        }
      }
    } as any);
  }

  async update(id: string, userId: string, body: unknown) {
    const project = await projectRepository.findById(id);
    if (!project) {
      throw AppError.notFound('project not found');
    }

    if (project.ownerId !== userId) {
      throw AppError.forbidden('only the project owner can update this project');
    }

    const parsed = updateProjectSchema.safeParse(body);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fields[issue.path.join('.')] = issue.message;
      }
      throw AppError.badRequest('validation failed', fields);
    }

    const oldV: Record<string, any> = {};
    const newV: Record<string, any> = {};
    for (const [key, value] of Object.entries(parsed.data)) {
      if (project[key as keyof typeof project] !== value) {
        oldV[key] = project[key as keyof typeof project];
        newV[key] = value;
      }
    }

    const updateData: any = { ...parsed.data };
    if (Object.keys(newV).length > 0) {
      updateData.history = {
        create: {
          actorId: userId,
          action: 'UPDATED',
          oldValue: oldV,
          newValue: newV,
        }
      };
    }

    return projectRepository.update(id, updateData);
  }

  async delete(id: string, userId: string) {
    const project = await projectRepository.findById(id);
    if (!project) {
      throw AppError.notFound('project not found');
    }

    if (project.ownerId !== userId) {
      throw AppError.forbidden('only the project owner can delete this project');
    }

    const updateData: any = {
      deletedAt: new Date(),
      deletedBy: userId,
      history: {
        create: {
          actorId: userId,
          action: 'DELETED',
          oldValue: { deletedAt: null },
          newValue: { deletedAt: new Date() },
        }
      }
    };

    await projectRepository.update(id, updateData);
  }

  async getStats(id: string) {
    const project = await projectRepository.findById(id);
    if (!project) {
      throw AppError.notFound('project not found');
    }

    return projectRepository.getStats(id);
  }
}

export const projectService = new ProjectService();
