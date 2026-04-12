import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../config/database';

const app = createApp();

// Set required env vars for tests
process.env.JWT_SECRET = 'test-secret-key-for-integration-tests';
process.env.NODE_ENV = 'test';

const testUser = {
  name: 'Integration Test User',
  email: `test-${Date.now()}@example.com`,
  password: 'securepassword123',
};

const otherUser = {
  name: 'Other Test User',
  email: `other-${Date.now()}@example.com`,
  password: 'securepassword456',
};

let authToken: string;
let otherToken: string;
let projectId: string;
let userId: string;
let otherUserId: string;
let taskId: string;

beforeAll(async () => {
  // Ensure DB connection
  await prisma.$connect();
});

afterAll(async () => {
  // Cleanup test data
  await prisma.taskHistory.deleteMany({ where: { actor: { email: { in: [testUser.email, otherUser.email] } } } });
  await prisma.projectHistory.deleteMany({ where: { actor: { email: { in: [testUser.email, otherUser.email] } } } });
  await prisma.taskAssignment.deleteMany({ where: { task: { creator: { email: { in: [testUser.email, otherUser.email] } } } } });
  await prisma.task.deleteMany({ where: { creator: { email: { in: [testUser.email, otherUser.email] } } } });
  await prisma.project.deleteMany({ where: { owner: { email: { in: [testUser.email, otherUser.email] } } } });
  await prisma.user.deleteMany({ where: { email: { in: [testUser.email, otherUser.email] } } });
  await prisma.$disconnect();
});

describe('Auth Endpoints', () => {
  describe('POST /auth/register', () => {
    it('should register a new user', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send(testUser)
        .expect(201);

      expect(res.body).toHaveProperty('token');
      expect(res.body.user).toHaveProperty('id');
      expect(res.body.user.email).toBe(testUser.email);
      expect(res.body.user).not.toHaveProperty('password');
    });

    it('should return 409 for duplicate email', async () => {
      await request(app)
        .post('/auth/register')
        .send(testUser)
        .expect(409);
    });

    it('should return 400 for missing fields', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ email: 'test@test.com' })
        .expect(400);

      expect(res.body.error).toBe('validation failed');
      expect(res.body.fields).toBeDefined();
    });
  });

  describe('POST /auth/login', () => {
    it('should login and return a token', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: testUser.email, password: testUser.password })
        .expect(200);

      expect(res.body).toHaveProperty('token');
      expect(res.body.user.email).toBe(testUser.email);
      authToken = res.body.token;
      userId = res.body.user.id;
    });

    it('should return 401 for wrong password', async () => {
      await request(app)
        .post('/auth/login')
        .send({ email: testUser.email, password: 'wrongpassword' })
        .expect(401);
    });

    it('should return 401 for non-existent email', async () => {
      await request(app)
        .post('/auth/login')
        .send({ email: 'nonexistent@example.com', password: 'anypassword' })
        .expect(401);
    });
  });
});

describe('Protected Routes', () => {
  describe('POST /projects', () => {
    it('should return 401 without auth token', async () => {
      await request(app)
        .post('/projects')
        .send({ name: 'Test Project' })
        .expect(401);
    });

    it('should create a project with valid token', async () => {
      const res = await request(app)
        .post('/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Test Project', description: 'A test project' })
        .expect(201);

      expect(res.body.name).toBe('Test Project');
      projectId = res.body.id;
    });
  });

  describe('POST /projects/:id/tasks', () => {
    it('should create a task in the project', async () => {
      const res = await request(app)
        .post(`/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Task',
          description: 'A test task',
          status: 'todo',
          priority: 'high',
        })
        .expect(201);

      expect(res.body.title).toBe('Test Task');
      expect(res.body.status).toBe('todo');
      expect(res.body.priority).toBe('high');
    });

    it('should return 400 for missing title', async () => {
      const res = await request(app)
        .post(`/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ description: 'No title provided' })
        .expect(400);

      expect(res.body.error).toBe('validation failed');
      expect(res.body.fields.title).toBeDefined();
    });

    it('should create a task with multi-assignees', async () => {
      const res = await request(app)
        .post(`/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Collaborative Task',
          assigneeIds: [userId],
        })
        .expect(201);

      expect(res.body.title).toBe('Collaborative Task');
      expect(res.body.assignees).toBeDefined();
      expect(res.body.assignees.length).toBe(1);
      expect(res.body.assignees[0].user.id).toBe(userId);
    });
  });
});

describe('Authorization', () => {
  beforeAll(async () => {
    // Register second user
    const res = await request(app)
      .post('/auth/register')
      .send(otherUser)
      .expect(201);
    otherToken = res.body.token;
    otherUserId = res.body.user.id;

    // Create a task as testUser so we can test delete authorization
    const taskRes = await request(app)
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ title: 'Auth Test Task', status: 'todo', priority: 'low' })
      .expect(201);
    taskId = taskRes.body.id;
  });

  describe('Project owner-only actions', () => {
    it('should return 403 when non-owner updates project', async () => {
      const res = await request(app)
        .patch(`/projects/${projectId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ name: 'Hacked Name' })
        .expect(403);

      expect(res.body.error).toMatch(/owner/i);
    });

    it('should return 403 when non-owner deletes project', async () => {
      const res = await request(app)
        .delete(`/projects/${projectId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);

      expect(res.body.error).toMatch(/owner/i);
    });

    it('should allow owner to update project', async () => {
      const res = await request(app)
        .patch(`/projects/${projectId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Updated Project Name' })
        .expect(200);

      expect(res.body.name).toBe('Updated Project Name');
    });
  });

  describe('Task delete authorization', () => {
    it('should return 403 when non-owner non-creator deletes task', async () => {
      const res = await request(app)
        .delete(`/tasks/${taskId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);

      expect(res.body.error).toMatch(/owner|creator/i);
    });

    it('should allow project owner to delete task', async () => {
      // Create a task as otherUser in testUser's project
      const taskRes = await request(app)
        .post(`/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ title: 'Other User Task', status: 'todo', priority: 'low' })
        .expect(201);

      // testUser (project owner) deletes otherUser's task
      await request(app)
        .delete(`/tasks/${taskRes.body.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);
    });

    it('should allow task creator to delete task', async () => {
      await request(app)
        .delete(`/tasks/${taskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);
    });
  });

  describe('Task update authorization', () => {
    let updateTaskId: string;

    beforeAll(async () => {
      const taskRes = await request(app)
        .post(`/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Update Auth Task', status: 'todo', priority: 'medium' })
        .expect(201);
      updateTaskId = taskRes.body.id;
    });

    it('should return 403 when unrelated user updates task', async () => {
      const res = await request(app)
        .patch(`/tasks/${updateTaskId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ status: 'done' })
        .expect(403);

      expect(res.body.error).toMatch(/owner|creator|assignee/i);
    });

    it('should allow project owner to update task', async () => {
      const res = await request(app)
        .patch(`/tasks/${updateTaskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'in_progress' })
        .expect(200);

      expect(res.body.status).toBe('in_progress');
    });

    it('should allow assignee to update task', async () => {
      // First assign otherUser to the task
      await request(app)
        .patch(`/tasks/${updateTaskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ assigneeIds: [otherUserId] })
        .expect(200);

      // Now otherUser (assignee) can update
      const res = await request(app)
        .patch(`/tasks/${updateTaskId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ status: 'done' })
        .expect(200);

      expect(res.body.status).toBe('done');
    });
  });
});

describe('Server-side Filtering', () => {
  let todoTaskId: string;
  let doneTaskId: string;

  beforeAll(async () => {
    // Create tasks with different statuses
    const todoRes = await request(app)
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ title: 'Filter Todo', status: 'todo', priority: 'low' })
      .expect(201);
    todoTaskId = todoRes.body.id;

    const doneRes = await request(app)
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ title: 'Filter Done', status: 'done', priority: 'high', assigneeIds: [userId] })
      .expect(201);
    doneTaskId = doneRes.body.id;
  });

  it('should filter tasks by status', async () => {
    const res = await request(app)
      .get(`/projects/${projectId}/tasks?status=done`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.data.every((t: any) => t.status === 'done')).toBe(true);
  });

  it('should filter tasks by assignee', async () => {
    const res = await request(app)
      .get(`/projects/${projectId}/tasks?assignee=${userId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.data.length).toBeGreaterThan(0);
    res.body.data.forEach((t: any) => {
      expect(t.assignees.some((a: any) => a.userId === userId)).toBe(true);
    });
  });

  it('should return 400 for invalid status filter', async () => {
    const res = await request(app)
      .get(`/projects/${projectId}/tasks?status=invalid`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(400);

    expect(res.body.fields.status).toBeDefined();
  });
});
