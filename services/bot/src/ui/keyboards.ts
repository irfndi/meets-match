import { Keyboard } from 'grammy';

export const mainMenuKeyboard = () =>
  new Keyboard()
    .text('🚀 Start Match')
    .text('👤 View Profile')
    .row()
    .text('💤 Sleep / Pause')
    .text('📨 Invite Friend')
    .row()
    .text('⚙️ Settings')
    .resized();
