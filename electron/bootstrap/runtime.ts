import { logger } from 'ee-core/log';
import { initChatIpc } from './chat-ipc';
import { registerLocalProtocol } from './protocol';
import { registerSecurityHeaders } from './security';
import { initServices } from './services';

let initialized = false;

export function initRuntimeBootstrap(): void {
  if (initialized) return;
  initialized = true;

  registerLocalProtocol();
  registerSecurityHeaders();
  initChatIpc();

  void initServices().catch(error => {
    logger.error('[runtime-bootstrap] init failed:', error);
  });
}
