import type { Context, SessionFlavor } from 'grammy';
import type { ConversationFlavor } from '@grammyjs/conversations';

// Session data structure
export interface SessionData {}

// Full context type with all flavors
export type MyContext = Context & SessionFlavor<SessionData> & ConversationFlavor<Context>;
