-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATED', 'UPDATED', 'DELETED', 'ASSIGNEE_ADDED', 'ASSIGNEE_REMOVED', 'ASSIGNEES_UPDATED');

-- DropIndex
DROP INDEX "projects_owner_id_created_at_idx";

-- DropIndex
DROP INDEX "tasks_project_id_created_at_idx";

-- AlterTable
ALTER TABLE "project_history" DROP COLUMN "action",
ADD COLUMN     "action" "AuditAction" NOT NULL;

-- AlterTable
ALTER TABLE "task_history" DROP COLUMN "action",
ADD COLUMN     "action" "AuditAction" NOT NULL;

-- CreateIndex
CREATE INDEX "projects_owner_id_created_at_id_idx" ON "projects"("owner_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "task_assignments_user_id_idx" ON "task_assignments"("user_id");

-- CreateIndex
CREATE INDEX "task_assignments_task_id_idx" ON "task_assignments"("task_id");

-- CreateIndex
CREATE INDEX "tasks_project_id_created_at_id_idx" ON "tasks"("project_id", "created_at", "id");
