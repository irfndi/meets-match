import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHealthServer, type HealthServer, type HealthStatus } from './health.js';

describe('Health Server', () => {
  let healthServer: HealthServer;
  // Use random port to avoid conflicts between parallel test runs
  const getRandomPort = () => 40000 + Math.floor(Math.random() * 10000);
  let testPort: number;

  beforeEach(() => {
    testPort = getRandomPort();
    healthServer = createHealthServer({ port: testPort, serviceName: 'test-service' });
  });

  afterEach(() => {
    healthServer.stop();
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

    it('should update isHealthy when setHealthy is called', () => {
      healthServer.setHealthy(true);
      expect(healthServer.isHealthy).toBe(true);

      healthServer.setHealthy(false);
      expect(healthServer.isHealthy).toBe(false);
    });
  });

  describe('default service name', () => {
    it('should use default service name when not provided', async () => {
      const defaultPort = getRandomPort();
      const defaultServer = createHealthServer({ port: defaultPort });

      const response = await fetch(`http://localhost:${defaultPort}/health`);
      const body: HealthStatus = await response.json();

      expect(body.service).toBe('meetsmatch-bot');
      defaultServer.stop();
    });
  });
});
