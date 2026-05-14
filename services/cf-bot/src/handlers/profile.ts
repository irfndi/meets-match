import type { MyContext } from '../types.js';
import { getProfileMenu } from '../menus/profile.js';
import type { Env } from '../index.js';
import { ApiServiceClient } from '../services/api-client.js';

export const profileCommand = async (ctx: MyContext, env: Env): Promise<void> => {
  if (!ctx.from) {
    await ctx.reply('Could not load profile. Please try /start first.');
    return;
  }

  let user: Record<string, unknown> | undefined;
  try {
    const client = new ApiServiceClient(env.API_SERVICE);
    const response = await client.getUser({ userId: String(ctx.from.id) });
    user = response.user as Record<string, unknown> | undefined;
  } catch {
    await ctx.reply('Could not load profile. Please try /start first.');
    return;
  }

  if (!user) {
    await ctx.reply('Profile not found. Please use /start first.');
    return;
  }

  const name = (user.displayName as string) || 'Not set';
  const username = (user.username as string) ? `@${user.username}` : 'N/A';
  const age = user.age || 'Not set';
  const gender = user.gender || 'Not set';
  const bio = user.bio || 'Not set';
  const loc = (user as Record<string, any>).location;
  const locationText = loc?.city ? `${loc.city}, ${loc.country}` : loc?.latitude ? `📍 Shared` : 'Not set';

  const msg = [
    '👤 Profile',
    '',
    `Name: ${name}`,
    `Username: ${username}`,
    `Age: ${age}`,
    `Gender: ${gender}`,
    `Bio: ${bio}`,
    `Location: ${locationText}`,
    '',
    'Select a field to edit:',
  ].join('\n');

  await ctx.reply(msg, {
    reply_markup: getProfileMenu(env),
  });
};
