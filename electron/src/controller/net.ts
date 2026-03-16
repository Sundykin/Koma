import { BaseController } from './base';

export class NetController extends BaseController {
  async fetch(args: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }) {
    const parsed = new URL(args.url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Only http/https URLs are allowed');
    }

    const response = await fetch(args.url, {
      method: args.method || 'GET',
      headers: args.headers,
      body: args.body,
    });

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      body: await response.text(),
    };
  }
}

export default NetController;
