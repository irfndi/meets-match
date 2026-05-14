import { Keyboard } from "grammy";

/**
 * Persistent reply keyboard shown to users for easy navigation.
 * Buttons send command text which is handled by existing command handlers.
 */
export function getMainMenuKeyboard(): Keyboard {
  return new Keyboard()
    .text("🔍 Find Match")
    .text("💕 My Matches")
    .row()
    .text("👤 Profile")
    .text("⚙️ Settings")
    .resized();
}
