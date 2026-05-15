import type { Context, SessionFlavor } from "grammy";

export interface SessionData {
  conversation?: string;
  step?: number;
  data?: Record<string, unknown>;
}

export type MyContext = Context & SessionFlavor<SessionData>;
