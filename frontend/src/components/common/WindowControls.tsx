import React, { useState, useEffect, useCallback } from 'react';
import { Minus, Square, X, Maximize2 } from 'lucide-react';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import { electronService } from '../../services/electronService';

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);

export const WindowControls: React.FC = () => {
  const { message } = App.useApp();
  const { t } = useTranslation('common');
  const [isMaximized, setIsMaximized] = useState(false);

  const showWindowError = useCallback((action: string, error: unknown) => {
    const text = error instanceof Error ? error.message : String(error || t('unknownError'));
    message.error(t('window.actionFailed', { action, error: text }));
  }, [message, t]);

  useEffect(() => {
    if (isMac) return;
    const checkMaximized = async () => {
      try {
        const maximized = await electronService.window.isMaximized();
        setIsMaximized(maximized);
      } catch (error) {
        showWindowError(t('window.readState'), error);
      }
    };
    checkMaximized();
  }, [showWindowError]);

  const handleMinimize = async () => {
    try {
      await electronService.window.minimize();
    } catch (error) {
      showWindowError(t('window.minimizeAction'), error);
    }
  };

  const handleMaximize = async () => {
    try {
      await electronService.window.maximize();
      const maximized = await electronService.window.isMaximized();
      setIsMaximized(maximized);
    } catch (error) {
      showWindowError(t('window.toggleSizeAction'), error);
    }
  };

  const handleClose = async () => {
    try {
      await electronService.window.close();
    } catch (error) {
      showWindowError(t('window.closeAction'), error);
    }
  };

  return (
    <div className="h-8 bg-zinc-950 flex items-center justify-between select-none drag-region">
      {/* 左侧 Logo — macOS 需为红绿灯留出约 80px */}
      <div className={`flex items-center h-full no-drag ${isMac ? 'pl-20' : 'px-3'}`}>
        <div className="w-5 h-5 bg-emerald-600 rounded flex items-center justify-center text-white font-bold text-xs shadow-sm shadow-emerald-900/30">K</div>
        <span className="ml-2 text-xs text-zinc-400 font-medium">Koma</span>
      </div>

      {/* 右侧窗口控制按钮 — macOS 使用原生红绿灯，不显示自定义按钮 */}
      {!isMac && (
        <div className="flex h-full no-drag">
          <button
            onClick={handleMinimize}
            className="w-12 h-full flex items-center justify-center text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors"
            title={t('window.minimize')}
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            onClick={handleMaximize}
            className="w-12 h-full flex items-center justify-center text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors"
            title={isMaximized ? t('window.restore') : t('window.maximize')}
          >
            {isMaximized ? <Square className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleClose}
            className="w-12 h-full flex items-center justify-center text-zinc-400 hover:bg-red-600 hover:text-white transition-colors"
            title={t('window.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
