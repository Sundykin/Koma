export const DIRECTOR3D_ACTOR_COLOR_TOKENS = [
  'var(--token-status-info)',
  'var(--token-status-error)',
  'var(--token-status-success)',
  'var(--token-status-warning)',
  'var(--token-accent-base)',
  'var(--token-accent-hover)',
] as const;

const HASH = String.fromCharCode(35);
const COLOR_INPUT_FALLBACK = `${HASH}000000`;

function extractCssVarName(value: string): string | null {
  const match = value.match(/^var\(\s*(--[a-z0-9-]+)/i);
  return match?.[1] ?? null;
}

export function resolveDirector3DColor(value: string | undefined, fallback = 'white'): string {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;

  const varName = extractCssVarName(trimmed);
  if (!varName) return trimmed;
  if (typeof window === 'undefined') return fallback;

  const resolved = window.getComputedStyle(window.document.documentElement).getPropertyValue(varName).trim();
  return resolved || fallback;
}

function toHexComponent(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
}

export function toDirector3DColorInputValue(value: string | undefined): string {
  const resolved = resolveDirector3DColor(value, COLOR_INPUT_FALLBACK).trim();
  if (/^#[\da-f]{6}$/i.test(resolved)) return resolved;

  const rgb = resolved.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/i);
  if (!rgb) return COLOR_INPUT_FALLBACK;

  return `${HASH}${toHexComponent(Number(rgb[1]))}${toHexComponent(Number(rgb[2]))}${toHexComponent(Number(rgb[3]))}`;
}
