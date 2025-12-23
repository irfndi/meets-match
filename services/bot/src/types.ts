import type { Context, SessionFlavor } from 'grammy';
import type { ConversationFlavor } from '@grammyjs/conversations';

// Session data structure - empty for now, will hold conversation state
export type SessionData = Record<string, never>;

// Base context with session
type BaseContext = Context & SessionFlavor<SessionData>;

// Full context type with all flavors
export type MyContext = ConversationFlavor<BaseContext>;
