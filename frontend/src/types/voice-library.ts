/**
 * 全局音色库类型。
 *
 * 数据来源：
 *  - 内置 Koma 46 个音色 → builtin 分类（4 个，只读），运行时从 KOMA_TTS_VOICES 注入
 *  - 用户上传 / 自定义 → custom 分类，持久化到 ~/.koma/voiceLibrary/library.json + samples/
 *
 * Character.voiceId 存的是 VoiceProfile.id（不是 providerVoiceId），
 * 编译时再通过 voiceResolver 解析为真正的 provider voice id。
 *
 * 预留：library.json 顶层有 _version + _reserved 字段位，供后续"团队分享 / 导入导出"扩展，
 * 当前 UI 不暴露这两个能力。
 */

export type VoiceCategorySource = 'builtin' | 'custom';
export type VoiceProfileSource = 'builtin' | 'custom-sample';

export interface VoiceCategory {
  id: string;
  name: string;
  source: VoiceCategorySource;
  order: number;
}

export interface VoiceProfile {
  id: string; // 全局唯一 nanoid（builtin 用 `builtin-koma-<voiceId>`）
  categoryId: string;
  name: string;
  source: VoiceProfileSource;
  /** 上游 provider 真正的 voice id（Koma 是 'cherry'/'aiden' 等；自定义可留空待克隆） */
  providerVoiceId?: string;
  /** sample 相对路径（builtin 是 'koma-builtin://<KomaSampleFile>'；custom 是 'samples/<id>.<ext>'） */
  sampleFile?: string;
  language?: string;
  gender?: 'male' | 'female' | 'neutral';
  note?: string;
  createdAt: number;
  updatedAt: number;
}

/** 合并后的运行时快照（builtin + custom） */
export interface VoiceLibrarySnapshot {
  categories: VoiceCategory[];
  profiles: VoiceProfile[];
}

/** 主进程持久化的纯 custom 部分 manifest */
export interface CustomVoiceLibraryManifest {
  _version: 1;
  categories: Array<Pick<VoiceCategory, 'id' | 'name' | 'order'>>;
  profiles: Array<{
    id: string;
    categoryId: string;
    name: string;
    providerVoiceId?: string;
    sampleFile?: string;
    language?: string;
    gender?: 'male' | 'female' | 'neutral';
    note?: string;
    createdAt: number;
    updatedAt: number;
  }>;
}

export const KOMA_BUILTIN_CATEGORY_PREFIX = 'builtin-koma-';

export function isBuiltinVoiceCategoryId(id: string): boolean {
  return id.startsWith(KOMA_BUILTIN_CATEGORY_PREFIX);
}

export function isBuiltinVoiceProfileId(id: string): boolean {
  return id.startsWith('builtin-koma-voice-');
}
