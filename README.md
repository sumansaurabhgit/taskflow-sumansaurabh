# TaskFlow

A modern, full-stack task management system built as a take-home assignment. It features authentication, project management, real-time task tracking, and a dynamic and fully responsive UI.

## 🚀 Features Implemented

### Backend
- **RESTful API**: Clean, standard Node.js Express server with isolated routes, controllers, services, and repositories.
- **Relational Data**: Full PostgreSQL schema powered by Prisma ORM representing Users, Projects, and Tasks with proper constraints and indexing.
- **Robust Authentication**: JWT-based authentication (24-hour expiry) secured via `bcrypt` (cost factor 12) with protected routes.
- **Input Validation**: Strongly typed validation over request bodies and parameters using Zod.
- **Cursor Pagination**: Clean cursor-based endpoints ensuring performance for `listByProject` task fetching.
- **Real-Time Updates**: Native Server-Sent Events (SSE) streaming task creation, updates, and deletion back to listening clients instantly.
- **Error Handling**: A custom, consistent `AppError` response envelope for mapping statuses (400, 401, 403, 404).

### Frontend
- **Polished UI/UX**: Built with React 19, Vite, and Tailwind CSS v4 to create a high-quality "premium" feel.
- **Custom Components**: Clean, strictly typed component library (Buttons, Inputs, Textareas, Selects, Modals, Badges) minimizing external UI dependencies.
- **Context API Management**: Global `AuthContext` with synchronized `localStorage` providing persistence across page reloads.
- **Optimistic UI Styling**: Immediate UI feedback mapped when cycling through task statuses (To Do → In Progress → Done).
- **Network Interceptors**: Axios configuration globally applying the JWT as a Bearer token and redirecting appropriately on 401 Unauthorized responses.

### Infrastructure
- **Containerization**: A full unified `docker-compose.yml` network running PostgreSQL, the Backend API, and Frontend application simultaneously.
- **Automated Lifecycle**: Backend Dockerfile invokes a `docker-entrypoint.sh` script to independently deploy pending Prisma migrations and insert test data seeds prior to boot!

---

## 🛠 Tech Stack

| Layer      | Technology                                |
|------------|-------------------------------------------|
| Backend    | Node.js, TypeScript, Express, Prisma      |
| Database   | PostgreSQL 16                             |
| Auth       | JWT, bcrypt                               |
| Frontend   | React 19, TypeScript, Vite, Tailwind CSS  |
| Logging    | Pino (structured JSON logging)            |
| Infra      | Docker, Docker Compose                    |

---

## 💻 Running the Application

### 🐳 Option A: Using Docker (Recommended)

Prerequisites: Have Docker Desktop installed and running on your machine.

1. Clone the repository and navigate into it.
2. Ensure the environment variables are set (you can copy the example file):
   ```bash
   cp .env.example .env
   ```
3. Run the complete application layer:
   ```bash
   docker compose up --build
   ```
   *Note: This handles installing dependencies, initializing PostgreSQL, deploying Prisma migrations, and building the frontend.*

4. Access the application:
   - **Frontend App:** http://localhost:3000
   - **Backend API:** http://localhost:4000
   
5. Log in with the pre-seeded testing credentials:
   - **Email:** `test@example.com`
   - **Password:** `password123`

### 🖥 Option B: Manual Native Setup (Without Docker)

You will need Node.js and a running PostgreSQL instance locally.

**1. Setup the Database & Backend:**
```bash
cd backend
npm install

# Connect your local Postgres by updating DATABASE_URL in backend/.env

# Apply tables and input the predefined seed
npx prisma migrate dev
npx tsx src/seed.ts

# Run the development server
npm run dev
```

**2. Setup the Frontend:**
```bash
# Open a new terminal
cd frontend
npm install

# Run Vite dev server
npm run dev
```
*(The native local frontend will be running on `http://localhost:5173` instead of 3000).*

---

## 🏗 Architecture Decisions & Implementation Rationale

### Advanced Relational Patterns

TaskFlow implements enterprise-grade relational patterns over the standard PostgreSQL implementation:

1. **Many-to-Many Assignments:** `TaskAssignment` handles bridging task and users securely. It protects against assignment duplication natively via the unique composite primary key `@@id([taskId, userId])`.
2. **Audit History Trailing:** The `TaskHistory` and `ProjectHistory` tables operate via an unbounded append-only model. Mutations generate strict transactional diffs (extracting `oldValue` and `newValue`) saving only altered states rather than bloating the database with continuous full snapshots. *Note: In larger production implementations, these tables would run automated partitioning policies archiving historical data past predetermined timelines.*
3. **Soft Deletion Mechanism:** The system abandons destructive `hard-delete` queries. When a Project or Task is dropped, it sets `deletedAt: DateTime` and `deletedBy`. Repositories default to excluding `deletedAt: null`. This preserves crucial linkages for maintaining aggregate compliance inside the Audit logs while keeping data isolated without foreign key cascades wiping trails.
4. **Composite Cursor Pagination:** Cursor pagination guarantees O(1) skipping efficiency but faces sorting instability issues tracking generic IDs traversing newly updated rows. TaskFlow utilizes stable composite keys enforcing bounds across both `(createdAt, id)` mapping against strict descending limits. Native performance relies on standard multi-column definitions (e.g. `@@index([projectId, createdAt])` & `@@unique([createdAt, id])`).

```
backend/src/
├── config/          # Environment configuration, Prisma instantiation
├── controllers/     # HTTP route endpoints passing to services
├── middlewares/      # Authentication, payload logging, error catching
├── repositories/     # Database manipulation (Prisma Queries)
├── routes/          # Express route definitions mappings
├── services/        # Business logic containing validation (Zod)
└── utils/           # JWT compilation, passwords, error configurations, SSE
```

**Methodology:**
- **Separation of concerns**: Controllers never touch the database directly. Services coordinate business logic. Repositories handle database interactions.
- **Zod Validation**: Replaced `express-validator` to natively extract TypeScript types from schema validators.
- **Graceful Shutdown**: The API traps `SIGTERM/SIGINT` terminating the Prisma database correctly to avoid handle leaking.

## 📡 API Reference

#### Authentication
| Method | Endpoint         | Description |
|--------|------------------|-------------|
| POST   | `/auth/register` | Create user (name, email, password) |
| POST   | `/auth/login`    | Sign in (returns JWT) |
| GET    | `/auth/users`    | Retrieve user collection |

#### Projects
| Method | Endpoint            | Description |
|--------|---------------------|-------------|
| GET    | `/projects`         | Returns accessible projects `(?cursor=&limit=)` |
| POST   | `/projects`         | Generate a new project |
| GET    | `/projects/:id`     | Metadata for a specific project |
| PATCH  | `/projects/:id`     | Alter description/name values |
| DELETE | `/projects/:id`     | Drop a project structure and underlying tasks |

#### Tasks
| Method | Endpoint            | Description |
|--------|---------------------|-------------|
| GET    | `/projects/:id/tasks`| Paginated/Filtered tasks `(?status=&assignee=)` |
| POST   | `/projects/:id/tasks`| Add a task to project scope |
| PATCH  | `/tasks/:id`        | Adjust specific task values/assignment |
| DELETE | `/tasks/:id`        | Permanently remove a task |

#### Webhooks (Real-Time)
| Method | Endpoint            | Description |
|--------|---------------------|-------------|
| GET    | `/events`           | Stream Server-Sent Events updates directly to the connection |

---

## 🧪 Testing

The backend includes a `jest` and `supertest` suite. Ensure PostgreSQL is functioning locally with a connected `DATABASE_URL`.
```bash
cd backend
npm test
```

## 🔮 What I'd Do With More Time

1. **Refresh token rotation** — Current JWT-only auth is constrained. Implementing an HttpOnly cookie-based refresh token with explicit rotation is vital for security.
2. **Rate limiting** — Utilizing `express-rate-limit` against brute-force attempts on the `/auth/login` paths.
3. **WebSocket upgrade** — SSE functions flawlessly for single-direction syncs, but WebSocket enables multi-user presence indicators (e.g. typing or viewing notifications).
4. **Drag-and-drop kanban** — Adding UI arrays backed by `@dnd-kit` to visually drag tasks between `todo` and `in_progress`.
5. **Team Workspaces** — Migrating `ownerId` boundaries over to an `Organization` relationship framework.
