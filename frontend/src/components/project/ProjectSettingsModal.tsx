/**
 * 项目设置侧边栏
 * 整合项目基本信息（项目名 / 题材 / 画面比例 / 风格）+ 媒体模型配置（LLM/TTI/ITV/TTS）
 * 通过抽屉形式从右侧滑出，作为项目工作台的统一配置入口
 */
import React, { useState, useEffect } from 'react';
import { Drawer, Form, Input, Tabs, Select, Button, Space, Checkbox, Tooltip } from 'antd';
import type { MediaModelSelection, Project } from '../../types';
import { ProjectMediaSelector } from './ProjectMediaSelector';
import type { ProjectMediaCategoryKey, ProjectMediaRequirement } from './projectMediaSelectionState';
import {
  DEFAULT_THEME_PRESET_ID,
  createProjectStyleSnapshot,
  getAllThemePresets,
  type ThemePresetCatalogItem,
} from '../../config/themePresets';
import { VIDEO_TEMPLATE_BUCKETS } from '../../services/ShotPromptService';
import {
  isAllowedDurationForSpec,
  type VideoDurationSpec,
} from '../../providers/itv/durationSpec';

interface ProjectSettingsModalProps {
  project: Project | null;
  open: boolean;
  onClose: () => void;
  onSave: (updates: Partial<Project>) => void;
  onGoToGlobalSettings?: () => void;
  /**
   * 当前项目选择的 ITV 渠道时长规格（如 grok enum 6/10/12/16/20、即梦 range 4-15）。
   * 用于在"提示词模板"档位 checkbox 上把不在 spec 范围内的档位标灰 + 提示。
   * 不传则不灰显（视为不限制）。
   */
  itvDurationSpec?: VideoDurationSpec;
}

export const ProjectSettingsModal: React.FC<ProjectSettingsModalProps> = ({
  project,
  open,
  onClose,
  onSave,
  onGoToGlobalSettings,
  itvDurationSpec,
}) => {
  const [form] = Form.useForm();
  const [activeTab, setActiveTab] = useState('basic');
  const [mediaSelections, setMediaSelections] = useState<
    Partial<Record<'llm' | 'tti' | 'itv' | 'tts', MediaModelSelection>>
  >({});
  const [themePresets, setThemePresets] = useState<ThemePresetCatalogItem[]>([]);

  // 视频提示词档位勾选：默认全选；nullable 表示"未配置"（保存时也按全选写回）
  const [multiRefSelections, setMultiRefSelections] = useState<number[]>(
    VIDEO_TEMPLATE_BUCKETS['multi-ref'].map((b) => b.duration),
  );
  const [firstFrameSelections, setFirstFrameSelections] = useState<number[]>(
    VIDEO_TEMPLATE_BUCKETS['first-frame'].map((b) => b.duration),
  );
  const mediaRequirements: Partial<Record<ProjectMediaCategoryKey, ProjectMediaRequirement>> = {
    itv: {
      description: '项目视频链路会按文生视频、图生视频、参考生视频、首尾帧视频等实际能力继续校验；这里用于设置项目默认视频模型。',
    },
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    const loadThemePresets = async () => {
      const presets = await getAllThemePresets();
      if (!cancelled) {
        setThemePresets(presets);
      }
    };

    loadThemePresets();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (project && open) {
      form.setFieldsValue({
        title: project.title,
        genre: project.genre,
        stylePresetId: project.stylePresetId || project.styleSnapshot?.sourcePresetId || DEFAULT_THEME_PRESET_ID,
      });
      setMediaSelections(project.mediaSelections || {});
      // 视频提示词档位：取项目已配置；缺省 = 全选
      const cfg = (project as { videoPromptDurationSelections?: { multiRef?: number[]; firstFrame?: number[] } })
        .videoPromptDurationSelections;
      setMultiRefSelections(
        cfg?.multiRef && cfg.multiRef.length > 0
          ? cfg.multiRef
          : VIDEO_TEMPLATE_BUCKETS['multi-ref'].map((b) => b.duration),
      );
      setFirstFrameSelections(
        cfg?.firstFrame && cfg.firstFrame.length > 0
          ? cfg.firstFrame
          : VIDEO_TEMPLATE_BUCKETS['first-frame'].map((b) => b.duration),
      );
    }
  }, [project, open, form]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const stylePresetId = values.stylePresetId || DEFAULT_THEME_PRESET_ID;
      const styleSnapshot = await createProjectStyleSnapshot(stylePresetId);
      onSave({
        title: values.title,
        genre: values.genre,
        stylePresetId,
        styleSnapshot,
        theme: undefined,
        stylePrompt: undefined,
        mediaSelections,
        videoPromptDurationSelections: {
          multiRef: multiRefSelections,
          firstFrame: firstFrameSelections,
        },
      } as Partial<Project>);
      onClose();
    } catch {
      // 验证失败
    }
  };

  const tabItems = [
    {
      key: 'basic',
      label: '基本信息',
      children: (
        <Form form={form} layout="vertical">
          <Form.Item
            name="title"
            label="项目名称"
            required
            rules={[{ required: true, message: '请输入项目名称' }]}
          >
            <Input placeholder="请输入项目名称" />
          </Form.Item>

          <Form.Item name="genre" label="题材类型">
            <Input placeholder="如: 悬疑、爱情、科幻" />
          </Form.Item>

          <Form.Item label="画面比例">
            <Input
              value={project?.aspectRatio === '9:16' ? '9:16 竖屏' : '16:9 横屏'}
              disabled
              style={{ color: '#999' }}
            />
          </Form.Item>

          <Form.Item
            name="stylePresetId"
            label="项目风格"
            rules={[{ required: true, message: '请选择项目风格' }]}
            extra="风格来源统一使用全局风格目录；如果要新增或编辑自定义风格，请前往全局设置。"
          >
            <Select
              placeholder="请选择项目风格"
              options={themePresets.map((preset) => ({
                value: preset.id,
                label: preset.name,
              }))}
            />
          </Form.Item>
        </Form>
      ),
    },
    {
      key: 'media',
      label: '媒体配置',
      children: (
        <>
          <div style={{ marginBottom: 16, color: '#888', fontSize: 13 }}>
            选择此项目使用的媒体生成服务，留空则使用全局默认配置。
          </div>
          <ProjectMediaSelector
            mediaSelections={mediaSelections}
            onChange={setMediaSelections}
            onGoToSettings={onGoToGlobalSettings}
            requirements={mediaRequirements}
          />
        </>
      ),
    },
    {
      key: 'video-prompt',
      label: '视频提示词',
      children: (
        <VideoPromptSelectionTab
          multiRefSelections={multiRefSelections}
          firstFrameSelections={firstFrameSelections}
          onMultiRefChange={setMultiRefSelections}
          onFirstFrameChange={setFirstFrameSelections}
          itvDurationSpec={itvDurationSpec}
        />
      ),
    },
  ];

  return (
    <Drawer
      title="项目设置"
      open={open}
      onClose={onClose}
      width={520}
      destroyOnClose
      placement="right"
      maskClosable={false}
      footer={
        <div style={{ textAlign: 'right' }}>
          <Space>
            <Button onClick={onClose}>取消</Button>
            <Button type="primary" onClick={handleSave}>保存</Button>
          </Space>
        </div>
      }
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
      />
    </Drawer>
  );
};

// ================================================================
// 视频提示词档位选择 Tab
// ================================================================

interface VideoPromptSelectionTabProps {
  multiRefSelections: number[];
  firstFrameSelections: number[];
  onMultiRefChange: (next: number[]) => void;
  onFirstFrameChange: (next: number[]) => void;
  itvDurationSpec?: VideoDurationSpec;
}

const VideoPromptSelectionTab: React.FC<VideoPromptSelectionTabProps> = ({
  multiRefSelections,
  firstFrameSelections,
  onMultiRefChange,
  onFirstFrameChange,
  itvDurationSpec,
}) => {
  const renderMode = (
    label: string,
    description: string,
    bucket: ReadonlyArray<{ duration: number; key: string }>,
    selected: number[],
    onChange: (next: number[]) => void,
  ) => {
    const toggle = (duration: number, checked: boolean) => {
      const set = new Set(selected);
      if (checked) set.add(duration);
      else set.delete(duration);
      // 全空时回退到全选，避免运行时落空
      const next = Array.from(set).sort((a, b) => a - b);
      onChange(next.length > 0 ? next : bucket.map((b) => b.duration));
    };
    return (
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
        <div style={{ color: '#888', fontSize: 12, marginBottom: 12 }}>{description}</div>
        <Space wrap>
          {bucket.map(({ duration }) => {
            const isSelected = selected.includes(duration);
            const inSpec = itvDurationSpec ? isAllowedDurationForSpec(duration, itvDurationSpec) : true;
            const checkbox = (
              <Checkbox
                checked={isSelected}
                onChange={(e) => toggle(duration, e.target.checked)}
                style={inSpec ? undefined : { opacity: 0.5 }}
              >
                {duration}s
              </Checkbox>
            );
            if (!inSpec) {
              return (
                <Tooltip
                  key={duration}
                  title="当前 ITV 渠道的时长规格不包含该档位；选中后该档位仍会用于推理，但实际镜头时长可能被模型规范化"
                >
                  {checkbox}
                </Tooltip>
              );
            }
            return <span key={duration}>{checkbox}</span>;
          })}
        </Space>
      </div>
    );
  };

  return (
    <>
      <div style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>
        勾选每种模式启用的时长档位（默认全选）。运行时按分镜时长在勾选档位中找<strong>最近</strong>的档位匹配模板，
        不要求严格相等。<strong>清空所有勾选会自动回退到全选</strong>避免落空。
      </div>
      {renderMode(
        '参考模式（multi-ref）',
        '使用 @角色 / @场景 / @道具 映射，适合需要多张参考图的分镜。模板池：6 / 10 / 15 / 20s。',
        VIDEO_TEMPLATE_BUCKETS['multi-ref'],
        multiRefSelections,
        onMultiRefChange,
      )}
      {renderMode(
        '首帧延展模式（first-frame）',
        '以单图为锚做微动延展，适合不需要多图引导的稳态镜头。模板池：6 / 10 / 16 / 20s。',
        VIDEO_TEMPLATE_BUCKETS['first-frame'],
        firstFrameSelections,
        onFirstFrameChange,
      )}
    </>
  );
};
