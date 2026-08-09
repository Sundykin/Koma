import { describe, expect, it } from 'vitest';
import type { Character, Episode, EpisodeAnalysis, Prop, Scene, Shot } from '../types';
import { createStoredMediaAsset } from '../utils/mediaAssets';
import { buildProjectProductionReadiness } from './projectProductionReadiness';

const episode = (overrides: Partial<Episode> = {}): Episode => ({
  id: 'episode-1',
  projectId: 'project-1',
  number: 1,
  title: '第一集',
  status: 'script',
  scriptText: '镜头一\n角色：你好',
  scriptReady: true,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

const analysis = (overrides: Partial<EpisodeAnalysis> = {}): EpisodeAnalysis => ({
  episodeId: 'episode-1',
  characterRefs: [],
  sceneRefs: [],
  propRefs: [],
  completedStages: ['characters', 'scenes', 'props'],
  shots: [],
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

const image = createStoredMediaAsset('image', { remoteUrl: 'https://cdn.example.com/ref.png' });

describe('buildProjectProductionReadiness', () => {
  it('blocks production when no episode or script exists', () => {
    const noEpisode = buildProjectProductionReadiness({
      episode: null, analysis: null, characters: [], scenes: [], props: [],
    });
    expect(noEpisode.nextAction.type).toBe('select-episode');
    expect(noEpisode.stages.script.status).toBe('blocked');

    const noScript = buildProjectProductionReadiness({
      episode: episode({ scriptText: '' }), analysis: null, characters: [], scenes: [], props: [],
    });
    expect(noScript.nextAction.type).toBe('write-script');
    expect(noScript.stages.assets.status).toBe('blocked');
  });

  it('asks to confirm the production script before analysis', () => {
    const result = buildProjectProductionReadiness({
      episode: episode({ scriptReady: false }), analysis: null, characters: [], scenes: [], props: [],
    });
    expect(result.nextAction.type).toBe('mark-script-ready');
    expect(result.nextAction.disabled).toBe(false);
  });

  it('derives analysis readiness from all three persisted stages', () => {
    const result = buildProjectProductionReadiness({
      episode: episode(),
      analysis: analysis({ completedStages: ['characters'] }),
      characters: [], scenes: [], props: [],
    });
    expect(result.analysisComplete).toBe(false);
    expect(result.nextAction.type).toBe('analyze-script');
    expect(result.stages.script.done).toBe(1);
    expect(result.stages.script.total).toBe(3);
  });

  it('accepts legacy persisted analysis evidence without forcing a destructive reparse', () => {
    const legacyShot = { id: 'legacy-shot' } as Shot;
    const result = buildProjectProductionReadiness({
      episode: episode({ hasAnalysis: true }),
      analysis: analysis({ completedStages: [], shots: [legacyShot] }),
      characters: [], scenes: [], props: [], shots: [legacyShot],
    });
    expect(result.analysisComplete).toBe(true);
    expect(result.stages.script.status).toBe('ready');
    expect(result.nextAction.type).toBe('open-storyboard');
  });

  it('counts only current-episode referenced assets and uses shared media selectors', () => {
    const characters = [{ id: 'c-ready', media: { costumePhoto: image } }, { id: 'c-other' }] as Character[];
    const scenes = [{ id: 's-missing' }] as Scene[];
    const props = [{ id: 'p-ready', media: { previewImage: image } }] as Prop[];
    const result = buildProjectProductionReadiness({
      episode: episode(),
      analysis: analysis({
        characterRefs: ['c-ready'],
        sceneRefs: ['s-missing'],
        propRefs: ['p-ready'],
      }),
      characters,
      scenes,
      props,
    });
    expect(result.missingAssets).toEqual({ characters: [], scenes: ['s-missing'], props: [] });
    expect(result.missingAssetCount).toBe(1);
    expect(result.stages.assets.done).toBe(2);
    expect(result.stages.assets.total).toBe(3);
    expect(result.nextAction.type).toBe('open-assets');
  });

  it('treats unresolved asset references as missing instead of ready', () => {
    const result = buildProjectProductionReadiness({
      episode: episode(),
      analysis: analysis({ characterRefs: ['deleted-character'] }),
      characters: [], scenes: [], props: [],
    });
    expect(result.missingAssets.characters).toEqual(['deleted-character']);
    expect(result.stages.assets.status).toBe('incomplete');
  });

  it('projects active and failed task states into deterministic retry actions', () => {
    const running = buildProjectProductionReadiness({
      episode: episode(), analysis: null, characters: [], scenes: [], props: [],
      tasks: [{ type: 'script-analysis', status: 'running', error: null, updatedAt: 2 }],
    });
    expect(running.stages.script.status).toBe('running');
    expect(running.nextAction.type).toBe('wait-script-analysis');

    const failed = buildProjectProductionReadiness({
      episode: episode(), analysis: null, characters: [], scenes: [], props: [],
      tasks: [{ type: 'script-analysis', status: 'failed', error: '模型超时', updatedAt: 3 }],
    });
    expect(failed.stages.script.status).toBe('failed');
    expect(failed.nextAction).toMatchObject({ type: 'analyze-script', label: '重试解析剧本' });
    expect(failed.nextAction.reason).toBe('模型超时');
  });

  it('offers shot generation and then opens generated storyboard', () => {
    const readyForShots = buildProjectProductionReadiness({
      episode: episode(), analysis: analysis(), characters: [], scenes: [], props: [],
    });
    expect(readyForShots.nextAction.type).toBe('generate-shots');

    const shots = [{ id: 'shot-1' }, { id: 'shot-2' }] as Shot[];
    const generated = buildProjectProductionReadiness({
      episode: episode(), analysis: analysis({ shots }), characters: [], scenes: [], props: [], shots,
    });
    expect(generated.stages.storyboard.status).toBe('ready');
    expect(generated.stages.storyboard.done).toBe(2);
    expect(generated.nextAction).toMatchObject({ type: 'open-storyboard', label: '打开 2 个分镜' });
  });

  it('keeps shot failure independently retryable after script analysis completed', () => {
    const result = buildProjectProductionReadiness({
      episode: episode(), analysis: analysis(), characters: [], scenes: [], props: [],
      tasks: [{ type: 'shot-analysis', status: 'failed', error: '分镜解析失败', updatedAt: 4 }],
    });
    expect(result.stages.script.status).toBe('ready');
    expect(result.stages.storyboard.status).toBe('failed');
    expect(result.nextAction).toMatchObject({ type: 'generate-shots', label: '重试生成分镜' });
  });
});
