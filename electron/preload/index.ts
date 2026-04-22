import { logger } from 'ee-core/log';
import { registerLocalProtocol } from '../service/protocol';
import { registerSecurityHeaders } from '../service/security';
import { initServices } from '../service';
import { chatIpc } from '../service/chat/ipc';
import { registerSettingsIpc } from '../service/settings/ipc';
import { registerBuiltinLLMProviders } from '../service/chat/providers';

function preload(): void {
  logger.info('[preload] load');
  registerLocalProtocol();
  registerSecurityHeaders();
  registerBuiltinLLMProviders();
  chatIpc.init();
  registerSettingsIpc();

  void initServices().catch(error => {
    logger.error('[preload] init failed:', error);
  });
}

export { preload };
