/**
 * 配置控制器 - 暴露 config:* IPC 通道
 *
 * ee-core 会自动把本文件的方法映射为 `controller/config/<method>` IPC 通道。
 * 实际对外 API（前端 `komaAPI.config.*`）在 preload/bridge.ts 里把 camelCase
 * 方法名转成 dot-namespace 语义（channelList / channelUpsert / ...）。
 */
import { BaseController } from './base';
import { ensureServicesReady, services } from '../service';
import { ConfigService } from '../service/config';
import type {
  ChannelConfigRow,
  ChannelKind,
  PromptTemplateRow,
  VisualStylePresetRow,
  PluginRegistryRow,
  MCPServerRow,
  AgentProfileRow,
} from '../service/storage';

class ConfigController extends BaseController {

  // ========== Bootstrap ==========

  async bootstrap() {
    await ensureServicesReady();
    return services.config.bootstrap();
  }

  // ========== Channel ==========

  async channelList(args: { kind: ChannelKind }): Promise<ChannelConfigRow[]> {
    await ensureServicesReady();
    const kind = ConfigService.assertChannelKind(args.kind);
    return services.config.channel.list(kind);
  }

  async channelGetDefault(args: { kind: ChannelKind }): Promise<ChannelConfigRow | null> {
    await ensureServicesReady();
    const kind = ConfigService.assertChannelKind(args.kind);
    return services.config.channel.getDefault(kind) ?? null;
  }

  async channelUpsert(args: { row: ChannelConfigRow }): Promise<{ id: string }> {
    await ensureServicesReady();
    ConfigService.assertChannelKind(args.row.kind);
    services.config.writeTx(
      { domain: 'channel', action: 'upsert', id: args.row.id, meta: { kind: args.row.kind } },
      () => services.config.channel.upsert(args.row),
    );
    return { id: args.row.id };
  }

  async channelDelete(args: { id: string }): Promise<{ success: boolean }> {
    await ensureServicesReady();
    services.config.writeTx(
      { domain: 'channel', action: 'delete', id: args.id },
      () => services.config.channel.delete(args.id),
    );
    return { success: true };
  }

  async channelSetDefault(args: { kind: ChannelKind; id: string }): Promise<{ success: boolean }> {
    await ensureServicesReady();
    const kind = ConfigService.assertChannelKind(args.kind);
    services.config.writeTx(
      { domain: 'channel', action: 'setDefault', id: args.id, meta: { kind } },
      () => services.config.channel.setDefault(kind, args.id),
    );
    return { success: true };
  }

  // ========== Prompt ==========

  async promptList(): Promise<PromptTemplateRow[]> {
    await ensureServicesReady();
    return services.config.prompt.list();
  }

  async promptUpsert(args: { row: PromptTemplateRow }): Promise<{ id: string }> {
    await ensureServicesReady();
    services.config.writeTx(
      { domain: 'prompt', action: 'upsert', id: args.row.id },
      () => services.config.prompt.upsert(args.row),
    );
    return { id: args.row.id };
  }

  async promptReset(args: { id: string }): Promise<{ success: boolean }> {
    await ensureServicesReady();
    let ok = false;
    services.config.writeTx(
      { domain: 'prompt', action: 'reset', id: args.id },
      () => {
        ok = services.config.prompt.reset(args.id);
      },
    );
    return { success: ok };
  }

  async promptDelete(args: { id: string }): Promise<{ success: boolean }> {
    await ensureServicesReady();
    services.config.writeTx(
      { domain: 'prompt', action: 'delete', id: args.id },
      () => services.config.prompt.delete(args.id),
    );
    return { success: true };
  }

  // ========== Style ==========

  async styleList(): Promise<VisualStylePresetRow[]> {
    await ensureServicesReady();
    return services.config.style.list();
  }

  async styleUpsert(args: { row: VisualStylePresetRow }): Promise<{ id: string }> {
    await ensureServicesReady();
    services.config.writeTx(
      { domain: 'style', action: 'upsert', id: args.row.id },
      () => services.config.style.upsert(args.row),
    );
    return { id: args.row.id };
  }

  async styleDelete(args: { id: string }): Promise<{ success: boolean }> {
    await ensureServicesReady();
    let ok = false;
    services.config.writeTx(
      { domain: 'style', action: 'delete', id: args.id },
      () => {
        ok = services.config.style.delete(args.id);
      },
    );
    return { success: ok };
  }

  // ========== Plugin ==========

  async pluginList(): Promise<PluginRegistryRow[]> {
    await ensureServicesReady();
    return services.config.plugin.list();
  }

  async pluginUpsert(args: { row: PluginRegistryRow }): Promise<{ id: string }> {
    await ensureServicesReady();
    services.config.writeTx(
      { domain: 'plugin', action: 'upsert', id: args.row.id },
      () => services.config.plugin.upsert(args.row),
    );
    return { id: args.row.id };
  }

  async pluginSetEnabled(args: { id: string; enabled: boolean }): Promise<{ success: boolean }> {
    await ensureServicesReady();
    services.config.writeTx(
      { domain: 'plugin', action: 'setEnabled', id: args.id, meta: { enabled: args.enabled } },
      () => services.config.plugin.setEnabled(args.id, args.enabled),
    );
    return { success: true };
  }

  async pluginDelete(args: { id: string }): Promise<{ success: boolean }> {
    await ensureServicesReady();
    services.config.writeTx(
      { domain: 'plugin', action: 'delete', id: args.id },
      () => services.config.plugin.delete(args.id),
    );
    return { success: true };
  }

  // ========== MCP ==========

  async mcpList(): Promise<MCPServerRow[]> {
    await ensureServicesReady();
    return services.config.mcp.list();
  }

  async mcpUpsert(args: { row: MCPServerRow }): Promise<{ id: string }> {
    await ensureServicesReady();
    services.config.writeTx(
      { domain: 'mcp', action: 'upsert', id: args.row.id },
      () => services.config.mcp.upsert(args.row),
    );
    return { id: args.row.id };
  }

  async mcpDelete(args: { id: string }): Promise<{ success: boolean }> {
    await ensureServicesReady();
    services.config.writeTx(
      { domain: 'mcp', action: 'delete', id: args.id },
      () => services.config.mcp.delete(args.id),
    );
    return { success: true };
  }

  // ========== Agent ==========

  async agentList(): Promise<AgentProfileRow[]> {
    await ensureServicesReady();
    return services.config.agent.list();
  }

  async agentUpsert(args: { row: AgentProfileRow }): Promise<{ id: string }> {
    await ensureServicesReady();
    services.config.writeTx(
      { domain: 'agent', action: 'upsert', id: args.row.id },
      () => services.config.agent.upsert(args.row),
    );
    return { id: args.row.id };
  }

  async agentDelete(args: { id: string }): Promise<{ success: boolean }> {
    await ensureServicesReady();
    services.config.writeTx(
      { domain: 'agent', action: 'delete', id: args.id },
      () => services.config.agent.delete(args.id),
    );
    return { success: true };
  }

  // ========== KV ==========

  async kvGet(args: { namespace: string; key: string }): Promise<unknown> {
    await ensureServicesReady();
    return services.config.kv.get(args.namespace, args.key) ?? null;
  }

  async kvListNamespace(args: { namespace: string }): Promise<Array<{ key: string; value: unknown }>> {
    await ensureServicesReady();
    return services.config.kv.listNamespace(args.namespace);
  }

  async kvSet(args: { namespace: string; key: string; value: unknown }): Promise<{ success: boolean }> {
    await ensureServicesReady();
    services.config.writeTx(
      { domain: 'kv', action: 'upsert', id: `${args.namespace}/${args.key}` },
      () => services.config.kv.set(args.namespace, args.key, args.value),
    );
    return { success: true };
  }

  async kvDelete(args: { namespace: string; key: string }): Promise<{ success: boolean }> {
    await ensureServicesReady();
    services.config.writeTx(
      { domain: 'kv', action: 'delete', id: `${args.namespace}/${args.key}` },
      () => services.config.kv.delete(args.namespace, args.key),
    );
    return { success: true };
  }

  // ========== Recent projects ==========

  async recentList(args: { limit?: number }) {
    await ensureServicesReady();
    return services.config.recent.list(args?.limit);
  }

  async recentTouch(args: { projectId: string }): Promise<{ success: boolean }> {
    await ensureServicesReady();
    services.config.writeTx(
      { domain: 'recent', action: 'touch', id: args.projectId },
      () => services.config.recent.touch(args.projectId),
    );
    return { success: true };
  }

  async recentRemove(args: { projectId: string }): Promise<{ success: boolean }> {
    await ensureServicesReady();
    services.config.writeTx(
      { domain: 'recent', action: 'delete', id: args.projectId },
      () => services.config.recent.remove(args.projectId),
    );
    return { success: true };
  }

  async recentSetPinned(args: { projectId: string; pinned: boolean }): Promise<{ success: boolean }> {
    await ensureServicesReady();
    services.config.writeTx(
      { domain: 'recent', action: 'pin', id: args.projectId, meta: { pinned: args.pinned } },
      () => services.config.recent.setPinned(args.projectId, args.pinned),
    );
    return { success: true };
  }
}

export = ConfigController;
