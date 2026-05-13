import type { MyContext } from '../types.js';

export const matchesCommand = async (ctx: MyContext): Promise<void> => {
  await ctx.reply('💑 Your matches will appear here soon.');
};

export const matchesCallbacks = async (ctx: MyContext): Promise<void> => {
  await ctx.answerCallbackQuery('Matches callbacks coming soon.');
};
