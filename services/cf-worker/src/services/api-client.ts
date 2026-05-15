import { Effect } from "effect";
import type { Fetcher } from "@cloudflare/workers-types";
import {
  type GetUserRequest,
  type GetUserResponse,
  type GetReengagementCandidatesRequest,
  type GetReengagementCandidatesResponse,
  type CreateUserRequest,
  type CreateUserResponse,
  type UpdateUserRequest,
  type UpdateUserResponse,
  type UpdateLastActiveRequest,
  type UpdateLastActiveResponse,
  type UpdateLastRemindedAtRequest,
  type UpdateLastRemindedAtResponse,
  UserService as IUserService,
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

  async getReengagementCandidates(
    req: GetReengagementCandidatesRequest,
  ): Promise<GetReengagementCandidatesResponse> {
    const params = new URLSearchParams();
    if (req.minInactiveDays)
      params.set("minInactiveDays", String(req.minInactiveDays));
    if (req.maxInactiveDays)
      params.set("maxInactiveDays", String(req.maxInactiveDays));
    if (req.limit) params.set("limit", String(req.limit));
    const response = await this.binding.fetch(
      new Request(`http://api/users/reengagement?${params.toString()}`, {
        method: "GET",
      }),
    );
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as GetReengagementCandidatesResponse;
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
}
