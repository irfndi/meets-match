import { Effect } from "effect";
import type { ServiceBinding } from "@cloudflare/workers-types";
import {
  type GetUserRequest,
  type GetUserResponse,
  type GetReengagementCandidatesRequest,
  type GetReengagementCandidatesResponse,
  UserService as IUserService,
} from "@meetsmatch/cf-shared";

export class ApiServiceClient implements IUserService {
  constructor(private readonly binding: ServiceBinding) {}

  async getUser(req: GetUserRequest): Promise<GetUserResponse> {
    const response = await this.binding.fetch(new Request(`http://api/users/${req.userId}`, { method: "GET" }));
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as GetUserResponse;
  }

  async getReengagementCandidates(req: GetReengagementCandidatesRequest): Promise<GetReengagementCandidatesResponse> {
    const params = new URLSearchParams();
    if (req.minInactiveDays) params.set("minInactiveDays", String(req.minInactiveDays));
    if (req.maxInactiveDays) params.set("maxInactiveDays", String(req.maxInactiveDays));
    if (req.limit) params.set("limit", String(req.limit));
    const response = await this.binding.fetch(new Request(`http://api/users/reengagement?${params.toString()}`, { method: "GET" }));
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as GetReengagementCandidatesResponse;
  }

  async createUser() { throw new Error("Not implemented"); }
  async updateUser() { throw new Error("Not implemented"); }
  async updateLastActive() { throw new Error("Not implemented"); }
  async updateLastRemindedAt() { throw new Error("Not implemented"); }
}
