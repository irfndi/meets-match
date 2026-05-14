import type { MyContext } from '../types.js';
import type { Env } from '../index.js';

interface ConversationState {
  userId: string;
  field: string;
  step: number;
  data?: Record<string, unknown>;
}

const CONVERSATION_TTL_SECONDS = 300;

export async function getConversationState(kv: KVNamespace, userId: string): Promise<ConversationState | null> {
  const value = await kv.get(`conversation:${userId}`);
  return value ? JSON.parse(value) : null;
}

export async function setConversationState(kv: KVNamespace, state: ConversationState): Promise<void> {
  await kv.put(`conversation:${state.userId}`, JSON.stringify(state), { expirationTtl: CONVERSATION_TTL_SECONDS });
}

export async function clearConversationState(kv: KVNamespace, userId: string): Promise<void> {
  await kv.delete(`conversation:${userId}`);
}

export async function startConversation(kv: KVNamespace, userId: string, field: string): Promise<void> {
  await setConversationState(kv, { userId, field, step: 0 });
}

async function updateUser(env: Env, userId: string, updates: Record<string, unknown>): Promise<boolean> {
  try {
    const response = await env.API_SERVICE.fetch(new Request(`http://api/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ user: updates }),
      headers: { 'Content-Type': 'application/json' },
    }));
    return response.ok;
  } catch {
    return false;
  }
}

export async function handleConversationMessage(ctx: MyContext, env: Env): Promise<boolean> {
  if (!ctx.from) return false;
  const userId = String(ctx.from.id);
  const state = await getConversationState(env.KV, userId);
  if (!state) return false;

  const text = ctx.message?.text;
  if (!text) return false;

  if (text === 'Cancel') {
    await clearConversationState(env.KV, userId);
    await ctx.reply('Cancelled.', { reply_markup: { remove_keyboard: true } });
    return true;
  }

  switch (state.field) {
    case 'bio':
      return handleBioConversation(ctx, env, state, text);
    case 'age':
      return handleAgeConversation(ctx, env, state, text);
    case 'name':
      return handleNameConversation(ctx, env, state, text);
    case 'gender':
      return handleGenderConversation(ctx, env, state, text);
    case 'interests':
      return handleInterestsConversation(ctx, env, state, text);
    case 'location':
      return handleLocationConversation(ctx, env, state, text);
    case 'age-range':
      return handleAgeRangeConversation(ctx, env, state, text);
    case 'distance':
      return handleDistanceConversation(ctx, env, state, text);
    case 'gender-pref':
      return handleGenderPrefConversation(ctx, env, state, text);
    default:
      await clearConversationState(env.KV, userId);
      return false;
  }
}

async function handleBioConversation(ctx: MyContext, env: Env, state: ConversationState, text: string): Promise<boolean> {
  if (text.length > 300) {
    await ctx.reply('Bio is too long (max 300 characters). Try again or type Cancel.');
    return true;
  }
  const success = await updateUser(env, state.userId, { bio: text });
  await clearConversationState(env.KV, state.userId);
  if (success) {
    await ctx.reply('Bio updated!', { reply_markup: { remove_keyboard: true } });
  } else {
    await ctx.reply('Failed to update bio. Please try again later.', { reply_markup: { remove_keyboard: true } });
  }
  return true;
}

async function handleAgeConversation(ctx: MyContext, env: Env, state: ConversationState, text: string): Promise<boolean> {
  const age = parseInt(text, 10);
  if (Number.isNaN(age) || age < 18 || age > 65) {
    await ctx.reply('Invalid age. Must be between 18 and 65. Try again or type Cancel.');
    return true;
  }
  const success = await updateUser(env, state.userId, { age });
  await clearConversationState(env.KV, state.userId);
  if (success) {
    await ctx.reply(`Age updated to ${age}!`, { reply_markup: { remove_keyboard: true } });
  } else {
    await ctx.reply('Failed to update age. Please try again later.', { reply_markup: { remove_keyboard: true } });
  }
  return true;
}

async function handleNameConversation(ctx: MyContext, env: Env, state: ConversationState, text: string): Promise<boolean> {
  const name = text.trim();
  if (name.length < 1 || name.length > 50) {
    await ctx.reply('Name must be 1-50 characters. Try again or type Cancel.');
    return true;
  }
  const success = await updateUser(env, state.userId, { firstName: name });
  await clearConversationState(env.KV, state.userId);
  if (success) {
    await ctx.reply(`Name updated to ${name}!`, { reply_markup: { remove_keyboard: true } });
  } else {
    await ctx.reply('Failed to update name. Please try again later.', { reply_markup: { remove_keyboard: true } });
  }
  return true;
}

async function handleGenderConversation(ctx: MyContext, env: Env, state: ConversationState, text: string): Promise<boolean> {
  const genderMap: Record<string, string> = { Male: 'male', Female: 'female' };
  const gender = genderMap[text];
  if (!gender) {
    await ctx.reply('Invalid selection. Please choose Male or Female, or type Cancel.');
    return true;
  }
  const success = await updateUser(env, state.userId, { gender });
  await clearConversationState(env.KV, state.userId);
  if (success) {
    await ctx.reply(`Gender updated!`, { reply_markup: { remove_keyboard: true } });
  } else {
    await ctx.reply('Failed to update gender. Please try again later.', { reply_markup: { remove_keyboard: true } });
  }
  return true;
}

async function handleInterestsConversation(ctx: MyContext, env: Env, state: ConversationState, text: string): Promise<boolean> {
  const interests = text.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  if (interests.length === 0) {
    await ctx.reply('Please enter at least one interest, separated by commas. Try again or type Cancel.');
    return true;
  }
  if (interests.length > 10) {
    await ctx.reply('Too many interests (max 10). Try again or type Cancel.');
    return true;
  }
  const success = await updateUser(env, state.userId, { interests });
  await clearConversationState(env.KV, state.userId);
  if (success) {
    await ctx.reply(`Interests updated: ${interests.join(', ')}!`, { reply_markup: { remove_keyboard: true } });
  } else {
    await ctx.reply('Failed to update interests. Please try again later.', { reply_markup: { remove_keyboard: true } });
  }
  return true;
}

async function handleLocationConversation(ctx: MyContext, env: Env, state: ConversationState, text: string): Promise<boolean> {
  const parts = text.split(',').map((s) => s.trim());
  if (parts.length < 2) {
    await ctx.reply('Please enter city and country separated by a comma (e.g., "Jakarta, Indonesia"). Try again or type Cancel.');
    return true;
  }
  const [city, country] = parts;
  const success = await updateUser(env, state.userId, { location: { city, country } });
  await clearConversationState(env.KV, state.userId);
  if (success) {
    await ctx.reply(`Location updated to ${city}, ${country}!`, { reply_markup: { remove_keyboard: true } });
  } else {
    await ctx.reply('Failed to update location. Please try again later.', { reply_markup: { remove_keyboard: true } });
  }
  return true;
}

async function handleAgeRangeConversation(ctx: MyContext, env: Env, state: ConversationState, text: string): Promise<boolean> {
  const match = text.trim().match(/^(\d+)\s*-\s*(\d+)$/);
  if (!match) {
    await ctx.reply('Invalid format. Enter age range like "18-30". Try again or type Cancel.');
    return true;
  }
  const min = parseInt(match[1], 10);
  const max = parseInt(match[2], 10);
  if (min < 18 || max > 65 || min > max) {
    await ctx.reply('Age must be between 18-65 and min must be less than max. Try again or type Cancel.');
    return true;
  }
  const success = await updateUser(env, state.userId, { preferences: { minAge: min, maxAge: max } });
  await clearConversationState(env.KV, state.userId);
  if (success) {
    await ctx.reply(`Age range set to ${min}-${max}!`, { reply_markup: { remove_keyboard: true } });
  } else {
    await ctx.reply('Failed to update age range. Please try again later.', { reply_markup: { remove_keyboard: true } });
  }
  return true;
}

async function handleDistanceConversation(ctx: MyContext, env: Env, state: ConversationState, text: string): Promise<boolean> {
  if (!/^\d+$/.test(text.trim())) {
    await ctx.reply('Enter a valid integer distance in km (1-500). Try again or type Cancel.');
    return true;
  }
  const distance = parseInt(text, 10);
  if (Number.isNaN(distance) || distance < 1 || distance > 500) {
    await ctx.reply('Enter a valid distance in km (1-500). Try again or type Cancel.');
    return true;
  }
  const success = await updateUser(env, state.userId, { preferences: { maxDistance: distance } });
  await clearConversationState(env.KV, state.userId);
  if (success) {
    await ctx.reply(`Max distance set to ${distance}km!`, { reply_markup: { remove_keyboard: true } });
  } else {
    await ctx.reply('Failed to update distance. Please try again later.', { reply_markup: { remove_keyboard: true } });
  }
  return true;
}

async function handleGenderPrefConversation(ctx: MyContext, env: Env, state: ConversationState, text: string): Promise<boolean> {
  const normalized = text.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const valid = normalized.every((g) => ["male", "female", "other", "prefer_not_to_say"].includes(g));
  if (!valid || normalized.length === 0) {
    await ctx.reply('Enter valid genders separated by commas (male, female, other, prefer_not_to_say). Try again or type Cancel.');
    return true;
  }
  const success = await updateUser(env, state.userId, { preferences: { genderPreference: normalized } });
  await clearConversationState(env.KV, state.userId);
  if (success) {
    await ctx.reply(`Gender preference set to: ${normalized.join(', ')}!`, { reply_markup: { remove_keyboard: true } });
  } else {
    await ctx.reply('Failed to update gender preference. Please try again later.', { reply_markup: { remove_keyboard: true } });
  }
  return true;
}
