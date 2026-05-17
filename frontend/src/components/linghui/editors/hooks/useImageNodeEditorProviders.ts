import { useEffect, useState } from 'react';
import { listConfiguredModelSelectOptions } from '../../../../providers/channel/resolver';
import { loadSettings } from '../../../../store/settings/core';
import type { ProviderOption } from '../components/ImageNodeEditorUtils';

export function useImageNodeEditorProviders(): {
  providers: ProviderOption[];
  multiAngleProviders: ProviderOption[];
} {
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [multiAngleProviders, setMultiAngleProviders] = useState<ProviderOption[]>([]);

  useEffect(() => {
    loadSettings().then(settings => {
      setProviders(listConfiguredModelSelectOptions(settings, 'tti', 'image.text-to-image').map(option => ({
        value: option.value,
        label: `${option.channelLabel} / ${option.modelLabel}`,
        channelLabel: option.channelLabel,
        modelLabel: option.modelLabel,
      })));
      setMultiAngleProviders(listConfiguredModelSelectOptions(settings, 'tti', 'image.image-to-image').map(option => ({
        value: option.value,
        label: `${option.channelLabel} / ${option.modelLabel}`,
      })));
    });
  }, []);

  return { providers, multiAngleProviders };
}
