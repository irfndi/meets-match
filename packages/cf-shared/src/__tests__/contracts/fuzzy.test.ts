import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { Schema } from "effect";
import {
  User,
  Match,
  MatchStatus,
  Notification,
  NotificationStatus,
  NotificationType,
  NotificationChannel,
  Gender,
} from "../../contracts/index.js";

describe("contract property-based tests", () => {
  const safeString = fc.string({ maxLength: 100 });
  const ageArb = fc.integer({ min: 18, max: 100 });

  function decode<T>(schema: Schema.Schema<T>, data: unknown): boolean {
    const either = Schema.decodeUnknownEither(schema)(data);
    return either._tag === "Right";
  }

  describe("User schema", () => {
    it("accepts valid minimal users", () => {
      fc.assert(
        fc.property(
          fc.record({
            id: safeString,
          }),
          (data) => {
            expect(decode(User, data)).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("rejects users without required id", () => {
      fc.assert(
        fc.property(
          fc.record({
            age: ageArb,
          }),
          (data) => {
            expect(decode(User, data)).toBe(false);
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe("MatchStatus", () => {
    it("accepts only valid statuses", () => {
      for (const status of ["PENDING", "MATCHED", "REJECTED"]) {
        expect(decode(MatchStatus, status)).toBe(true);
      }
    });

    it("rejects invalid statuses", () => {
      fc.assert(
        fc.property(
          fc
            .string()
            .filter((s) => !["PENDING", "MATCHED", "REJECTED"].includes(s)),
          (status) => {
            expect(decode(MatchStatus, status)).toBe(false);
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe("Notification schema", () => {
    it("accepts valid minimal notifications", () => {
      fc.assert(
        fc.property(
          fc.record({
            id: safeString,
            userId: safeString,
            type: fc.constantFrom(
              "MUTUAL_MATCH",
              "NEW_LIKE",
              "WELCOME",
              "SYSTEM",
              "REENGAGEMENT_GENTLE",
            ),
          }),
          (data) => {
            expect(decode(Notification, data)).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("NotificationType", () => {
    it("round-trips through parse for valid types", () => {
      const validTypes = [
        "MUTUAL_MATCH",
        "NEW_LIKE",
        "WELCOME",
        "SYSTEM",
        "REENGAGEMENT_GENTLE",
      ];
      for (const type of validTypes) {
        expect(decode(NotificationType, type)).toBe(true);
      }
    });
  });

  describe("Gender", () => {
    it("accepts valid genders", () => {
      for (const g of ["male", "female", "other", "prefer_not_to_say"]) {
        expect(decode(Gender, g)).toBe(true);
      }
    });

    it("rejects invalid genders", () => {
      fc.assert(
        fc.property(
          fc
            .string()
            .filter(
              (s) =>
                !["male", "female", "other", "prefer_not_to_say"].includes(s),
            ),
          (g) => {
            expect(decode(Gender, g)).toBe(false);
          },
        ),
        { numRuns: 30 },
      );
    });
  });
});
