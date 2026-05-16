import type { MyContext } from "../types.js";
import type { Env } from "../index.js";
import {
  getProfileCompleteness,
  updateUserProfileComplete,
  parseBirthDate,
  type UserProfile,
} from "./user-utils.js";
import { getMainMenuKeyboard } from "./main-menu.js";
import { t, type Language, escapeMd } from "./i18n.js";
import { InlineKeyboard } from "grammy";
import {
  createLogger,
  buildMediaKey,
  buildMediaPublicUrl,
} from "@meetsmatch/cf-shared";

const log = createLogger("cf-bot");
import {
  handleReportConversation,
  handleLikeMessageConversation,
  handleLikeMessageMedia,
} from "../handlers/match.js";

interface ConversationState {
  userId: string;
  field: string;
  step: number;
  data?: Record<string, unknown>;
}

const CONVERSATION_TTL_SECONDS = 1800; // 30 minutes

export async function getConversationState(
  kv: KVNamespace,
  userId: string,
): Promise<ConversationState | null> {
  const value = await kv.get(`conversation:${userId}`);
  return value ? JSON.parse(value) : null;
}

export async function setConversationState(
  kv: KVNamespace,
  state: ConversationState,
): Promise<void> {
  await kv.put(`conversation:${state.userId}`, JSON.stringify(state), {
    expirationTtl: CONVERSATION_TTL_SECONDS,
  });
}

export async function clearConversationState(
  kv: KVNamespace,
  userId: string,
): Promise<void> {
  await kv.delete(`conversation:${userId}`);
}

export async function startConversation(
  kv: KVNamespace,
  userId: string,
  field: string,
  data?: Record<string, unknown>,
): Promise<void> {
  await setConversationState(kv, { userId, field, step: 0, data });
}

// --- Mandatory update check ---

export async function checkMandatoryUpdates(
  ctx: MyContext,
  env: Env,
): Promise<boolean> {
  if (!ctx.from) return false;
  const userId = String(ctx.from.id);
  try {
    const response = await env.API_SERVICE.fetch(
      new Request(`http://api/users/${userId}`, { method: "GET" }),
    );
    if (!response.ok) return false;
    const data = (await response.json()) as { user?: UserProfile };
    const user = data.user;
    if (!user) return false;

    // Check if birthDate is missing for migrated age-only profiles
    if (!user.birthDate && user.age) {
      await startConversation(env.KV, userId, "birthdate");
      await ctx.reply(
        "📢 *Profile Update Required*\n\n" +
          "We have updated how ages are stored. Please enter your birthdate to continue.\n\n" +
          "Enter your birthdate in *DD.MM.YYYY* format (e.g. *15.03.1995*).",
        { parse_mode: "Markdown" },
      );
      return true;
    }

    return false;
  } catch (error) {
    log.error(
      "checkMandatoryUpdates",
      "Failed to check mandatory updates",
      { userId },
      error,
    );
    return false;
  }
}

async function updateUser(
  env: Env,
  userId: string,
  updates: Record<string, unknown>,
): Promise<boolean> {
  try {
    const response = await env.API_SERVICE.fetch(
      new Request(`http://api/users/${userId}`, {
        method: "PUT",
        body: JSON.stringify({ user: updates }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    return response.ok;
  } catch (error) {
    log.error("updateUser", "Failed to update user", { userId }, error);
    return false;
  }
}

async function getUser(env: Env, userId: string): Promise<UserProfile | null> {
  try {
    const response = await env.API_SERVICE.fetch(
      new Request(`http://api/users/${userId}`, { method: "GET" }),
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { user?: Record<string, unknown> };
    return (data.user ?? null) as UserProfile | null;
  } catch (error) {
    log.error("getUser", "Failed to get user", { userId }, error);
    return null;
  }
}

export async function checkAndUpdateProfileComplete(
  env: Env,
  userId: string,
): Promise<boolean> {
  try {
    const user = await getUser(env, userId);
    if (!user) return false;
    const { complete, missing } = getProfileCompleteness(user);
    if (complete && missing.length === 0 && !user.isProfileComplete) {
      await updateUserProfileComplete(env, userId, true);
      return true;
    }
    return false;
  } catch (error) {
    log.error(
      "checkAndUpdateProfileComplete",
      "Failed to check profile completeness",
      { userId },
      error,
    );
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

async function verifyLocation(
  city: string,
  country: string,
): Promise<GeocodeResult | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const query = encodeURIComponent(`${city}, ${country}`);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`,
      {
        headers: { "User-Agent": "MeetMatchBot/1.0" },
        signal: controller.signal,
      },
    );
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = (await res.json()) as GeocodeResult[];
    if (data.length === 0) return null;
    return data[0];
  } catch (error) {
    log.error("verifyLocation", "Geocoding failed", { city, country }, error);
    return null;
  }
}

// --- Phone verification helpers ---

export async function promptPhoneVerification(
  ctx: MyContext,
  env: Env,
  lang: Language = "en",
): Promise<void> {
  const keyboard = {
    keyboard: [[{ text: t("phoneVerifyButton", lang), request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
  await ctx.reply(t("phoneVerifyPrompt", lang), { reply_markup: keyboard });
}

// --- Main conversation router ---

export async function handleConversationMessage(
  ctx: MyContext,
  env: Env,
): Promise<boolean> {
  if (!ctx.from) return false;
  const userId = String(ctx.from.id);
  const state = await getConversationState(env.KV, userId);
  if (!state) return false;

  const text = ctx.message?.text;
  if (!text) return false;

  // Fetch user's language preference
  const user = await getUser(env, userId);
  const lang: Language = (user?.language as Language) ?? "en";

  if (text === t("genericCancel", lang)) {
    await clearConversationState(env.KV, userId);
    await ctx.reply(t("genericCancelled", lang), {
      reply_markup: getMainMenuKeyboard(),
    });
    return true;
  }

  // Handle media conversation "Done" button
  if (state.field === "media" && text === t("mediaDoneButton", lang)) {
    await clearConversationState(env.KV, userId);
    const becameComplete = await checkAndUpdateProfileComplete(env, userId);
    await ctx.reply(t("genericCancelled", lang), {
      reply_markup: getMainMenuKeyboard(),
    });
    if (becameComplete) await promptPhoneVerification(ctx, env, lang);
    return true;
  }

  switch (state.field) {
    case "bio":
      return handleBioConversation(ctx, env, state, text, lang);
    case "birthdate":
      return handleBirthDateConversation(ctx, env, state, text, lang);
    case "name":
      return handleNameConversation(ctx, env, state, text, lang);
    case "gender":
      return handleGenderConversation(ctx, env, state, text, lang);
    case "interests":
      return handleInterestsConversation(ctx, env, state, text, lang);
    case "location":
      return handleLocationTextConversation(ctx, env, state, text, lang);
    case "age-range":
      return handleAgeRangeConversation(ctx, env, state, text, lang);
    case "distance":
      return handleDistanceConversation(ctx, env, state, text, lang);
    case "gender-pref":
      return handleGenderPrefConversation(ctx, env, state, text, lang);
    case "report":
      return handleReportConversation(ctx, env, text, lang);
    case "like-message":
      return handleLikeMessageConversation(ctx, env, text, lang);
    default:
      await clearConversationState(env.KV, userId);
      return false;
  }
}

// --- Contact message handler (phone verification) ---

export async function handleContactMessage(
  ctx: MyContext,
  env: Env,
): Promise<boolean> {
  if (!ctx.from || !ctx.message?.contact) return false;
  const userId = String(ctx.from.id);
  const contact = ctx.message.contact;

  // Resolve user's language
  const user = await getUser(env, userId);
  const lang: Language = (user?.language as Language) ?? "en";

  // Only accept if the contact is the user's own
  if (String(contact.user_id) !== userId) {
    await ctx.reply(t("phoneShareOwn", lang), {
      reply_markup: getMainMenuKeyboard(),
    });
    return true;
  }

  const phoneNumber = contact.phone_number;
  if (!phoneNumber) {
    await ctx.reply(t("phoneFailed", lang), {
      reply_markup: getMainMenuKeyboard(),
    });
    return true;
  }

  // Update user with phone number
  const success = await updateUser(env, userId, { phoneNumber });
  await ctx.reply(
    success ? t("phoneVerified", lang) : t("genericError", lang),
    { reply_markup: getMainMenuKeyboard() },
  );
  return true;
}

// --- Location message handler (GPS share) ---

async function reverseGeocodeLocation(
  env: Env,
  latitude: number,
  longitude: number,
): Promise<{ city?: string; country?: string } | null> {
  try {
    const res = await env.API_SERVICE.fetch(
      new Request(`http://api/geocode?lat=${latitude}&lon=${longitude}`),
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      result?: { city?: string; country?: string };
    };
    return data.result ?? null;
  } catch {
    return null;
  }
}

export async function handleLocationMessage(
  ctx: MyContext,
  env: Env,
): Promise<boolean> {
  if (!ctx.from || !ctx.message?.location) return false;
  const userId = String(ctx.from.id);
  const state = await getConversationState(env.KV, userId);
  const { latitude, longitude } = ctx.message.location;

  // Resolve user's language
  const user = await getUser(env, userId);
  const lang: Language = (user?.language as Language) ?? "en";

  // Reverse geocode to get city/country
  const geo = await reverseGeocodeLocation(env, latitude, longitude);
  const location = geo?.city
    ? { latitude, longitude, city: geo.city, country: geo.country }
    : { latitude, longitude };

  // Only handle if we're in a location conversation or a general location share
  if (!state || state.field !== "location") {
    // Check if user is sharing location spontaneously
    const success = await updateUser(env, userId, { location });
    await ctx.reply(
      success ? t("locationUpdated", lang) : t("genericError", lang),
    );
    return true;
  }

  // In location conversation
  const success = await updateUser(env, userId, { location });
  await clearConversationState(env.KV, state.userId);

  if (success) {
    const becameComplete = await checkAndUpdateProfileComplete(
      env,
      state.userId,
    );
    await ctx.reply(t("locationUpdated", lang), {
      reply_markup: getMainMenuKeyboard(),
    });
    if (becameComplete) {
      await promptPhoneVerification(ctx, env, lang);
    }
  } else {
    await ctx.reply(t("genericError", lang), {
      reply_markup: getMainMenuKeyboard(),
    });
  }
  return true;
}

// --- Media message handler ---

export async function handleMediaMessage(
  ctx: MyContext,
  env: Env,
  fileType: "image" | "video",
): Promise<boolean> {
  if (!ctx.from || !ctx.message) return false;
  const userId = String(ctx.from.id);

  // Check if in media conversation
  const state = await getConversationState(env.KV, userId);
  if (!state || state.field !== "media") return false;

  // Get file_id
  let fileId: string;
  let fileName: string;
  if (fileType === "image" && ctx.message.photo) {
    const photos = ctx.message.photo;
    fileId = photos[photos.length - 1].file_id;
    fileName = `photo_${Date.now()}.jpg`;
  } else if (fileType === "video" && ctx.message.video) {
    fileId = ctx.message.video.file_id;
    fileName = ctx.message.video.file_name || `video_${Date.now()}.mp4`;
  } else {
    return false;
  }

  // Get current media count
  const user = await getUser(env, userId);
  const lang: Language = (user?.language as Language) ?? "en";
  const currentCount = (user?.mediaUrls as Array<unknown>)?.length ?? 0;

  if (currentCount >= 3) {
    await ctx.reply(
      t("mediaMaxReached", lang, { count: String(currentCount) }),
    );
    return true;
  }

  try {
    // Get file info from Telegram
    const file = await ctx.api.getFile(fileId);
    if (!file.file_path) {
      console.error(
        "[media] Failed to get file path from Telegram for file_id:",
        fileId,
      );
      await ctx.reply(t("mediaUploadError", lang));
      return true;
    }

    // Download file from Telegram
    const fileUrl = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${file.file_path}`;
    const response = await fetch(fileUrl);
    if (!response.ok) {
      console.error(
        "[media] Failed to download from Telegram:",
        response.status,
        response.statusText,
      );
      await ctx.reply(t("mediaUploadError", lang));
      return true;
    }

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    console.log(
      `[media] Downloaded ${fileType} from Telegram: ${bytes.length} bytes`,
    );

    if (!env.MEDIA_BUCKET) {
      console.error("[media] MEDIA_BUCKET binding not available");
      await ctx.reply(t("mediaUploadError", lang));
      return true;
    }

    // Upload directly to R2 from the bot worker
    const ext =
      fileType === "image"
        ? fileName.endsWith(".png")
          ? "png"
          : "jpg"
        : "mp4";
    const key = buildMediaKey(userId, ext);
    const contentType = fileType === "image" ? `image/${ext}` : "video/mp4";

    try {
      await env.MEDIA_BUCKET.put(key, bytes, {
        httpMetadata: { contentType },
      });
      console.log(`[media] Uploaded to R2: ${key}`);
    } catch (r2Error) {
      console.error("[media] R2 upload failed:", r2Error);
      await ctx.reply(t("mediaUploadError", lang));
      return true;
    }

    const publicUrl = buildMediaPublicUrl(key);

    // Register URL in DB via API
    const apiResponse = await env.API_SERVICE.fetch(
      new Request(`http://api/users/${userId}/media`, {
        method: "POST",
        body: JSON.stringify({ url: publicUrl, type: fileType }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    if (!apiResponse.ok) {
      const errorBody = await apiResponse.text().catch(() => "unknown");
      console.error(
        `[media] API register failed: ${apiResponse.status} ${errorBody}`,
      );
      // Clean up orphaned R2 object
      await env.MEDIA_BUCKET.delete(key).catch(() => {});

      // Check for rate limit (daily upload limit)
      if (apiResponse.status === 429) {
        const keyboard = new InlineKeyboard()
          .text("🎁 Share for Bonus", "referral:show")
          .row()
          .text("👑 Get Premium", "premium:show");
        await ctx.reply(t("mediaLimitReached", lang), {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        });
        return true;
      }

      // General failure — offer retry
      const retryKeyboard = new InlineKeyboard()
        .text("🔄 Retry", "media:retry")
        .row()
        .text("❌ Cancel", "media:cancel");
      await ctx.reply(t("mediaRetryPrompt", lang), {
        reply_markup: retryKeyboard,
      });
      return true;
    }

    const result = (await apiResponse.json()) as { mediaUrls?: Array<unknown> };
    const newCount = result.mediaUrls?.length ?? currentCount + 1;
    console.log(`[media] Registered in DB. User now has ${newCount}/3 media.`);

    const becameComplete = await checkAndUpdateProfileComplete(env, userId);

    if (newCount >= 3) {
      await clearConversationState(env.KV, userId);
      await ctx.reply(
        t("mediaUploadSuccess", lang, { count: String(newCount) }),
        { reply_markup: getMainMenuKeyboard() },
      );
      if (becameComplete) await promptPhoneVerification(ctx, env, lang);
    } else {
      const keyboard = {
        keyboard: [[{ text: t("mediaDoneButton", lang) }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      };
      await ctx.reply(
        t("mediaUploadSuccess", lang, { count: String(newCount) }) +
          "\n\n" +
          t("mediaDonePrompt", lang),
        { reply_markup: keyboard },
      );
      if (becameComplete) await promptPhoneVerification(ctx, env, lang);
    }

    return true;
  } catch (error) {
    console.error("Media upload error:", error);
    await ctx.reply(t("mediaUploadError", lang));
    return true;
  }
}

// --- Conversation handlers ---

async function handleBioConversation(
  ctx: MyContext,
  env: Env,
  state: ConversationState,
  text: string,
  lang: Language,
): Promise<boolean> {
  if (text.length > 300) {
    await ctx.reply(t("bioTooLong", lang));
    return true;
  }
  const success = await updateUser(env, state.userId, { bio: text });
  await clearConversationState(env.KV, state.userId);
  if (success) {
    const becameComplete = await checkAndUpdateProfileComplete(
      env,
      state.userId,
    );
    await ctx.reply(t("bioUpdated", lang), {
      reply_markup: getMainMenuKeyboard(),
    });
    if (becameComplete) await promptPhoneVerification(ctx, env, lang);
  } else {
    await ctx.reply(t("genericError", lang), {
      reply_markup: getMainMenuKeyboard(),
    });
  }
  return true;
}

async function handleBirthDateConversation(
  ctx: MyContext,
  env: Env,
  state: ConversationState,
  text: string,
  lang: Language,
): Promise<boolean> {
  const parsed = parseBirthDate(text);
  if (!parsed) {
    await ctx.reply(t("birthDateInvalid", lang));
    return true;
  }
  const success = await updateUser(env, state.userId, {
    birthDate: parsed.iso,
  });
  await clearConversationState(env.KV, state.userId);
  if (success) {
    const becameComplete = await checkAndUpdateProfileComplete(
      env,
      state.userId,
    );
    await ctx.reply(t("birthDateUpdated", lang), {
      reply_markup: getMainMenuKeyboard(),
    });
    if (becameComplete) await promptPhoneVerification(ctx, env, lang);
  } else {
    await ctx.reply(t("genericError", lang), {
      reply_markup: getMainMenuKeyboard(),
    });
  }
  return true;
}

async function handleNameConversation(
  ctx: MyContext,
  env: Env,
  state: ConversationState,
  text: string,
  lang: Language,
): Promise<boolean> {
  const name = text.trim();
  if (name.length < 1 || name.length > 50) {
    await ctx.reply(t("nameInvalid", lang));
    return true;
  }
  const success = await updateUser(env, state.userId, { displayName: name });
  await clearConversationState(env.KV, state.userId);
  if (success) {
    const becameComplete = await checkAndUpdateProfileComplete(
      env,
      state.userId,
    );
    await ctx.reply(t("nameUpdated", lang, { name }), {
      reply_markup: getMainMenuKeyboard(),
    });
    if (becameComplete) await promptPhoneVerification(ctx, env, lang);
  } else {
    await ctx.reply(t("genericError", lang), {
      reply_markup: getMainMenuKeyboard(),
    });
  }
  return true;
}

async function handleGenderConversation(
  ctx: MyContext,
  env: Env,
  state: ConversationState,
  text: string,
  lang: Language,
): Promise<boolean> {
  const genderMap: Record<string, string> = { Male: "male", Female: "female" };
  const gender = genderMap[text];
  if (!gender) {
    await ctx.reply(t("genderInvalid", lang));
    return true;
  }
  const success = await updateUser(env, state.userId, { gender });
  await clearConversationState(env.KV, state.userId);
  if (success) {
    const becameComplete = await checkAndUpdateProfileComplete(
      env,
      state.userId,
    );
    await ctx.reply(t("genderUpdated", lang), {
      reply_markup: getMainMenuKeyboard(),
    });
    if (becameComplete) await promptPhoneVerification(ctx, env, lang);
  } else {
    await ctx.reply(t("genericError", lang), {
      reply_markup: getMainMenuKeyboard(),
    });
  }
  return true;
}

async function handleInterestsConversation(
  ctx: MyContext,
  env: Env,
  state: ConversationState,
  text: string,
  lang: Language,
): Promise<boolean> {
  const interests = text
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (interests.length === 0) {
    await ctx.reply(t("interestsInvalid", lang));
    return true;
  }
  if (interests.length > 10) {
    await ctx.reply(t("interestsInvalid", lang));
    return true;
  }
  const success = await updateUser(env, state.userId, { interests });
  await clearConversationState(env.KV, state.userId);
  if (success) {
    const becameComplete = await checkAndUpdateProfileComplete(
      env,
      state.userId,
    );
    await ctx.reply(
      t("interestsUpdated", lang, { interests: interests.join(", ") }),
      { reply_markup: getMainMenuKeyboard() },
    );
    if (becameComplete) await promptPhoneVerification(ctx, env, lang);
  } else {
    await ctx.reply(t("genericError", lang), {
      reply_markup: getMainMenuKeyboard(),
    });
  }
  return true;
}

// Location: text-based (manual city/country)
async function handleLocationTextConversation(
  ctx: MyContext,
  env: Env,
  state: ConversationState,
  text: string,
  lang: Language,
): Promise<boolean> {
  const parts = text.split(",").map((s) => s.trim());
  if (parts.length < 2) {
    await ctx.reply(t("locationTypePrompt", lang));
    return true;
  }
  const [city, country] = parts;

  // Verify location via geocoding (with retry)
  let geo = await verifyLocation(city, country);
  if (!geo) {
    await new Promise((r) => setTimeout(r, 1500));
    geo = await verifyLocation(city, country);
  }

  if (!geo) {
    // Geocoding failed twice — accept what user typed, store without lat/lon
    // Distance matching will skip distance filter for this user until geocoded
    const success = await updateUser(env, state.userId, {
      location: { city, country },
    });
    await clearConversationState(env.KV, state.userId);
    if (success) {
      const becameComplete = await checkAndUpdateProfileComplete(
        env,
        state.userId,
      );
      await ctx.reply(
        `📍 *${escapeMd(city)}, ${escapeMd(country)}* saved!\n\n` +
          `We could not verify the exact coordinates right now, but your city is recorded. ` +
          `Distance matching will work once we verify it.`,
        { parse_mode: "Markdown", reply_markup: getMainMenuKeyboard() },
      );
      if (becameComplete) await promptPhoneVerification(ctx, env, lang);
    } else {
      await ctx.reply(t("genericError", lang), {
        reply_markup: getMainMenuKeyboard(),
      });
    }
    return true;
  }

  // Use normalized location from geocoding
  const normalizedCity =
    geo.address?.city ?? geo.address?.town ?? geo.address?.village ?? city;
  const normalizedCountry = geo.address?.country ?? country;
  const lat = parseFloat(geo.lat);
  const lon = parseFloat(geo.lon);

  const success = await updateUser(env, state.userId, {
    location: {
      city: normalizedCity,
      country: normalizedCountry,
      latitude: lat,
      longitude: lon,
    },
  });
  await clearConversationState(env.KV, state.userId);
  if (success) {
    const becameComplete = await checkAndUpdateProfileComplete(
      env,
      state.userId,
    );
    await ctx.reply(
      `📍 Location verified: *${escapeMd(normalizedCity)}, ${escapeMd(normalizedCountry)}*`,
      { parse_mode: "Markdown", reply_markup: getMainMenuKeyboard() },
    );
    if (becameComplete) await promptPhoneVerification(ctx, env, lang);
  } else {
    await ctx.reply(t("genericError", lang), {
      reply_markup: getMainMenuKeyboard(),
    });
  }
  return true;
}

async function handleAgeRangeConversation(
  ctx: MyContext,
  env: Env,
  state: ConversationState,
  text: string,
  lang: Language,
): Promise<boolean> {
  const step = state.step ?? 0;

  // Try parsing as a full range first (e.g. "18-25")
  const rangeMatch = text.trim().match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (rangeMatch) {
    const min = parseInt(rangeMatch[1], 10);
    const max = parseInt(rangeMatch[2], 10);
    if (min < 12 || max > 80 || min > max) {
      await ctx.reply(t("ageRangeInvalid", lang));
      return true;
    }
    const success = await updateUser(env, state.userId, {
      preferences: { minAge: min, maxAge: max },
    });
    await clearConversationState(env.KV, state.userId);
    if (success) {
      await ctx.reply(
        t("ageRangeUpdated", lang, { min: String(min), max: String(max) }),
        { reply_markup: getMainMenuKeyboard() },
      );
    } else {
      await ctx.reply(t("genericError", lang), {
        reply_markup: getMainMenuKeyboard(),
      });
    }
    return true;
  }

  // Single number input
  const singleMatch = text.trim().match(/^(\d+)$/);
  if (!singleMatch) {
    await ctx.reply(t("ageRangeInvalid", lang));
    return true;
  }
  const val = parseInt(singleMatch[1], 10);
  if (val < 12 || val > 80) {
    await ctx.reply(t("ageRangeInvalid", lang));
    return true;
  }

  if (step === 0) {
    // Min selected via text → move to max selection
    await setConversationState(env.KV, {
      userId: state.userId,
      field: "age-range",
      step: 1,
      data: { min: val },
    });
    await ctx.reply(t("ageRangeSelectMax", lang, { min: String(val) }), {
      reply_markup: getMainMenuKeyboard(),
    });
    return true;
  }

  // Step 1: max selected
  const min = (state.data?.min as number) ?? 12;
  if (val < min) {
    await ctx.reply(t("ageRangeInvalid", lang));
    return true;
  }
  const success = await updateUser(env, state.userId, {
    preferences: { minAge: min, maxAge: val },
  });
  await clearConversationState(env.KV, state.userId);
  if (success) {
    await ctx.reply(
      t("ageRangeUpdated", lang, { min: String(min), max: String(val) }),
      { reply_markup: getMainMenuKeyboard() },
    );
  } else {
    await ctx.reply(t("genericError", lang), {
      reply_markup: getMainMenuKeyboard(),
    });
  }
  return true;
}

async function handleDistanceConversation(
  ctx: MyContext,
  env: Env,
  state: ConversationState,
  text: string,
  lang: Language,
): Promise<boolean> {
  if (!/^\d+$/.test(text.trim())) {
    await ctx.reply(t("distanceInvalid", lang));
    return true;
  }
  const distance = parseInt(text, 10);
  if (Number.isNaN(distance) || distance < 1 || distance > 500) {
    await ctx.reply(t("distanceInvalid", lang));
    return true;
  }
  const success = await updateUser(env, state.userId, {
    preferences: { maxDistance: distance },
  });
  await clearConversationState(env.KV, state.userId);
  if (success) {
    await ctx.reply(
      t("distanceUpdated", lang, { distance: String(distance) }),
      { reply_markup: getMainMenuKeyboard() },
    );
  } else {
    await ctx.reply(t("genericError", lang), {
      reply_markup: getMainMenuKeyboard(),
    });
  }
  return true;
}

async function handleGenderPrefConversation(
  ctx: MyContext,
  env: Env,
  state: ConversationState,
  text: string,
  lang: Language,
): Promise<boolean> {
  const normalized = text
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const valid = normalized.every((g) =>
    ["male", "female", "other", "prefer_not_to_say"].includes(g),
  );
  if (!valid || normalized.length === 0) {
    await ctx.reply(t("genderPrefInvalid", lang));
    return true;
  }
  const success = await updateUser(env, state.userId, {
    preferences: { genderPreference: normalized },
  });
  await clearConversationState(env.KV, state.userId);
  if (success) {
    await ctx.reply(
      t("genderPrefUpdated", lang, { preferences: normalized.join(", ") }),
      { reply_markup: getMainMenuKeyboard() },
    );
  } else {
    await ctx.reply(t("genericError", lang), {
      reply_markup: getMainMenuKeyboard(),
    });
  }
  return true;
}
