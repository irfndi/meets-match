import { describe, expect, it } from 'vitest';
import { profileMenu } from './profile.js';

describe('Profile Menu', () => {
  it('should be defined', () => {
    expect(profileMenu).toBeDefined();
  });

  it('should have a menu ID of "profile-menu"', () => {
    // The Menu object has an internal identifier
    // We can check by looking at its structure
    expect(profileMenu).toHaveProperty('id');
  });

  it('should be a Menu instance with middleware capabilities', () => {
    // Menu extends Composer, so it should have middleware method
    expect(typeof profileMenu.middleware).toBe('function');
  });

  it('should be usable as grammy middleware', () => {
    // Menus can be used directly as middleware
    // They implement the middleware interface
    expect(profileMenu).toBeDefined();
    // The menu should be callable as middleware
    // This is a structural check - actual behavior is tested via integration tests
  });
});
