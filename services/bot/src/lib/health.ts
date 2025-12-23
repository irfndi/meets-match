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
  setHealthy: (healthy: boolean) => void;
  stop: () => void;
}

// Use a wrapper object to ensure state changes are visible in the closure
interface HealthState {
  isHealthy: boolean;
}

export function createHealthServer(options: HealthServerOptions): HealthServer {
  const { port, serviceName = 'meetsmatch-bot' } = options;
  const state: HealthState = { isHealthy: false };

  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`);

    if (url.pathname === '/health' || url.pathname === '/') {
      const healthStatus: HealthStatus = {
        status: state.isHealthy ? 'healthy' : 'starting',
        service: serviceName,
        timestamp: new Date().toISOString(),
      };
      const body = JSON.stringify(healthStatus);
      res.writeHead(state.isHealthy ? 200 : 503, {
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
    setHealthy(healthy: boolean) {
      state.isHealthy = healthy;
    },
    stop() {
      server.close();
    },
  };
}
