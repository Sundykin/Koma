import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmQuery = vi.fn();
const testLLMConnection = vi.fn();

vi.mock('../../chat/ipc/chatIPC', () => ({
  llmQuery,
  testLLMConnection,
  isLLMIPCAvailable: () => true,
}));

describe('IPCLLMProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generateText 会把 profileId 一起带到 llmQuery', async () => {
    llmQuery.mockResolvedValue({ content: 'ok' });
    const { IPCLLMProvider } = await import('./IPCLLMProvider');
    const provider = new IPCLLMProvider({
      provider: 'claude',
      profileId: 'channel-1',
      modelName: 'claude-sonnet',
      apiKey: '',
    } as any);

    await provider.generateText('hello');

    expect(llmQuery).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({
        profileId: 'channel-1',
      }),
    }));
  });
});
