/**
 * ExportCenterPanel - 导出中心面板
 * 快速视频导出、剪映草稿导出、图片序列导出、高级编辑入口
 */
import React, { useCallback, useState } from 'react';
import { Card, Typography, Space, Tag, Button, Select, Switch, App, Progress, List, InputNumber, Segmented } from 'antd';
import {
  VideoCameraOutlined,
  FileImageOutlined,
  ExportOutlined,
  DesktopOutlined,
  FolderOpenOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { electronService } from '../../../services/electronService';
import { createLogger } from '../../../store/logger';
import type {
  ExportCenterSession,
  StoryboardWorkflowContext,
  WorkflowShotScope,
} from './workflowSessions';
import {
  storyboardExportService,
  type StoryboardExportRange,
} from '../../../services/StoryboardExportService';

const logger = createLogger('ExportCenterPanel');
const { Text, Title } = Typography;

interface ExportCenterPanelProps {
  projectId: string;
  episodeId: string;
  storyboardContext: StoryboardWorkflowContext;
  session: ExportCenterSession;
  onSessionChange: (updates: Partial<ExportCenterSession>) => void;
  onEnterEditor?: () => void;
}

interface ExportScopePreview {
  label: string;
  count: number;
  isEmpty: boolean;
  range: StoryboardExportRange;
}

function resolveExportScopePreview(
  context: StoryboardWorkflowContext,
  scope: WorkflowShotScope,
): ExportScopePreview {
  switch (scope) {
    case 'current-shot':
      return {
        label: '当前分镜',
        count: context.activeShotId ? 1 : 0,
        isEmpty: !context.activeShotId,
        range: context.activeShotId ? { shotIds: [context.activeShotId] } : { shotIds: [] },
      };
    case 'selected-shots':
      return {
        label: '选中分镜',
        count: context.selectedShotIds.length,
        isEmpty: context.selectedShotIds.length === 0,
        range: { shotIds: context.selectedShotIds },
      };
    case 'current-chapter':
      return {
        label: '当前章节（本集）',
        count: context.shotCount,
        isEmpty: context.shotCount === 0,
        range: 'all',
      };
    case 'all-shots':
    default:
      return {
        label: '全部分镜',
        count: context.shotCount,
        isEmpty: context.shotCount === 0,
        range: 'all',
      };
  }
}

export const ExportCenterPanel: React.FC<ExportCenterPanelProps> = ({
  projectId,
  episodeId,
  storyboardContext,
  session,
  onSessionChange,
  onEnterEditor,
}) => {
  const { message } = App.useApp();
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const scopePreview = React.useMemo(
    () => resolveExportScopePreview(storyboardContext, session.config.scope),
    [storyboardContext, session.config.scope],
  );

  const updateConfig = useCallback((updates: Partial<ExportCenterSession['config']>) => {
    onSessionChange({
      config: {
        ...session.config,
        ...updates,
      },
    });
  }, [onSessionChange, session.config]);

  const pushHistory = useCallback((item: ExportCenterSession['history'][number]) => {
    onSessionChange({
      currentStep: 1,
      history: [item, ...session.history],
      lastApplied: {
        appliedAt: Date.now(),
        summary: `${item.type} 导出完成`,
        affectedCount: item.count,
        scopeLabel: item.path,
      },
    });
  }, [onSessionChange, session.history]);

  const handleSaveTemplate = useCallback(() => {
    if (!session.activeExport || session.activeExport === 'editor') {
      message.warning('请选择一种可导出的方式后再保存模板');
      return;
    }

    const templateCount = session.templates.filter((item) => item.source !== 'builtin').length + 1;
    onSessionChange({
      templates: [
        {
          id: `${session.activeExport}-${Date.now()}`,
          name: `${session.activeExport} 模板 ${templateCount}`,
          exportType: session.activeExport,
          config: { ...session.config },
          createdAt: Date.now(),
          source: 'custom',
        },
        ...session.templates,
      ],
    });
    message.success('已保存当前导出模板');
  }, [message, onSessionChange, session.activeExport, session.config, session.templates]);

  const handleApplyTemplate = useCallback((templateId: string) => {
    const template = session.templates.find((item) => item.id === templateId);
    if (!template) {
      return;
    }
    onSessionChange({
      activeExport: template.exportType,
      selectedTemplateId: template.id,
      config: {
        ...session.config,
        ...template.config,
      },
      currentStep: 0,
    });
    message.success(`已载入模板: ${template.name}`);
  }, [message, onSessionChange, session.templates]);

  const handleImageExport = useCallback(async () => {
    setExporting(true);
    setProgress(0);
    try {
      if (scopePreview.isEmpty) {
        message.warning(`当前导出范围为空，请先选择${session.config.scope === 'current-shot' ? '一个分镜' : '分镜'}`);
        return;
      }
      if (!electronService.isElectron()) {
        message.info('图片序列导出需要桌面端');
        return;
      }

      const result = await electronService.dialog.openDirectory();
      if (result.canceled || !result.filePaths?.[0]) {
        return;
      }
      const outputDir = result.filePaths[0];
      const exportResult = await storyboardExportService.exportStoryboardImages({
        projectId,
        episodeId,
        range: scopePreview.range,
        imageFormat: session.config.imageFormat,
        superResolution: session.config.superResolution,
        outputDir,
        onProgress: (current, total) => {
          setProgress(Math.round((current / total) * 100));
        },
      });

      if (!exportResult.success) {
        throw new Error(exportResult.error || '图片序列导出失败');
      }

      pushHistory({
        time: new Date().toLocaleTimeString(),
        type: '图片序列',
        path: exportResult.outputPath,
        count: exportResult.itemCount,
        templateName: session.templates.find((item) => item.id === session.selectedTemplateId)?.name,
      });

      message.success(`已导出 ${exportResult.itemCount} 张图片到 ${exportResult.outputPath}`);
    } catch (err: any) {
      logger.error('图片导出失败', err);
      message.error('导出失败: ' + (err.message || '未知错误'));
    } finally {
      setExporting(false);
      setProgress(0);
    }
  }, [episodeId, message, projectId, pushHistory, scopePreview, session.config.imageFormat, session.config.scope, session.config.superResolution, session.selectedTemplateId, session.templates]);

  const handleJianyingExport = useCallback(async () => {
    setExporting(true);
    setProgress(0);
    try {
      if (scopePreview.isEmpty) {
        message.warning(`当前导出范围为空，请先选择${session.config.scope === 'current-shot' ? '一个分镜' : '分镜'}`);
        return;
      }
      if (!electronService.isElectron()) {
        message.info('剪映草稿导出需要桌面端');
        return;
      }

      const picked = await electronService.dialog.openDirectory();
      if (picked.canceled || !picked.filePaths?.[0]) {
        return;
      }
      const outputDir = `${picked.filePaths[0]}/jianying_draft_${Date.now()}`;

      const exportResult = await storyboardExportService.exportStoryboardJianying({
        projectId,
        episodeId,
        range: scopePreview.range,
        outputDir,
        stillDuration: session.config.stillDurationSeconds,
        includeAudio: session.config.includeAudio,
        includeSubtitles: session.config.includeSubtitles,
        onProgress: (current, total) => {
          setProgress(Math.round((current / Math.max(total, 1)) * 100));
        },
      });

      if (!exportResult.success) {
        throw new Error(exportResult.error || '剪映草稿导出失败');
      }

      pushHistory({
        time: new Date().toLocaleTimeString(),
        type: '剪映草稿',
        path: exportResult.outputPath,
        count: exportResult.itemCount,
        templateName: session.templates.find((item) => item.id === session.selectedTemplateId)?.name,
      });
      message.success(`剪映草稿已导出到 ${exportResult.outputPath}`);
    } catch (err: any) {
      logger.error('剪映草稿导出失败', err);
      message.error(err?.message || '剪映草稿导出失败');
    } finally {
      setExporting(false);
      setProgress(0);
    }
  }, [episodeId, message, projectId, pushHistory, scopePreview, session.config.includeAudio, session.config.includeSubtitles, session.config.scope, session.config.stillDurationSeconds, session.selectedTemplateId, session.templates]);

  const handleVideoExport = useCallback(async () => {
    setExporting(true);
    setProgress(0);
    try {
      if (scopePreview.isEmpty) {
        message.warning(`当前导出范围为空，请先选择${session.config.scope === 'current-shot' ? '一个分镜' : '分镜'}`);
        return;
      }
      if (!electronService.isElectron()) {
        message.info('快速视频导出需要桌面端');
        return;
      }

      const saveResult = await electronService.dialog.saveFile({
        title: '导出快速视频',
        defaultPath: `storyboard_export_${Date.now()}.${session.config.videoFormat}`,
        filters: [{ name: session.config.videoFormat.toUpperCase(), extensions: [session.config.videoFormat] }],
      });
      if (saveResult.canceled || !saveResult.filePath) {
        return;
      }

      const exportResult = await storyboardExportService.exportStoryboardVideo({
        projectId,
        episodeId,
        range: scopePreview.range,
        resolution: session.config.videoResolution,
        stillDuration: session.config.stillDurationSeconds,
        includeAudio: session.config.includeAudio,
        includeSubtitles: session.config.includeSubtitles,
        format: session.config.videoFormat,
        outputPath: saveResult.filePath,
        onProgress: (current, total) => {
          setProgress(Math.round((current / Math.max(total, 1)) * 100));
        },
      });

      if (!exportResult.success) {
        throw new Error(exportResult.error || '快速视频导出失败');
      }

      pushHistory({
        time: new Date().toLocaleTimeString(),
        type: '快速视频',
        path: exportResult.outputPath,
        count: exportResult.itemCount,
        templateName: session.templates.find((item) => item.id === session.selectedTemplateId)?.name,
      });
      message.success(`快速视频已导出到 ${exportResult.outputPath}`);
    } catch (err: any) {
      logger.error('快速视频导出失败', err);
      message.error(err?.message || '快速视频导出失败');
    } finally {
      setExporting(false);
      setProgress(0);
    }
  }, [episodeId, message, projectId, pushHistory, scopePreview, session.config.includeAudio, session.config.includeSubtitles, session.config.scope, session.config.stillDurationSeconds, session.config.videoFormat, session.config.videoResolution, session.selectedTemplateId, session.templates]);

  const exportOptions = [
    {
      key: 'video',
      icon: <VideoCameraOutlined className="text-2xl text-blue-400" />,
      title: '快速视频导出',
      description: '按分镜顺序拼接图片/视频，可选添加音频和字幕',
      tag: '直出',
      tagColor: 'blue' as const,
    },
    {
      key: 'jianying',
      icon: <ExportOutlined className="text-2xl text-purple-400" />,
      title: '剪映草稿导出',
      description: '直接从分镜数据生成剪映草稿，在剪映中进一步编辑',
      tag: '草稿',
      tagColor: 'purple' as const,
    },
    {
      key: 'images',
      icon: <FileImageOutlined className="text-2xl text-orange-400" />,
      title: '图片序列导出',
      description: '按分镜顺序导出所有选中图片',
      tag: '可用',
      tagColor: 'green' as const,
    },
    {
      key: 'editor',
      icon: <DesktopOutlined className="text-2xl text-zinc-400" />,
      title: '高级编辑器',
      description: '进入时间线编辑器，添加转场、特效、音频等',
      tag: '高级',
      tagColor: 'blue' as const,
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        <Title level={5} className="!text-zinc-300 !mb-0">导出中心</Title>
        <Text type="secondary">导出配置、模板资产和历史记录会在工作区中持续保留。</Text>

        <div className="flex flex-col gap-3">
          {exportOptions.map((option) => (
            <Card
              key={option.key}
              size="small"
              className={`bg-zinc-900 border-zinc-700 cursor-pointer hover:border-zinc-500 transition-colors ${
                session.activeExport === option.key ? 'border-blue-600' : ''
              }`}
              styles={{ body: { padding: '14px 16px' } }}
              onClick={() => {
                onSessionChange({
                  activeExport: option.key as ExportCenterSession['activeExport'],
                  currentStep: 0,
                });
                if (option.key === 'editor') {
                  onEnterEditor?.();
                }
              }}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">{option.icon}</div>
                <div className="flex-1">
                  <Space>
                    <Text className="text-zinc-200 font-medium">{option.title}</Text>
                    {option.tag && <Tag color={option.tagColor}>{option.tag}</Tag>}
                  </Space>
                  <Text type="secondary" className="text-xs block mt-1">{option.description}</Text>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {exporting && (
          <div>
            <Text type="secondary" className="text-xs">导出进度</Text>
            <Progress percent={progress} size="small" />
          </div>
        )}

        {session.activeExport && session.activeExport !== 'editor' && (
          <div className="flex flex-col gap-2 p-3 bg-zinc-900 rounded border border-zinc-800">
            <div className="flex items-center justify-between">
              <Text className="text-zinc-400 text-xs">导出配置</Text>
              <Button size="small" icon={<SaveOutlined />} onClick={handleSaveTemplate}>
                存为模板
              </Button>
            </div>

            <div className="flex flex-col gap-2">
              <Text className="text-zinc-400 text-xs">导出范围</Text>
              <Segmented
                block
                value={session.config.scope}
                onChange={(value) => updateConfig({ scope: value as WorkflowShotScope })}
                options={[
                  { value: 'current-shot', label: '当前分镜' },
                  { value: 'current-chapter', label: '当前章节' },
                  { value: 'selected-shots', label: '选中分镜' },
                  { value: 'all-shots', label: '全部分镜' },
                ]}
              />
              <div className="flex items-center gap-2 text-xs">
                <Tag className="m-0 border-zinc-700 bg-zinc-950 text-zinc-300">{scopePreview.label}</Tag>
                <Text type="secondary">{scopePreview.count} 条分镜</Text>
              </div>
            </div>

            {session.activeExport === 'images' && (
              <>
                <div className="flex items-center gap-2">
                  <Text type="secondary" className="text-xs w-20">图片格式</Text>
                  <Select
                    size="small"
                    value={session.config.imageFormat}
                    onChange={(value) => updateConfig({ imageFormat: value })}
                    options={[{ value: 'png', label: 'PNG' }, { value: 'jpeg', label: 'JPEG' }]}
                    className="w-24"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Text type="secondary" className="text-xs w-20">超分辨率</Text>
                  <Switch size="small" checked={session.config.superResolution} onChange={(checked) => updateConfig({ superResolution: checked })} />
                </div>
                <Button type="primary" onClick={handleImageExport} loading={exporting}>
                  开始导出图片序列
                </Button>
              </>
            )}

            {(session.activeExport === 'video' || session.activeExport === 'jianying') && (
              <>
                <div className="flex items-center gap-2">
                  <Text type="secondary" className="text-xs w-20">静帧时长</Text>
                  <InputNumber
                    min={1}
                    max={30}
                    value={session.config.stillDurationSeconds}
                    onChange={(value) => updateConfig({ stillDurationSeconds: Number(value) || 5 })}
                    className="w-28"
                  />
                </div>
                {session.activeExport === 'video' && (
                  <>
                    <div className="flex items-center gap-2">
                      <Text type="secondary" className="text-xs w-20">分辨率</Text>
                      <Select
                        size="small"
                        value={session.config.videoResolution}
                        onChange={(value) => updateConfig({ videoResolution: value })}
                        options={[
                          { value: '720p', label: '720p' },
                          { value: '1080p', label: '1080p' },
                          { value: '4K', label: '4K' },
                        ]}
                        className="w-28"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Text type="secondary" className="text-xs w-20">视频格式</Text>
                      <Select
                        size="small"
                        value={session.config.videoFormat}
                        onChange={(value) => updateConfig({ videoFormat: value })}
                        options={[
                          { value: 'mp4', label: 'MP4' },
                          { value: 'webm', label: 'WebM' },
                        ]}
                        className="w-28"
                      />
                    </div>
                  </>
                )}
                <div className="flex items-center gap-2">
                  <Text type="secondary" className="text-xs w-20">字幕</Text>
                  <Switch size="small" checked={session.config.includeSubtitles} onChange={(checked) => updateConfig({ includeSubtitles: checked })} />
                </div>
                <div className="flex items-center gap-2">
                  <Text type="secondary" className="text-xs w-20">独立音频</Text>
                  <Switch size="small" checked={session.config.includeAudio} onChange={(checked) => updateConfig({ includeAudio: checked })} />
                </div>
                <Text type="secondary" className="text-[11px]">
                  直出默认按分镜顺序生成结果；独立音频暂未单独拼装，优先导出图片/视频和字幕。
                </Text>
                <Button
                  type="primary"
                  onClick={session.activeExport === 'video' ? handleVideoExport : handleJianyingExport}
                  loading={exporting}
                >
                  {session.activeExport === 'video' ? '开始导出快速视频' : '开始导出剪映草稿'}
                </Button>
              </>
            )}
          </div>
        )}

        {session.templates.length > 0 && (
          <div className="flex flex-col gap-2">
            <Text className="text-zinc-400 text-xs">导出模板</Text>
            <List
              size="small"
              dataSource={session.templates}
              renderItem={(item) => (
                <List.Item
                  className="!border-zinc-800"
                  actions={[
                    <Button key="apply" size="small" onClick={() => handleApplyTemplate(item.id)}>
                      套用
                    </Button>,
                  ]}
                >
                  <div className="min-w-0">
                    <Space size={6}>
                      <Text className="text-zinc-200 text-xs">{item.name}</Text>
                      {item.source === 'builtin' && <Tag className="m-0 text-[10px]">内置</Tag>}
                    </Space>
                    <Text type="secondary" className="block text-[11px]">{item.exportType}</Text>
                    {item.description && (
                      <Text type="secondary" className="block text-[11px]">{item.description}</Text>
                    )}
                  </div>
                </List.Item>
              )}
            />
          </div>
        )}

        {session.history.length > 0 && (
          <div className="flex flex-col gap-2">
            <Text className="text-zinc-400 text-xs">导出历史</Text>
            {session.history.map((item, index) => (
              <div key={`${item.path}-${index}`} className="flex items-center gap-2 text-xs text-zinc-500">
                <span>{item.time}</span>
                <Tag className="text-[10px]">{item.type}</Tag>
                <span>{item.count} 项</span>
                {item.templateName && <span>{item.templateName}</span>}
                {electronService.isElectron() && (
                  <Button
                    size="small"
                    type="text"
                    icon={<FolderOpenOutlined />}
                    className="text-[10px]"
                    onClick={() => electronService.shell.showItemInFolder(item.path)}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
