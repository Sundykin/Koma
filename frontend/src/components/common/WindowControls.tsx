import React, { useState, useEffect, useCallback } from 'react';
import { Minus, Square, X, Maximize2 } from 'lucide-react';
import { App } from 'antd';
import { electronService } from '../../services/electronService';

export const WindowControls: React.FC = () => {
  const { message } = App.useApp();
  const [isMaximized, setIsMaximized] = useState(false);

  const showWindowError = useCallback((action: string, error: unknown) => {
    const text = error instanceof Error ? error.message : String(error || '未知错误');
    message.error(`${action}失败：${text}`);
  }, [message]);

  useEffect(() => {
    const checkMaximized = async () => {
      try {
        const maximized = await electronService.window.isMaximized();
        setIsMaximized(maximized);
      } catch (error) {
        showWindowError('读取窗口状态', error);
      }
    };
    checkMaximized();
  }, [showWindowError]);

  const handleMinimize = async () => {
    try {
      await electronService.window.minimize();
    } catch (error) {
      showWindowError('最小化窗口', error);
    }
  };

  const handleMaximize = async () => {
    try {
      await electronService.window.maximize();
      const maximized = await electronService.window.isMaximized();
      setIsMaximized(maximized);
    } catch (error) {
      showWindowError('切换窗口大小', error);
    }
  };

  const handleClose = async () => {
    try {
      await electronService.window.close();
    } catch (error) {
      showWindowError('关闭窗口', error);
    }
  };

  return (
    <div className="h-8 bg-zinc-950 flex items-center justify-between select-none drag-region">
      {/* 左侧 Logo */}
      <div className="flex items-center h-full no-drag px-3">
        <div className="w-5 h-5 bg-emerald-600 rounded flex items-center justify-center text-white font-bold text-xs shadow-sm shadow-emerald-900/30">K</div>
        <span className="ml-2 text-xs text-zinc-400 font-medium">Koma</span>
      </div>

      {/* 右侧自定义窗口控制按钮（全平台统一） */}
      <div className="flex h-full no-drag">
        <button
          onClick={handleMinimize}
          className="w-12 h-full flex items-center justify-center text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors"
          title="最小化"
        >
          <Minus className="w-4 h-4" />
        </button>
        <button
          onClick={handleMaximize}
          className="w-12 h-full flex items-center justify-center text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors"
          title={isMaximized ? '还原' : '最大化'}
        >
          {isMaximized ? <Square className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={handleClose}
          className="w-12 h-full flex items-center justify-center text-zinc-400 hover:bg-red-600 hover:text-white transition-colors"
          title="关闭"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
