import { session } from 'electron';

let registered = false;

export function registerSecurityHeaders(): void {
  if (registered) return;
  registered = true;

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = [
      "default-src 'self' koma-local:",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: koma-local: https: http:",
      "media-src 'self' blob: koma-local: https: http:",
      "connect-src 'self' https: http: ws: wss:",
    ].join('; ');

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });
}
