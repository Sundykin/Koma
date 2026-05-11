import { describe, expect, it } from 'vitest';
import type {
  LinghuiImageGeneratorNodeProperties,
  LinghuiImageNodeProperties,
} from '../../../../types/linghui';
import { planSpawnImageFromGenerator } from '../state/linghuiImageGenerator';

function makeImageDefaults(overrides: Partial<LinghuiImageNodeProperties> = {}): LinghuiImageNodeProperties {
  return {
    mode: 'generate',
    source: '',
    items: [],
    primaryAssetId: '',
    primaryResultSource: '',
    prompt: '',
    ttiSelection: '',
    aspectRatio: '3:4',
    resolution: 'auto',
    gridType: 'none',
    batchCount: 1,
    ...overrides,
  };
}

function makeController(overrides: Partial<LinghuiImageGeneratorNodeProperties> = {}): LinghuiImageGeneratorNodeProperties {
  return {
    prompt: '',
    ttiSelection: '',
    aspectRatio: '3:4',
    resolution: 'auto',
    batchCount: 1,
    generatedImageNodeIds: [],
    generationCount: 0,
    ...overrides,
  };
}

describe('planSpawnImageFromGenerator', () => {
  it('把控制器 prompt / 模型 / 比例 / batch 复制到新展示节点的 properties', () => {
    const controller = makeController({
      prompt: '  暴雨夜的废弃车站  ',
      ttiSelection: 'channel-A/model-X',
      aspectRatio: '16:9',
      resolution: '1080p',
      batchCount: 4,
    });

    const { imageProperties } = planSpawnImageFromGenerator({
      controller,
      imageDefaults: makeImageDefaults(),
      controllerNodeId: 'ctrl-1',
    });

    expect(imageProperties.mode).toBe('generate');
    // prompt 自动 trim，避免空白污染下游
    expect(imageProperties.prompt).toBe('暴雨夜的废弃车站');
    expect(imageProperties.ttiSelection).toBe('channel-A/model-X');
    expect(imageProperties.aspectRatio).toBe('16:9');
    expect(imageProperties.resolution).toBe('1080p');
    expect(imageProperties.batchCount).toBe(4);
    expect(imageProperties.generatedFromNodeId).toBe('ctrl-1');
    expect(imageProperties.generatedSequence).toBe(1);
    // 清空 source / items：避免 mode=import 模式残留
    expect(imageProperties.source).toBe('');
    expect(imageProperties.items).toEqual([]);
    // gridType 强制 none：控制器的 batchCount 控制张数，不走宫格
    expect(imageProperties.gridType).toBe('none');
  });

  it('累加 generationCount，sequence 取下一个值', () => {
    const controller = makeController({
      prompt: 'p',
      generationCount: 7,
      generatedImageNodeIds: ['img-1', 'img-3', 'img-5'],
    });

    const { sequence, buildNextControllerProperties } = planSpawnImageFromGenerator({
      controller,
      imageDefaults: makeImageDefaults(),
      controllerNodeId: 'ctrl-1',
    });

    expect(sequence).toBe(8);

    const nextController = buildNextControllerProperties('img-new');
    // 历史链尾部追加
    expect(nextController.generatedImageNodeIds).toEqual(['img-1', 'img-3', 'img-5', 'img-new']);
    expect(nextController.generationCount).toBe(8);
    // 控制器自己的 prompt / 模型不变（用户继续编辑）
    expect(nextController.prompt).toBe('p');
  });

  it('controller.generatedImageNodeIds 缺失时返回纯净列表（不抛错）', () => {
    const controller = makeController({ prompt: 'p' });
    delete (controller as Partial<LinghuiImageGeneratorNodeProperties>).generatedImageNodeIds;
    delete (controller as Partial<LinghuiImageGeneratorNodeProperties>).generationCount;

    const { sequence, buildNextControllerProperties } = planSpawnImageFromGenerator({
      controller,
      imageDefaults: makeImageDefaults(),
      controllerNodeId: 'ctrl-1',
    });

    expect(sequence).toBe(1);
    const nextController = buildNextControllerProperties('img-1');
    expect(nextController.generatedImageNodeIds).toEqual(['img-1']);
    expect(nextController.generationCount).toBe(1);
  });

  it('controller.batchCount=NaN 或 <1 时降级为 1（防止脏数据让生成失败）', () => {
    const controllerA = makeController({ prompt: 'p', batchCount: 0 });
    const { imageProperties: imageA } = planSpawnImageFromGenerator({
      controller: controllerA,
      imageDefaults: makeImageDefaults(),
      controllerNodeId: 'ctrl-1',
    });
    expect(imageA.batchCount).toBe(1);

    const controllerB = makeController({ prompt: 'p', batchCount: Number.NaN });
    const { imageProperties: imageB } = planSpawnImageFromGenerator({
      controller: controllerB,
      imageDefaults: makeImageDefaults(),
      controllerNodeId: 'ctrl-1',
    });
    expect(imageB.batchCount).toBe(1);
  });

  it('多次连续调用同一控制器：sequence 单调递增，prevIds 不重复追加', () => {
    let controller = makeController({ prompt: 'p' });

    const r1 = planSpawnImageFromGenerator({
      controller,
      imageDefaults: makeImageDefaults(),
      controllerNodeId: 'ctrl-1',
    });
    controller = r1.buildNextControllerProperties('img-1');
    expect(controller.generationCount).toBe(1);
    expect(controller.generatedImageNodeIds).toEqual(['img-1']);

    const r2 = planSpawnImageFromGenerator({
      controller,
      imageDefaults: makeImageDefaults(),
      controllerNodeId: 'ctrl-1',
    });
    controller = r2.buildNextControllerProperties('img-2');
    expect(controller.generationCount).toBe(2);
    expect(controller.generatedImageNodeIds).toEqual(['img-1', 'img-2']);

    const r3 = planSpawnImageFromGenerator({
      controller,
      imageDefaults: makeImageDefaults(),
      controllerNodeId: 'ctrl-1',
    });
    controller = r3.buildNextControllerProperties('img-3');
    expect(controller.generationCount).toBe(3);
    expect(controller.generatedImageNodeIds).toEqual(['img-1', 'img-2', 'img-3']);
    expect(r3.imageProperties.generatedSequence).toBe(3);
  });
});
