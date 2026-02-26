/**
 * 快捷键管理器
 * 统一管理编辑器快捷键
 */
import { useEffect, useCallback } from 'react';
import { useTrackStore } from '../store/trackStore';
import { useShallow } from 'zustand/react/shallow';
import { App } from 'antd';

export interface ShortcutAction {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  description: string;
  action: () => void;
}

// 快捷键配置
export function useEditorShortcuts() {
  const { message } = App.useApp();
  const {
    selectedTrackId,
    selectedItemId,
    currentTime,
    isPlaying,
    scale,
    setCurrentTime,
    setPlaying,
    setScale,
    removeItem,
    splitItem,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useTrackStore(useShallow(s => ({
    selectedTrackId: s.selectedTrackId,
    selectedItemId: s.selectedItemId,
    currentTime: s.currentTime,
    isPlaying: s.isPlaying,
    scale: s.scale,
    setCurrentTime: s.setCurrentTime,
    setPlaying: s.setPlaying,
    setScale: s.setScale,
    removeItem: s.removeItem,
    splitItem: s.splitItem,
    undo: s.undo,
    redo: s.redo,
    canUndo: s.canUndo,
    canRedo: s.canRedo,
  })));

  // 播放/暂停
  const togglePlay = useCallback(() => {
    setPlaying(!isPlaying);
  }, [isPlaying, setPlaying]);

  // 跳转到开头
  const goToStart = useCallback(() => {
    setCurrentTime(0);
  }, [setCurrentTime]);

  // 跳转到结尾
  const goToEnd = useCallback(() => {
    const duration = useTrackStore.getState().getDuration();
    setCurrentTime(duration);
  }, [setCurrentTime]);

  // 向前跳一帧
  const stepForward = useCallback(() => {
    setCurrentTime(currentTime + 1);
  }, [currentTime, setCurrentTime]);

  // 向后跳一帧
  const stepBackward = useCallback(() => {
    setCurrentTime(Math.max(0, currentTime - 1));
  }, [currentTime, setCurrentTime]);

  // 向前跳10帧
  const stepForward10 = useCallback(() => {
    setCurrentTime(currentTime + 10);
  }, [currentTime, setCurrentTime]);

  // 向后跳10帧
  const stepBackward10 = useCallback(() => {
    setCurrentTime(Math.max(0, currentTime - 10));
  }, [currentTime, setCurrentTime]);

  // 删除选中项
  const deleteSelected = useCallback(() => {
    if (selectedTrackId && selectedItemId) {
      removeItem(selectedTrackId, selectedItemId);
      message.success('已删除');
    }
  }, [selectedTrackId, selectedItemId, removeItem]);

  // 分割选中项
  const splitSelected = useCallback(() => {
    if (selectedTrackId && selectedItemId) {
      const result = splitItem(selectedTrackId, selectedItemId, currentTime);
      if (result) {
        message.success('已分割');
      } else {
        message.warning('无法在此位置分割');
      }
    }
  }, [selectedTrackId, selectedItemId, currentTime, splitItem]);

  // 放大时间线
  const zoomIn = useCallback(() => {
    setScale(Math.min(20, scale * 1.2));
  }, [scale, setScale]);

  // 缩小时间线
  const zoomOut = useCallback(() => {
    setScale(Math.max(0.5, scale / 1.2));
  }, [scale, setScale]);

  // 撤销
  const handleUndo = useCallback(() => {
    if (canUndo()) {
      undo();
      message.info('已撤销');
    }
  }, [undo, canUndo]);

  // 重做
  const handleRedo = useCallback(() => {
    if (canRedo()) {
      redo();
      message.info('已重做');
    }
  }, [redo, canRedo]);

  // 快捷键处理
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 忽略输入框中的按键
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;

      // 空格 - 播放/暂停
      if (key === ' ') {
        e.preventDefault();
        togglePlay();
        return;
      }

      // Home - 跳转到开头
      if (key === 'home') {
        e.preventDefault();
        goToStart();
        return;
      }

      // End - 跳转到结尾
      if (key === 'end') {
        e.preventDefault();
        goToEnd();
        return;
      }

      // 左箭头 - 后退
      if (key === 'arrowleft') {
        e.preventDefault();
        if (shift) {
          stepBackward10();
        } else {
          stepBackward();
        }
        return;
      }

      // 右箭头 - 前进
      if (key === 'arrowright') {
        e.preventDefault();
        if (shift) {
          stepForward10();
        } else {
          stepForward();
        }
        return;
      }

      // Delete/Backspace - 删除
      if (key === 'delete' || key === 'backspace') {
        e.preventDefault();
        deleteSelected();
        return;
      }

      // S - 分割
      if (key === 's' && !ctrl) {
        e.preventDefault();
        splitSelected();
        return;
      }

      // Ctrl+Z - 撤销
      if (ctrl && key === 'z' && !shift) {
        e.preventDefault();
        handleUndo();
        return;
      }

      // Ctrl+Shift+Z 或 Ctrl+Y - 重做
      if ((ctrl && shift && key === 'z') || (ctrl && key === 'y')) {
        e.preventDefault();
        handleRedo();
        return;
      }

      // = 或 + - 放大
      if (key === '=' || key === '+') {
        e.preventDefault();
        zoomIn();
        return;
      }

      // - - 缩小
      if (key === '-') {
        e.preventDefault();
        zoomOut();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    togglePlay,
    goToStart,
    goToEnd,
    stepForward,
    stepBackward,
    stepForward10,
    stepBackward10,
    deleteSelected,
    splitSelected,
    handleUndo,
    handleRedo,
    zoomIn,
    zoomOut,
  ]);

  return {
    togglePlay,
    goToStart,
    goToEnd,
    stepForward,
    stepBackward,
    deleteSelected,
    splitSelected,
    zoomIn,
    zoomOut,
    handleUndo,
    handleRedo,
  };
}

// 快捷键列表
export const SHORTCUT_LIST: Array<{ key: string; description: string }> = [
  { key: '空格', description: '播放/暂停' },
  { key: 'Home', description: '跳转到开头' },
  { key: 'End', description: '跳转到结尾' },
  { key: '←', description: '后退一帧' },
  { key: '→', description: '前进一帧' },
  { key: 'Shift+←', description: '后退10帧' },
  { key: 'Shift+→', description: '前进10帧' },
  { key: 'Delete', description: '删除选中项' },
  { key: 'S', description: '在播放头位置分割' },
  { key: 'Ctrl+Z', description: '撤销' },
  { key: 'Ctrl+Shift+Z', description: '重做' },
  { key: '+', description: '放大时间线' },
  { key: '-', description: '缩小时间线' },
];

export default useEditorShortcuts;
