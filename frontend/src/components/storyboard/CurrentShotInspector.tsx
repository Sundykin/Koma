import React, { useMemo, useState } from 'react';
import {
  Button,
  Empty,
  Input,
  InputNumber,
  Segmented,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CheckCircleFilled,
  CheckCircleOutlined,
  DeleteOutlined,
  InsertRowAboveOutlined,
  InsertRowBelowOutlined,
  PictureOutlined,
  ThunderboltOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import type { Character, Prop, Scene, Shot } from '../../types';
import type { MentionItem } from '../../editor';
import { ScriptEditor } from '../../editor';

const { TextArea } = Input;

const SHOT_TYPE_OPTIONS = [
  { label: '特写', value: 'close-up' },
  { label: '中景', value: 'medium' },
  { label: '全景', value: 'wide' },
  { label: '大全景', value: 'extreme-wide' },
];

const CAMERA_OPTIONS = [
  { label: '固定镜头', value: 'static' },
  { label: '摇镜', value: 'pan' },
  { label: '推镜', value: 'zoom-in' },
  { label: '跟拍', value: 'tracking' },
  { label: '手持', value: 'handheld' },
];

type PromptTab = 'image' | 'video';

interface CurrentShotInspectorProps {
  shot: Shot | null;
  shotIndex: number;
  totalCount: number;
  characters: Character[];
  scenes: Scene[];
  props: Prop[];
  mentionItems: MentionItem[];
  isGeneratingImagePrompt: boolean;
  isGeneratingVideoPrompt: boolean;
  isGeneratingImage: boolean;
  isGeneratingVideo: boolean;
  onScriptChange: (shotId: string, script: string) => void;
  onImagePromptChange: (shotId: string, prompt: string) => void;
  onVideoPromptChange: (shotId: string, prompt: string) => void;
  onImageModeChange: (shotId: string, mode: 'normal' | 'grid') => void;
  onCharactersChange: (shotId: string, characterIds: string[]) => void;
  onScenesChange: (shotId: string, sceneIds: string[]) => void;
  onPropsChange: (shotId: string, propIds: string[]) => void;
  onShotMetaChange: (shotId: string, updates: Partial<Shot>) => void;
  onGenerateImagePrompt: (shotId: string) => void;
  onGenerateVideoPrompt: (shotId: string) => void;
  onOptimizeImagePrompt: (shotId: string, currentPrompt: string) => void;
  onOptimizeVideoPrompt: (shotId: string, currentPrompt: string) => void;
  onGenerateImage: (shotId: string) => void;
  onGenerateVideo: (shotId: string) => void;
  videoCapabilityLabel?: string;
  videoGenerateDisabledReason?: string;
  onToggleConfirm: (shot: Shot) => void;
  onDelete: (shotId: string) => void;
  onMoveUp: (shotId: string) => void;
  onMoveDown: (shotId: string) => void;
  onInsertAbove: (shotId: string) => void;
  onInsertBelow: (shotId: string) => void;
}

export const CurrentShotInspector: React.FC<CurrentShotInspectorProps> = ({
  shot,
  shotIndex,
  totalCount,
  characters,
  scenes,
  props,
  mentionItems,
  isGeneratingImagePrompt,
  isGeneratingVideoPrompt,
  isGeneratingImage,
  isGeneratingVideo,
  onScriptChange,
  onImagePromptChange,
  onVideoPromptChange,
  onImageModeChange,
  onCharactersChange,
  onScenesChange,
  onPropsChange,
  onShotMetaChange,
  onGenerateImagePrompt,
  onGenerateVideoPrompt,
  onOptimizeImagePrompt,
  onOptimizeVideoPrompt,
  onGenerateImage,
  onGenerateVideo,
  videoCapabilityLabel,
  videoGenerateDisabledReason,
  onToggleConfirm,
  onDelete,
  onMoveUp,
  onMoveDown,
  onInsertAbove,
  onInsertBelow,
}) => {
  const [promptTab, setPromptTab] = useState<PromptTab>('image');

  const hasImagePrompt = useMemo(() => !!shot?.imagePrompt?.trim(), [shot?.imagePrompt]);
  const hasVideoPrompt = useMemo(() => !!shot?.videoPrompt?.trim(), [shot?.videoPrompt]);

  if (!shot) {
    return (
      <div className="h-full flex items-center justify-center border-l border-zinc-800 bg-zinc-950/80">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<span className="text-zinc-500">选择一个分镜查看详细信息</span>}
        />
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 border-l border-zinc-800 bg-zinc-950/90 flex flex-col">
      <div className="px-5 py-4 border-b border-zinc-800">
        <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Inspector</div>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-lg font-semibold text-zinc-100">#{shotIndex + 1}</span>
          <Tag className="m-0 border-zinc-700 bg-zinc-950 text-zinc-300">{shot.duration}s</Tag>
          {shot.confirmed && <Tag color="green" className="m-0">已确认</Tag>}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type={shot.confirmed ? 'primary' : 'default'}
              icon={shot.confirmed ? <CheckCircleFilled /> : <CheckCircleOutlined />}
              onClick={() => onToggleConfirm(shot)}
            >
              {shot.confirmed ? '取消确认' : '确认分镜'}
            </Button>
            <Button icon={<InsertRowAboveOutlined />} onClick={() => onInsertAbove(shot.id)}>
              上方插入
            </Button>
            <Button icon={<InsertRowBelowOutlined />} onClick={() => onInsertBelow(shot.id)}>
              下方插入
            </Button>
            <Button icon={<ArrowUpOutlined />} disabled={shotIndex === 0} onClick={() => onMoveUp(shot.id)} />
            <Button icon={<ArrowDownOutlined />} disabled={shotIndex >= totalCount - 1} onClick={() => onMoveDown(shot.id)} />
            <Button danger icon={<DeleteOutlined />} onClick={() => onDelete(shot.id)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="mb-1 text-xs uppercase tracking-[0.14em] text-zinc-500">图片模式</div>
              <Segmented
                block
                value={shot.imageMode || 'normal'}
                onChange={(value) => onImageModeChange(shot.id, value as 'normal' | 'grid')}
                options={[
                  { value: 'normal', label: '普通' },
                  { value: 'grid', label: '九宫格' },
                ]}
              />
            </div>
            <div>
              <div className="mb-1 text-xs uppercase tracking-[0.14em] text-zinc-500">镜头时长</div>
              <InputNumber
                min={1}
                max={60}
                value={shot.duration}
                onChange={(value) => onShotMetaChange(shot.id, { duration: Number(value) || 1 })}
                className="w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="mb-1 text-xs uppercase tracking-[0.14em] text-zinc-500">景别</div>
              <Select
                value={shot.shotType}
                options={SHOT_TYPE_OPTIONS}
                onChange={(value) => onShotMetaChange(shot.id, { shotType: value })}
                className="w-full"
              />
            </div>
            <div>
              <div className="mb-1 text-xs uppercase tracking-[0.14em] text-zinc-500">运镜</div>
              <Select
                value={shot.cameraMovement}
                options={CAMERA_OPTIONS}
                onChange={(value) => onShotMetaChange(shot.id, { cameraMovement: value })}
                className="w-full"
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-[0.14em] text-zinc-500">提示词工作区</div>
            <Segmented
              size="small"
              value={promptTab}
              onChange={(value) => setPromptTab(value as PromptTab)}
              options={[
                { value: 'image', label: '图片提示词' },
                { value: 'video', label: '视频提示词' },
              ]}
            />
          </div>

          <ScriptEditor
            value={promptTab === 'image' ? (shot.imagePrompt || '') : (shot.videoPrompt || '')}
            onChange={(value) => {
              if (promptTab === 'image') {
                onImagePromptChange(shot.id, value);
              } else {
                onVideoPromptChange(shot.id, value);
              }
            }}
            placeholder={promptTab === 'image' ? '为当前分镜描述静态画面...' : '为当前分镜描述动态镜头与运动...'}
            mentionItems={mentionItems}
            minHeight="260px"
            maxHeight="420px"
            showLineNumbers={false}
            darkTheme
          />

          <Space wrap>
            {promptTab === 'image' ? (
              <Button
                type="primary"
                icon={<ThunderboltOutlined />}
                loading={isGeneratingImagePrompt}
                onClick={() => {
                  if (hasImagePrompt) {
                    onOptimizeImagePrompt(shot.id, shot.imagePrompt || '');
                  } else {
                    onGenerateImagePrompt(shot.id);
                  }
                }}
              >
                {hasImagePrompt ? '优化图片提示词' : '推理图片提示词'}
              </Button>
            ) : (
              <Button
                type="primary"
                icon={<ThunderboltOutlined />}
                loading={isGeneratingVideoPrompt}
                onClick={() => {
                  if (hasVideoPrompt) {
                    onOptimizeVideoPrompt(shot.id, shot.videoPrompt || '');
                  } else {
                    onGenerateVideoPrompt(shot.id);
                  }
                }}
              >
                {hasVideoPrompt ? '优化视频提示词' : '推理视频提示词'}
              </Button>
            )}

            <Button
              icon={<PictureOutlined />}
              loading={isGeneratingImage}
              onClick={() => onGenerateImage(shot.id)}
            >
              生成图片
            </Button>
            <Button
              icon={<VideoCameraOutlined />}
              loading={isGeneratingVideo}
              disabled={Boolean(videoGenerateDisabledReason)}
              onClick={() => onGenerateVideo(shot.id)}
            >
              {videoCapabilityLabel || '生成视频'}
            </Button>
          </Space>
          {videoGenerateDisabledReason && (
            <div className="text-xs text-amber-400">{videoGenerateDisabledReason}</div>
          )}
        </div>

        <div className="space-y-3">
          <div className="text-xs uppercase tracking-[0.14em] text-zinc-500">分镜文案</div>
          <TextArea
            value={shot.scriptContent || ''}
            onChange={(event) => onScriptChange(shot.id, event.target.value)}
            placeholder="补充当前分镜的文案或镜头描述"
            rows={8}
            className="bg-zinc-900 border-zinc-700"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              value={shot.dialogue || ''}
              onChange={(event) => onShotMetaChange(shot.id, { dialogue: event.target.value })}
              placeholder="台词（可选）"
            />
            <Input
              value={shot.emotion || ''}
              onChange={(event) => onShotMetaChange(shot.id, { emotion: event.target.value })}
              placeholder="情绪氛围（可选）"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-xs uppercase tracking-[0.14em] text-zinc-500">资产上下文</div>
          <Select
            mode="multiple"
            value={shot.characters || []}
            onChange={(value) => onCharactersChange(shot.id, value)}
            options={characters.map((character) => ({
              value: character.id,
              label: character.name,
            }))}
            placeholder="选择角色"
            className="w-full"
          />
          <Select
            mode="multiple"
            value={shot.scenes || []}
            onChange={(value) => onScenesChange(shot.id, value)}
            options={scenes.map((scene) => ({
              value: scene.id,
              label: scene.name,
            }))}
            placeholder="选择场景"
            className="w-full"
          />
          <Select
            mode="multiple"
            value={shot.props || []}
            onChange={(value) => onPropsChange(shot.id, value)}
            options={props.map((prop) => ({
              value: prop.id,
              label: prop.name,
            }))}
            placeholder="选择道具"
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
};
