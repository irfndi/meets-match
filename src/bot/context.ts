import type { Conversation, ConversationFlavor } from "@grammyjs/conversations";
import type { Context as BaseContext, SessionFlavor } from "grammy";
import type { User } from "../models/user";

/**
 * Define the structure of your session data.
 * This will be available on `ctx.session`.
 */
export interface SessionData {
  user?: User; // Store user profile data in the session
  // Add other session properties here if needed
  // e.g., activeConversation?: string;
  __conversations?: Record<string, unknown>; // Internal field for conversations plugin
}

// Represents the custom context object used throughout the bot.
// It includes:
// - Base Grammy context (`BaseContext`)
// - Session data management (`SessionFlavor<SessionData>`)
// - Conversation management (`ConversationFlavor`)

// @ts-ignore - This specific circular reference between Context and ConversationFlavor<Context>
// is a common pattern in grammY when using conversations and seems hard to avoid
// without causing other type issues. Attempts to refactor (interface, removing generic)
// resulted in more errors. Suppressing for now.
export type Context = BaseContext &
  SessionFlavor<SessionData> &
  ConversationFlavor<Context>;

// Type alias for Conversation context based on our custom Context
export type ConversationContext = Conversation<Context>;
