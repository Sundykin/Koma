/**
 * 推文文案弹窗
 *
 * 集中提供三个动作：
 * - 生成：基于当前剧集的 scriptText 生成连续推文旁白脚本
 * - 编辑+保存：手动修订并写回 EpisodeAnalysis.tweetScript
 * - 分发到分镜：按分镜清单切分到 Shot.tweetCopy（仅在已有分镜时可用）
 */
import React, { useEffect, useState } from 'react';
import { App, Modal, Button, Input, Space, Typography, Tooltip } from 'antd';
import { Sparkles, Send, Loader2 } from 'lucide-react';
import { createCreationContext } from '../../services/CreationContext';
import {
  generateTweetScript,
  distributeTweetToShots,
} from '../../services/TweetCopyService';
import {
  loadEpisodeAnalysis,
  saveEpisodeAnalysis,
  saveEpisodeShots,
} from '../../store/projectStore';
import type { Project, Episode } from '../../types';
import { createLogger } from '../../store/logger';
import { classifyAIError } from '../../utils/aiError';

const logger = createLogger('TweetScriptModal');
const { Text } = Typography;
const { TextArea } = Input;

interface TweetScriptModalProps {
  open: boolean;
  project: Project;
  episode: Episode | null;
  /** 当前编辑器中的剧本（可能比磁盘版本新） */
  scriptText: string;
  onClose: () => void;
}

export const TweetScriptModal: React.FC<TweetScriptModalProps> = ({
  open,
  project,
  episode,
  scriptText,
  onClose,
}) => {
  const { message } = App.useApp();
  const [tweetScript, setTweetScript] = useState('');
  const [originalTweetScript, setOriginalTweetScript] = useState('');
  const [shotsCount, setShotsCount] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDistributing, setIsDistributing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<{ percent: number; step: string } | null>(null);

  const dirty = tweetScript !== originalTweetScript;

  useEffect(() => {
    if (!open || !episode) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const analysis = await loadEpisodeAnalysis(project.id, episode.id);
        if (cancelled) return;
        const existing = analysis?.tweetScript ?? '';
        setTweetScript(existing);
        setOriginalTweetScript(existing);
        setShotsCount(analysis?.shots?.length ?? 0);
      } catch (err) {
        logger.error('加载推文文案失败', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, project.id, episode?.id]);

  const persist = async (next: string): Promise<boolean> => {
    if (!episode) return false;
    try {
      const existing = await loadEpisodeAnalysis(project.id, episode.id);
      await saveEpisodeAnalysis(project.id, episode.id, {
        characterRefs: existing?.characterRefs ?? [],
        sceneRefs: existing?.sceneRefs ?? [],
        propRefs: existing?.propRefs ?? [],
        completedStages: Array.from(
          new Set([...(existing?.completedStages ?? []), 'tweet' as const])
        ),
        shots: existing?.shots ?? [],
        tweetScript: next,
      });
      return true;
    } catch (err) {
      logger.error('保存推文文案失败', err);
      message.error('保存失败');
      return false;
    }
  };

  const handleGenerate = async () => {
    if (!episode) return;
    if (!scriptText.trim()) {
      message.warning('当前剧集还没有剧本内容，无法生成推文文案');
      return;
    }
    setIsGenerating(true);
    setProgress({ percent: 0, step: '准备中...' });
    // 流式开始前先清空 textarea，避免新内容追加在旧文案后面
    setTweetScript('');
    try {
      const ctx = await createCreationContext(project.id, episode.id, {
        styleSnapshot: project.styleSnapshot,
      });
      // 流式：onStream 每次拿到 accumulated（LLM 已生成的全文累积）覆盖 textarea，
      // 形成"打字机"实时效果；onProgress 仅推进度条。
      const result = await generateTweetScript(
        ctx,
        scriptText,
        (percent, step) => setProgress({ percent, step: step || '生成中...' }),
        (_delta, accumulated) => setTweetScript(accumulated),
      );
      // 流式完成后再用 service 清洗过的最终版本覆盖一次（service 内已会发送一次空 delta + 清洗后的 accumulated）
      setTweetScript(result);
      const ok = await persist(result);
      if (ok) {
        setOriginalTweetScript(result);
        message.success('推文文案已生成并保存');
      }
    } catch (err: unknown) {
      logger.error('生成推文文案失败', err);
      message.error(classifyAIError(err).userMessage);
    } finally {
      setIsGenerating(false);
      setProgress(null);
    }
  };

  const handleSave = async () => {
    if (!dirty) return;
    const ok = await persist(tweetScript);
    if (ok) {
      setOriginalTweetScript(tweetScript);
      message.success('推文文案已保存');
    }
  };

  const handleDistribute = async () => {
    if (!episode) return;
    if (!tweetScript.trim()) {
      message.warning('请先生成或填写推文文案');
      return;
    }
    if (shotsCount === 0) {
      message.warning('当前剧集还没有分镜，请先解析剧本生成分镜');
      return;
    }
    if (dirty) {
      const ok = await persist(tweetScript);
      if (!ok) return;
      setOriginalTweetScript(tweetScript);
    }
    setIsDistributing(true);
    setProgress({ percent: 0, step: '准备分发...' });
    try {
      const ctx = await createCreationContext(project.id, episode.id, {
        styleSnapshot: project.styleSnapshot,
      });
      const analysis = await loadEpisodeAnalysis(project.id, episode.id);
      const shots = analysis?.shots ?? [];
      if (shots.length === 0) {
        message.warning('当前剧集还没有分镜');
        return;
      }
      const distributions = await distributeTweetToShots(
        ctx,
        tweetScript,
        shots,
        (percent, step) => setProgress({ percent, step: step || '分发中...' })
      );
      const byId = new Map(distributions.map(d => [d.shotId, d.tweetCopy]));
      const updatedShots = shots.map(shot => ({
        ...shot,
        tweetCopy: byId.get(shot.id) ?? shot.tweetCopy ?? '',
      }));
      await saveEpisodeShots(project.id, episode.id, updatedShots);
      message.success(`已分发到 ${updatedShots.filter(s => s.tweetCopy).length} / ${updatedShots.length} 个分镜`);
    } catch (err: unknown) {
      logger.error('分发推文文案失败', err);
      message.error(classifyAIError(err).userMessage);
    } finally {
      setIsDistributing(false);
      setProgress(null);
    }
  };

  const anyBusy = isGenerating || isDistributing || isLoading;

  return (
    <Modal
      title="推文文案"
      open={open}
      onCancel={onClose}
      width={760}
      destroyOnClose
      footer={
        <div className="flex items-center justify-between w-full">
          <Text type="secondary" className="text-xs">
            {shotsCount > 0 ? `本集已有 ${shotsCount} 个分镜` : '本集尚无分镜'}
            {dirty ? ' · 未保存修改' : ''}
          </Text>
          <Space>
            <Button onClick={onClose} disabled={anyBusy}>关闭</Button>
            <Button
              onClick={handleSave}
              disabled={!dirty || anyBusy}
            >
              保存
            </Button>
            <Tooltip title={shotsCount === 0 ? '请先生成分镜' : '按分镜切分到每个 Shot.tweetCopy'}>
              <Button
                icon={isDistributing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                onClick={handleDistribute}
                disabled={!tweetScript.trim() || shotsCount === 0 || anyBusy}
              >
                {isDistributing ? '分发中...' : '分发到分镜'}
              </Button>
            </Tooltip>
            <Button
              type="primary"
              icon={isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              onClick={handleGenerate}
              disabled={!scriptText.trim() || anyBusy}
            >
              {isGenerating ? '生成中...' : (tweetScript.trim() ? '重新生成' : '生成推文文案')}
            </Button>
          </Space>
        </div>
      }
    >
      <div className="space-y-3">
        <Text type="secondary" className="text-xs block">
          推文文案是市面上小说推文 / 漫剧 / 一键成片工具的标准输入：紧凑口语化的连续旁白，可直接做 TTS 配音 + 字幕。
          每句 8–22 字，按 1.3–1.5 倍语速朗读。
        </Text>
        <TextArea
          value={tweetScript}
          onChange={(e) => setTweetScript(e.target.value)}
          placeholder={isLoading ? '加载中...' : '点击右下角按钮自动生成，或手动撰写推文旁白...'}
          autoSize={{ minRows: 12, maxRows: 22 }}
          disabled={anyBusy}
        />
        {progress && (
          <div className="text-xs text-text-tertiary flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>{progress.step}</span>
            <span>{Math.round(progress.percent)}%</span>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default TweetScriptModal;
