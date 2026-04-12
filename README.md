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
- Rate limiting** on `/auth/login` and `/auth/register`.
- Kanban drag-and-drop UI** with `@dnd-kit` for visual status changes.
- E2E tests with Playwright covering the full login → create project → assign task → SSE notification flow.
- Pagination UI for tasks** — Currently loads first page only; add infinite scroll or "Load More".
- File attachments** on tasks via S3-compatible storage.
- CI/CD pipeline** — GitHub Actions running lint, type-check, and tests on every PR.
- History partitioning** — Archive audit records older than N days to keep query performance stable.
- will make enhancement in the UI
will integrate the email functionality

