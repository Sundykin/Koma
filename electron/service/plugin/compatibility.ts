/**
 * 插件兼容性校验
 *
 * 三类检查在 pluginRuntime.activatePlugin 之前执行：
 *  1. engine.minAppVersion ≤ 当前 App 版本
 *  2. engine.sdkVersion 与运行时 SDK 同 major，且 ≤ 运行时 SDK
 *  3. manifest.scopes 全部位于 KNOWN_PLUGIN_SCOPES 白名单
 *
 * 校验失败不抛异常，由调用方决定降级策略（pluginRuntime 把不兼容插件标记为 error，
 * 不阻止其他插件继续加载）。
 */
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import type { PluginManifest } from './types';

/**
 * 已知 scope 白名单。声明未在此列表中的 scope 不会自动获权，激活时给出警告，
 * 用于在新 SDK 里捕获"声明了过时/未来权限"的插件。
 *
 * 与 frontend/src/services/plugin/PluginSandbox.ts 中的 SCOPE_DESCRIPTIONS 同步维护。
 */
export const KNOWN_PLUGIN_SCOPES: readonly string[] = [
  'settings:read',
  'settings:write',
  'projects:read',
  'projects:write',
  'prompts:override',
  'storage:limited',
  'network:external',
  'mcp:server',
  'mcp:tool',
  'mcp:resource',
  'agent:register',
  'spawn:process',
] as const;

let cachedSdkVersion: string | null = null;
let cachedAppVersion: string | null = null;

/**
 * 内置兜底 SDK 版本：与 packages/plugin-sdk/package.json 同步维护。
 *
 * **必须手动同步**：每次升级 packages/plugin-sdk/package.json 的 version 时，
 * 一并把这里的常量改成同样的值。
 *
 * 为什么需要兜底常量：
 * - cmd/builder*.json 的 files 模式里 `!packages/` 把整个 packages/ 目录排除在 asar 之外
 * - 打包后 packages/plugin-sdk/package.json 不存在 → fs.existsSync 全部失败
 * - 之前会回退到 '0.0.0' 让所有声明 sdkVersion 的插件都触发 sdk_major_mismatch 致死
 * - dev 模式下文件读取仍然优先（方便实时改 SDK 版本测试）
 */
const RUNTIME_SDK_VERSION_BAKED = '1.1.0';

/**
 * 读取运行时 SDK 版本：dev 优先文件读取（便于热改 SDK），prod 兜底常量。
 */
export function getRuntimeSdkVersion(): string {
  if (cachedSdkVersion) return cachedSdkVersion;
  const candidates = [
    path.resolve(__dirname, '../../../packages/plugin-sdk/package.json'),
    path.resolve(__dirname, '../../packages/plugin-sdk/package.json'),
    path.resolve(process.cwd(), 'packages/plugin-sdk/package.json'),
  ];
  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const json = JSON.parse(fs.readFileSync(candidate, 'utf-8')) as { version?: string };
      if (json.version) {
        cachedSdkVersion = json.version;
        return json.version;
      }
    } catch {
      // continue
    }
  }
  // packages/ 在打包配置里被 !packages/ 排掉了，这里用编译时常量兜底
  cachedSdkVersion = RUNTIME_SDK_VERSION_BAKED;
  return cachedSdkVersion;
}

export function getRuntimeAppVersion(): string {
  if (cachedAppVersion) return cachedAppVersion;
  try {
    cachedAppVersion = app.getVersion();
  } catch {
    cachedAppVersion = '0.0.0';
  }
  return cachedAppVersion;
}

/** semver 比较（仅支持 "x.y.z" 形式；额外段忽略）。返回正/0/负。 */
function compareSemver(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .split('.')
      .slice(0, 3)
      .map((part) => Number(part.replace(/[^\d].*$/, '')) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

export interface CompatibilityIssue {
  code: 'app_too_old' | 'sdk_major_mismatch' | 'sdk_too_new' | 'unknown_scope';
  message: string;
}

export interface CompatibilityReport {
  fatal: CompatibilityIssue[];
  warnings: CompatibilityIssue[];
}

export interface RuntimeVersions {
  appVersion: string;
  sdkVersion: string;
}

export function validatePluginCompatibility(
  manifest: PluginManifest,
  runtime: RuntimeVersions = { appVersion: getRuntimeAppVersion(), sdkVersion: getRuntimeSdkVersion() },
): CompatibilityReport {
  const fatal: CompatibilityIssue[] = [];
  const warnings: CompatibilityIssue[] = [];

  const minApp = manifest.engine?.minAppVersion;
  if (minApp && compareSemver(runtime.appVersion, minApp) < 0) {
    // minAppVersion 是建议提示，不构成硬兼容性边界（真正的 API 契约由 sdkVersion 守护）。
    // 现实场景：插件作者可能用模板里的占位版本，未对每个发布精确更新。
    // 不阻断激活，仅 warn 让插件作者/用户感知。
    warnings.push({
      code: 'app_too_old',
      message: `plugin "${manifest.id}" suggests app >= ${minApp}, current ${runtime.appVersion}; activation continues but plugin may not work as intended`,
    });
  }

  const pluginSdk = manifest.engine?.sdkVersion;
  if (pluginSdk) {
    const pluginMajor = Number(pluginSdk.split('.')[0]) || 0;
    const runtimeMajor = Number(runtime.sdkVersion.split('.')[0]) || 0;
    if (pluginMajor !== runtimeMajor) {
      fatal.push({
        code: 'sdk_major_mismatch',
        message: `plugin "${manifest.id}" sdkVersion ${pluginSdk} incompatible with runtime SDK ${runtime.sdkVersion} (major mismatch)`,
      });
    } else if (compareSemver(pluginSdk, runtime.sdkVersion) > 0) {
      fatal.push({
        code: 'sdk_too_new',
        message: `plugin "${manifest.id}" sdkVersion ${pluginSdk} is newer than runtime SDK ${runtime.sdkVersion}`,
      });
    }
  }

  const scopes = manifest.scopes ?? [];
  for (const scope of scopes) {
    if (!KNOWN_PLUGIN_SCOPES.includes(scope)) {
      warnings.push({
        code: 'unknown_scope',
        message: `plugin "${manifest.id}" declares unknown scope "${scope}"`,
      });
    }
  }

  return { fatal, warnings };
}

export function formatCompatibilityErrors(report: CompatibilityReport): string {
  return report.fatal.map((item) => `[${item.code}] ${item.message}`).join('; ');
}

/**
 * Scope 强制：检查 manifest.scopes 是否包含所需权限。
 * 不在 manifest 中的能力一律拒绝（即使 scope 在白名单）。
 *
 * 与前端 frontend/src/services/plugin/PluginSandbox.ts 的 hasScope 行为一致，
 * 但 Electron 端需在 fs/spawn/net.fetch 入口主动调用此函数。
 */
export function requirePluginScope(
  manifest: PluginManifest,
  scope: string,
  operation: string,
): void {
  if (!manifest.scopes?.includes(scope)) {
    throw new Error(
      `[plugin:${manifest.id}] denied "${operation}": missing required scope "${scope}"`,
    );
  }
}

/**
 * 必填字段校验。loadPlugin 在 require backend module 之前执行，
 * 失败则插件不会进入 plugins map（保持 'installed' 之外的状态由调用方决定）。
 *
 * 检查项：
 *  - id / name / version / category / entry 存在
 *  - category=provider 必须有 entry.backend 或 entry.frontend，且必须有 providerMeta.channelType
 *  - category=mcp 必须有 entry.backend，且必须有 mcpMeta.transport
 *  - category=agent 必须有 entry.backend
 *  - category=global 必须有 entry.frontend，且必须有 globalMeta.entryRoute
 *  - engine.sdkVersion / minAppVersion 应当存在（若缺则 warn）
 */
export interface ManifestValidationResult {
  errors: string[];
  warnings: string[];
}

export function validateManifestShape(manifest: PluginManifest): ManifestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!manifest.id) errors.push('manifest.id is required');
  if (!manifest.name) errors.push('manifest.name is required');
  if (!manifest.version) errors.push('manifest.version is required');
  if (!manifest.category) errors.push('manifest.category is required');
  if (!manifest.entry || (typeof manifest.entry === 'object' && Object.keys(manifest.entry).length === 0)) {
    errors.push('manifest.entry must declare at least one of {backend,frontend}');
  }

  if (!manifest.engine?.sdkVersion) warnings.push('manifest.engine.sdkVersion missing — compatibility check will be skipped');
  if (!manifest.engine?.minAppVersion) warnings.push('manifest.engine.minAppVersion missing — app version check will be skipped');

  switch (manifest.category) {
    case 'provider': {
      if (!manifest.entry?.backend && !manifest.entry?.frontend) {
        errors.push('provider plugin must declare entry.backend or entry.frontend');
      }
      if (!manifest.providerMeta?.channelType) {
        errors.push('provider plugin must declare providerMeta.channelType');
      }
      break;
    }
    case 'mcp': {
      if (!manifest.entry?.backend) {
        errors.push('mcp plugin must declare entry.backend');
      }
      if (!manifest.mcpMeta?.transport) {
        errors.push('mcp plugin must declare mcpMeta.transport');
      }
      break;
    }
    case 'agent': {
      if (!manifest.entry?.backend) {
        errors.push('agent plugin must declare entry.backend');
      }
      break;
    }
    case 'global': {
      if (!manifest.entry?.frontend) {
        errors.push('global plugin must declare entry.frontend');
      }
      if (!manifest.globalMeta?.entryRoute) {
        errors.push('global plugin must declare globalMeta.entryRoute');
      }
      break;
    }
    case 'tool': {
      if (!manifest.entry?.frontend) {
        errors.push('tool plugin must declare entry.frontend');
      }
      break;
    }
    default:
      errors.push(`unknown manifest.category: ${manifest.category}`);
  }

  return { errors, warnings };
}
