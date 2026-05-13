/**
 * RecreationModifyService (renderer) — R4 二创：修改单单项执行的 fulfiller。
 *
 * 主进程 recreation-modify handler 通过 delegateToRenderer 调到这里；
 * 本服务按 item.kind 派发到具体 executor。aspect_ratio 完全 main 端跑；
 * language_dub / stylization / wardrobe 需要 renderer 调 TTS / TTI provider 才能拿到产物，
 * 所以 renderer 这边跑一段流程，中途用 IPC 让 main 跑 ffmpeg 原语。
 */
import { TaskManager } from './TaskManager';
import { createLogger } from '../store/logger';
import { getProjectTTSProvider, getProjectTTIProvider } from '../providers';
import { loadSettings } from '../store/globalStore';
import { electronService } from './electronService';
import { safeFetch } from '../utils/safeFetch';
import { loadRecreationAiConfig } from '../components/recreation/aiConfigStore';

const logger = createLogger('RecreationModify');

export interface ModifyRunArgs {
  parentTaskId: string;
  videoId: string;
  planId: string;
  channelKey?: string;
  item: {
    itemId: string;
    kind: string;
    params: Record<string, unknown>;
  };
}

export interface ModifyRunResult {
  ok: true;
  derivedVideoId: string;
  derivedKind: string;
}

function getApi(): any {
  return (window as any).electronAPI?.recreationModify;
}

export class RecreationModifyService {
  static async run(args: ModifyRunArgs): Promise<ModifyRunResult> {
    try {
      return await RecreationModifyService.runInner(args);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      logger.error('RecreationModify failed', { itemId: args.item.kind, kind: args.item.kind, msg, stack });
      // 显式把 failed + error 字段写到主进程 task 表，避免任务卡 running
      TaskManager.updateTask(args.parentTaskId, {
        status: 'failed',
        error: msg.slice(0, 500),
        metadata: { stage: `失败：${msg.slice(0, 80)}` },
      });
      throw err;
    }
  }

  private static async runInner(args: ModifyRunArgs): Promise<ModifyRunResult> {
    const { parentTaskId, videoId, planId, item } = args;
    const api = getApi();
    if (!api) throw new Error('recreationModify IPC 不可用');

    const update = (progress: number, stage: string): void => {
      TaskManager.updateTask(parentTaskId, { status: 'running', progress, metadata: { stage } });
    };

    update(0.05, `${item.kind} · 准备`);

    const payload = {
      videoId,
      planId,
      itemId: item.itemId,
      kind: item.kind,
      params: item.params,
      sourceTaskId: parentTaskId,
    };

    let result: { derivedVideoId: string; derivedKind: string; filePath: string };
    update(0.2, `${item.kind} · 执行中`);
    switch (item.kind) {
      case 'aspect_ratio':
        result = await api.runAspectRatio(payload);
        break;
      case 'language_dub':
        result = await runLanguageDubInRenderer(payload, update);
        break;
      case 'stylization':
      case 'wardrobe':
      case 'face_swap':
      case 'body_reshape':
        // 这 4 个都走逐帧 TTI 重绘，区别只在 buildFrameByFramePrompt 里
        result = await runFrameByFrameTtiInRenderer(payload, update);
        break;
      default:
        throw new Error(`未知 ModificationKind: ${item.kind}`);
    }

    logger.info('modify done', { itemId: item.itemId, kind: item.kind, derivedVideoId: result.derivedVideoId });

    update(0.98, '保存产物');
    TaskManager.updateTask(parentTaskId, {
      status: 'completed',
      progress: 1,
      result: { derivedVideoId: result.derivedVideoId, derivedKind: result.derivedKind },
      metadata: { stage: '已完成' },
    });

    return { ok: true, derivedVideoId: result.derivedVideoId, derivedKind: result.derivedKind };
  }
}

// —— language_dub ——————————————————————————————————————————————————

type UpdateFn = (progress: number, stage: string) => void;
type MainPayload = {
  videoId: string;
  planId: string;
  itemId: string;
  kind: string;
  params: Record<string, unknown>;
  sourceTaskId: string;
};

async function runLanguageDubInRenderer(
  payload: MainPayload,
  update: UpdateFn,
): Promise<{ derivedVideoId: string; derivedKind: string; filePath: string }> {
  const dubText = String(payload.params.dubText ?? '').trim();
  if (!dubText) throw new Error('language_dub 缺 dubText 参数：请在修改单里填要配的台词');

  update(0.3, 'TTS 合成中');
  const [settings, aiCfg] = await Promise.all([loadSettings(), loadRecreationAiConfig()]);
  if (!settings) throw new Error('settings 不可用');
  if (!aiCfg?.ttsSelection) {
    throw new Error('未选择 TTS Channel —— 点右上角「AI 能力配置」→ 选 TTS Channel');
  }
  const provider = await getProjectTTSProvider(aiCfg.ttsSelection, 'speech.text-to-speech', settings);
  if (!provider) throw new Error(`选定的 TTS Channel 不可用: ${aiCfg.ttsSelection}`);

  const started = await provider.start({
    text: dubText,
    voiceId: String(payload.params.voiceId ?? 'default'),
  } as any);
  let audioResult: any;
  if (started.mode === 'immediate') {
    audioResult = (started as any).output;
  } else if (typeof (provider as any).getTaskSnapshot === 'function') {
    // 异步 TTS：轮询直到 success
    for (let i = 0; i < 60; i++) {
      const snap = await (provider as any).getTaskSnapshot((started as any).taskId);
      if (snap.status === 'success') {
        audioResult = snap.output;
        break;
      }
      if (snap.status === 'failed') throw new Error(`TTS 失败: ${snap.error ?? ''}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
    if (!audioResult) throw new Error('TTS 轮询超时（3 分钟）');
  } else {
    throw new Error('TTS provider 不支持轮询，无法异步合成');
  }

  const audioPath = audioResult?.path;
  if (!audioPath) throw new Error('TTS 返回结果缺 path');

  update(0.75, '替换音轨中');
  const api = (window as any).electronAPI?.recreationModify;
  return api.runLanguageDubMux({ ...payload, audioPath });
}

// —— frame-by-frame TTI（stylization / wardrobe 共享）———————————————

const STYLE_PROMPTS: Record<string, string> = {
  anime: '日系动漫风格，色彩明快，线条清晰，赛璐璐渲染',
  oil: '古典油画风格，厚重笔触，温暖色调，光影立体',
  ink: '中国水墨画风格，黑白灰为主，意境留白，写意笔法',
  pixel: '8-bit 像素画风格，方块化，复古游戏感',
  cyberpunk: '赛博朋克风格，霓虹蓝紫色调，未来都市感',
};

async function runFrameByFrameTtiInRenderer(
  payload: MainPayload,
  update: UpdateFn,
): Promise<{ derivedVideoId: string; derivedKind: string; filePath: string }> {
  const api = (window as any).electronAPI?.recreationModify;
  const fs = (window as any).electronAPI?.fs;
  if (!api || !fs) throw new Error('recreationModify / fs IPC 不可用');

  // 按源视频原生 FPS 全帧抽取（最大还原度）；main 端从源视频 fps 读取
  update(0.1, '抽帧中（按原生 FPS）');
  const prep = await api.prepareFrameByFrame({ videoId: payload.videoId });
  const frames: string[] = prep.framePaths;
  const FPS: number = prep.fps;
  if (frames.length === 0) throw new Error('抽帧产出 0 张');
  logger.info('frame-by-frame TTI start', { frames: frames.length, fps: FPS });

  // 构造每张帧的 TTI prompt
  const promptBase = buildFrameByFramePrompt(payload.kind, payload.params);

  const [settings, aiCfg] = await Promise.all([loadSettings(), loadRecreationAiConfig()]);
  if (!settings) throw new Error('settings 不可用');
  if (!aiCfg?.ttiSelection) {
    throw new Error('未选择 TTI Channel —— 点右上角「AI 能力配置」→ 选 TTI Channel');
  }
  const tti = await getProjectTTIProvider(aiCfg.ttiSelection, 'image.text-to-image', settings);
  if (!tti) throw new Error(`选定的 TTI Channel 不可用: ${aiCfg.ttiSelection}`);

  // 并发跑：默认 6 并发，控制限流但比串行快 6 倍。一帧失败立即终止整批。
  const CONCURRENCY = 6;
  let done = 0;
  let firstError: Error | null = null;
  const renderOne = async (i: number): Promise<void> => {
    if (firstError) return;
    const framePath = frames[i];
    const refDataUrl = await readFrameAsDataUrl(framePath);
    try {
      const started = await tti.start({
        prompt: promptBase,
        referenceImages: refDataUrl ? [refDataUrl] : undefined,
        width: prep.width || 1024,
        height: prep.height || 1024,
        n: 1,
      } as any);
      let imgResult: any;
      if (started.mode === 'immediate') {
        imgResult = (started as any).output;
      } else if (typeof (tti as any).getTaskSnapshot === 'function') {
        for (let j = 0; j < 60; j++) {
          if (firstError) return;
          const snap = await (tti as any).getTaskSnapshot((started as any).taskId);
          if (snap.status === 'success') { imgResult = snap.output; break; }
          if (snap.status === 'failed') throw new Error(`TTI 第 ${i} 帧失败: ${snap.error ?? ''}`);
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
      if (!imgResult) throw new Error(`TTI 第 ${i} 帧产出空`);
      const imageBytes = await fetchTtiImageBytes(imgResult);
      await fs.writeFile(framePath, imageBytes, true);
      done++;
      const frac = done / frames.length;
      update(0.15 + frac * 0.7, `逐帧重绘 ${done}/${frames.length}`);
    } catch (err) {
      if (!firstError) firstError = err instanceof Error ? err : new Error(String(err));
    }
  };
  // 简易并发池：每完成一个就启下一个
  const indices = Array.from({ length: frames.length }, (_, i) => i);
  const workers: Promise<void>[] = [];
  let cursor = 0;
  for (let w = 0; w < Math.min(CONCURRENCY, frames.length); w++) {
    workers.push((async () => {
      while (cursor < indices.length && !firstError) {
        const i = cursor++;
        await renderOne(i);
      }
    })());
  }
  await Promise.all(workers);
  if (firstError) throw firstError;

  update(0.9, '拼回视频中');
  return api.runFrameByFrameCompose({
    ...payload,
    frameDir: prep.frameDir,
    audioPath: prep.audioPath,
    fps: FPS,
  });
}

function buildFrameByFramePrompt(kind: string, params: Record<string, unknown>): string {
  if (kind === 'stylization') {
    const preset = String(params.preset ?? 'anime');
    const strength = String(params.strength ?? 'mid');
    return `${STYLE_PROMPTS[preset] ?? STYLE_PROMPTS.anime}，保持画面构图、人物姿势、镜头景别不变。风格化强度：${strength === 'high' ? '强烈' : strength === 'low' ? '轻微' : '中等'}。`;
  }
  if (kind === 'wardrobe') {
    const mode = String(params.mode ?? 'replace');
    const color = String(params.targetColorHex ?? '#a83232');
    if (mode === 'recolor') {
      return `把人物服装的颜色换成 ${color}，其他部分（脸、姿势、背景、构图、镜头）保持不变。`;
    }
    return `把人物服装替换为颜色 ${color} 的同类款式，其他部分（脸、姿势、背景、构图、镜头）保持不变。`;
  }
  if (kind === 'face_swap') {
    // 「角色抽卡」：用户给一段新角色描述，原画面里的人脸/角色被替换成新角色，
    // 但保留姿势、构图、动作、镜头、光照、服装（避免连串塌房）。
    const target = String(params.targetCharacter ?? '').trim();
    const original = String(params.originalCharacter ?? '').trim();
    if (!target) return '保持画面不变';
    const fromClause = original ? `把画面中的「${original}」` : '把画面中的主要人物';
    return `${fromClause}替换为：${target}。要求：人物姿势、动作、镜头景别、构图、光照、服装、背景全部保持不变；只替换角色的脸部 / 发型 / 体型外貌特征以匹配新角色描述。`;
  }
  if (kind === 'body_reshape') {
    const target = String(params.targetBody ?? 'normal'); // micro / slim / normal / curvy / strong
    const bodyMap: Record<string, string> = {
      micro: '娇小纤细',
      slim: '修长清瘦',
      normal: '标准身材',
      curvy: '丰满有曲线',
      strong: '健壮有力',
    };
    const desc = bodyMap[target] ?? target;
    return `把画面中人物的体型调整为「${desc}」。要求：脸部五官、发型、服装款式、姿势动作、镜头景别、构图、光照、背景全部保持不变；只调整人物的身材比例和体型轮廓。`;
  }
  return '保持画面不变';
}

async function readFrameAsDataUrl(framePath: string): Promise<string | null> {
  try {
    const data = await electronService.ipc.invoke('controller/fs/readFileAsBase64', { filePath: framePath });
    const base64 = typeof data === 'string' ? data : (data?.base64 ?? data?.data);
    if (!base64) return null;
    return `data:image/jpeg;base64,${base64}`;
  } catch (err) {
    logger.warn('readFrameAsDataUrl failed', { framePath, err });
    return null;
  }
}

/**
 * 把 TTI provider 返回的图片结果转成 base64 字符串（fs.writeFile binary=true 接受 base64）。
 * 兼容三种形态：base64 / url / path。
 */
async function fetchTtiImageBytes(imgResult: any): Promise<string> {
  const candidates: any[] = Array.isArray(imgResult?.images) ? imgResult.images : Array.isArray(imgResult) ? imgResult : [imgResult];
  const first = candidates[0];
  if (!first) throw new Error('TTI 返回为空');
  if (typeof first === 'string') {
    // 直接是 base64 / url
    if (first.startsWith('http')) return await urlToBase64(first);
    if (first.startsWith('data:')) return first.split(',')[1] ?? '';
    return first;
  }
  if (first.base64) return first.base64;
  if (first.b64_json) return first.b64_json;
  if (first.url) return await urlToBase64(first.url);
  if (first.path) {
    const data = await electronService.ipc.invoke('controller/fs/readFileAsBase64', { filePath: first.path });
    return typeof data === 'string' ? data : (data?.base64 ?? data?.data ?? '');
  }
  throw new Error(`TTI 返回格式不识别: ${JSON.stringify(first).slice(0, 100)}`);
}

async function urlToBase64(url: string): Promise<string> {
  const resp = await safeFetch(url, { method: 'GET' });
  if (!resp.ok) throw new Error(`下载 TTI 产物失败 ${resp.status}`);
  const buf = await resp.arrayBuffer();
  // arrayBuffer → base64
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
