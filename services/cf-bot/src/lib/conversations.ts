import type { MyContext } from '../types.js';
import type { Env } from '../index.js';
import { getProfileCompleteness, updateUserProfileComplete, type UserProfile } from './user-utils.js';
import { t, type Language } from './i18n.js';

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

export async function startConversation(kv: KVNamespace, userId: string, field: string, data?: Record<string, unknown>): Promise<void> {
  await setConversationState(kv, { userId, field, step: 0, data });
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

async function getUser(env: Env, userId: string): Promise<UserProfile | null> {
  try {
    const response = await env.API_SERVICE.fetch(
      new Request(`http://api/users/${userId}`, { method: 'GET' })
    );
    if (!response.ok) return null;
    const data = await response.json() as { user?: Record<string, unknown> };
    return (data.user ?? null) as UserProfile | null;
  } catch {
    return null;
  }
}

async function checkAndUpdateProfileComplete(env: Env, userId: string): Promise<boolean> {
  try {
    const user = await getUser(env, userId);
    if (!user) return false;
    const { complete, missing } = getProfileCompleteness(user);
    if (complete && missing.length === 0 && !user.isProfileComplete) {
      await updateUserProfileComplete(env, userId, true);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// --- Geocoding for location verification ---

interface GeocodeResult {
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    country?: string;
    state?: string;
  };
}

async function verifyLocation(city: string, country: string): Promise<GeocodeResult | null> {
  try {
    const query = encodeURIComponent(`${city}, ${country}`);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`,
      { headers: { 'User-Agent': 'MeetMatchBot/1.0' } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as GeocodeResult[];
    if (data.length === 0) return null;
    return data[0];
  } catch {
    return null;
  }
}

// --- Phone verification helpers ---

export async function promptPhoneVerification(ctx: MyContext, env: Env, lang: Language = 'en'): Promise<void> {
  const keyboard = {
    keyboard: [[{ text: t('phoneVerifyButton', lang), request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
  await ctx.reply(t('phoneVerifyPrompt', lang), { reply_markup: keyboard });
}

// --- Main conversation router ---

export async function handleConversationMessage(ctx: MyContext, env: Env): Promise<boolean> {
  if (!ctx.from) return false;
  const userId = String(ctx.from.id);
  const state = await getConversationState(env.KV, userId);
  if (!state) return false;

  const text = ctx.message?.text;
  if (!text) return false;

  const lang: Language = 'en';

  if (text === t('genericCancel', lang)) {
    await clearConversationState(env.KV, userId);
    await ctx.reply(t('genericCancelled', lang), { reply_markup: { remove_keyboard: true } });
    return true;
  }

  switch (state.field) {
    case 'bio':
      return handleBioConversation(ctx, env, state, text, lang);
    case 'age':
      return handleAgeConversation(ctx, env, state, text, lang);
    case 'name':
      return handleNameConversation(ctx, env, state, text, lang);
    case 'gender':
      return handleGenderConversation(ctx, env, state, text, lang);
    case 'interests':
      return handleInterestsConversation(ctx, env, state, text, lang);
    case 'location':
      return handleLocationTextConversation(ctx, env, state, text, lang);
    case 'age-range':
      return handleAgeRangeConversation(ctx, env, state, text, lang);
    case 'distance':
      return handleDistanceConversation(ctx, env, state, text, lang);
    case 'gender-pref':
      return handleGenderPrefConversation(ctx, env, state, text, lang);
    default:
      await clearConversationState(env.KV, userId);
      return false;
  }
}

// --- Contact message handler (phone verification) ---

export async function handleContactMessage(ctx: MyContext, env: Env): Promise<boolean> {
  if (!ctx.from || !ctx.message?.contact) return false;
  const userId = String(ctx.from.id);
  const contact = ctx.message.contact;

  // Only accept if the contact is the user's own
  if (String(contact.user_id) !== userId) {
    await ctx.reply('Please share your own contact.', { reply_markup: { remove_keyboard: true } });
    return true;
  }

  const phoneNumber = contact.phone_number;
  if (!phoneNumber) {
    await ctx.reply('Could not get phone number. Please try again.', { reply_markup: { remove_keyboard: true } });
    return true;
  }

  // Update user with phone number
  const success = await updateUser(env, userId, { phoneNumber });
  await ctx.reply(
    success ? t('phoneVerified', 'en') : t('genericError', 'en'),
    { reply_markup: { remove_keyboard: true } }
  );
  return true;
}

// --- Location message handler (GPS share) ---

export async function handleLocationMessage(ctx: MyContext, env: Env): Promise<boolean> {
  if (!ctx.from || !ctx.message?.location) return false;
  const userId = String(ctx.from.id);
  const state = await getConversationState(env.KV, userId);

  // Only handle if we're in a location conversation or a general location share
  if (!state || state.field !== 'location') {
    // Check if user is sharing location spontaneously
    const { latitude, longitude } = ctx.message.location;
    const success = await updateUser(env, userId, { location: { latitude, longitude } });
    await ctx.reply(success ? t('locationUpdated', 'en') : t('genericError', 'en'));
    return true;
  }

  // In location conversation
  const { latitude, longitude } = ctx.message.location;
  const success = await updateUser(env, userId, { location: { latitude, longitude } });
  await clearConversationState(env.KV, state.userId);

  if (success) {
    const becameComplete = await checkAndUpdateProfileComplete(env, state.userId);
    await ctx.reply(t('locationUpdated', 'en'), { reply_markup: { remove_keyboard: true } });
    if (becameComplete) {
      await promptPhoneVerification(ctx, env, 'en');
    }
  } else {
    await ctx.reply(t('genericError', 'en'), { reply_markup: { remove_keyboard: true } });
  }
  return true;
}

// --- Conversation handlers ---

async function handleBioConversation(ctx: MyContext, env: Env, state: ConversationState, text: string, lang: Language): Promise<boolean> {
  if (text.length > 300) {
    await ctx.reply(t('bioTooLong', lang));
    return true;
  }
  const success = await updateUser(env, state.userId, { bio: text });
  await clearConversationState(env.KV, state.userId);
  if (success) {
    const becameComplete = await checkAndUpdateProfileComplete(env, state.userId);
    await ctx.reply(t('bioUpdated', lang), { reply_markup: { remove_keyboard: true } });
    if (becameComplete) await promptPhoneVerification(ctx, env, lang);
  } else {
    await ctx.reply(t('genericError', lang), { reply_markup: { remove_keyboard: true } });
  }
  return true;
}

async function handleAgeConversation(ctx: MyContext, env: Env, state: ConversationState, text: string, lang: Language): Promise<boolean> {
  const age = parseInt(text, 10);
  if (Number.isNaN(age) || age < 18 || age > 65) {
    await ctx.reply(t('ageInvalid', lang));
    return true;
  }
  const success = await updateUser(env, state.userId, { age });
  await clearConversationState(env.KV, state.userId);
  if (success) {
    const becameComplete = await checkAndUpdateProfileComplete(env, state.userId);
    await ctx.reply(t('ageUpdated', lang, { age: String(age) }), { reply_markup: { remove_keyboard: true } });
    if (becameComplete) await promptPhoneVerification(ctx, env, lang);
  } else {
    await ctx.reply(t('genericError', lang), { reply_markup: { remove_keyboard: true } });
  }
  return true;
}

async function handleNameConversation(ctx: MyContext, env: Env, state: ConversationState, text: string, lang: Language): Promise<boolean> {
  const name = text.trim();
  if (name.length < 1 || name.length > 50) {
    await ctx.reply(t('nameInvalid', lang));
    return true;
  }
  const success = await updateUser(env, state.userId, { displayName: name });
  await clearConversationState(env.KV, state.userId);
  if (success) {
    const becameComplete = await checkAndUpdateProfileComplete(env, state.userId);
    await ctx.reply(t('nameUpdated', lang, { name }), { reply_markup: { remove_keyboard: true } });
    if (becameComplete) await promptPhoneVerification(ctx, env, lang);
  } else {
    await ctx.reply(t('genericError', lang), { reply_markup: { remove_keyboard: true } });
  }
  return true;
}

async function handleGenderConversation(ctx: MyContext, env: Env, state: ConversationState, text: string, lang: Language): Promise<boolean> {
  const genderMap: Record<string, string> = { Male: 'male', Female: 'female' };
  const gender = genderMap[text];
  if (!gender) {
    await ctx.reply(t('genderInvalid', lang));
    return true;
  }
  const success = await updateUser(env, state.userId, { gender });
  await clearConversationState(env.KV, state.userId);
  if (success) {
    const becameComplete = await checkAndUpdateProfileComplete(env, state.userId);
    await ctx.reply(t('genderUpdated', lang), { reply_markup: { remove_keyboard: true } });
    if (becameComplete) await promptPhoneVerification(ctx, env, lang);
  } else {
    await ctx.reply(t('genericError', lang), { reply_markup: { remove_keyboard: true } });
  }
  return true;
}

async function handleInterestsConversation(ctx: MyContext, env: Env, state: ConversationState, text: string, lang: Language): Promise<boolean> {
  const interests = text.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  if (interests.length === 0) {
    await ctx.reply(t('interestsInvalid', lang));
    return true;
  }
  if (interests.length > 10) {
    await ctx.reply(t('interestsInvalid', lang));
    return true;
  }
  const success = await updateUser(env, state.userId, { interests });
  await clearConversationState(env.KV, state.userId);
  if (success) {
    const becameComplete = await checkAndUpdateProfileComplete(env, state.userId);
    await ctx.reply(t('interestsUpdated', lang, { interests: interests.join(', ') }), { reply_markup: { remove_keyboard: true } });
    if (becameComplete) await promptPhoneVerification(ctx, env, lang);
  } else {
    await ctx.reply(t('genericError', lang), { reply_markup: { remove_keyboard: true } });
  }
  return true;
}

// Location: text-based (manual city/country)
async function handleLocationTextConversation(ctx: MyContext, env: Env, state: ConversationState, text: string, lang: Language): Promise<boolean> {
  const parts = text.split(',').map((s) => s.trim());
  if (parts.length < 2) {
    await ctx.reply(t('locationTypePrompt', lang));
    return true;
  }
  const [city, country] = parts;

  // Verify location via geocoding
  const geo = await verifyLocation(city, country);
  if (!geo) {
    await ctx.reply(t('locationInvalid', lang));
    return true;
  }

  // Use normalized location from geocoding if available
  const normalizedCity = geo.address?.city ?? geo.address?.town ?? geo.address?.village ?? city;
  const normalizedCountry = geo.address?.country ?? country;
  const lat = parseFloat(geo.lat);
  const lon = parseFloat(geo.lon);

  const success = await updateUser(env, state.userId, {
    location: { city: normalizedCity, country: normalizedCountry, latitude: lat, longitude: lon },
  });
  await clearConversationState(env.KV, state.userId);
  if (success) {
    const becameComplete = await checkAndUpdateProfileComplete(env, state.userId);
    await ctx.reply(t('locationUpdated', lang), { reply_markup: { remove_keyboard: true } });
    if (becameComplete) await promptPhoneVerification(ctx, env, lang);
  } else {
    await ctx.reply(t('genericError', lang), { reply_markup: { remove_keyboard: true } });
  }
  return true;
}

async function handleAgeRangeConversation(ctx: MyContext, env: Env, state: ConversationState, text: string, lang: Language): Promise<boolean> {
  const match = text.trim().match(/^(\d+)\s*-\s*(\d+)$/);
  if (!match) {
    await ctx.reply(t('ageRangeInvalid', lang));
    return true;
  }
  const min = parseInt(match[1], 10);
  const max = parseInt(match[2], 10);
  if (min < 18 || max > 65 || min > max) {
    await ctx.reply(t('ageRangeInvalid', lang));
    return true;
  }
  const success = await updateUser(env, state.userId, { preferences: { minAge: min, maxAge: max } });
  await clearConversationState(env.KV, state.userId);
  if (success) {
    await ctx.reply(t('ageRangeUpdated', lang, { min: String(min), max: String(max) }), { reply_markup: { remove_keyboard: true } });
  } else {
    await ctx.reply(t('genericError', lang), { reply_markup: { remove_keyboard: true } });
  }
  return true;
}

async function handleDistanceConversation(ctx: MyContext, env: Env, state: ConversationState, text: string, lang: Language): Promise<boolean> {
  if (!/^\d+$/.test(text.trim())) {
    await ctx.reply(t('distanceInvalid', lang));
    return true;
  }
  const distance = parseInt(text, 10);
  if (Number.isNaN(distance) || distance < 1 || distance > 500) {
    await ctx.reply(t('distanceInvalid', lang));
    return true;
  }
  const success = await updateUser(env, state.userId, { preferences: { maxDistance: distance } });
  await clearConversationState(env.KV, state.userId);
  if (success) {
    await ctx.reply(t('distanceUpdated', lang, { distance: String(distance) }), { reply_markup: { remove_keyboard: true } });
  } else {
    await ctx.reply(t('genericError', lang), { reply_markup: { remove_keyboard: true } });
  }
  return true;
}

async function handleGenderPrefConversation(ctx: MyContext, env: Env, state: ConversationState, text: string, lang: Language): Promise<boolean> {
  const normalized = text.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const valid = normalized.every((g) => ["male", "female", "other", "prefer_not_to_say"].includes(g));
  if (!valid || normalized.length === 0) {
    await ctx.reply(t('genderPrefInvalid', lang));
    return true;
  }
  const success = await updateUser(env, state.userId, { preferences: { genderPreference: normalized } });
  await clearConversationState(env.KV, state.userId);
  if (success) {
    await ctx.reply(t('genderPrefUpdated', lang, { preferences: normalized.join(', ') }), { reply_markup: { remove_keyboard: true } });
  } else {
    await ctx.reply(t('genericError', lang), { reply_markup: { remove_keyboard: true } });
  }
  return true;
}
