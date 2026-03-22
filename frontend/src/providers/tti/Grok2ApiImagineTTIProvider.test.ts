import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Grok2ApiImagineTTIProvider } from './Grok2ApiImagineTTIProvider';

vi.mock('../../utils/safeFetch', () => {
  return {
    safeFetch: vi.fn(),
  };
});

import { safeFetch } from '../../utils/safeFetch';

describe('Grok2ApiImagineTTIProvider', () => {
  beforeEach(() => {
    (safeFetch as any).mockReset();
  });

  it('uses /v1/images/generations when no references exist', async () => {
    (safeFetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ url: 'https://cdn.example.com/a.jpg' }] }),
    });

    const p = new Grok2ApiImagineTTIProvider({
      id: 'c1',
      name: 'grok2',
      provider: 'grok2api-imagine-tti' as any,
      baseUrl: 'http://127.0.0.1:8000',
      apiKey: 'k',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      modelName: 'grok-imagine-1.0',
    } as any);

    const result = await p.start({ prompt: 'p', references: [] } as any);
    expect((safeFetch as any).mock.calls[0][0]).toContain('/v1/images/generations');
    expect(result.mode).toBe('immediate');
    expect((result as any).output.url).toBe('https://cdn.example.com/a.jpg');
  });

  it('uses /v1/chat/completions when references exist and extracts url from content', async () => {
    (safeFetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          { message: { content: 'ok https://cdn.example.com/x.png' } },
        ],
      }),
    });

    const p = new Grok2ApiImagineTTIProvider({
      id: 'c1',
      name: 'grok2',
      provider: 'grok2api-imagine-tti' as any,
      baseUrl: 'http://127.0.0.1:8000',
      apiKey: 'k',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      modelName: 'grok-imagine-1.0-edit',
    } as any);

    const result = await p.start({
      prompt: 'p',
      references: [
        { transport: 'remote-url', value: 'https://ref.example.com/r1.jpg' },
      ],
    } as any);

    expect((safeFetch as any).mock.calls[0][0]).toContain('/v1/chat/completions');
    const init = (safeFetch as any).mock.calls[0][1];
    const body = JSON.parse(init.body);
    expect(body.messages[0].content[0].type).toBe('image_url');
    expect(body.messages[0].content.at(-1).type).toBe('text');
    expect(result.mode).toBe('immediate');
    expect((result as any).output.url).toBe('https://cdn.example.com/x.png');
  });
});

