import { useEffect, useRef, type ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ui/Toast';
import type { Task } from '../types';

/* ---- event bus for SSE events ---- */
type SSEListener = (event: string, data: any) => void;
const listeners = new Set<SSEListener>();

function emitLocal(event: string, data: any) {
  listeners.forEach((fn) => fn(event, data));
}

/* ---- App-level SSE provider: keeps one EventSource open while authenticated ---- */
export function SSEProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const { showToast } = useToast();

  useEffect(() => {
    if (!token) return;

    const apiUrl = import.meta.env.VITE_API_URL || '/api';
    const url = `${apiUrl}/events?token=${token}`;
    console.log('[SSE] Connecting to:', url);

    const eventSource = new EventSource(url);

    eventSource.onopen = () => {
      console.log('[SSE] Connection opened, readyState:', eventSource.readyState);
    };

    eventSource.addEventListener('connected', (e: MessageEvent) => {
      console.log('[SSE] Received connected event:', e.data);
    });

    eventSource.addEventListener('task.assigned', (e: MessageEvent) => {
      console.log('[SSE] Received task.assigned:', e.data);
      try {
        const payload = JSON.parse(e.data);
        emitLocal('task.assigned', payload);
        showToast(payload.message || 'You have been assigned a new task');
      } catch (err) {
        console.error('[SSE] Error parsing task.assigned:', err);
      }
    });

    eventSource.addEventListener('task.updated', (e: MessageEvent) => {
      console.log('[SSE] Received task.updated:', e.data);
      try {
        const payload = JSON.parse(e.data);
        emitLocal('task.updated', payload);
        showToast(payload.message || 'A task has been updated');
      } catch (err) {
        console.error('[SSE] Error parsing task.updated:', err);
      }
    });

    eventSource.addEventListener('task.deleted', (e: MessageEvent) => {
      console.log('[SSE] Received task.deleted:', e.data);
      try {
        const payload = JSON.parse(e.data);
        emitLocal('task.deleted', payload);
        showToast(payload.message || 'A task has been deleted');
      } catch (err) {
        console.error('[SSE] Error parsing task.deleted:', err);
      }
    });

    eventSource.onmessage = (e: MessageEvent) => {
      console.log('[SSE] Generic message event:', e.data);
    };

    eventSource.onerror = (e) => {
      console.error('[SSE] Error event, readyState:', eventSource.readyState, e);
    };

    return () => {
      console.log('[SSE] Closing connection');
      eventSource.close();
    };
  }, [token, showToast]);

  return children as any;
}

/* ---- Page-level hook: subscribe to SSE events for local state updates ---- */
interface SSEHandlers {
  onTaskAssigned?: (task: Task) => void;
  onTaskUpdated?: (task: Task) => void;
  onTaskDeleted?: (taskId: string) => void;
}

export function useSSE(handlers: SSEHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const listener: SSEListener = (event, data) => {
      if (event === 'task.assigned' && data.task) {
        handlersRef.current.onTaskAssigned?.(data.task);
      } else if (event === 'task.updated' && data.task) {
        handlersRef.current.onTaskUpdated?.(data.task);
      } else if (event === 'task.deleted' && data.taskId) {
        handlersRef.current.onTaskDeleted?.(data.taskId);
      }
    };
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);
}
