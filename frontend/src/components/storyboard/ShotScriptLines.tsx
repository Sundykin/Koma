/**
 * 分镜内字幕行块列表（Phase 3 新组件）
 *
 * 取代旧的 ShotScriptInput textarea。每个分镜的"剧本"是若干字幕行块，
 * 每块可单独编辑、删除、在任意位置插入新行；同分镜内 / 跨分镜之间均可
 * 拖拽排序（拖拽逻辑在 Storyboard 顶层 DndContext 中处理）。
 *
 * 本组件本身只负责单分镜内的渲染与逐块编辑回调；上下文（DndContext）
 * 由 Storyboard 提供，跨分镜拖动 onDragEnd 由父级捕获。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Trash2, GripVertical, MessageSquareQuote, Megaphone } from 'lucide-react';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ShotScriptLine } from '../../types';
import { createScriptLine } from '../../types';

/** 剧情模式下，台词行需要按说话人显示角色名 */
export interface ScriptLineCharacterOption {
  id: string;
  name: string;
}

interface ShotScriptLinesProps {
  shotId: string;
  lines: ShotScriptLine[];
  /** 每次 lines 变更（编辑 / 删除 / 同分镜内排序 / 任意位置插入 / 切换类型）回调 */
  onLinesChange: (shotId: string, lines: ShotScriptLine[]) => void;
  /** 角色列表（台词行显示说话人 + 指定说话人）。传入才显示角色相关 UI */
  characters?: ScriptLineCharacterOption[];
  /**
   * 是否显示类型/角色标记。解说模式全列都是旁白字幕，无需标记；
   * 剧情模式要区分旁白与带说话人的台词。
   */
  showRoleBadge?: boolean;
}

/** 单行块（行内编辑 + 类型切换 + 说话人选择 + 拖拽手柄 + 删除按钮 + 行前 ⊕ 插入） */
interface SortableLineProps {
  shotId: string;
  line: ShotScriptLine;
  characters?: ScriptLineCharacterOption[];
  showRoleBadge?: boolean;
  onDraftChange: (lineId: string, text: string) => void;
  onTextCommit: (lineId: string, text: string) => void;
  onDelete: (lineId: string) => void;
  onInsertAbove: (lineId: string) => void;
  onRoleChange: (lineId: string, role: 'narration' | 'dialogue') => void;
  onCharacterChange: (lineId: string, characterId?: string) => void;
}

function SortableLine({ shotId, line, characters, showRoleBadge, onDraftChange, onTextCommit, onDelete, onInsertAbove, onRoleChange, onCharacterChange }: SortableLineProps) {
  // dnd-kit sortable id 必须全局唯一；用 shotId:lineId 编码使跨分镜拖动时父级能解析归属
  const sortableId = `${shotId}::${line.id}`;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: sortableId,
    data: { shotId, lineId: line.id },
  });
  const [draftText, setDraftText] = useState(line.text);
  const focusedRef = useRef(false);
  const draftTextRef = useRef(line.text);
  const latestLineTextRef = useRef(line.text);

  useEffect(() => {
    latestLineTextRef.current = line.text;
    if (!focusedRef.current) {
      draftTextRef.current = line.text;
      setDraftText(line.text);
    }
  }, [line.text]);

  const handleDraftChange = useCallback((text: string) => {
    draftTextRef.current = text;
    setDraftText(text);
    onDraftChange(line.id, text);
  }, [line.id, onDraftChange]);

  const commitDraft = useCallback(() => {
    const nextText = draftTextRef.current;
    if (nextText !== latestLineTextRef.current) {
      latestLineTextRef.current = nextText;
      onTextCommit(line.id, nextText);
    }
  }, [line.id, onTextCommit]);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const isDialogue = line.role === 'dialogue';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group flex items-center gap-1 px-1 py-0.5 hover:bg-bg-hover/40 rounded relative"
    >
      {/* 行前 ⊕ 插入：hover 时显示 */}
      <button
        type="button"
        title="在此行上方插入新行"
        onClick={() => onInsertAbove(line.id)}
        className="opacity-0 group-hover:opacity-100 transition-opacity absolute -left-3 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-text-tertiary hover:text-accent bg-bg-elevated rounded-full border border-border-subtle"
      >
        <Plus className="w-2.5 h-2.5" />
      </button>

      {/* 拖拽手柄 */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        title="拖动排序（支持跨分镜）"
        className="cursor-grab active:cursor-grabbing text-text-muted hover:text-text-secondary touch-none flex-shrink-0"
      >
        <GripVertical className="w-3 h-3" />
      </button>

      {/* 类型徽标：旁白 / 台词（剧情模式才显示；点击切换类型） */}
      {showRoleBadge && (
        isDialogue ? (
          <button
            type="button"
            title="台词 — 点击切换为旁白"
            onClick={() => onRoleChange(line.id, 'narration')}
            className="flex-shrink-0 flex items-center gap-0.5 px-1 py-px rounded text-[10px] font-medium text-status-warning bg-status-warning/10 border border-status-warning/30 hover:bg-status-warning/20"
          >
            <MessageSquareQuote className="w-2.5 h-2.5" />
            台词
          </button>
        ) : (
          <button
            type="button"
            title="旁白 — 点击切换为台词"
            onClick={() => onRoleChange(line.id, 'dialogue')}
            className="flex-shrink-0 flex items-center gap-0.5 px-1 py-px rounded text-[10px] font-medium text-text-tertiary bg-bg-elevated/60 border border-border-subtle hover:bg-bg-hover"
          >
            <Megaphone className="w-2.5 h-2.5" />
            旁白
          </button>
        )
      )}

      {/* 说话人：仅台词行显示；剧情模式且传入了角色列表时可选 */}
      {showRoleBadge && isDialogue && (
        characters && characters.length > 0 ? (
          <select
            value={line.characterId ?? ''}
            onChange={(e) => onCharacterChange(line.id, e.target.value || undefined)}
            title="说话人（配音按角色选音色）"
            className="flex-shrink-0 max-w-[70px] bg-transparent border border-border-subtle rounded text-[10px] text-text-secondary px-0.5 py-px outline-none cursor-pointer"
          >
            <option value="">谁在说</option>
            {characters.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        ) : (
          <span className="flex-shrink-0 text-[10px] text-text-tertiary">（未指定说话人）</span>
        )
      )}

      {/* 行文本 */}
      <input
        type="text"
        value={draftText}
        onChange={(e) => handleDraftChange(e.target.value)}
        onFocus={() => {
          focusedRef.current = true;
        }}
        onBlur={() => {
          focusedRef.current = false;
          commitDraft();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commitDraft();
            e.currentTarget.blur();
          }
        }}
        placeholder={isDialogue ? '台词...' : '字幕行...'}
        className="flex-1 bg-transparent border-none outline-none text-xs text-text-primary placeholder-text-muted py-0.5"
      />

      {/* 删除按钮：hover 时显示 */}
      <button
        type="button"
        title="删除本行"
        onClick={() => onDelete(line.id)}
        className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 w-4 h-4 flex items-center justify-center text-text-tertiary hover:text-status-danger"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

export const ShotScriptLines: React.FC<ShotScriptLinesProps> = ({ shotId, lines, onLinesChange, characters, showRoleBadge = false }) => {
  const sortableIds = lines.map(line => `${shotId}::${line.id}`);
  const draftsRef = useRef(new Map<string, string>());
  const latestLinesRef = useRef(lines);
  const latestShotIdRef = useRef(shotId);
  const latestOnLinesChangeRef = useRef(onLinesChange);

  useEffect(() => {
    latestLinesRef.current = lines;
    latestShotIdRef.current = shotId;
    latestOnLinesChangeRef.current = onLinesChange;
  });

  useEffect(() => {
    const lineIds = new Set(lines.map(line => line.id));
    for (const [lineId, draftText] of draftsRef.current) {
      const line = lines.find(item => item.id === lineId);
      if (!lineIds.has(lineId) || line?.text === draftText) {
        draftsRef.current.delete(lineId);
      }
    }
  }, [lines]);

  const materializeLinesWithDrafts = useCallback(() => (
    lines.map(line => (
      draftsRef.current.has(line.id)
        ? { ...line, text: draftsRef.current.get(line.id) ?? line.text }
        : line
    ))
  ), [lines]);

  useEffect(() => () => {
    if (draftsRef.current.size === 0) return;
    const committedLines = latestLinesRef.current.map(line => (
      draftsRef.current.has(line.id)
        ? { ...line, text: draftsRef.current.get(line.id) ?? line.text }
        : line
    ));
    draftsRef.current.clear();
    latestOnLinesChangeRef.current(latestShotIdRef.current, committedLines);
  }, []);

  const handleDraftChange = useCallback((lineId: string, text: string) => {
    draftsRef.current.set(lineId, text);
  }, []);

  const handleTextCommit = useCallback((lineId: string, text: string) => {
    draftsRef.current.set(lineId, text);
    onLinesChange(shotId, materializeLinesWithDrafts().map(l => l.id === lineId ? { ...l, text } : l));
  }, [shotId, onLinesChange, materializeLinesWithDrafts]);

  const handleDelete = useCallback((lineId: string) => {
    draftsRef.current.delete(lineId);
    onLinesChange(shotId, materializeLinesWithDrafts().filter(l => l.id !== lineId));
  }, [shotId, onLinesChange, materializeLinesWithDrafts]);

  const handleInsertAbove = useCallback((targetLineId: string) => {
    const materializedLines = materializeLinesWithDrafts();
    const idx = materializedLines.findIndex(l => l.id === targetLineId);
    if (idx < 0) return;
    const inserted = createScriptLine('');
    const next = [...materializedLines.slice(0, idx), inserted, ...materializedLines.slice(idx)];
    onLinesChange(shotId, next);
  }, [shotId, onLinesChange, materializeLinesWithDrafts]);

  const handleAppend = useCallback(() => {
    onLinesChange(shotId, [...materializeLinesWithDrafts(), createScriptLine('')]);
  }, [shotId, onLinesChange, materializeLinesWithDrafts]);

  const handleRoleChange = useCallback((lineId: string, role: 'narration' | 'dialogue') => {
    onLinesChange(shotId, materializeLinesWithDrafts().map(l => (
      l.id === lineId
        ? { ...l, role, ...(role === 'narration' ? { characterId: undefined } : {}) }
        : l
    )));
  }, [shotId, onLinesChange, materializeLinesWithDrafts]);

  const handleCharacterChange = useCallback((lineId: string, characterId?: string) => {
    onLinesChange(shotId, materializeLinesWithDrafts().map(l => (
      l.id === lineId ? { ...l, characterId } : l
    )));
  }, [shotId, onLinesChange, materializeLinesWithDrafts]);

  return (
    <div className="flex flex-col gap-0 h-full">
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        <div className="flex-1 overflow-y-auto pl-3 pr-1 py-1">
          {lines.length === 0 ? (
            <div className="text-xs text-text-muted px-2 py-1">无字幕行</div>
          ) : (
            lines.map(line => (
              <SortableLine
                key={line.id}
                shotId={shotId}
                line={line}
                characters={characters}
                showRoleBadge={showRoleBadge}
                onDraftChange={handleDraftChange}
                onTextCommit={handleTextCommit}
                onDelete={handleDelete}
                onInsertAbove={handleInsertAbove}
                onRoleChange={handleRoleChange}
                onCharacterChange={handleCharacterChange}
              />
            ))
          )}
        </div>
      </SortableContext>

      {/* 末尾 + 添加一行 */}
      <button
        type="button"
        onClick={handleAppend}
        className="flex items-center gap-1 mx-2 mb-1 px-2 py-1 text-xs text-text-tertiary hover:text-accent hover:bg-bg-hover/40 rounded border border-dashed border-border-subtle"
      >
        <Plus className="w-3 h-3" />
        <span>添加一行</span>
      </button>
    </div>
  );
};

export default ShotScriptLines;
