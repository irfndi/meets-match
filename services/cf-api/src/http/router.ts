import { Effect, Exit, Cause } from "effect";
import type {
  D1Database,
  KVNamespace,
  Queue,
  R2Bucket,
} from "@cloudflare/workers-types";
import { UserRepository } from "../models/user.js";
import { MatchRepository } from "../models/match.js";
import { NotificationRepository } from "../models/notification.js";
import { ReportRepository } from "../models/report.js";
import { FeedbackRepository } from "../models/feedback.js";
import { BlockRepository } from "../models/block.js";
import { GeocodingService } from "../models/geocoding.js";
import {
  AppError,
  NotFoundError,
  DatabaseError,
  ValidationError,
  createLogger,
  buildMediaKey,
  buildMediaPublicUrl,
  extractMediaKeyFromUrl,
} from "@meetsmatch/cf-shared";
import { getVersionInfo } from "../lib/version.js";

const log = createLogger("cf-api");

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
  MEDIA_BUCKET: R2Bucket;
}

export class ApiRouter {
  private readonly userRepo: UserRepository;
  private readonly matchRepo: MatchRepository;
  private readonly notificationRepo: NotificationRepository;
  private readonly reportRepo: ReportRepository;
  private readonly feedbackRepo: FeedbackRepository;
  private readonly blockRepo: BlockRepository;
  private readonly geoService: GeocodingService;

  constructor(private readonly env: ApiEnv) {
    this.userRepo = new UserRepository(env.DB);
    this.blockRepo = new BlockRepository(env.DB);
    this.matchRepo = new MatchRepository(env.DB, this.userRepo, this.blockRepo);
    this.notificationRepo = new NotificationRepository(env.DB);
    this.reportRepo = new ReportRepository(env.DB);
    this.feedbackRepo = new FeedbackRepository(env.DB);
    this.geoService = new GeocodingService(env.KV);
  }

  async route(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;

    try {
      switch (true) {
        case url.pathname === "/health":
          return jsonResponse({
            status: "ok",
            service: "cf-api",
            version: getVersionInfo(),
          });

        case url.pathname === "/users" && method === "POST":
          return this.handleCreateUser(request);
        case url.pathname.startsWith("/users/") &&
          url.pathname.endsWith("/potential-matches") &&
          method === "GET":
          return this.handleGetPotentialMatches(url.pathname, url.searchParams);
        case url.pathname.startsWith("/users/") &&
          url.pathname.endsWith("/pending-likes") &&
          method === "GET":
          return this.handleGetPendingLikes(url.pathname);
        case url.pathname.startsWith("/users/") &&
          url.pathname.endsWith("/swipe-status") &&
          method === "GET":
          return this.handleGetSwipeStatus(url.pathname);
        case url.pathname.startsWith("/users/") &&
          url.pathname.endsWith("/record-swipe") &&
          method === "POST":
          return this.handleRecordSwipe(url.pathname);
        case url.pathname.startsWith("/users/") &&
          url.pathname.endsWith("/interaction-status") &&
          method === "GET":
          return this.handleGetInteractionStatus(url.pathname);
        case url.pathname.startsWith("/users/") &&
          url.pathname.endsWith("/record-like") &&
          method === "POST":
          return this.handleRecordLike(url.pathname);
        case url.pathname.startsWith("/users/") &&
          url.pathname.endsWith("/record-dislike") &&
          method === "POST":
          return this.handleRecordDislike(url.pathname);
        case url.pathname.startsWith("/users/") &&
          url.pathname.endsWith("/referral") &&
          method === "GET":
          return this.handleGetReferralCode(url.pathname);
        case url.pathname.startsWith("/users/") &&
          url.pathname.endsWith("/apply-referral") &&
          method === "POST":
          return this.handleApplyReferral(url.pathname, request);
        case url.pathname.startsWith("/users/") &&
          url.pathname.endsWith("/dm-status") &&
          method === "GET":
          return this.handleGetDMStatus(url.pathname);
        case url.pathname.startsWith("/users/") &&
          url.pathname.endsWith("/send-dm") &&
          method === "POST":
          return this.handleSendDM(url.pathname);
        case url.pathname.startsWith("/users/") &&
          url.pathname.endsWith("/purchase-dm-credits") &&
          method === "POST":
          return this.handlePurchaseDMCredits(url.pathname, request);
        case url.pathname.startsWith("/users/") &&
          url.pathname.endsWith("/media") &&
          method === "POST":
          return this.handleUploadMedia(url.pathname, request);
        case url.pathname.startsWith("/users/") &&
          url.pathname.endsWith("/media") &&
          method === "DELETE":
          return this.handleDeleteMedia(url.pathname, request);
        case url.pathname.startsWith("/users/") &&
          url.pathname.endsWith("/restore-profile") &&
          method === "POST":
          return this.handleRestoreProfile(url.pathname);
        case url.pathname.startsWith("/users/") &&
          url.pathname.endsWith("/report") &&
          method === "POST":
          return this.handleReport(url.pathname, request);
        case url.pathname.startsWith("/users/") &&
          url.pathname.endsWith("/interact") &&
          method === "POST":
          return this.handleInteract(url.pathname);
        case url.pathname.startsWith("/users/") &&
          url.pathname.endsWith("/block") &&
          method === "POST":
          return this.handleBlock(url.pathname, request);
        case url.pathname.startsWith("/users/") &&
          url.pathname.endsWith("/unblock") &&
          method === "POST":
          return this.handleUnblock(url.pathname, request);
        case url.pathname.startsWith("/users/") &&
          url.pathname.endsWith("/last-active") &&
          method === "POST":
          return this.handleUpdateLastActive(url.pathname);
        case url.pathname.startsWith("/users/") &&
          url.pathname.endsWith("/last-reminded-at") &&
          method === "POST":
          return this.handleUpdateLastRemindedAt(url.pathname);
        case url.pathname.startsWith("/users/") && method === "GET":
          return this.handleGetUser(url.pathname);
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
        case url.pathname === "/feedback" && method === "POST":
          return this.handleFeedback(request);
        case url.pathname === "/cron/downgrade-expired-subscriptions" &&
          method === "POST":
          return this.handleDowngradeExpiredSubscriptions();
        default:
          return jsonResponse({ error: "Not Found" }, 404);
      }
    } catch (error) {
      log.error("route", "Unhandled API error", undefined, error);
      return jsonResponse({ error: "Internal Server Error" }, 500);
    }
  }

  private async handleCreateUser(request: Request): Promise<Response> {
    const body = (await request.json()) as Record<string, unknown>;
    const result = await runEffect(
      this.userRepo.create({
        user: body.user as typeof import("@meetsmatch/cf-shared").User.Type,
      }),
    );
    return jsonResponse({ user: result }, 201);
  }

  private async handleGetUser(path: string): Promise<Response> {
    const userId = path.replace("/users/", "");
    try {
      const result = await runEffect(this.userRepo.getById({ userId }));
      return jsonResponse({ user: result });
    } catch (error) {
      if (error instanceof NotFoundError)
        return jsonResponse({ error: error.message }, 404);
      if (error instanceof ValidationError)
        return jsonResponse({ error: error.message }, 400);
      log.error("getUser", "Handler failed", undefined, error);
      return jsonResponse({ error: "Database error" }, 500);
    }
  }

  private async handleGetPotentialMatches(
    path: string,
    searchParams: URLSearchParams,
  ): Promise<Response> {
    const userId = path
      .replace("/users/", "")
      .replace("/potential-matches", "");
    if (!userId) {
      return jsonResponse({ error: "user_id is required" }, 400);
    }
    const limitRaw = searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : 10;
    if (Number.isNaN(limit) || limit < 1 || limit > 50) {
      return jsonResponse(
        { error: "limit must be a number between 1 and 50" },
        400,
      );
    }
    try {
      let result = await runEffect(
        this.matchRepo.getPotentialMatches({ userId, limit }),
      );
      let relaxed = false;

      // If strict filters return nothing, try soft relaxed filters
      if (result.length === 0) {
        result = await runEffect(
          this.matchRepo.getPotentialMatches({
            userId,
            limit,
            relaxFilters: true,
          }),
        );
        relaxed = result.length > 0;
      }

      return jsonResponse({ potentialMatches: result, relaxed });
    } catch (error) {
      log.error("potentialMatches", "Handler failed", undefined, error);
      return jsonResponse({ error: "Failed to get potential matches" }, 500);
    }
  }

  private async handleGetPendingLikes(path: string): Promise<Response> {
    const userId = path.replace("/users/", "").replace("/pending-likes", "");
    if (!userId) {
      return jsonResponse({ error: "user_id is required" }, 400);
    }
    try {
      const result = await runEffect(
        this.matchRepo.getPendingLikes({ userId }),
      );
      return jsonResponse({ pendingLikes: result });
    } catch (error) {
      log.error("pendingLikes", "Handler failed", undefined, error);
      return jsonResponse({ error: "Failed to get pending likes" }, 500);
    }
  }

  private async handleUpdateLastActive(path: string): Promise<Response> {
    const userId = path.replace("/users/", "").replace("/last-active", "");
    try {
      await runEffect(this.userRepo.updateLastActive({ userId }));
      return jsonResponse({ success: true });
    } catch (error) {
      log.error("lastActive", "Handler failed", undefined, error);
      return jsonResponse({ error: "Database error" }, 500);
    }
  }

  private async handleUpdateLastRemindedAt(path: string): Promise<Response> {
    const userId = path.replace("/users/", "").replace("/last-reminded-at", "");
    try {
      await runEffect(this.userRepo.updateLastRemindedAt({ userId }));
      return jsonResponse({ success: true });
    } catch (error) {
      log.error("lastRemindedAt", "Handler failed", undefined, error);
      return jsonResponse({ error: "Database error" }, 500);
    }
  }

  private async handleUpdateUser(
    path: string,
    request: Request,
  ): Promise<Response> {
    const userId = path.replace("/users/", "");
    const body = (await request.json()) as Record<string, unknown>;
    try {
      const result = await runEffect(
        this.userRepo.update({
          userId,
          user: body.user as typeof import("@meetsmatch/cf-shared").User.Type,
          updateMask: body.updateMask as string[],
        }),
      );
      return jsonResponse({ user: result });
    } catch (error) {
      if (error instanceof NotFoundError)
        return jsonResponse({ error: error.message }, 404);
      log.error("updateUser", "Handler failed", undefined, error);
      return jsonResponse({ error: "Database error" }, 500);
    }
  }

  private async handleCreateMatch(request: Request): Promise<Response> {
    const body = (await request.json()) as Record<string, unknown>;
    const result = await runEffect(
      this.matchRepo.create({
        user1Id: String(body.user1Id),
        user2Id: String(body.user2Id),
      }),
    );
    return jsonResponse({ match: result }, 201);
  }

  private async handleGetMatchList(
    searchParams: URLSearchParams,
  ): Promise<Response> {
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
      const result = await runEffect(
        this.matchRepo.getList({
          userId,
          status: status as
            | typeof import("@meetsmatch/cf-shared").MatchStatus.Type
            | undefined,
          limit,
        }),
      );
      return jsonResponse({ matches: result });
    } catch (error) {
      log.error("matchList", "Handler failed", undefined, error);
      return jsonResponse({ error: "Failed to get matches" }, 500);
    }
  }

  private async handleGetMatch(path: string): Promise<Response> {
    const matchId = path.replace("/matches/", "");
    try {
      const result = await runEffect(this.matchRepo.getById({ matchId }));
      return jsonResponse({ match: result });
    } catch (error) {
      if (error instanceof NotFoundError)
        return jsonResponse({ error: error.message }, 404);
      log.error("getMatch", "Handler failed", undefined, error);
      return jsonResponse({ error: "Database error" }, 500);
    }
  }

  private async handleMatchAction(
    path: string,
    request: Request,
  ): Promise<Response> {
    const parts = path.replace("/matches/", "").split("/");
    const matchId = parts[0];
    const action = parts[1];
    const body = (await request.json()) as Record<string, unknown>;
    const userId = String(body.userId);

    try {
      switch (action) {
        case "like": {
          const message = body.message as
            | { text?: string; mediaUrl?: string }
            | undefined;
          const result = await runEffect(
            this.matchRepo.like({ matchId, userId, message }),
          );
          return jsonResponse(result);
        }
        case "dislike": {
          const result = await runEffect(
            this.matchRepo.dislike({ matchId, userId }),
          );
          return jsonResponse(result);
        }
        case "skip": {
          const result = await runEffect(
            this.matchRepo.skip({ matchId, userId }),
          );
          return jsonResponse(result);
        }
        case "undo": {
          const result = await runEffect(
            this.matchRepo.undo({ matchId, userId }),
          );
          return jsonResponse(result);
        }
        default:
          return jsonResponse({ error: "Invalid action" }, 400);
      }
    } catch (error) {
      if (error instanceof NotFoundError)
        return jsonResponse({ error: error.message }, 404);
      log.error("matchAction", "Handler failed", undefined, error);
      return jsonResponse({ error: "Database error" }, 500);
    }
  }

  private async handleEnqueueNotification(request: Request): Promise<Response> {
    const body = (await request.json()) as Record<string, unknown>;
    let notification:
      | typeof import("@meetsmatch/cf-shared").Notification.Type
      | null = null;
    try {
      notification = await runEffect(
        this.notificationRepo.create({
          userId: String(body.userId),
          type: String(
            body.type,
          ) as typeof import("@meetsmatch/cf-shared").NotificationType.Type,
          channel: body.channel
            ? (String(
                body.channel,
              ) as typeof import("@meetsmatch/cf-shared").NotificationChannel.Type)
            : undefined,
          payload: body.payload
            ? typeof body.payload === "string"
              ? body.payload
              : JSON.stringify(body.payload)
            : undefined,
          scheduledAt: body.scheduledAt ? String(body.scheduledAt) : undefined,
        }),
      );

      await this.env.NOTIFICATION_QUEUE.send(
        JSON.stringify({
          notificationId: notification.id,
          userId: notification.userId,
          type: notification.type,
          payload: notification.payload,
        }),
      );

      return jsonResponse(notification, 202);
    } catch (error) {
      if (notification) {
        await runEffect(
          this.notificationRepo.markFailed(
            notification.id,
            "Queue send failed",
          ),
        ).catch(() => {});
      }
      log.error("enqueueNotification", "Handler failed", undefined, error);
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
          return jsonResponse(
            { error: "limit must be a number between 1 and 50" },
            400,
          );
        }
        const results = await runEffect(
          this.geoService.searchCities(query, { limit }),
        );
        return jsonResponse({ results });
      }
      if (lat && lon) {
        const latNum = Number(lat);
        const lonNum = Number(lon);
        if (
          Number.isNaN(latNum) ||
          Number.isNaN(lonNum) ||
          latNum < -90 ||
          latNum > 90 ||
          lonNum < -180 ||
          lonNum > 180
        ) {
          return jsonResponse(
            {
              error: "lat must be between -90 and 90, lon between -180 and 180",
            },
            400,
          );
        }
        const result = await runEffect(
          this.geoService.reverseGeocode(latNum, lonNum),
        );
        return jsonResponse({ result });
      }
      return jsonResponse({ error: "Missing query or lat/lon" }, 400);
    } catch (error) {
      log.error("geocode", "Handler failed", undefined, error);
      return jsonResponse({ error: "Geocoding error" }, 500);
    }
  }

  private async handleQueueStats(): Promise<Response> {
    try {
      const result = await runEffect(this.notificationRepo.getQueueStats());
      return jsonResponse(result);
    } catch (error) {
      log.error("queueStats", "Handler failed", undefined, error);
      return jsonResponse({ error: "Failed to get stats" }, 500);
    }
  }

  private async handleGetSwipeStatus(path: string): Promise<Response> {
    const userId = path.replace("/users/", "").replace("/swipe-status", "");
    try {
      const status = await runEffect(this.userRepo.getSwipeStatus(userId));
      return jsonResponse(status);
    } catch (error) {
      if (error instanceof NotFoundError)
        return jsonResponse({ error: error.message }, 404);
      log.error("swipeStatus", "Handler failed", undefined, error);
      return jsonResponse({ error: "Failed to get swipe status" }, 500);
    }
  }

  private async handleRecordSwipe(path: string): Promise<Response> {
    const userId = path.replace("/users/", "").replace("/record-swipe", "");
    try {
      const result = await runEffect(this.userRepo.recordSwipe(userId));
      return jsonResponse(result);
    } catch (error) {
      if (error instanceof NotFoundError)
        return jsonResponse({ error: error.message }, 404);
      log.error("recordSwipe", "Handler failed", undefined, error);
      return jsonResponse({ error: "Failed to record swipe" }, 500);
    }
  }

  private async handleGetInteractionStatus(path: string): Promise<Response> {
    const userId = path
      .replace("/users/", "")
      .replace("/interaction-status", "");
    try {
      const status = await runEffect(
        this.userRepo.getInteractionStatus(userId),
      );
      return jsonResponse(status);
    } catch (error) {
      if (error instanceof NotFoundError)
        return jsonResponse({ error: error.message }, 404);
      log.error("interactionStatus", "Handler failed", undefined, error);
      return jsonResponse({ error: "Failed to get interaction status" }, 500);
    }
  }

  private async handleRecordLike(path: string): Promise<Response> {
    const userId = path.replace("/users/", "").replace("/record-like", "");
    try {
      const result = await runEffect(this.userRepo.recordLike(userId));
      return jsonResponse(result);
    } catch (error) {
      if (error instanceof NotFoundError)
        return jsonResponse({ error: error.message }, 404);
      log.error("recordLike", "Handler failed", undefined, error);
      return jsonResponse({ error: "Failed to record like" }, 500);
    }
  }

  private async handleRecordDislike(path: string): Promise<Response> {
    const userId = path.replace("/users/", "").replace("/record-dislike", "");
    try {
      const result = await runEffect(this.userRepo.recordDislike(userId));
      return jsonResponse(result);
    } catch (error) {
      if (error instanceof NotFoundError)
        return jsonResponse({ error: error.message }, 404);
      log.error("recordDislike", "Handler failed", undefined, error);
      return jsonResponse({ error: "Failed to record dislike" }, 500);
    }
  }

  private async handleGetReferralCode(path: string): Promise<Response> {
    const userId = path.replace("/users/", "").replace("/referral", "");
    try {
      const code = await runEffect(
        this.userRepo.getOrCreateReferralCode(userId),
      );
      return jsonResponse({ code });
    } catch (error) {
      if (error instanceof NotFoundError)
        return jsonResponse({ error: error.message }, 404);
      log.error("referralCode", "Handler failed", undefined, error);
      return jsonResponse({ error: "Failed to get referral code" }, 500);
    }
  }

  private async handleApplyReferral(
    path: string,
    request: Request,
  ): Promise<Response> {
    const userId = path.replace("/users/", "").replace("/apply-referral", "");
    try {
      const body = (await request.json()) as Record<string, unknown>;
      const code = String(body.code ?? "");
      const result = await runEffect(this.userRepo.applyReferral(userId, code));
      return jsonResponse(result, result.success ? 200 : 400);
    } catch (error) {
      if (error instanceof NotFoundError)
        return jsonResponse({ error: error.message }, 404);
      log.error("applyReferral", "Handler failed", undefined, error);
      return jsonResponse({ error: "Failed to apply referral" }, 500);
    }
  }

  private async handleGetDMStatus(path: string): Promise<Response> {
    const userId = path.replace("/users/", "").replace("/dm-status", "");
    try {
      const status = await runEffect(this.userRepo.getDMStatus(userId));
      return jsonResponse(status);
    } catch (error) {
      if (error instanceof NotFoundError)
        return jsonResponse({ error: error.message }, 404);
      log.error("dmStatus", "Handler failed", undefined, error);
      return jsonResponse({ error: "Failed to get DM status" }, 500);
    }
  }

  private async handleSendDM(path: string): Promise<Response> {
    const userId = path.replace("/users/", "").replace("/send-dm", "");
    try {
      const result = await runEffect(this.userRepo.useDMCredit(userId));
      return jsonResponse(result);
    } catch (error) {
      if (error instanceof NotFoundError)
        return jsonResponse({ error: error.message }, 404);
      log.error("sendDM", "Handler failed", undefined, error);
      return jsonResponse({ error: "Failed to send DM" }, 500);
    }
  }

  private async handlePurchaseDMCredits(
    path: string,
    request: Request,
  ): Promise<Response> {
    const userId = path
      .replace("/users/", "")
      .replace("/purchase-dm-credits", "");
    try {
      const body = (await request.json()) as Record<string, unknown>;
      const amountRaw = Number(body.amount ?? 1);
      if (Number.isNaN(amountRaw) || amountRaw < 1 || amountRaw > 100) {
        return jsonResponse(
          { error: "amount must be a number between 1 and 100" },
          400,
        );
      }
      const amount = Math.max(1, Math.min(100, amountRaw));
      const result = await runEffect(
        this.userRepo.addDMCredits(userId, amount),
      );
      return jsonResponse(result);
    } catch (error) {
      if (error instanceof NotFoundError)
        return jsonResponse({ error: error.message }, 404);
      log.error("purchaseDMCredits", "Handler failed", undefined, error);
      return jsonResponse({ error: "Failed to purchase DM credits" }, 500);
    }
  }

  private async handleUploadMedia(
    path: string,
    request: Request,
  ): Promise<Response> {
    const userId = path.replace("/users/", "").replace("/media", "");
    try {
      const body = (await request.json()) as Record<string, unknown>;

      // Check daily media upload limit
      const mediaStatus = await runEffect(
        this.userRepo.getMediaUploadStatus(userId),
      );
      if (mediaStatus.remaining <= 0) {
        return jsonResponse(
          {
            error: "Daily media upload limit reached",
            limit: true,
            tier: mediaStatus.tier,
          },
          429,
        );
      }

      // Check current media count
      const currentMedia = await runEffect(this.userRepo.getMedia(userId));
      if (currentMedia.length >= 3)
        return jsonResponse({ error: "Maximum 3 media items allowed" }, 400);

      let publicUrl: string;
      let fileType: string;

      // Mode 1: URL already provided (bot uploaded directly to R2)
      if (body.url) {
        publicUrl = String(body.url);
        fileType = String(body.type ?? "image");
        if (fileType !== "image" && fileType !== "video") {
          return jsonResponse({ error: "type must be image or video" }, 400);
        }
        console.log(
          `[api:media] Registering pre-uploaded ${fileType} for user ${userId}: ${publicUrl}`,
        );
      }
      // Mode 2: Base64 data provided (legacy direct upload)
      else {
        const fileData = String(body.fileData ?? "");
        fileType = String(body.fileType ?? "image");
        const fileName = String(body.fileName ?? "media");

        if (!fileData)
          return jsonResponse({ error: "fileData or url is required" }, 400);
        if (fileType !== "image" && fileType !== "video")
          return jsonResponse(
            { error: "fileType must be image or video" },
            400,
          );

        // Decode base64 and upload to R2
        const bytes = Uint8Array.from(atob(fileData), (c) => c.charCodeAt(0));
        const ext =
          fileType === "image"
            ? fileName.endsWith(".png")
              ? "png"
              : "jpg"
            : "mp4";
        const key = buildMediaKey(userId, ext);
        await this.env.MEDIA_BUCKET.put(key, bytes, {
          httpMetadata: {
            contentType: fileType === "image" ? `image/${ext}` : "video/mp4",
          },
        });

        publicUrl = buildMediaPublicUrl(key);
        console.log(
          `[api:media] Uploaded ${fileType} to R2 for user ${userId}: ${publicUrl}`,
        );
      }

      const mediaItem = {
        url: publicUrl,
        type: fileType,
        uploadedAt: new Date().toISOString(),
      };
      const result = await runEffect(this.userRepo.addMedia(userId, mediaItem));
      await runEffect(this.userRepo.recordMediaUpload(userId));
      return jsonResponse(result);
    } catch (error) {
      log.error("uploadMedia", "Upload failed", { userId }, error);
      if (error instanceof NotFoundError)
        return jsonResponse({ error: error.message }, 404);
      return jsonResponse({ error: "Failed to upload media" }, 500);
    }
  }

  private async handleDeleteMedia(
    path: string,
    request: Request,
  ): Promise<Response> {
    const userId = path.replace("/users/", "").replace("/media", "");
    try {
      const body = (await request.json()) as Record<string, unknown>;
      const url = String(body.url ?? "");
      if (!url) return jsonResponse({ error: "url is required" }, 400);

      // Verify the URL belongs to the user before deleting from R2
      const userMedia = await runEffect(this.userRepo.getMedia(userId));
      const allowed = userMedia.some((m) => m.url === url);
      if (!allowed) {
        return jsonResponse({ error: "URL does not belong to this user" }, 403);
      }

      // Extract key from URL and delete from R2
      const key = extractMediaKeyFromUrl(url);
      if (key && key.startsWith(`${userId}/`)) {
        await this.env.MEDIA_BUCKET.delete(key).catch(() => {});
      } else if (key) {
        log.warn("deleteMedia", "Rejected delete for non-user-scoped key", {
          userId,
          key,
        });
      }

      const result = await runEffect(this.userRepo.removeMedia(userId, url));
      return jsonResponse(result);
    } catch (error) {
      if (error instanceof NotFoundError)
        return jsonResponse({ error: error.message }, 404);
      log.error("deleteMedia", "Handler failed", undefined, error);
      return jsonResponse({ error: "Failed to delete media" }, 500);
    }
  }

  private async handleRestoreProfile(path: string): Promise<Response> {
    const userId = path.replace("/users/", "").replace("/restore-profile", "");
    try {
      await runEffect(this.userRepo.restoreProfile(userId));
      return jsonResponse({ success: true });
    } catch (error) {
      if (error instanceof NotFoundError)
        return jsonResponse({ error: error.message }, 404);
      log.error("restoreProfile", "Handler failed", undefined, error);
      return jsonResponse({ error: "Failed to restore profile" }, 500);
    }
  }

  private async handleReport(
    path: string,
    request: Request,
  ): Promise<Response> {
    const reportedId = path.replace("/users/", "").replace("/report", "");
    try {
      const body = (await request.json()) as Record<string, unknown>;
      const reporterId = String(body.reporterId ?? "");
      const reason = body.reason ? String(body.reason) : undefined;
      const mediaUrl = body.mediaUrl ? String(body.mediaUrl) : undefined;
      if (!reporterId) {
        return jsonResponse({ error: "reporterId is required" }, 400);
      }
      const result = await runEffect(
        this.reportRepo.create({ reporterId, reportedId, reason, mediaUrl }),
      );
      return jsonResponse({ success: true, reportId: result.id });
    } catch (error) {
      log.error("createReport", "Failed to create report", undefined, error);
      return jsonResponse({ error: "Failed to create report" }, 500);
    }
  }

  private async handleFeedback(request: Request): Promise<Response> {
    try {
      const body = (await request.json()) as Record<string, unknown>;
      const userId = String(body.userId ?? "");
      const typeRaw = body.type ? String(body.type) : undefined;
      const message = body.message ? String(body.message) : undefined;
      const mediaUrl = body.mediaUrl ? String(body.mediaUrl) : undefined;
      if (!userId) {
        return jsonResponse({ error: "userId is required" }, 400);
      }
      const allowedTypes = new Set(["bug", "feature", "other"]);
      const type =
        typeRaw && allowedTypes.has(typeRaw)
          ? (typeRaw as "bug" | "feature" | "other")
          : undefined;
      const result = await runEffect(
        this.feedbackRepo.create({ userId, type, message, mediaUrl }),
      );
      return jsonResponse({ success: true, feedbackId: result.id });
    } catch (error) {
      log.error(
        "createFeedback",
        "Failed to create feedback",
        undefined,
        error,
      );
      return jsonResponse({ error: "Failed to create feedback" }, 500);
    }
  }

  private async handleInteract(path: string): Promise<Response> {
    const userId = path.replace("/users/", "").replace("/interact", "");
    try {
      await runEffect(this.userRepo.updateLastInteraction(userId));
      return jsonResponse({ success: true });
    } catch (error) {
      log.error(
        "updateInteraction",
        "Failed to update interaction",
        undefined,
        error,
      );
      return jsonResponse({ error: "Failed to update interaction" }, 500);
    }
  }

  private async handleBlock(path: string, request: Request): Promise<Response> {
    const blockerId = path.replace("/users/", "").replace("/block", "");
    try {
      const body = (await request.json()) as Record<string, unknown>;
      const blockedId = String(body.blockedId ?? "");
      if (!blockedId) {
        return jsonResponse({ error: "blockedId is required" }, 400);
      }
      const result = await runEffect(
        this.blockRepo.block({ blockerId, blockedId }),
      );
      return jsonResponse(result);
    } catch (error) {
      if (error instanceof ValidationError)
        return jsonResponse({ error: error.message }, 400);
      log.error("block", "Failed to block user", undefined, error);
      return jsonResponse({ error: "Failed to block user" }, 500);
    }
  }

  private async handleUnblock(
    path: string,
    request: Request,
  ): Promise<Response> {
    const blockerId = path.replace("/users/", "").replace("/unblock", "");
    try {
      const body = (await request.json()) as Record<string, unknown>;
      const blockedId = String(body.blockedId ?? "");
      if (!blockedId) {
        return jsonResponse({ error: "blockedId is required" }, 400);
      }
      const result = await runEffect(
        this.blockRepo.unblock({ blockerId, blockedId }),
      );
      return jsonResponse(result);
    } catch (error) {
      if (error instanceof ValidationError)
        return jsonResponse({ error: error.message }, 400);
      log.error("unblock", "Failed to unblock user", undefined, error);
      return jsonResponse({ error: "Failed to unblock user" }, 500);
    }
  }

  private async handleDowngradeExpiredSubscriptions(): Promise<Response> {
    try {
      const count = await runEffect(
        this.userRepo.downgradeExpiredSubscriptions(),
      );
      return jsonResponse({ success: true, downgraded: count });
    } catch (error) {
      log.error(
        "downgradeExpiredSubscriptions",
        "Handler failed",
        undefined,
        error,
      );
      return jsonResponse(
        { error: "Failed to downgrade expired subscriptions" },
        500,
      );
    }
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
