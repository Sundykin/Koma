/**
 * 安全密钥存储模块
 * 使用 Electron safeStorage API 加密敏感数据
 * 降级方案：明文存储 + 警告
 */
import { safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { logger } from 'ee-core/log';

const SECRETS_FILE = 'secrets.enc.json';

interface SecretEntry {
  /** base64-encoded encrypted value, or plaintext with prefix "plain:" */
  value: string;
  updatedAt: number;
}

class SecretsStore {
  private filePath: string | null = null;
  private cache = new Map<string, string>();
  private available = false;

  init(storagePath?: string): void {
    const dir = storagePath || path.join(app.getPath('userData'), 'config');
    this.filePath = path.join(dir, SECRETS_FILE);
    this.available = safeStorage.isEncryptionAvailable();

    if (!this.available) {
      logger.warn('[Secrets] safeStorage encryption unavailable — keys stored as plaintext');
    }

    this.loadFromDisk();
  }

  isEncryptionAvailable(): boolean {
    return this.available;
  }

  /**
   * Store a secret value
   */
  set(key: string, plaintext: string): void {
    this.cache.set(key, plaintext);
    this.saveToDisk();
  }

  /**
   * Retrieve a secret value
   */
  get(key: string): string | null {
    return this.cache.get(key) ?? null;
  }

  /**
   * Delete a secret
   */
  delete(key: string): boolean {
    const existed = this.cache.delete(key);
    if (existed) this.saveToDisk();
    return existed;
  }

  /**
   * List all secret keys (not values)
   */
  keys(): string[] {
    return [...this.cache.keys()];
  }

  /**
   * Check if a secret exists
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  private loadFromDisk(): void {
    if (!this.filePath) return;

    try {
      if (!fs.existsSync(this.filePath)) return;

      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as Record<string, SecretEntry>;

      for (const [key, entry] of Object.entries(raw)) {
        try {
          if (entry.value.startsWith('plain:')) {
            this.cache.set(key, entry.value.slice(6));
          } else {
            const encrypted = Buffer.from(entry.value, 'base64');
            const decrypted = safeStorage.decryptString(encrypted);
            this.cache.set(key, decrypted);
          }
        } catch (err) {
          logger.warn(`[Secrets] Failed to decrypt key "${key}", skipping`);
        }
      }
    } catch {
      // File doesn't exist or is corrupted — start fresh
    }
  }

  private saveToDisk(): void {
    if (!this.filePath) return;

    const data: Record<string, SecretEntry> = {};
    const now = Date.now();

    for (const [key, plaintext] of this.cache.entries()) {
      if (this.available) {
        const encrypted = safeStorage.encryptString(plaintext);
        data[key] = { value: encrypted.toString('base64'), updatedAt: now };
      } else {
        data[key] = { value: `plain:${plaintext}`, updatedAt: now };
      }
    }

    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      logger.error('[Secrets] Failed to save secrets file:', err);
    }
  }
}

export const secretsStore = new SecretsStore();
