/**
 * Koma app constants (non-ee-core config).
 * ee-core config lives in config.default.ts / config.local.ts / config.prod.ts.
 */

export interface StorageConfig {
  defaultRoot: string;
}

export interface KomaConfig {
  storage: StorageConfig;
}

const komaConfig: KomaConfig = {
  storage: {
    defaultRoot: '.koma',
  },
};

export default komaConfig;
