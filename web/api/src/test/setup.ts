import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import dotenv from 'dotenv'

// Load test environment variables
dotenv.config({ path: '.env.test' })

// Global test setup
beforeAll(async () => {
  // Setup test database connection, Redis, etc.
  console.log('Setting up test environment...')
})

afterAll(async () => {
  // Cleanup test resources
  console.log('Cleaning up test environment...')
})

beforeEach(() => {
  // Reset any global state before each test
})

afterEach(() => {
  // Cleanup after each test
})