// Placeholder test utility functions

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { vi } from "vitest"; // Ensure vi is imported
import type { Profile, User } from "../../src/db/schema";

// Placeholder for a mock Drizzle database instance
export function createMockDb(): Partial<PostgresJsDatabase> {
  // Implement mock DB logic as needed, e.g., using vitest.fn()
  // For now, returning a minimal object to satisfy type checks
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    // Simulate the actual execution returning an empty array by default
    // You might need to adjust this based on specific test needs
    execute: vi.fn().mockResolvedValue([]),
    // Add other methods used in your queries as needed
  };
  // Explicitly cast to satisfy the complex Drizzle types
  return mockDb as unknown as Partial<PostgresJsDatabase>;
}

// Placeholder for creating a mock user
export function createMockUser(overrides: Partial<User> = {}): User {
  const defaultUser: User = {
    id: Math.random().toString(36).substring(2), // Simple unique ID
    telegramId: Math.floor(Math.random() * 1000000000),
    username: `testuser_${Math.random().toString(36).substring(7)}`,
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastActiveAt: new Date(),
  };
  return { ...defaultUser, ...overrides };
}

// Placeholder for creating a mock profile
export function createMockProfile(
  userId: string,
  overrides: Partial<Profile> = {}
): Profile {
  const defaultProfile: Profile = {
    id: Math.random().toString(36).substring(2),
    userId: userId,
    name: "Test User",
    age: 30,
    gender: "male",
    bio: "This is a test bio.",
    preferenceGender: "both",
    preferenceAgeMin: 25,
    preferenceAgeMax: 35,
    preferenceDistanceKm: 50,
    latitude: 34.0522,
    longitude: -118.2437,
    city: "Los Angeles",
    country: "USA",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  return { ...defaultProfile, ...overrides };
}
