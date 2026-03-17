/**
 * 内联项目工具栏
 * 显示在剧本编辑器上方，提供 AI 辅助和操作按钮
 */
import React from 'react';
import { Button, Tooltip } from 'antd';
import { ThunderboltOutlined, HighlightOutlined, LoadingOutlined, SaveOutlined } from '@ant-design/icons';
import { Sparkles, Play, Check, Loader2 } from 'lucide-react';
import type { Episode } from '../../types';

interface InlineProjectToolbarProps {
  episode: Episode | null;
  hasScript: boolean;
  isSaving: boolean;
  isAnalyzing: boolean;
  isGenerating?: boolean;
  isPolishing?: boolean;
  onSave: () => void;
  onPolish: () => void;
  onRandomGenerate: () => void;
  onAnalyze: () => void;
  onStartProduction: () => void;
}

export const InlineProjectToolbar: React.FC<InlineProjectToolbarProps> = ({
  episode,
  hasScript,
  isSaving,
  isAnalyzing,
  isGenerating = false,
  isPolishing = false,
  onSave,
  onPolish,
  onRandomGenerate,
  onAnalyze,
  onStartProduction,
}) => {
  const anyBusy = isGenerating || isPolishing || isAnalyzing;

  return (
    <div className="h-12 px-4 flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50">
      {/* Left: AI 辅助工具 */}
      <div className="flex items-center gap-1">
        <Tooltip title={isGenerating ? "正在生成中..." : "AI 随机生成剧本"}>
          <Button
            type="text"
            size="small"
            icon={isGenerating ? <LoadingOutlined spin /> : <ThunderboltOutlined />}
            onClick={onRandomGenerate}
            disabled={anyBusy}
            className="text-zinc-400 hover:text-purple-400"
          >
            {isGenerating ? '生成中...' : '随机生成'}
          </Button>
        </Tooltip>
        <Tooltip title={!hasScript ? "请先输入剧本内容" : isPolishing ? "正在润色中..." : "AI 润色优化"}>
          <Button
            type="text"
            size="small"
            icon={isPolishing ? <LoadingOutlined spin /> : <HighlightOutlined />}
            onClick={onPolish}
            disabled={!hasScript || anyBusy}
            className="text-zinc-400 hover:text-blue-400"
          >
            {isPolishing ? '润色中...' : 'AI 润色'}
          </Button>
        </Tooltip>
        <Tooltip title={!hasScript ? "请先输入剧本内容" : isAnalyzing ? "正在解析中..." : "解析剧本提取角色场景"}>
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

        {/* 开始制作按钮 */}
        <Tooltip title={!episode ? "请先选择剧集" : "手动保存当前剧本"}>
          <Button
            size="small"
            icon={isSaving ? <LoadingOutlined spin /> : <SaveOutlined />}
            onClick={onSave}
            disabled={!episode || isSaving}
          >
            {isSaving ? '保存中...' : '保存'}
          </Button>
        </Tooltip>
        <Tooltip title={!episode ? "请先选择剧集" : "进入分镜制作"}>
          <Button
            type="primary"
            size="small"
            icon={<Play className="w-3.5 h-3.5" />}
            onClick={onStartProduction}
            disabled={!episode}
            className="bg-emerald-600 hover:bg-emerald-500 border-none"
          >
            开始制作
          </Button>
        </Tooltip>
      </div>
    </div>
  );
};

export default InlineProjectToolbar;
