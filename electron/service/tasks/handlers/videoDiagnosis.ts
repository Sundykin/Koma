/**
 * video-diagnosis —— R4 二创：对一个导入的视频做 12 维度诊断分析（VLM）。
 *
 * 输入：{ videoId, llmSelection? }
 * 输出：交给 renderer 的 VideoDiagnosisService（fulfiller 'video-diagnosis:run'）执行
 *
 * 任务 scope：'recreation:<videoId>'（与 project scope 完全分离）
 */
import { taskRunner } from '../TaskRunner';
import { delegateToRenderer } from '../delegate';

interface DiagnosisInput {
  videoId: string;
  channelKey: string;
  models: {
    vlm?: string;
    llm?: string;
  };
}

interface DiagnosisResult {
  ok: true;
  dimensionsOk: number;
  summary?: Record<string, 'ok' | 'partial' | 'failed'>;
}

const DIAGNOSIS_TIMEOUT_MS = 30 * 60 * 1_000;

let registered = false;

export function registerVideoDiagnosisHandler(): void {
  if (registered) return;
  registered = true;

  taskRunner.registerHandler({
    type: 'video-diagnosis',
    concurrency: 1,
    recoverable: false,
    async run(ctx) {
      const result = await delegateToRenderer<DiagnosisResult>({
        type: 'video-diagnosis:run',
        args: { ...(ctx.input as DiagnosisInput), parentTaskId: ctx.taskId },
        signal: ctx.signal,
        timeoutMs: DIAGNOSIS_TIMEOUT_MS,
      });
      return result;
    },
  });
}
