import { Effect } from "effect";
import type { Fetcher } from "@cloudflare/workers-types";
import {
  type GetUserRequest,
  type GetUserResponse,
  type CreateUserRequest,
  type CreateUserResponse,
  type UpdateUserRequest,
  type UpdateUserResponse,
  type UpdateLastActiveRequest,
  type UpdateLastActiveResponse,
  type UpdateLastRemindedAtRequest,
  type UpdateLastRemindedAtResponse,
  type GetPotentialMatchesRequest,
  type GetPotentialMatchesResponse,
  type CreateMatchRequest,
  type CreateMatchResponse,
  type LikeMatchRequest,
  type LikeMatchResponse,
  type GetMatchListRequest,
  type GetMatchListResponse,
  UserService as IUserService,
  MatchService as IMatchService,
} from "@meetsmatch/cf-shared";

export class ApiServiceClient implements IUserService {
  constructor(private readonly binding: Fetcher) {}

  async getUser(req: GetUserRequest): Promise<GetUserResponse> {
    const response = await this.binding.fetch(
      new Request(`http://api/users/${req.userId}`, { method: "GET" }),
    );
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as GetUserResponse;
  }

  async createUser(req: CreateUserRequest): Promise<CreateUserResponse> {
    const response = await this.binding.fetch(
      new Request("http://api/users", {
        method: "POST",
        body: JSON.stringify(req),
        headers: { "Content-Type": "application/json" },
      }),
    );
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as CreateUserResponse;
  }

  async updateUser(req: UpdateUserRequest): Promise<UpdateUserResponse> {
    const response = await this.binding.fetch(
      new Request(`http://api/users/${req.userId}`, {
        method: "PUT",
        body: JSON.stringify(req),
        headers: { "Content-Type": "application/json" },
      }),
    );
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as UpdateUserResponse;
  }

  async updateLastActive(
    req: UpdateLastActiveRequest,
  ): Promise<UpdateLastActiveResponse> {
    const response = await this.binding.fetch(
      new Request(`http://api/users/${req.userId}/last-active`, {
        method: "POST",
      }),
    );
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as UpdateLastActiveResponse;
  }

  async updateLastRemindedAt(
    req: UpdateLastRemindedAtRequest,
  ): Promise<UpdateLastRemindedAtResponse> {
    const response = await this.binding.fetch(
      new Request(`http://api/users/${req.userId}/last-reminded-at`, {
        method: "POST",
      }),
    );
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as UpdateLastRemindedAtResponse;
  }

  async getPotentialMatches(
    req: GetPotentialMatchesRequest,
  ): Promise<GetPotentialMatchesResponse> {
    const response = await this.binding.fetch(
      new Request(
        `http://api/users/${req.userId}/potential-matches?limit=${req.limit ?? 10}`,
        { method: "GET" },
      ),
    );
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as GetPotentialMatchesResponse;
  }

  async getPendingLikes(
    userId: string,
  ): Promise<{ pendingLikes: Array<Record<string, unknown>> }> {
    const response = await this.binding.fetch(
      new Request(`http://api/users/${userId}/pending-likes`, {
        method: "GET",
      }),
    );
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as {
      pendingLikes: Array<Record<string, unknown>>;
    };
  }

  async getMatchList(req: GetMatchListRequest): Promise<GetMatchListResponse> {
    const url = new URL("http://api/matches");
    url.searchParams.set("userId", req.userId);
    if (req.status) url.searchParams.set("status", req.status);
    if (req.limit) url.searchParams.set("limit", String(req.limit));
    const response = await this.binding.fetch(
      new Request(url.toString(), { method: "GET" }),
    );
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as GetMatchListResponse;
  }

  async createMatch(req: CreateMatchRequest): Promise<CreateMatchResponse> {
    const response = await this.binding.fetch(
      new Request("http://api/matches", {
        method: "POST",
        body: JSON.stringify(req),
        headers: { "Content-Type": "application/json" },
      }),
    );
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as CreateMatchResponse;
  }

  async likeMatch(
    req: LikeMatchRequest & { message?: { text?: string; mediaUrl?: string } },
  ): Promise<LikeMatchResponse> {
    const response = await this.binding.fetch(
      new Request(`http://api/matches/${req.matchId}/like`, {
        method: "POST",
        body: JSON.stringify({ userId: req.userId, message: req.message }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as LikeMatchResponse;
  }

  async getInteractionStatus(userId: string): Promise<{
    likesRemaining: number;
    likesTotal: number;
    dislikesRemaining: number;
    dislikesTotal: number;
    tier: string;
    resetAt: string;
  }> {
    const response = await this.binding.fetch(
      new Request(`http://api/users/${userId}/interaction-status`, {
        method: "GET",
      }),
    );
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as {
      likesRemaining: number;
      likesTotal: number;
      dislikesRemaining: number;
      dislikesTotal: number;
      tier: string;
      resetAt: string;
    };
  }

  async recordLike(
    userId: string,
  ): Promise<{ remaining: number; total: number }> {
    const response = await this.binding.fetch(
      new Request(`http://api/users/${userId}/record-like`, { method: "POST" }),
    );
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as { remaining: number; total: number };
  }

  async recordDislike(
    userId: string,
  ): Promise<{ remaining: number; total: number }> {
    const response = await this.binding.fetch(
      new Request(`http://api/users/${userId}/record-dislike`, {
        method: "POST",
      }),
    );
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as { remaining: number; total: number };
  }

  async getDMStatus(
    userId: string,
  ): Promise<{ canSendDM: boolean; tier: string; dmCredits: number }> {
    const response = await this.binding.fetch(
      new Request(`http://api/users/${userId}/dm-status`, { method: "GET" }),
    );
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as {
      canSendDM: boolean;
      tier: string;
      dmCredits: number;
    };
  }

  async sendDM(
    userId: string,
  ): Promise<{ success: boolean; dmCredits: number }> {
    const response = await this.binding.fetch(
      new Request(`http://api/users/${userId}/send-dm`, { method: "POST" }),
    );
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as { success: boolean; dmCredits: number };
  }

  async purchaseDMCredits(
    userId: string,
    amount: number,
  ): Promise<{ dmCredits: number }> {
    const response = await this.binding.fetch(
      new Request(`http://api/users/${userId}/purchase-dm-credits`, {
        method: "POST",
        body: JSON.stringify({ amount }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as { dmCredits: number };
  }

  async uploadMedia(
    userId: string,
    fileData: string,
    fileType: string,
    fileName: string,
  ): Promise<{
    mediaUrls: Array<{ url: string; type: string; uploadedAt: string }>;
  }> {
    const response = await this.binding.fetch(
      new Request(`http://api/users/${userId}/media`, {
        method: "POST",
        body: JSON.stringify({ fileData, fileType, fileName }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as {
      mediaUrls: Array<{ url: string; type: string; uploadedAt: string }>;
    };
  }

  async deleteMedia(
    userId: string,
    url: string,
  ): Promise<{
    mediaUrls: Array<{ url: string; type: string; uploadedAt: string }>;
  }> {
    const response = await this.binding.fetch(
      new Request(`http://api/users/${userId}/media`, {
        method: "DELETE",
        body: JSON.stringify({ url }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as {
      mediaUrls: Array<{ url: string; type: string; uploadedAt: string }>;
    };
  }

  async undoMatch(
    matchId: string,
    userId: string,
  ): Promise<{ restored: boolean; match: Record<string, unknown> }> {
    const response = await this.binding.fetch(
      new Request(`http://api/matches/${matchId}/undo`, {
        method: "POST",
        body: JSON.stringify({ userId }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as {
      restored: boolean;
      match: Record<string, unknown>;
    };
  }

  async reportUser(
    reportedId: string,
    reporterId: string,
    reason?: string,
  ): Promise<{ success: boolean; reportId: string }> {
    const response = await this.binding.fetch(
      new Request(`http://api/users/${reportedId}/report`, {
        method: "POST",
        body: JSON.stringify({ reporterId, reason }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as { success: boolean; reportId: string };
  }

  async restoreProfile(userId: string): Promise<{ success: boolean }> {
    const response = await this.binding.fetch(
      new Request(`http://api/users/${userId}/restore-profile`, {
        method: "POST",
      }),
    );
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as { success: boolean };
  }

  async interact(userId: string): Promise<{ success: boolean }> {
    const response = await this.binding.fetch(
      new Request(`http://api/users/${userId}/interact`, { method: "POST" }),
    );
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as { success: boolean };
  }

  async getReferralCode(userId: string): Promise<{ code: string }> {
    const response = await this.binding.fetch(
      new Request(`http://api/users/${userId}/referral`, { method: "GET" }),
    );
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as { code: string };
  }
}
