import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLogger } from "../structured-log.js";

describe("structured logging", () => {
  const logs: Array<{ level: string; json: string }> = [];

  beforeEach(() => {
    logs.length = 0;
    vi.spyOn(console, "error").mockImplementation((...args) => {
      logs.push({ level: "error", json: String(args[0]) });
    });
    vi.spyOn(console, "warn").mockImplementation((...args) => {
      logs.push({ level: "warn", json: String(args[0]) });
    });
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push({ level: "info", json: String(args[0]) });
    });
    vi.spyOn(console, "debug").mockImplementation((...args) => {
      logs.push({ level: "debug", json: String(args[0]) });
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-17T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("creates a logger for a service", () => {
    const logger = createLogger("test-service");
    expect(logger).toHaveProperty("error");
    expect(logger).toHaveProperty("warn");
    expect(logger).toHaveProperty("info");
    expect(logger).toHaveProperty("debug");
  });

  it("logs error with correct structure", () => {
    const logger = createLogger("cf-api");
    logger.error("createUser", "User already exists", { userId: "123" });
    expect(logs).toHaveLength(1);
    const entry = JSON.parse(logs[0].json);
    expect(entry.level).toBe("error");
    expect(entry.service).toBe("cf-api");
    expect(entry.operation).toBe("createUser");
    expect(entry.message).toBe("User already exists");
    expect(entry.context).toEqual({ userId: "123" });
    expect(entry.timestamp).toBe("2026-05-17T12:00:00.000Z");
  });

  it("logs warn with optional error", () => {
    const logger = createLogger("cf-bot");
    const err = new Error("slow query");
    logger.warn("getMatches", "Query took long", { userId: "456" }, err);
    const entry = JSON.parse(logs[0].json);
    expect(entry.level).toBe("warn");
    expect(entry.service).toBe("cf-bot");
    expect(entry.error).toMatchObject({
      name: "Error",
      message: "slow query",
    });
  });

  it("logs info without error field", () => {
    const logger = createLogger("cf-worker");
    logger.info("cleanup", "Job complete", { deleted: 5 });
    const entry = JSON.parse(logs[0].json);
    expect(entry.level).toBe("info");
    expect(entry.error).toBeUndefined();
    expect(entry.context).toEqual({ deleted: 5 });
  });

  it("logs debug with context", () => {
    const logger = createLogger("cf-api");
    logger.debug("route", "Request received", { path: "/users" });
    const entry = JSON.parse(logs[0].json);
    expect(entry.level).toBe("debug");
    expect(entry.context).toEqual({ path: "/users" });
  });

  it("serializes non-Error exceptions", () => {
    const logger = createLogger("cf-api");
    logger.error("dbQuery", "Failed", undefined, "connection timeout");
    const entry = JSON.parse(logs[0].json);
    expect(entry.error).toEqual({
      name: "Unknown",
      message: "connection timeout",
    });
  });

  it("serializes numeric exceptions", () => {
    const logger = createLogger("cf-api");
    logger.error("dbQuery", "Failed", undefined, 500);
    const entry = JSON.parse(logs[0].json);
    expect(entry.error).toEqual({
      name: "Unknown",
      message: "500",
    });
  });

  it("omits context when not provided", () => {
    const logger = createLogger("cf-api");
    logger.info("ping", "pong");
    const entry = JSON.parse(logs[0].json);
    expect(entry.context).toBeUndefined();
  });
});
