/**
 * 二创工作台 — 静态常量
 *
 * 当前阶段：客户端**不**持有任何样本数据，所有 reports / sourceMedias / jobs
 * 初始化为空数组；真实数据由用户操作（拖入文件 → new-api 解析）产生。
 *
 * 本文件只保留 label / 颜色等 **常量映射**，UI 组件渲染时用。
 */
import type { DiagnosticReport, SourceMedia, ModificationPlan, CloudJob, DimensionKind, ModificationKind } from './types';

export const mockReports: DiagnosticReport[] = [];
export const mockSourceMedias: SourceMedia[] = [];
export const mockPlans: ModificationPlan[] = [];
export const mockJobs: CloudJob[] = [];

export const DIMENSION_LABEL: Record<DimensionKind, string> = {
  meta: '元数据',
  character: '人物表',
  scene: '场景表',
  shot: '镜头表',
  script: '台词表',
  wardrobe: '服装表',
  action: '动作表',
  lighting: '光照表',
  ocr: '屏显文字',
  music: '音乐情绪',
  risk: '风险标记',
  feasibility: '修改可行性',
  prompts: '逐帧提示词',
};

export const MODIFICATION_LABEL: Record<ModificationKind, string> = {
  face_swap: '换脸',
  body_reshape: '体型替换',
  wardrobe: '服装替换',
  aspect_ratio: '横竖屏适配',
  language_dub: '多语言本地化',
  stylization: '风格化重生成',
};
