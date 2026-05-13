import type { MyContext } from '../types.js';
import { getProfileMenu } from '../menus/profile.js';
import type { Env } from '../index.js';

export const profileCommand = async (ctx: MyContext, env: Env): Promise<void> => {
  await ctx.reply('👤 *Your Profile*\n\nSelect a field to edit:', {
    parse_mode: 'Markdown',
    reply_markup: getProfileMenu(env),
  });
};
