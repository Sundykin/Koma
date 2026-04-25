import type { AppSettings } from '../../../../../types';
import { getProjectLLMProvider } from '../../../../../providers';
import { EXECUTION_PROJECT_ID, throwIfExecutionAborted } from '../linghuiExecutionShared';

export async function generateTextWithProvider(params: {
  prompt: string;
  systemPrompt?: string;
  llmSelection?: string;
  settingsSnapshot?: AppSettings;
  onChunk?: (delta: string, accumulated: string) => void;
  signal?: AbortSignal;
}): Promise<string> {
  throwIfExecutionAborted(params.signal);
  const provider = await getProjectLLMProvider(
    params.llmSelection || undefined,
    'llm.chat',
    params.settingsSnapshot,
  );
  if (!provider || !provider.validate()) {
    throw new Error('未配置可用的 LLM 服务');
  }

  const output = await provider.generateText(
    params.prompt,
    params.systemPrompt || undefined,
    {
      source: 'linghui',
      operation: 'text-node-generate',
      projectId: EXECUTION_PROJECT_ID,
      stream: typeof params.onChunk === 'function',
      onChunk: params.onChunk,
    },
  );
  throwIfExecutionAborted(params.signal);
  return output;
}
