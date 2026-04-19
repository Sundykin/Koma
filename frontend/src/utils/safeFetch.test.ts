import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { safeFetch } from './safeFetch';

describe('safeFetch', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'electronAPI', {
      value: undefined,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('会在瞬时网络错误后自动重试', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;

    const pending = safeFetch('https://example.com/data');
    await vi.runAllTimersAsync();
    const response = await pending;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(response.text()).resolves.toBe('ok');
  });

  it('会在 GET 请求遇到 503 时自动重试', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;

    const pending = safeFetch('https://example.com/status');
    await vi.runAllTimersAsync();
    const response = await pending;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
  });

  it('默认不会为不安全方法的 503 响应重试', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('busy', { status: 503 }));
    globalThis.fetch = fetchMock as typeof fetch;

    const response = await safeFetch('https://example.com/jobs', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'hello' }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(503);
  });
});
