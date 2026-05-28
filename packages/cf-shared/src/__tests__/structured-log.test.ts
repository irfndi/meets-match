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

  it("serializes Error with stack trace", () => {
    const logger = createLogger("cf-api");
    const err = new Error("critical failure");
    logger.error("init", "Startup error", undefined, err);
    const entry = JSON.parse(logs[0].json);
    expect(entry.error).toBeDefined();
    expect(entry.error.name).toBe("Error");
    expect(entry.error.message).toBe("critical failure");
    expect(entry.error.stack).toBeDefined();
    expect(typeof entry.error.stack).toBe("string");
  });

  it("serializes Error subclasses with their name", () => {
    const logger = createLogger("cf-api");
    const typeErr = new TypeError("not a function");
    logger.error("validate", "Type error", undefined, typeErr);
    const entry = JSON.parse(logs[0].json);
    expect(entry.error.name).toBe("TypeError");
    expect(entry.error.message).toBe("not a function");
  });

  it("handles error with null context", () => {
    const logger = createLogger("cf-bot");
    const err = new Error("oops");
    logger.warn("handler", "Warning", undefined, err);
    const entry = JSON.parse(logs[0].json);
    expect(entry.level).toBe("warn");
    expect(entry.context).toBeUndefined();
    expect(entry.error.message).toBe("oops");
  });

  it("includes extra keys in context", () => {
    const logger = createLogger("cf-api");
    logger.info("search", "Query results", {
      userId: "123",
      queryTime: 42,
      cacheHit: true,
    });
    const entry = JSON.parse(logs[0].json);
    expect(entry.context.userId).toBe("123");
    expect(entry.context.queryTime).toBe(42);
    expect(entry.context.cacheHit).toBe(true);
  });

  it("each log level outputs to correct console method", () => {
    const logger = createLogger("test-svc");
    logger.error("op", "err");
    logger.warn("op", "warn");
    logger.info("op", "info");
    logger.debug("op", "debug");
    expect(logs).toHaveLength(4);
    expect(logs[0].level).toBe("error");
    expect(logs[1].level).toBe("warn");
    expect(logs[2].level).toBe("info");
    expect(logs[3].level).toBe("debug");
  });

  it("warn without error does not include error field", () => {
    const logger = createLogger("cf-worker");
    logger.warn("task", "Task delayed", { taskId: "42" });
    const entry = JSON.parse(logs[0].json);
    expect(entry.error).toBeUndefined();
    expect(entry.context.taskId).toBe("42");
  });

  it("info does not accept error parameter", () => {
    const logger = createLogger("cf-api");
    logger.info("op", "msg", { userId: "123" });
    const entry = JSON.parse(logs[0].json);
    expect(entry.error).toBeUndefined();
    expect(entry.context.userId).toBe("123");
  });
});
