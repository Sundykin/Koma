/**
 * Chat 设置（MCP & Agent）
 */
import { loadSettings, saveSettings } from './core';
import type { MCPServerConfig } from '../../chat/plugins/MCPPlugin';
import type { AgentTemplate } from '../../components/chat/AgentTemplates';

export async function getMCPServers(): Promise<MCPServerConfig[]> {
  const settings = await loadSettings();
  return (settings as any).mcpServers || [];
}

export async function saveMCPServers(configs: MCPServerConfig[]): Promise<void> {
  const settings = await loadSettings();
  (settings as any).mcpServers = configs;
  await saveSettings(settings);
}

export async function getAgentTemplates(): Promise<AgentTemplate[]> {
  const settings = await loadSettings();
  return (settings as any).agentTemplates || [];
}

export async function saveAgentTemplates(templates: AgentTemplate[]): Promise<void> {
  const settings = await loadSettings();
  (settings as any).agentTemplates = templates;
  await saveSettings(settings);
}

export async function getActiveAgentId(): Promise<string | null> {
  const settings = await loadSettings();
  return (settings as any).activeAgentId || null;
}

export async function setActiveAgentId(id: string): Promise<void> {
  const settings = await loadSettings();
  (settings as any).activeAgentId = id;
  await saveSettings(settings);
}
