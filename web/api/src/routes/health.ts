import { Router, Request, Response } from 'express';
import { DatabaseService } from '../services/database';
import { RedisService } from '../services/redis';
import { HealthStatus, ApiResponse } from '../types';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// Get application version
const getVersion = (): string => {
  try {
    const packageJson = require('../../package.json');
    return packageJson.version || '1.0.0';
  } catch (error) {
    return '1.0.0';
  }
};

// Calculate uptime
const getUptime = (): number => {
  return process.uptime();
};

// Basic health check
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const response: ApiResponse<HealthStatus> = {
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: true,
        redis: true
      },
      uptime: getUptime(),
      version: getVersion()
    }
  };

  res.status(200).json(response);
}));

// Detailed health check with service status
router.get('/detailed', asyncHandler(async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  // Check database health
  const databaseHealthy = await DatabaseService.healthCheck();
  
  // Check Redis health
  const redisHealthy = await RedisService.healthCheck();
  
  const allServicesHealthy = databaseHealthy && redisHealthy;
  const responseTime = Date.now() - startTime;
  
  const healthStatus: HealthStatus = {
    status: allServicesHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    services: {
      database: databaseHealthy,
      redis: redisHealthy
    },
    uptime: getUptime(),
    version: getVersion()
  };

  const response: ApiResponse<HealthStatus & { responseTime: number }> = {
    success: allServicesHealthy,
    data: {
      ...healthStatus,
      responseTime
    }
  };

  const statusCode = allServicesHealthy ? 200 : 503;
  res.status(statusCode).json(response);
}));

// Database-specific health check
router.get('/database', asyncHandler(async (req: Request, res: Response) => {
  const startTime = Date.now();
  const isHealthy = await DatabaseService.healthCheck();
  const responseTime = Date.now() - startTime;
  
  const response: ApiResponse = {
    success: isHealthy,
    data: {
      service: 'database',
      status: isHealthy ? 'healthy' : 'unhealthy',
      responseTime,
      timestamp: new Date().toISOString()
    }
  };

  const statusCode = isHealthy ? 200 : 503;
  res.status(statusCode).json(response);
}));

// Redis-specific health check
router.get('/redis', asyncHandler(async (req: Request, res: Response) => {
  const startTime = Date.now();
  const isHealthy = await RedisService.healthCheck();
  const responseTime = Date.now() - startTime;
  
  const response: ApiResponse = {
    success: isHealthy,
    data: {
      service: 'redis',
      status: isHealthy ? 'healthy' : 'unhealthy',
      responseTime,
      timestamp: new Date().toISOString()
    }
  };

  const statusCode = isHealthy ? 200 : 503;
  res.status(statusCode).json(response);
}));

// Readiness probe (for Kubernetes)
router.get('/ready', asyncHandler(async (req: Request, res: Response) => {
  const databaseHealthy = await DatabaseService.healthCheck();
  const redisHealthy = await RedisService.healthCheck();
  
  const isReady = databaseHealthy && redisHealthy;
  
  const response: ApiResponse = {
    success: isReady,
    data: {
      ready: isReady,
      services: {
        database: databaseHealthy,
        redis: redisHealthy
      },
      timestamp: new Date().toISOString()
    }
  };

  const statusCode = isReady ? 200 : 503;
  res.status(statusCode).json(response);
}));

// Liveness probe (for Kubernetes)
router.get('/live', asyncHandler(async (req: Request, res: Response) => {
  const response: ApiResponse = {
    success: true,
    data: {
      alive: true,
      uptime: getUptime(),
      timestamp: new Date().toISOString()
    }
  };

  res.status(200).json(response);
}));

// System information
router.get('/info', asyncHandler(async (req: Request, res: Response) => {
  const memoryUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  
  const response: ApiResponse = {
    success: true,
    data: {
      version: getVersion(),
      uptime: getUptime(),
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      memory: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
        external: Math.round(memoryUsage.external / 1024 / 1024), // MB
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      timestamp: new Date().toISOString()
    }
  };

  res.status(200).json(response);
}));

export { router as healthRoutes };