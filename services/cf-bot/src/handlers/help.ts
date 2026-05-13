import type { MyContext } from '../types.js';

const HELP_MESSAGE = `
🤖 *MeetMatch Bot Help*

*Commands:*
/start — Get started
/profile — View or edit your profile
/match — Find your next match
/matches — View your current matches
/settings — Adjust your preferences
/about — About MeetMatch

*Tips:*
• Complete your profile for better matches
• Use /settings to adjust age range and distance
• Matches are based on interests, location, and preferences

Need more help? Contact support.
`;

const ABOUT_MESSAGE = `
🌟 *About MeetMatch*

MeetMatch helps you find people with similar interests near you.

Built with ❤️ using modern tech stack.

Version: 0.0.1
`;

export const helpCommand = async (ctx: MyContext): Promise<void> => {
  await ctx.reply(HELP_MESSAGE, { parse_mode: 'Markdown' });
};

export const aboutCommand = async (ctx: MyContext): Promise<void> => {
  await ctx.reply(ABOUT_MESSAGE, { parse_mode: 'Markdown' });
};
