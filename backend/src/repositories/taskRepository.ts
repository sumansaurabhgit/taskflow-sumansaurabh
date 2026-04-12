import { prisma } from '../config/database';
import { Prisma, TaskStatus } from '@prisma/client';

export class TaskRepository {
  async findByProject(
    projectId: string,
    filters: { status?: TaskStatus; assigneeId?: string },
    cursor?: string,
    limit = 20
  ) {
    const where: Prisma.TaskWhereInput = { projectId, deletedAt: null };

    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.assigneeId) {
      where.assignees = { some: { userId: filters.assigneeId } };
    }

    const findArgs: Prisma.TaskFindManyArgs = {
      where,
      take: limit + 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        assignees: { include: { user: { select: { id: true, name: true, email: true } } } },
        creator: { select: { id: true, name: true, email: true } },
      },
    };

    if (cursor) {
      try {
        const parsed = JSON.parse(Buffer.from(cursor, 'base64').toString('ascii'));
        findArgs.cursor = { task_createdAt_id: { createdAt: parsed.createdAt, id: parsed.id } };
        findArgs.skip = 1;
      } catch (e) {
      }
    }

    const tasks = await prisma.task.findMany(findArgs);
    const hasMore = tasks.length > limit;
    const data = hasMore ? tasks.slice(0, limit) : tasks;

    return {
      data,
      nextCursor: hasMore 
        ? Buffer.from(JSON.stringify({ id: data[data.length - 1].id, createdAt: data[data.length - 1].createdAt })).toString('base64') 
        : null,
    };
  }

  async findById(id: string) {
    return prisma.task.findFirst({
      where: { id, deletedAt: null },
      include: {
        assignees: { include: { user: { select: { id: true, name: true, email: true } } } },
        creator: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true, ownerId: true } },
      },
    });
  }

  async create(data: Prisma.TaskCreateInput | Prisma.TaskUncheckedCreateInput) {
    return prisma.task.create({
      data,
      include: {
        assignees: { include: { user: { select: { id: true, name: true, email: true } } } },
        creator: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async update(
    id: string,
    data: Prisma.TaskUpdateInput | Prisma.TaskUncheckedUpdateInput
  ) {
    return prisma.task.update({
      where: { id },
      data,
      include: {
        assignees: { include: { user: { select: { id: true, name: true, email: true } } } },
        creator: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async delete(id: string) {
    return prisma.task.delete({ where: { id } });
  }
}

export const taskRepository = new TaskRepository();
