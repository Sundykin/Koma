/**
 * 对话布局组件
 * 实现 Hero 模式（居中）到 Chat 模式（底部）的平滑过渡
 */
import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { RobotOutlined } from '@ant-design/icons';

interface ChatLayoutProps {
  hasMessages: boolean;
  sidebar?: React.ReactNode;
  messageList: React.ReactNode;
  composer: React.ReactNode;
  toolbar?: React.ReactNode;
  settingsPanel?: React.ReactNode;
  welcomeTitle?: string;
  welcomeSubtitle?: string;
}

export const ChatLayout: React.FC<ChatLayoutProps> = ({
  hasMessages,
  sidebar,
  messageList,
  composer,
  toolbar,
  settingsPanel,
  welcomeTitle = 'Koma AI',
  welcomeSubtitle,
}) => {
  const { t } = useTranslation('chat');
  const effectiveWelcomeSubtitle = welcomeSubtitle ?? t('layout.welcomeSubtitle');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const prevHasMessages = useRef(hasMessages);

  // 检测从无消息到有消息的过渡
  useEffect(() => {
    if (!prevHasMessages.current && hasMessages) {
      setIsTransitioning(true);
      const timer = setTimeout(() => setIsTransitioning(false), 500);
      return () => clearTimeout(timer);
    }
    prevHasMessages.current = hasMessages;
  }, [hasMessages]);

  return (
    <div className="flex h-full bg-[#18181b]">
      {/* 侧边栏 */}
      {sidebar && (
        <aside className="w-[260px] shrink-0 border-r border-[#27272a] bg-[#09090b] overflow-hidden max-md:fixed max-md:left-0 max-md:top-0 max-md:bottom-0 max-md:z-[100] max-md:-translate-x-full max-md:transition-transform max-md:duration-300 max-md:ease-in-out">
          {sidebar}
        </aside>
      )}

      {/* 主区域 */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* 工具栏 */}
        {toolbar && <div className="shrink-0 border-b border-[#27272a] bg-[#09090b]">{toolbar}</div>}

        {/* 内容区域 */}
        <div className="flex-1 relative flex flex-col overflow-hidden">
          {/* 设置面板（独立于消息状态） */}
          {settingsPanel}

          {/* Hero 欢迎区域（无消息时显示） */}
          {!hasMessages && (
            <div className="flex-1 flex items-center justify-center pb-[120px]">
              <div className="text-center max-w-[600px] px-6">
                <div className="w-20 h-20 mx-auto mb-6 flex items-center justify-center bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-[20px] text-4xl text-white max-md:w-[60px] max-md:h-[60px] max-md:text-[28px]">
                  <RobotOutlined />
                </div>
                <h1 className="text-[32px] font-semibold text-[#fafafa] mb-3 mt-0 max-md:text-2xl">{welcomeTitle}</h1>
                <p className="text-base text-[#a1a1aa] m-0">{effectiveWelcomeSubtitle}</p>
              </div>
            </div>
          )}

          {/* 消息列表（有消息时显示） */}
          {hasMessages && (
            <div className="flex-1 overflow-y-auto min-h-0 pb-5">
              {messageList}
            </div>
          )}

          {/* 输入框容器 */}
          <div
            className={`w-full max-w-[800px] px-6 box-border transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] z-10 max-md:max-w-full max-md:px-4 ${
              hasMessages
                ? 'relative mx-auto transform-none pb-6 bg-gradient-to-t from-[#18181b_60%] to-transparent pt-10 max-md:pb-4'
                : 'absolute left-1/2 top-[55%] -translate-x-1/2 -translate-y-1/2'
            } ${isTransitioning ? 'transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]' : ''}`}
          >
            {composer}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatLayout;
