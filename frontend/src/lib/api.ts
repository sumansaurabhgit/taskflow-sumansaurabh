import axios from 'axios';
import type { AuthResponse, Project, Task, PaginatedResponse, User } from '../types';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach auth token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Redirect to login on 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // Only redirect if we're not already on the login page
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ---- Auth ----
export const authApi = {
  register: (data: { name: string; email: string; password: string }) =>
    api.post<AuthResponse>('/auth/register', data),

  login: (data: { email: string; password: string }) =>
    api.post<AuthResponse>('/auth/login', data),

  getUsers: () => api.get<{ data: User[] }>('/auth/users'),
};

// ---- Projects ----
export const projectsApi = {
  list: (cursor?: string) =>
    api.get<PaginatedResponse<Project>>('/projects', {
      params: cursor ? { cursor } : undefined,
    }),

  getById: (id: string) => api.get<Project>(`/projects/${id}`),

  create: (data: { name: string; description?: string }) =>
    api.post<Project>('/projects', data),

  update: (id: string, data: { name?: string; description?: string }) =>
    api.patch<Project>(`/projects/${id}`, data),

  delete: (id: string) => api.delete(`/projects/${id}`),

  getStats: (id: string) =>
    api.get<{ statusCounts: Array<{ status: string; _count: { id: number } }>; assigneeCounts: Array<{ userId: string; _count: { taskId: number } }> }>(`/projects/${id}/stats`),
};

// ---- Tasks ----
export const tasksApi = {
  listByProject: (
    projectId: string,
    params?: { status?: string; assignee?: string; cursor?: string }
  ) =>
    api.get<PaginatedResponse<Task>>(`/projects/${projectId}/tasks`, { params }),

  create: (
    projectId: string,
    data: {
      title: string;
      description?: string;
      status?: string;
      priority?: string;
      assigneeIds?: string[];
      dueDate?: string | null;
    }
  ) => api.post<Task>(`/projects/${projectId}/tasks`, data),

  update: (
    taskId: string,
    data: Partial<{
      title: string;
      description: string | null;
      status: string;
      priority: string;
      assigneeIds: string[];
      dueDate: string | null;
    }>
  ) => api.patch<Task>(`/tasks/${taskId}`, data),

  delete: (taskId: string) => api.delete(`/tasks/${taskId}`),
};

export default api;
