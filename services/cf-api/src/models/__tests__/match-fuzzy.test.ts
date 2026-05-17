import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { calculateMatchScore } from "../match.js";

describe("calculateMatchScore property-based tests", () => {
  const safeString = fc.string({ maxLength: 100 });
  const ageArb = fc.integer({ min: 18, max: 100 });

  it("always returns scores between 0 and 1", () => {
    fc.assert(
      fc.property(
        fc.record({
          id: safeString,
          interests: fc.array(safeString, { maxLength: 10 }),
          location: fc.option(
            fc.record({
              latitude: fc.float({ min: -90, max: 90, noNaN: true }),
              longitude: fc.float({ min: -180, max: 180, noNaN: true }),
            }),
          ),
          preferences: fc.option(
            fc.record({
              maxDistance: fc.float({ min: 1, max: 500, noNaN: true }),
              minAge: ageArb,
              maxAge: ageArb,
              genderPreference: fc.array(
                fc.constantFrom("male", "female", "non-binary"),
              ),
              relationshipType: fc.array(safeString),
            }),
          ),
        }),
        fc.record({
          id: safeString,
          interests: fc.array(safeString, { maxLength: 10 }),
          location: fc.option(
            fc.record({
              latitude: fc.float({ min: -90, max: 90, noNaN: true }),
              longitude: fc.float({ min: -180, max: 180, noNaN: true }),
            }),
          ),
          preferences: fc.option(
            fc.record({
              maxDistance: fc.float({ min: 1, max: 500, noNaN: true }),
              minAge: ageArb,
              maxAge: ageArb,
              genderPreference: fc.array(
                fc.constantFrom("male", "female", "non-binary"),
              ),
              relationshipType: fc.array(safeString),
            }),
          ),
          age: ageArb,
          gender: fc.constantFrom("male", "female", "non-binary"),
        }),
        (user1, user2) => {
          const score = calculateMatchScore(user1 as any, user2 as any);
          expect(score.total).toBeGreaterThanOrEqual(0);
          expect(score.total).toBeLessThanOrEqual(1);
          expect(score.location).toBeGreaterThanOrEqual(0);
          expect(score.location).toBeLessThanOrEqual(1);
          expect(score.interests).toBeGreaterThanOrEqual(0);
          expect(score.interests).toBeLessThanOrEqual(1);
          expect(score.preferences).toBeGreaterThanOrEqual(0);
          expect(score.preferences).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("returns perfect score for identical profiles with matching preferences", () => {
    const profile = {
      id: "u1",
      interests: ["music", "travel"],
      location: { latitude: 0, longitude: 0 },
      preferences: {
        maxDistance: 100,
        minAge: 25,
        maxAge: 25,
        genderPreference: ["female"],
        relationshipType: ["casual"],
      },
      age: 25,
      gender: "female",
    };
    const score = calculateMatchScore(profile as any, profile as any);
    expect(score.total).toBe(1);
  });

  it("returns 0 interests score when no common interests", () => {
    fc.assert(
      fc.property(
        fc.array(safeString, { maxLength: 5 }),
        fc.array(safeString, { maxLength: 5 }),
        (interests1, interests2) => {
          const user1 = {
            id: "u1",
            interests: interests1.filter((i) => !interests2.includes(i)),
          };
          const user2 = {
            id: "u2",
            interests: interests2.filter((i) => !interests1.includes(i)),
          };
          if (user1.interests.length === 0 || user2.interests.length === 0)
            return;
          const score = calculateMatchScore(user1 as any, user2 as any);
          expect(score.interests).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
