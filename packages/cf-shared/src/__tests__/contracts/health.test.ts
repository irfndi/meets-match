import { describe, it, expect } from "vitest";
import { Schema } from "effect";
import {
  HealthCheckRequest,
  HealthCheckResponse,
} from "../../contracts/health.js";

describe("Health Contracts", () => {
  describe("HealthCheckRequest", () => {
    it("should decode empty struct", () => {
      const result = Schema.decodeUnknownSync(HealthCheckRequest)({});
      expect(result).toEqual({});
    });

    it("should ignore extra fields", () => {
      const result = Schema.decodeUnknownSync(HealthCheckRequest)({
        extra: "field",
      });
      expect(result).toEqual({ extra: "field" });
    });
  });

  describe("HealthCheckResponse", () => {
    it("should decode valid response", () => {
      const result = Schema.decodeUnknownSync(HealthCheckResponse)({
        status: "ok",
      });
      expect(result.status).toBe("ok");
    });

    it("should decode response with different status value", () => {
      const result = Schema.decodeUnknownSync(HealthCheckResponse)({
        status: "degraded",
      });
      expect(result.status).toBe("degraded");
    });

    it("should reject response with missing status", () => {
      expect(() =>
        Schema.decodeUnknownSync(HealthCheckResponse)({}),
      ).toThrow();
    });

    it("should reject response with non-string status", () => {
      expect(() =>
        Schema.decodeUnknownSync(HealthCheckResponse)({ status: 200 }),
      ).toThrow();
    });

    it("should produce round-trip encode/decode", () => {
      const encoded = Schema.encodeSync(HealthCheckResponse)({
        status: "ok",
      });
      const decoded = Schema.decodeUnknownSync(HealthCheckResponse)(encoded);
      expect(decoded.status).toBe("ok");
    });
  });
});
