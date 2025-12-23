import type { Context } from 'grammy';
import { describe, expect, it, vi } from 'vitest';
import { helpCommand } from './help.js';

describe('Help Handler', () => {
  it('should reply with help text', async () => {
    const mockContext = {
      reply: vi.fn().mockResolvedValue({}),
    } as unknown as Context;

    await helpCommand(mockContext);

    expect(mockContext.reply).toHaveBeenCalledWith(
      expect.stringContaining('MeetMatch Bot Help'),
      expect.objectContaining({
        parse_mode: 'Markdown',
      }),
    );
  });
});
