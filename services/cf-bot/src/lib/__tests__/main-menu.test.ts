import { describe, it, expect } from "vitest";
import {
  getMainMenuKeyboard,
  MENU_FIND_MATCH,
  MENU_MY_MATCHES,
  MENU_PROFILE,
  MENU_SETTINGS,
  MENU_PREMIUM,
  MENU_REFERRAL,
} from "../main-menu.js";

describe("getMainMenuKeyboard", () => {
  it("returns a Keyboard instance", () => {
    const keyboard = getMainMenuKeyboard();
    expect(keyboard).toBeDefined();
  });

  it("has keyboard property containing the button rows", () => {
    const keyboard = getMainMenuKeyboard();
    const buttons = keyboard.keyboard.flat();
    const texts = buttons.map((b) => (typeof b === "string" ? b : b.text));

    expect(texts).toContain(MENU_FIND_MATCH);
    expect(texts).toContain(MENU_MY_MATCHES);
    expect(texts).toContain(MENU_PROFILE);
    expect(texts).toContain(MENU_SETTINGS);
    expect(texts).toContain(MENU_PREMIUM);
    expect(texts).toContain(MENU_REFERRAL);
  });

  it("has correct button arrangement (2-2-2 layout)", () => {
    const keyboard = getMainMenuKeyboard();
    const rows = keyboard.keyboard;

    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveLength(2);
    expect(rows[1]).toHaveLength(2);
    expect(rows[2]).toHaveLength(2);
  });

  it("has persistent and resized flags", () => {
    const keyboard = getMainMenuKeyboard();

    expect(keyboard.is_persistent).toBe(true);
    expect(keyboard.resize_keyboard).toBe(true);
  });
});

describe("Menu constants", () => {
  it("exports all menu button text constants", () => {
    expect(MENU_FIND_MATCH).toBe("🔍 Find Match");
    expect(MENU_MY_MATCHES).toBe("💕 My Matches");
    expect(MENU_PROFILE).toBe("👤 Profile");
    expect(MENU_SETTINGS).toBe("⚙️ Settings");
    expect(MENU_PREMIUM).toBe("👑 Premium");
    expect(MENU_REFERRAL).toBe("🎁 Referral");
  });
});
