import { describe, expect, it } from 'vitest';
import { getBuiltInChannelDefinition, listBuiltInChannelDefinitions } from './catalog';

describe('channel catalog (itv)', () => {
  it('does not hardcode upstream model lists for built-in ITV channels (models live in settings)', () => {
    const itvChannels = listBuiltInChannelDefinitions('itv');
    expect(itvChannels.length).toBeGreaterThan(0);
    expect(itvChannels.every(channel => channel.models.length === 0)).toBe(true);
  });

  it('declares provider template metadata for custom channel', () => {
    const customChannel = getBuiltInChannelDefinition('custom');
    expect(customChannel).toBeTruthy();
    expect(customChannel?.category).toBe('itv');
    expect(customChannel?.id).toBe('custom');
    expect(customChannel?.models.length).toBe(0);
  });

  it('declares provider template metadata for comfyui-animatediff channel', () => {
    const channel = getBuiltInChannelDefinition('comfyui-animatediff');
    expect(channel).toBeTruthy();
    expect(channel?.category).toBe('itv');
    expect(channel?.id).toBe('comfyui-animatediff');
    expect(channel?.models.length).toBe(0);
  });
});
