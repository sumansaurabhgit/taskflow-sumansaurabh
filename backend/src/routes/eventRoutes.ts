import { Router, Request, Response } from 'express';
import { verifyToken } from '../utils/jwt';
import { sseManager } from '../utils/events';
import { logger } from '../utils/logger';

const router = Router();

router.get('/events', (req: Request, res: Response) => {
  logger.info('SSE /events endpoint hit');

  // EventSource API can't set headers, so accept token as query param
  const token = req.query.token as string | undefined;
  if (!token) {
    logger.warn('SSE request missing token');
    res.status(401).json({ error: 'missing token' });
    return;
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    logger.warn({ err }, 'SSE token verification failed');
    res.status(401).json({ error: 'invalid or expired token' });
    return;
  }

  logger.info({ userId: payload.userId }, 'SSE connection authenticated');

  // Disable request timeout and enable TCP no-delay for SSE
  req.socket.setTimeout(0);
  req.socket.setNoDelay(true);
  req.socket.setKeepAlive(true);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.status(200);
  res.flushHeaders();

  // Send initial connection event
  const connMsg = JSON.stringify({ message: 'connected', userId: payload.userId });
  res.write(`event: connected\ndata: ${connMsg}\n\n`);
  if (typeof (res as any).flush === 'function') {
    (res as any).flush();
  }
  logger.info({ userId: payload.userId }, 'SSE initial connected event sent');

  sseManager.subscribe(payload.userId, res);
});

export { router as eventRoutes };
