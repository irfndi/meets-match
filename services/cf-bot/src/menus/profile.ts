import { InlineKeyboard } from 'grammy';
import type { MyContext } from '../types.js';
import { startConversation } from '../lib/conversations.js';
import type { Env } from '../index.js';
import { t, type Language } from '../lib/i18n.js';

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
  const lang: Language = 'en';

  switch (data) {
    case 'profile:bio':
      await startConversation(env.KV, userId, 'bio');
      await ctx.reply(t('bioPrompt', lang));
      return true;
    case 'profile:age':
      await startConversation(env.KV, userId, 'age');
      await ctx.reply(t('agePrompt', lang));
      return true;
    case 'profile:name':
      await startConversation(env.KV, userId, 'name');
      await ctx.reply(t('namePrompt', lang));
      return true;
    case 'profile:gender':
      await startConversation(env.KV, userId, 'gender');
      await ctx.reply(t('genderPrompt', lang));
      return true;
    case 'profile:interests':
      await startConversation(env.KV, userId, 'interests');
      await ctx.reply(t('interestsPrompt', lang));
      return true;
    case 'profile:location': {
      await startConversation(env.KV, userId, 'location');
      const keyboard = {
        keyboard: [
          [{ text: t('locationShareButton', lang), request_location: true }],
          [{ text: t('locationTypeButton', lang) }],
          [{ text: t('genericCancel', lang) }],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      };
      await ctx.reply(t('locationPrompt', lang), { reply_markup: keyboard });
      return true;
    }
    case 'profile:close':
      await ctx.deleteMessage();
      return true;
    default:
      return false;
  }
}
