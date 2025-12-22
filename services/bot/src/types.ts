import type { Context, SessionFlavor } from 'grammy';
import type { ConversationFlavor } from '@grammyjs/conversations';

export interface MyContext extends Context, SessionFlavor<{}>, ConversationFlavor<MyContext> {}
