import { Response } from 'express';
import { logger } from '../utils/logger';

export interface SSEPayload {
  type: 'task.assigned' | 'task.updated' | 'task.deleted';
  message: string;
  task?: unknown;
  taskId?: string;
}

class SSEManager {
  private subscribers: Map<string, Set<Response>> = new Map();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Heartbeat every 30 seconds to keep connections alive
    this.heartbeatInterval = setInterval(() => {
      for (const [, responses] of this.subscribers) {
        for (const res of responses) {
          res.write(`:ping\n\n`);
          if (typeof (res as any).flush === 'function') {
            (res as any).flush();
          }
        }
      }
    }, 30_000);
  }

  subscribe(userId: string, res: Response): void {
    let userSet = this.subscribers.get(userId);
    if (!userSet) {
      userSet = new Set();
      this.subscribers.set(userId, userSet);
    }
    userSet.add(res);
    logger.info({ userId, connections: userSet.size }, 'SSE client subscribed');

    res.on('close', () => {
      this.unsubscribe(userId, res);
    });
  }

  unsubscribe(userId: string, res: Response): void {
    const userSet = this.subscribers.get(userId);
    if (userSet) {
      userSet.delete(res);
      if (userSet.size === 0) {
        this.subscribers.delete(userId);
      }
      logger.info({ userId, connections: userSet.size }, 'SSE client unsubscribed');
    }
  }

  emitToUsers(userIds: string[], payload: SSEPayload): void {
    const data = JSON.stringify(payload);
    const seen = new Set<Response>();
    let sentCount = 0;

    logger.info({ type: payload.type, targetUserIds: userIds, totalSubscribers: this.subscribers.size }, 'SSE emitToUsers called');

    for (const userId of userIds) {
      const userSet = this.subscribers.get(userId);
      logger.info({ userId, hasConnections: !!userSet, connectionCount: userSet?.size ?? 0 }, 'SSE checking user connections');
      if (!userSet) continue;
      for (const res of userSet) {
        if (seen.has(res)) continue;
        seen.add(res);
        try {
          const written = res.write(`event: ${payload.type}\ndata: ${data}\n\n`);
          if (typeof (res as any).flush === 'function') {
            (res as any).flush();
          }
          logger.info({ userId, written, type: payload.type }, 'SSE event written to response');
          sentCount++;
        } catch (err) {
          logger.error({ userId, err }, 'SSE write failed');
        }
      }
    }
    logger.info({ type: payload.type, targetUsers: userIds.length, sent: sentCount }, 'SSE event emitted');
  }

  destroy(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }
}

export const sseManager = new SSEManager();
