import type { MyContext } from '../types.js';

export const matchCommand = async (ctx: MyContext): Promise<void> => {
  await ctx.reply('💘 Match feature coming soon. This will show potential matches based on your preferences.');
};

export const matchCallbacks = async (ctx: MyContext): Promise<void> => {
  await ctx.answerCallbackQuery('Match callbacks coming soon.');
};
