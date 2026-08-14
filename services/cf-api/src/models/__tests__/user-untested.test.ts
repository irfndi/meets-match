type TestRowValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | TestRowValue[]
  | { [key: string]: TestRowValue };

interface TestRow {
  [key: string]: TestRowValue;
}

interface TestCastInput {}

function castForTest<T>(value: TestCastInput): T {
  return value as T;
}

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { UserRepository } from "../user.js";
import { createMockD1, runEffect } from "@meetsmatch/cf-shared/testing";
import { NotFoundError, DatabaseError } from "@meetsmatch/cf-shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUserRow(overrides: TestRow = {}) {
  return {
    id: "u1",
    username: "testuser",
    first_name: "Test",
    last_name: "User",
    bio: "Hello world",
    age: 25,
    birth_date: "1999-01-01",
    gender: "female",
    interests: '["music","travel"]',
    media_urls: '[{"url":"https://example.com/p.jpg","type":"image"}]',
    location: '{"city":"NYC","country":"USA"}',
    preferences: '{"maxDistance":50}',
    is_active: 1,
    is_sleeping: 0,
    is_profile_complete: 1,
    phone_number: "+1234567890",
    language: "en",
    subscription_tier: "free",
    subscription_expires_at: null,
    daily_swipes_used: 3,
    daily_swipes_reset_at: "2025-06-01T00:00:00.000Z",
    daily_likes_used: 5,
    daily_likes_reset_at: "2025-06-01T00:00:00.000Z",
    daily_dislikes_used: 10,
    daily_dislikes_reset_at: "2025-06-01T00:00:00.000Z",
    daily_media_used: 2,
    daily_media_reset_at: "2025-06-01T00:00:00.000Z",
    referral_code: "REF123",
    referred_by: null,
    referral_count: 0,
    referral_bonus_swipes: 0,
    dm_credits: 5,
    hidden_from_matches: 0,
    media_deleted_at: null,
    last_interaction_at: "2025-06-01T00:00:00.000Z",
    created_at: "2025-01-01T00:00:00.000Z",
    updated_at: "2025-01-01T00:00:00.000Z",
    last_active: "2025-06-01T00:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// update()
// ---------------------------------------------------------------------------

describe("UserRepository update", () => {
  it("creates (upserts) when user does not exist", async () => {
    const db = createMockD1((sql, _values) => {
      // First SELECT id – user does not exist
      if (sql.includes("SELECT id FROM users WHERE id ="))
        return { results: [] };
      // INSERT
      if (sql.includes("INSERT INTO users (id, first_name)"))
        return { results: [], success: true };
      // UPDATE
      if (sql.includes("UPDATE users SET"))
        return { results: [], success: true };
      // Final SELECT *
      if (sql.includes("SELECT * FROM users WHERE id =")) {
        return {
          results: [{ id: "newUser", first_name: "Fresh", is_active: 1 }],
        };
      }
      return { results: [] };
    });
    const repo = new UserRepository(db);
    const result = await runEffect(
      repo.update({
        userId: "newUser",
        user: { id: "newUser", displayName: "Fresh" } as any,
        updateMask: ["displayName"],
      }),
    );
    expect(result.id).toBe("newUser");
    expect(result.displayName).toBe("Fresh");
  });

  it("updates all fields with dynamic field building", async () => {
    const db = createMockD1((sql, _values) => {
      if (sql.includes("SELECT id FROM users WHERE id ="))
        return { results: [{ id: "u1" }] };
      if (sql.includes("UPDATE users SET"))
        return { results: [], success: true };
      if (sql.includes("SELECT preferences FROM users")) {
        return { results: [{ preferences: '{"oldPref":true}' }] };
      }
      if (sql.includes("SELECT * FROM users WHERE id =")) {
        return { results: [makeUserRow()] };
      }
      return { results: [] };
    });
    const repo = new UserRepository(db);
    const result = await runEffect(
      repo.update({
        userId: "u1",
        user: {
          id: "u1",
          username: "updated",
          displayName: "Updated",
          lastName: "User2",
          bio: "New bio",
          birthDate: "2000-01-01",
          gender: "male",
          interests: ["coding"],
          mediaUrls: [{ url: "x.jpg", type: "image" }],
          location: { city: "LA" },
          preferences: { maxDistance: 100 },
          isActive: false,
          isSleeping: true,
          isProfileComplete: true,
          phoneNumber: "+999",
          language: "fr",
          subscriptionTier: "premium",
          subscriptionExpiresAt: "2026-01-01",
          dailySwipesUsed: 5,
          dailySwipesResetAt: "2025-06-01",
          referralCode: "NEWREF",
          referredBy: "u2",
          referralCount: 3,
          referralBonusSwipes: 10,
        } as any,
        updateMask: [],
      }),
    );
    expect(result.id).toBe("u1");
  });

  it("returns early when fields is empty", async () => {
    const db = createMockD1((sql, _values) => {
      if (sql.includes("SELECT id FROM users WHERE id ="))
        return { results: [{ id: "u1" }] };
      if (sql.includes("SELECT * FROM users WHERE id =")) {
        return { results: [makeUserRow()] };
      }
      return { results: [] };
    });
    const repo = new UserRepository(db);
    const result = await runEffect(
      repo.update({
        userId: "u1",
        user: { id: "u1" } as any,
        updateMask: [],
      }),
    );
    expect(result.id).toBe("u1");
  });

  it("merges existing preferences", async () => {
    const db = createMockD1((sql, _values) => {
      if (sql.includes("SELECT id FROM users WHERE id ="))
        return { results: [{ id: "u1" }] };
      if (sql.includes("SELECT preferences FROM users")) {
        return {
          results: [{ preferences: '{"existing":true,"maxDistance":20}' }],
        };
      }
      if (sql.includes("UPDATE users SET")) {
        const captured = castForTest<{
          _captured: Array<{ sql: string; values: unknown[] }>;
        }>(db)._captured;
        const updateCall = captured.at(-1);
        if (updateCall && updateCall.sql.includes("UPDATE users SET")) {
          const prefsIdx = updateCall.values.findIndex((v) =>
            String(v).includes("existing"),
          );
          expect(prefsIdx).toBeGreaterThanOrEqual(0);
        }
        return { results: [], success: true };
      }
      if (sql.includes("SELECT * FROM users WHERE id =")) {
        return { results: [makeUserRow()] };
      }
      return { results: [] };
    });
    const repo = new UserRepository(db);
    const result = await runEffect(
      repo.update({
        userId: "u1",
        user: {
          id: "u1",
          preferences: { newPref: true },
        } as any,
        updateMask: ["preferences"],
      }),
    );
    expect(result.id).toBe("u1");
  });

  it("handles malformed JSON in preferences", async () => {
    const db = createMockD1((sql, _values) => {
      if (sql.includes("SELECT id FROM users WHERE id ="))
        return { results: [{ id: "u1" }] };
      if (sql.includes("SELECT preferences FROM users")) {
        return { results: [{ preferences: "not-json" }] };
      }
      if (sql.includes("UPDATE users SET"))
        return { results: [], success: true };
      if (sql.includes("SELECT * FROM users WHERE id =")) {
        return { results: [makeUserRow()] };
      }
      return { results: [] };
    });
    const repo = new UserRepository(db);
    const result = await runEffect(
      repo.update({
        userId: "u1",
        user: {
          id: "u1",
          preferences: { merged: true },
        } as any,
        updateMask: ["preferences"],
      }),
    );
    expect(result.id).toBe("u1");
  });

  it("computes age from birthDate in update", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15"));
    const db = createMockD1((sql, _values) => {
      if (sql.includes("SELECT id FROM users WHERE id ="))
        return { results: [{ id: "u1" }] };
      if (sql.includes("UPDATE users SET"))
        return { results: [], success: true };
      if (sql.includes("SELECT * FROM users WHERE id =")) {
        return { results: [makeUserRow()] };
      }
      return { results: [] };
    });
    const repo = new UserRepository(db);
    await runEffect(
      repo.update({
        userId: "u1",
        user: {
          id: "u1",
          birthDate: "2000-01-15",
        } as any,
        updateMask: ["birthDate"],
      }),
    );
    const updateCall = db._captured.findLast(
      (c) => c.sql.includes("UPDATE users SET") && c.values.length > 0,
    );
    const ageIdx = updateCall?.values.findIndex(
      (v) => Number(v) >= 20 && Number(v) <= 30,
    );
    expect(ageIdx).toBeGreaterThanOrEqual(0);
    vi.useRealTimers();
  });

  it("throws NotFoundError when final read returns nothing", async () => {
    const db = createMockD1((sql, _values) => {
      if (sql.includes("SELECT id FROM users WHERE id ="))
        return { results: [{ id: "u1" }] };
      if (sql.includes("UPDATE users SET"))
        return { results: [], success: true };
      if (sql.includes("SELECT * FROM users WHERE id ="))
        return { results: [] };
      return { results: [] };
    });
    const repo = new UserRepository(db);
    await expect(
      runEffect(
        repo.update({
          userId: "u1",
          user: { id: "u1", bio: "test" } as any,
          updateMask: ["bio"],
        }),
      ),
    ).rejects.toThrow(NotFoundError);
  });
});

// ---------------------------------------------------------------------------
// getOrCreateReferralCode
// ---------------------------------------------------------------------------

describe("UserRepository getOrCreateReferralCode", () => {
  it("returns existing referral code", async () => {
    const db = createMockD1((sql, _values) => {
      if (sql.includes("SELECT referral_code FROM users")) {
        return { results: [{ referral_code: "ABC123" }] };
      }
      return { results: [] };
    });
    const repo = new UserRepository(db);
    const code = await runEffect(repo.getOrCreateReferralCode("u1"));
    expect(code).toBe("ABC123");
  });

  it("generates and saves new referral code when empty", async () => {
    const db = createMockD1((sql, _values) => {
      if (sql.includes("SELECT referral_code FROM users")) {
        return { results: [{ referral_code: "" }] };
      }
      if (sql.includes("UPDATE users SET referral_code")) {
        return { results: [], success: true };
      }
      return { results: [] };
    });
    const repo = new UserRepository(db);
    const code = await runEffect(repo.getOrCreateReferralCode("u1"));
    expect(code).toBeTruthy();
    expect(code.length).toBeGreaterThanOrEqual(4);
  });

  it("throws NotFoundError when user missing", async () => {
    const db = createMockD1(() => ({ results: [] }));
    const repo = new UserRepository(db);
    await expect(
      runEffect(repo.getOrCreateReferralCode("nope")),
    ).rejects.toThrow(NotFoundError);
  });
});

// ---------------------------------------------------------------------------
// applyReferral
// ---------------------------------------------------------------------------

describe("UserRepository applyReferral", () => {
  function createReferralDb(
    selfRow: TestRow | null,
    referrerRow: TestRow | null = null,
  ) {
    return createMockD1((sql, _values) => {
      if (
        sql.includes("SELECT referral_code, referred_by FROM users WHERE id =")
      ) {
        return { results: selfRow ? [selfRow] : [] };
      }
      if (
        sql.includes(
          "SELECT id, referral_count, referral_bonus_swipes FROM users WHERE referral_code =",
        )
      ) {
        return { results: referrerRow ? [referrerRow] : [] };
      }
      return { results: [], success: true };
    });
  }

  it("rejects invalid short code", async () => {
    const repo = new UserRepository(createReferralDb({ referral_code: "ABC" }));
    const result = await runEffect(repo.applyReferral("u1", "AB"));
    expect(result.success).toBe(false);
    expect(result.message).toContain("Invalid");
  });

  it("rejects self-referral", async () => {
    const repo = new UserRepository(
      createReferralDb({ referral_code: "ABC123" }),
    );
    const result = await runEffect(repo.applyReferral("u1", "ABC123"));
    expect(result.success).toBe(false);
    expect(result.message).toContain("own referral code");
  });

  it("rejects when already referred", async () => {
    const repo = new UserRepository(
      createReferralDb({ referral_code: "ABC123", referred_by: "someone" }),
    );
    const result = await runEffect(repo.applyReferral("u1", "XYZ456"));
    expect(result.success).toBe(false);
    expect(result.message).toContain("already used");
  });

  it("rejects when referrer code not found", async () => {
    const repo = new UserRepository(
      createReferralDb({ referral_code: "ABC123" }, null),
    );
    const result = await runEffect(repo.applyReferral("u1", "XYZ456"));
    expect(result.success).toBe(false);
    expect(result.message).toContain("not found");
  });

  it("applies referral successfully", async () => {
    const db = createMockD1((sql) => {
      if (
        sql.includes("SELECT referral_code, referred_by FROM users WHERE id =")
      ) {
        return { results: [{ referral_code: "MYCODE", referred_by: null }] };
      }
      if (
        sql.includes(
          "SELECT id, referral_count, referral_bonus_swipes FROM users WHERE referral_code =",
        )
      ) {
        return {
          results: [
            { id: "ref1", referral_count: 2, referral_bonus_swipes: 5 },
          ],
        };
      }
      return { results: [], success: true };
    });
    const repo = new UserRepository(db);
    const result = await runEffect(repo.applyReferral("u1", "XYZ456"));
    expect(result.success).toBe(true);
    expect(result.message).toContain("+5 bonus swipes");
  });

  it("throws NotFoundError when self user does not exist", async () => {
    const db = createMockD1(() => ({ results: [] }));
    const repo = new UserRepository(db);
    await expect(runEffect(repo.applyReferral("nope", "CODE"))).rejects.toThrow(
      NotFoundError,
    );
  });
});

// ---------------------------------------------------------------------------
// getSwipeStatus
// ---------------------------------------------------------------------------

describe("UserRepository getSwipeStatus", () => {
  const today = "2025-06-01T00:00:00.000Z";

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(today));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns swipe status for free user", async () => {
    const db = createMockD1((sql) => {
      if (sql.includes("SELECT subscription_tier, daily_swipes_used")) {
        return {
          results: [
            {
              subscription_tier: "free",
              daily_swipes_used: 5,
              daily_swipes_reset_at: today,
              referral_bonus_swipes: 0,
            },
          ],
        };
      }
      return { results: [], success: true };
    });
    const repo = new UserRepository(db);
    const result = await runEffect(repo.getSwipeStatus("u1"));
    expect(result.remaining).toBe(5); // 10 - 5
    expect(result.total).toBe(10);
    expect(result.tier).toBe("free");
  });

  it("returns unlimited for premium user", async () => {
    const db = createMockD1((sql) => {
      if (sql.includes("SELECT subscription_tier, daily_swipes_used")) {
        return {
          results: [
            {
              subscription_tier: "premium",
              daily_swipes_used: 50,
              daily_swipes_reset_at: today,
              referral_bonus_swipes: 0,
            },
          ],
        };
      }
      return { results: [], success: true };
    });
    const repo = new UserRepository(db);
    const result = await runEffect(repo.getSwipeStatus("u1"));
    expect(result.total).toBe(9999);
  });

  it("resets daily counter when resetAt is old", async () => {
    const db = createMockD1((sql) => {
      if (sql.includes("SELECT subscription_tier, daily_swipes_used")) {
        return {
          results: [
            {
              subscription_tier: "free",
              daily_swipes_used: 10,
              daily_swipes_reset_at: "2025-05-30T00:00:00.000Z",
              referral_bonus_swipes: 0,
            },
          ],
        };
      }
      return { results: [], success: true };
    });
    const repo = new UserRepository(db);
    const result = await runEffect(repo.getSwipeStatus("u1"));
    expect(result.remaining).toBe(10); // reset -> 0 used
    expect(result.tier).toBe("free");
  });

  it("adds bonus swipes to total", async () => {
    const db = createMockD1((sql) => {
      if (sql.includes("SELECT subscription_tier, daily_swipes_used")) {
        return {
          results: [
            {
              subscription_tier: "free",
              daily_swipes_used: 0,
              daily_swipes_reset_at: today,
              referral_bonus_swipes: 5,
            },
          ],
        };
      }
      return { results: [], success: true };
    });
    const repo = new UserRepository(db);
    const result = await runEffect(repo.getSwipeStatus("u1"));
    expect(result.total).toBe(15); // 10 + 5 bonus
  });

  it("throws NotFoundError when user missing", async () => {
    const db = createMockD1(() => ({ results: [] }));
    const repo = new UserRepository(db);
    await expect(runEffect(repo.getSwipeStatus("nope"))).rejects.toThrow(
      NotFoundError,
    );
  });
});

// ---------------------------------------------------------------------------
// recordSwipe at-limit
// ---------------------------------------------------------------------------

describe("UserRepository recordSwipe edge cases", () => {
  const today = "2025-06-01T00:00:00.000Z";

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(today));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns zero remaining when at limit", async () => {
    const db = createMockD1((sql) => {
      if (sql.includes("SELECT subscription_tier, daily_swipes_used")) {
        return {
          results: [
            {
              subscription_tier: "free",
              daily_swipes_used: 10,
              daily_swipes_reset_at: today,
              referral_bonus_swipes: 0,
            },
          ],
        };
      }
      return { results: [], success: true };
    });
    const repo = new UserRepository(db);
    const result = await runEffect(repo.recordSwipe("u1"));
    expect(result.remaining).toBe(0);
    expect(result.total).toBe(10);
  });

  it("resets counter when resetAt is stale", async () => {
    const db = createMockD1((sql) => {
      if (sql.includes("SELECT subscription_tier, daily_swipes_used")) {
        return {
          results: [
            {
              subscription_tier: "free",
              daily_swipes_used: 10,
              daily_swipes_reset_at: "2025-05-30T00:00:00.000Z",
              referral_bonus_swipes: 0,
            },
          ],
        };
      }
      if (sql.includes("UPDATE users SET daily_swipes_used")) {
        return { results: [], success: true };
      }
      return { results: [] };
    });
    const repo = new UserRepository(db);
    const result = await runEffect(repo.recordSwipe("u1"));
    expect(result.remaining).toBe(9); // 10 - 1 after reset
  });
});

// ---------------------------------------------------------------------------
// getInteractionStatus edge cases
// ---------------------------------------------------------------------------

describe("UserRepository getInteractionStatus edge cases", () => {
  const today = "2025-06-01T00:00:00.000Z";

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(today));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resets both likes and dislikes when both are stale", async () => {
    const db = createMockD1((sql) => {
      if (sql.includes("SELECT subscription_tier, daily_likes_used")) {
        return {
          results: [
            {
              subscription_tier: "free",
              daily_likes_used: 15,
              daily_likes_reset_at: "2025-05-30T00:00:00.000Z",
              daily_dislikes_used: 35,
              daily_dislikes_reset_at: "2025-05-30T00:00:00.000Z",
              referral_bonus_swipes: 0,
            },
          ],
        };
      }
      return { results: [], success: true };
    });
    const repo = new UserRepository(db);
    const result = await runEffect(repo.getInteractionStatus("u1"));
    expect(result.likesRemaining).toBe(15);
    expect(result.dislikesRemaining).toBe(35);
  });

  it("returns premium limits for premium_plus tier", async () => {
    const db = createMockD1((sql) => {
      if (sql.includes("SELECT subscription_tier, daily_likes_used")) {
        return {
          results: [
            {
              subscription_tier: "premium_plus",
              daily_likes_used: 5,
              daily_likes_reset_at: today,
              daily_dislikes_used: 10,
              daily_dislikes_reset_at: today,
              referral_bonus_swipes: 0,
            },
          ],
        };
      }
      return { results: [], success: true };
    });
    const repo = new UserRepository(db);
    const result = await runEffect(repo.getInteractionStatus("u1"));
    expect(result.likesTotal).toBe(9999);
    expect(result.dislikesTotal).toBe(9999);
  });
});

// ---------------------------------------------------------------------------
// recordDislike at-limit
// ---------------------------------------------------------------------------

describe("UserRepository recordDislike edge cases", () => {
  const today = "2025-06-01T00:00:00.000Z";

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(today));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns zero remaining when dislike limit reached", async () => {
    const db = createMockD1((sql) => {
      if (sql.includes("SELECT subscription_tier, daily_dislikes_used")) {
        return {
          results: [
            {
              subscription_tier: "free",
              daily_dislikes_used: 35,
              daily_dislikes_reset_at: today,
              referral_bonus_swipes: 0,
            },
          ],
        };
      }
      return { results: [] };
    });
    const repo = new UserRepository(db);
    const result = await runEffect(repo.recordDislike("u1"));
    expect(result.remaining).toBe(0);
    expect(result.total).toBe(35);
  });

  it("resets dislike counter when stale", async () => {
    const db = createMockD1((sql) => {
      if (sql.includes("SELECT subscription_tier, daily_dislikes_used")) {
        return {
          results: [
            {
              subscription_tier: "free",
              daily_dislikes_used: 35,
              daily_dislikes_reset_at: "2025-05-30T00:00:00.000Z",
              referral_bonus_swipes: 0,
            },
          ],
        };
      }
      if (sql.includes("UPDATE users SET daily_dislikes_used")) {
        return { results: [], success: true };
      }
      return { results: [] };
    });
    const repo = new UserRepository(db);
    const result = await runEffect(repo.recordDislike("u1"));
    expect(result.remaining).toBe(34); // 35 - 1 after reset
  });
});

// ---------------------------------------------------------------------------
// getDMStatus
// ---------------------------------------------------------------------------

describe("UserRepository getDMStatus", () => {
  it("returns DM status for free user with credits", async () => {
    const db = createMockD1((sql) => {
      if (sql.includes("SELECT subscription_tier, dm_credits FROM users")) {
        return {
          results: [{ subscription_tier: "free", dm_credits: 3 }],
        };
      }
      return { results: [] };
    });
    const repo = new UserRepository(db);
    const result = await runEffect(repo.getDMStatus("u1"));
    expect(result.canSendDM).toBe(true);
    expect(result.tier).toBe("free");
    expect(result.dmCredits).toBe(3);
  });

  it("returns cannot send DM for free user with no credits", async () => {
    const db = createMockD1((sql) => {
      if (sql.includes("SELECT subscription_tier, dm_credits FROM users")) {
        return {
          results: [{ subscription_tier: "free", dm_credits: 0 }],
        };
      }
      return { results: [] };
    });
    const repo = new UserRepository(db);
    const result = await runEffect(repo.getDMStatus("u1"));
    expect(result.canSendDM).toBe(false);
  });

  it("always can send DM for premium user", async () => {
    const db = createMockD1((sql) => {
      if (sql.includes("SELECT subscription_tier, dm_credits FROM users")) {
        return {
          results: [{ subscription_tier: "premium", dm_credits: 0 }],
        };
      }
      return { results: [] };
    });
    const repo = new UserRepository(db);
    const result = await runEffect(repo.getDMStatus("u1"));
    expect(result.canSendDM).toBe(true);
  });

  it("throws NotFoundError when user missing", async () => {
    const db = createMockD1(() => ({ results: [] }));
    const repo = new UserRepository(db);
    await expect(runEffect(repo.getDMStatus("nope"))).rejects.toThrow(
      NotFoundError,
    );
  });
});

// ---------------------------------------------------------------------------
// useDMCredit
// ---------------------------------------------------------------------------

describe("UserRepository useDMCredit", () => {
  it("deducts credit for free user", async () => {
    const db = createMockD1((sql) => {
      if (sql.includes("SELECT subscription_tier, dm_credits FROM users")) {
        return {
          results: [{ subscription_tier: "free", dm_credits: 2 }],
        };
      }
      return { results: [], success: true };
    });
    const repo = new UserRepository(db);
    const result = await runEffect(repo.useDMCredit("u1"));
    expect(result.success).toBe(true);
    expect(result.dmCredits).toBe(1);
  });

  it("allows premium users without deduction", async () => {
    const db = createMockD1((sql) => {
      if (sql.includes("SELECT subscription_tier, dm_credits FROM users")) {
        return {
          results: [{ subscription_tier: "premium", dm_credits: 5 }],
        };
      }
      return { results: [] };
    });
    const repo = new UserRepository(db);
    const result = await runEffect(repo.useDMCredit("u1"));
    expect(result.success).toBe(true);
    expect(result.dmCredits).toBe(5);
  });

  it("returns failure when no credits", async () => {
    const db = createMockD1((sql) => {
      if (sql.includes("SELECT subscription_tier, dm_credits FROM users")) {
        return {
          results: [{ subscription_tier: "free", dm_credits: 0 }],
        };
      }
      return { results: [] };
    });
    const repo = new UserRepository(db);
    const result = await runEffect(repo.useDMCredit("u1"));
    expect(result.success).toBe(false);
    expect(result.dmCredits).toBe(0);
  });

  it("throws NotFoundError when user missing", async () => {
    const db = createMockD1(() => ({ results: [] }));
    const repo = new UserRepository(db);
    await expect(runEffect(repo.useDMCredit("nope"))).rejects.toThrow(
      NotFoundError,
    );
  });
});

// ---------------------------------------------------------------------------
// grantDMCredits (atomic charge claim + credit grant)
// ---------------------------------------------------------------------------

describe("UserRepository grantDMCredits", () => {
  function grantHandler(updateChanges: number) {
    return createMockD1((sql) => {
      if (sql.includes("SELECT id FROM users WHERE id =")) {
        return { results: [{ id: "u1" }] };
      }
      if (sql.includes("UPDATE users SET dm_credits")) {
        return { success: true, meta: { changes: updateChanges } };
      }
      if (sql.includes("INSERT OR IGNORE INTO payment_charges")) {
        return { success: true, meta: { changes: 1 } };
      }
      if (sql.includes("SELECT dm_credits FROM users")) {
        return { results: [{ dm_credits: 15 }] };
      }
      return { results: [], success: true, meta: {} };
    });
  }

  it("grants credits and returns granted true when charge newly claimed", async () => {
    const repo = new UserRepository(grantHandler(1));
    const result = await runEffect(repo.grantDMCredits("u1", 10, "charge_1"));
    expect(result.granted).toBe(true);
    expect(result.dmCredits).toBe(15);
  });

  it("returns granted false (no double grant) when charge already claimed", async () => {
    const repo = new UserRepository(grantHandler(0));
    const result = await runEffect(repo.grantDMCredits("u1", 10, "charge_1"));
    expect(result.granted).toBe(false);
  });

  it("throws NotFoundError when user missing", async () => {
    const db = createMockD1(() => ({ results: [] }));
    const repo = new UserRepository(db);
    await expect(
      runEffect(repo.grantDMCredits("nope", 10, "charge_1")),
    ).rejects.toThrow(NotFoundError);
  });

  it("is a single atomic batch (grant + claim + readback)", async () => {
    const db = grantHandler(1);
    const r = new UserRepository(db);
    await runEffect(r.grantDMCredits("u1", 10, "charge_1"));
    expect(db.batch).toHaveBeenCalledTimes(1);
    const statements = (db.batch as any).mock.calls[0][0];
    expect(statements.length).toBe(3);
    expect(statements[0]._sql).toContain("UPDATE users SET dm_credits");
    expect(statements[0]._sql).toContain("NOT EXISTS");
    expect(statements[1]._sql).toContain(
      "INSERT OR IGNORE INTO payment_charges",
    );
    expect(statements[2]._sql).toContain("SELECT dm_credits");
  });
});

// ---------------------------------------------------------------------------
// grantPremium (atomic charge claim + subscription grant)
// ---------------------------------------------------------------------------

describe("UserRepository grantPremium", () => {
  function premiumHandler(updateChanges: number) {
    return createMockD1((sql) => {
      if (sql.includes("SELECT id FROM users WHERE id =")) {
        return { results: [{ id: "u1" }] };
      }
      if (sql.includes("UPDATE users SET subscription_tier")) {
        return { success: true, meta: { changes: updateChanges } };
      }
      if (sql.includes("INSERT OR IGNORE INTO payment_charges")) {
        return { success: true, meta: { changes: 1 } };
      }
      return { results: [], success: true, meta: {} };
    });
  }

  it("grants premium and returns granted true when charge newly claimed", async () => {
    const repo = new UserRepository(premiumHandler(1));
    const result = await runEffect(
      repo.grantPremium("u1", "premium", "2026-09-01T00:00:00.000Z", "chg_p"),
    );
    expect(result.granted).toBe(true);
  });

  it("returns granted false (no double grant) when charge already claimed", async () => {
    const repo = new UserRepository(premiumHandler(0));
    const result = await runEffect(
      repo.grantPremium("u1", "premium", "2026-09-01T00:00:00.000Z", "chg_p"),
    );
    expect(result.granted).toBe(false);
  });

  it("records gift_premium kind for gift flow", async () => {
    const db = premiumHandler(1);
    const r = new UserRepository(db);
    await runEffect(
      r.grantPremium(
        "u1",
        "premium",
        "2026-09-01T00:00:00.000Z",
        "chg_gift",
        "gift_premium",
      ),
    );
    const statements = (db.batch as any).mock.calls[0][0];
    expect(statements[1]._values).toContain("gift_premium");
  });

  it("throws NotFoundError when user missing", async () => {
    const db = createMockD1(() => ({ results: [] }));
    const repo = new UserRepository(db);
    await expect(
      runEffect(repo.grantPremium("nope", "premium", "2026-09-01", "chg_p")),
    ).rejects.toThrow(NotFoundError);
  });
});

// ---------------------------------------------------------------------------
// getMediaUploadStatus
// ---------------------------------------------------------------------------

describe("UserRepository getMediaUploadStatus", () => {
  const today = "2025-06-01T00:00:00.000Z";

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(today));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns media upload status for free user", async () => {
    const db = createMockD1((sql) => {
      if (sql.includes("SELECT subscription_tier, daily_media_used")) {
        return {
          results: [
            {
              subscription_tier: "free",
              daily_media_used: 5,
              daily_media_reset_at: today,
            },
          ],
        };
      }
      return { results: [], success: true };
    });
    const repo = new UserRepository(db);
    const result = await runEffect(repo.getMediaUploadStatus("u1"));
    expect(result.remaining).toBe(5); // 10 - 5
    expect(result.total).toBe(10);
    expect(result.tier).toBe("free");
  });

  it("returns premium limit", async () => {
    const db = createMockD1((sql) => {
      if (sql.includes("SELECT subscription_tier, daily_media_used")) {
        return {
          results: [
            {
              subscription_tier: "premium",
              daily_media_used: 10,
              daily_media_reset_at: today,
            },
          ],
        };
      }
      return { results: [], success: true };
    });
    const repo = new UserRepository(db);
    const result = await runEffect(repo.getMediaUploadStatus("u1"));
    expect(result.total).toBe(50);
  });

  it("returns premium_plus limit", async () => {
    const db = createMockD1((sql) => {
      if (sql.includes("SELECT subscription_tier, daily_media_used")) {
        return {
          results: [
            {
              subscription_tier: "premium_plus",
              daily_media_used: 100,
              daily_media_reset_at: today,
            },
          ],
        };
      }
      return { results: [], success: true };
    });
    const repo = new UserRepository(db);
    const result = await runEffect(repo.getMediaUploadStatus("u1"));
    expect(result.total).toBe(9999);
  });

  it("resets media counter when stale", async () => {
    const db = createMockD1((sql) => {
      if (sql.includes("SELECT subscription_tier, daily_media_used")) {
        return {
          results: [
            {
              subscription_tier: "free",
              daily_media_used: 10,
              daily_media_reset_at: "2025-05-30T00:00:00.000Z",
            },
          ],
        };
      }
      return { results: [], success: true };
    });
    const repo = new UserRepository(db);
    const result = await runEffect(repo.getMediaUploadStatus("u1"));
    expect(result.remaining).toBe(10); // reset -> 0 used
  });

  it("throws NotFoundError when user missing", async () => {
    const db = createMockD1(() => ({ results: [] }));
    const repo = new UserRepository(db);
    await expect(runEffect(repo.getMediaUploadStatus("nope"))).rejects.toThrow(
      NotFoundError,
    );
  });
});

// ---------------------------------------------------------------------------
// recordMediaUpload
// ---------------------------------------------------------------------------

describe("UserRepository recordMediaUpload", () => {
  const today = "2025-06-01T00:00:00.000Z";

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(today));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns remaining after record", async () => {
    const db = createMockD1((sql) => {
      if (sql.includes("SELECT subscription_tier, daily_media_used")) {
        return {
          results: [
            {
              subscription_tier: "free",
              daily_media_used: 3,
              daily_media_reset_at: today,
            },
          ],
        };
      }
      return { results: [], success: true };
    });
    const repo = new UserRepository(db);
    const result = await runEffect(repo.recordMediaUpload("u1"));
    expect(result.remaining).toBe(6); // 10 - 3 - 1 = 6
    expect(result.total).toBe(10);
  });

  it("returns zero remaining when at limit", async () => {
    const db = createMockD1((sql) => {
      if (sql.includes("SELECT subscription_tier, daily_media_used")) {
        return {
          results: [
            {
              subscription_tier: "free",
              daily_media_used: 10,
              daily_media_reset_at: today,
            },
          ],
        };
      }
      return { results: [] };
    });
    const repo = new UserRepository(db);
    const result = await runEffect(repo.recordMediaUpload("u1"));
    expect(result.remaining).toBe(0);
  });

  it("throws NotFoundError when user missing", async () => {
    const db = createMockD1(() => ({ results: [] }));
    const repo = new UserRepository(db);
    await expect(runEffect(repo.recordMediaUpload("nope"))).rejects.toThrow(
      NotFoundError,
    );
  });
});

// ---------------------------------------------------------------------------
// getMedia + addMedia + removeMedia edge cases
// ---------------------------------------------------------------------------

describe("UserRepository media edge cases", () => {
  it("getMedia returns empty array for empty media", async () => {
    const db = createMockD1((sql) => {
      if (sql.includes("SELECT media_urls FROM users")) {
        return { results: [{ media_urls: null }] };
      }
      return { results: [] };
    });
    const repo = new UserRepository(db);
    const result = await runEffect(repo.getMedia("u1"));
    expect(result).toEqual([]);
  });

  it("getMedia throws NotFoundError when user missing", async () => {
    const db = createMockD1(() => ({ results: [] }));
    const repo = new UserRepository(db);
    await expect(runEffect(repo.getMedia("nope"))).rejects.toThrow(
      NotFoundError,
    );
  });

  it("addMedia throws when 3 media items already exist", async () => {
    const db = createMockD1((sql) => {
      if (sql.includes("SELECT media_urls FROM users")) {
        return {
          results: [
            {
              media_urls: JSON.stringify([
                { url: "a.jpg", type: "image", uploadedAt: "2025-01-01" },
                { url: "b.jpg", type: "image", uploadedAt: "2025-01-02" },
                { url: "c.jpg", type: "image", uploadedAt: "2025-01-03" },
              ]),
            },
          ],
        };
      }
      return { results: [], success: true };
    });
    const repo = new UserRepository(db);
    await expect(
      runEffect(
        repo.addMedia("u1", {
          url: "d.jpg",
          type: "image",
          uploadedAt: "2025-01-04",
        }),
      ),
    ).rejects.toThrow(DatabaseError);
  });

  it("addMedia throws NotFoundError when user missing", async () => {
    const db = createMockD1(() => ({ results: [] }));
    const repo = new UserRepository(db);
    await expect(
      runEffect(
        repo.addMedia("nope", {
          url: "a.jpg",
          type: "image",
          uploadedAt: "2025-01-01",
        }),
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("removeMedia filters out specified URL", async () => {
    const db = createMockD1((sql) => {
      if (sql.includes("SELECT media_urls FROM users")) {
        return {
          results: [
            {
              media_urls: JSON.stringify([
                { url: "a.jpg", type: "image", uploadedAt: "2025-01-01" },
                { url: "b.jpg", type: "image", uploadedAt: "2025-01-02" },
              ]),
            },
          ],
        };
      }
      return { results: [], success: true };
    });
    const repo = new UserRepository(db);
    const result = await runEffect(repo.removeMedia("u1", "a.jpg"));
    expect(result.mediaUrls).toHaveLength(1);
    expect(result.mediaUrls[0].url).toBe("b.jpg");
  });

  it("removeMedia throws NotFoundError when user missing", async () => {
    const db = createMockD1(() => ({ results: [] }));
    const repo = new UserRepository(db);
    await expect(runEffect(repo.removeMedia("nope", "a.jpg"))).rejects.toThrow(
      NotFoundError,
    );
  });
});

// ---------------------------------------------------------------------------
// Simple update/hide/restore methods
// ---------------------------------------------------------------------------

describe("UserRepository lifecycle methods", () => {
  it("updateLastActive returns true", async () => {
    const db = createMockD1(() => ({ results: [], success: true }));
    const repo = new UserRepository(db);
    const result = await runEffect(repo.updateLastActive({ userId: "u1" }));
    expect(result).toBe(true);
  });

  it("updateLastRemindedAt returns true", async () => {
    const db = createMockD1(() => ({ results: [], success: true }));
    const repo = new UserRepository(db);
    const result = await runEffect(repo.updateLastRemindedAt({ userId: "u1" }));
    expect(result).toBe(true);
  });

  it("updateLastInteraction returns true", async () => {
    const db = createMockD1(() => ({ results: [], success: true }));
    const repo = new UserRepository(db);
    const result = await runEffect(repo.updateLastInteraction("u1"));
    expect(result).toBe(true);
  });

  it("hideFromMatches returns true", async () => {
    const db = createMockD1(() => ({ results: [], success: true }));
    const repo = new UserRepository(db);
    const result = await runEffect(repo.hideFromMatches("u1"));
    expect(result).toBe(true);
  });

  it("restoreProfile returns true", async () => {
    const db = createMockD1(() => ({ results: [], success: true }));
    const repo = new UserRepository(db);
    const result = await runEffect(repo.restoreProfile("u1"));
    expect(result).toBe(true);
  });

  it("clearMediaAndMarkIncomplete returns true", async () => {
    const db = createMockD1(() => ({ results: [], success: true }));
    const repo = new UserRepository(db);
    const result = await runEffect(repo.clearMediaAndMarkIncomplete("u1"));
    expect(result).toBe(true);
  });

  it("downgradeExpiredSubscriptions returns number of changes", async () => {
    const db = createMockD1(() => ({
      results: [],
      success: true,
      meta: { changes: 3 },
    }));
    const repo = new UserRepository(db);
    const result = await runEffect(repo.downgradeExpiredSubscriptions());
    expect(result).toBe(3);
  });

  it("downgradeExpiredSubscriptions returns 0 when no changes", async () => {
    const db = createMockD1(() => ({
      results: [],
      success: true,
      meta: { changes: 0 },
    }));
    const repo = new UserRepository(db);
    const result = await runEffect(repo.downgradeExpiredSubscriptions());
    expect(result).toBe(0);
  });

  it("downgradeExpiredSubscriptions handles missing meta", async () => {
    const db = createMockD1(() => ({ results: [], success: true, meta: {} }));
    const repo = new UserRepository(db);
    const result = await runEffect(repo.downgradeExpiredSubscriptions());
    expect(result).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// toUser edge cases (via getById with various row shapes)
// ---------------------------------------------------------------------------

describe("UserRepository toUser conversion", () => {
  it("converts all fields from row", async () => {
    const db = createMockD1((sql) => {
      if (sql.includes("SELECT * FROM users WHERE id =")) {
        return { results: [makeUserRow()] };
      }
      return { results: [] };
    });
    const repo = new UserRepository(db);
    const user = await runEffect(repo.getById({ userId: "u1" }));
    expect(user.id).toBe("u1");
    expect(user.username).toBe("testuser");
    expect(user.displayName).toBe("Test");
    expect(user.lastName).toBe("User");
    expect(user.bio).toBe("Hello world");
    expect(user.age).toBe(25);
    expect(user.birthDate).toBe("1999-01-01");
    expect(user.gender).toBe("female");
    expect(user.interests).toEqual(["music", "travel"]);
    expect(user.mediaUrls).toBeDefined();
    expect(user.preferences).toEqual({ maxDistance: 50 });
    expect(user.isActive).toBe(true);
    expect(user.isSleeping).toBe(false);
    expect(user.isProfileComplete).toBe(true);
    expect(user.phoneNumber).toBe("+1234567890");
    expect(user.language).toBe("en");
    expect(user.subscriptionTier).toBe("free");
    expect(user.referralCode).toBe("REF123");
    expect(user.referredBy).toBeUndefined();
    // 0 is now correctly handled by != null check
    expect(user.referralCount).toBe(0);
    expect(user.referralBonusSwipes).toBe(0);
    expect(user.dmCredits).toBe(5);
    // hidden_from_matches: 0 is now correctly handled by != null check
    expect(user.hiddenFromMatches).toBe(false);
    expect(user.dailySwipesUsed).toBe(3);
    expect(user.dailyLikesUsed).toBe(5);
    expect(user.dailyDislikesUsed).toBe(10);
    expect(user.dailyMediaUsed).toBe(2);
  });

  it("handles sparse row with minimal fields", async () => {
    const db = createMockD1((sql) => {
      if (sql.includes("SELECT * FROM users WHERE id =")) {
        return { results: [{ id: "u2", is_active: 0, is_sleeping: 1 }] };
      }
      return { results: [] };
    });
    const repo = new UserRepository(db);
    const user = await runEffect(repo.getById({ userId: "u2" }));
    expect(user.id).toBe("u2");
    // is_active: 0 is now correctly handled by != null check
    expect(user.isActive).toBe(false);
    expect(user.isSleeping).toBe(true);
    expect(user.isProfileComplete).toBe(false);
    expect(user.interests).toEqual([]);
    expect(user.preferences).toEqual({});
    expect(user.username).toBeUndefined();
    expect(user.bio).toBeUndefined();
  });

  it("handles row with hidden_from_matches = 1", async () => {
    const db = createMockD1((sql) => {
      if (sql.includes("SELECT * FROM users WHERE id =")) {
        return { results: [{ id: "u1", hidden_from_matches: 1 }] };
      }
      return { results: [] };
    });
    const repo = new UserRepository(db);
    const user = await runEffect(repo.getById({ userId: "u1" }));
    expect(user.hiddenFromMatches).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Premium tier edge cases in recordLike
// ---------------------------------------------------------------------------

describe("UserRepository recordLike premium edge", () => {
  const today = "2025-06-01T00:00:00.000Z";

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(today));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resets on stale reset and records increment", async () => {
    const db = createMockD1((sql) => {
      if (sql.includes("SELECT subscription_tier, daily_likes_used")) {
        return {
          results: [
            {
              subscription_tier: "free",
              daily_likes_used: 10,
              daily_likes_reset_at: "2025-05-30T00:00:00.000Z",
              referral_bonus_swipes: 0,
            },
          ],
        };
      }
      if (sql.includes("UPDATE users SET daily_likes_used")) {
        return { results: [], success: true };
      }
      return { results: [] };
    });
    const repo = new UserRepository(db);
    const result = await runEffect(repo.recordLike("u1"));
    expect(result.remaining).toBe(14); // 15 - 0 - 1 = 14 after reset
  });
});
