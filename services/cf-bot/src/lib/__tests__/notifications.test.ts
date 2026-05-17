import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  addNotification,
  getNotifications,
  clearNotifications,
  removeNotification,
  type LikeNotification,
} from "../notifications.js";

function mockKV() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string, _opts?: unknown) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
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
    expect(notifications[0].id).toBeDefined();
  });

  it("should add multiple notifications", async () => {
    await addNotification(env, "123", {
      type: "like",
      fromUserId: "456",
      fromDisplayName: "Alice",
      timestamp: "t1",
    });
    await addNotification(env, "123", {
      type: "like",
      fromUserId: "789",
      fromDisplayName: "Bob",
      timestamp: "t2",
    });
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
    await addNotification(env, "123", {
      type: "like",
      fromUserId: "456",
      fromDisplayName: "Alice",
      timestamp: "t1",
    });
    await clearNotifications(env, "123");
    const notifications = await getNotifications(env, "123");
    expect(notifications).toHaveLength(0);
  });

  it("should remove a notification by id", async () => {
    await addNotification(env, "123", {
      type: "like",
      fromUserId: "456",
      fromDisplayName: "Alice",
      timestamp: "t1",
    });
    await addNotification(env, "123", {
      type: "like",
      fromUserId: "789",
      fromDisplayName: "Bob",
      timestamp: "t2",
    });
    const before = await getNotifications(env, "123");
    expect(before).toHaveLength(2);

    await removeNotification(env, "123", before[0].id);
    const after = await getNotifications(env, "123");
    expect(after).toHaveLength(1);
    expect((after[0] as LikeNotification).fromDisplayName).toBe("Bob");
  });

  it("should remove the correct notification even with gaps in KV", async () => {
    await addNotification(env, "123", {
      type: "like",
      fromUserId: "456",
      fromDisplayName: "Alice",
      timestamp: "t1",
    });
    await addNotification(env, "123", {
      type: "like",
      fromUserId: "789",
      fromDisplayName: "Bob",
      timestamp: "t2",
    });
    await addNotification(env, "123", {
      type: "like",
      fromUserId: "999",
      fromDisplayName: "Carol",
      timestamp: "t3",
    });

    const all = await getNotifications(env, "123");
    expect(all).toHaveLength(3);

    // Simulate expiration of the middle notification's KV entry
    // but keep its id in the list
    const middleId = all[1].id;
    kv._store.delete(`notifications:123:${middleId}`);

    // getNotifications now returns 2 items, but removeNotification
    // should still correctly target by id
    const visible = await getNotifications(env, "123");
    expect(visible).toHaveLength(2);

    // Remove the last visible notification (Carol) by id
    await removeNotification(env, "123", all[2].id);
    const remaining = await getNotifications(env, "123");
    expect(remaining).toHaveLength(1);
    expect((remaining[0] as LikeNotification).fromDisplayName).toBe("Alice");
  });

  it("should migrate legacy single-key notifications", async () => {
    const legacy = [
      { type: "like", fromUserId: "456", fromDisplayName: "Alice", timestamp: "t1" },
      { type: "like", fromUserId: "789", fromDisplayName: "Bob", timestamp: "t2" },
    ];
    kv._store.set("notifications:123", JSON.stringify(legacy));

    const notifications = await getNotifications(env, "123");
    expect(notifications).toHaveLength(2);
    expect((notifications[0] as LikeNotification).fromDisplayName).toBe("Alice");
    expect((notifications[1] as LikeNotification).fromDisplayName).toBe("Bob");
    expect(notifications[0].id).toBeDefined();
    expect(notifications[1].id).toBeDefined();

    // Legacy key should be deleted and new list key should exist
    expect(kv._store.has("notifications:123")).toBe(false);
    expect(kv._store.has("notifications:list:123")).toBe(true);
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
