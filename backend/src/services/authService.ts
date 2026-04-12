import { z } from 'zod';
import { userRepository } from '../repositories/userRepository';
import { hashPassword, comparePassword } from '../utils/password';
import { signToken } from '../utils/jwt';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

const registerSchema = z.object({
  name: z.string().min(1, 'is required').max(100),
  email: z.string().min(1, 'is required').email('must be a valid email'),
  password: z.string().min(6, 'must be at least 6 characters'),
});

const loginSchema = z.object({
  email: z.string().min(1, 'is required').email('must be a valid email'),
  password: z.string().min(1, 'is required'),
});

export class AuthService {
  async register(body: unknown) {
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.');
        fields[key] = issue.message;
      }
      throw AppError.badRequest('validation failed', fields);
    }

    const { name, email, password } = parsed.data;

    const existing = await userRepository.findByEmail(email);
    if (existing) {
      throw AppError.conflict('email already registered');
    }

    const hashedPassword = await hashPassword(password);
    const user = await userRepository.create({
      name,
      email,
      password: hashedPassword,
    });

    logger.info({ userId: user.id, email: user.email }, 'user registered');

    const token = signToken({ userId: user.id, email: user.email });

    return {
      user: { id: user.id, name: user.name, email: user.email },
      token,
    };
  }

  async login(body: unknown) {
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.');
        fields[key] = issue.message;
      }
      throw AppError.badRequest('validation failed', fields);
    }

    const { email, password } = parsed.data;

    const user = await userRepository.findByEmail(email);
    if (!user) {
      throw AppError.unauthorized('invalid email or password');
    }

    const valid = await comparePassword(password, user.password);
    if (!valid) {
      throw AppError.unauthorized('invalid email or password');
    }

    logger.info({ userId: user.id, email: user.email }, 'user logged in');

    const token = signToken({ userId: user.id, email: user.email });

    return {
      user: { id: user.id, name: user.name, email: user.email },
      token,
    };
  }

  async getUsers() {
    return userRepository.findMany();
  }
}

export const authService = new AuthService();
