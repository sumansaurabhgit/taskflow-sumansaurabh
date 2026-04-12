import { useState, useEffect, useCallback, useMemo, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Loader2, Trash2, Edit3, Calendar, User as UserIcon,
  CheckCircle2, Circle, Clock
} from 'lucide-react';
import { projectsApi, tasksApi, authApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useSSE } from '../hooks/useSSE';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { Navbar } from '../components/layout/Navbar';
import type { Project, Task, User, TaskStatus, TaskPriority } from '../types';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

const STATUS_BADGE: Record<TaskStatus, { label: string; variant: 'outline' | 'info' | 'success' }> = {
  todo: { label: 'To Do', variant: 'outline' },
  in_progress: { label: 'In Progress', variant: 'info' },
  done: { label: 'Done', variant: 'success' },
};

const PRIORITY_BADGE: Record<TaskPriority, { label: string; variant: 'default' | 'warning' | 'destructive' }> = {
  low: { label: 'Low', variant: 'default' },
  medium: { label: 'Medium', variant: 'warning' },
  high: { label: 'High', variant: 'destructive' },
};

const STATUS_ICON: Record<TaskStatus, typeof Circle> = {
  todo: Circle,
  in_progress: Clock,
  done: CheckCircle2,
};

interface TaskFormState {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeIds: string[];
  dueDate: string;
}

const emptyForm: TaskFormState = {
  title: '',
  description: '',
  status: 'todo',
  priority: 'medium',
  assigneeIds: [],
  dueDate: '',
};

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');

  // Task modal
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskForm, setTaskForm] = useState<TaskFormState>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);

  const fetchProject = useCallback(async () => {
    if (!id) return;
    try {
      const { data } = await projectsApi.getById(id);
      setProject(data);
    } catch {
      setError('Project not found');
    }
  }, [id]);

  const fetchTasks = useCallback(async () => {
    if (!id) return;
    try {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      if (assigneeFilter) params.assignee = assigneeFilter;

      const { data } = await tasksApi.listByProject(id, params);
      setTasks(data.data);
    } catch {
      setError('Failed to load tasks');
    }
  }, [id, statusFilter, assigneeFilter]);

  const fetchUsers = useCallback(async () => {
    try {
      const { data } = await authApi.getUsers();
      setUsers(data.data);
    } catch {
      // Non-critical, just won't have user list for assignment
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      await Promise.all([fetchProject(), fetchTasks(), fetchUsers()]);
      setIsLoading(false);
    };
    load();
  }, [fetchProject, fetchTasks, fetchUsers]);

  // SSE for real-time incremental updates (no refetch)
  const sseHandlers = useMemo(() => ({
    onTaskAssigned: (task: Task) => {
      if (task.projectId === id) {
        setTasks((prev) => {
          if (prev.some((t) => t.id === task.id)) return prev;
          return [task, ...prev];
        });
      }
    },
    onTaskUpdated: (task: Task) => {
      if (task.projectId === id) {
        setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
      }
    },
    onTaskDeleted: (taskId: string) => {
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    },
  }), [id]);
  useSSE(sseHandlers);

  const openCreateModal = () => {
    setEditingTask(null);
    setTaskForm(emptyForm);
    setShowTaskModal(true);
  };

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setTaskForm({
      title: task.title,
      description: task.description || '',
      status: task.status,
      priority: task.priority,
      assigneeIds: task.assignees?.map((a: any) => a.userId) || [],
      dueDate: task.dueDate ? task.dueDate.split('T')[0] : '',
    });
    setShowTaskModal(true);
  };

  const handleSaveTask = async (e: FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setIsSaving(true);

    try {
      const payload = {
        title: taskForm.title,
        description: taskForm.description || undefined,
        status: taskForm.status,
        priority: taskForm.priority,
        assigneeIds: taskForm.assigneeIds,
        dueDate: taskForm.dueDate || null,
      };

      if (editingTask) {
        const { data } = await tasksApi.update(editingTask.id, payload);
        setTasks((prev) =>
          prev.map((t) => (t.id === editingTask.id ? data : t))
        );
      } else {
        const { data } = await tasksApi.create(id, payload);
        setTasks((prev) => {
          if (prev.some((t) => t.id === data.id)) return prev;
          return [data, ...prev];
        });
      }
      setShowTaskModal(false);
    } catch {
      setError('Failed to save task');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Delete this task?')) return;
    try {
      await tasksApi.delete(taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch {
      setError('Failed to delete task');
    }
  };

  // Optimistic status update
  const handleStatusChange = async (task: Task, newStatus: TaskStatus) => {
    const oldStatus = task.status;
    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t))
    );

    try {
      await tasksApi.update(task.id, { status: newStatus });
    } catch {
      // Revert on error
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: oldStatus } : t))
      );
      setError('Failed to update task status');
    }
  };

  const handleDeleteProject = async () => {
    if (!id || !confirm('Delete this project and all its tasks?')) return;
    try {
      await projectsApi.delete(id);
      navigate('/');
    } catch {
      setError('Failed to delete project');
    }
  };

  const isOwner = project?.ownerId === currentUser?.id;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-20 text-center">
          <h2 className="text-lg font-semibold mb-2">Project not found</h2>
          <Button variant="outline" onClick={() => navigate('/')}>
            Back to Projects
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Projects
          </button>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">{project.name}</h1>
              {project.description && (
                <p className="text-sm text-muted-foreground mt-1">
                  {project.description}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={openCreateModal}>
                <Plus className="h-4 w-4" />
                Add Task
              </Button>
              {isOwner && (
                <Button variant="destructive" size="icon" onClick={handleDeleteProject}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive mb-6">
            {error}
            <button
              className="ml-2 underline cursor-pointer"
              onClick={() => setError('')}
            >
              dismiss
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <Select
            id="status-filter"
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-40"
          />
          <Select
            id="assignee-filter"
            options={[
              { value: '', label: 'All Assignees' },
              ...users.map((u) => ({ value: u.id, label: u.name })),
            ]}
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="w-44"
          />
        </div>

        {/* Tasks list */}
        {tasks.length === 0 ? (
          <div className="text-center py-16 border rounded-xl border-dashed">
            <h3 className="text-md font-semibold mb-1">No tasks yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {statusFilter || assigneeFilter
                ? 'No tasks match the current filters'
                : 'Add your first task to this project'}
            </p>
            {!statusFilter && !assigneeFilter && (
              <Button onClick={openCreateModal} size="sm">
                <Plus className="h-4 w-4" />
                Add Task
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => {
              const StatusIcon = STATUS_ICON[task.status];
              const canEdit = isOwner || task.creatorId === currentUser?.id || task.assignees?.some((a: any) => a.userId === currentUser?.id);
              const canDelete = isOwner || task.creatorId === currentUser?.id;
              return (
                <div
                  key={task.id}
                  className="group rounded-xl border bg-card p-4 hover:border-primary/30 transition-all duration-200"
                >
                  <div className="flex items-start gap-3">
                    {/* Status cycle button */}
                    <button
                      className="mt-0.5 shrink-0 cursor-pointer"
                      onClick={() => {
                        const next: Record<TaskStatus, TaskStatus> = {
                          todo: 'in_progress',
                          in_progress: 'done',
                          done: 'todo',
                        };
                        handleStatusChange(task, next[task.status]);
                      }}
                      title={`Status: ${STATUS_BADGE[task.status].label} — click to change`}
                    >
                      <StatusIcon
                        className={`h-5 w-5 ${
                          task.status === 'done'
                            ? 'text-emerald-500'
                            : task.status === 'in_progress'
                            ? 'text-sky-500'
                            : 'text-slate-400'
                        }`}
                      />
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3
                          className={`font-medium ${
                            task.status === 'done'
                              ? 'line-through text-muted-foreground'
                              : ''
                          }`}
                        >
                          {task.title}
                        </h3>
                        <Badge variant={PRIORITY_BADGE[task.priority].variant}>
                          {PRIORITY_BADGE[task.priority].label}
                        </Badge>
                        <Badge variant={STATUS_BADGE[task.status].variant}>
                          {STATUS_BADGE[task.status].label}
                        </Badge>
                      </div>

                      {task.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {task.description}
                        </p>
                      )}

                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        {task.assignees?.length > 0 && (
                          <span className="flex items-center gap-1">
                            <UserIcon className="h-3 w-3" />
                            {task.assignees.map((a: any) => a.user?.name).filter(Boolean).join(', ')}
                          </span>
                        )}
                        {task.dueDate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(task.dueDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    {(canEdit || canDelete) && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {canEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditModal(task)}
                      >
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      )}
                      {canDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteTask(task.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                      )}
                    </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Task Create/Edit Modal */}
        <Modal
          isOpen={showTaskModal}
          onClose={() => setShowTaskModal(false)}
          title={editingTask ? 'Edit Task' : 'Create Task'}
        >
          <form onSubmit={handleSaveTask} className="space-y-4">
            <Input
              id="task-title"
              label="Title"
              placeholder="What needs to be done?"
              value={taskForm.title}
              onChange={(e) =>
                setTaskForm((prev) => ({ ...prev, title: e.target.value }))
              }
              required
            />

            <Textarea
              id="task-description"
              label="Description (optional)"
              placeholder="Add details..."
              value={taskForm.description}
              onChange={(e) =>
                setTaskForm((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
            />

            <div className="grid grid-cols-2 gap-4">
              <Select
                id="task-status"
                label="Status"
                options={[
                  { value: 'todo', label: 'To Do' },
                  { value: 'in_progress', label: 'In Progress' },
                  { value: 'done', label: 'Done' },
                ]}
                value={taskForm.status}
                onChange={(e) =>
                  setTaskForm((prev) => ({
                    ...prev,
                    status: e.target.value as TaskStatus,
                  }))
                }
              />

              <Select
                id="task-priority"
                label="Priority"
                options={PRIORITY_OPTIONS}
                value={taskForm.priority}
                onChange={(e) =>
                  setTaskForm((prev) => ({
                    ...prev,
                    priority: e.target.value as TaskPriority,
                  }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Assignees</label>
              <div className="border border-input rounded-md p-3 max-h-40 overflow-y-auto space-y-2 bg-background/50">
                {users.length === 0 && <p className="text-xs text-muted-foreground">No users available.</p>}
                {users.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded border-input text-primary focus:ring-primary h-4 w-4"
                      checked={taskForm.assigneeIds.includes(u.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setTaskForm((prev) => ({
                            ...prev,
                            assigneeIds: [...prev.assigneeIds, u.id],
                          }));
                        } else {
                          setTaskForm((prev) => ({
                            ...prev,
                            assigneeIds: prev.assigneeIds.filter((id) => id !== u.id),
                          }));
                        }
                      }}
                    />
                    <span className="text-sm">{u.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <Input
              id="task-due-date"
              label="Due Date (optional)"
              type="date"
              value={taskForm.dueDate}
              onChange={(e) =>
                setTaskForm((prev) => ({ ...prev, dueDate: e.target.value }))
              }
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowTaskModal(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingTask ? 'Save Changes' : 'Create Task'}
              </Button>
            </div>
          </form>
        </Modal>
      </main>
    </div>
  );
}
