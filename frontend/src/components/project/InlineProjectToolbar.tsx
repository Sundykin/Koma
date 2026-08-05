/**
 * 内联项目工具栏
 * 显示在剧本编辑器上方，提供 AI 辅助和操作按钮
 *
 * 注：解析剧本按钮已移到右侧资产面板顶部；"开始制作"按钮已删除（顶部步骤导航
 * 的"下一步"按钮承担同样职责）。
 */
import React from 'react';
import { Button, Tooltip, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { ThunderboltOutlined, HighlightOutlined, LoadingOutlined, SaveOutlined, DownOutlined } from '@ant-design/icons';
import { Check, Loader2, MessageSquareQuote, AlertTriangle, BadgeCheck } from 'lucide-react';
import type { Episode } from '../../types';

interface InlineProjectToolbarProps {
  episode: Episode | null;
  /** 叙事模式：决定工具栏显示「推文化」（解说）还是「解析剧本」（剧情） */
  narrativeMode?: 'drama' | 'narration';
  hasScript: boolean;
  isSaving: boolean;
  isGenerating?: boolean;
  isPolishing?: boolean;
  isTweetGenerating?: boolean;
  /** 剧本是否已"推文化"（字幕行格式确认） */
  scriptReady?: boolean;
  onSave: () => void;
  onPolish: () => void;
  onRandomGenerate: () => void;
  onTweetCopy: () => void;
  /** A 项绕过入口：手动标记剧本已为字幕格式（直接导入字幕文件等场景） */
  onMarkScriptReady?: () => void;
}

export const InlineProjectToolbar: React.FC<InlineProjectToolbarProps> = ({
  episode,
  narrativeMode = 'narration',
  hasScript,
  isSaving,
  isGenerating = false,
  isPolishing = false,
  isTweetGenerating = false,
  scriptReady = false,
  onSave,
  onPolish,
  onRandomGenerate,
  onTweetCopy,
  onMarkScriptReady,
}) => {
  const anyBusy = isGenerating || isPolishing || isTweetGenerating;
  const isDrama = narrativeMode === 'drama';
  // 剧情模式：把小说解析成结构化剧本（旁白/台词标注说话人）；解说模式：推文化成字幕
  const parseLabel = isDrama ? '解析剧本' : '推文化';
  const parseBusyLabel = isDrama ? '解析中...' : '改写中...';
  const parseTooltip = isDrama
    ? 'AI 把小说解析成结构化剧本（旁白 + 带说话人的人物台词），覆盖剧本编辑器内容'
    : (scriptReady ? 'AI 重新推文化（覆盖剧本编辑器内容）' : 'AI 改写为推文文案（覆盖剧本编辑器内容，完成后自动标记为字幕格式）');

  return (
    <div className="h-12 px-4 flex items-center justify-between border-b border-border-subtle bg-bg-surface/50">
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
              className="text-text-secondary hover:text-accent"
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
            className="text-text-secondary hover:text-status-info"
          >
            {isPolishing ? '润色中...' : 'AI 润色'}
          </Button>
        </Tooltip>
        {/* 剧本结构化入口（二合一）—— 剧情=解析为结构化剧本；解说=推文化成字幕。
            主按钮调 AI 改写；右侧 ▼ 下拉里有"直接标记为可拆解"快速绕过。两者都置 scriptReady=true */}
        <div className="flex items-center">
          <Tooltip
            title={
              !episode
                ? '请先选择剧集'
                : !hasScript
                  ? '请先输入剧本内容'
                  : isTweetGenerating
                    ? (isDrama ? '正在解析为结构化剧本...' : '正在改写为推文文案...')
                    : parseTooltip
            }
          >
            <Button
              type="text"
              size="small"
              icon={isTweetGenerating ? <LoadingOutlined spin /> : <MessageSquareQuote className="w-4 h-4" />}
              onClick={onTweetCopy}
              disabled={!episode || !hasScript || anyBusy}
              className="text-text-secondary hover:text-status-warning !pr-1"
            >
              {isTweetGenerating ? parseBusyLabel : (scriptReady && !isDrama ? '重新推文化' : parseLabel)}
            </Button>
          </Tooltip>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'mark',
                  icon: <BadgeCheck className="w-3.5 h-3.5" />,
                  label: scriptReady
                    ? '已标记为可拆解'
                    : (isDrama ? '直接标记为可拆解（不调 AI）' : '直接标记为字幕格式（不调 AI）'),
                  disabled: !episode || !hasScript || anyBusy || scriptReady,
                  onClick: () => onMarkScriptReady?.(),
                },
              ] satisfies MenuProps['items'],
            }}
            trigger={['click']}
          >
            <Button
              type="text"
              size="small"
              icon={<DownOutlined className="text-[9px]" />}
              disabled={!episode || !hasScript || anyBusy}
              className="text-text-secondary hover:text-status-warning !w-5 !p-0 !pl-0.5"
            />
          </Dropdown>
        </div>
      </div>

      {/* Right: 推文化状态徽章 + 保存状态 + 保存按钮 */}
      <div className="flex items-center gap-3">
        {/* 剧本结构化状态徽章：解析剧本与下一步按钮共同的门控可视化 */}
        {episode && hasScript && (
          <Tooltip
            title={scriptReady
              ? '剧本已确认为可拆解格式，可解析、可进入下一步'
              : isDrama
                ? '剧本未解析 — 点击"解析剧本"把小说转成结构化剧本，或"标记为可拆解"才能解析与下一步'
                : '剧本未推文化（字幕行格式）— 点击"推文文案"或"标记为字幕格式"才能解析与下一步'}
          >
            <div className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded ${
              scriptReady
                ? 'text-accent bg-accent/10 border border-accent/30'
                : 'text-status-warning bg-status-warning/10 border border-status-warning/30'
            }`}>
              {scriptReady ? <BadgeCheck className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
              <span>{scriptReady ? '已可拆解' : (isDrama ? '未解析' : '未推文化')}</span>
            </div>
          </Tooltip>
        )}

        <div className="flex items-center gap-1.5 text-xs">
          {isSaving ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin text-text-tertiary" />
              <span className="text-text-tertiary">保存中...</span>
            </>
          ) : (
            <>
              <Check className="w-3 h-3 text-accent" />
              <span className="text-text-tertiary">已保存</span>
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
