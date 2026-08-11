/**
 * 提示词推理的实时浮层。
 *
 * 为什么从"生成一开始"就要显示，而不是等第一个字：
 * 推理模型（deepseek-reasoner 这类）在吐正文之前会先思考几十秒——实测首个正文分片
 * 要 23 秒才到。这段时间 `content` 一个字都没有，正是等待焦虑的来源。所以浮层在 t=0
 * 就挂出来，先显示计时与思维链（拿得到的话），拿到正文后再切成正文滚动。
 *
 * 浮层只做展示，不参与保存：推理中途的半成品绝不写回 shot，也就不会触发保存队列，
 * 更不会把 mention 编辑器的内容冲掉。推理结束由调用方清空，编辑器随即显示最终稿。
 */
import { useEffect, useRef, useState } from 'react';

export interface PromptStreamOverlayProps {
  /** 已到达的文本：思考阶段是思维链，正文阶段是提示词本体；都可能为空 */
  text?: string;
  phase: 'reasoning' | 'output';
  /** 生成开始时刻（用于"已等待 N 秒"） */
  startedAt: number;
  label: string;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  return `${Math.floor(totalSeconds / 60)}m${String(totalSeconds % 60).padStart(2, '0')}s`;
}

export function PromptStreamOverlay({ text, phase, startedAt, label }: PromptStreamOverlayProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [elapsedMs, setElapsedMs] = useState(() => Date.now() - startedAt);

  // 秒级心跳：思考阶段没有任何文本变化，计时是"它还活着"的唯一可见信号
  useEffect(() => {
    setElapsedMs(Date.now() - startedAt);
    const timer = setInterval(() => setElapsedMs(Date.now() - startedAt), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  // 跟随最新内容滚到底，行为对齐聊天流
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text]);

  const thinking = phase === 'reasoning';
  const body = text?.trim() || '';

  return (
    <div className="absolute inset-1 z-10 flex flex-col rounded border border-status-info/40 bg-bg-elevated/95 shadow-lg">
      <div className="flex items-center gap-1.5 border-b border-border-subtle px-2 py-1 text-[10px] text-status-info">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-status-info" />
        {thinking ? `${label}·思考中` : label}
        <span className="ml-auto tabular-nums text-text-tertiary">
          {body ? `${body.length} 字 · ` : ''}{formatElapsed(elapsedMs)}
        </span>
      </div>
      <div
        ref={bodyRef}
        className={`min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap px-2 py-1 text-[11px] leading-relaxed ${
          thinking ? 'text-text-tertiary italic' : 'text-text-secondary'
        }`}
      >
        {body || (thinking
          ? '模型正在理解分镜脚本与参考素材，尚未开始输出正文…'
          : '等待模型响应…')}
        <span className="animate-pulse not-italic text-status-info">▌</span>
      </div>
    </div>
  );
}
