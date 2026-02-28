import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { controllers } from '../controller';
import { appEventBus } from './eventBus';
import { fail, isDomainActionChannel, ok } from './contracts';

export function createRendererSubscriptionRegistry() {
  const rendererEventSubscriptions = new Map<number, Map<string, () => void>>();

  const getRendererEventOwner = (webContentsId: number): string => `renderer:${webContentsId}`;

  const clearRendererSubscriptions = (webContentsId: number): void => {
    appEventBus.clearOwner(getRendererEventOwner(webContentsId));
    rendererEventSubscriptions.delete(webContentsId);
  };

  return {
    rendererEventSubscriptions,
    getRendererEventOwner,
    clearRendererSubscriptions,
  };
}

export function registerIpcRoutes(options: {
  clearRendererSubscriptions: (webContentsId: number) => void;
  getRendererEventOwner: (webContentsId: number) => string;
  rendererEventSubscriptions: Map<number, Map<string, () => void>>;
}): void {
  const handleEventAction = (
    action: string,
    event: IpcMainInvokeEvent,
    args: { event?: string; payload?: unknown }
  ) => {
    if (action === 'emit') {
      const eventName = args?.event;
      if (!eventName) {
        return fail(new Error('Event name is required'), 'INVALID_EVENT_NAME');
      }
      appEventBus.emit(eventName, args?.payload);
      return ok({ emitted: true });
    }

    if (action === 'subscribe') {
      const webContentsId = event.sender.id;
      const eventName = args?.event;

      if (!eventName) {
        return fail(new Error('Event name is required'), 'INVALID_EVENT_NAME');
      }

      if (!isDomainActionChannel(eventName) && !/^[a-z][a-z0-9-]*:\*$/.test(eventName)) {
        return fail(new Error(`Invalid event name: ${eventName}`), 'INVALID_EVENT_NAME');
      }

      const owner = options.getRendererEventOwner(webContentsId);
      const rendererSubscriptions = options.rendererEventSubscriptions.get(webContentsId) || new Map<string, () => void>();

      if (rendererSubscriptions.has(eventName)) {
        return ok({ subscribed: true, duplicated: true, event: eventName });
      }

      const unsubscribe = appEventBus.on(eventName, owner, (payload, actualEventName) => {
        event.sender.send('event:message', {
          event: actualEventName || eventName,
          payload,
        });
      });

      rendererSubscriptions.set(eventName, unsubscribe);
      options.rendererEventSubscriptions.set(webContentsId, rendererSubscriptions);

      return ok({ subscribed: true, event: eventName });
    }

    if (action === 'unsubscribe') {
      const webContentsId = event.sender.id;
      const eventName = args?.event;
      const subscriptions = options.rendererEventSubscriptions.get(webContentsId);

      if (!subscriptions) {
        return ok({ unsubscribed: true, event: eventName || '*', count: 0 });
      }

      if (!eventName) {
        options.clearRendererSubscriptions(webContentsId);
        return ok({ unsubscribed: true, event: '*', count: subscriptions.size });
      }

      const unsubscribe = subscriptions.get(eventName);
      if (!unsubscribe) {
        return ok({ unsubscribed: true, event: eventName, count: 0 });
      }

      unsubscribe();
      subscriptions.delete(eventName);

      if (!subscriptions.size) {
        options.rendererEventSubscriptions.delete(webContentsId);
      }

      return ok({ unsubscribed: true, event: eventName, count: 1 });
    }

    return fail(new Error(`Unsupported event action: ${action}`), 'HANDLER_NOT_FOUND');
  };

  const invokeDomainAction = async (channel: string, args: unknown, event: IpcMainInvokeEvent) => {
    if (!isDomainActionChannel(channel)) {
      return fail(new Error(`Invalid IPC channel format: ${channel}`), 'INVALID_CHANNEL');
    }

    const [domain, ...actionParts] = channel.split(':');
    const action = actionParts.join(':');

    if (domain === 'event') {
      return handleEventAction(action, event, (args as { event?: string; payload?: unknown }) || {});
    }

    const handler = (controllers as any)[domain]?.[action];

    if (typeof handler !== 'function') {
      return fail(new Error(`Handler not found: ${domain}.${action}`), 'HANDLER_NOT_FOUND');
    }

    try {
      const result = await handler.call((controllers as any)[domain], args ?? {}, event);
      return ok(result);
    } catch (error) {
      return fail(error, 'HANDLER_EXECUTION_FAILED');
    }
  };

  ipcMain.handle('rpc:invoke', async (event, request: { channel: string; args?: unknown }) => {
    return invokeDomainAction(request.channel, request.args, event);
  });


}
