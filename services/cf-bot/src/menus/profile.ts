import { InlineKeyboard } from 'grammy';
import type { MyContext } from '../types.js';
import { startConversation } from '../lib/conversations.js';
import type { Env } from '../index.js';
import { t, type Language } from '../lib/i18n.js';

export function getProfileMenu(env: Env) {
  return new InlineKeyboard()
    .text('📝 Bio', 'profile:bio')
    .text('🎂 Age', 'profile:birthdate')
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
  const userRes = await env.API_SERVICE.fetch(
    new Request(`http://api/users/${userId}`, { method: 'GET' })
  );
  let lang: Language = 'en';
  if (userRes.ok) {
    const userData = await userRes.json() as { user?: Record<string, unknown> };
    lang = (userData.user?.language as Language) ?? 'en';
  }

  switch (data) {
    case 'profile:bio':
      await startConversation(env.KV, userId, 'bio');
      await ctx.reply(t('bioPrompt', lang));
      await ctx.answerCallbackQuery().catch(() => {});
      return true;
    case 'profile:birthdate':
      await startConversation(env.KV, userId, 'birthdate');
      await ctx.reply(t('birthDatePrompt', lang));
      await ctx.answerCallbackQuery().catch(() => {});
      return true;
    case 'profile:name':
      await startConversation(env.KV, userId, 'name');
      await ctx.reply(t('namePrompt', lang));
      await ctx.answerCallbackQuery().catch(() => {});
      return true;
    case 'profile:gender':
      await startConversation(env.KV, userId, 'gender');
      await ctx.reply(t('genderPrompt', lang));
      await ctx.answerCallbackQuery().catch(() => {});
      return true;
    case 'profile:interests':
      await startConversation(env.KV, userId, 'interests');
      await ctx.reply(t('interestsPrompt', lang));
      await ctx.answerCallbackQuery().catch(() => {});
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
      await ctx.answerCallbackQuery().catch(() => {});
      return true;
    }
    case 'profile:close':
      await ctx.deleteMessage().catch(() => {});
      return true;
    default:
      return false;
  }
}
