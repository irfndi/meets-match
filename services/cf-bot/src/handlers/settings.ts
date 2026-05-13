import type { MyContext } from '../types.js';

export const settingsCommand = async (ctx: MyContext): Promise<void> => {
  await ctx.reply('⚙️ Settings feature coming soon. This will let you update age range, distance, and preferences.');
};

export const settingsCallbacks = async (ctx: MyContext): Promise<void> => {
  await ctx.answerCallbackQuery('Settings callbacks coming soon.');
};
