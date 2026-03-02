import React, { Component, ReactNode } from 'react';
import { Button, Result } from 'antd';
import { withTranslation, WithTranslation } from 'react-i18next';

interface OwnProps {
  stageName: string;
  children: ReactNode;
}

type Props = OwnProps & WithTranslation;

interface State {
  hasError: boolean;
  error: Error | null;
}

class StageErrorBoundaryInner extends Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[StageErrorBoundary:${this.props.stageName}]`, error);
    console.error(`[StageErrorBoundary:${this.props.stageName}] 组件栈:`, errorInfo.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    const { t, stageName } = this.props;

    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full bg-zinc-950">
          <Result
            status="warning"
            title={t('stageBoundary.title', { stageName })}
            subTitle={this.state.error?.message || t('stageBoundary.unknownError')}
            extra={[
              <Button key="retry" type="primary" onClick={this.handleReset}>
                {t('stageBoundary.retry')}
              </Button>,
            ]}
          />
        </div>
      );
    }

    return this.props.children;
  }
}

export const StageErrorBoundary = withTranslation('error')(StageErrorBoundaryInner);
