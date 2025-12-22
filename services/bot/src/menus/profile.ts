import { Menu } from '@grammyjs/menu';
import type { MyContext } from '../types.js';

export const profileMenu = new Menu<MyContext>('profile-menu')
  .text('📝 Bio', async (ctx) => {
    await ctx.conversation.enter('editBio');
  })
  .text('🎂 Age', async (ctx) => {
    await ctx.conversation.enter('editAge');
  })
  .row()
  .text('👤 Name', async (ctx) => {
    await ctx.conversation.enter('editName');
  })
  .text('⚧ Gender', async (ctx) => {
    await ctx.conversation.enter('editGender');
  })
  .row()
  .text('🌟 Interests', async (ctx) => {
    await ctx.conversation.enter('editInterests');
  })
  .text('📍 Location', async (ctx) => {
    await ctx.conversation.enter('editLocation');
  })
  .row()
  .text('❌ Close', (ctx) => ctx.deleteMessage());
