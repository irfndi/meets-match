import type { MyContext } from '../types.js';
import { getProfileMenu } from '../menus/profile.js';
import type { Env } from '../index.js';
import { ensureUserExists, getProfileCompleteness, getMissingFieldsDisplay } from '../lib/user-utils.js';

export const profileCommand = async (ctx: MyContext, env: Env): Promise<void> => {
  if (!ctx.from) {
    await ctx.reply('Could not identify you. Please try /start first.');
    return;
  }

  const result = await ensureUserExists(ctx, env);
  if (!result) {
    await ctx.reply('❌ Sorry, there was an error loading your profile. Please try again later.');
    return;
  }

  const { user } = result;
  const name = user.displayName || 'Not set';
  const username = user.username ? `@${user.username}` : 'N/A';
  const age = user.age || 'Not set';
  const gender = user.gender || 'Not set';
  const bio = user.bio || 'Not set';
  const loc = user.location;
  const locationText = loc?.city ? `${loc.city}, ${loc.country}` : loc?.latitude ? `📍 Shared` : 'Not set';

  const { complete, missing } = getProfileCompleteness(user);

  const msgParts = [
    '👤 Profile',
    '',
    `Name: ${name}`,
    `Username: ${username}`,
    `Age: ${age}`,
    `Gender: ${gender}`,
    `Bio: ${bio}`,
    `Location: ${locationText}`,
  ];

  if (!complete) {
    msgParts.push(
      '',
      '⚠️ Your profile is incomplete. To start matching, please fill in:',
      getMissingFieldsDisplay(missing)
    );
  }

  msgParts.push('', 'Select a field to edit:');

  await ctx.reply(msgParts.join('\n'), {
    reply_markup: getProfileMenu(env),
  });
};
