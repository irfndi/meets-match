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
  await ctx.reply('What name should other users see?', {
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

const PREDEFINED_INTERESTS = [
  '🎵 Music',
  '🎬 Movies',
  '📚 Books',
  '☕ Coffee',
  '🍳 Cooking',
  '✈️ Travel',
  '🏋️ Fitness',
  '🎮 Gaming',
  '📸 Photography',
  '🐾 Pets',
  '🌿 Nature',
  '💻 Tech',
  '🎨 Art',
  '⚽ Sports',
  '🧘 Yoga',
  '💃 Dancing',
];

function buildInterestsKeyboard(selected: Set<string>): Keyboard {
  const kb = new Keyboard();

  for (let i = 0; i < PREDEFINED_INTERESTS.length; i++) {
    const interest = PREDEFINED_INTERESTS[i];
    const label = selected.has(interest) ? `✅ ${interest}` : interest;
    kb.text(label);
    if ((i + 1) % 3 === 0) kb.row();
  }
  kb.row();
  kb.text('➕ Add Custom').row();
  kb.text(selected.size > 0 ? '✔️ Done' : '❌ Done');
  kb.text('Cancel').resized();

  return kb;
}

function interestLabelToValue(label: string): string {
  return label.replace(/^(✅|➕|✔️|❌)\s*/, '').toLowerCase();
}

export async function editInterests(
  conversation: Conversation<MyContext, MyContext>,
  ctx: MyContext,
) {
  const selected = new Set<string>();

  await ctx.reply('Choose your interests (at least 1):', {
    reply_markup: buildInterestsKeyboard(selected).oneTime(),
  });

  let iterations = 0;
  while (iterations < 50) {
    iterations++;
    const { message } = await conversation.wait();

    if (!message?.text) continue;

    const text = message.text;

    if (text === 'Cancel') {
      await ctx.reply('Cancelled.', { reply_markup: { remove_keyboard: true } });
      return;
    }

    if (text === '❌ Done') {
      await ctx.reply('Please select at least one interest.');
      await ctx.reply('Choose your interests:', {
        reply_markup: buildInterestsKeyboard(selected).oneTime(),
      });
      continue;
    }

    if (text === '✔️ Done') {
      break;
    }

    if (text === '➕ Add Custom') {
      await ctx.reply('Type your custom interest (one word/tag):', {
        reply_markup: new Keyboard().text('Back').resized().oneTime(),
      });
      const customResp = await conversation.wait();
      if (customResp.message?.text && customResp.message.text !== 'Back') {
        const custom = customResp.message.text.trim().toLowerCase().slice(0, 30);
        if (custom.length > 0 && ![...selected].some((s) => interestLabelToValue(s) === custom)) {
          selected.add(custom);
        }
      }
      await ctx.reply(`Selected: ${[...selected].map(interestLabelToValue).join(', ')}`, {
        reply_markup: buildInterestsKeyboard(selected).oneTime(),
      });
      continue;
    }

    const value = interestLabelToValue(text);
    const existing = [...selected].find((s) => interestLabelToValue(s) === value);
    if (existing) {
      selected.delete(existing);
    } else {
      selected.add(text);
    }

    await ctx.reply(`Selected: ${[...selected].map(interestLabelToValue).join(', ')}`, {
      reply_markup: buildInterestsKeyboard(selected).oneTime(),
    });
  }

  const interests = [...selected].map(interestLabelToValue);

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
  await ctx.reply('📍 Share your location so we can find matches near you:', {
    reply_markup: new Keyboard()
      .requestLocation('📍 Share Location')
      .row()
      .text('Cancel')
      .resized()
      .oneTime(),
  });

  const response = await conversation.wait();

  if (response.message?.text === 'Cancel') {
    await ctx.reply('Cancelled.', { reply_markup: { remove_keyboard: true } });
    return;
  }

  if (!response.message?.location) {
    await ctx.reply('Please share your location using the button.', {
      reply_markup: { remove_keyboard: true },
    });
    return;
  }

  const userId = String(ctx.from?.id);

  const result = await conversation.external(() =>
    Effect.runPromise(
      Effect.either(
        userService.updateUser(userId, {
          location: {
            latitude: response.message?.location?.latitude,
            longitude: response.message?.location?.longitude,
          },
        }),
      ),
    ),
  );

  if (result._tag === 'Left') {
    await ctx.reply('Failed to update location. Please try again later.', {
      reply_markup: { remove_keyboard: true },
    });
    console.error(result.left);
    return;
  }

  await ctx.reply('✅ Location updated!', { reply_markup: { remove_keyboard: true } });
}
