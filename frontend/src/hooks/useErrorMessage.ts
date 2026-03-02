/**
 * Hook: user-friendly error notifications
 * Wraps antd message.error with toUserMessage() to hide technical details.
 */
import { App } from 'antd';
import { useCallback } from 'react';
import { toUserMessage } from '../utils/errorMessages';

/**
 * Returns a `showError` function that displays user-friendly error messages.
 * Replaces direct `message.error(err.message)` calls.
 *
 * @example
 * const { showError } = useErrorMessage();
 * try { await doSomething(); }
 * catch (err) { showError(err); }
 */
export function useErrorMessage() {
  const { message } = App.useApp();

  const showError = useCallback(
    (error: unknown, fallbackMessage?: string) => {
      const text = toUserMessage(error) || fallbackMessage || '操作失败，请重试';
      message.error(text);
    },
    [message],
  );

  return { showError };
}
