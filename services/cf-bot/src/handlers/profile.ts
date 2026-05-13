import type { MyContext } from '../types.js';

export const profileCommand = async (ctx: MyContext): Promise<void> => {
  await ctx.reply('👤 Profile feature coming soon. Use /settings to update your preferences.');
};
