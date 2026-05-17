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
} from "@meetsmatch/cf-shared";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    public readonly endpoint: string,
  ) {
    super(`API ${status} on ${endpoint}`);
    this.name = "ApiError";
  }
}

function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

export class ApiServiceClient implements IUserService {
  constructor(private readonly binding: Fetcher) {}

  private async request<T>(
    endpoint: string,
    init: RequestInit & { idempotent?: boolean } = {},
  ): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.idempotent) {
      headers.set("Idempotency-Key", generateIdempotencyKey());
    }

    const response = await this.binding.fetch(
      new Request(`http://api${endpoint}`, { ...init, headers }),
    );

    if (!response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = await response.text().catch(() => null);
      }
      throw new ApiError(response.status, body, endpoint);
    }

    return (await response.json()) as T;
  }

  async getUser(req: GetUserRequest): Promise<GetUserResponse> {
    return this.request<GetUserResponse>(`/users/${req.userId}`, {
      method: "GET",
    });
  }

  async createUser(req: CreateUserRequest): Promise<CreateUserResponse> {
    return this.request<CreateUserResponse>("/users", {
      method: "POST",
      body: JSON.stringify(req),
      headers: { "Content-Type": "application/json" },
      idempotent: true,
    });
  }

  async updateUser(req: UpdateUserRequest): Promise<UpdateUserResponse> {
    return this.request<UpdateUserResponse>(`/users/${req.userId}`, {
      method: "PUT",
      body: JSON.stringify(req),
      headers: { "Content-Type": "application/json" },
    });
  }

  async updateLastActive(
    req: UpdateLastActiveRequest,
  ): Promise<UpdateLastActiveResponse> {
    return this.request<UpdateLastActiveResponse>(
      `/users/${req.userId}/last-active`,
      { method: "POST" },
    );
  }

  async updateLastRemindedAt(
    req: UpdateLastRemindedAtRequest,
  ): Promise<UpdateLastRemindedAtResponse> {
    return this.request<UpdateLastRemindedAtResponse>(
      `/users/${req.userId}/last-reminded-at`,
      { method: "POST" },
    );
  }

  async getPotentialMatches(
    req: GetPotentialMatchesRequest,
  ): Promise<GetPotentialMatchesResponse> {
    const url = `/users/${req.userId}/potential-matches?limit=${req.limit ?? 10}`;
    return this.request<GetPotentialMatchesResponse>(url, { method: "GET" });
  }

  async getPendingLikes(
    userId: string,
  ): Promise<{ pendingLikes: Array<Record<string, unknown>> }> {
    return this.request<{ pendingLikes: Array<Record<string, unknown>> }>(
      `/users/${userId}/pending-likes`,
      { method: "GET" },
    );
  }

  async getMatchList(req: GetMatchListRequest): Promise<GetMatchListResponse> {
    const query = new URLSearchParams();
    query.set("userId", req.userId);
    if (req.status) query.set("status", req.status);
    if (req.limit) query.set("limit", String(req.limit));
    return this.request<GetMatchListResponse>(`/matches?${query.toString()}`, {
      method: "GET",
    });
  }

  async createMatch(req: CreateMatchRequest): Promise<CreateMatchResponse> {
    return this.request<CreateMatchResponse>("/matches", {
      method: "POST",
      body: JSON.stringify(req),
      headers: { "Content-Type": "application/json" },
      idempotent: true,
    });
  }

  async likeMatch(
    req: LikeMatchRequest & { message?: { text?: string; mediaUrl?: string } },
  ): Promise<LikeMatchResponse> {
    return this.request<LikeMatchResponse>(`/matches/${req.matchId}/like`, {
      method: "POST",
      body: JSON.stringify({ userId: req.userId, message: req.message }),
      headers: { "Content-Type": "application/json" },
      idempotent: true,
    });
  }

  async getInteractionStatus(userId: string): Promise<{
    likesRemaining: number;
    likesTotal: number;
    dislikesRemaining: number;
    dislikesTotal: number;
    tier: string;
    resetAt: string;
  }> {
    return this.request<{
      likesRemaining: number;
      likesTotal: number;
      dislikesRemaining: number;
      dislikesTotal: number;
      tier: string;
      resetAt: string;
    }>(`/users/${userId}/interaction-status`, { method: "GET" });
  }

  async recordLike(
    userId: string,
  ): Promise<{ remaining: number; total: number }> {
    return this.request<{ remaining: number; total: number }>(
      `/users/${userId}/record-like`,
      { method: "POST", idempotent: true },
    );
  }

  async recordDislike(
    userId: string,
  ): Promise<{ remaining: number; total: number }> {
    return this.request<{ remaining: number; total: number }>(
      `/users/${userId}/record-dislike`,
      { method: "POST", idempotent: true },
    );
  }

  async getDMStatus(
    userId: string,
  ): Promise<{ canSendDM: boolean; tier: string; dmCredits: number }> {
    return this.request<{
      canSendDM: boolean;
      tier: string;
      dmCredits: number;
    }>(`/users/${userId}/dm-status`, { method: "GET" });
  }

  async sendDM(
    userId: string,
  ): Promise<{ success: boolean; dmCredits: number }> {
    return this.request<{ success: boolean; dmCredits: number }>(
      `/users/${userId}/send-dm`,
      { method: "POST", idempotent: true },
    );
  }

  async purchaseDMCredits(
    userId: string,
    amount: number,
  ): Promise<{ dmCredits: number }> {
    return this.request<{ dmCredits: number }>(
      `/users/${userId}/purchase-dm-credits`,
      {
        method: "POST",
        body: JSON.stringify({ amount }),
        headers: { "Content-Type": "application/json" },
        idempotent: true,
      },
    );
  }

  async uploadMedia(
    userId: string,
    fileData: string,
    fileType: string,
    fileName: string,
  ): Promise<{
    mediaUrls: Array<{ url: string; type: string; uploadedAt: string }>;
  }> {
    return this.request<{
      mediaUrls: Array<{ url: string; type: string; uploadedAt: string }>;
    }>(`/users/${userId}/media`, {
      method: "POST",
      body: JSON.stringify({ fileData, fileType, fileName }),
      headers: { "Content-Type": "application/json" },
      idempotent: true,
    });
  }

  async deleteMedia(
    userId: string,
    url: string,
  ): Promise<{
    mediaUrls: Array<{ url: string; type: string; uploadedAt: string }>;
  }> {
    return this.request<{
      mediaUrls: Array<{ url: string; type: string; uploadedAt: string }>;
    }>(`/users/${userId}/media`, {
      method: "DELETE",
      body: JSON.stringify({ url }),
      headers: { "Content-Type": "application/json" },
    });
  }

  async undoMatch(
    matchId: string,
    userId: string,
  ): Promise<{ restored: boolean; match: Record<string, unknown> }> {
    return this.request<{ restored: boolean; match: Record<string, unknown> }>(
      `/matches/${matchId}/undo`,
      {
        method: "POST",
        body: JSON.stringify({ userId }),
        headers: { "Content-Type": "application/json" },
        idempotent: true,
      },
    );
  }

  async reportUser(
    reportedId: string,
    reporterId: string,
    reason?: string,
  ): Promise<{ success: boolean; reportId: string }> {
    return this.request<{ success: boolean; reportId: string }>(
      `/users/${reportedId}/report`,
      {
        method: "POST",
        body: JSON.stringify({ reporterId, reason }),
        headers: { "Content-Type": "application/json" },
        idempotent: true,
      },
    );
  }

  async restoreProfile(userId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(
      `/users/${userId}/restore-profile`,
      { method: "POST", idempotent: true },
    );
  }

  async interact(userId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/users/${userId}/interact`, {
      method: "POST",
      idempotent: true,
    });
  }

  async getReferralCode(userId: string): Promise<{ code: string }> {
    return this.request<{ code: string }>(`/users/${userId}/referral`, {
      method: "GET",
    });
  }

  async blockUser(
    blockerId: string,
    blockedId: string,
  ): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/users/${blockerId}/block`, {
      method: "POST",
      body: JSON.stringify({ blockedId }),
      headers: { "Content-Type": "application/json" },
      idempotent: true,
    });
  }

  async unblockUser(
    blockerId: string,
    blockedId: string,
  ): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/users/${blockerId}/unblock`, {
      method: "POST",
      body: JSON.stringify({ blockedId }),
      headers: { "Content-Type": "application/json" },
      idempotent: true,
    });
  }
}
