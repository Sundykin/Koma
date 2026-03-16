import { chatController } from '../src/controller/chat';

let initialized = false;

export function initChatIpc(): void {
  if (initialized) return;
  initialized = true;

  chatController.init();
}
