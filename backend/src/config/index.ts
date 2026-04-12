import dotenv from 'dotenv';
import path from 'path';

// Load .env from the backend root (or repo root via docker)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL!,
  jwt: {
    secret: process.env.JWT_SECRET!,
    expiresIn: '24h' as const,
  },
  bcrypt: {
    saltRounds: 12,
  },
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },
} as const;

// Validate required env vars at startup
const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET'] as const;

export function validateEnv(): void {
  const missing = requiredEnvVars.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
