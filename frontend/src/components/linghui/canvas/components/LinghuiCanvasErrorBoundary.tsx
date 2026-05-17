import React, { Component, type ReactNode } from 'react';
import { createLogger } from '../../../../store/logger';

const logger = createLogger('LinghuiCanvasErrorBoundary');

interface Props {
  children: ReactNode;
  onError?: (error: Error, info: React.ErrorInfo) => void;
  onReload?: () => void;
  onRecover?: () => void;
}

interface State {
  error: Error | null;
}

export class LinghuiCanvasErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    logger.error('canvas crash', {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
    this.props.onError?.(error, info);
  }

  private handleRecover = (): void => {
    this.props.onRecover?.();
    this.setState({ error: null });
  };

  private handleReload = (): void => {
    if (this.props.onReload) {
      this.props.onReload();
    } else {
      window.location.reload();
    }
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="linghuiCanvasErrorBoundary" role="alert">
        <div className="linghuiCanvasErrorBoundaryCard">
          <div className="linghuiCanvasErrorBoundaryTitle">画布发生异常，已暂停自动保存</div>
          <div className="linghuiCanvasErrorBoundaryBody">
            {error.message || '未知错误'}
          </div>
          <div className="linghuiCanvasErrorBoundaryHint">
            为避免覆盖原数据，本次崩溃产生的空白快照不会写盘。可以重试当前画布，或从磁盘重新加载最近一次保存。
          </div>
          <div className="linghuiCanvasErrorBoundaryActions">
            <button
              type="button"
              className="linghuiCanvasErrorBoundaryButton isPrimary"
              onClick={this.handleRecover}
            >
              重试
            </button>
            <button
              type="button"
              className="linghuiCanvasErrorBoundaryButton"
              onClick={this.handleReload}
            >
              从磁盘重新加载
            </button>
          </div>
        </div>
      </div>
    );
  }
}
