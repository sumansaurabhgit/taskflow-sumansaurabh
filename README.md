# TaskFlow

A full-stack task management system with JWT authentication, project/task CRUD, real-time SSE notifications, and a responsive React UI.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js, TypeScript, Express, Prisma ORM |
| Database | PostgreSQL 16 |
| Auth | JWT (24h expiry), bcrypt (cost 12) |
| Validation | Zod |
| Logging | Pino (structured JSON) |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4 |
| Real-Time | Server-Sent Events (SSE) |
| Infra | Docker, Docker Compose |

---

## Running Locally

```bash
git clone https://github.com/your-name/taskflow
cd taskflow
cp .env.example .env
docker compose up --build
```

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:4000

Migrations, seed data, and dependency installs all run automatically on container start — zero manual steps.

### Test Credentials

```
Email:    test@example.com
Password: password123
```

Seed includes 1 user, 1 project, and 3 tasks with different statuses (todo, in_progress, done).

### Running Without Docker

```bash
# Backend
cd backend && npm install
npx prisma migrate dev && npx tsx src/seed.ts
npm run dev

# Frontend (separate terminal)
cd frontend && npm install
npm run dev   # → http://localhost:5173
```

---

## Architecture Decisions

### Why This Structure

```
backend/src/
├── controllers/    → HTTP layer (parse req, send res)
├── services/       → Business logic + Zod validation
├── repositories/   → Prisma queries only
├── middlewares/     → Auth, error handling, request logging
├── routes/         → Express route definitions
├── utils/          → JWT, password hashing, SSE manager, errors
└── config/         → Environment + Prisma client
```

Strict **Controller → Service → Repository** layering. Controllers never touch the database. Services never touch `req`/`res`. This keeps each layer testable and replaceable independently.

### Key Tradeoffs

**Cursor pagination over offset pagination** — Offset pagination breaks under concurrent writes (rows shift, pages skip or duplicate items). Cursor-based pagination using composite keys `(createdAt, id)` provides stable, O(1) page traversal regardless of concurrent inserts or deletes. Backed by composite indexes (`@@index([projectId, createdAt])`, `@@unique([createdAt, id])`).

**SSE over WebSocket** — This application only needs server-to-client push (new task assigned, task updated, task deleted). WebSocket adds bidirectional complexity, requires sticky sessions or Redis pub/sub for horizontal scaling, and a separate protocol upgrade path. SSE works over standard HTTP, auto-reconnects natively, and is sufficient for our one-way notification pattern.

**Multi-assignee via join table instead of single `assignee_id`** — The spec defines a nullable `assignee_id`. We extended this to a `TaskAssignment` join table (`@@id([taskId, userId])`) supporting multiple assignees per task. Real-world task management rarely limits to one assignee. The composite primary key prevents duplicate assignments at the database level.

**Zod over express-validator** — Zod schemas produce TypeScript types directly (`z.infer<typeof schema>`), giving compile-time safety on validated data. express-validator is imperative and doesn't integrate with the type system. Zod also composes cleanly for nested/optional fields.

**Soft deletes over hard deletes** — Projects and tasks set `deletedAt` + `deletedBy` instead of being removed. This preserves audit trail integrity — history records still reference valid foreign keys. Repositories filter `deletedAt: null` by default.

**Audit history as append-only diffs** — `TaskHistory` and `ProjectHistory` record `oldValue`/`newValue` per change, not full snapshots. This keeps storage lean while providing a complete mutation trail. Individual field changes (status, assignees added/removed) each get their own history entry.

**Custom Tailwind component library** — Built Button, Input, Modal, Badge, Select, Textarea, and Toast components from scratch using Tailwind CSS v4. Chose this over shadcn/ui or Chakra to keep bundle size minimal and avoid dependency on a specific component library's release cycle. All components support dark mode.

**App-level SSE connection** — The EventSource connection lives at the app root (`SSEProvider`), not inside individual pages. This ensures notifications arrive even when the user isn't on the project detail page — e.g., a user on the projects list gets a toast when assigned a new task in any project.

### What's Implemented Beyond the Spec

- **Real-time SSE notifications**: When a task is created/updated/deleted, all relevant users (assignees, creator, project owner) receive instant toast notifications. UI state updates incrementally without refetch.
- **Audit history**: Every mutation (create, update, delete, assignee changes) is tracked with actor, timestamp, and diff.
- **Soft deletes**: Data recovery possible; audit integrity preserved.
- **Multi-assignee support**: Tasks can have multiple assignees with deduplication at the DB level.
- **Dark mode**: Toggle persists across sessions via localStorage.
- **Cursor pagination**: On both projects and tasks list endpoints.
- **Stats endpoint**: `GET /projects/:id/stats` returns task counts by status and by assignee.
- **15+ integration tests**: Auth, CRUD, authorization rules, filtering — all tested with Jest + Supertest.
- **Optimistic UI**: Task status cycling updates instantly, reverts on API error.
- **Graceful shutdown**: SIGTERM/SIGINT handlers close HTTP server and disconnect Prisma cleanly.

---

## API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register (name, email, password) → returns JWT |
| POST | `/auth/login` | Login (email, password) → returns JWT |
| GET | `/auth/users` | List all users (for assignee selection) |

### Projects
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/projects` | List accessible projects (`?cursor=&limit=`) |
| POST | `/projects` | Create project (owner = current user) |
| GET | `/projects/:id` | Get project details |
| PATCH | `/projects/:id` | Update name/description (owner only) |
| DELETE | `/projects/:id` | Soft-delete project (owner only) |
| GET | `/projects/:id/stats` | Task counts by status and assignee |

### Tasks
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/projects/:id/tasks` | List tasks (`?status=&assignee=&cursor=&limit=`) |
| POST | `/projects/:id/tasks` | Create task with optional assignees |
| PATCH | `/tasks/:id` | Update task (owner/creator/assignee) |
| DELETE | `/tasks/:id` | Soft-delete task (owner/creator only) |

### Real-Time Events
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/events?token=JWT` | SSE stream (task.assigned, task.updated, task.deleted) |

All endpoints return `Content-Type: application/json`. Errors follow: `400` (validation with `{ error, fields }`), `401` (unauthenticated), `403` (forbidden), `404` (not found).

---

## Testing

```bash
cd backend
npm test
```

15+ integration tests covering: registration, login, duplicate email, project CRUD, owner-only enforcement, task CRUD with authorization, status/assignee filtering.

---

## What I'd Do With More Time

**Shortcuts taken:**
- **No down migrations** — Prisma generates forward-only SQL migrations. Manual rollback SQL wasn't added. In production, I'd write explicit down migrations or use a tool like `dbmate` alongside Prisma.
- **No drag-and-drop** — Task status changes use click-to-cycle (optimistic). A kanban board with `@dnd-kit` would be the natural next step.
- **No rate limiting** — Login and registration endpoints are unprotected against brute force. `express-rate-limit` is a quick add.
- **No refresh token rotation** — Single JWT with 24h expiry. Production needs HttpOnly cookie-based refresh tokens with rotation.
- **`fetchUsers` error is silent** — The assignee dropdown fails gracefully but doesn't notify the user.

What I'd improve:
- Refresh token + HttpOnly cookies** — Eliminate token exposure in localStorage.
- Authorization is ownership-based only (project owner / task creator).
Tradeoff: Keeps permission logic straightforward for assignment scope.
Production Improvement: Introduce team/workspace roles (admin/member/viewer).
Notifications and audit logging execute inline with request lifecycle.
Tradeoff: Simpler architecture for assignment scope.
Production Improvement: Offload heavy side effects to background workers/queues.
- Rate limiting** on `/auth/login` and `/auth/register`.
- Kanban drag-and-drop UI** with `@dnd-kit` for visual status changes.
- E2E tests with Playwright covering the full login → create project → assign task → SSE notification flow.
- The SSE implementation uses an in-memory subscriber registry (Map<userId, Set<Response>>) for simplicity.
Tradeoff: This works well for a single-instance deployment but would not scale horizontally across multiple backend instances.
- File attachments** on tasks via S3-compatible storage.
- CI/CD pipeline** — GitHub Actions running lint, type-check, and tests on every PR.
- History partitioning** — Archive audit records older than N days to keep query performance stable.
- will make enhancement in the UI
will integrate the email functionality



POST	/auth/register	

Request: {  "name":"suman",
    "email": "test1@example.com",
    "password": "password123"
}

Response:
{
    "user": {
        "id": "72b5edc0-6332-40a7-a7e6-dac35a9dd7a9",
        "name": "suman",
        "email": "test1@example.com"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI3MmI1ZWRjMC02MzMyLTQwYTctYTdlNi1kYWMzNWE5ZGQ3YTkiLCJlbWFpbCI6InRlc3QxQGV4YW1wbGUuY29tIiwiaWF0IjoxNzc2MDAxMjQ0LCJleHAiOjE3NzYwODc2NDR9.CqDewuStz0Ch3qfxVQaTTv55q6yl98cvsgnsDGCPxms"
}



POST	/auth/login	

Request:
        {  
    "email": "test1@example.com",
    "password": "password123"
        }

Response:

     {
    "user": {
        "id": "72b5edc0-6332-40a7-a7e6-dac35a9dd7a9",
        "name": "suman",
        "email": "test1@example.com"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI3MmI1ZWRjMC02MzMyLTQwYTctYTdlNi1kYWMzNWE5ZGQ3YTkiLCJlbWFpbCI6InRlc3QxQGV4YW1wbGUuY29tIiwiaWF0IjoxNzc2MDA4OTM2LCJleHAiOjE3NzYwOTUzMzZ9.cKrWrYINNBtptEQPIFpvw_Afk98ETjnN3lGWLrpyzGY"
}


GET	/projects    http://localhost:4000/projects

Response: 
{
    "data": [
        {
            "id": "16fc18b6-344b-4b46-a4f0-6f7887f6825b",
            "name": "zira ticket",
            "description": "abcdef",
            "ownerId": "72b5edc0-6332-40a7-a7e6-dac35a9dd7a9",
            "createdAt": "2026-04-12T13:41:19.194Z",
            "deletedAt": null,
            "deletedBy": null,
            "owner": {
                "id": "72b5edc0-6332-40a7-a7e6-dac35a9dd7a9",
                "name": "suman",
                "email": "test1@example.com"
            },
            "_count": {
                "tasks": 3
            }
        }
    ],
    "nextCursor": null
}


POST	/projects	Create a project (owner = current user)   

Request:
{
  "name": "My New Project",
  "description": "A test project created via Postman"
}

Response:

{
    "id": "7effe002-5f51-430d-9ea2-fbaa7dca6f9d",
    "name": "My New Project",
    "description": "A test project created via Postman",
    "ownerId": "72b5edc0-6332-40a7-a7e6-dac35a9dd7a9",
    "createdAt": "2026-04-12T15:56:40.640Z",
    "deletedAt": null,
    "deletedBy": null,
    "owner": {
        "id": "72b5edc0-6332-40a7-a7e6-dac35a9dd7a9",
        "name": "suman",
        "email": "test1@example.com"
    }
}


GET	/projects/:id	Get project details + its tasks

Request:http://localhost:4000/projects/7effe002-5f51-430d-9ea2-fbaa7dca6f9d

Response:
 {
    "id": "7effe002-5f51-430d-9ea2-fbaa7dca6f9d",
    "name": "My New Project",
    "description": "A test project created via Postman",
    "ownerId": "72b5edc0-6332-40a7-a7e6-dac35a9dd7a9",
    "createdAt": "2026-04-12T15:56:40.640Z",
    "deletedAt": null,
    "deletedBy": null,
    "owner": {
        "id": "72b5edc0-6332-40a7-a7e6-dac35a9dd7a9",
        "name": "suman",
        "email": "test1@example.com"
    },
    "_count": {
        "tasks": 0
    }
}

PATCH	/projects/:id	Update name/description (owner only)

Request: http://localhost:4000/projects/7effe002-5f51-430d-9ea2-fbaa7dca6f9d

{
  "name": "Updated Project Name",
  "description": "Updated description"
}

Response:
{
    "id": "7effe002-5f51-430d-9ea2-fbaa7dca6f9d",
    "name": "Updated Project Name",
    "description": "Updated description",
    "ownerId": "72b5edc0-6332-40a7-a7e6-dac35a9dd7a9",
    "createdAt": "2026-04-12T15:56:40.640Z",
    "deletedAt": null,
    "deletedBy": null,
    "owner": {
        "id": "72b5edc0-6332-40a7-a7e6-dac35a9dd7a9",
        "name": "suman",
        "email": "test1@example.com"
    }
}


GET	/projects/:id/tasks	

Request: http://localhost:4000/projects/7effe002-5f51-430d-9ea2-fbaa7dca6f9d/tasks

Response: 
{
    "data": [
        {
            "id": "11517381-06d0-4078-91cd-498c555cd62d",
            "title": "testing creating a tasks",
            "description": "testing creating a tasks",
            "status": "todo",
            "priority": "medium",
            "projectId": "7effe002-5f51-430d-9ea2-fbaa7dca6f9d",
            "creatorId": "72b5edc0-6332-40a7-a7e6-dac35a9dd7a9",
            "dueDate": "2026-04-14T00:00:00.000Z",
            "createdAt": "2026-04-12T16:10:09.809Z",
            "updatedAt": "2026-04-12T16:10:09.809Z",
            "deletedAt": null,
            "deletedBy": null,
            "assignees": [
                {
                    "taskId": "11517381-06d0-4078-91cd-498c555cd62d",
                    "userId": "72b5edc0-6332-40a7-a7e6-dac35a9dd7a9",
                    "assignedAt": "2026-04-12T16:10:09.809Z",
                    "user": {
                        "id": "72b5edc0-6332-40a7-a7e6-dac35a9dd7a9",
                        "name": "suman",
                        "email": "test1@example.com"
                    }
                },
                {
                    "taskId": "11517381-06d0-4078-91cd-498c555cd62d",
                    "userId": "a18f80ad-a69f-46a3-8093-8f00e646af2e",
                    "assignedAt": "2026-04-12T16:10:09.809Z",
                    "user": {
                        "id": "a18f80ad-a69f-46a3-8093-8f00e646af2e",
                        "name": "Test User",
                        "email": "test@example.com"
                    }
                }
            ],
            "creator": {
                "id": "72b5edc0-6332-40a7-a7e6-dac35a9dd7a9",
                "name": "suman",
                "email": "test1@example.com"
            }
        }
    ],
    "nextCursor": null
}





