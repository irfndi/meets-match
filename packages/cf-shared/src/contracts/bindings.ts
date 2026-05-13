import { Array, Boolean, Literal, Number, String, Struct, optional } from "effect/Schema";
import type { UserService } from "./user.js";
import type { MatchService } from "./match.js";
import type { NotificationService } from "./notification.js";
import type { HealthService } from "./health.js";
import type { Request, Response } from "@cloudflare/workers-types";

// --- Service Binding Type Registry ---
// Maps binding names to their service interfaces for type-safe RPC

export interface ServiceBindings {
  readonly API_SERVICE: {
    fetch: (req: Request) => Promise<Response>;
  };
  readonly BOT_SERVICE: {
    fetch: (req: Request) => Promise<Response>;
  };
}

// --- Effect Layers for Service Binding Client/Server ---
// These will be implemented in the services themselves, not here.
// This file defines the types only.

export type { UserService, MatchService, NotificationService, HealthService };
