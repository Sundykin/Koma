#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const ts = require('typescript');

const runtimePath = path.resolve(__dirname, '../electron/service/plugin/runtime.ts');
const bridgePath = path.resolve(__dirname, '../electron/service/plugin/bridge.ts');
const pluginServicePath = path.resolve(__dirname, '../electron/service/plugin.ts');
const pluginControllerPath = path.resolve(__dirname, '../electron/controller/plugin.ts');

function makeManifest(overrides) {
  return {
    id: 'com.koma.test-provider',
    name: 'Koma Test Provider',
    version: '1.0.0',
    category: 'provider',
    scopes: ['network:external'],
    entry: { backend: 'dist/backend.js' },
    providerMeta: {
      channelType: 'tti',
      capabilities: ['tti'],
    },
    ...overrides,
  };
}

function createHarness(options = {}) {
  const virtualUserData = '/virtual-user-data';
  const virtualFiles = new Map();
  if (options.legacyConfigs) {
    virtualFiles.set(
      `${virtualUserData}/provider-configs.json`,
      JSON.stringify(options.legacyConfigs, null, 2),
    );
  }

  const channelRows = [];
  const apiKeys = new Map();
  const providerDefs = new Map();
  let idCounter = 1;

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function normalizeProviderPayload(rawConfig = {}, explicitBaseUrl) {
    const providerConfig = { ...(rawConfig || {}) };
    const baseUrl = explicitBaseUrl !== undefined
      ? explicitBaseUrl
      : (typeof providerConfig.baseUrl === 'string' ? providerConfig.baseUrl : null);
    delete providerConfig.baseUrl;
    delete providerConfig.hasApiKey;

    let apiKey = null;
    if (typeof providerConfig.apiKey === 'string' && providerConfig.apiKey.length > 0) {
      apiKey = providerConfig.apiKey;
    }
    delete providerConfig.apiKey;

    return { baseUrl, providerConfig, apiKey };
  }

  function rowToDto(row) {
    return {
      id: row.id,
      category: row.category,
      providerType: row.providerType,
      name: row.name,
      description: row.description ?? null,
      baseUrl: row.baseUrl ?? null,
      hasApiKey: apiKeys.has(row.id),
      providerConfig: clone(row.providerConfig) || {},
      models: clone(row.models) || [],
      capabilities: clone(row.capabilities) || [],
      polling: row.polling ?? null,
      extras: clone(row.extras) || {},
      defaultModelId: row.defaultModelId ?? null,
      source: row.source,
      pluginId: row.pluginId ?? null,
      enabled: row.enabled,
      isDefault: row.isDefault,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  const channelConfigService = {
    listChannelConfigs(category) {
      const rows = category ? channelRows.filter((row) => row.category === category) : channelRows;
      return rows.map(rowToDto);
    },
    createChannelConfig(input) {
      const now = Date.now();
      const normalized = normalizeProviderPayload(input.providerConfig, input.baseUrl ?? undefined);
      const row = {
        id: input.id || `ch-${idCounter++}`,
        category: input.category,
        providerType: input.providerType,
        name: input.name,
        description: input.description ?? null,
        baseUrl: normalized.baseUrl ?? null,
        providerConfig: normalized.providerConfig,
        models: clone(input.models) || [],
        capabilities: clone(input.capabilities) || [],
        polling: input.polling ?? null,
        extras: clone(input.extras) || {},
        defaultModelId: input.defaultModelId ?? null,
        source: input.source || 'plugin',
        pluginId: input.pluginId ?? null,
        enabled: input.enabled !== undefined ? input.enabled : true,
        isDefault: input.isDefault !== undefined ? input.isDefault : false,
        sortOrder: input.sortOrder ?? 0,
        createdAt: input.createdAt ?? now,
        updatedAt: input.updatedAt ?? now,
      };
      channelRows.push(row);
      if (normalized.apiKey) {
        apiKeys.set(row.id, normalized.apiKey);
      }
      return rowToDto(row);
    },
    updateChannelConfig(id, patch) {
      const row = channelRows.find((item) => item.id === id);
      if (!row) {
        throw new Error(`channel_configs not found: ${id}`);
      }
      if (patch.baseUrl !== undefined || patch.providerConfig !== undefined) {
        const normalized = normalizeProviderPayload(patch.providerConfig ?? {}, patch.baseUrl ?? null);
        if (patch.baseUrl !== undefined) {
          row.baseUrl = normalized.baseUrl ?? null;
        }
        if (patch.providerConfig !== undefined) {
          row.providerConfig = normalized.providerConfig;
        }
        if (normalized.apiKey) {
          apiKeys.set(id, normalized.apiKey);
        }
      }
      if (patch.source !== undefined) row.source = patch.source;
      if (patch.pluginId !== undefined) row.pluginId = patch.pluginId ?? null;
      row.updatedAt = Date.now();
      return rowToDto(row);
    },
    getDecryptedApiKey(id) {
      return apiKeys.get(id) || null;
    },
  };

  const fsPromisesMock = {
    async readFile(filePath, encoding) {
      if (!virtualFiles.has(filePath)) {
        const err = new Error(`ENOENT: no such file or directory, open '${filePath}'`);
        err.code = 'ENOENT';
        throw err;
      }
      const value = virtualFiles.get(filePath);
      if (encoding && encoding !== 'utf-8') {
        return Buffer.from(String(value), 'utf8');
      }
      return String(value);
    },
    async writeFile(filePath, content) {
      virtualFiles.set(filePath, typeof content === 'string' ? content : String(content));
    },
    async mkdir() {},
    async access(filePath) {
      if (!virtualFiles.has(filePath)) {
        const err = new Error(`ENOENT: ${filePath}`);
        err.code = 'ENOENT';
        throw err;
      }
    },
    async readdir() { return []; },
    async unlink(filePath) { virtualFiles.delete(filePath); },
    async rm(filePath) { virtualFiles.delete(filePath); },
  };

  const providerRegistry = {
    register(def) { providerDefs.set(def.type, def); },
    unregister(type) { providerDefs.delete(type); },
    list() { return [...providerDefs.values()]; },
    listByKind(kind) { return [...providerDefs.values()].filter((item) => item.kind === kind); },
    get(type) { return providerDefs.get(type); },
    unregisterByPlugin(pluginId) {
      for (const [type, def] of providerDefs.entries()) {
        if (def.pluginId === pluginId) providerDefs.delete(type);
      }
    },
  };

  const noopRegistry = {
    register() {},
    unregister() {},
    unregisterByPlugin() {},
    registerServer() {},
    unregisterServer() {},
    tools: { register() {}, unregister() {}, listDefinitions() { return []; } },
    resources: { register() {}, unregister() {}, listDefinitions() { return []; } },
    list() { return []; },
  };

  function loadRuntimeModule() {
    const source = fs.readFileSync(runtimePath, 'utf8');
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
      fileName: runtimePath,
    }).outputText;

    const module = { exports: {} };
    const mockRequire = (specifier) => {
      if (specifier === 'path') return require('node:path');
      if (specifier === 'fs/promises') return fsPromisesMock;
      if (specifier === 'child_process') return { spawn() { throw new Error('spawn not available in selfcheck'); } };
      if (specifier === 'electron') {
        return {
          app: {
            getPath(name) {
              if (name !== 'userData') throw new Error(`unexpected app.getPath(${name})`);
              return virtualUserData;
            },
            getVersion() { return 'selfcheck'; },
          },
        };
      }
      if (specifier === 'events') return require('node:events');
      if (specifier === './registries') {
        return {
          providerRegistry,
          mcpRegistry: noopRegistry,
          agentRegistry: noopRegistry,
        };
      }
      if (specifier === './capability') {
        return {
          syncProviders() {},
          syncAllMCP() {},
          capabilityRegistry: {
            list() { return []; },
            resolve() { return []; },
            invoke() { return null; },
          },
        };
      }
      if (specifier === '../settings/ChannelConfigService') return channelConfigService;
      throw new Error(`Unsupported mock require: ${specifier}`);
    };

    const fn = new Function('require', 'module', 'exports', '__dirname', '__filename', transpiled);
    fn(mockRequire, module, module.exports, path.dirname(runtimePath), runtimePath);
    return module.exports;
  }

  function loadTypeScriptModule(modulePath, extraMocks = {}) {
    const source = fs.readFileSync(modulePath, 'utf8');
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
      fileName: modulePath,
    }).outputText;

    const module = { exports: {} };
    const mockRequire = (specifier) => {
      if (specifier in extraMocks) return extraMocks[specifier];
      if (specifier.startsWith('node:')) return require(specifier);
      if (specifier === '@komastudio/plugin-sdk') {
        return { MEDIA_PROVIDER_CONTRACT_VERSION: 'selfcheck-contract' };
      }
      return require(specifier);
    };

    const fn = new Function('require', 'module', 'exports', '__dirname', '__filename', transpiled);
    fn(mockRequire, module, module.exports, path.dirname(modulePath), modulePath);
    return module.exports;
  }

  return {
    channelRows,
    apiKeys,
    providerDefs,
    virtualFiles,
    channelConfigService,
    providerRegistry,
    noopRegistry,
    loadRuntimeModule,
    loadTypeScriptModule,
  };
}

async function runSqlitePersistenceScenario() {
  const harness = createHarness();
  let { pluginRuntime } = harness.loadRuntimeModule();
  await pluginRuntime.init();

  const manifest = makeManifest({
    id: 'com.koma.seedream-test',
    name: 'Seedream Test',
    description: 'sqlite selfcheck',
    providerMeta: { channelType: 'tti', capabilities: ['tti'] },
  });

  const api = pluginRuntime.createPluginAPI(manifest);
  await api.channels.updateProviderConfig('seedream-tti', {
    baseUrl: 'https://api.example.com',
    apiKey: 'secret-key',
    region: 'cn',
    timeout: 3000,
  });

  assert.equal(harness.channelRows.length, 1, '应创建单条 channel_config');
  const savedRow = harness.channelRows[0];
  assert.equal(savedRow.baseUrl, 'https://api.example.com');
  assert.deepEqual(savedRow.providerConfig, { region: 'cn', timeout: 3000 });
  assert.equal(savedRow.source, 'plugin');
  assert.equal(savedRow.pluginId, manifest.id);
  assert.equal(harness.apiKeys.get(savedRow.id), 'secret-key');

  ({ pluginRuntime } = harness.loadRuntimeModule());
  await pluginRuntime.init();
  const apiAfterRestart = pluginRuntime.createPluginAPI(manifest);
  const loaded = await apiAfterRestart.channels.getProviderConfig('seedream-tti');

  assert.deepEqual(loaded, {
    baseUrl: 'https://api.example.com',
    apiKey: 'secret-key',
    region: 'cn',
    timeout: 3000,
  }, '重启后应从 SQLite 恢复完整配置');

  await apiAfterRestart.channels.registerProvider({
    type: 'seedream-tti',
    kind: 'tti',
    name: 'Seedream Test',
    capabilities: ['tti'],
    async factory(config) {
      const persisted = await apiAfterRestart.channels.getProviderConfig('seedream-tti');
      const merged = { ...persisted, ...config };
      return {
        merged,
        validate() {
          return Boolean(merged.baseUrl && merged.apiKey && merged.region === 'cn');
        },
      };
    },
  });

  const providerDef = harness.providerDefs.get('seedream-tti');
  assert(providerDef, 'Provider 应注册成功');
  const provider = await providerDef.factory({});
  assert.equal(provider.validate(), true, 'backend provider 应能读取持久化配置并完成实际校验');
}

async function runLegacyMigrationScenario() {
  const harness = createHarness({
    legacyConfigs: {
      vectorengine: {
        baseUrl: 'https://legacy.example.com',
        apiKey: 'legacy-key',
        workspace: 'demo',
      },
    },
  });

  const { pluginRuntime } = harness.loadRuntimeModule();
  await pluginRuntime.init();

  const manifest = makeManifest({
    id: 'com.koma.vectorengine-test',
    name: 'VectorEngine Test',
    providerMeta: { channelType: 'itv', capabilities: ['itv'] },
  });

  const api = pluginRuntime.createPluginAPI(manifest);
  const migrated = await api.channels.getProviderConfig('vectorengine');

  assert.deepEqual(migrated, {
    baseUrl: 'https://legacy.example.com',
    apiKey: 'legacy-key',
    workspace: 'demo',
  }, 'legacy provider-configs.json 应返回原始配置并迁移入 SQLite');
  assert.equal(harness.channelRows.length, 1, 'legacy 配置应生成单条 SQLite 记录');
  assert.equal(harness.channelRows[0].pluginId, manifest.id);
  assert.equal(harness.channelRows[0].baseUrl, 'https://legacy.example.com');
  assert.deepEqual(harness.channelRows[0].providerConfig, { workspace: 'demo' });
  assert.equal(harness.apiKeys.get(harness.channelRows[0].id), 'legacy-key');

  const legacyJson = JSON.parse(harness.virtualFiles.get('/virtual-user-data/provider-configs.json'));
  assert.equal(legacyJson.vectorengine, undefined, '迁移后应移除旧 JSON 条目');
}

async function runRealPluginBackendScenario() {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  global.fetch = async (url, init = {}) => {
    fetchCalls.push({ url: String(url), init });
    return {
      ok: true,
      status: 200,
      async text() { return ''; },
      async json() { return {}; },
    };
  };

  try {
    const cases = [
      {
        label: 'Seedream backend',
        backendPath: path.resolve(__dirname, '../packages/plugins/seedream-tti-provider/src/backend.ts'),
        manifest: makeManifest({
          id: 'com.koma.seedream-backend-test',
          name: 'Seedream Backend Test',
          description: 'backend smoke',
          providerMeta: { channelType: 'tti', capabilities: ['tti'] },
        }),
        providerType: 'seedream-tti',
        config: {
          baseUrl: 'https://seedream.example.com',
          apiKey: 'seedream-secret',
          watermark: false,
        },
        expectedAuth: 'Bearer seedream-secret',
        expectedUrl: 'https://seedream.example.com/v1/images/generations',
      },
      {
        label: 'VectorEngine backend',
        backendPath: path.resolve(__dirname, '../packages/plugins/vectorengine-provider/src/backend.ts'),
        manifest: makeManifest({
          id: 'com.koma.vectorengine-backend-test',
          name: 'VectorEngine Backend Test',
          description: 'backend smoke',
          providerMeta: { channelType: 'itv', capabilities: ['itv'] },
        }),
        providerType: 'vectorengine',
        config: {
          baseUrl: 'https://vectorengine.example.com',
          apiKey: 'vector-secret',
          defaultDuration: 7,
        },
        expectedAuth: 'Bearer vector-secret',
        expectedUrl: 'https://vectorengine.example.com/v1/video/query?id=test',
      },
    ];

    for (const item of cases) {
      const harness = createHarness();
      let { pluginRuntime } = harness.loadRuntimeModule();
      await pluginRuntime.init();
      const api = pluginRuntime.createPluginAPI(item.manifest);
      await api.channels.updateProviderConfig(item.providerType, item.config);

      ({ pluginRuntime } = harness.loadRuntimeModule());
      await pluginRuntime.init();
      const apiAfterRestart = pluginRuntime.createPluginAPI(item.manifest);
      const backendModule = harness.loadTypeScriptModule(item.backendPath);
      await backendModule.onActivate(apiAfterRestart);

      const providerDef = harness.providerDefs.get(item.providerType);
      assert(providerDef, `${item.label} 应完成 provider 注册`);
      const provider = await providerDef.factory({});
      assert.equal(provider.validate(), true, `${item.label} 应读取 SQLite 中的 apiKey/baseUrl`);
      assert.equal(await provider.testConnection(), true, `${item.label} 应能用持久化配置执行连接测试`);

      const lastCall = fetchCalls.at(-1);
      assert(lastCall, `${item.label} 应触发网络调用`);
      const headers = lastCall.init && lastCall.init.headers ? lastCall.init.headers : {};
      assert.equal(lastCall.url, item.expectedUrl, `${item.label} 应使用持久化 baseUrl`);
      assert.equal(headers.Authorization, item.expectedAuth, `${item.label} 应使用持久化 apiKey 构建 Authorization`);
    }
  } finally {
    global.fetch = originalFetch;
  }
}

async function runControllerPluginSmokeScenario() {
  const harness = createHarness();
  const originalFetch = global.fetch;
  const fetchCalls = [];
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'koma-plugin-controller-selfcheck-'));
  const userDataDir = path.join(tempRoot, 'userData');
  fs.mkdirSync(userDataDir, { recursive: true });

  const manifest = makeManifest({
    id: 'com.koma.seedream-controller-test',
    name: 'Seedream Controller Test',
    description: 'controller smoke',
    providerMeta: { channelType: 'tti', capabilities: ['tti'] },
  });
  const backendSourcePath = path.resolve(__dirname, '../packages/plugins/seedream-tti-provider/src/backend.ts');
  const pluginRoot = path.join(userDataDir, 'plugins-runtime', manifest.id);
  const backendOutPath = path.join(pluginRoot, 'dist', 'backend.js');
  const sdkStubPath = path.join(pluginRoot, 'node_modules', '@komastudio', 'plugin-sdk', 'index.js');

  fs.mkdirSync(path.dirname(backendOutPath), { recursive: true });
  fs.mkdirSync(path.dirname(sdkStubPath), { recursive: true });
  const backendSource = fs.readFileSync(backendSourcePath, 'utf8');
  const transpiledBackend = ts.transpileModule(backendSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: backendSourcePath,
  }).outputText;
  fs.writeFileSync(backendOutPath, transpiledBackend, 'utf8');
  fs.writeFileSync(
    sdkStubPath,
    "module.exports = { MEDIA_PROVIDER_CONTRACT_VERSION: 'selfcheck-contract' };\n",
    'utf8',
  );

  const electronMock = {
    app: {
      getPath(name) {
        if (name !== 'userData') throw new Error(`unexpected app.getPath(${name})`);
        return userDataDir;
      },
      getVersion() { return 'selfcheck'; },
    },
    shell: {
      openPath() { return ''; },
    },
  };

  const registriesMock = {
    providerRegistry: harness.providerRegistry,
    mcpRegistry: harness.noopRegistry,
    agentRegistry: harness.noopRegistry,
  };
  const capabilityMock = {
    syncProviders() {},
    syncAllMCP() {},
    capabilityRegistry: {
      list() { return []; },
      resolve() { return []; },
      invoke() { return null; },
    },
  };

  const moduleCache = new Map();
  function loadProjectTs(modulePath, extraMocks = {}) {
    const resolvedPath = path.resolve(modulePath);
    if (moduleCache.has(resolvedPath)) {
      return moduleCache.get(resolvedPath).exports;
    }

    const source = fs.readFileSync(resolvedPath, 'utf8');
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
      fileName: resolvedPath,
    }).outputText;

    const module = { exports: {} };
    moduleCache.set(resolvedPath, module);
    const localRequire = (specifier) => {
      if (specifier in extraMocks) return extraMocks[specifier];
      if (specifier === 'electron') return electronMock;
      if (specifier === 'fs/promises') return fsp;
      if (specifier === './registries') return registriesMock;
      if (specifier === './capability') return capabilityMock;
      if (specifier === '../settings/ChannelConfigService') return harness.channelConfigService;
      if (specifier === './plugin/runtime') return loadRuntime();
      if (specifier === '../service/plugin') return loadPluginService();
      if (specifier === '../service/plugin/runtime') return loadRuntime();
      if (specifier === '../service/plugin/bridge') return loadBridge();
      if (specifier === '../service') return { ensureServicesReady };
      if (specifier.startsWith('node:')) return require(specifier);
      return require(specifier);
    };

    const fn = new Function('require', 'module', 'exports', '__dirname', '__filename', transpiled);
    fn(localRequire, module, module.exports, path.dirname(resolvedPath), resolvedPath);
    return module.exports;
  }

  function loadRuntime() {
    return loadProjectTs(runtimePath);
  }
  function loadBridge() {
    return loadProjectTs(bridgePath);
  }
  function loadPluginService() {
    return loadProjectTs(pluginServicePath);
  }

  let ready = false;
  async function ensureServicesReady() {
    if (ready) return;
    await loadPluginService().pluginService.init();
    ready = true;
  }

  global.fetch = async (url, init = {}) => {
    fetchCalls.push({ url: String(url), init });
    return {
      ok: true,
      status: 200,
      async text() { return ''; },
      async json() { return {}; },
    };
  };

  try {
    harness.channelConfigService.createChannelConfig({
      category: 'tti',
      providerType: 'seedream-tti',
      name: 'Seedream Controller Channel',
      description: 'controller path',
      baseUrl: 'https://controller-seedream.example.com',
      providerConfig: {
        apiKey: 'controller-secret',
        watermark: false,
      },
      source: 'plugin',
      pluginId: manifest.id,
      models: [],
      capabilities: ['tti'],
      enabled: true,
    });

    const controller = loadProjectTs(pluginControllerPath);
    const activateResult = await controller.activate({ manifest });
    assert.deepEqual(activateResult, { success: true }, 'controller.activate 应成功加载并激活插件');

    const activeList = await controller.listActive({});
    assert.equal(activeList.length, 1, 'controller.listActive 应返回活跃插件');
    assert.equal(activeList[0].id, manifest.id);

    const callResult = await controller.callProvider({
      kind: 'tti',
      type: 'seedream-tti',
      method: 'testConnection',
      args: [{}],
    });
    assert.equal(callResult, true, 'controller.callProvider 应通过 pluginBridge 调用真实 provider');

    const lastCall = fetchCalls.at(-1);
    assert(lastCall, 'controller.callProvider 应触发真实 backend provider 的网络调用');
    const headers = lastCall.init && lastCall.init.headers ? lastCall.init.headers : {};
    assert.equal(lastCall.url, 'https://controller-seedream.example.com/v1/images/generations');
    assert.equal(headers.Authorization, 'Bearer controller-secret');

    const status = await controller.status({ pluginId: manifest.id });
    assert(status && status.status === 'active', 'controller.status 应反映 active 状态');
  } finally {
    global.fetch = originalFetch;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

(async () => {
  const checks = [
    ['SQLite 持久化 + 重启 + backend 读取', runSqlitePersistenceScenario],
    ['legacy provider-configs.json 迁移', runLegacyMigrationScenario],
    ['真实 backend 插件读取 SQLite 配置', runRealPluginBackendScenario],
    ['controller/plugin 激活 + 调用 provider', runControllerPluginSmokeScenario],
  ];

  try {
    for (const [label, fn] of checks) {
      await fn();
      console.log(`✓ ${label}`);
    }
    console.log('\nAll plugin SQLite flow checks passed.');
  } catch (err) {
    console.error('\nPlugin SQLite flow selfcheck failed.');
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
  }
})();
