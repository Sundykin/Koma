import React, { Component, ReactNode } from 'react';
import { Button, Result } from 'antd';
import { withTranslation, WithTranslation } from 'react-i18next';

interface OwnProps {
  children: ReactNode;
}

type Props = OwnProps & WithTranslation;

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundaryInner extends Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] 捕获错误:', error);
    console.error('[ErrorBoundary] 组件栈:', errorInfo.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    const { t } = this.props;

    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-screen bg-zinc-950">
          <Result
            status="error"
            title={t('boundary.title')}
            subTitle={this.state.error?.message || t('boundary.unknownError')}
            extra={[
              <Button key="reload" type="primary" onClick={this.handleReload}>
                {t('boundary.reload')}
              </Button>,
              <Button key="retry" onClick={this.handleReset}>
                {t('boundary.retry')}
              </Button>,
            ]}
          />
        </div>
      );
    }

    return this.props.children;
  }
}

export const ErrorBoundary = withTranslation('error')(ErrorBoundaryInner);
