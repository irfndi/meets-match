import type { Context, SessionFlavor } from "grammy";

/** Per-conversation progress stored in the session data field. */
export interface SessionDataPayload {
  min?: number;
  targetUserId?: string;
}

export interface SessionData {
  conversation?: string;
  step?: number;
  data?: SessionDataPayload;
}

export type MyContext = Context & SessionFlavor<SessionData>;
