/**
 * Config Stage 组件
 * Story Input 界面 - 小说文本输入与配置
 */

import React, { useState, useCallback } from 'react';
import type { Episode } from '../types';
import './ConfigStage.css';

interface ConfigStageProps {
  projectId: string;
  episode: Episode | null;
  onEpisodeUpdate: (updates: Partial<Episode>) => Promise<void>;
  onGenerateScript: (params: {
    novelText: string;
    theme?: string;
    videoRatio?: string;
  }) => Promise<void>;
}

export function ConfigStage({
  projectId,
  episode,
  onEpisodeUpdate,
  onGenerateScript,
}: ConfigStageProps) {
  const [novelText, setNovelText] = useState(episode?.novelText || '');
  const [theme, setTheme] = useState('');
  const [videoRatio, setVideoRatio] = useState<'16:9' | '9:16'>('16:9');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNovelTextChange = useCallback((value: string) => {
    setNovelText(value);
    // 自动保存到 Episode
    if (episode) {
      onEpisodeUpdate({ novelText: value }).catch(console.error);
    }
  }, [episode, onEpisodeUpdate]);

  const handleGenerateScript = async () => {
    if (!novelText.trim()) {
      setError('请输入小说文本');
      return;
    }

    if (!episode) {
      setError('请先选择一个 Episode');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      await onGenerateScript({
        novelText: novelText.trim(),
        theme,
        videoRatio,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成剧本失败');
    } finally {
      setIsGenerating(false);
    }
  };

  const wordCount = novelText.trim().length;
  const canGenerate = wordCount > 0 && !isGenerating;

  return (
    <div className="config-stage">
      <div className="config-header">
        <h2>故事输入</h2>
        <p className="config-subtitle">输入小说文本，AI 将自动分析角色、场景并生成剧本</p>
      </div>

      <div className="config-content">
        <div className="config-main">
          <div className="novel-input-section">
            <div className="section-header">
              <label>小说文本</label>
              <span className="word-count">{wordCount} 字</span>
            </div>
            <textarea
              className="novel-textarea"
              value={novelText}
              onChange={(e) => handleNovelTextChange(e.target.value)}
              placeholder="在此输入小说文本...&#10;&#10;示例：&#10;孙悟空大闹天宫，玉帝派遣天兵天将前来捉拿。悟空手持金箍棒，在云端与众神激战。他身形灵活，棒法精妙，打得天兵天将节节败退..."
              disabled={isGenerating}
            />
          </div>

          {error && (
            <div className="error-message">
              <span className="error-icon">⚠️</span>
              {error}
            </div>
          )}
        </div>

        <div className="config-sidebar">
          <div className="config-section">
            <h3>视频配置</h3>

            <div className="config-field">
              <label>视频比例</label>
              <div className="ratio-selector">
                <button
                  className={`ratio-button ${videoRatio === '16:9' ? 'active' : ''}`}
                  onClick={() => setVideoRatio('16:9')}
                  disabled={isGenerating}
                >
                  <div className="ratio-preview ratio-16-9" />
                  <span>16:9</span>
                  <span className="ratio-label">横屏</span>
                </button>
                <button
                  className={`ratio-button ${videoRatio === '9:16' ? 'active' : ''}`}
                  onClick={() => setVideoRatio('9:16')}
                  disabled={isGenerating}
                >
                  <div className="ratio-preview ratio-9-16" />
                  <span>9:16</span>
                  <span className="ratio-label">竖屏</span>
                </button>
              </div>
            </div>

            <div className="config-field">
              <label>主题风格（可选）</label>
              <input
                type="text"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder="例如：古风、科幻、现代都市..."
                disabled={isGenerating}
              />
            </div>
          </div>

          <div className="config-actions">
            <button
              className="btn-generate"
              onClick={handleGenerateScript}
              disabled={!canGenerate}
            >
              {isGenerating ? (
                <>
                  <span className="spinner">⟳</span>
                  生成中...
                </>
              ) : (
                <>
                  <span className="icon">✨</span>
                  生成剧本
                </>
              )}
            </button>

            {isGenerating && (
              <div className="generating-tips">
                <p>AI 正在分析小说文本...</p>
                <ul>
                  <li>识别角色与场景</li>
                  <li>切分故事片段</li>
                  <li>生成剧本对话</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
