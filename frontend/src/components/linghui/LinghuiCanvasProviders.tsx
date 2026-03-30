import React from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { LinghuiConnectionErrorContext, LinghuiNodeRunsContext } from './nodes';

interface LinghuiCanvasProvidersProps {
  nodeRuns: React.ContextType<typeof LinghuiNodeRunsContext>;
  onConnectionError?: (message: string) => void;
  children: React.ReactNode;
}

export function LinghuiCanvasProviders({
  nodeRuns,
  onConnectionError,
  children,
}: LinghuiCanvasProvidersProps) {
  return (
    <LinghuiNodeRunsContext.Provider value={nodeRuns}>
      <LinghuiConnectionErrorContext.Provider value={onConnectionError ?? (() => {})}>
        <ReactFlowProvider>
          {children}
        </ReactFlowProvider>
      </LinghuiConnectionErrorContext.Provider>
    </LinghuiNodeRunsContext.Provider>
  );
}
