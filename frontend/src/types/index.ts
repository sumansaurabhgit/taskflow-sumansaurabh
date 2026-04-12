export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  createdAt: string;
  owner: User;
  _count?: { tasks: number };
}

export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  projectId: string;
  creatorId: string;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  assignees: {
    userId: string;
    taskId: string;
    user: User;
  }[];
  creator: User;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
}

export interface ApiError {
  error: string;
  fields?: Record<string, string>;
}
