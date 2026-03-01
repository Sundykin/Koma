/**
 * 内联项目工具栏
 * 显示在剧本编辑器上方，提供 AI 辅助和操作按钮
 */
import React from 'react';
import { Button, Tooltip } from 'antd';
import { ThunderboltOutlined, HighlightOutlined, LoadingOutlined } from '@ant-design/icons';
import { Sparkles, Play, Check, Loader2 } from 'lucide-react';
import type { Episode } from '../../types';

interface InlineProjectToolbarProps {
  episode: Episode | null;
  isSaving: boolean;
  isAnalyzing: boolean;
  onPolish: () => void;
  onRandomGenerate: () => void;
  onAnalyze: () => void;
  onStartProduction: () => void;
}

export const InlineProjectToolbar: React.FC<InlineProjectToolbarProps> = ({
  episode,
  isSaving,
  isAnalyzing,
  onPolish,
  onRandomGenerate,
  onAnalyze,
  onStartProduction,
}) => {
  const hasScript = !!episode?.scriptText?.trim();

  return (
    <div className="h-12 px-4 flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50">
      {/* Left: AI 辅助工具 */}
      <div className="flex items-center gap-1">
        <Tooltip title="AI 随机生成剧本">
          <Button
            type="text"
            size="small"
            icon={<ThunderboltOutlined />}
            onClick={onRandomGenerate}
            className="text-zinc-400 hover:text-purple-400"
          >
            随机生成
          </Button>
        </Tooltip>
        <Tooltip title="AI 润色优化">
          <Button
            type="text"
            size="small"
            icon={<HighlightOutlined />}
            onClick={onPolish}
            disabled={!hasScript}
            className="text-zinc-400 hover:text-blue-400"
          >
            AI 润色
          </Button>
        </Tooltip>
        <Tooltip title="解析剧本提取角色场景">
          <Button
            type="text"
            size="small"
            icon={isAnalyzing ? <LoadingOutlined spin /> : <Sparkles className="w-4 h-4" />}
            onClick={onAnalyze}
            disabled={!hasScript || isAnalyzing}
            className="text-zinc-400 hover:text-emerald-400"
          >
            {isAnalyzing ? '解析中...' : '解析剧本'}
          </Button>
        </Tooltip>
      </div>

      {/* Right: 状态与操作 */}
      <div className="flex items-center gap-3">
        {/* 保存状态 */}
        <div className="flex items-center gap-1.5 text-xs">
          {isSaving ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin text-zinc-500" />
              <span className="text-zinc-500">保存中...</span>
            </>
          ) : (
            <>
              <Check className="w-3 h-3 text-emerald-500" />
              <span className="text-zinc-500">已保存</span>
            </>
          )}
        </div>

        {/* 进入主流程按钮 */}
        <Button
          type="primary"
          size="small"
          icon={<Play className="w-3.5 h-3.5" />}
          onClick={onStartProduction}
          disabled={!episode}
          className="bg-emerald-600 hover:bg-emerald-500 border-none"
          data-testid="action-enter-novel-promotion"
        >
          进入短剧主流程
        </Button>
      </div>
    </div>
  );
};

export default InlineProjectToolbar;
