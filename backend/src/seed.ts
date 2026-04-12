import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clean existing data
  await prisma.taskHistory.deleteMany();
  await prisma.projectHistory.deleteMany();
  await prisma.taskAssignment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();

  // Create test user
  const hashedPassword = await bcrypt.hash('password123', 12);
  const user = await prisma.user.create({
    data: {
      name: 'Test User',
      email: 'test@example.com',
      password: hashedPassword,
    },
  });
  console.log(`✅ Created user: ${user.email}`);

  // Create a project
  const project = await prisma.project.create({
    data: {
      name: 'TaskFlow Demo Project',
      description: 'A sample project to demonstrate TaskFlow capabilities',
      ownerId: user.id,
    },
  });
  console.log(`✅ Created project: ${project.name}`);

  // Create 3 tasks with different statuses
  const tasks = await Promise.all([
    prisma.task.create({
      data: {
        title: 'Set up project architecture',
        description: 'Define folder structure, configure linting, and set up CI/CD pipeline',
        status: 'done',
        priority: 'high',
        projectId: project.id,
        creatorId: user.id,
        dueDate: new Date('2026-04-15'),
        assignees: {
          create: [{ userId: user.id }]
        }
      },
    }),
    prisma.task.create({
      data: {
        title: 'Implement user authentication',
        description: 'Add JWT-based auth with login and registration endpoints',
        status: 'in_progress',
        priority: 'high',
        projectId: project.id,
        creatorId: user.id,
        dueDate: new Date('2026-04-20'),
        assignees: {
          create: [{ userId: user.id }]
        }
      },
    }),
    prisma.task.create({
      data: {
        title: 'Write API documentation',
        description: 'Document all REST endpoints with request/response examples',
        status: 'todo',
        priority: 'medium',
        projectId: project.id,
        creatorId: user.id,
        dueDate: new Date('2026-04-25'),
      },
    }),
  ]);

  console.log(`✅ Created ${tasks.length} tasks`);
  console.log('\n🎉 Seed completed!');
  console.log('\nTest credentials:');
  console.log('  Email:    test@example.com');
  console.log('  Password: password123');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
