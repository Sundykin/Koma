/**
 * Story 阶段 — 故事输入
 * 居中布局：大文本域 + 操作面板 + CTA按钮
 * 参考 waoowaoo ConfigStage 的垂直堆叠设计
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { App, Button, Modal } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import { Upload, BookOpen, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ScriptEditor } from '../../../editor';
import { EpisodeSplitWizard } from '../../project/EpisodeSplitWizard';
import { saveEpisode } from '../../../store/projectStore';

interface Episode {
  id: string;
  projectId: string;
  number: number;
  title: string;
  storyText?: string;
  scriptText?: string;
  createdAt: number;
  updatedAt: number;
}

interface StoryStageProps {
  projectId: string;
  episode: Episode | null;
  episodes: Episode[];
  onEpisodeUpdate: (episodeId: string, updates: Partial<Episode>) => void;
  onRefreshEpisodes: () => void;
  onSelectEpisode: (episodeId: string) => void;
  onRefreshStatuses: () => void;
  onStageChange: (stage: string) => void;
  projectConfig: Record<string, any>;
}

const StoryStage: React.FC<StoryStageProps> = ({
  projectId,
  episode,
  episodes,
  onEpisodeUpdate,
  onRefreshEpisodes,
  onSelectEpisode,
  onRefreshStatuses,
  onStageChange,
}) => {
  const { message } = App.useApp();
  const { t } = useTranslation('stage');
  const [localText, setLocalText] = useState(episode?.storyText || episode?.scriptText || '');
  const [splitWizardVisible, setSplitWizardVisible] = useState(false);
  const [batchImportVisible, setBatchImportVisible] = useState(false);
  const [batchText, setBatchText] = useState('');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef(episode?.storyText || '');

  // 同步 episode 变化
  useEffect(() => {
    const text = episode?.storyText || episode?.scriptText || '';
    setLocalText(text);
    lastSavedRef.current = text;
  }, [episode?.id]);

  // 自动保存 (2s 防抖)
  const handleTextChange = useCallback((text: string) => {
    setLocalText(text);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      if (!episode || text === lastSavedRef.current) return;
      try {
        await saveEpisode(projectId, episode.id, {
          storyText: text,
          scriptText: text,
        } as any);
        lastSavedRef.current = text;
        onEpisodeUpdate(episode.id, { storyText: text, scriptText: text });
      } catch (err: any) {
        console.error('自动保存失败:', err);
      }
    }, 2000);
  }, [episode, projectId, onEpisodeUpdate]);

  // 卸载时清理
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  const handleSplitComplete = useCallback((newEpisodes: Episode[]) => {
    setSplitWizardVisible(false);
    setBatchText('');
    onRefreshEpisodes();
    if (newEpisodes.length > 0) {
      onSelectEpisode(newEpisodes[0].id);
    }
    message.success(t('story.splitSuccess', { count: newEpisodes.length }));
  }, [onRefreshEpisodes, onSelectEpisode, message]);

  const handleBatchImport = useCallback(() => {
    if (!batchText.trim()) return;
    setBatchImportVisible(false);
    setSplitWizardVisible(true);
  }, [batchText]);

  const handleNext = useCallback(() => {
    if (!localText.trim()) {
      message.warning(t('story.noContentWarning'));
      return;
    }
    onRefreshStatuses();
    onStageChange('script');
  }, [localText, message, onRefreshStatuses, onStageChange]);

  if (!episode) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        <div className="text-center space-y-3">
          <BookOpen className="w-12 h-12 mx-auto opacity-20" />
          <p>{t('story.emptyState')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        {/* 当前剧集提示 */}
        {episodes.length > 1 && (
          <div className="text-center py-1">
            <span className="text-sm font-medium text-zinc-400">
              {t('story.currentEditing', { number: episode.number, title: episode.title })}
            </span>
          </div>
        )}

        {/* 主编辑面板 */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
          <div className="p-5">
            {/* 字数统计 */}
            <div className="flex items-center justify-end mb-3">
              <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">
                {t('story.charCount', { length: localText.length })}
              </span>
            </div>

            {/* 文本编辑器 */}
            <div className="h-96">
              <ScriptEditor
                value={localText}
                onChange={handleTextChange}
                placeholder={t('story.editorPlaceholder')}
                minHeight="100%"
                maxHeight="100%"
                showLineNumbers={true}
                darkTheme={true}
                style={{ height: '100%' }}
              />
            </div>

            {/* 提示面板 */}
            <div className="mt-5 p-4 bg-zinc-800/50 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-emerald-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                  <BookOpen className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-zinc-300">{t('story.assetLibraryTitle')}</h4>
                  <p className="text-xs text-zinc-500 mt-1">
                    {t('story.assetLibraryDesc')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 操作栏 */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setBatchImportVisible(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-xs text-zinc-300 transition-colors"
            >
              <Upload size={14} />
              {t('story.batchImportBtn')}
            </button>
          </div>
        </div>

        {/* CTA 按钮 */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
          <button
            onClick={handleNext}
            disabled={!localText.trim()}
            className="w-full py-3.5 text-base font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {t('story.nextBtn')}
            <ArrowRight size={18} />
          </button>
        </div>
      </div>

      {/* 批量导入弹窗 */}
      <Modal
        title={t('story.batchImportModalTitle')}
        open={batchImportVisible}
        onCancel={() => setBatchImportVisible(false)}
        onOk={handleBatchImport}
        okText={t('story.aiSplitOkText')}
        okButtonProps={{ disabled: !batchText.trim(), icon: <ThunderboltOutlined /> }}
        cancelText={t('common:cancel')}
        width={900}
        centered
        maskClosable={false}
      >
        <p className="text-xs text-zinc-500 mb-3">
          {t('story.batchImportModalDesc')}
        </p>
        <ScriptEditor
          value={batchText}
          onChange={setBatchText}
          placeholder={t('story.batchEditorPlaceholder')}
          minHeight="400px"
          maxHeight="500px"
        />
      </Modal>

      {/* AI 分集向导 */}
      <EpisodeSplitWizard
        visible={splitWizardVisible}
        projectId={projectId}
        script={batchText || localText}
        onCancel={() => setSplitWizardVisible(false)}
        onComplete={handleSplitComplete}
      />
    </div>
  );
};

export default StoryStage;
