/**
 * 内联项目工具栏
 * 显示在剧本编辑器上方，提供 AI 辅助和操作按钮
 *
 * 注：解析剧本按钮已移到右侧资产面板顶部；"开始制作"按钮已删除（顶部步骤导航
 * 的"下一步"按钮承担同样职责）。
 */
import React from 'react';
import { Button, Tooltip } from 'antd';
import { ThunderboltOutlined, HighlightOutlined, LoadingOutlined, SaveOutlined } from '@ant-design/icons';
import { Check, Loader2, MessageSquareQuote } from 'lucide-react';
import type { Episode } from '../../types';

interface InlineProjectToolbarProps {
  episode: Episode | null;
  hasScript: boolean;
  isSaving: boolean;
  isGenerating?: boolean;
  isPolishing?: boolean;
  onSave: () => void;
  onPolish: () => void;
  onRandomGenerate: () => void;
  onTweetCopy: () => void;
}

export const InlineProjectToolbar: React.FC<InlineProjectToolbarProps> = ({
  episode,
  hasScript,
  isSaving,
  isGenerating = false,
  isPolishing = false,
  onSave,
  onPolish,
  onRandomGenerate,
  onTweetCopy,
}) => {
  const anyBusy = isGenerating || isPolishing;

  return (
    <div className="h-12 px-4 flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50">
      {/* Left: AI 辅助工具 */}
      <div className="flex items-center gap-1">
        {/* 随机生成按钮：暂时隐藏（保留 onRandomGenerate 钩子，未来可恢复） */}
        {false && (
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
        )}
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
        <Tooltip title={!episode ? "请先选择剧集" : "查看 / 生成推文文案，可分发到分镜"}>
          <Button
            type="text"
            size="small"
            icon={<MessageSquareQuote className="w-4 h-4" />}
            onClick={onTweetCopy}
            disabled={!episode || anyBusy}
            className="text-zinc-400 hover:text-amber-400"
          >
            推文文案
          </Button>
        </Tooltip>
      </div>

      {/* Right: 保存状态与按钮 */}
      <div className="flex items-center gap-3">
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

        <Tooltip title={!episode ? "请先选择剧集" : anyBusy ? "AI 处理中，请稍候" : "手动保存当前剧本"}>
          <Button
            size="small"
            icon={isSaving ? <LoadingOutlined spin /> : <SaveOutlined />}
            onClick={onSave}
            disabled={!episode || isSaving || anyBusy}
          >
            {isSaving ? '保存中...' : '保存'}
          </Button>
        </Tooltip>
      </div>
    </div>
  );
};

export default InlineProjectToolbar;
