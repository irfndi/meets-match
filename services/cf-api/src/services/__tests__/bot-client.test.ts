import { describe, it, expect, vi } from "vitest";
import { BotServiceClient } from "../bot-client.js";

// --------------------------------------------------------------------------
// Test helpers (mirrors api-client.test.ts pattern)
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
  client: BotServiceClient;
  fetcher: MockFetcher;
} {
  const fetcher = mockFetcher(response);
  const client = new BotServiceClient(fetcher as any);
  return { client, fetcher };
}

async function getLastRequest(
  fetcher: MockFetcher,
): Promise<CapturedRequest> {
  expect(fetcher.fetch).toHaveBeenCalledTimes(1);
  const call = fetcher.fetch.mock.calls[0];
  if (!call) throw new Error("fetch was not called");
  const req: Request = call[0] as Request;
  return captureRequest(req);
}

// --------------------------------------------------------------------------
// sendNotification
// --------------------------------------------------------------------------

describe("sendNotification", () => {
  const requestBody = {
    userId: "u1",
    type: "MUTUAL_MATCH" as const,
    title: "You have a match!",
    body: "Someone likes you back",
    payload: '{"matchId":"m1"}',
  };
  const response = { success: true };

  it("sends POST to bot/send-notification with correct JSON body", async () => {
    const { client, fetcher } = createClient(ok(response));
    const result = await client.sendNotification(requestBody);
    expect(result).toEqual(response);
    const req = await getLastRequest(fetcher);
    expect(req.method).toBe("POST");
    expect(req.url).toBe("http://bot/send-notification");
    expect(req.headers["content-type"]).toBe("application/json");
    expect(req.body).toEqual(requestBody);
  });

  it("sends POST with minimal required fields", async () => {
    const minimalBody = {
      userId: "u2",
      type: "WELCOME" as const,
    };
    const { client, fetcher } = createClient(ok(response));
    await client.sendNotification(minimalBody);
    const req = await getLastRequest(fetcher);
    expect(req.method).toBe("POST");
    expect(req.url).toBe("http://bot/send-notification");
    expect(req.headers["content-type"]).toBe("application/json");
    expect(req.body).toEqual(minimalBody);
  });

  it("throws Error with Bot service status code on failure", async () => {
    const { client } = createClient(err(500));
    await expect(client.sendNotification(requestBody)).rejects.toThrow(
      "Bot service error: 500",
    );
  });

  it("throws Error with different status codes on failure", async () => {
    const { client } = createClient(err(429));
    await expect(client.sendNotification(requestBody)).rejects.toThrow(
      "Bot service error: 429",
    );
  });

  it("propagates network errors when fetch rejects", async () => {
    const networkError = new Error("Connection refused");
    const fetcher = {
      fetch: vi.fn<() => Promise<never>>().mockRejectedValue(networkError),
    };
    const client = new BotServiceClient(fetcher as any);
    await expect(client.sendNotification(requestBody)).rejects.toThrow(
      "Connection refused",
    );
  });
});

// --------------------------------------------------------------------------
// enqueueNotification
// --------------------------------------------------------------------------

describe("enqueueNotification", () => {
  it("throws Error with 'Not implemented' message", async () => {
    const fetcher = { fetch: vi.fn() };
    const client = new BotServiceClient(fetcher as any);
    await expect(
      client.enqueueNotification({} as any),
    ).rejects.toThrow("Not implemented");
  });
});

// --------------------------------------------------------------------------
// getNotification
// --------------------------------------------------------------------------

describe("getNotification", () => {
  it("throws Error with 'Not implemented' message", async () => {
    const fetcher = { fetch: vi.fn() };
    const client = new BotServiceClient(fetcher as any);
    await expect(
      client.getNotification({} as any),
    ).rejects.toThrow("Not implemented");
  });
});

// --------------------------------------------------------------------------
// getDLQStats
// --------------------------------------------------------------------------

describe("getDLQStats", () => {
  it("throws Error with 'Not implemented' message", async () => {
    const fetcher = { fetch: vi.fn() };
    const client = new BotServiceClient(fetcher as any);
    await expect(
      client.getDLQStats({} as any),
    ).rejects.toThrow("Not implemented");
  });
});

// --------------------------------------------------------------------------
// replayDLQ
// --------------------------------------------------------------------------

describe("replayDLQ", () => {
  it("throws Error with 'Not implemented' message", async () => {
    const fetcher = { fetch: vi.fn() };
    const client = new BotServiceClient(fetcher as any);
    await expect(
      client.replayDLQ({} as any),
    ).rejects.toThrow("Not implemented");
  });
});

// --------------------------------------------------------------------------
// getQueueStats
// --------------------------------------------------------------------------

describe("getQueueStats", () => {
  it("throws Error with 'Not implemented' message", async () => {
    const fetcher = { fetch: vi.fn() };
    const client = new BotServiceClient(fetcher as any);
    await expect(
      client.getQueueStats({} as any),
    ).rejects.toThrow("Not implemented");
  });
});

// --------------------------------------------------------------------------
// getReengagementCandidates
// --------------------------------------------------------------------------

describe("getReengagementCandidates", () => {
  it("throws Error with 'Not implemented' message", async () => {
    const fetcher = { fetch: vi.fn() };
    const client = new BotServiceClient(fetcher as any);
    await expect(
      client.getReengagementCandidates({} as any),
    ).rejects.toThrow("Not implemented");
  });
});

// --------------------------------------------------------------------------
// logNotificationResult
// --------------------------------------------------------------------------

describe("logNotificationResult", () => {
  it("throws Error with 'Not implemented' message", async () => {
    const fetcher = { fetch: vi.fn() };
    const client = new BotServiceClient(fetcher as any);
    await expect(
      client.logNotificationResult({} as any),
    ).rejects.toThrow("Not implemented");
  });
});

// --------------------------------------------------------------------------
// BotServiceClient constructor
// --------------------------------------------------------------------------

describe("BotServiceClient constructor", () => {
  it("accepts a Fetcher binding", () => {
    const fetcher = { fetch: vi.fn(), connect: vi.fn() } as unknown as Fetcher;
    const client = new BotServiceClient(fetcher);
    expect(client).toBeInstanceOf(BotServiceClient);
  });
});
