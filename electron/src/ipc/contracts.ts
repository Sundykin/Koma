export interface IPCErrorEnvelope {
  code: string;
  message: string;
  stack?: string;
  details?: unknown;
}

export interface IPCSuccessEnvelope<T = unknown> {
  ok: true;
  data: T;
}

export interface IPCFailureEnvelope {
  ok: false;
  error: IPCErrorEnvelope;
}

export type IPCResponseEnvelope<T = unknown> = IPCSuccessEnvelope<T> | IPCFailureEnvelope;

export interface IPCRequestEnvelope<TArgs = unknown> {
  channel: string;
  args?: TArgs;
}

const DOMAIN_ACTION_CHANNEL_RE = /^[a-z][a-z0-9-]*:[a-z][a-zA-Z0-9-]*(?::[a-z][a-zA-Z0-9-]*)*$/;

export function isDomainActionChannel(channel: string): boolean {
  return DOMAIN_ACTION_CHANNEL_RE.test(channel);
}

export function normalizeErrorCode(raw?: string): string {
  if (!raw) return 'UNKNOWN_ERROR';
  return raw
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase() || 'UNKNOWN_ERROR';
}

export function toIPCErrorEnvelope(error: unknown, fallbackCode = 'IPC_ERROR'): IPCErrorEnvelope {
  if (error instanceof Error) {
    const code = normalizeErrorCode((error as Error & { code?: string }).code) || fallbackCode;
    return {
      code,
      message: error.message || 'Unknown IPC error',
      stack: error.stack,
      details: error,
    };
  }

  if (typeof error === 'string') {
    return {
      code: fallbackCode,
      message: error,
      details: error,
    };
  }

  return {
    code: fallbackCode,
    message: 'Unknown IPC error',
    details: error,
  };
}

export function ok<T>(data: T): IPCSuccessEnvelope<T> {
  return { ok: true, data };
}

export function fail(error: unknown, fallbackCode = 'IPC_ERROR'): IPCFailureEnvelope {
  return { ok: false, error: toIPCErrorEnvelope(error, fallbackCode) };
}
