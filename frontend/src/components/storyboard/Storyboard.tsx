/**
 * Storyboard 主组件
 * 状态和业务逻辑已拆分到 useStoryboardState hook
 */
import React from 'react';
import {
  Button,
  Space,
  Segmented,
  Select,
  Typography,
  Input,
  Modal,
  Form,
  Spin,
  Empty,
  App,
} from 'antd';
import {
  PlusOutlined,
  LoadingOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import type { Shot, AppSettings } from '../../types';
import type { MentionItem } from '../../editor';
import { ScriptEditor } from '../../editor';
import { StoryboardStudio } from './StoryboardStudio';
import { ShotListEditor } from './ShotListEditor';
import { ShotAssetPresetModal } from './ShotAssetPresetModal';
import { useStoryboardState } from './useStoryboardState';
import './Storyboard.css';
import './ShotListEditor.css';

const { Text } = Typography;
const { TextArea } = Input;

const SHOT_TYPE_OPTIONS = [
  { label: 'CU', value: 'close-up' },
  { label: 'MED', value: 'medium' },
  { label: 'WIDE', value: 'wide' },
  { label: 'X-WIDE', value: 'extreme-wide' },
];

const CAMERA_OPTIONS = [
  { label: '固定镜头', value: 'static' },
  { label: '水平摇镜', value: 'pan' },
  { label: '跟随镜头', value: 'tracking' },
  { label: '缓慢推镜', value: 'zoom-in' },
  { label: '手持晃动', value: 'handheld' },
];

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

      {/* 编辑/添加分镜弹窗 */}
      <Modal
        title={state.editingShot && state.shots.find(s => s.id === state.editingShot!.id) ? '编辑分镜' : '添加分镜'}
        open={state.editModalOpen}
        onCancel={() => { state.setEditModalOpen(false); state.setEditingShot(null); state.setEditFormData({}); }}
        onOk={state.handleSaveEdit}
        okText="保存"
        cancelText="取消"
        width={700}
      >
        <Form layout="vertical">
          <Form.Item label="剧本内容" required>
            <TextArea rows={3} placeholder="对应剧本中的内容..." value={state.editFormData.scriptContent || ''} onChange={(e) => state.setEditFormData(prev => ({ ...prev, scriptContent: e.target.value }))} />
          </Form.Item>
          <Form.Item label="画面描述 (Prompt)" required>
            <ScriptEditor value={state.editFormData.description || ''} onChange={(value) => state.setEditFormData(prev => ({ ...prev, description: value }))} placeholder="描述这个镜头的画面，可使用 @ 引用角色或道具" mentionItems={state.actualMentionItems} minHeight="120px" maxHeight="200px" showLineNumbers={false} darkTheme={true} />
          </Form.Item>
          <Space size="large" style={{ width: '100%' }}>
            <Form.Item label="景别" style={{ marginBottom: 0 }}>
              <Segmented options={SHOT_TYPE_OPTIONS} value={state.editFormData.shotType || 'medium'} onChange={(value) => state.setEditFormData(prev => ({ ...prev, shotType: value as Shot['shotType'] }))} />
            </Form.Item>
            <Form.Item label="运镜" style={{ marginBottom: 0 }}>
              <Select options={CAMERA_OPTIONS} value={state.editFormData.cameraMovement || 'static'} onChange={(value) => state.setEditFormData(prev => ({ ...prev, cameraMovement: value }))} style={{ width: 160 }} />
            </Form.Item>
            <Form.Item label="时长（秒）" style={{ marginBottom: 0 }}>
              <Input type="number" min={1} max={60} value={state.editFormData.duration || 3} onChange={(e) => state.setEditFormData(prev => ({ ...prev, duration: parseInt(e.target.value) || 3 }))} style={{ width: 80 }} />
            </Form.Item>
          </Space>
          <Form.Item label="情绪氛围" style={{ marginTop: 16 }}>
            <Input placeholder="如：紧张、欢快、悲伤..." value={state.editFormData.emotion || ''} onChange={(e) => state.setEditFormData(prev => ({ ...prev, emotion: e.target.value }))} />
          </Form.Item>
          <Form.Item label="台词">
            <TextArea rows={2} placeholder="角色台词（如有）" value={state.editFormData.dialogue || ''} onChange={(e) => state.setEditFormData(prev => ({ ...prev, dialogue: e.target.value }))} />
          </Form.Item>
        </Form>
      </Modal>

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
