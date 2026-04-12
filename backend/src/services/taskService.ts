import { z } from 'zod';
import { TaskStatus } from '@prisma/client';
import { taskRepository } from '../repositories/taskRepository';
import { projectRepository } from '../repositories/projectRepository';
import { AppError } from '../utils/errors';
import { sseManager } from '../utils/events';

const createTaskSchema = z.object({
  title: z.string().min(1, 'is required').max(200),
  description: z.string().max(2000).optional(),
  status: z.enum(['todo', 'in_progress', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  assigneeIds: z.array(z.string().uuid('must be a valid UUID')).optional(),
  dueDate: z.string().optional().nullable(),
});

const updateTaskSchema = z.object({
  title: z.string().min(1, 'is required').max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  status: z.enum(['todo', 'in_progress', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  assigneeIds: z.array(z.string().uuid('must be a valid UUID')).optional(),
  dueDate: z.string().optional().nullable(),
});

export class TaskService {
  async listByProject(
    projectId: string,
    userId: string,
    filters: { status?: string; assignee?: string },
    cursor?: string,
    limit?: number
  ) {
    // Verify project exists
    const project = await projectRepository.findById(projectId);
    if (!project) {
      throw AppError.notFound('project not found');
    }

    const taskFilters: { status?: TaskStatus; assigneeId?: string } = {};
    if (filters.status) {
      if (!['todo', 'in_progress', 'done'].includes(filters.status)) {
        throw AppError.badRequest('validation failed', {
          status: 'must be one of: todo, in_progress, done',
        });
      }
      taskFilters.status = filters.status as TaskStatus;
    }
    if (filters.assignee) {
      taskFilters.assigneeId = filters.assignee;
    }

    // Non-owners only see tasks they are assigned to
    const isOwner = project.ownerId === userId;
    if (!isOwner) {
      taskFilters.assigneeId = userId;
    }

    return taskRepository.findByProject(projectId, taskFilters, cursor, limit);
  }

  async create(projectId: string, userId: string, body: unknown) {
    // Verify project exists
    const project = await projectRepository.findById(projectId);
    if (!project) {
      throw AppError.notFound('project not found');
    }

    const parsed = createTaskSchema.safeParse(body);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fields[issue.path.join('.')] = issue.message;
      }
      throw AppError.badRequest('validation failed', fields);
    }

    const { dueDate, assigneeIds, ...rest } = parsed.data;

    const task = await taskRepository.create({
      ...rest,
      projectId,
      creatorId: userId,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      assignees: assigneeIds ? {
        create: assigneeIds.map((id: string) => ({ userId: id }))
      } : undefined,
      history: {
        create: [
          {
            actorId: userId,
            action: 'CREATED',
            newValue: rest as any,
          },
          ...(assigneeIds?.length ? [{
            actorId: userId,
            action: 'ASSIGNEES_UPDATED',
            newValue: { assigneeIds },
          }] : [])
        ]
      }
    } as any);

    // Emit task.assigned to all assigned users
    const assignedUserIds = assigneeIds?.length ? assigneeIds : [];
    if (assignedUserIds.length > 0) {
      sseManager.emitToUsers(assignedUserIds, {
        type: 'task.assigned',
        message: 'You have been assigned a new task',
        task,
      });
    }

    return task;
  }

  async update(taskId: string, userId: string, body: unknown) {
    const task = await taskRepository.findById(taskId);
    if (!task) {
      throw AppError.notFound('task not found');
    }

    // Project owner, task creator, or assignee can update
    const isProjectOwner = task.project.ownerId === userId;
    const isCreator = task.creatorId === userId;
    const isAssignee = (task as any).assignees?.some((a: any) => a.userId === userId);
    if (!isProjectOwner && !isCreator && !isAssignee) {
      throw AppError.forbidden('only the project owner, task creator, or an assignee can update this task');
    }

    const parsed = updateTaskSchema.safeParse(body);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fields[issue.path.join('.')] = issue.message;
      }
      throw AppError.badRequest('validation failed', fields);
    }

    const { dueDate, assigneeIds, ...rest } = parsed.data;
    const updateData: Record<string, any> = { ...rest };

    if (dueDate !== undefined) {
      updateData.dueDate = dueDate ? new Date(dueDate) : null;
    }

    const oldV: Record<string, any> = {};
    const newV: Record<string, any> = {};
    for (const [key, value] of Object.entries(rest)) {
      if (task[key as keyof typeof task] !== value) {
        oldV[key] = task[key as keyof typeof task];
        newV[key] = value;
      }
    }
    if (dueDate !== undefined) {
      const oldDate = task.dueDate ? task.dueDate.toISOString().split('T')[0] : null;
      const newDate = dueDate ? new Date(dueDate).toISOString().split('T')[0] : null;
      if (oldDate !== newDate) {
        oldV.dueDate = oldDate;
        newV.dueDate = newDate;
      }
    }

    const historyEntries: any[] = [];
    if (Object.keys(newV).length > 0) {
      historyEntries.push({
        actorId: userId,
        action: 'UPDATED',
        oldValue: oldV,
        newValue: newV,
      });
    }

    if (assigneeIds !== undefined) {
      const oldAssigneeIds = (task as any).assignees.map((a: any) => a.userId);
      const added = assigneeIds.filter((id: string) => !oldAssigneeIds.includes(id));
      const removed = oldAssigneeIds.filter((id: string) => !assigneeIds.includes(id));

      if (added.length > 0 || removed.length > 0) {
        updateData.assignees = {
          deleteMany: {},
          create: assigneeIds.map((id: string) => ({ userId: id })),
        };
        
        historyEntries.push({
            actorId: userId,
            action: 'ASSIGNEES_UPDATED',
            oldValue: { assigneeIds: oldAssigneeIds },
            newValue: { assigneeIds },
        });

        for (const id of added) {
           historyEntries.push({ actorId: userId, action: 'ASSIGNEE_ADDED', newValue: { userId: id } });
        }
        for (const id of removed) {
           historyEntries.push({ actorId: userId, action: 'ASSIGNEE_REMOVED', oldValue: { userId: id } });
        }
      }
    }

    if (historyEntries.length > 0) {
      updateData.history = { create: historyEntries };
    }

    const updated = await taskRepository.update(taskId, updateData);

    // Emit task.updated to assigned users, creator, and project owner
    const targetUserIds = new Set<string>();
    targetUserIds.add(task.creatorId);
    targetUserIds.add(task.project.ownerId);
    for (const a of (updated as any).assignees || []) {
      targetUserIds.add(a.userId);
    }
    // Also include old assignees so they see the change
    for (const a of (task as any).assignees || []) {
      targetUserIds.add(a.userId);
    }
    sseManager.emitToUsers([...targetUserIds], {
      type: 'task.updated',
      message: 'A task has been updated',
      task: updated,
    });

    return updated;
  }

  async delete(taskId: string, userId: string) {
    const task = await taskRepository.findById(taskId);
    if (!task) {
      throw AppError.notFound('task not found');
    }

    // Project owner or task creator can delete
    const isOwner = task.project.ownerId === userId;
    const isCreator = task.creatorId === userId;
    if (!isOwner && !isCreator) {
      throw AppError.forbidden('only the project owner or task creator can delete this task');
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

    await taskRepository.update(taskId, updateData);

    // Emit task.deleted to assigned users, creator, and project owner
    const deleteTargets = new Set<string>();
    deleteTargets.add(task.creatorId);
    deleteTargets.add(task.project.ownerId);
    for (const a of (task as any).assignees || []) {
      deleteTargets.add(a.userId);
    }
    sseManager.emitToUsers([...deleteTargets], {
      type: 'task.deleted',
      message: 'Task deleted',
      taskId,
    });
  }
}

export const taskService = new TaskService();
