import { describe, it, expect, vi } from "vitest";
import { ApiServiceClient, ApiError } from "../api-client.js";

// --------------------------------------------------------------------------
// Test helpers
// --------------------------------------------------------------------------

/** Human-readable summary of a Request for assertions. */
interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

async function captureRequest(req: Request): Promise<CapturedRequest> {
  const rawHeaders: Record<string, string> = {};
  req.headers.forEach((val, key) => {
    rawHeaders[key] = val;
  });
  let body: unknown = null;
  const ct = (req.headers.get("content-type") ?? "").toLowerCase();
  if (req.body && ct.includes("application/json")) {
    try {
      body = await req.clone().json();
    } catch {
      body = await req.clone().text();
    }
  }
  return { url: req.url, method: req.method, headers: rawHeaders, body };
}

/** Create a mock Fetcher whose .fetch() returns a given Response. */
function mockFetcher(response: Response) {
  return {
    fetch: vi
      .fn<(input: Request) => Promise<Response>>()
      .mockResolvedValue(response),
  };
}

/** Shorthand: a successful JSON response. */
function ok(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
}

/** Shorthand: an error response with a non-2xx status code. */
function err(status: number, body?: unknown): Response {
  return new Response(JSON.stringify(body ?? { error: "fail" }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// --------------------------------------------------------------------------
// Reusable client creation helpers
// --------------------------------------------------------------------------

type MockFetcher = ReturnType<typeof mockFetcher>;

function createClient(response: Response): {
  client: ApiServiceClient;
  fetcher: MockFetcher;
} {
  const fetcher = mockFetcher(response);
  const client = new ApiServiceClient(fetcher as any);
  return { client, fetcher };
}

async function getLastRequest(fetcher: MockFetcher): Promise<CapturedRequest> {
  expect(fetcher.fetch).toHaveBeenCalledTimes(1);
  const call = fetcher.fetch.mock.calls[0];
  if (!call) throw new Error("fetch was not called");
  const req: Request = call[0] as Request;
  return captureRequest(req);
}

// --------------------------------------------------------------------------
// getUser
// --------------------------------------------------------------------------

describe("getUser", () => {
  const response = { user: { id: "u1", displayName: "Alice" } };

  it("sends GET with userId in URL and returns parsed JSON", async () => {
    const { client, fetcher } = createClient(ok(response));
    const result = await client.getUser({ userId: "u1" });
    expect(result).toEqual(response);
    const req = await getLastRequest(fetcher);
    expect(req.method).toBe("GET");
    expect(req.url).toBe("http://api/users/u1");
  });

  it("throws Error with status code on failure", async () => {
    const { client } = createClient(err(404));
    await expect(client.getUser({ userId: "nope" })).rejects.toThrow(
      "API 404 on /users/nope",
    );
  });
});

// --------------------------------------------------------------------------
// createUser
// --------------------------------------------------------------------------

describe("createUser", () => {
  const body = { user: { id: "u1", displayName: "Alice" } };
  const response = { user: { id: "u1", displayName: "Alice" } };

  it("sends POST with JSON body and returns parsed JSON", async () => {
    const { client, fetcher } = createClient(ok(response));
    const result = await client.createUser(body);
    expect(result).toEqual(response);
    const req = await getLastRequest(fetcher);
    expect(req.method).toBe("POST");
    expect(req.url).toBe("http://api/users");
    expect(req.headers["content-type"]).toBe("application/json");
    expect(req.body).toEqual(body);
  });

  it("throws Error with status code on failure", async () => {
    const { client } = createClient(err(400));
    await expect(client.createUser(body)).rejects.toThrow("API 400 on /users");
  });
});

// --------------------------------------------------------------------------
// updateUser
// --------------------------------------------------------------------------

describe("updateUser", () => {
  const body = { userId: "u1", user: { id: "u1", displayName: "Updated" } };
  const response = { user: { id: "u1", displayName: "Updated" } };

  it("sends PUT with JSON body and userId in URL", async () => {
    const { client, fetcher } = createClient(ok(response));
    const result = await client.updateUser(body);
    expect(result).toEqual(response);
    const req = await getLastRequest(fetcher);
    expect(req.method).toBe("PUT");
    expect(req.url).toBe("http://api/users/u1");
    expect(req.headers["content-type"]).toBe("application/json");
    expect(req.body).toEqual(body);
  });

  it("throws Error with status code on failure", async () => {
    const { client } = createClient(err(500));
    await expect(client.updateUser(body)).rejects.toThrow(
      "API 500 on /users/u1",
    );
  });
});

// --------------------------------------------------------------------------
// updateLastActive
// --------------------------------------------------------------------------

describe("updateLastActive", () => {
  const response = { success: true };

  it("sends POST with userId in URL and returns parsed JSON", async () => {
    const { client, fetcher } = createClient(ok(response));
    const result = await client.updateLastActive({ userId: "u1" });
    expect(result).toEqual(response);
    const req = await getLastRequest(fetcher);
    expect(req.method).toBe("POST");
    expect(req.url).toBe("http://api/users/u1/last-active");
    expect(req.body).toBeNull();
  });

  it("throws Error with status code on failure", async () => {
    const { client } = createClient(err(500));
    await expect(client.updateLastActive({ userId: "u1" })).rejects.toThrow(
      "API 500 on /users/u1/last-active",
    );
  });
});

// --------------------------------------------------------------------------
// updateLastRemindedAt
// --------------------------------------------------------------------------

describe("updateLastRemindedAt", () => {
  const response = { success: true };

  it("sends POST with userId in URL and returns parsed JSON", async () => {
    const { client, fetcher } = createClient(ok(response));
    const result = await client.updateLastRemindedAt({ userId: "u1" });
    expect(result).toEqual(response);
    const req = await getLastRequest(fetcher);
    expect(req.method).toBe("POST");
    expect(req.url).toBe("http://api/users/u1/last-reminded-at");
    expect(req.body).toBeNull();
  });

  it("throws Error with status code on failure", async () => {
    const { client } = createClient(err(500));
    await expect(client.updateLastRemindedAt({ userId: "u1" })).rejects.toThrow(
      "API 500 on /users/u1/last-reminded-at",
    );
  });
});

// --------------------------------------------------------------------------
// getPotentialMatches
// --------------------------------------------------------------------------

describe("getPotentialMatches", () => {
  const response = { potentialMatches: [] };

  it("sends GET with userId and default limit in URL", async () => {
    const { client, fetcher } = createClient(ok(response));
    const result = await client.getPotentialMatches({ userId: "u1" });
    expect(result).toEqual(response);
    const req = await getLastRequest(fetcher);
    expect(req.method).toBe("GET");
    expect(req.url).toBe("http://api/users/u1/potential-matches?limit=10");
  });

  it("sends GET with custom limit in URL", async () => {
    const { client, fetcher } = createClient(ok(response));
    await client.getPotentialMatches({ userId: "u1", limit: 5 });
    const req = await getLastRequest(fetcher);
    expect(req.url).toBe("http://api/users/u1/potential-matches?limit=5");
  });

  it("throws Error with status code on failure", async () => {
    const { client } = createClient(err(500));
    await expect(client.getPotentialMatches({ userId: "u1" })).rejects.toThrow(
      "API 500 on /users/u1/potential-matches?limit=10",
    );
  });
});

// --------------------------------------------------------------------------
// getPendingLikes
// --------------------------------------------------------------------------

describe("getPendingLikes", () => {
  const response = { pendingLikes: [] };

  it("sends GET with userId in URL and returns parsed JSON", async () => {
    const { client, fetcher } = createClient(ok(response));
    const result = await client.getPendingLikes("u1");
    expect(result).toEqual(response);
    const req = await getLastRequest(fetcher);
    expect(req.method).toBe("GET");
    expect(req.url).toBe("http://api/users/u1/pending-likes");
  });

  it("throws Error with status code on failure", async () => {
    const { client } = createClient(err(500));
    await expect(client.getPendingLikes("u1")).rejects.toThrow(
      "API 500 on /users/u1/pending-likes",
    );
  });
});

// --------------------------------------------------------------------------
// getMatchList
// --------------------------------------------------------------------------

describe("getMatchList", () => {
  const response = { matches: [] };

  it("sends GET with userId as query param", async () => {
    const { client, fetcher } = createClient(ok(response));
    const result = await client.getMatchList({ userId: "u1" });
    expect(result).toEqual(response);
    const req = await getLastRequest(fetcher);
    expect(req.method).toBe("GET");
    expect(req.url).toBe("http://api/matches?userId=u1");
  });

  it("sends GET with userId and status query params", async () => {
    const { client, fetcher } = createClient(ok(response));
    await client.getMatchList({ userId: "u1", status: "PENDING" });
    const req = await getLastRequest(fetcher);
    expect(req.url).toBe("http://api/matches?userId=u1&status=PENDING");
  });

  it("sends GET with userId, status, and limit query params", async () => {
    const { client, fetcher } = createClient(ok(response));
    await client.getMatchList({
      userId: "u1",
      status: "MATCHED",
      limit: 20,
    });
    const req = await getLastRequest(fetcher);
    expect(req.url).toBe(
      "http://api/matches?userId=u1&status=MATCHED&limit=20",
    );
  });

  it("sends GET with only userId and limit (no status)", async () => {
    const { client, fetcher } = createClient(ok(response));
    await client.getMatchList({ userId: "u1", limit: 5 });
    const req = await getLastRequest(fetcher);
    expect(req.url).toBe("http://api/matches?userId=u1&limit=5");
  });

  it("throws Error with status code on failure", async () => {
    const { client } = createClient(err(500));
    await expect(client.getMatchList({ userId: "u1" })).rejects.toThrow(
      "API 500 on /matches?userId=u1",
    );
  });
});

// --------------------------------------------------------------------------
// createMatch
// --------------------------------------------------------------------------

describe("createMatch", () => {
  const body = { user1Id: "u1", user2Id: "u2" };
  const response = { match: { id: "m1" } };

  it("sends POST with JSON body and returns parsed JSON", async () => {
    const { client, fetcher } = createClient(ok(response));
    const result = await client.createMatch(body);
    expect(result).toEqual(response);
    const req = await getLastRequest(fetcher);
    expect(req.method).toBe("POST");
    expect(req.url).toBe("http://api/matches");
    expect(req.headers["content-type"]).toBe("application/json");
    expect(req.body).toEqual(body);
  });

  it("throws Error with status code on failure", async () => {
    const { client } = createClient(err(400));
    await expect(client.createMatch(body)).rejects.toThrow(
      "API 400 on /matches",
    );
  });
});

// --------------------------------------------------------------------------
// likeMatch
// --------------------------------------------------------------------------

describe("likeMatch", () => {
  const response = { isMutual: true, match: { id: "m1" } };

  it("sends POST with matchId in URL and userId in body", async () => {
    const { client, fetcher } = createClient(ok(response));
    const result = await client.likeMatch({ matchId: "m1", userId: "u1" });
    expect(result).toEqual(response);
    const req = await getLastRequest(fetcher);
    expect(req.method).toBe("POST");
    expect(req.url).toBe("http://api/matches/m1/like");
    expect(req.headers["content-type"]).toBe("application/json");
    expect(req.body).toEqual({ userId: "u1", message: undefined });
  });

  it("sends POST with optional message in body", async () => {
    const { client, fetcher } = createClient(ok(response));
    await client.likeMatch({
      matchId: "m1",
      userId: "u1",
      message: { text: "hello" },
    });
    const req = await getLastRequest(fetcher);
    expect(req.body).toEqual({
      userId: "u1",
      message: { text: "hello" },
    });
  });

  it("throws Error with status code on failure", async () => {
    const { client } = createClient(err(404));
    await expect(
      client.likeMatch({ matchId: "m1", userId: "u1" }),
    ).rejects.toThrow("API 404 on /matches/m1/like");
  });
});

// --------------------------------------------------------------------------
// getInteractionStatus
// --------------------------------------------------------------------------

describe("getInteractionStatus", () => {
  const response = {
    likesRemaining: 10,
    likesTotal: 10,
    dislikesRemaining: 5,
    dislikesTotal: 5,
    tier: "free",
    resetAt: "2025-01-01T00:00:00Z",
  };

  it("sends GET with userId in URL and returns parsed JSON", async () => {
    const { client, fetcher } = createClient(ok(response));
    const result = await client.getInteractionStatus("u1");
    expect(result).toEqual(response);
    const req = await getLastRequest(fetcher);
    expect(req.method).toBe("GET");
    expect(req.url).toBe("http://api/users/u1/interaction-status");
  });

  it("throws Error with status code on failure", async () => {
    const { client } = createClient(err(500));
    await expect(client.getInteractionStatus("u1")).rejects.toThrow(
      "API 500 on /users/u1/interaction-status",
    );
  });
});

// --------------------------------------------------------------------------
// recordLike
// --------------------------------------------------------------------------

describe("recordLike", () => {
  const response = { remaining: 9, total: 10 };

  it("sends POST with userId in URL and returns parsed JSON", async () => {
    const { client, fetcher } = createClient(ok(response));
    const result = await client.recordLike("u1");
    expect(result).toEqual(response);
    const req = await getLastRequest(fetcher);
    expect(req.method).toBe("POST");
    expect(req.url).toBe("http://api/users/u1/record-like");
    expect(req.body).toBeNull();
  });

  it("throws Error with status code on failure", async () => {
    const { client } = createClient(err(429));
    await expect(client.recordLike("u1")).rejects.toThrow(
      "API 429 on /users/u1/record-like",
    );
  });
});

// --------------------------------------------------------------------------
// recordDislike
// --------------------------------------------------------------------------

describe("recordDislike", () => {
  const response = { remaining: 4, total: 5 };

  it("sends POST with userId in URL and returns parsed JSON", async () => {
    const { client, fetcher } = createClient(ok(response));
    const result = await client.recordDislike("u1");
    expect(result).toEqual(response);
    const req = await getLastRequest(fetcher);
    expect(req.method).toBe("POST");
    expect(req.url).toBe("http://api/users/u1/record-dislike");
    expect(req.body).toBeNull();
  });

  it("throws Error with status code on failure", async () => {
    const { client } = createClient(err(429));
    await expect(client.recordDislike("u1")).rejects.toThrow(
      "API 429 on /users/u1/record-dislike",
    );
  });
});

// --------------------------------------------------------------------------
// getDMStatus
// --------------------------------------------------------------------------

describe("getDMStatus", () => {
  const response = { canSendDM: true, tier: "premium", dmCredits: 5 };

  it("sends GET with userId in URL and returns parsed JSON", async () => {
    const { client, fetcher } = createClient(ok(response));
    const result = await client.getDMStatus("u1");
    expect(result).toEqual(response);
    const req = await getLastRequest(fetcher);
    expect(req.method).toBe("GET");
    expect(req.url).toBe("http://api/users/u1/dm-status");
  });

  it("throws Error with status code on failure", async () => {
    const { client } = createClient(err(500));
    await expect(client.getDMStatus("u1")).rejects.toThrow(
      "API 500 on /users/u1/dm-status",
    );
  });
});

// --------------------------------------------------------------------------
// sendDM
// --------------------------------------------------------------------------

describe("sendDM", () => {
  const response = { success: true, dmCredits: 4 };

  it("sends POST with userId in URL and returns parsed JSON", async () => {
    const { client, fetcher } = createClient(ok(response));
    const result = await client.sendDM("u1");
    expect(result).toEqual(response);
    const req = await getLastRequest(fetcher);
    expect(req.method).toBe("POST");
    expect(req.url).toBe("http://api/users/u1/send-dm");
    expect(req.body).toBeNull();
  });

  it("throws Error with status code on failure", async () => {
    const { client } = createClient(err(402));
    await expect(client.sendDM("u1")).rejects.toThrow(
      "API 402 on /users/u1/send-dm",
    );
  });
});

// --------------------------------------------------------------------------
// purchaseDMCredits
// --------------------------------------------------------------------------

describe("purchaseDMCredits", () => {
  const response = { dmCredits: 10 };

  it("sends POST with amount in body and returns parsed JSON", async () => {
    const { client, fetcher } = createClient(ok(response));
    const result = await client.purchaseDMCredits("u1", 5);
    expect(result).toEqual(response);
    const req = await getLastRequest(fetcher);
    expect(req.method).toBe("POST");
    expect(req.url).toBe("http://api/users/u1/purchase-dm-credits");
    expect(req.headers["content-type"]).toBe("application/json");
    expect(req.body).toEqual({ amount: 5 });
  });

  it("throws Error with status code on failure", async () => {
    const { client } = createClient(err(400));
    await expect(client.purchaseDMCredits("u1", 5)).rejects.toThrow(
      "API 400 on /users/u1/purchase-dm-credits",
    );
  });
});

// --------------------------------------------------------------------------
// uploadMedia
// --------------------------------------------------------------------------

describe("uploadMedia", () => {
  const response = {
    mediaUrls: [
      { url: "https://example.com/img.jpg", type: "image", uploadedAt: "now" },
    ],
  };

  it("sends POST with file data in body and returns parsed JSON", async () => {
    const { client, fetcher } = createClient(ok(response));
    const result = await client.uploadMedia(
      "u1",
      "base64data",
      "image/jpeg",
      "photo.jpg",
    );
    expect(result).toEqual(response);
    const req = await getLastRequest(fetcher);
    expect(req.method).toBe("POST");
    expect(req.url).toBe("http://api/users/u1/media");
    expect(req.headers["content-type"]).toBe("application/json");
    expect(req.body).toEqual({
      fileData: "base64data",
      fileType: "image/jpeg",
      fileName: "photo.jpg",
    });
  });

  it("throws Error with status code on failure", async () => {
    const { client } = createClient(err(413));
    await expect(
      client.uploadMedia("u1", "data", "image/jpeg", "photo.jpg"),
    ).rejects.toThrow("API 413 on /users/u1/media");
  });
});

// --------------------------------------------------------------------------
// deleteMedia
// --------------------------------------------------------------------------

describe("deleteMedia", () => {
  const response = { mediaUrls: [] };

  it("sends DELETE with url in body and returns parsed JSON", async () => {
    const { client, fetcher } = createClient(ok(response));
    const result = await client.deleteMedia(
      "u1",
      "https://example.com/img.jpg",
    );
    expect(result).toEqual(response);
    const req = await getLastRequest(fetcher);
    expect(req.method).toBe("DELETE");
    expect(req.url).toBe("http://api/users/u1/media");
    expect(req.headers["content-type"]).toBe("application/json");
    expect(req.body).toEqual({ url: "https://example.com/img.jpg" });
  });

  it("throws Error with status code on failure", async () => {
    const { client } = createClient(err(404));
    await expect(
      client.deleteMedia("u1", "https://example.com/img.jpg"),
    ).rejects.toThrow("API 404 on /users/u1/media");
  });
});

// --------------------------------------------------------------------------
// undoMatch
// --------------------------------------------------------------------------

describe("undoMatch", () => {
  const response = { restored: true, match: { id: "m1" } };

  it("sends POST with matchId in URL and userId in body", async () => {
    const { client, fetcher } = createClient(ok(response));
    const result = await client.undoMatch("m1", "u1");
    expect(result).toEqual(response);
    const req = await getLastRequest(fetcher);
    expect(req.method).toBe("POST");
    expect(req.url).toBe("http://api/matches/m1/undo");
    expect(req.headers["content-type"]).toBe("application/json");
    expect(req.body).toEqual({ userId: "u1" });
  });

  it("throws Error with status code on failure", async () => {
    const { client } = createClient(err(404));
    await expect(client.undoMatch("m1", "u1")).rejects.toThrow(
      "API 404 on /matches/m1/undo",
    );
  });
});

// --------------------------------------------------------------------------
// reportUser
// --------------------------------------------------------------------------

describe("reportUser", () => {
  const response = { success: true, reportId: "r1" };

  it("sends POST with reportedId in URL and reporterId in body", async () => {
    const { client, fetcher } = createClient(ok(response));
    const result = await client.reportUser("bad-user", "reporter1");
    expect(result).toEqual(response);
    const req = await getLastRequest(fetcher);
    expect(req.method).toBe("POST");
    expect(req.url).toBe("http://api/users/bad-user/report");
    expect(req.headers["content-type"]).toBe("application/json");
    expect(req.body).toEqual({ reporterId: "reporter1", reason: undefined });
  });

  it("sends POST with optional reason in body", async () => {
    const { client, fetcher } = createClient(ok(response));
    await client.reportUser("bad-user", "reporter1", "spam");
    const req = await getLastRequest(fetcher);
    expect(req.body).toEqual({ reporterId: "reporter1", reason: "spam" });
  });

  it("throws Error with status code on failure", async () => {
    const { client } = createClient(err(400));
    await expect(client.reportUser("bad-user", "reporter1")).rejects.toThrow(
      "API 400 on /users/bad-user/report",
    );
  });
});

// --------------------------------------------------------------------------
// restoreProfile
// --------------------------------------------------------------------------

describe("restoreProfile", () => {
  const response = { success: true };

  it("sends POST with userId in URL and returns parsed JSON", async () => {
    const { client, fetcher } = createClient(ok(response));
    const result = await client.restoreProfile("u1");
    expect(result).toEqual(response);
    const req = await getLastRequest(fetcher);
    expect(req.method).toBe("POST");
    expect(req.url).toBe("http://api/users/u1/restore-profile");
    expect(req.body).toBeNull();
  });

  it("throws Error with status code on failure", async () => {
    const { client } = createClient(err(500));
    await expect(client.restoreProfile("u1")).rejects.toThrow(
      "API 500 on /users/u1/restore-profile",
    );
  });
});

// --------------------------------------------------------------------------
// interact
// --------------------------------------------------------------------------

describe("interact", () => {
  const response = { success: true };

  it("sends POST with userId in URL and returns parsed JSON", async () => {
    const { client, fetcher } = createClient(ok(response));
    const result = await client.interact("u1");
    expect(result).toEqual(response);
    const req = await getLastRequest(fetcher);
    expect(req.method).toBe("POST");
    expect(req.url).toBe("http://api/users/u1/interact");
    expect(req.body).toBeNull();
  });

  it("throws Error with status code on failure", async () => {
    const { client } = createClient(err(500));
    await expect(client.interact("u1")).rejects.toThrow(
      "API 500 on /users/u1/interact",
    );
  });
});

// --------------------------------------------------------------------------
// getReferralCode
// --------------------------------------------------------------------------

describe("getReferralCode", () => {
  const response = { code: "ABC123" };

  it("sends GET with userId in URL and returns parsed JSON", async () => {
    const { client, fetcher } = createClient(ok(response));
    const result = await client.getReferralCode("u1");
    expect(result).toEqual(response);
    const req = await getLastRequest(fetcher);
    expect(req.method).toBe("GET");
    expect(req.url).toBe("http://api/users/u1/referral");
  });

  it("throws Error with status code on failure", async () => {
    const { client } = createClient(err(404));
    await expect(client.getReferralCode("u1")).rejects.toThrow(
      "API 404 on /users/u1/referral",
    );
  });
});

// --------------------------------------------------------------------------
// blockUser
// --------------------------------------------------------------------------

describe("blockUser", () => {
  const response = { success: true };

  it("sends POST with blockerId in URL and blockedId in body", async () => {
    const { client, fetcher } = createClient(ok(response));
    const result = await client.blockUser("blocker1", "blocked1");
    expect(result).toEqual(response);
    const req = await getLastRequest(fetcher);
    expect(req.method).toBe("POST");
    expect(req.url).toBe("http://api/users/blocker1/block");
    expect(req.headers["content-type"]).toBe("application/json");
    expect(req.body).toEqual({ blockedId: "blocked1" });
  });

  it("throws Error with status code on failure", async () => {
    const { client } = createClient(err(409));
    await expect(client.blockUser("blocker1", "blocked1")).rejects.toThrow(
      "API 409 on /users/blocker1/block",
    );
  });
});

// --------------------------------------------------------------------------
// unblockUser
// --------------------------------------------------------------------------

describe("unblockUser", () => {
  const response = { success: true };

  it("sends POST with blockerId in URL and blockedId in body", async () => {
    const { client, fetcher } = createClient(ok(response));
    const result = await client.unblockUser("blocker1", "blocked1");
    expect(result).toEqual(response);
    const req = await getLastRequest(fetcher);
    expect(req.method).toBe("POST");
    expect(req.url).toBe("http://api/users/blocker1/unblock");
    expect(req.headers["content-type"]).toBe("application/json");
    expect(req.body).toEqual({ blockedId: "blocked1" });
  });

  it("throws Error with status code on failure", async () => {
    const { client } = createClient(err(404));
    await expect(client.unblockUser("blocker1", "blocked1")).rejects.toThrow(
      "API 404 on /users/blocker1/unblock",
    );
  });
});

// --------------------------------------------------------------------------
// ApiError class
// --------------------------------------------------------------------------

describe("ApiError", () => {
  it("has correct name, message, status, body, and endpoint", () => {
    const error = new ApiError(404, { error: "not found" }, "/users/nope");
    expect(error.name).toBe("ApiError");
    expect(error.message).toBe("API 404 on /users/nope");
    expect(error.status).toBe(404);
    expect(error.body).toEqual({ error: "not found" });
    expect(error.endpoint).toBe("/users/nope");
  });

  it("is an instance of Error", () => {
    const error = new ApiError(500, "server error", "/test");
    expect(error).toBeInstanceOf(Error);
  });
});

// --------------------------------------------------------------------------
// Idempotency header tests
// --------------------------------------------------------------------------

describe("Idempotency-Key header", () => {
  it("is set on idempotent POST requests like createUser", async () => {
    const fetcher = mockFetcher(ok({ user: { id: "u1" } }));
    const client = new ApiServiceClient(fetcher as any);
    await client.createUser({ user: { id: "u1", displayName: "A" } });
    const req = await getLastRequest(fetcher);
    expect(req.headers["idempotency-key"]).toBeDefined();
    expect(req.headers["idempotency-key"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("is set on likeMatch (idempotent)", async () => {
    const fetcher = mockFetcher(ok({ isMutual: false }));
    const client = new ApiServiceClient(fetcher as any);
    await client.likeMatch({ matchId: "m1", userId: "u1" });
    const req = await getLastRequest(fetcher);
    expect(req.headers["idempotency-key"]).toBeDefined();
  });

  it("is NOT set on non-idempotent GET requests like getUser", async () => {
    const fetcher = mockFetcher(ok({ user: { id: "u1" } }));
    const client = new ApiServiceClient(fetcher as any);
    await client.getUser({ userId: "u1" });
    const req = await getLastRequest(fetcher);
    expect(req.headers["idempotency-key"]).toBeUndefined();
  });

  it("is NOT set on non-idempotent PUT requests like updateUser", async () => {
    const fetcher = mockFetcher(ok({ user: { id: "u1" } }));
    const client = new ApiServiceClient(fetcher as any);
    await client.updateUser({
      userId: "u1",
      user: { id: "u1", displayName: "X" },
    });
    const req = await getLastRequest(fetcher);
    expect(req.headers["idempotency-key"]).toBeUndefined();
  });
});

// --------------------------------------------------------------------------
// Non-JSON error response handling
// --------------------------------------------------------------------------

describe("Non-JSON error response", () => {
  it("handles error response with text body (not JSON)", async () => {
    const textResponse = new Response("plain text error", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
    const { client } = createClient(textResponse);
    let error: any;
    try {
      await client.getUser({ userId: "u1" });
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(error.name).toBe("ApiError");
    expect(error.status).toBe(500);
    expect(error.endpoint).toBe("/users/u1");
  });

  it("handles error response with empty body", async () => {
    const emptyResponse = new Response(null, { status: 503 });
    const { client } = createClient(emptyResponse);
    let error: any;
    try {
      await client.getUser({ userId: "u1" });
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(error.name).toBe("ApiError");
    expect(error.status).toBe(503);
    expect(error.endpoint).toBe("/users/u1");
  });
});

// --------------------------------------------------------------------------
// Constructor & edge-case checks
// --------------------------------------------------------------------------

describe("ApiServiceClient constructor", () => {
  it("accepts a Fetcher binding", () => {
    const fetcher = { fetch: vi.fn(), connect: vi.fn() } as unknown as Fetcher;
    const client = new ApiServiceClient(fetcher);
    expect(client).toBeInstanceOf(ApiServiceClient);
  });
});
