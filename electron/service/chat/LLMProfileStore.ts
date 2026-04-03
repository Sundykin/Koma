import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export type StoredLLMProfile = {
  profileId: string;
  apiKey: string;
  updatedAt: number;
};

type PersistedLLMProfile = Omit<StoredLLMProfile, 'apiKey'> & {
  encryptedApiKey?: string;
  apiKey?: string;
};

type StoreShape = {
  profiles: Record<string, StoredLLMProfile>;
};

type PersistedStoreShape = {
  profiles: Record<string, PersistedLLMProfile>;
};

const EMPTY_STORE: StoreShape = { profiles: {} };


function canEncryptProfiles(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function assertEncryptionAvailable(): void {
  if (!canEncryptProfiles()) {
    throw new Error('Electron safeStorage is not available for LLM profile secrets');
  }
}

function toPersistedProfile(profile: StoredLLMProfile): PersistedLLMProfile {
  assertEncryptionAvailable();
  return {
    profileId: profile.profileId,
    encryptedApiKey: safeStorage.encryptString(profile.apiKey).toString('base64'),
    updatedAt: profile.updatedAt,
  };
}

function fromPersistedProfile(profile: PersistedLLMProfile): StoredLLMProfile {
  if (!profile.encryptedApiKey) {
    throw new Error('Unencrypted LLM profile secret is not supported');
  }

  assertEncryptionAvailable();
  return {
    profileId: profile.profileId,
    apiKey: safeStorage.decryptString(Buffer.from(profile.encryptedApiKey, 'base64')),
    updatedAt: profile.updatedAt,
  };
}

class LLMProfileStore {
  private cache: StoreShape | null = null;

  private getStorePath(): string {
    return path.join(app.getPath('userData'), 'llm-profiles.json');
  }

  private ensureLoaded(): StoreShape {
    if (this.cache) {
      return this.cache;
    }

    const storePath = this.getStorePath();
    if (!fs.existsSync(storePath)) {
      this.cache = { ...EMPTY_STORE };
      return this.cache;
    }

    const raw = fs.readFileSync(storePath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<PersistedStoreShape>;
    const profiles = Object.fromEntries(
      Object.entries(parsed.profiles || {}).map(([profileId, profile]) => [profileId, fromPersistedProfile(profile)])
    );
    this.cache = {
      profiles,
    };
    return this.cache;
  }

  private persist(store: StoreShape): void {
    const storePath = this.getStorePath();
    const persisted: PersistedStoreShape = {
      profiles: Object.fromEntries(
        Object.entries(store.profiles).map(([profileId, profile]) => [profileId, toPersistedProfile(profile)])
      ),
    };
    fs.writeFileSync(storePath, JSON.stringify(persisted, null, 2), 'utf-8');
    this.cache = store;
  }

  saveProfile(profile: { profileId: string; apiKey?: string; }): StoredLLMProfile {
    const store = this.ensureLoaded();
    const existing = store.profiles[profile.profileId];
    const apiKey = profile.apiKey && profile.apiKey.trim() ? profile.apiKey.trim() : existing?.apiKey;
    if (!apiKey) {
      throw new Error('LLM profile requires an apiKey on first save');
    }
    const next: StoredLLMProfile = {
      profileId: profile.profileId,
      apiKey,
      updatedAt: Date.now(),
    };
    const nextStore: StoreShape = {
      ...store,
      profiles: {
        ...store.profiles,
        [profile.profileId]: next,
      },
    };
    this.persist(nextStore);
    return next;
  }

  getProfile(profileId?: string): StoredLLMProfile | null {
    if (!profileId) {
      return null;
    }
    const store = this.ensureLoaded();
    return store.profiles[profileId] || null;
  }

  deleteProfile(profileId: string): boolean {
    const store = this.ensureLoaded();
    if (!store.profiles[profileId]) {
      return false;
    }
    const nextProfiles = { ...store.profiles };
    delete nextProfiles[profileId];
    this.persist({ ...store, profiles: nextProfiles });
    return true;
  }
}

export const llmProfileStore = new LLMProfileStore();
