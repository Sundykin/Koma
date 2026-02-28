/**
 * Storyboard 主组件
 * 状态和业务逻辑已拆分到 useStoryboardState hook
 */
import React from 'react';
import {
  Button,
  Space,
  Typography,
  Spin,
  Empty,
} from 'antd';
import {
  PlusOutlined,
  LoadingOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import type { Shot, AppSettings } from '../../types';
import type { MentionItem } from '../../editor';
import { StoryboardStudio } from './StoryboardStudio';
import { ShotListEditor } from './ShotListEditor';
import { ShotAssetPresetModal } from './ShotAssetPresetModal';
import { useStoryboardState } from './useStoryboardState';
import './Storyboard.css';
import './ShotListEditor.css';

const { Text } = Typography;

interface StoryboardProps {
  projectId: string;
  episodeId?: string;
  episodeName?: string;
  script?: string;
  llmConfigId?: string;
  ttiConfigId?: string;
  settings: AppSettings;
  mentionItems?: MentionItem[];
  onConfirmedShotsToTimeline?: (shots: Shot[]) => void;
}

export const Storyboard: React.FC<StoryboardProps> = (props) => {
  const {
    projectId, episodeId, script, settings,
  } = props;

  const state = useStoryboardState({
    projectId,
    episodeId: props.episodeId,
    episodeName: props.episodeName,
    script: props.script,
    llmConfigId: props.llmConfigId,
    ttiConfigId: props.ttiConfigId,
    settings: props.settings,
    mentionItems: props.mentionItems,
  });

  if (state.loading) {
    return (
      <div className="storyboardContainer" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Spin size="large" tip="加载分镜数据...">
          <div style={{ padding: 50 }} />
        </Spin>
      </div>
    );
  }

  return (
    <div className="storyboardContainer">
      {state.shots.length === 0 ? (
        <div className="storyboardEmpty">
          <Empty
            description={state.isAnalyzing ? "AI 正在生成分镜..." : "暂无分镜数据"}
            style={{ margin: '100px auto' }}
          >
            {state.isAnalyzing ? (
              <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
            ) : (
              <Space direction="vertical" size="middle">
                {script && episodeId && (
                  <Button type="primary" size="large" icon={<RobotOutlined />} onClick={state.handleGenerateAIShots}>
                    AI 智能生成分镜
                  </Button>
                )}
                <Button icon={<PlusOutlined />} onClick={state.handleAddShot}>手动添加分镜</Button>
                {!script && (
                  <Text type="secondary" style={{ fontSize: 12 }}>提示：需要先在剧本步骤输入内容才能使用 AI 生成</Text>
                )}
              </Space>
            )}
          </Empty>
        </div>
      ) : (
        <StoryboardStudio>
          <ShotListEditor
            projectId={projectId}
            shots={state.shots}
            characters={state.characters}
            scenes={state.scenes}
            props={state.props}
            mentionItems={state.actualMentionItems}
            generatingImagePrompts={state.generatingImagePrompts}
            generatingVideoPrompts={state.generatingVideoPrompts}
            generatingImages={state.generatingShots}
            generatingVideos={state.renderingShots}
            batchProgress={state.batchProgress}
            activeShotId={state.activeShotId}
            onActiveShotChange={state.setActiveShotId}
            onScriptChange={state.handleScriptChange}
            onImagePromptChange={state.handleImagePromptChange}
            onVideoPromptChange={state.handleVideoPromptChange}
            onCharactersChange={state.handleCharactersChange}
            onScenesChange={state.handleScenesChange}
            onPropsChange={state.handlePropsChange}
            onReferenceImagesChange={state.handleReferenceImagesChange}
            onImagesChange={state.handleImagesChange}
            onVideosChange={state.handleVideosChange}
            onGenerateImagePrompt={state.handleGenerateImagePrompt}
            onGenerateVideoPrompt={state.handleGenerateVideoPrompt}
            onOptimizeImagePrompt={state.handleOptimizeImagePrompt}
            onOptimizeVideoPrompt={state.handleOptimizeVideoPrompt}
            onBatchGeneratePrompts={state.handleBatchGeneratePrompts}
            onBatchReGeneratePrompts={state.handleBatchReGeneratePrompts}
            onGenerateImage={state.handleGenerateShotImage}
            onBatchGenerateImages={state.handleBatchGenerate}
            onBatchReGenerateImages={state.handleBatchReGenerateImages}
            onGenerateVideo={state.handleRenderShotVideo}
            onBatchGenerateVideos={state.handleBatchRenderVideos}
            onBatchReGenerateVideos={state.handleBatchReGenerateVideos}
            onToggleConfirm={state.handleToggleConfirm}
            onDelete={state.handleDeleteShot}
            onBatchDelete={state.handleBatchDelete}
            onBatchConfirm={state.handleBatchConfirm}
            onMergeUp={state.handleMergeUp}
            onMergeDown={state.handleMergeDown}
            onMoveUp={state.handleMoveUp}
            onMoveDown={state.handleMoveDown}
            onAddShot={state.handleAddShot}
            onInsertAbove={state.handleInsertAbove}
            onInsertBelow={state.handleInsertBelow}
          />
        </StoryboardStudio>
      )}

      {/* 预选资产弹窗 */}
      <ShotAssetPresetModal
        open={state.presetModalOpen}
        characters={state.characters}
        props={state.props}
        onConfirm={state.handlePresetConfirm}
        onCancel={() => state.setPresetModalOpen(false)}
      />
    </div>
  );
};
