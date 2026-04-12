#!/bin/sh
set -e

echo "Running Prisma migrations..."
npx prisma migrate deploy

echo "Seeding database..."
npx tsx src/seed.ts || echo "Seed script not found in production, skipping..."

echo "Starting server..."
node dist/server.js
