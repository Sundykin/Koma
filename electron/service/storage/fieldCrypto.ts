/**
 * Repository 字段级加密工具（同步）
 *
 * 约定：
 *   - 明文为空字符串/空值时原样返回（不加密）。
 *   - 密文以 `encrypted:` 前缀标识，Repository 出入口做转换，业务层看不到前缀。
 *   - 密钥派生自 `app.getPath('userData')`，与旧版 LLMChannelConfigTransactionService
 *     保持一致算法（PBKDF2 + AES-256-GCM + 相同 salt/iterations），以保证同机运行
 *     时仍能解密历史密文。跨机/重装场景由 `decryptField` fallback 为空字符串。
 *   - 使用 Node `crypto` 同步 API，保持 Repository 层同步风格。
 */
import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { app } from 'electron';
import { Buffer } from 'node:buffer';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_SALT = 'koma-settings-salt';

export const ENCRYPTED_PREFIX = 'encrypted:';
const LEGACY_PREFIX = '$ENC$';

let _cachedKey: Buffer | null = null;

function getMachineId(): string {
  return Buffer.from(app.getPath('userData')).toString('base64').slice(0, 32);
}

function getKey(): Buffer {
  if (_cachedKey) return _cachedKey;
  const id = getMachineId().padEnd(32, '0').slice(0, 32);
  _cachedKey = pbkdf2Sync(
    Buffer.from(id, 'utf-8'),
    Buffer.from(PBKDF2_SALT, 'utf-8'),
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    'sha256',
  );
  return _cachedKey;
}

export function isEncrypted(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.startsWith(ENCRYPTED_PREFIX) || value.startsWith(LEGACY_PREFIX);
}

export function encryptField(value: string | null | undefined): string {
  if (!value) return '';
  if (isEncrypted(value)) return value;

  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  // 存储布局：[iv(12) | tag(16) | ciphertext(*)]
  const combined = Buffer.concat([iv, tag, encrypted]);
  return ENCRYPTED_PREFIX + combined.toString('base64');
}

/**
 * 解密字段。失败时返回空字符串并调用 `onDecryptError`（通常为日志），不抛。
 * 支持两种前缀：`encrypted:`（新）与 `$ENC$`（历史，仅为同机兼容；本变更不
 * 保证跨版本解密，跨机直接返回空）。
 */
export function decryptField(
  value: string | null | undefined,
  onDecryptError?: (err: unknown) => void,
): string {
  if (!value) return '';

  let raw: string;
  if (value.startsWith(ENCRYPTED_PREFIX)) {
    raw = value.slice(ENCRYPTED_PREFIX.length);
  } else if (value.startsWith(LEGACY_PREFIX)) {
    raw = value.slice(LEGACY_PREFIX.length);
  } else {
    return value;
  }

  try {
    const key = getKey();
    const combined = Buffer.from(raw, 'base64');
    const iv = combined.subarray(0, IV_LENGTH);
    const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = combined.subarray(IV_LENGTH + TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf-8');
  } catch (err) {
    onDecryptError?.(err);
    return '';
  }
}

/**
 * 仅供测试：清空 key cache。
 */
export function __resetFieldCryptoCacheForTests(): void {
  _cachedKey = null;
}
