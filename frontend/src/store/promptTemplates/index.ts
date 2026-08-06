/**
 * Prompt 模板管理：加载/保存/合并/校验/渲染
 * 类型见 ./types，变量体系见 ./variables，内置模板内容见 ./defaults
 */
import { electronService } from '../../services/electronService';
import { getStorageConfig, initStorageConfig } from '../storageConfig';
import { loadSettings, saveSettings } from '../globalStore';
import { STORAGE_KEYS } from '../../constants/storageKeys';
import type { AppSettings } from '../../types';
import {
  COMMON_VARIABLE_DEFINITIONS,
  GLOBAL_INJECTION_MAP,
  GLOBAL_TEMPLATE_TYPES,
  INTRINSIC_GLOBAL_VARIABLE_NAMES,
  getRequiredVariableNames,
  getVariableNames,
} from './variables';
import { DEFAULT_TEMPLATES } from './defaults';
import { createLogger } from '../logger';
import type {
  PromptTemplate,
  PromptTemplateCategory,
  PromptTemplateOverride,
  PromptTemplateType,
  PromptTemplateValidationResult,
  ResolvedPromptTemplate,
} from './types';

const logger = createLogger('PromptTemplate');
export * from './types';
export * from './variables';
export * from './defaults';

// ========== 存储路径 ==========

async function getTemplatesPath(): Promise<string> {
  const config = getStorageConfig() || (await initStorageConfig());
  return `${config.rootPath}/prompt-templates.json`;
}

const PLACEHOLDER_REGEX = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

function extractTemplateVariables(templateText: string): string[] {
  const matches = Array.from(templateText.matchAll(PLACEHOLDER_REGEX), match => match[1]);
  return Array.from(new Set(matches)).sort();
}

function buildValidationResult(
  type: string,
  templateText: string
): PromptTemplateValidationResult {
  // 默认模板：按其声明的 variables 校验
  // 自定义模板（type 不在 DEFAULT_TEMPLATES 中）：不做严格白名单校验，视为合法
  const defaultTemplate = (DEFAULT_TEMPLATES as Record<string, PromptTemplate>)[type];
  if (!defaultTemplate) {
    return { isValid: true, unknownVariables: [], missingRequiredVariables: [] };
  }
  const allowedVariables = getVariableNames(defaultTemplate.variables);
  const requiredVariables = getRequiredVariableNames(defaultTemplate.variables);
  const usedVariables = extractTemplateVariables(templateText);
  // 内建全局注入变量（globalPositivePrefix 等）允许在任何模板中直接使用，
  // 不要求模板自身在 variables 列表声明
  const unknownVariables = usedVariables.filter(
    variable => !allowedVariables.includes(variable) && !INTRINSIC_GLOBAL_VARIABLE_NAMES.has(variable)
  );
  const missingRequiredVariables = requiredVariables.filter(variable => !usedVariables.includes(variable));

  return {
    isValid: unknownVariables.length === 0 && missingRequiredVariables.length === 0,
    unknownVariables,
    missingRequiredVariables,
  };
}

function normalizePromptTemplateOverride(value: unknown): PromptTemplateOverride | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as { template?: unknown; updatedAt?: unknown };
  if (typeof candidate.template !== 'string') {
    return undefined;
  }

  return {
    template: candidate.template,
    updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : Date.now(),
  };
}

function normalizeLegacyPromptTemplates(
  data: unknown
): Partial<Record<PromptTemplateType, PromptTemplateOverride>> {
  const normalized: Partial<Record<PromptTemplateType, PromptTemplateOverride>> = {};
  if (!data || typeof data !== 'object') {
    return normalized;
  }

  for (const [key, value] of Object.entries(data)) {
    if (!(key in DEFAULT_TEMPLATES)) {
      continue;
    }
    const normalizedValue = normalizePromptTemplateOverride(value);
    if (normalizedValue) {
      normalized[key as PromptTemplateType] = normalizedValue;
    }
  }

  return normalized;
}

function mergePromptTemplateOverrides(
  current: Partial<Record<PromptTemplateType, PromptTemplateOverride>>,
  incoming: Partial<Record<PromptTemplateType, PromptTemplateOverride>>
): Partial<Record<PromptTemplateType, PromptTemplateOverride>> {
  const merged = { ...current };
  for (const [key, value] of Object.entries(incoming)) {
    if (!value) {
      continue;
    }
    if (!merged[key as PromptTemplateType]) {
      merged[key as PromptTemplateType] = value;
    }
  }
  return merged;
}

async function persistPromptTemplateOverrides(
  settings: AppSettings,
  overrides: Partial<Record<PromptTemplateType, PromptTemplateOverride>>
): Promise<void> {
  await saveSettings({
    ...settings,
    promptTemplates: overrides,
  });
}

async function migrateLegacyPromptTemplates(
  settings?: AppSettings
): Promise<AppSettings> {
  const currentSettings = settings || await loadSettings();
  let overrides = normalizeLegacyPromptTemplates(currentSettings.promptTemplates);
  let shouldPersist = Object.keys(overrides).length !== Object.keys(currentSettings.promptTemplates || {}).length;

  if (!electronService.isElectron()) {
    try {
      const legacyData = localStorage.getItem(STORAGE_KEYS.PROMPT_TEMPLATES);
      if (legacyData) {
        const legacyOverrides = normalizeLegacyPromptTemplates(JSON.parse(legacyData));
        const mergedOverrides = mergePromptTemplateOverrides(overrides, legacyOverrides);
        if (JSON.stringify(mergedOverrides) !== JSON.stringify(overrides)) {
          overrides = mergedOverrides;
          shouldPersist = true;
        }
        localStorage.removeItem(STORAGE_KEYS.PROMPT_TEMPLATES);
      }
    } catch {
      // ignore
    }

    if (shouldPersist) {
      await persistPromptTemplateOverrides(currentSettings, overrides);
      return { ...currentSettings, promptTemplates: overrides };
    }

    return { ...currentSettings, promptTemplates: overrides };
  }

  try {
    const path = await getTemplatesPath();
    const exists = await electronService.fs.exists(path);
    if (exists) {
      const data = await electronService.fs.readFile(path);
      const legacyOverrides = normalizeLegacyPromptTemplates(JSON.parse(data));
      const mergedOverrides = mergePromptTemplateOverrides(overrides, legacyOverrides);
      if (JSON.stringify(mergedOverrides) !== JSON.stringify(overrides)) {
        overrides = mergedOverrides;
        shouldPersist = true;
      }

      if (shouldPersist) {
        await persistPromptTemplateOverrides(currentSettings, overrides);
      }

      await electronService.fs.remove(path);
      return { ...currentSettings, promptTemplates: overrides };
    }
  } catch {
    // ignore
  }

  if (shouldPersist) {
    await persistPromptTemplateOverrides(currentSettings, overrides);
  }

  return { ...currentSettings, promptTemplates: overrides };
}

async function loadPromptTemplateOverrides(): Promise<Partial<Record<PromptTemplateType, PromptTemplateOverride>>> {
  const settings = await migrateLegacyPromptTemplates();
  return normalizeLegacyPromptTemplates(settings.promptTemplates);
}

function assertTemplateValidation(
  type: PromptTemplateType,
  templateText: string
): void {
  const validation = buildValidationResult(type, templateText);
  if (!validation.isValid) {
    const errors: string[] = [];
    if (validation.unknownVariables.length > 0) {
      errors.push(`未知变量: ${validation.unknownVariables.join(', ')}`);
    }
    if (validation.missingRequiredVariables.length > 0) {
      errors.push(`缺失必需变量: ${validation.missingRequiredVariables.join(', ')}`);
    }
    throw new Error(errors.join('；'));
  }
}

// ========== 模板管理函数 ==========

/**
 * 加载所有模板（默认 + override 覆盖 + 用户新增的 custom 自定义）
 *
 * 三层优先级（覆盖顺序，后者覆盖前者）：
 *   1. DEFAULT_TEMPLATES               内置默认模板
 *   2. settings.promptTemplates        默认模板的 override（同 id 改写 template 字段）
 *   3. settings.customPromptTemplates  用户手动新建的全新模板（id 不在 union 中）
 *
 * 返回的 Record 键类型放宽为 string，以容纳 custom 模板的任意 id。
 */
export async function loadPromptTemplates(): Promise<Record<string, PromptTemplate>> {
  const templates: Record<string, PromptTemplate> = { ...DEFAULT_TEMPLATES };

  // override 层：仅修改默认模板的 template 内容，类型仍是 PromptTemplateType
  const overrides = await loadPromptTemplateOverrides();
  for (const [key, value] of Object.entries(overrides)) {
    if (!value) continue;
    const templateKey = key as PromptTemplateType;
    if (!templates[templateKey]) continue; // 旧 override 引用了已删除的默认模板，跳过
    templates[templateKey] = {
      ...templates[templateKey],
      template: value.template,
      isCustom: true,
    };
  }

  // custom 层：用户新增的全新模板
  const customs = await loadCustomPromptTemplates();
  for (const cp of customs) {
    if (templates[cp.id]) {
      // 防御：custom id 与默认 id 冲突时不覆盖默认模板
      logger.warn(`自定义模板 id "${cp.id}" 与默认模板冲突，已忽略 custom`);
      continue;
    }
    templates[cp.id] = {
      id: cp.id as PromptTemplateType, // 实际上是 custom id，类型上借用 union（不影响运行）
      name: cp.name,
      category: cp.category as PromptTemplateCategory,
      description: cp.description,
      template: cp.template,
      variables: (cp.variables || []).map(v => ({
        name: v.name,
        ...(COMMON_VARIABLE_DEFINITIONS[v.name] || {
          label: v.name,
          description: `${v.name} 变量`,
          format: '字符串',
          required: v.required ?? true,
        }),
        required: v.required ?? true,
      })),
      isCustom: true,
    };
  }

  return templates;
}

/**
 * 获取单个模板（支持默认模板 + 自定义模板的任意 id）
 */
export async function getPromptTemplate(type: string): Promise<PromptTemplate> {
  const templates = await loadPromptTemplates();
  return templates[type];
}

/**
 * 保存"覆盖默认模板"的内容（仅改写 template 字段，类型仍是默认 union）
 */
export async function saveCustomTemplate(template: PromptTemplate): Promise<void> {
  assertTemplateValidation(template.id, template.template);
  const settings = await migrateLegacyPromptTemplates();
  const overrides = normalizeLegacyPromptTemplates(settings.promptTemplates);
  overrides[template.id] = {
    template: template.template,
    updatedAt: Date.now(),
  };
  await persistPromptTemplateOverrides(settings, overrides);
}

// ========== 用户自定义新模板（全新 id，不属于 union） ==========

export interface CreateCustomTemplateInput {
  id: string;                  // 全新 id；不能与默认模板 / 已有 custom id 冲突
  name: string;
  category: PromptTemplateCategory;
  description: string;
  template: string;
  variables?: Array<{ name: string; required?: boolean }>;
}

const CUSTOM_ID_PATTERN = /^[a-z][a-z0-9_]{2,63}$/;

/** 加载所有用户自定义新模板 */
export async function loadCustomPromptTemplates(): Promise<NonNullable<AppSettings['customPromptTemplates']>> {
  const settings = await loadSettings();
  return Array.isArray(settings.customPromptTemplates) ? settings.customPromptTemplates : [];
}

/** 新建用户自定义模板 */
export async function createCustomPromptTemplate(input: CreateCustomTemplateInput): Promise<void> {
  if (!CUSTOM_ID_PATTERN.test(input.id)) {
    throw new Error('自定义模板 id 必须是 3-64 位的小写字母 / 数字 / 下划线，且以字母开头');
  }
  if ((Object.keys(DEFAULT_TEMPLATES) as string[]).includes(input.id)) {
    throw new Error(`id "${input.id}" 与内置模板冲突，请换一个`);
  }
  const settings = await loadSettings();
  const list = Array.isArray(settings.customPromptTemplates) ? [...settings.customPromptTemplates] : [];
  if (list.some(t => t.id === input.id)) {
    throw new Error(`id "${input.id}" 已存在`);
  }
  const now = Date.now();
  list.push({
    id: input.id,
    name: input.name,
    category: input.category,
    description: input.description,
    template: input.template,
    variables: input.variables,
    createdAt: now,
    updatedAt: now,
  });
  await saveSettings({ ...settings, customPromptTemplates: list });
}

/** 更新用户自定义模板（按 id 全量替换字段，不存在则报错） */
export async function updateCustomPromptTemplate(
  id: string,
  patch: Partial<Omit<CreateCustomTemplateInput, 'id'>>,
): Promise<void> {
  const settings = await loadSettings();
  const list = Array.isArray(settings.customPromptTemplates) ? [...settings.customPromptTemplates] : [];
  const idx = list.findIndex(t => t.id === id);
  if (idx < 0) throw new Error(`自定义模板 "${id}" 不存在`);
  list[idx] = {
    ...list[idx],
    ...patch,
    updatedAt: Date.now(),
  };
  await saveSettings({ ...settings, customPromptTemplates: list });
}

/** 删除用户自定义模板 */
export async function deleteCustomPromptTemplate(id: string): Promise<void> {
  const settings = await loadSettings();
  const list = Array.isArray(settings.customPromptTemplates) ? settings.customPromptTemplates : [];
  const next = list.filter(t => t.id !== id);
  await saveSettings({ ...settings, customPromptTemplates: next });
}

/**
 * 重置模板为默认
 */
export async function resetTemplate(type: PromptTemplateType): Promise<PromptTemplate> {
  const settings = await migrateLegacyPromptTemplates();
  const overrides = normalizeLegacyPromptTemplates(settings.promptTemplates);
  delete overrides[type];
  await persistPromptTemplateOverrides(settings, overrides);
  return DEFAULT_TEMPLATES[type];
}

/**
 * 重置所有模板为默认
 */
export async function resetAllTemplates(): Promise<void> {
  const settings = await migrateLegacyPromptTemplates();
  await persistPromptTemplateOverrides(settings, {});
}

/**
 * 获取默认模板
 */
export function getDefaultTemplate(type: PromptTemplateType): PromptTemplate {
  return DEFAULT_TEMPLATES[type];
}

/**
 * 获取所有默认模板
 */
export function getAllDefaultTemplates(): Record<PromptTemplateType, PromptTemplate> {
  return { ...DEFAULT_TEMPLATES };
}

/**
 * 默认模板 ID 集合（用于 UI 区分"用户自定义新建"与"用户改写默认"）
 */
export function getDefaultTemplateIds(): readonly string[] {
  return Object.keys(DEFAULT_TEMPLATES);
}

/** 判断给定 id 是否为默认模板 */
export function isDefaultTemplateId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(DEFAULT_TEMPLATES, id);
}

export function validatePromptTemplateDraft(
  type: PromptTemplateType,
  templateText: string
): PromptTemplateValidationResult {
  return buildValidationResult(type, templateText);
}

/**
 * 填充模板变量
 */
export function fillTemplate(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`{{\\s*${escapedKey}\\s*}}`, 'g'), value);
  }
  return result;
}

/**
 * 收集需要自动注入到当前模板的全局约束变量。
 *
 * 仅当目标模板里实际出现 {{globalXxx}} 占位符时才会拉取对应 global_* 模板内容，
 * 避免对不需要全局约束的模板（例如纯系统提示）造成无谓负担。
 *
 * 调用方传入的同名变量会覆盖自动注入的内容（手动优先）。
 */
async function collectGlobalInjections(
  template: PromptTemplate,
  callerVariables: Record<string, string>,
  templates: Record<PromptTemplateType, PromptTemplate>
): Promise<Record<string, string>> {
  if (GLOBAL_TEMPLATE_TYPES.has(template.id)) {
    return {};
  }
  const injections: Record<string, string> = {};
  const placeholders = new Set(extractTemplateVariables(template.template));
  for (const [varName, sourceType] of Object.entries(GLOBAL_INJECTION_MAP)) {
    if (Object.prototype.hasOwnProperty.call(callerVariables, varName)) {
      // 调用方显式传值时尊重调用方
      continue;
    }
    if (!placeholders.has(varName)) {
      continue;
    }
    const sourceTemplate = templates[sourceType];
    if (sourceTemplate) {
      injections[varName] = sourceTemplate.template.trim();
    }
  }
  return injections;
}

// 让函数能接受 PromptTemplateType 字面量（默认模板）和任意 string（自定义模板）id，
// 同时保留对 PromptTemplateType 字面量的类型受检（避免拼错默认模板名）。
export type PromptTemplateId = PromptTemplateType | (string & {});

export async function resolvePromptTemplate(
  type: PromptTemplateId,
  variables: Record<string, string>
): Promise<ResolvedPromptTemplate> {
  const allTemplates = await loadPromptTemplates();
  const template = allTemplates[type];
  if (!template) {
    throw new Error(`提示词模板 "${type}" 不存在（既非默认模板，也未在自定义模板中定义）`);
  }
  const variableNames = getVariableNames(template.variables);
  const requiredVariableNames = getRequiredVariableNames(template.variables);

  // 自动注入全局约束（仅在模板包含对应占位符时生效）
  const globalInjections = await collectGlobalInjections(template, variables, allTemplates);
  const mergedVariables = { ...globalInjections, ...variables };

  // 运行时仅警告模板校验问题，不阻断执行
  const validation = buildValidationResult(type, template.template);
  if (!validation.isValid) {
    const warnings: string[] = [];
    if (validation.unknownVariables.length > 0) {
      warnings.push(`模板中存在未声明变量: ${validation.unknownVariables.join(', ')}`);
    }
    if (validation.missingRequiredVariables.length > 0) {
      warnings.push(`模板中缺少变量占位符: ${validation.missingRequiredVariables.join(', ')}`);
    }
    logger.warn(`模板 ${type} 校验警告: ${warnings.join('；')}`);
  }

  // 过滤掉模板未声明的多余变量（内建全局变量除外）；仅警告，不阻断
  const unknownVariables = Object.keys(mergedVariables).filter(
    variable => !variableNames.includes(variable) && !INTRINSIC_GLOBAL_VARIABLE_NAMES.has(variable)
  );
  if (unknownVariables.length > 0) {
    logger.warn(`模板 ${type} 收到未声明变量（已忽略）: ${unknownVariables.join(', ')}`);
  }
  const filteredVariables = Object.fromEntries(
    Object.entries(mergedVariables).filter(
      ([key]) => variableNames.includes(key) || INTRINSIC_GLOBAL_VARIABLE_NAMES.has(key)
    )
  );

  const missingVariables = requiredVariableNames.filter((variable) => {
    if (!Object.prototype.hasOwnProperty.call(filteredVariables, variable)) {
      return true;
    }
    return typeof filteredVariables[variable] !== 'string';
  });
  if (missingVariables.length > 0) {
    throw new Error(`模板 ${type} 缺少运行时变量: ${missingVariables.join(', ')}`);
  }

  const prompt = fillTemplate(template.template, filteredVariables);
  const unresolvedVariables = extractTemplateVariables(prompt);
  let finalPrompt = prompt;
  if (unresolvedVariables.length > 0) {
    logger.warn(`模板 ${type} 仍有未替换变量（已清除）: ${unresolvedVariables.join(', ')}`);
    // 清除未替换的 {{ variable }} 占位符，避免阻断生成流程
    finalPrompt = prompt.replace(/\{\{\s*\w+\s*\}\}/g, '');
  }

  return {
    template,
    prompt: finalPrompt,
    source: template.isCustom ? 'custom' : 'default',
  };
}

export default {
  loadPromptTemplates,
  getPromptTemplate,
  saveCustomTemplate,
  resetTemplate,
  resetAllTemplates,
  getDefaultTemplate,
  getAllDefaultTemplates,
  validatePromptTemplateDraft,
  fillTemplate,
  resolvePromptTemplate,
};
