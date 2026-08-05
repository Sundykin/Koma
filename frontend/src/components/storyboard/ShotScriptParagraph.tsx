/**
 * 剧情模式分镜的整段剧本编辑器（左列）。
 *
 * 与解说模式的逐行字幕块（ShotScriptLines）不同：剧情模式的分镜剧本是**一段完整的
 * 分镜文本**——分镜描述（画面/动作/场景，无标记）+ 声音行（[旁白] / [台词·角色名]）。
 * 整段自由编辑，失焦时一次性解析回 scriptLines（行结构 + 说话人 characterId 映射）。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ShotScriptLine } from '../../types';
import { createScriptLine } from '../../types';
import {
  parseShotScriptParagraph,
  serializeShotScriptParagraph,
} from '../../services/dramaScript';

export interface ShotScriptParagraphProps {
  shotId: string;
  lines: ShotScriptLine[];
  /** 角色列表：台词行的说话人名字 ↔ characterId 映射 */
  characters?: Array<{ id: string; name: string }>;
  onLinesChange: (shotId: string, lines: ShotScriptLine[]) => void;
}

export const ShotScriptParagraph: React.FC<ShotScriptParagraphProps> = ({
  shotId,
  lines,
  characters,
  onLinesChange,
}) => {
  const speakerNameById = useMemo(
    () => new Map((characters ?? []).map(c => [c.id, c.name])),
    [characters],
  );

  const serialized = useMemo(
    () => serializeShotScriptParagraph(lines, speakerNameById),
    [lines, speakerNameById],
  );

  const [draft, setDraft] = useState(serialized);
  const focusedRef = useRef(false);

  // 外部数据变化（AI 拆解完成 / 撤销重做等）且未在编辑时，同步到编辑器
  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(serialized);
    }
  }, [serialized]);

  /** 说话人名字 → characterId（精确 → 包含 → 被包含） */
  const resolveSpeakerId = useCallback((speaker?: string): string | undefined => {
    if (!speaker || !characters?.length) return undefined;
    const trimmed = speaker.trim();
    const exact = characters.find(c => c.name === trimmed);
    if (exact) return exact.id;
    const contains = characters.find(c => trimmed.includes(c.name));
    if (contains) return contains.id;
    return characters.find(c => c.name.includes(trimmed))?.id;
  }, [characters]);

  const commit = useCallback(() => {
    const parsed = parseShotScriptParagraph(draft);
    const nextLines: ShotScriptLine[] = parsed.map(line =>
      createScriptLine(
        line.text,
        line.role,
        line.role === 'dialogue' ? resolveSpeakerId(line.speaker) : undefined,
      ));
    onLinesChange(shotId, nextLines);
  }, [draft, onLinesChange, shotId, resolveSpeakerId]);

  return (
    <textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={() => {
        focusedRef.current = false;
        commit();
      }}
      placeholder={
        '分镜剧本（整段）：\n直接写画面/动作/场景描述；\n[旁白] 画外音；\n[台词·角色名] 人物台词'
      }
      className="w-full h-full min-h-[80px] bg-transparent border-none outline-none resize-none text-xs text-text-primary placeholder-text-muted leading-5 p-1.5"
    />
  );
};

export default ShotScriptParagraph;
