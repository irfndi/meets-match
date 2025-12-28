import type { Conversation } from '@grammyjs/conversations';
import { Effect } from 'effect';
import { Keyboard } from 'grammy';
import { userService } from '../services/userService.js';
import type { MyContext } from '../types.js';

// === BIO CONVERSATION ===
export async function editBio(conversation: Conversation<MyContext, MyContext>, ctx: MyContext) {
  await ctx.reply('Please enter your new bio (max 300 characters):', {
    reply_markup: new Keyboard().text('Cancel').resized().oneTime(),
  });
  const { message } = await conversation.wait();

  if (!message?.text || message.text === 'Cancel') {
    await ctx.reply('Cancelled.', { reply_markup: { remove_keyboard: true } });
    return;
  }

  if (message.text.length > 300) {
    await ctx.reply('Bio is too long (max 300 characters). Cancelled.', {
      reply_markup: { remove_keyboard: true },
    });
    return;
  }

  const newBio = message.text;
  const userId = String(ctx.from?.id);

  const result = await conversation.external(() =>
    Effect.runPromise(Effect.either(userService.updateUser(userId, { bio: newBio }))),
  );

  if (result._tag === 'Left') {
    await ctx.reply('Failed to update bio. Please try again later.', {
      reply_markup: { remove_keyboard: true },
    });
    console.error(result.left);
    return;
  }

  await ctx.reply(`✅ Bio updated!`, { reply_markup: { remove_keyboard: true } });
}

// === AGE CONVERSATION ===
export async function editAge(conversation: Conversation<MyContext, MyContext>, ctx: MyContext) {
  await ctx.reply('Please enter your age (18-65):', {
    reply_markup: new Keyboard().text('Cancel').resized().oneTime(),
  });
  const { message } = await conversation.wait();

  if (!message?.text || message.text === 'Cancel') {
    await ctx.reply('Cancelled.', { reply_markup: { remove_keyboard: true } });
    return;
  }

  const ageInfo = parseInt(message.text, 10);

  if (Number.isNaN(ageInfo) || ageInfo < 18 || ageInfo > 65) {
    await ctx.reply('Invalid age. Must be between 18 and 65. Cancelled.', {
      reply_markup: { remove_keyboard: true },
    });
    return;
  }

  const userId = String(ctx.from?.id);

  const result = await conversation.external(() =>
    Effect.runPromise(Effect.either(userService.updateUser(userId, { age: ageInfo }))),
  );

  if (result._tag === 'Left') {
    await ctx.reply('Failed to update age. Please try again later.', {
      reply_markup: { remove_keyboard: true },
    });
    console.error(result.left);
    return;
  }

  await ctx.reply(`✅ Age updated to ${ageInfo}!`, { reply_markup: { remove_keyboard: true } });
}

// === NAME CONVERSATION ===
export async function editName(conversation: Conversation<MyContext, MyContext>, ctx: MyContext) {
  await ctx.reply('Please enter your first name:', {
    reply_markup: new Keyboard().text('Cancel').resized().oneTime(),
  });
  const { message } = await conversation.wait();

  if (!message?.text || message.text === 'Cancel') {
    await ctx.reply('Cancelled.', { reply_markup: { remove_keyboard: true } });
    return;
  }

  const name = message.text.trim();
  if (name.length < 1 || name.length > 50) {
    await ctx.reply('Name must be 1-50 characters. Cancelled.', {
      reply_markup: { remove_keyboard: true },
    });
    return;
  }

  const userId = String(ctx.from?.id);

  const result = await conversation.external(() =>
    Effect.runPromise(Effect.either(userService.updateUser(userId, { firstName: name }))),
  );

  if (result._tag === 'Left') {
    await ctx.reply('Failed to update name. Please try again later.', {
      reply_markup: { remove_keyboard: true },
    });
    console.error(result.left);
    return;
  }

  await ctx.reply(`✅ Name updated to ${name}!`, { reply_markup: { remove_keyboard: true } });
}

// === GENDER CONVERSATION ===
export async function editGender(conversation: Conversation<MyContext, MyContext>, ctx: MyContext) {
  await ctx.reply('Select your gender:', {
    reply_markup: new Keyboard()
      .text('Male')
      .text('Female')
      .row()
      .text('Cancel')
      .resized()
      .oneTime(),
  });

  const { message } = await conversation.wait();

  if (!message?.text || message.text === 'Cancel') {
    await ctx.reply('Cancelled.', { reply_markup: { remove_keyboard: true } });
    return;
  }

  const genderMap: Record<string, string> = {
    Male: 'male',
    Female: 'female',
  };

  const gender = genderMap[message.text];
  if (!gender) {
    await ctx.reply('Invalid selection. Cancelled.', {
      reply_markup: { remove_keyboard: true },
    });
    return;
  }

  const userId = String(ctx.from?.id);

  const result = await conversation.external(() =>
    Effect.runPromise(Effect.either(userService.updateUser(userId, { gender }))),
  );

  if (result._tag === 'Left') {
    await ctx.reply('Failed to update gender. Please try again later.', {
      reply_markup: { remove_keyboard: true },
    });
    console.error(result.left);
    return;
  }

  await ctx.reply(`✅ Gender updated to ${message.text}!`, {
    reply_markup: { remove_keyboard: true },
  });
}

// === INTERESTS CONVERSATION ===
export async function editInterests(
  conversation: Conversation<MyContext, MyContext>,
  ctx: MyContext,
) {
  await ctx.reply(
    'Enter your interests, separated by commas (max 10):\n\nExample: coding, coffee, travel, music',
    {
      reply_markup: new Keyboard().text('Cancel').resized().oneTime(),
    },
  );

  const { message } = await conversation.wait();

  if (!message?.text || message.text === 'Cancel') {
    await ctx.reply('Cancelled.', { reply_markup: { remove_keyboard: true } });
    return;
  }

  const interests = message.text
    .split(',')
    .map((i) => i.trim().toLowerCase())
    .filter((i) => i.length > 0)
    .slice(0, 10);

  if (interests.length === 0) {
    await ctx.reply('Please provide at least one interest. Cancelled.', {
      reply_markup: { remove_keyboard: true },
    });
    return;
  }

  const userId = String(ctx.from?.id);

  const result = await conversation.external(() =>
    Effect.runPromise(Effect.either(userService.updateUser(userId, { interests }))),
  );

  if (result._tag === 'Left') {
    await ctx.reply('Failed to update interests. Please try again later.', {
      reply_markup: { remove_keyboard: true },
    });
    console.error(result.left);
    return;
  }

  await ctx.reply(`✅ Interests updated: ${interests.join(', ')}`, {
    reply_markup: { remove_keyboard: true },
  });
}

// === LOCATION CONVERSATION ===
export async function editLocation(
  conversation: Conversation<MyContext, MyContext>,
  ctx: MyContext,
) {
  await ctx.reply(
    "Please share your location or enter your city manually (e.g., 'Seoul, South Korea'):",
    {
      reply_markup: new Keyboard()
        .requestLocation('📍 Share Location')
        .row()
        .text('Cancel')
        .resized()
        .oneTime(),
    },
  );

  const response = await conversation.wait();

  if (response.message?.text === 'Cancel') {
    await ctx.reply('Cancelled.', { reply_markup: { remove_keyboard: true } });
    return;
  }

  const userId = String(ctx.from?.id);
  let locationData: { latitude?: number; longitude?: number; city?: string; country?: string } = {};

  if (response.message?.location) {
    // User shared GPS location
    locationData = {
      latitude: response.message.location.latitude,
      longitude: response.message.location.longitude,
    };
    // TODO: Reverse geocode to get city/country from API
  } else if (response.message?.text) {
    // User entered text location
    const parts = response.message.text.split(',').map((p) => p.trim());
    if (parts.length >= 2) {
      locationData = {
        city: parts[0],
        country: parts[1],
      };
      // TODO: Geocode to get coordinates from API
    } else {
      await ctx.reply('Please use format: City, Country. Cancelled.', {
        reply_markup: { remove_keyboard: true },
      });
      return;
    }
  } else {
    await ctx.reply('Invalid input. Cancelled.', {
      reply_markup: { remove_keyboard: true },
    });
    return;
  }

  const result = await conversation.external(() =>
    Effect.runPromise(Effect.either(userService.updateUser(userId, { location: locationData }))),
  );

  if (result._tag === 'Left') {
    await ctx.reply('Failed to update location. Please try again later.', {
      reply_markup: { remove_keyboard: true },
    });
    console.error(result.left);
    return;
  }

  const locationText = locationData.city
    ? `${locationData.city}, ${locationData.country}`
    : `📍 ${locationData.latitude?.toFixed(4)}, ${locationData.longitude?.toFixed(4)}`;

  await ctx.reply(`✅ Location updated to ${locationText}!`, {
    reply_markup: { remove_keyboard: true },
  });
}
