import React from 'react';
import type { LinghuiNodeRunState } from '../../../../types/linghui';

interface LinghuiNodeRunErrorProps {
  runState?: LinghuiNodeRunState;
  surface?: 'inline' | 'thumb';
}

export function resolveLinghuiNodeRunErrorMessage(runState?: LinghuiNodeRunState): string {
  if (runState?.status !== 'failed') {
    return '';
  }

  return String(runState.error || runState.message || '执行失败').trim();
}

export const LinghuiNodeRunError: React.FC<LinghuiNodeRunErrorProps> = ({
  runState,
  surface = 'inline',
}) => {
  const message = resolveLinghuiNodeRunErrorMessage(runState);
  if (!message) {
    return null;
  }

  return (
    <div
      className={`linghuiNodeRunError ${surface === 'thumb' ? 'isThumb' : 'isInline'}`}
      title={message}
    >
      <span className="linghuiNodeRunErrorLabel">执行失败</span>
      <span className="linghuiNodeRunErrorMessage">{message}</span>
    </div>
  );
};

export default LinghuiNodeRunError;
