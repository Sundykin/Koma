import { describe, expect, it } from 'vitest';
import { compilePromptReferences } from './promptReferenceCompiler';

describe('compilePromptReferences 多类型编译协议', () => {
  describe('@Image / @Video / @Audio 分桶编号', () => {
    it('image-index 策略下，按 kind 各自从 1 开始编号', () => {
      const result = compilePromptReferences({
        prompt: '主角 @ref_a 在 @ref_b 场景中说 @ref_audio_1，配上 @ref_video_1',
        references: [
          { id: 'a', name: '主角', kind: 'image', source: 'https://x/a.png' },
          { id: 'b', name: '场景', kind: 'image', source: 'https://x/b.png' },
          { id: 'audio_1', name: '台词音频', kind: 'audio', source: 'https://x/v.mp3' },
          { id: 'video_1', name: '动作视频', kind: 'video', source: 'https://x/v.mp4' },
        ],
        replacementStrategy: 'image-index',
      });
      expect(result.compiledPrompt).toBe('主角 @Image 1 在 @Image 2 场景中说 @Audio 1，配上 @Video 1');
      // 全能参考通道：image / video / audio 一并按推入顺序进 compiledReferences
      expect(result.compiledReferences).toEqual([
        'https://x/a.png',
        'https://x/b.png',
        'https://x/v.mp3',
        'https://x/v.mp4',
      ]);
    });

    it('全能参考通道：video / audio 与 image 一起进 compiledReferences，受各自上限约束', () => {
      const result = compilePromptReferences({
        prompt: '@ref_i1 @ref_v1 @ref_v2 @ref_v3 @ref_v4 @ref_a1 @ref_a2',
        references: [
          { id: 'i1', name: 'I1', kind: 'image', source: 'https://x/i1.png' },
          { id: 'v1', name: 'V1', kind: 'video', source: 'https://x/v1.mp4' },
          { id: 'v2', name: 'V2', kind: 'video', source: 'https://x/v2.mp4' },
          { id: 'v3', name: 'V3', kind: 'video', source: 'https://x/v3.mp4' },
          { id: 'v4', name: 'V4', kind: 'video', source: 'https://x/v4.mp4' },
          { id: 'a1', name: 'A1', kind: 'audio', source: 'https://x/a1.mp3' },
          { id: 'a2', name: 'A2', kind: 'audio', source: 'https://x/a2.mp3' },
        ],
        replacementStrategy: 'image-index',
      });
      expect(result.compiledPrompt).toBe('@Image 1 @Video 1 @Video 2 @Video 3 V4 @Audio 1 @Audio 2');
      // 第 4 个 video 超 cap → 不进数组；其余按声明顺序混排进同一通道
      expect(result.compiledReferences).toEqual([
        'https://x/i1.png',
        'https://x/v1.mp4',
        'https://x/v2.mp4',
        'https://x/v3.mp4',
        'https://x/a1.mp3',
        'https://x/a2.mp3',
      ]);
    });

    it('video / audio 超出 3 个时，超出部分回退到 readable name', () => {
      const result = compilePromptReferences({
        prompt: '@ref_v1 @ref_v2 @ref_v3 @ref_v4 @ref_v5 @ref_a1 @ref_a2 @ref_a3 @ref_a4',
        references: [
          { id: 'v1', name: 'V1', kind: 'video', source: 'https://x/v1.mp4' },
          { id: 'v2', name: 'V2', kind: 'video', source: 'https://x/v2.mp4' },
          { id: 'v3', name: 'V3', kind: 'video', source: 'https://x/v3.mp4' },
          { id: 'v4', name: 'V4', kind: 'video', source: 'https://x/v4.mp4' },
          { id: 'v5', name: 'V5', kind: 'video', source: 'https://x/v5.mp4' },
          { id: 'a1', name: 'A1', kind: 'audio', source: 'https://x/a1.mp3' },
          { id: 'a2', name: 'A2', kind: 'audio', source: 'https://x/a2.mp3' },
          { id: 'a3', name: 'A3', kind: 'audio', source: 'https://x/a3.mp3' },
          { id: 'a4', name: 'A4', kind: 'audio', source: 'https://x/a4.mp3' },
        ],
        replacementStrategy: 'image-index',
      });
      // 前 3 个 video / audio 编号；后面的回落到 name
      expect(result.compiledPrompt).toBe('@Video 1 @Video 2 @Video 3 V4 V5 @Audio 1 @Audio 2 @Audio 3 A4');
    });

    it('image 无上限：5 张图片全部编号', () => {
      const result = compilePromptReferences({
        prompt: '@ref_i1 @ref_i2 @ref_i3 @ref_i4 @ref_i5',
        references: Array.from({ length: 5 }, (_, idx) => ({
          id: `i${idx + 1}`,
          name: `I${idx + 1}`,
          kind: 'image' as const,
          source: `https://x/i${idx + 1}.png`,
        })),
        replacementStrategy: 'image-index',
      });
      expect(result.compiledPrompt).toBe('@Image 1 @Image 2 @Image 3 @Image 4 @Image 5');
      expect(result.compiledReferences).toHaveLength(5);
    });

    it('缺省 kind 视为 image（向后兼容旧调用方）', () => {
      const result = compilePromptReferences({
        prompt: '@ref_x',
        references: [{ id: 'x', name: 'X', source: 'https://x/x.png' }],
        replacementStrategy: 'image-index',
      });
      expect(result.compiledPrompt).toBe('@Image 1');
    });

    it('readable-name 策略下：不按 kind 编号，直接替换为 name', () => {
      const result = compilePromptReferences({
        prompt: '@ref_a @ref_v',
        references: [
          { id: 'a', name: '主角', kind: 'image', source: 'https://x/a.png' },
          { id: 'v', name: '动作视频', kind: 'video', source: 'https://x/v.mp4' },
        ],
        replacementStrategy: 'readable-name',
      });
      expect(result.compiledPrompt).toBe('主角 动作视频');
    });

    it('primaryReference 占用对应 kind 的第 1 个编号位', () => {
      const result = compilePromptReferences({
        prompt: '@ref_v_primary 然后 @ref_v_other',
        references: [
          { id: 'v_primary', name: '主视频', kind: 'video', source: 'https://x/p.mp4' },
          { id: 'v_other', name: '次视频', kind: 'video', source: 'https://x/o.mp4' },
        ],
        replacementStrategy: 'image-index',
        primaryReferenceId: 'v_primary',
      });
      expect(result.compiledPrompt).toBe('@Video 1 然后 @Video 2');
    });

    it('未声明的 @ref_unknown 列入 unresolvedMentions', () => {
      const result = compilePromptReferences({
        prompt: 'hello @ref_unknown world',
        references: [],
        replacementStrategy: 'image-index',
      });
      expect(result.unresolvedMentions).toEqual(['@ref_unknown']);
      expect(result.compiledPrompt).toBe('hello @ref_unknown world');
    });
  });
});
