import { Keyboard } from "grammy";

export const MENU_FIND_MATCH = "🔍 Find Match";
export const MENU_MY_MATCHES = "💕 My Matches";
export const MENU_PROFILE = "👤 Profile";
export const MENU_SETTINGS = "⚙️ Settings";
export const MENU_PREMIUM = "👑 Premium";
export const MENU_REFERRAL = "🎁 Referral";

/**
 * Persistent reply keyboard shown to users for easy navigation.
 * Buttons send command text which is handled by existing command handlers.
 */
export function getMainMenuKeyboard(): Keyboard {
  return new Keyboard()
    .text(MENU_FIND_MATCH)
    .text(MENU_MY_MATCHES)
    .row()
    .text(MENU_PROFILE)
    .text(MENU_SETTINGS)
    .row()
    .text(MENU_PREMIUM)
    .text(MENU_REFERRAL)
    .persistent()
    .resized();
}
