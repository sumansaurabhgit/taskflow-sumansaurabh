import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient({
  log: [
    { level: 'error', emit: 'event' },
    { level: 'warn', emit: 'event' },
  ],
});

prisma.$on('error', (e) => {
  logger.error({ prismaError: e }, 'Prisma error');
});

prisma.$on('warn', (e) => {
  logger.warn({ prismaWarn: e }, 'Prisma warning');
});

export { prisma };
