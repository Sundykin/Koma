import { useState, useEffect } from 'react';
import { getActiveTTIConfig, getActiveITVConfig } from '../store/settings/mediaConfig';
import type { TTIModelConfig, ITVModelConfig } from '../types';
import { createLogger } from '../store/logger';

const logger = createLogger('useActiveConfig');

type ConfigType = 'tti' | 'itv';

interface UseActiveConfigResult<T> {
  config: T | null;
  loading: boolean;
  refresh: () => void;
}

export function useActiveConfig(type: 'tti', configId?: string): UseActiveConfigResult<TTIModelConfig>;
export function useActiveConfig(type: 'itv', configId?: string): UseActiveConfigResult<ITVModelConfig>;
export function useActiveConfig(type: ConfigType, configId?: string): UseActiveConfigResult<any> {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let mounted = true;
    const fetchConfig = async () => {
      setLoading(true);
      try {
        const getter = type === 'tti' ? getActiveTTIConfig : getActiveITVConfig;
        const result = await getter(configId);
        if (mounted) setConfig(result);
      } catch (err) {
        logger.error(`Failed to load ${type} config`, err);
        if (mounted) setConfig(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchConfig();
    return () => { mounted = false; };
  }, [type, configId, version]);

  const refresh = () => setVersion(v => v + 1);

  return { config, loading, refresh };
}
