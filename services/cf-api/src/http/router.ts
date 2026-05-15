import { Effect, Exit, Cause } from "effect";
import type { D1Database, KVNamespace, Queue } from "@cloudflare/workers-types";
import { UserRepository } from "../models/user.js";
import { MatchRepository } from "../models/match.js";
import { NotificationRepository } from "../models/notification.js";
import { GeocodingService } from "../models/geocoding.js";
import { AppError, NotFoundError, DatabaseError } from "@meetsmatch/cf-shared";

async function runEffect<A, E>(effect: Effect.Effect<A, E, never>): Promise<A> {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }
  const failureOption = Cause.failureOption(exit.cause);
  if (failureOption._tag === "Some") {
    throw failureOption.value;
  }
  throw new Error(String(exit.cause));
}

export interface ApiEnv {
  DB: D1Database;
  KV: KVNamespace;
  NOTIFICATION_QUEUE: Queue;
}

export class ApiRouter {
  private readonly userRepo: UserRepository;
  private readonly matchRepo: MatchRepository;
  private readonly notificationRepo: NotificationRepository;
  private readonly geoService: GeocodingService;

  constructor(private readonly env: ApiEnv) {
    this.userRepo = new UserRepository(env.DB);
    this.matchRepo = new MatchRepository(env.DB, this.userRepo);
    this.notificationRepo = new NotificationRepository(env.DB);
    this.geoService = new GeocodingService(env.KV);
  }

  async route(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;

    try {
      switch (true) {
        case url.pathname === "/health":
          return jsonResponse({ status: "ok", service: "cf-api" });

        case url.pathname === "/users" && method === "POST":
          return this.handleCreateUser(request);
        case url.pathname.startsWith("/users/") && url.pathname.endsWith("/potential-matches") && method === "GET":
          return this.handleGetPotentialMatches(url.pathname, url.searchParams);
        case url.pathname.startsWith("/users/") && url.pathname.endsWith("/pending-likes") && method === "GET":
          return this.handleGetPendingLikes(url.pathname);
        case url.pathname.startsWith("/users/") && method === "GET":
          return this.handleGetUser(url.pathname);
        case url.pathname.startsWith("/users/") && url.pathname.endsWith("/last-active") && method === "POST":
          return this.handleUpdateLastActive(url.pathname);
        case url.pathname.startsWith("/users/") && url.pathname.endsWith("/last-reminded-at") && method === "POST":
          return this.handleUpdateLastRemindedAt(url.pathname);
        case url.pathname.startsWith("/users/") && url.pathname.endsWith("/swipe-status") && method === "GET":
          return this.handleGetSwipeStatus(url.pathname);
        case url.pathname.startsWith("/users/") && url.pathname.endsWith("/record-swipe") && method === "POST":
          return this.handleRecordSwipe(url.pathname);
        case url.pathname.startsWith("/users/") && url.pathname.endsWith("/referral") && method === "GET":
          return this.handleGetReferralCode(url.pathname);
        case url.pathname.startsWith("/users/") && url.pathname.endsWith("/apply-referral") && method === "POST":
          return this.handleApplyReferral(url.pathname, request);
        case url.pathname.startsWith("/users/") && method === "PUT":
          return this.handleUpdateUser(url.pathname, request);
        case url.pathname === "/matches" && method === "GET":
          return this.handleGetMatchList(url.searchParams);
        case url.pathname === "/matches" && method === "POST":
          return this.handleCreateMatch(request);
        case url.pathname.startsWith("/matches/") && method === "GET":
          return this.handleGetMatch(url.pathname);
        case url.pathname.startsWith("/matches/") && method === "POST":
          return this.handleMatchAction(url.pathname, request);
        case url.pathname === "/notifications" && method === "POST":
          return this.handleEnqueueNotification(request);
        case url.pathname === "/geocode" && method === "GET":
          return this.handleGeocode(url.searchParams);
        case url.pathname === "/queue-stats" && method === "GET":
          return this.handleQueueStats();
        default:
          return jsonResponse({ error: "Not Found" }, 404);
      }
    } catch (error) {
      console.error("API error:", error);
      return jsonResponse({ error: "Internal Server Error" }, 500);
    }
  }

  private async handleCreateUser(request: Request): Promise<Response> {
    const body = await request.json() as Record<string, unknown>;
    const result = await runEffect(this.userRepo.create({ user: body.user as typeof import("@meetsmatch/cf-shared").User.Type }));
    return jsonResponse({ user: result }, 201);
  }

  private async handleGetUser(path: string): Promise<Response> {
    const userId = path.replace("/users/", "");
    try {
      const result = await runEffect(this.userRepo.getById({ userId }));
      return jsonResponse({ user: result });
    } catch (error) {
      if (error instanceof NotFoundError) return jsonResponse({ error: error.message }, 404);
      return jsonResponse({ error: "Database error" }, 500);
    }
  }

  private async handleGetPotentialMatches(path: string, searchParams: URLSearchParams): Promise<Response> {
    const userId = path.replace("/users/", "").replace("/potential-matches", "");
    if (!userId) {
      return jsonResponse({ error: "user_id is required" }, 400);
    }
    const limitRaw = searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : 10;
    if (Number.isNaN(limit) || limit < 1 || limit > 50) {
      return jsonResponse({ error: "limit must be a number between 1 and 50" }, 400);
    }
    try {
      const result = await runEffect(this.matchRepo.getPotentialMatches({ userId, limit }));
      return jsonResponse({ potentialMatches: result });
    } catch (error) {
      return jsonResponse({ error: "Failed to get potential matches" }, 500);
    }
  }

  private async handleGetPendingLikes(path: string): Promise<Response> {
    const userId = path.replace("/users/", "").replace("/pending-likes", "");
    if (!userId) {
      return jsonResponse({ error: "user_id is required" }, 400);
    }
    try {
      const result = await runEffect(this.matchRepo.getPendingLikes({ userId }));
      return jsonResponse({ pendingLikes: result });
    } catch (error) {
      return jsonResponse({ error: "Failed to get pending likes" }, 500);
    }
  }

  private async handleUpdateLastActive(path: string): Promise<Response> {
    const userId = path.replace("/users/", "").replace("/last-active", "");
    try {
      await runEffect(this.userRepo.updateLastActive({ userId }));
      return jsonResponse({ success: true });
    } catch (error) {
      return jsonResponse({ error: "Database error" }, 500);
    }
  }

  private async handleUpdateLastRemindedAt(path: string): Promise<Response> {
    const userId = path.replace("/users/", "").replace("/last-reminded-at", "");
    try {
      await runEffect(this.userRepo.updateLastRemindedAt({ userId }));
      return jsonResponse({ success: true });
    } catch (error) {
      return jsonResponse({ error: "Database error" }, 500);
    }
  }

  private async handleUpdateUser(path: string, request: Request): Promise<Response> {
    const userId = path.replace("/users/", "");
    const body = await request.json() as Record<string, unknown>;
    try {
      const result = await runEffect(this.userRepo.update({ userId, user: body.user as typeof import("@meetsmatch/cf-shared").User.Type, updateMask: body.updateMask as string[] }));
      return jsonResponse({ user: result });
    } catch (error) {
      if (error instanceof NotFoundError) return jsonResponse({ error: error.message }, 404);
      return jsonResponse({ error: "Database error" }, 500);
    }
  }

  private async handleCreateMatch(request: Request): Promise<Response> {
    const body = await request.json() as Record<string, unknown>;
    const result = await runEffect(this.matchRepo.create({ user1Id: String(body.user1Id), user2Id: String(body.user2Id) }));
    return jsonResponse({ match: result }, 201);
  }

  private async handleGetMatchList(searchParams: URLSearchParams): Promise<Response> {
    const userId = searchParams.get("userId");
    if (!userId) {
      return jsonResponse({ error: "user_id is required" }, 400);
    }
    const statusRaw = searchParams.get("status");
    const allowedStatuses = new Set(["PENDING", "MATCHED", "REJECTED"]);
    const status = statusRaw ? statusRaw.toUpperCase() : undefined;
    if (status && !allowedStatuses.has(status)) {
      return jsonResponse({ error: "Invalid status" }, 400);
    }
    const limitRaw = searchParams.get("limit");
    let limit: number | undefined;
    if (limitRaw) {
      limit = Number(limitRaw);
      if (Number.isNaN(limit) || limit < 1 || limit > 100) {
        return jsonResponse({ error: "limit must be between 1 and 100" }, 400);
      }
    }
    try {
      const result = await runEffect(this.matchRepo.getList({ userId, status: status as typeof import("@meetsmatch/cf-shared").MatchStatus.Type | undefined, limit }));
      return jsonResponse({ matches: result });
    } catch (error) {
      return jsonResponse({ error: "Failed to get matches" }, 500);
    }
  }

  private async handleGetMatch(path: string): Promise<Response> {
    const matchId = path.replace("/matches/", "");
    try {
      const result = await runEffect(this.matchRepo.getById({ matchId }));
      return jsonResponse({ match: result });
    } catch (error) {
      if (error instanceof NotFoundError) return jsonResponse({ error: error.message }, 404);
      return jsonResponse({ error: "Database error" }, 500);
    }
  }

  private async handleMatchAction(path: string, request: Request): Promise<Response> {
    const parts = path.replace("/matches/", "").split("/");
    const matchId = parts[0];
    const action = parts[1];
    const body = await request.json() as Record<string, unknown>;
    const userId = String(body.userId);

    try {
      switch (action) {
        case "like": {
          const result = await runEffect(this.matchRepo.like({ matchId, userId }));
          return jsonResponse(result);
        }
        case "dislike": {
          const result = await runEffect(this.matchRepo.dislike({ matchId, userId }));
          return jsonResponse(result);
        }
        case "skip": {
          const result = await runEffect(this.matchRepo.skip({ matchId, userId }));
          return jsonResponse(result);
        }
        default:
          return jsonResponse({ error: "Invalid action" }, 400);
      }
    } catch (error) {
      if (error instanceof NotFoundError) return jsonResponse({ error: error.message }, 404);
      return jsonResponse({ error: "Database error" }, 500);
    }
  }

  private async handleEnqueueNotification(request: Request): Promise<Response> {
    const body = await request.json() as Record<string, unknown>;
    let notification: typeof import("@meetsmatch/cf-shared").Notification.Type | null = null;
    try {
      notification = await runEffect(this.notificationRepo.create({
        userId: String(body.userId),
        type: String(body.type) as typeof import("@meetsmatch/cf-shared").NotificationType.Type,
        channel: body.channel ? String(body.channel) as typeof import("@meetsmatch/cf-shared").NotificationChannel.Type : undefined,
        payload: body.payload ? (typeof body.payload === "string" ? body.payload : JSON.stringify(body.payload)) : undefined,
        scheduledAt: body.scheduledAt ? String(body.scheduledAt) : undefined,
      }));

      await this.env.NOTIFICATION_QUEUE.send(JSON.stringify({
        notificationId: notification.id,
        userId: notification.userId,
        type: notification.type,
        payload: notification.payload,
      }));

      return jsonResponse(notification, 202);
    } catch (error) {
      if (notification) {
        await runEffect(this.notificationRepo.markFailed(notification.id, "Queue send failed")).catch(() => {});
      }
      return jsonResponse({ error: "Failed to enqueue notification" }, 500);
    }
  }

  private async handleGeocode(params: URLSearchParams): Promise<Response> {
    const query = params.get("q");
    const lat = params.get("lat");
    const lon = params.get("lon");

    try {
      if (query) {
        const limitRaw = params.get("limit");
        const limit = limitRaw ? Number(limitRaw) : 5;
        if (Number.isNaN(limit) || limit < 1 || limit > 50) {
          return jsonResponse({ error: "limit must be a number between 1 and 50" }, 400);
        }
        const results = await runEffect(this.geoService.searchCities(query, { limit }));
        return jsonResponse({ results });
      }
      if (lat && lon) {
        const latNum = Number(lat);
        const lonNum = Number(lon);
        if (Number.isNaN(latNum) || Number.isNaN(lonNum) || latNum < -90 || latNum > 90 || lonNum < -180 || lonNum > 180) {
          return jsonResponse({ error: "lat must be between -90 and 90, lon between -180 and 180" }, 400);
        }
        const result = await runEffect(this.geoService.reverseGeocode(latNum, lonNum));
        return jsonResponse({ result });
      }
      return jsonResponse({ error: "Missing query or lat/lon" }, 400);
    } catch (error) {
      return jsonResponse({ error: "Geocoding error" }, 500);
    }
  }

  private async handleQueueStats(): Promise<Response> {
    try {
      const result = await runEffect(this.notificationRepo.getQueueStats());
      return jsonResponse(result);
    } catch (error) {
      return jsonResponse({ error: "Failed to get stats" }, 500);
    }
  }

  private async handleGetSwipeStatus(path: string): Promise<Response> {
    const userId = path.replace("/users/", "").replace("/swipe-status", "");
    try {
      const status = await runEffect(this.userRepo.getSwipeStatus(userId));
      return jsonResponse(status);
    } catch (error) {
      if (error instanceof NotFoundError) return jsonResponse({ error: error.message }, 404);
      return jsonResponse({ error: "Failed to get swipe status" }, 500);
    }
  }

  private async handleRecordSwipe(path: string): Promise<Response> {
    const userId = path.replace("/users/", "").replace("/record-swipe", "");
    try {
      const result = await runEffect(this.userRepo.recordSwipe(userId));
      return jsonResponse(result);
    } catch (error) {
      if (error instanceof NotFoundError) return jsonResponse({ error: error.message }, 404);
      return jsonResponse({ error: "Failed to record swipe" }, 500);
    }
  }

  private async handleGetReferralCode(path: string): Promise<Response> {
    const userId = path.replace("/users/", "").replace("/referral", "");
    try {
      const code = await runEffect(this.userRepo.getOrCreateReferralCode(userId));
      return jsonResponse({ code });
    } catch (error) {
      if (error instanceof NotFoundError) return jsonResponse({ error: error.message }, 404);
      return jsonResponse({ error: "Failed to get referral code" }, 500);
    }
  }

  private async handleApplyReferral(path: string, request: Request): Promise<Response> {
    const userId = path.replace("/users/", "").replace("/apply-referral", "");
    try {
      const body = await request.json() as Record<string, unknown>;
      const code = String(body.code ?? "");
      const result = await runEffect(this.userRepo.applyReferral(userId, code));
      return jsonResponse(result, result.success ? 200 : 400);
    } catch (error) {
      if (error instanceof NotFoundError) return jsonResponse({ error: error.message }, 404);
      return jsonResponse({ error: "Failed to apply referral" }, 500);
    }
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
