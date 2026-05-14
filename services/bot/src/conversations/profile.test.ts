import { Effect, Either } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock userService before importing
vi.mock('../services/userService.js', () => ({
  userService: {
    updateUser: vi.fn(),
  },
}));

import { userService } from '../services/userService.js';
import { editAge, editBio, editGender, editInterests, editLocation, editName } from './profile.js';

describe('Profile Conversations', () => {
  let mockConversation: any;
  let mockCtx: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCtx = {
      from: { id: 123456 },
      reply: vi.fn().mockResolvedValue({}),
    };
  });

  describe('editBio', () => {
    it('should update bio successfully', async () => {
      mockConversation = {
        wait: vi.fn().mockResolvedValue({ message: { text: 'My new bio' } }),
        external: vi.fn().mockImplementation((fn) => fn()),
      };
      vi.mocked(userService.updateUser).mockReturnValue(Effect.succeed({ user: {} }) as any);
      mockConversation.external.mockResolvedValue(Either.right({ user: {} }));
      await editBio(mockConversation, mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Bio updated'),
        expect.any(Object),
      );
    });

    it('should reject bio exceeding 300 characters', async () => {
      const longBio = 'a'.repeat(301);
      mockConversation = { wait: vi.fn().mockResolvedValue({ message: { text: longBio } }) };
      await editBio(mockConversation, mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Bio is too long'),
        expect.any(Object),
      );
    });

    it('should handle cancel', async () => {
      mockConversation = { wait: vi.fn().mockResolvedValue({ message: { text: 'Cancel' } }) };
      await editBio(mockConversation, mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith('Cancelled.', expect.any(Object));
    });

    it('should handle empty message', async () => {
      mockConversation = { wait: vi.fn().mockResolvedValue({ message: null }) };
      await editBio(mockConversation, mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith('Cancelled.', expect.any(Object));
    });

    it('should handle API failure', async () => {
      mockConversation = {
        wait: vi.fn().mockResolvedValue({ message: { text: 'Valid bio' } }),
        external: vi.fn().mockResolvedValue(Either.left(new Error('err'))),
      };
      await editBio(mockConversation, mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Failed'),
        expect.any(Object),
      );
    });
  });

  describe('editAge', () => {
    it('should accept valid age', async () => {
      mockConversation = {
        wait: vi.fn().mockResolvedValue({ message: { text: '25' } }),
        external: vi.fn().mockImplementation((fn) => fn()),
      };
      vi.mocked(userService.updateUser).mockReturnValue(Effect.succeed({ user: {} }) as any);
      await editAge(mockConversation, mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Age updated'),
        expect.any(Object),
      );
    });

    it('should reject age below 18', async () => {
      mockConversation = { wait: vi.fn().mockResolvedValue({ message: { text: '17' } }) };
      await editAge(mockConversation, mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Invalid age'),
        expect.any(Object),
      );
    });

    it('should reject age above 65', async () => {
      mockConversation = { wait: vi.fn().mockResolvedValue({ message: { text: '66' } }) };
      await editAge(mockConversation, mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Invalid age'),
        expect.any(Object),
      );
    });

    it('should reject non-numeric input', async () => {
      mockConversation = { wait: vi.fn().mockResolvedValue({ message: { text: 'abc' } }) };
      await editAge(mockConversation, mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Invalid age'),
        expect.any(Object),
      );
    });

    it('should accept valid age at lower bound', async () => {
      mockConversation = {
        wait: vi.fn().mockResolvedValue({ message: { text: '18' } }),
        external: vi.fn().mockImplementation((fn) => fn()),
      };
      vi.mocked(userService.updateUser).mockReturnValue(Effect.succeed({ user: {} }) as any);
      await editAge(mockConversation, mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Age updated to 18'),
        expect.any(Object),
      );
    });

    it('should accept valid age at upper bound', async () => {
      mockConversation = {
        wait: vi.fn().mockResolvedValue({ message: { text: '65' } }),
        external: vi.fn().mockImplementation((fn) => fn()),
      };
      vi.mocked(userService.updateUser).mockReturnValue(Effect.succeed({ user: {} }) as any);
      await editAge(mockConversation, mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Age updated to 65'),
        expect.any(Object),
      );
    });

    it('should handle cancel', async () => {
      mockConversation = { wait: vi.fn().mockResolvedValue({ message: { text: 'Cancel' } }) };
      await editAge(mockConversation, mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith('Cancelled.', expect.any(Object));
    });
  });

  describe('editName', () => {
    it('should update name successfully', async () => {
      mockConversation = {
        wait: vi.fn().mockResolvedValue({ message: { text: 'John' } }),
        external: vi.fn().mockImplementation((fn) => fn()),
      };
      vi.mocked(userService.updateUser).mockReturnValue(Effect.succeed({ user: {} }) as any);
      await editName(mockConversation, mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Name updated to'),
        expect.any(Object),
      );
    });

    it('should cancel on empty name', async () => {
      mockConversation = { wait: vi.fn().mockResolvedValue({ message: { text: '' } }) };
      await editName(mockConversation, mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith('Cancelled.', expect.any(Object));
    });

    it('should reject name longer than 50 characters', async () => {
      mockConversation = { wait: vi.fn().mockResolvedValue({ message: { text: 'a'.repeat(51) } }) };
      await editName(mockConversation, mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Name must be 1-50 characters'),
        expect.any(Object),
      );
    });

    it('should accept name at exactly 50 characters', async () => {
      mockConversation = {
        wait: vi.fn().mockResolvedValue({ message: { text: 'a'.repeat(50) } }),
        external: vi.fn().mockImplementation((fn) => fn()),
      };
      vi.mocked(userService.updateUser).mockReturnValue(Effect.succeed({ user: {} }) as any);
      await editName(mockConversation, mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Name updated to'),
        expect.any(Object),
      );
    });
  });

  describe('editGender', () => {
    it('should update gender to Male', async () => {
      mockConversation = {
        wait: vi.fn().mockResolvedValue({ message: { text: 'Male' } }),
        external: vi.fn().mockImplementation((fn) => fn()),
      };
      vi.mocked(userService.updateUser).mockReturnValue(Effect.succeed({ user: {} }) as any);
      await editGender(mockConversation, mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Gender updated to Male'),
        expect.any(Object),
      );
    });

    it('should update gender to Female', async () => {
      mockConversation = {
        wait: vi.fn().mockResolvedValue({ message: { text: 'Female' } }),
        external: vi.fn().mockImplementation((fn) => fn()),
      };
      vi.mocked(userService.updateUser).mockReturnValue(Effect.succeed({ user: {} }) as any);
      await editGender(mockConversation, mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Gender updated to Female'),
        expect.any(Object),
      );
    });

    it('should reject invalid gender selection', async () => {
      mockConversation = { wait: vi.fn().mockResolvedValue({ message: { text: 'Other' } }) };
      await editGender(mockConversation, mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Invalid selection'),
        expect.any(Object),
      );
    });

    it('should handle cancel', async () => {
      mockConversation = { wait: vi.fn().mockResolvedValue({ message: { text: 'Cancel' } }) };
      await editGender(mockConversation, mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith('Cancelled.', expect.any(Object));
    });
  });

  describe('editInterests', () => {
    it('should handle cancel immediately', async () => {
      mockConversation = { wait: vi.fn().mockResolvedValue({ message: { text: 'Cancel' } }) };
      await editInterests(mockConversation, mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith('Cancelled.', expect.any(Object));
    });

    it('should reject Done with no interests selected', async () => {
      const replies = [{ message: { text: '❌ Done' } }, { message: { text: 'Cancel' } }];
      mockConversation = {
        wait: vi.fn().mockImplementation(() => replies.shift() || { message: { text: 'Cancel' } }),
      };
      await editInterests(mockConversation, mockCtx);
      const hasPleaseSelect = mockCtx.reply.mock.calls.some(
        (call: any[]) =>
          typeof call[0] === 'string' && call[0].includes('Please select at least one interest'),
      );
      expect(hasPleaseSelect).toBe(true);
    });

    it('should update interests when selecting and confirming', async () => {
      const replies = [{ message: { text: '🎵 Music' } }, { message: { text: '✔️ Done' } }];
      mockConversation = {
        wait: vi.fn().mockImplementation(() => replies.shift() || { message: { text: 'Cancel' } }),
        external: vi.fn().mockImplementation((fn) => fn()),
      };
      vi.mocked(userService.updateUser).mockReturnValue(Effect.succeed({ user: {} }) as any);
      await editInterests(mockConversation, mockCtx);
      const hasInterestsUpdated = mockCtx.reply.mock.calls.some(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('Interests updated'),
      );
      expect(hasInterestsUpdated).toBe(true);
    });
  });

  describe('editLocation', () => {
    it('should update location with GPS', async () => {
      mockConversation = {
        wait: vi.fn().mockResolvedValue({
          message: { location: { latitude: 37.5665, longitude: 126.978 } },
        }),
        external: vi.fn().mockImplementation((fn) => fn()),
      };
      vi.mocked(userService.updateUser).mockReturnValue(Effect.succeed({ user: {} }) as any);
      await editLocation(mockConversation, mockCtx);
      const hasLocationUpdated = mockCtx.reply.mock.calls.some(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('Location updated'),
      );
      expect(hasLocationUpdated).toBe(true);
    });

    it('should reject text input', async () => {
      mockConversation = { wait: vi.fn().mockResolvedValue({ message: { text: 'Seoul' } }) };
      await editLocation(mockConversation, mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Please share your location'),
        expect.any(Object),
      );
    });

    it('should handle cancel', async () => {
      mockConversation = { wait: vi.fn().mockResolvedValue({ message: { text: 'Cancel' } }) };
      await editLocation(mockConversation, mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith('Cancelled.', expect.any(Object));
    });

    it('should handle API failure', async () => {
      mockConversation = {
        wait: vi.fn().mockResolvedValue({
          message: { location: { latitude: 37.5, longitude: 127.0 } },
        }),
        external: vi.fn().mockResolvedValue(Either.left(new Error('err'))),
      };
      await editLocation(mockConversation, mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Failed'),
        expect.any(Object),
      );
    });
  });
});
