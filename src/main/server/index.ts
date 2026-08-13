import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { trpcServer } from '@hono/trpc-server';
import { serve } from '@hono/node-server';
import { appRouter } from './trpc/router';
import { createContext } from './trpc/context';
import { createChildLogger } from '../lib/logger';

const logger = createChildLogger('http-server');

let server: ReturnType<typeof serve> | null = null;

/**
 * The API only ever serves this app's own renderer, so it listens on loopback
 * only. Binding the default (all interfaces) would expose meetings, transcripts
 * and the VideoDB API key to anything on the same network.
 */
const BIND_HOSTNAME = '127.0.0.1';

/**
 * Only the app's own renderer may call the API. Electron renderers load from
 * `file://` (origin `null`) in production and from the Vite dev server in
 * development, so accept those plus loopback origins on any port.
 */
function isAllowedOrigin(origin: string): string | null {
  if (!origin || origin === 'null') return origin || 'null';

  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== 'http:' && protocol !== 'https:') return null;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1') {
      return origin;
    }
  } catch {
    return null;
  }

  return null;
}

export function createServer(port: number) {
  const app = new Hono();

  // CORS middleware — loopback only (see isAllowedOrigin)
  app.use(
    '*',
    cors({
      origin: isAllowedOrigin,
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'x-access-token'],
    })
  );

  // Health check
  app.get('/api', (c) => {
    return c.json({
      status: 'ok',
      message: 'Call.md Server Running',
    });
  });

  // tRPC handler
  app.use(
    '/api/trpc/*',
    trpcServer({
      router: appRouter,
      endpoint: '/api/trpc',
      createContext: async (_opts, c) => createContext(c),
    })
  );

  return app;
}

let currentPort: number | undefined;

export async function startServer(port: number, maxRetries: number = 10): Promise<number> {
  if (server) {
    logger.warn('Server already running');
    return currentPort || port;
  }

  const app = createServer(port);

  const tryPort = (attemptPort: number, retriesLeft: number): Promise<number> => {
    return new Promise((resolve, reject) => {
      const serverInstance = serve(
        {
          fetch: app.fetch,
          port: attemptPort,
          hostname: BIND_HOSTNAME,
        },
        (info) => {
          server = serverInstance;
          currentPort = info.port;
          logger.info({ port: info.port, hostname: BIND_HOSTNAME }, 'HTTP server started');
          resolve(info.port);
        }
      );

      // Handle errors (like EADDRINUSE)
      serverInstance.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' && retriesLeft > 0) {
          logger.warn({ port: attemptPort }, 'Port in use, trying next port');
          serverInstance.close();
          resolve(tryPort(attemptPort + 1, retriesLeft - 1));
        } else {
          reject(err);
        }
      });
    });
  };

  return tryPort(port, maxRetries);
}

export async function stopServer(): Promise<void> {
  if (server) {
    logger.info('Stopping HTTP server');
    server.close();
    server = null;
  }
}

export function getServerStatus(): { running: boolean; port?: number } {
  return {
    running: !!server,
    port: currentPort,
  };
}
