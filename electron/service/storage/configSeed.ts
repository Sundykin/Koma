/**
 * 配置域种子数据
 *
 * 首次建库或 schema 升级后调用，幂等写入内置默认值：
 *   - Prompt 模板（is_builtin=1）
 *   - 视觉风格预设（is_builtin=1）
 *
 * 原则：
 *   - 使用 INSERT OR IGNORE，已存在 id 不覆盖。
 *   - 用户编辑过的模板（user_modified_at IS NOT NULL）始终保留，不回滚。
 *   - 默认条目列表由 `BUILTIN_PROMPT_TEMPLATES` / `BUILTIN_VISUAL_STYLES` 提供；
 *     在 M5 将前端 DEFAULT_TEMPLATES 迁入后端时填充完整内容，
 *     目前保留空数组，表结构与流程先行就绪。
 */
import type Database from 'better-sqlite3';

export interface BuiltinPromptTemplate {
  id: string;
  type: string;
  name: string;
  description?: string;
  template: string;
  variables: Array<Record<string, unknown>>;
}

export interface BuiltinVisualStyle {
  id: string;
  name: string;
  description?: string;
  tti_prefix?: string;
  llm_suffix?: string;
  sort_order?: number;
}

/**
 * 内置 Prompt 模板清单
 * TODO(M5): 将 frontend/src/store/promptTemplates.ts 的 DEFAULT_TEMPLATES 迁入这里。
 */
export const BUILTIN_PROMPT_TEMPLATES: BuiltinPromptTemplate[] = [];

/**
 * 内置视觉风格预设清单
 * TODO(M5): 将前端 defaultVisualStyles 常量迁入这里。
 */
export const BUILTIN_VISUAL_STYLES: BuiltinVisualStyle[] = [];

export function seedConfigDefaults(db: Database.Database): void {
  const now = Date.now();

  if (BUILTIN_PROMPT_TEMPLATES.length > 0) {
    const insertTpl = db.prepare(`
      INSERT OR IGNORE INTO prompt_templates
        (id, type, name, description, template, variables_json, is_builtin, user_modified_at, created_at, updated_at)
      VALUES (@id, @type, @name, @description, @template, @variables_json, 1, NULL, @created_at, @updated_at)
    `);
    const insertMany = db.transaction((items: BuiltinPromptTemplate[]) => {
      for (const item of items) {
        insertTpl.run({
          id: item.id,
          type: item.type,
          name: item.name,
          description: item.description ?? null,
          template: item.template,
          variables_json: JSON.stringify(item.variables ?? []),
          created_at: now,
          updated_at: now,
        });
      }
    });
    insertMany(BUILTIN_PROMPT_TEMPLATES);
  }

  if (BUILTIN_VISUAL_STYLES.length > 0) {
    const insertStyle = db.prepare(`
      INSERT OR IGNORE INTO visual_style_presets
        (id, name, description, tti_prefix, llm_suffix, thumbnail_path, is_builtin, sort_order, created_at, updated_at)
      VALUES (@id, @name, @description, @tti_prefix, @llm_suffix, NULL, 1, @sort_order, @created_at, @updated_at)
    `);
    const insertMany = db.transaction((items: BuiltinVisualStyle[]) => {
      for (const item of items) {
        insertStyle.run({
          id: item.id,
          name: item.name,
          description: item.description ?? null,
          tti_prefix: item.tti_prefix ?? null,
          llm_suffix: item.llm_suffix ?? null,
          sort_order: item.sort_order ?? 0,
          created_at: now,
          updated_at: now,
        });
      }
    });
    insertMany(BUILTIN_VISUAL_STYLES);
  }
}
