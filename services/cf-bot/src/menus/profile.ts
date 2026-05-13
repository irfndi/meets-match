import { InlineKeyboard } from 'grammy';
import type { MyContext } from '../types.js';
import { startConversation } from '../lib/conversations.js';
import type { Env } from '../index.js';

export function getProfileMenu(env: Env) {
  return new InlineKeyboard()
    .text('📝 Bio', 'profile:bio')
    .text('🎂 Age', 'profile:age')
    .row()
    .text('👤 Name', 'profile:name')
    .text('⚧ Gender', 'profile:gender')
    .row()
    .text('🌟 Interests', 'profile:interests')
    .text('📍 Location', 'profile:location')
    .row()
    .text('❌ Close', 'profile:close');
}

export async function handleProfileCallback(ctx: MyContext, env: Env, data: string): Promise<boolean> {
  if (!ctx.from) return false;
  const userId = String(ctx.from.id);

  switch (data) {
    case 'profile:bio':
      await startConversation(env.KV, userId, 'bio');
      await ctx.reply('Please enter your new bio (max 300 characters). Type Cancel to abort.');
      return true;
    case 'profile:age':
      await startConversation(env.KV, userId, 'age');
      await ctx.reply('Please enter your age (18-65). Type Cancel to abort.');
      return true;
    case 'profile:name':
      await startConversation(env.KV, userId, 'name');
      await ctx.reply('Please enter your first name (1-50 characters). Type Cancel to abort.');
      return true;
    case 'profile:gender':
      await startConversation(env.KV, userId, 'gender');
      await ctx.reply('Select your gender: Male or Female. Type Cancel to abort.');
      return true;
    case 'profile:interests':
      await startConversation(env.KV, userId, 'interests');
      await ctx.reply('Enter your interests, separated by commas (max 10). Type Cancel to abort.');
      return true;
    case 'profile:location':
      await startConversation(env.KV, userId, 'location');
      await ctx.reply('Enter your city and country, separated by a comma. Type Cancel to abort.');
      return true;
    case 'profile:close':
      await ctx.deleteMessage();
      return true;
    default:
      return false;
  }
}
