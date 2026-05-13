import { Effect } from "effect";
import type { ServiceBinding } from "@cloudflare/workers-types";
import {
  type GetUserRequest,
  type GetUserResponse,
  type CreateUserRequest,
  type CreateUserResponse,
  type UpdateUserRequest,
  type UpdateUserResponse,
  UserService as IUserService,
} from "@meetsmatch/cf-shared";

export class ApiServiceClient implements IUserService {
  constructor(private readonly binding: ServiceBinding) {}

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

  async updateLastActive() { throw new Error("Not implemented via Service Binding"); }
  async updateLastRemindedAt() { throw new Error("Not implemented via Service Binding"); }
}
