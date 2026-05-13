import { describe, it, expect } from "vitest";
import { Schema } from "effect";
import {
  AppError,
  NotFoundError,
  ValidationError,
  DatabaseError,
} from "../errors.js";

describe("Errors", () => {
  describe("AppError schema", () => {
    it("should decode valid AppError", () => {
      const result = Schema.decodeUnknownSync(AppError)({
        code: "NOT_FOUND",
        message: "User not found",
        details: "User with id '123' does not exist",
      });
      expect(result.code).toBe("NOT_FOUND");
      expect(result.message).toBe("User not found");
      expect(result.details).toBe("User with id '123' does not exist");
    });

    it("should decode AppError without details", () => {
      const result = Schema.decodeUnknownSync(AppError)({
        code: "VALIDATION_ERROR",
        message: "Invalid input",
      });
      expect(result.code).toBe("VALIDATION_ERROR");
      expect(result.details).toBeUndefined();
    });

    it("should reject AppError with missing code", () => {
      expect(() =>
        Schema.decodeUnknownSync(AppError)({ message: "Error" }),
      ).toThrow();
    });

    it("should reject AppError with missing message", () => {
      expect(() =>
        Schema.decodeUnknownSync(AppError)({ code: "E001" }),
      ).toThrow();
    });
  });

  describe("NotFoundError", () => {
    it("should create error with entity and id", () => {
      const err = new NotFoundError("User", "123");
      expect(err._tag).toBe("NotFoundError");
      expect(err.entity).toBe("User");
      expect(err.id).toBe("123");
      expect(err.message).toBe("User not found: 123");
    });

    it("should be an instance of Error", () => {
      const err = new NotFoundError("Match", "456");
      expect(err).toBeInstanceOf(Error);
    });

    it("should have distinct _tag for discriminated union matching", () => {
      const err = new NotFoundError("Notification", "789");
      expect(err._tag).toBe("NotFoundError");
    });
  });

  describe("ValidationError", () => {
    it("should create error with field and message", () => {
      const err = new ValidationError("age", "must be a positive integer");
      expect(err._tag).toBe("ValidationError");
      expect(err.field).toBe("age");
      // message includes field via super() or constructor param — either behavior is valid
      expect(err.message).toContain("age");
    });

    it("should be an instance of Error", () => {
      const err = new ValidationError("email", "invalid format");
      expect(err).toBeInstanceOf(Error);
    });

    it("should have distinct _tag from other errors", () => {
      const notFound = new NotFoundError("User", "1");
      const validation = new ValidationError("email", "bad");
      expect(validation._tag).not.toBe(notFound._tag);
    });
  });

  describe("DatabaseError", () => {
    it("should create error with operation and cause", () => {
      const cause = new Error("connection refused");
      const err = new DatabaseError("INSERT", cause);
      expect(err._tag).toBe("DatabaseError");
      expect(err.operation).toBe("INSERT");
      expect(err.cause).toBe(cause);
      expect(err.message).toBe("Database error during INSERT");
    });

    it("should accept non-Error cause", () => {
      const err = new DatabaseError("SELECT", "unknown error");
      expect(err._tag).toBe("DatabaseError");
      expect(err.cause).toBe("unknown error");
    });
  });

  describe("Error discrimination (Effect catchTag pattern)", () => {
    it("should allow discriminating between error types", () => {
      const errors = [
        new NotFoundError("User", "1"),
        new ValidationError("name", "required"),
        new DatabaseError("QUERY", new Error("timeout")),
      ];

      const notFoundErrors = errors.filter(
        (e) => e._tag === "NotFoundError",
      );
      const validationErrors = errors.filter(
        (e) => e._tag === "ValidationError",
      );
      const databaseErrors = errors.filter(
        (e) => e._tag === "DatabaseError",
      );

      expect(notFoundErrors).toHaveLength(1);
      expect(validationErrors).toHaveLength(1);
      expect(databaseErrors).toHaveLength(1);
    });
  });
});
