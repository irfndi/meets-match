import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHealthServer, type HealthServer, type HealthStatus } from './health.js';

// Helper to wait for server to be listening
function waitForServer(server: HealthServer['server']): Promise<void> {
  return new Promise((resolve, reject) => {
    if (server.listening) {
      resolve();
      return;
    }
    server.once('listening', resolve);
    server.once('error', reject);
  });
}

// Helper to wait for server to fully close
function waitForClose(server: HealthServer['server']): Promise<void> {
  return new Promise((resolve) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.once('close', resolve);
  });
}

// Track port usage to avoid conflicts
let portCounter = 0;
const getUniquePort = () => 45000 + portCounter++;

describe('Health Server', { sequential: true }, () => {
  let healthServer: HealthServer;
  let testPort: number;

  beforeEach(async () => {
    testPort = getUniquePort();
    healthServer = createHealthServer({ port: testPort, serviceName: 'test-service' });
    await waitForServer(healthServer.server);
  });

  afterEach(async () => {
    healthServer.stop();
    await waitForClose(healthServer.server);
  });

  describe('health endpoint', () => {
    it('should return 503 with starting status when not healthy', async () => {
      const response = await fetch(`http://localhost:${testPort}/health`);
      expect(response.status).toBe(503);

      const body: HealthStatus = await response.json();
      expect(body.status).toBe('starting');
      expect(body.service).toBe('test-service');
      expect(body.timestamp).toBeDefined();
    });

    it('should return 200 with healthy status when healthy', async () => {
      healthServer.setHealthy(true);

      const response = await fetch(`http://localhost:${testPort}/health`);
      expect(response.status).toBe(200);

      const body: HealthStatus = await response.json();
      expect(body.status).toBe('healthy');
      expect(body.service).toBe('test-service');
    });

    it('should respond to root path the same as /health', async () => {
      healthServer.setHealthy(true);

      const response = await fetch(`http://localhost:${testPort}/`);
      expect(response.status).toBe(200);

      const body: HealthStatus = await response.json();
      expect(body.status).toBe('healthy');
    });

    it('should return 404 for unknown paths', async () => {
      const response = await fetch(`http://localhost:${testPort}/unknown`);
      expect(response.status).toBe(404);
    });

    it('should have correct content-type header', async () => {
      const response = await fetch(`http://localhost:${testPort}/health`);
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });
  });

  describe('health state management', () => {
    it('should start with isHealthy as false', () => {
      expect(healthServer.isHealthy).toBe(false);
    });

    it('should start with isShuttingDown as false', () => {
      expect(healthServer.isShuttingDown).toBe(false);
    });

    it('should update isHealthy when setHealthy is called', () => {
      healthServer.setHealthy(true);
      expect(healthServer.isHealthy).toBe(true);

      healthServer.setHealthy(false);
      expect(healthServer.isHealthy).toBe(false);
    });

    it('should update isShuttingDown when setShuttingDown is called', () => {
      healthServer.setShuttingDown(true);
      expect(healthServer.isShuttingDown).toBe(true);

      healthServer.setShuttingDown(false);
      expect(healthServer.isShuttingDown).toBe(false);
    });
  });

  describe('shutdown behavior', () => {
    it('should return 503 with unhealthy status when shutting down', async () => {
      healthServer.setHealthy(true);
      healthServer.setShuttingDown(true);

      const response = await fetch(`http://localhost:${testPort}/health`);
      expect(response.status).toBe(503);

      const body: HealthStatus = await response.json();
      expect(body.status).toBe('unhealthy');
    });

    it('should prioritize unhealthy status over healthy when shutting down', async () => {
      // Even if healthy is true, shutting down should return unhealthy
      healthServer.setHealthy(true);
      healthServer.setShuttingDown(true);

      const response = await fetch(`http://localhost:${testPort}/health`);
      const body: HealthStatus = await response.json();

      expect(body.status).toBe('unhealthy');
      expect(response.status).toBe(503);
    });
  });

  describe('default service name', () => {
    it('should use default service name when not provided', async () => {
      const defaultPort = getUniquePort();
      const defaultServer = createHealthServer({ port: defaultPort });
      await waitForServer(defaultServer.server);

      const response = await fetch(`http://localhost:${defaultPort}/health`);
      const body: HealthStatus = await response.json();

      expect(body.service).toBe('meetsmatch-bot');
      defaultServer.stop();
    });
  });
});
