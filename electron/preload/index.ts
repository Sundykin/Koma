import { logger } from 'ee-core/log';
import { registerLocalProtocol } from '../service/protocol';
import { registerSecurityHeaders } from '../service/security';
import { initServices } from '../service';
import { chatIpc } from '../service/chat/ipc';
import { registerSettingsIpc } from '../service/settings/ipc';
import { registerTasksIpc } from '../service/tasks/ipc';
import { taskService } from '../service/tasks/TaskService';
import { taskRunner } from '../service/tasks/TaskRunner';
import { registerMediaPollHandlers } from '../service/tasks/handlers/mediaPoll';
import { registerLLMCompleteHandler } from '../service/tasks/handlers/llmComplete';
import { registerAnalysisHandlers } from '../service/tasks/handlers/analysisRunner';
import { registerBuiltinLLMProviders } from '../service/chat/providers';

function preload(): void {
  logger.info('[preload] load');
  registerLocalProtocol();
  registerSecurityHeaders();
  registerBuiltinLLMProviders();
  chatIpc.init();
  registerSettingsIpc();
  registerTasksIpc();
  registerMediaPollHandlers();
  registerLLMCompleteHandler();
  registerAnalysisHandlers();

  void initServices()
    .then(() => {
      try {
        const reconciled = taskService.reconcileOnBoot();
        const gc = taskService.runGc();
        // 把 reconcile 后状态为 pending 的可恢复任务重新入 main-side 队列
        taskRunner.resumeFromBoot();
        logger.info(
          '[preload] tasks reconcile/gc:',
          { reconciled, ...gc }
        );
      } catch (err) {
        logger.error('[preload] tasks reconcile/gc failed:', err);
      }
    })
    .catch(error => {
      logger.error('[preload] init failed:', error);
    });
}

export { preload };
