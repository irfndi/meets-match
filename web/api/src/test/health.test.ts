import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import { healthRoutes } from '../routes/health'

const app = express()
app.use('/health', healthRoutes)

describe('Health Routes', () => {
  describe('GET /health', () => {
    it('should return basic health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200)

      expect(response.body).toEqual({
        success: true,
        data: {
          status: 'healthy',
          timestamp: expect.any(String),
          services: {
            database: expect.any(Boolean),
            redis: expect.any(Boolean)
          },
          uptime: expect.any(Number),
          version: expect.any(String)
        }
      })
    })
  })

  describe('GET /health/detailed', () => {
    it('should return detailed health information', async () => {
      const response = await request(app)
        .get('/health/detailed')

      expect(response.body).toHaveProperty('success')
      expect(response.body).toHaveProperty('data')
      expect(response.body.data).toHaveProperty('status')
      expect(response.body.data).toHaveProperty('timestamp')
      expect(response.body.data).toHaveProperty('uptime')
      expect(response.body.data).toHaveProperty('version')
      expect(response.body.data).toHaveProperty('responseTime')
      expect(response.body.data).toHaveProperty('services')
    })
  })

  describe('GET /health/ready', () => {
    it('should return readiness status', async () => {
      const response = await request(app)
        .get('/health/ready')

      expect(response.body).toHaveProperty('success')
      expect(response.body).toHaveProperty('data')
      expect(response.body.data).toHaveProperty('ready')
      expect(response.body.data).toHaveProperty('services')
      expect(response.body.data).toHaveProperty('timestamp')
    })
  })
})