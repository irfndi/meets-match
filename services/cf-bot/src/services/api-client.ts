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
    const response = await this.binding.fetch(new Request(`http://api/users/${req.userId}`, { method: "GET" }));
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as GetUserResponse;
  }

  async createUser(req: CreateUserRequest): Promise<CreateUserResponse> {
    const response = await this.binding.fetch(new Request("http://api/users", {
      method: "POST",
      body: JSON.stringify(req),
      headers: { "Content-Type": "application/json" },
    }));
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as CreateUserResponse;
  }

  async updateUser(req: UpdateUserRequest): Promise<UpdateUserResponse> {
    const response = await this.binding.fetch(new Request(`http://api/users/${req.userId}`, {
      method: "PUT",
      body: JSON.stringify(req),
      headers: { "Content-Type": "application/json" },
    }));
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as UpdateUserResponse;
  }

  async updateLastActive(req: UpdateLastActiveRequest): Promise<UpdateLastActiveResponse> {
    const response = await this.binding.fetch(new Request(`http://api/users/${req.userId}/last-active`, { method: "POST" }));
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as UpdateLastActiveResponse;
  }

  async updateLastRemindedAt(req: UpdateLastRemindedAtRequest): Promise<UpdateLastRemindedAtResponse> {
    const response = await this.binding.fetch(new Request(`http://api/users/${req.userId}/last-reminded-at`, { method: "POST" }));
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as UpdateLastRemindedAtResponse;
  }

  async getPotentialMatches(req: GetPotentialMatchesRequest): Promise<GetPotentialMatchesResponse> {
    const response = await this.binding.fetch(new Request(`http://api/users/${req.userId}/potential-matches?limit=${req.limit ?? 10}`, { method: "GET" }));
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as GetPotentialMatchesResponse;
  }

  async getPendingLikes(userId: string): Promise<{ pendingLikes: Array<Record<string, unknown>> }> {
    const response = await this.binding.fetch(new Request(`http://api/users/${userId}/pending-likes`, { method: "GET" }));
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as { pendingLikes: Array<Record<string, unknown>> };
  }

  async getMatchList(req: GetMatchListRequest): Promise<GetMatchListResponse> {
    const url = new URL("http://api/matches");
    url.searchParams.set("userId", req.userId);
    if (req.status) url.searchParams.set("status", req.status);
    if (req.limit) url.searchParams.set("limit", String(req.limit));
    const response = await this.binding.fetch(new Request(url.toString(), { method: "GET" }));
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as GetMatchListResponse;
  }

  async createMatch(req: CreateMatchRequest): Promise<CreateMatchResponse> {
    const response = await this.binding.fetch(new Request("http://api/matches", {
      method: "POST",
      body: JSON.stringify(req),
      headers: { "Content-Type": "application/json" },
    }));
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as CreateMatchResponse;
  }

  async likeMatch(req: LikeMatchRequest): Promise<LikeMatchResponse> {
    const response = await this.binding.fetch(new Request(`http://api/matches/${req.matchId}/like`, {
      method: "POST",
      body: JSON.stringify({ userId: req.userId }),
      headers: { "Content-Type": "application/json" },
    }));
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as LikeMatchResponse;
  }

  async getDMStatus(userId: string): Promise<{ canSendDM: boolean; tier: string; dmCredits: number }> {
    const response = await this.binding.fetch(new Request(`http://api/users/${userId}/dm-status`, { method: "GET" }));
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as { canSendDM: boolean; tier: string; dmCredits: number };
  }

  async sendDM(userId: string): Promise<{ success: boolean; dmCredits: number }> {
    const response = await this.binding.fetch(new Request(`http://api/users/${userId}/send-dm`, { method: "POST" }));
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as { success: boolean; dmCredits: number };
  }

  async purchaseDMCredits(userId: string, amount: number): Promise<{ dmCredits: number }> {
    const response = await this.binding.fetch(new Request(`http://api/users/${userId}/purchase-dm-credits`, {
      method: "POST",
      body: JSON.stringify({ amount }),
      headers: { "Content-Type": "application/json" },
    }));
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as { dmCredits: number };
  }
}
