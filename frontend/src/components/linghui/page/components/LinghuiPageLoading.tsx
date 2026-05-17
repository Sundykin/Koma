import { Spin } from 'antd';

export function LinghuiPageLoading() {
  return (
    <div className="flex h-full items-center justify-center bg-bg-app">
      <Spin size="large" description="加载灵绘工作台..." />
    </div>
  );
}
