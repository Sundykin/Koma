/**
 * VideoDiagnosisService — R4 二创：视频 → 多模态诊断报告（极简版）
 *
 * 只调两类模型：
 *   - VLM 多模态：看抽出来的帧 → 一次性输出 10+ 维度（人物/场景/镜头/服装/动作/光照/OCR/音乐/风险/总结）
 *     并发两次调用：人物维度 + 场景维度（拆开避免 model 偷懒）
 *   - LLM 推理：基于 VLM 结果做修改可行性 + 剧情走向暗示
 *
 * 不再调 ASR / OCR / Audio 三个独立 endpoint —— 现代多模态模型一站式覆盖。
 */
import { safeFetch } from '../utils/safeFetch';
import { buildChannelAuthRequest } from '../providers/channel/auth';
import { TaskManager } from './TaskManager';
import { createLogger } from '../store/logger';
import { parseLLMJSONWithMeta } from '../utils/llmJsonParser';
import { loadSettings } from '../store/globalStore';
import { resolveConfiguredChannelModel } from '../providers/channel/resolver';
import { parseMediaSelectionKey } from '../providers/channel/resolver';
import { electronService } from './electronService';

const logger = createLogger('VideoDiagnosis');

const TIMEOUT_MS = 180_000;
const FRAME_COUNT = 8;

export interface DiagnosisRunArgs {
  parentTaskId: string;
  videoId: string;
  channelKey: string;
  models: {
    vlm?: string;
    llm?: string;
  };
}

// —— 类型 ————————————————————————————————————————————————

interface CharacterLite { description: string; appearance?: string; framesIndex?: number[] }
interface SceneLite     { kind: string; daytime: string; desc: string; framesIndex?: number[] }
interface RiskMarkLite  { kind: string; frameIndex: number; severity: number }
interface OnScreenTextLite { frameIndex: number; text: string }
interface DescWithFrames { text: string; framesIndex?: number[] }
interface FramePrompt { frameIndex: number; prompt: string }

interface DimensionStatus {
  status: 'ok' | 'partial' | 'failed' | 'skipped';
  coverage: number;
  modelUsed?: string;
  note?: string;
}

export interface DiagnosticReportPayload {
  schemaVersion: '3.1.0';
  videoId: string;
  generatedAt: number;
  summary: string;
  dimensions: Record<string, DimensionStatus>;

  // VLM 输出（所有文本字段都带 framesIndex 引用参考帧）
  characters: CharacterLite[];
  scenes: SceneLite[];
  shotsDesc?: DescWithFrames;
  wardrobeDesc?: DescWithFrames;
  actionDesc?: DescWithFrames;
  lightingDesc?: DescWithFrames;
  scriptHintFromVisual?: DescWithFrames;
  risks: RiskMarkLite[];
  ocrTexts: OnScreenTextLite[];
  musicMood?: { mood: string; energy: number; note?: string; framesIndex?: number[] };

  // 逐帧反推提示词
  framePrompts?: FramePrompt[];

  // LLM 输出
  feasibilityHint?: string;

  // 调试 / 溯源
  sampledFrames: string[];
}

// —— Helpers ————————————————————————————————————————————————

interface ChannelContext {
  baseUrl: string;
  apiKey: string;
  channelId?: string;
}

function joinUrl(baseUrl: string, path: string): string {
  let b = baseUrl.replace(/\/+$/, '');
  let p = path.startsWith('/') ? path : `/${path}`;
  if (b.endsWith('/v1') && p.startsWith('/v1/')) p = p.substring(3);
  return b + p;
}

async function resolveChannel(channelKey: string): Promise<ChannelContext> {
  const settings = await loadSettings();
  if (!settings) throw new Error('settings 不可用');
  const ctx = resolveConfiguredChannelModel(
    settings,
    'llm',
    parseMediaSelectionKey(channelKey),
    'llm.chat',
  );
  if (!ctx) throw new Error(`未找到 channel: ${channelKey}`);
  const ch = ctx.channelConfig;
  const pc = (ch.providerConfig || {}) as Record<string, any>;
  const baseUrl = String(pc.baseUrl || '');
  const apiKey = String(pc.apiKey || '');
  if (!baseUrl) throw new Error(`Channel "${ch.name}" 的 baseUrl 未配置`);
  return { baseUrl, apiKey, channelId: ch.id };
}

function getRecreationApi(): any { return (window as any).electronAPI?.recreationVideos; }
function getFfmpegApi(): any     { return (window as any).electronAPI?.ffmpeg; }

async function readFileAsDataUrl(filePath: string, mime = 'image/jpeg'): Promise<string | null> {
  try {
    const data = await electronService.ipc.invoke('controller/fs/readFileAsBase64', { filePath });
    const base64 = typeof data === 'string' ? data : (data?.base64 ?? data?.data);
    if (!base64) {
      logger.warn('readFileAsBase64 returned empty', {
        filePath,
        dataType: typeof data,
        dataKeys: data && typeof data === 'object' ? Object.keys(data) : null,
      });
      return null;
    }
    return `data:${mime};base64,${base64}`;
  } catch (err) {
    logger.warn('readFileAsBase64 failed', filePath, err);
    return null;
  }
}

function buildHeaders(ch: ChannelContext, extra: Record<string, string> = {}): Record<string, string> {
  return buildChannelAuthRequest({
    channelId: ch.channelId,
    apiKey: ch.apiKey,
    mode: 'bearer-header',
    headers: extra,
  }).headers;
}

function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return safeFetch(url, { ...init, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

// —— 抽帧 ————————————————————————————————————————————————

async function extractFrames(videoPath: string, durationMs: number | null): Promise<string[]> {
  const api = getFfmpegApi();
  if (!api?.extractFrames || !api?.getCacheDir) {
    logger.warn('extractFrames: electronAPI.ffmpeg 缺方法');
    return [];
  }
  const subDir = `recreation-frames/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let outputDir: string;
  try {
    outputDir = await api.getCacheDir(subDir);
  } catch (err) {
    logger.warn('getCacheDir 失败', err);
    return [];
  }
  try {
    const result = await api.extractFrames({
      input: videoPath,
      outputDir,
      frameCount: FRAME_COUNT,
      width: 768,
      quality: 4,
    });
    const frames = Array.isArray(result) ? result : (result?.frames || []);
    const out = (frames as string[]).slice(0, FRAME_COUNT);
    logger.info('extractFrames done', { count: out.length, requested: FRAME_COUNT, durationMs, firstFrame: out[0] });
    return out;
  } catch (err) {
    logger.warn('extractFrames 失败', err);
    return [];
  }
}

// —— VLM —————————————————————————————————————————————————————

function buildVlmFrameParts(frameDataUrls: string[]): any[] {
  const parts: any[] = [];
  frameDataUrls.forEach((url, i) => {
    parts.push({ type: 'text', text: `Frame ${i}:` });
    parts.push({ type: 'image_url', image_url: { url, detail: 'low' } });
  });
  return parts;
}

interface VlmCharacterPart {
  summary?: string;
  characters?: CharacterLite[];
  wardrobeDesc?: DescWithFrames;
  actionDesc?: DescWithFrames;
}
interface VlmSceneryPart {
  scenes?: SceneLite[];
  shotsDesc?: DescWithFrames;
  lightingDesc?: DescWithFrames;
  risks?: RiskMarkLite[];
  ocrTexts?: OnScreenTextLite[];
  musicMood?: { mood: string; energy: number; note?: string; framesIndex?: number[] };
  scriptHintFromVisual?: DescWithFrames;
}
interface VlmPromptsPart {
  framePrompts?: FramePrompt[];
}

async function callVlmJson<T>(
  ch: ChannelContext,
  modelName: string,
  system: string,
  userText: string,
  frameParts: any[],
  tag: string,
): Promise<T> {
  const userContent = [{ type: 'text', text: userText }, ...frameParts];
  const body = {
    model: modelName,
    messages: [{ role: 'system', content: system }, { role: 'user', content: userContent }],
    response_format: { type: 'json_object' },
    temperature: 0.6,
  };
  const serialized = JSON.stringify(body);
  logger.info(`VLM[${tag}] request`, { model: modelName, frames: frameParts.length / 2, bodyLength: serialized.length });
  const resp = await fetchWithTimeout(joinUrl(ch.baseUrl, '/v1/chat/completions'), {
    method: 'POST',
    headers: buildHeaders(ch, { 'Content-Type': 'application/json' }),
    body: serialized,
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`VLM[${tag}] ${resp.status}: ${text.slice(0, 300)}`);
  const respJson = JSON.parse(text);
  const content = respJson?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error(`VLM[${tag}] 响应缺 message.content`);
  logger.info(`VLM[${tag}] response`, { contentLen: content.length, head: content.slice(0, 200) });
  const { data } = parseLLMJSONWithMeta<T>(content);
  return (data ?? ({} as T));
}

/**
 * VLM 主入口：拆 2 次并发调用合并结果。
 *
 * 调用 A（人物维度）：summary / characters / wardrobeDesc / actionDesc
 * 调用 B（场景维度）：scenes / shotsDesc / lightingDesc / risks / ocrTexts / musicMood / scriptHintFromVisual
 */
async function callVLM(
  ch: ChannelContext,
  modelName: string,
  frames: string[],
  videoMeta: { durationMs: number | null; w?: number | null; h?: number | null; fps?: number | null },
): Promise<VlmCharacterPart & VlmSceneryPart & VlmPromptsPart> {
  const frameDataUrls = (await Promise.all(frames.map((p) => readFileAsDataUrl(p, 'image/jpeg'))))
    .filter((u): u is string => typeof u === 'string');

  logger.info('VLM frameDataUrls', {
    wantFrames: frames.length, gotDataUrls: frameDataUrls.length,
    firstUrlLen: frameDataUrls[0]?.length ?? 0,
  });
  if (frameDataUrls.length === 0) throw new Error('所有帧 base64 编码失败');

  const frameParts = buildVlmFrameParts(frameDataUrls);
  const metaText =
    `视频时长 ${Math.round((videoMeta.durationMs || 0) / 1000)} 秒，` +
    `分辨率 ${videoMeta.w}×${videoMeta.h} ${videoMeta.fps || ''}fps。` +
    `下面按时间顺序给 ${frameDataUrls.length} 张代表帧（Frame 0 ~ Frame ${frameDataUrls.length - 1}）。`;

  // —— 人物维度 ——
  const sysChar =
    'You are a film post-production analyst. Respond with a valid JSON object ONLY, no prose.\n' +
    '所有带 framesIndex 字段的对象都必须给出 framesIndex 数组（用 Frame N 里的 N，从 0 开始）。\n' +
    'Required JSON schema:\n' +
    '{ "summary": "整段视频内容总结，≤60 中文字",\n' +
    '  "characters": [\n' +
    '    {"description":"角色描述≤30字","appearance":"外貌特征","framesIndex":[出现帧索引]}\n' +
    '  ],\n' +
    '  "wardrobeDesc": {"text":"整体服装风格描述≤60字","framesIndex":[最能代表该描述的帧索引,2-4个]},\n' +
    '  "actionDesc":   {"text":"动作/镜头节奏概括≤60字","framesIndex":[最能代表的帧索引,2-4个]} }';

  // —— 场景维度 ——
  const sysScene =
    'You are a film post-production analyst. Respond with a valid JSON object ONLY, no prose.\n' +
    '所有带 framesIndex 字段的对象都必须给出 framesIndex 数组（用 Frame N 里的 N，从 0 开始）。\n' +
    'Required JSON schema:\n' +
    '{ "scenes": [{"kind":"室内|室外|车内|其他","daytime":"清晨|白天|黄昏|夜晚|未知","desc":"短描述","framesIndex":[该场景所在的帧索引]}],\n' +
    '  "shotsDesc":      {"text":"镜头风格/运镜偏好≤60字","framesIndex":[最能代表的帧索引,2-4个]},\n' +
    '  "lightingDesc":   {"text":"光照特征≤60字（日光/室内/强光/逆光/火光跳动）","framesIndex":[最能代表的帧索引,2-4个]},\n' +
    '  "risks": [{"kind":"强光|侧脸|特写超长|快速运动|遮挡","frameIndex":N,"severity":0-1}],\n' +
    '  "ocrTexts": [{"frameIndex":N,"text":"屏内识别到的文字"}],\n' +
    '  "musicMood": {"mood":"紧张|欢快|悲伤|神秘|宁静|未知","energy":0-1,"note":"从画面情绪推断的音乐风格","framesIndex":[支撑该情绪推断的帧索引,2-4个]},\n' +
    '  "scriptHintFromVisual": {"text":"从画面+字幕推断的剧情走向/台词风格≤120字","framesIndex":[关键剧情帧索引,2-4个]} }\n' +
    '注意：OCR 只识别画面里真实可见的文字（字幕、招牌、屏幕等）。';

  // —— 逐帧反推提示词 ——
  const sysPrompts =
    'You are a prompt engineer for text-to-image / text-to-video models. ' +
    'Respond with a valid JSON object ONLY, no prose.\n' +
    '对下面给你的每一张代表帧（按 Frame N 索引，从 0 开始），逐张反推一段可以直接喂给 SD / Midjourney / Sora 类模型的中文提示词。\n' +
    '提示词要包含：主体 / 动作或姿态 / 镜头景别 + 角度 / 光线 / 色调 / 风格氛围。短句以逗号分隔，60-120 字。\n' +
    'Required JSON schema:\n' +
    '{ "framePrompts": [ {"frameIndex": 0, "prompt": "..."}, {"frameIndex": 1, "prompt": "..."} ] }\n' +
    '必须为每一张给到的帧都输出一条，frameIndex 与 Frame N 对应。';

  const [charPart, sceneryPart, promptsPart] = await Promise.all([
    callVlmJson<VlmCharacterPart>(ch, modelName, sysChar, metaText, frameParts, 'character').catch((err) => {
      logger.warn('VLM[character] 失败，跳过', err);
      return {} as VlmCharacterPart;
    }),
    callVlmJson<VlmSceneryPart>(ch, modelName, sysScene, metaText, frameParts, 'scenery').catch((err) => {
      logger.warn('VLM[scenery] 失败，跳过', err);
      return {} as VlmSceneryPart;
    }),
    callVlmJson<VlmPromptsPart>(ch, modelName, sysPrompts, metaText, frameParts, 'prompts').catch((err) => {
      logger.warn('VLM[prompts] 失败，跳过', err);
      return {} as VlmPromptsPart;
    }),
  ]);

  const ok =
    (charPart.characters?.length ?? 0) > 0 ||
    (sceneryPart.scenes?.length ?? 0) > 0 ||
    (promptsPart.framePrompts?.length ?? 0) > 0 ||
    !!charPart.summary || !!sceneryPart.shotsDesc?.text;
  if (!ok) {
    throw new Error('VLM 三次调用均返回空内容，可能 model / prompt / base64 兼容性问题');
  }

  return { ...charPart, ...sceneryPart, ...promptsPart };
}

// —— LLM 可行性推理 ————————————————————————————————————————————————

async function callLLMFeasibility(
  ch: ChannelContext,
  modelName: string,
  vlmResult: VlmCharacterPart & VlmSceneryPart,
): Promise<{ feasibilityHint?: string }> {
  const system =
    'You are a film post-production analyst. Respond with a valid JSON object ONLY, no prose.\n' +
    'Required JSON schema:\n' +
    '{ "feasibilityHint": "基于视觉分析结果，给出关于二创可行性的建议（哪些镜头适合换脸 / 服装替换 / 横竖屏 / 多语言本地化），≤180 字" }';
  const user =
    '已识别的视频分析数据：\n' +
    JSON.stringify({
      summary: vlmResult.summary,
      charactersCount: vlmResult.characters?.length ?? 0,
      scenesCount: vlmResult.scenes?.length ?? 0,
      shotsDesc: vlmResult.shotsDesc?.text,
      wardrobeDesc: vlmResult.wardrobeDesc?.text,
      actionDesc: vlmResult.actionDesc?.text,
      lightingDesc: vlmResult.lightingDesc?.text,
      risksCount: vlmResult.risks?.length ?? 0,
      ocrCount: vlmResult.ocrTexts?.length ?? 0,
    });

  const body = {
    model: modelName,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    response_format: { type: 'json_object' },
    temperature: 0.6,
  };
  const resp = await fetchWithTimeout(joinUrl(ch.baseUrl, '/v1/chat/completions'), {
    method: 'POST',
    headers: buildHeaders(ch, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`LLM ${resp.status}: ${text.slice(0, 300)}`);
  const respJson = JSON.parse(text);
  const content = respJson?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') return {};
  const { data } = parseLLMJSONWithMeta<{ feasibilityHint?: string }>(content);
  return data ?? {};
}

// —— 主流程 ————————————————————————————————————————————————

async function getVideo(videoId: string): Promise<any> {
  const api = getRecreationApi();
  if (!api) throw new Error('recreationVideos IPC 不可用');
  const v = await api.get(videoId);
  if (!v) throw new Error(`视频不存在: ${videoId}`);
  return v;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200);
}

export class VideoDiagnosisService {
  static async run(args: DiagnosisRunArgs): Promise<{
    ok: true; dimensionsOk: number; summary?: Record<string, string>;
  }> {
    try {
      return await VideoDiagnosisService.runInner(args);
    } catch (err) {
      const recApi = getRecreationApi();
      await recApi?.setDiagnosisStatus(args.videoId, 'failed').catch(() => undefined);
      throw err;
    }
  }

  private static async runInner(args: DiagnosisRunArgs): Promise<{
    ok: true; dimensionsOk: number; summary?: Record<string, string>;
  }> {
    const { parentTaskId, videoId, channelKey, models } = args;
    const recApi = getRecreationApi();

    const update = (progress: number, stage: string): void => {
      TaskManager.updateTask(parentTaskId, { status: 'running', progress, payload: { stage } as any });
    };

    // ── 0. 准备
    update(0.02, '加载视频');
    const video = await getVideo(videoId);
    if (!video.filePath) throw new Error('视频文件路径丢失');
    await recApi?.setDiagnosisStatus(videoId, 'running').catch(() => undefined);

    const ch = await resolveChannel(channelKey);

    // ── 1. 抽帧
    update(0.15, '抽取代表帧');
    const frames = await extractFrames(video.filePath, video.durationMs);

    // 初始报告骨架（全部维度先标 skipped）
    const report: DiagnosticReportPayload = {
      schemaVersion: '3.1.0',
      videoId,
      generatedAt: Date.now(),
      summary: '',
      dimensions: {
        meta:        { status: 'ok',      coverage: 1.0 },
        character:   { status: 'skipped', coverage: 0, note: '未配置 VLM 模型' },
        scene:       { status: 'skipped', coverage: 0, note: '未配置 VLM 模型' },
        shot:        { status: 'skipped', coverage: 0, note: '未配置 VLM 模型' },
        script:      { status: 'skipped', coverage: 0, note: '未配置 VLM 模型' },
        wardrobe:    { status: 'skipped', coverage: 0, note: '未配置 VLM 模型' },
        action:      { status: 'skipped', coverage: 0, note: '未配置 VLM 模型' },
        lighting:    { status: 'skipped', coverage: 0, note: '未配置 VLM 模型' },
        ocr:         { status: 'skipped', coverage: 0, note: '未配置 VLM 模型' },
        music:       { status: 'skipped', coverage: 0, note: '未配置 VLM 模型' },
        risk:        { status: 'skipped', coverage: 0, note: '未配置 VLM 模型' },
        prompts:     { status: 'skipped', coverage: 0, note: '未配置 VLM 模型' },
        feasibility: { status: 'skipped', coverage: 0, note: '未配置 LLM 模型' },
      },
      characters: [],
      scenes: [],
      risks: [],
      ocrTexts: [],
      sampledFrames: frames,
    };

    // ── 2. VLM
    if (!models.vlm) {
      // 已是 skipped，不动
    } else if (frames.length === 0) {
      const skip = (): DimensionStatus =>
        ({ status: 'skipped', coverage: 0, modelUsed: models.vlm, note: '抽帧失败：ffmpeg 未产出图片' });
      for (const k of ['character', 'scene', 'shot', 'script', 'wardrobe', 'action', 'lighting', 'ocr', 'music', 'risk', 'prompts']) {
        report.dimensions[k] = skip();
      }
    } else {
      try {
        update(0.45, `VLM · ${models.vlm}（${frames.length} 帧 × 2 次并发）`);
        const vlm = await callVLM(ch, models.vlm, frames, {
          durationMs: video.durationMs, w: video.width, h: video.height, fps: video.fps,
        });
        report.summary = vlm.summary || '';
        report.characters = vlm.characters || [];
        report.scenes = vlm.scenes || [];
        report.shotsDesc = vlm.shotsDesc;
        report.wardrobeDesc = vlm.wardrobeDesc;
        report.actionDesc = vlm.actionDesc;
        report.lightingDesc = vlm.lightingDesc;
        report.risks = vlm.risks || [];
        report.ocrTexts = vlm.ocrTexts || [];
        report.musicMood = vlm.musicMood;
        report.scriptHintFromVisual = vlm.scriptHintFromVisual;
        report.framePrompts = vlm.framePrompts;

        const ok = (cov: number): DimensionStatus =>
          ({ status: 'ok', coverage: cov, modelUsed: models.vlm });
        report.dimensions.character = ok(0.85);
        report.dimensions.scene     = ok(0.85);
        report.dimensions.shot      = ok(0.75);
        report.dimensions.wardrobe  = ok(0.75);
        report.dimensions.action    = ok(0.7);
        report.dimensions.lighting  = ok(0.7);
        report.dimensions.script    = vlm.scriptHintFromVisual?.text
          ? ok(0.6)
          : { status: 'partial', coverage: 0.4, modelUsed: models.vlm, note: 'VLM 未给出剧情暗示' };
        report.dimensions.ocr       = (vlm.ocrTexts?.length ?? 0) > 0
          ? ok(0.8)
          : { status: 'partial', coverage: 0.3, modelUsed: models.vlm, note: '画面中未识别出明显文字' };
        report.dimensions.music     = vlm.musicMood
          ? ok(0.6)
          : { status: 'partial', coverage: 0.3, modelUsed: models.vlm, note: 'VLM 未给出音乐情绪' };
        report.dimensions.risk      = ok(0.8);
        report.dimensions.prompts   = (vlm.framePrompts?.length ?? 0) > 0
          ? ok(Math.min(1, (vlm.framePrompts!.length) / Math.max(1, frames.length)))
          : { status: 'partial', coverage: 0.2, modelUsed: models.vlm, note: 'VLM 未给出逐帧提示词' };
      } catch (err) {
        const note = errMsg(err);
        const failed = (): DimensionStatus => ({ status: 'failed', coverage: 0, modelUsed: models.vlm, note });
        for (const k of ['character', 'scene', 'shot', 'script', 'wardrobe', 'action', 'lighting', 'ocr', 'music', 'risk', 'prompts']) {
          report.dimensions[k] = failed();
        }
        logger.warn('VLM 失败', err);
      }
    }

    // ── 3. LLM 可行性推理
    if (models.llm) {
      try {
        update(0.88, `LLM · ${models.llm}`);
        const llmOut = await callLLMFeasibility(ch, models.llm, {
          summary: report.summary,
          characters: report.characters,
          scenes: report.scenes,
          shotsDesc: report.shotsDesc,
          wardrobeDesc: report.wardrobeDesc,
          actionDesc: report.actionDesc,
          lightingDesc: report.lightingDesc,
          risks: report.risks,
          ocrTexts: report.ocrTexts,
        });
        report.feasibilityHint = llmOut.feasibilityHint;
        report.dimensions.feasibility = { status: 'ok', coverage: 0.7, modelUsed: models.llm };
      } catch (err) {
        report.dimensions.feasibility = { status: 'failed', coverage: 0, modelUsed: models.llm, note: errMsg(err) };
        logger.warn('LLM 失败', err);
      }
    }

    // ── 4. 落盘
    update(0.96, '保存报告');
    await recApi.saveDiagnosis(videoId, report);

    let dimensionsOk = 0;
    const summary: Record<string, string> = {};
    for (const [k, v] of Object.entries(report.dimensions)) {
      summary[k] = v.status;
      if (v.status === 'ok') dimensionsOk++;
    }

    TaskManager.updateTask(parentTaskId, {
      status: 'completed',
      progress: 1,
      payload: { stage: '已完成', result: { dimensionsOk, summary } } as any,
    });

    return { ok: true, dimensionsOk, summary };
  }
}
