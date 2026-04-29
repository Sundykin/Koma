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
 * 读取打包后 SDK package.json 中的版本，作为运行时 SDK 版本基线。
 * 失败时回退到 '0.0.0'，让所有 sdkVersion 校验都给出明确兼容性提示。
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
  cachedSdkVersion = '0.0.0';
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
    fatal.push({
      code: 'app_too_old',
      message: `plugin "${manifest.id}" requires app >= ${minApp}, current ${runtime.appVersion}`,
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
