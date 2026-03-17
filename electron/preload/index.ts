import { logger } from 'ee-core/log';
import { registerLocalProtocol } from '../service/protocol';
import { registerSecurityHeaders } from '../service/security';
import { initServices } from '../service';
import { chatIpc } from '../service/chat/ipc';

function preload(): void {
  logger.info('[preload] load');
  registerLocalProtocol();
  registerSecurityHeaders();
  chatIpc.init();

  void initServices().catch(error => {
    logger.error('[preload] init failed:', error);
  });
}

export { preload };
