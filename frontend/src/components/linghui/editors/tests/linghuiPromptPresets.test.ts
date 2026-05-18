import { describe, expect, it } from 'vitest';
import {
  LINGHUI_AGENT_PROMPT_PRESETS,
  mergeLinghuiAgentPresetPrompt,
  mergeLinghuiAgentPresetSystemPrompt,
} from '../state/linghuiAgentPromptPresets';
import {
  LINGHUI_SCRIPT_PROMPT_PRESETS,
  mergeLinghuiScriptPresetPrompt,
  mergeLinghuiScriptPresetSystemPrompt,
} from '../state/linghuiScriptPromptPresets';

describe('Linghui local prompt presets', () => {
  it('merges script preset prompt without duplicating the built-in instruction', () => {
    const preset = LINGHUI_SCRIPT_PROMPT_PRESETS[0];
    const first = mergeLinghuiScriptPresetPrompt('用户剧情', preset);
    expect(first).toContain(preset.promptSnippet);
    expect(first).toContain('用户补充');
    expect(first).toContain('用户剧情');

    const second = mergeLinghuiScriptPresetPrompt(first, preset);
    expect(second).toBe(first);
  });

  it('keeps script system prompt unchanged when a preset has no system snippet', () => {
    const preset = LINGHUI_SCRIPT_PROMPT_PRESETS[0];
    expect(mergeLinghuiScriptPresetSystemPrompt('已有约束', preset)).toBe('已有约束');
  });

  it('merges agent preset prompt and system prompt as real executable node properties', () => {
    const preset = LINGHUI_AGENT_PROMPT_PRESETS.find(item => item.key === 'creative-plan');
    expect(preset).toBeTruthy();
    if (!preset) return;

    expect(mergeLinghuiAgentPresetPrompt('', preset)).toBe(preset.promptSnippet);

    const system = mergeLinghuiAgentPresetSystemPrompt('保持中文输出', preset);
    expect(system).toContain('保持中文输出');
    expect(system).toContain(preset.systemPromptSnippet);
    expect(mergeLinghuiAgentPresetSystemPrompt(system, preset)).toBe(system);
  });
});
