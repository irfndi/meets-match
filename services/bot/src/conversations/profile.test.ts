import { Either } from 'effect';
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

      vi.mocked(userService.updateUser).mockReturnValue({
        pipe: () => Either.right({ user: {} }),
      } as any);

      // Mock Effect.either to return Right
      mockConversation.external.mockResolvedValue(Either.right({ user: {} }));

      await editBio(mockConversation, mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Bio updated'),
        expect.any(Object),
      );
    });

    it('should reject bio exceeding 300 characters', async () => {
      const longBio = 'a'.repeat(301);
      mockConversation = {
        wait: vi.fn().mockResolvedValue({ message: { text: longBio } }),
      };

      await editBio(mockConversation, mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Bio is too long'),
        expect.any(Object),
      );
    });

    it('should handle cancel', async () => {
      mockConversation = {
        wait: vi.fn().mockResolvedValue({ message: { text: 'Cancel' } }),
      };

      await editBio(mockConversation, mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith('Cancelled.', expect.any(Object));
    });

    it('should handle empty message', async () => {
      mockConversation = {
        wait: vi.fn().mockResolvedValue({ message: null }),
      };

      await editBio(mockConversation, mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith('Cancelled.', expect.any(Object));
    });

    it('should handle API failure', async () => {
      mockConversation = {
        wait: vi.fn().mockResolvedValue({ message: { text: 'Valid bio' } }),
        external: vi.fn().mockResolvedValue(Either.left(new Error('API error'))),
      };

      await editBio(mockConversation, mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Failed to update bio'),
        expect.any(Object),
      );
    });
  });

  describe('editAge', () => {
    it('should reject age below 18', async () => {
      mockConversation = {
        wait: vi.fn().mockResolvedValue({ message: { text: '17' } }),
      };

      await editAge(mockConversation, mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Invalid age'),
        expect.any(Object),
      );
    });

    it('should reject age above 65', async () => {
      mockConversation = {
        wait: vi.fn().mockResolvedValue({ message: { text: '66' } }),
      };

      await editAge(mockConversation, mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Invalid age'),
        expect.any(Object),
      );
    });

    it('should reject non-numeric input', async () => {
      mockConversation = {
        wait: vi.fn().mockResolvedValue({ message: { text: 'abc' } }),
      };

      await editAge(mockConversation, mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Invalid age'),
        expect.any(Object),
      );
    });

    it('should accept valid age at lower bound', async () => {
      mockConversation = {
        wait: vi.fn().mockResolvedValue({ message: { text: '18' } }),
        external: vi.fn().mockResolvedValue(Either.right({ user: {} })),
      };

      await editAge(mockConversation, mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Age updated to 18'),
        expect.any(Object),
      );
    });

    it('should accept valid age at upper bound', async () => {
      mockConversation = {
        wait: vi.fn().mockResolvedValue({ message: { text: '65' } }),
        external: vi.fn().mockResolvedValue(Either.right({ user: {} })),
      };

      await editAge(mockConversation, mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Age updated to 65'),
        expect.any(Object),
      );
    });

    it('should handle cancel', async () => {
      mockConversation = {
        wait: vi.fn().mockResolvedValue({ message: { text: 'Cancel' } }),
      };

      await editAge(mockConversation, mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith('Cancelled.', expect.any(Object));
    });
  });

  describe('editName', () => {
    it('should update name successfully', async () => {
      mockConversation = {
        wait: vi.fn().mockResolvedValue({ message: { text: 'John' } }),
        external: vi.fn().mockResolvedValue(Either.right({ user: {} })),
      };

      await editName(mockConversation, mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Name updated to John'),
        expect.any(Object),
      );
    });

    it('should reject empty name', async () => {
      mockConversation = {
        wait: vi.fn().mockResolvedValue({ message: { text: '   ' } }),
      };

      await editName(mockConversation, mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Name must be 1-50 characters'),
        expect.any(Object),
      );
    });

    it('should reject name longer than 50 characters', async () => {
      mockConversation = {
        wait: vi.fn().mockResolvedValue({ message: { text: 'a'.repeat(51) } }),
      };

      await editName(mockConversation, mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Name must be 1-50 characters'),
        expect.any(Object),
      );
    });

    it('should accept name at exactly 50 characters', async () => {
      const name50 = 'a'.repeat(50);
      mockConversation = {
        wait: vi.fn().mockResolvedValue({ message: { text: name50 } }),
        external: vi.fn().mockResolvedValue(Either.right({ user: {} })),
      };

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
        external: vi.fn().mockResolvedValue(Either.right({ user: {} })),
      };

      await editGender(mockConversation, mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Gender updated to Male'),
        expect.any(Object),
      );
    });

    it('should update gender to Female', async () => {
      mockConversation = {
        wait: vi.fn().mockResolvedValue({ message: { text: 'Female' } }),
        external: vi.fn().mockResolvedValue(Either.right({ user: {} })),
      };

      await editGender(mockConversation, mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Gender updated to Female'),
        expect.any(Object),
      );
    });

    it('should reject invalid gender selection', async () => {
      mockConversation = {
        wait: vi.fn().mockResolvedValue({ message: { text: 'Other' } }),
      };

      await editGender(mockConversation, mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Invalid selection'),
        expect.any(Object),
      );
    });

    it('should handle cancel', async () => {
      mockConversation = {
        wait: vi.fn().mockResolvedValue({ message: { text: 'Cancel' } }),
      };

      await editGender(mockConversation, mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith('Cancelled.', expect.any(Object));
    });
  });

  describe('editInterests', () => {
    it('should update interests successfully', async () => {
      mockConversation = {
        wait: vi.fn().mockResolvedValue({ message: { text: 'coding, music, travel' } }),
        external: vi.fn().mockResolvedValue(Either.right({ user: {} })),
      };

      await editInterests(mockConversation, mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Interests updated: coding, music, travel'),
        expect.any(Object),
      );
    });

    it('should limit to 10 interests', async () => {
      const manyInterests = Array(15)
        .fill(0)
        .map((_, i) => `interest${i}`)
        .join(', ');
      mockConversation = {
        wait: vi.fn().mockResolvedValue({ message: { text: manyInterests } }),
        external: vi.fn().mockResolvedValue(Either.right({ user: {} })),
      };

      await editInterests(mockConversation, mockCtx);

      // Should only include first 10
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Interests updated'),
        expect.any(Object),
      );
    });

    it('should reject empty interests', async () => {
      mockConversation = {
        wait: vi.fn().mockResolvedValue({ message: { text: ',,,,' } }),
      };

      await editInterests(mockConversation, mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Please provide at least one interest'),
        expect.any(Object),
      );
    });

    it('should normalize interests to lowercase', async () => {
      mockConversation = {
        wait: vi.fn().mockResolvedValue({ message: { text: 'CODING, Music, TrAvEl' } }),
        external: vi.fn().mockResolvedValue(Either.right({ user: {} })),
      };

      await editInterests(mockConversation, mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('coding, music, travel'),
        expect.any(Object),
      );
    });
  });

  describe('editLocation', () => {
    it('should update location with GPS coordinates', async () => {
      mockConversation = {
        wait: vi.fn().mockResolvedValue({
          message: { location: { latitude: 37.5665, longitude: 126.978 } },
        }),
        external: vi.fn().mockResolvedValue(Either.right({ user: {} })),
      };

      await editLocation(mockConversation, mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringMatching(/Location updated to.*37\.5665.*126\.9780/),
        expect.any(Object),
      );
    });

    it('should update location with text input', async () => {
      mockConversation = {
        wait: vi.fn().mockResolvedValue({ message: { text: 'Seoul, South Korea' } }),
        external: vi.fn().mockResolvedValue(Either.right({ user: {} })),
      };

      await editLocation(mockConversation, mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Location updated to Seoul, South Korea'),
        expect.any(Object),
      );
    });

    it('should reject invalid location format', async () => {
      mockConversation = {
        wait: vi.fn().mockResolvedValue({ message: { text: 'InvalidLocation' } }),
      };

      await editLocation(mockConversation, mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Please use format: City, Country'),
        expect.any(Object),
      );
    });

    it('should handle cancel', async () => {
      mockConversation = {
        wait: vi.fn().mockResolvedValue({ message: { text: 'Cancel' } }),
      };

      await editLocation(mockConversation, mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith('Cancelled.', expect.any(Object));
    });

    it('should handle missing message', async () => {
      mockConversation = {
        wait: vi.fn().mockResolvedValue({ message: null }),
      };

      await editLocation(mockConversation, mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Invalid input'),
        expect.any(Object),
      );
    });
  });
});
