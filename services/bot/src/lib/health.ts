/**
 * Health check HTTP server for container orchestration
 * Provides /health endpoint for Coolify, Kubernetes, etc.
 * Uses Node.js http module for cross-runtime compatibility
 */
import { createServer, type Server } from 'node:http';

export interface HealthServerOptions {
  port: number;
  serviceName?: string;
}

export interface HealthStatus {
  status: 'healthy' | 'starting' | 'unhealthy';
  service: string;
  timestamp: string;
}

export interface HealthServer {
  server: Server;
  isHealthy: boolean;
  isShuttingDown: boolean;
  setHealthy: (healthy: boolean) => void;
  setShuttingDown: (shuttingDown: boolean) => void;
  stop: () => void;
}

// Use a wrapper object to ensure state changes are visible in the closure
interface HealthState {
  isHealthy: boolean;
  isShuttingDown: boolean;
}

function getHealthStatus(state: HealthState): HealthStatus['status'] {
  if (state.isShuttingDown) return 'unhealthy';
  if (state.isHealthy) return 'healthy';
  return 'starting';
}

export function createHealthServer(options: HealthServerOptions): HealthServer {
  const { port, serviceName = 'meetsmatch-bot' } = options;
  const state: HealthState = { isHealthy: false, isShuttingDown: false };

  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`);

    if (url.pathname === '/health' || url.pathname === '/') {
      const status = getHealthStatus(state);
      const healthStatus: HealthStatus = {
        status,
        service: serviceName,
        timestamp: new Date().toISOString(),
      };
      const body = JSON.stringify(healthStatus);
      const httpStatus = status === 'healthy' ? 200 : 503;
      res.writeHead(httpStatus, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      });
      res.end(body);
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  server.listen(port);

  return {
    server,
    get isHealthy() {
      return state.isHealthy;
    },
    get isShuttingDown() {
      return state.isShuttingDown;
    },
    setHealthy(healthy: boolean) {
      state.isHealthy = healthy;
    },
    setShuttingDown(shuttingDown: boolean) {
      state.isShuttingDown = shuttingDown;
    },
    stop() {
      server.close();
    },
  };
}
