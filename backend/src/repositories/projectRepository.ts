import { prisma } from '../config/database';
import { Project, Prisma } from '@prisma/client';

export class ProjectRepository {
  async findAccessibleByUser(
    userId: string,
    cursor?: string,
    limit = 20
  ) {
    const where: Prisma.ProjectWhereInput = {
      deletedAt: null,
      OR: [
        { ownerId: userId },
        { tasks: { some: { assignees: { some: { userId } }, deletedAt: null } } },
      ],
    };

    const findArgs: Prisma.ProjectFindManyArgs = {
      where,
      take: limit + 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        owner: { select: { id: true, name: true, email: true } },
        _count: { select: { tasks: { where: { deletedAt: null } } } },
      },
    };

    if (cursor) {
      try {
        const parsed = JSON.parse(Buffer.from(cursor, 'base64').toString('ascii'));
        findArgs.cursor = { project_createdAt_id: { createdAt: parsed.createdAt, id: parsed.id } };
        findArgs.skip = 1;
      } catch (e) {
        // ignore invalid cursor
      }
    }

    const projects = await prisma.project.findMany(findArgs);
    const hasMore = projects.length > limit;
    const data = hasMore ? projects.slice(0, limit) : projects;

    return {
      data,
      nextCursor: hasMore 
        ? Buffer.from(JSON.stringify({ id: data[data.length - 1].id, createdAt: data[data.length - 1].createdAt })).toString('base64') 
        : null,
    };
  }

  async findById(id: string) {
    return prisma.project.findFirst({
      where: { id, deletedAt: null },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        _count: { select: { tasks: { where: { deletedAt: null } } } },
      },
    });
  }

  async create(data: {
    name: string;
    description?: string;
    ownerId: string;
  }) {
    return prisma.project.create({
      data,
      include: {
        owner: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async update(id: string, data: Prisma.ProjectUpdateInput) {
    return prisma.project.update({
      where: { id },
      data,
      include: {
        owner: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async delete(id: string) {
    // Soft delete is handled by update
    return prisma.project.delete({ where: { id } });
  }

  async getStats(projectId: string) {
    const [statusCounts, assigneeCounts] = await Promise.all([
      prisma.task.groupBy({
        by: ['status'],
        where: { projectId, deletedAt: null },
        _count: { id: true },
      }),
      prisma.taskAssignment.groupBy({
        by: ['userId'],
        where: { task: { projectId, deletedAt: null } },
        _count: { taskId: true },
      }),
    ]);

    return { statusCounts, assigneeCounts };
  }
}

export const projectRepository = new ProjectRepository();
