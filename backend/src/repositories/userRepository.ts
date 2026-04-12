import { prisma } from '../config/database';
import { User } from '@prisma/client';

export class UserRepository {
  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  async create(data: {
    name: string;
    email: string;
    password: string;
  }): Promise<User> {
    return prisma.user.create({ data });
  }

  async findMany(): Promise<Pick<User, 'id' | 'name' | 'email'>[]> {
    return prisma.user.findMany({
      select: { id: true, name: true, email: true },
    });
  }
}

export const userRepository = new UserRepository();
