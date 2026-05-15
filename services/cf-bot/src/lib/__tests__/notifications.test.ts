import { describe, it, expect, vi, beforeEach } from "vitest";
import { addNotification, getNotifications, clearNotifications, removeNotification } from "../notifications.js";

function mockKV() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string, _opts?: unknown) => { store.set(key, value); }),
    delete: vi.fn(async (key: string) => { store.delete(key); }),
    _store: store,
  };
}

function mockEnv(kv = mockKV()) {
  return {
    KV: kv as unknown as KVNamespace,
    DB: {} as D1Database,
    API_SERVICE: {} as Fetcher,
    BOT_TOKEN: "test",
  };
}

describe("Notification System", () => {
  let kv: ReturnType<typeof mockKV>;
  let env: ReturnType<typeof mockEnv>;

  beforeEach(() => {
    kv = mockKV();
    env = mockEnv(kv);
  });

  it("should add a like notification", async () => {
    await addNotification(env, "123", {
      type: "like",
      fromUserId: "456",
      fromDisplayName: "Alice",
      timestamp: new Date().toISOString(),
    });
    const notifications = await getNotifications(env, "123");
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe("like");
  });

  it("should add multiple notifications", async () => {
    await addNotification(env, "123", { type: "like", fromUserId: "456", fromDisplayName: "Alice", timestamp: "t1" });
    await addNotification(env, "123", { type: "like", fromUserId: "789", fromDisplayName: "Bob", timestamp: "t2" });
    const notifications = await getNotifications(env, "123");
    expect(notifications).toHaveLength(2);
  });

  it("should add a mutual match notification", async () => {
    await addNotification(env, "123", {
      type: "mutual_match",
      matchId: "m1",
      otherUserId: "456",
      otherDisplayName: "Alice",
      timestamp: "t1",
    });
    const notifications = await getNotifications(env, "123");
    expect(notifications[0].type).toBe("mutual_match");
  });

  it("should clear all notifications", async () => {
    await addNotification(env, "123", { type: "like", fromUserId: "456", fromDisplayName: "Alice", timestamp: "t1" });
    await clearNotifications(env, "123");
    const notifications = await getNotifications(env, "123");
    expect(notifications).toHaveLength(0);
  });

  it("should remove a notification by index", async () => {
    await addNotification(env, "123", { type: "like", fromUserId: "456", fromDisplayName: "Alice", timestamp: "t1" });
    await addNotification(env, "123", { type: "like", fromUserId: "789", fromDisplayName: "Bob", timestamp: "t2" });
    await removeNotification(env, "123", 0);
    const notifications = await getNotifications(env, "123");
    expect(notifications).toHaveLength(1);
    expect((notifications[0] as { fromDisplayName: string }).fromDisplayName).toBe("Bob");
  });

  it("should return empty array when no notifications exist", async () => {
    const notifications = await getNotifications(env, "123");
    expect(notifications).toEqual([]);
  });

  it("should handle corrupted KV data gracefully", async () => {
    kv._store.set("notifications:123", "not-json");
    const notifications = await getNotifications(env, "123");
    expect(notifications).toEqual([]);
  });
});
