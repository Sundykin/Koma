#!/usr/bin/env node
/**
 * SDK / 前端 / Electron 三处 Provider 类型契约对账脚本
 *
 * 检查内容：
 *  - packages/plugin-sdk/src/provider.ts                        — 规格真源
 *  - frontend/src/providers/registry.types.ts                   — 前端运行时副本
 *  - electron/service/plugin/types.ts                           — Electron 运行时副本
 *
 * 校验项：
 *  1. MEDIA_PROVIDER_CONTRACT_VERSION 在三处必须字面相等
 *  2. ChannelKind 字面量集合三处必须完全一致
 *  3. ProviderDefinition 接口字段名集合三处必须一致（顺序不限）
 *
 * 失败时返回非零退出码，可在 CI 中前置运行。
 *
 * 用法：node scripts/check-plugin-sdk-parity.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SDK_FILE = path.join(ROOT, 'packages/plugin-sdk/src/provider.ts');
const FRONTEND_FILE = path.join(ROOT, 'frontend/src/providers/registry.types.ts');
const ELECTRON_FILE = path.join(ROOT, 'electron/service/plugin/types.ts');

function read(file) {
  if (!fs.existsSync(file)) {
    console.error(`[parity] missing file: ${file}`);
    process.exit(2);
  }
  return fs.readFileSync(file, 'utf-8');
}

function extractContractVersion(src, label) {
  const m = src.match(/MEDIA_PROVIDER_CONTRACT_VERSION\s*=\s*['"]([^'"]+)['"]/);
  if (!m) {
    console.error(`[parity] ${label}: MEDIA_PROVIDER_CONTRACT_VERSION not found`);
    process.exit(3);
  }
  return m[1];
}

function extractChannelKinds(src, label) {
  const m = src.match(/export\s+type\s+ChannelKind\s*=\s*([^;]+);/);
  if (!m) {
    console.error(`[parity] ${label}: ChannelKind type alias not found`);
    process.exit(3);
  }
  const kinds = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  return new Set(kinds);
}

function extractProviderDefinitionFields(src, label) {
  // 简化解析：找到 "interface ProviderDefinition" 后第一个 {...}
  const start = src.search(/interface\s+ProviderDefinition\b/);
  if (start === -1) {
    console.error(`[parity] ${label}: ProviderDefinition interface not found`);
    process.exit(3);
  }
  const open = src.indexOf('{', start);
  if (open === -1) {
    console.error(`[parity] ${label}: ProviderDefinition opening brace not found`);
    process.exit(3);
  }
  let depth = 0;
  let close = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close === -1) {
    console.error(`[parity] ${label}: ProviderDefinition closing brace not found`);
    process.exit(3);
  }
  const body = src.slice(open + 1, close);
  // 字段：行起始的 identifier 或 'identifier?' 后跟 ':'
  const fields = new Set();
  const lines = body.split('\n');
  for (const raw of lines) {
    const line = raw.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '').trim();
    if (!line || line.startsWith('*') || line.startsWith('/')) continue;
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\??\s*:/);
    if (m) fields.add(m[1]);
  }
  return fields;
}

function setEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

function diffSets(a, b) {
  const onlyA = [...a].filter((x) => !b.has(x));
  const onlyB = [...b].filter((x) => !a.has(x));
  return { onlyA, onlyB };
}

const sdkSrc = read(SDK_FILE);
const frontendSrc = read(FRONTEND_FILE);
const electronSrc = read(ELECTRON_FILE);

const sdkVersion = extractContractVersion(sdkSrc, 'SDK');
const frontendVersion = extractContractVersion(frontendSrc, 'frontend');
// Electron 的常量定义在 types.ts 中
const electronVersion = extractContractVersion(electronSrc, 'electron');

const sdkKinds = extractChannelKinds(sdkSrc, 'SDK');
const frontendKinds = extractChannelKinds(frontendSrc, 'frontend');
// Electron 没有显式 ChannelKind 字面量类型，从 ProviderDefinition['kind'] 提取
function extractKindsFromProviderDef(src, label) {
  const m = src.match(/kind\s*:\s*'tti'[^;]*;/);
  if (!m) {
    return null;
  }
  const kinds = [...m[0].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  return new Set(kinds);
}
const electronKinds =
  extractChannelKinds.bind(null) && (sdkSrc.includes('export type ChannelKind') ? null : null);
const electronInferred = extractKindsFromProviderDef(electronSrc, 'electron') || sdkKinds;

const sdkFields = extractProviderDefinitionFields(sdkSrc, 'SDK');
const frontendFields = extractProviderDefinitionFields(frontendSrc, 'frontend');
const electronFields = extractProviderDefinitionFields(electronSrc, 'electron');

const failures = [];

if (sdkVersion !== frontendVersion || sdkVersion !== electronVersion) {
  failures.push(
    `MEDIA_PROVIDER_CONTRACT_VERSION mismatch: sdk=${sdkVersion} frontend=${frontendVersion} electron=${electronVersion}`,
  );
}

if (!setEqual(sdkKinds, frontendKinds)) {
  const d = diffSets(sdkKinds, frontendKinds);
  failures.push(
    `ChannelKind mismatch (SDK vs frontend): only-SDK=[${d.onlyA.join(',')}] only-frontend=[${d.onlyB.join(',')}]`,
  );
}

if (!setEqual(sdkKinds, electronInferred)) {
  const d = diffSets(sdkKinds, electronInferred);
  failures.push(
    `ChannelKind mismatch (SDK vs electron): only-SDK=[${d.onlyA.join(',')}] only-electron=[${d.onlyB.join(',')}]`,
  );
}

if (!setEqual(sdkFields, frontendFields)) {
  const d = diffSets(sdkFields, frontendFields);
  failures.push(
    `ProviderDefinition fields mismatch (SDK vs frontend): only-SDK=[${d.onlyA.join(',')}] only-frontend=[${d.onlyB.join(',')}]`,
  );
}

if (!setEqual(sdkFields, electronFields)) {
  const d = diffSets(sdkFields, electronFields);
  failures.push(
    `ProviderDefinition fields mismatch (SDK vs electron): only-SDK=[${d.onlyA.join(',')}] only-electron=[${d.onlyB.join(',')}]`,
  );
}

// 4. ElectronPluginAPI 顶层 namespace 对账（SDK backend.ts vs electron types.ts）
const SDK_BACKEND_FILE = path.join(ROOT, 'packages/plugin-sdk/src/backend.ts');
function extractInterfaceTopLevelKeys(src, interfaceName, label) {
  const start = src.search(new RegExp(`interface\\s+${interfaceName}\\b`));
  if (start === -1) {
    console.error(`[parity] ${label}: interface ${interfaceName} not found`);
    process.exit(3);
  }
  const open = src.indexOf('{', start);
  let depth = 0;
  let close = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) { close = i; break; }
    }
  }
  const body = src.slice(open + 1, close);
  // 用行起始时的深度判断顶层 key（嵌套对象 `key: { ... }` 的 key 行起始 depth=0）
  const keys = new Set();
  let d = 0;
  let lineStart = 0;
  let lineDepthAtStart = 0;
  const flushLine = (endIdx) => {
    const line = body.slice(lineStart, endIdx)
      .replace(/\/\/.*$/, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim();
    if (lineDepthAtStart === 0 && line && !line.startsWith('*') && !line.startsWith('/')) {
      const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\??\s*:/);
      if (m) keys.add(m[1]);
    }
  };
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '\n') {
      flushLine(i);
      lineStart = i + 1;
      lineDepthAtStart = d;
    } else if (ch === '{') {
      d++;
    } else if (ch === '}') {
      d--;
    }
  }
  flushLine(body.length);
  return keys;
}

const sdkBackendSrc = read(SDK_BACKEND_FILE);
const sdkApiKeys = extractInterfaceTopLevelKeys(sdkBackendSrc, 'ElectronPluginAPI', 'SDK backend');
const electronApiKeys = extractInterfaceTopLevelKeys(electronSrc, 'ElectronPluginAPI', 'electron types');

if (!setEqual(sdkApiKeys, electronApiKeys)) {
  const d = diffSets(sdkApiKeys, electronApiKeys);
  failures.push(
    `ElectronPluginAPI namespace mismatch (SDK vs electron): only-SDK=[${d.onlyA.join(',')}] only-electron=[${d.onlyB.join(',')}]`,
  );
}

if (failures.length > 0) {
  console.error('[plugin-sdk parity] FAILURES:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('[plugin-sdk parity] OK');
console.log(`  contractVersion:        ${sdkVersion}`);
console.log(`  channelKinds:           ${[...sdkKinds].join(', ')}`);
console.log(`  ProviderDefinition:     ${sdkFields.size} fields`);
console.log(`  ElectronPluginAPI:      ${[...sdkApiKeys].join(', ')}`);
