import type { MyContext } from '../types.js';
import { getMainMenuKeyboard } from '../lib/main-menu.js';
import { getVersionInfo, formatDuration } from '../lib/version.js';

export const helpCommand = async (ctx: MyContext): Promise<void> => {
  const msg = [
    '🤖 *MeetMatch Bot*',
    '',
    '*Commands:*',
    '*/start* — Get started',
    '*/profile* — View or edit your profile',
    '*/match* — Find your next match',
    '*/matches* — View your matches and likes',
    '*/settings* — Adjust your preferences',
    '*/help* — Show this help',
    '*/about* — About MeetMatch',
    '',
    '*Tips:*',
    '• Complete your profile for better matches',
    '• Use */settings* to adjust age range and distance',
    '• Matches are based on interests, location, and preferences',
    '',
    'Need help? Contact support.',
  ].join('\n');

  await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: getMainMenuKeyboard() });
};

export const aboutCommand = async (ctx: MyContext): Promise<void> => {
  const { version, environment, builtAt } = getVersionInfo();
  const serverAge = formatDuration(builtAt);

  const msg = [
    '🌟 *About MeetMatch*',
    '',
    'MeetMatch helps you find people with similar interests near you.',
    '',
    'Built with ❤️ using modern tech.',
    '',
    `*Version:* ${version}`,
    `*Environment:* ${environment}`,
    `*Last updated:* ${builtAt}`,
    `*Server age:* ${serverAge}`,
  ].join('\n');

  await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: getMainMenuKeyboard() });
};
