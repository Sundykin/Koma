/**
 * SimpleEditor 导出对话框
 * 支持视频导出和草稿导出（剪映等）
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Modal, Form, Select, InputNumber, Input, Button, Progress, Space, Radio, message, Segmented, Checkbox } from 'antd';
import { ExportOutlined, FolderOutlined } from '@ant-design/icons';
import { Track } from '../../types/editor';
import { SimpleExportRenderer, SimpleExportConfig, SimpleExportProgress } from '../../services/simpleExportRenderer';
import { saveFileDialog, selectDirectory, isElectron, writeFile, createDirectory, fsCopy, fsExists } from '../../services/electronService';
import { exporterRegistry, type DraftExportOptions } from '../../services/draftExport';
import type { JianyingDraftContent, JianyingDraftMetaInfo } from '../../types/jianying';

interface SimpleExportDialogProps {
  open: boolean;
  onClose: () => void;
  tracks: Track[];
  duration: number;
  canvasSize: { width: number; height: number };
}

type ExportType = 'video' | 'draft';

const FORMAT_OPTIONS = [
  { value: 'mp4', label: 'MP4 (H.264)' },
  { value: 'webm', label: 'WebM (VP9)' },
  { value: 'gif', label: 'GIF 动图' },
];

const QUALITY_OPTIONS = [
  { value: 'low', label: '低质量 (快速, ~2Mbps)' },
  { value: 'medium', label: '中等质量 (~5Mbps)' },
  { value: 'high', label: '高质量 (~10Mbps)' },
  { value: 'custom', label: '自定义' },
];

const RESOLUTION_PRESETS = [
  { label: '1080p', width: 1920, height: 1080 },
  { label: '720p', width: 1280, height: 720 },
  { label: '480p', width: 854, height: 480 },
  { label: '4K', width: 3840, height: 2160 },
];

const FPS_OPTIONS = [
  { value: 24, label: '24 fps (电影)' },
  { value: 30, label: '30 fps (标准)' },
  { value: 60, label: '60 fps (流畅)' },
];

export function SimpleExportDialog({ open, onClose, tracks, duration, canvasSize }: SimpleExportDialogProps) {
  const [form] = Form.useForm();
  const [draftForm] = Form.useForm();
  const [exportType, setExportType] = useState<ExportType>('video');
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<SimpleExportProgress | null>(null);
  const exporterRef = useRef<SimpleExportRenderer | null>(null);

  // 获取可用的草稿导出器
  const draftExporters = exporterRegistry.getAll();

  // 同步 canvasSize 到表单
  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        width: canvasSize.width,
        height: canvasSize.height,
      });
    }
  }, [open, canvasSize, form]);

  const handleSelectOutput = useCallback(async () => {
    try {
      const format = form.getFieldValue('format') || 'mp4';
      const result = await saveFileDialog({
        defaultPath: `export_${Date.now()}.${format}`,
        filters: [
          { name: 'MP4 视频', extensions: ['mp4'] },
          { name: 'WebM 视频', extensions: ['webm'] },
          { name: 'GIF 动图', extensions: ['gif'] },
        ],
      });

      if (!result.canceled && result.filePath) {
        form.setFieldValue('outputPath', result.filePath);
      }
    } catch (err) {
      console.error('[SimpleExportDialog] Select output failed:', err);
    }
  }, [form]);

  const handleSelectDraftOutput = useCallback(async () => {
    try {
      const result = await selectDirectory({
        title: '选择草稿保存目录',
      });

      if (result && !result.canceled && result.filePaths?.[0]) {
        draftForm.setFieldValue('outputPath', result.filePaths[0]);
      }
    } catch (err) {
      console.error('[SimpleExportDialog] Select draft output failed:', err);
    }
  }, [draftForm]);

  const handleVideoExport = useCallback(async () => {
    try {
      const values = await form.validateFields();

      if (!isElectron()) {
        message.error('导出功能需要在桌面应用中使用');
        return;
      }

      const config: SimpleExportConfig = {
        width: values.width,
        height: values.height,
        fps: values.fps,
        format: values.format,
        quality: values.quality,
        videoBitrate: values.videoBitrate,
        audioBitrate: values.audioBitrate,
        outputPath: values.outputPath,
      };

      setExporting(true);
      setProgress(null);

      const exporter = new SimpleExportRenderer(config);
      exporterRef.current = exporter;

      exporter.onProgress((p) => {
        setProgress(p);
      });

      await exporter.export(tracks, duration);

      Modal.success({
        title: '导出完成',
        content: `视频已保存到: ${config.outputPath}`,
      });

      onClose();
    } catch (err) {
      if ((err as Error).message !== 'Export aborted') {
        Modal.error({
          title: '导出失败',
          content: (err as Error).message,
        });
      }
    } finally {
      setExporting(false);
      exporterRef.current?.dispose();
      exporterRef.current = null;
    }
  }, [form, tracks, duration, onClose]);

  const handleDraftExport = useCallback(async () => {
    try {
      const values = await draftForm.validateFields();

      if (!isElectron()) {
        message.error('导出功能需要在桌面应用中使用');
        return;
      }

      const exporter = exporterRegistry.get(values.format);
      if (!exporter) {
        message.error('未找到对应的导出器');
        return;
      }

      setExporting(true);

      const draftFolderPath = `${values.outputPath}/${values.projectName}`;
      const options: DraftExportOptions = {
        outputPath: draftFolderPath,
        projectName: values.projectName,
        fps: 30,
        copyMaterials: values.copyMaterials || false,
      };

      const result = await exporter.export(tracks, options, canvasSize);

      if (result.success) {
        const exportResult = result as typeof result & {
          draftContent: JianyingDraftContent;
          draftMetaInfo: JianyingDraftMetaInfo;
        };

        // 创建草稿目录
        await createDirectory(draftFolderPath);

        // 如果需要复制素材
        if (values.copyMaterials) {
          const materialsDir = `${draftFolderPath}/materials`;
          await createDirectory(materialsDir);

          // 收集所有素材路径并复制
          const materials = exportResult.draftContent.materials;
          const pathMap = new Map<string, string>(); // 原路径 -> 新路径

          // 复制视频/图片素材
          for (const video of materials.videos || []) {
            if (video.path && !video.path.startsWith('http')) {
              const fileName = video.path.split(/[/\\]/).pop() || `video_${video.id}`;
              const newPath = `${materialsDir}/${fileName}`;
              try {
                if (await fsExists(video.path)) {
                  await fsCopy(video.path, newPath);
                  pathMap.set(video.path, newPath);
                  video.path = newPath;
                }
              } catch (e) {
                console.warn(`复制素材失败: ${video.path}`, e);
              }
            }
          }

          // 复制音频素材
          for (const audio of materials.audios || []) {
            if (audio.path && !audio.path.startsWith('http')) {
              const fileName = audio.path.split(/[/\\]/).pop() || `audio_${audio.id}`;
              const newPath = `${materialsDir}/${fileName}`;
              try {
                if (await fsExists(audio.path)) {
                  await fsCopy(audio.path, newPath);
                  pathMap.set(audio.path, newPath);
                  audio.path = newPath;
                }
              } catch (e) {
                console.warn(`复制素材失败: ${audio.path}`, e);
              }
            }
          }
        }

        // 写入 draft_content.json
        await writeFile(
          `${draftFolderPath}/draft_content.json`,
          JSON.stringify(exportResult.draftContent, null, 2)
        );

        // 写入 draft_meta_info.json
        await writeFile(
          `${draftFolderPath}/draft_meta_info.json`,
          JSON.stringify(exportResult.draftMetaInfo, null, 2)
        );

        Modal.success({
          title: '导出完成',
          content: (
            <div>
              <p>草稿已保存到: {draftFolderPath}</p>
              {values.copyMaterials && <p style={{ color: '#52c41a' }}>素材已复制到草稿目录</p>}
              {result.warnings && result.warnings.length > 0 && (
                <div style={{ marginTop: 8, color: '#faad14' }}>
                  <p>警告:</p>
                  <ul>
                    {result.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ),
        });

        onClose();
      } else {
        Modal.error({
          title: '导出失败',
          content: result.error,
        });
      }
    } catch (err) {
      Modal.error({
        title: '导出失败',
        content: (err as Error).message,
      });
    } finally {
      setExporting(false);
    }
  }, [draftForm, tracks, canvasSize, onClose]);

  const handleExport = useCallback(() => {
    if (exportType === 'video') {
      handleVideoExport();
    } else {
      handleDraftExport();
    }
  }, [exportType, handleVideoExport, handleDraftExport]);

  const handleCancel = useCallback(() => {
    if (exporting) {
      exporterRef.current?.abort();
    } else {
      onClose();
    }
  }, [exporting, onClose]);

  const handleResolutionPreset = useCallback((preset: typeof RESOLUTION_PRESETS[0]) => {
    form.setFieldsValue({
      width: preset.width,
      height: preset.height,
    });
  }, [form]);

  return (
    <Modal
      title="导出"
      open={open}
      onCancel={handleCancel}
      footer={null}
      width={520}
      maskClosable={!exporting}
      closable={!exporting}
    >
      {exporting && progress ? (
        <div style={styles.progressContainer}>
          <Progress
            percent={Math.round(progress.progress)}
            status={progress.stage === 'error' ? 'exception' : 'active'}
          />
          <p style={styles.progressMessage}>{progress.message}</p>
          {progress.stage === 'rendering' && (
            <p style={styles.progressDetail}>
              帧 {progress.currentFrame} / {progress.totalFrames}
              {progress.estimatedTimeRemaining !== undefined && (
                <> · 剩余约 {Math.round(progress.estimatedTimeRemaining)}秒</>
              )}
            </p>
          )}
          <Button
            danger
            onClick={handleCancel}
            style={{ marginTop: 16 }}
          >
            取消导出
          </Button>
        </div>
      ) : (
        <>
          {/* 导出类型选择 */}
          <div style={styles.typeSelector}>
            <Segmented
              value={exportType}
              onChange={(v) => setExportType(v as ExportType)}
              options={[
                { label: '视频导出', value: 'video' },
                { label: '草稿导出', value: 'draft' },
              ]}
              block
            />
          </div>

          {exportType === 'video' ? (
            // 视频导出表单
            <Form
              form={form}
              layout="vertical"
              initialValues={{
                width: 1920,
                height: 1080,
                fps: 30,
                format: 'mp4',
                quality: 'medium',
                videoBitrate: 5000,
                audioBitrate: 192,
                outputPath: '',
              }}
            >
              {/* 分辨率预设 */}
              <Form.Item label="分辨率预设">
                <Radio.Group
                  buttonStyle="solid"
                  onChange={(e) => {
                    const preset = RESOLUTION_PRESETS.find(
                      (p) => `${p.width}x${p.height}` === e.target.value
                    );
                    if (preset) handleResolutionPreset(preset);
                  }}
                  defaultValue="1920x1080"
                >
                  {RESOLUTION_PRESETS.map((p) => (
                    <Radio.Button key={`${p.width}x${p.height}`} value={`${p.width}x${p.height}`}>
                      {p.label}
                    </Radio.Button>
                  ))}
                </Radio.Group>
              </Form.Item>

              {/* 自定义分辨率 */}
              <Space>
                <Form.Item name="width" label="宽度" rules={[{ required: true }]}>
                  <InputNumber min={320} max={7680} step={2} addonAfter="px" />
                </Form.Item>
                <Form.Item name="height" label="高度" rules={[{ required: true }]}>
                  <InputNumber min={240} max={4320} step={2} addonAfter="px" />
                </Form.Item>
                <Form.Item name="fps" label="帧率" rules={[{ required: true }]}>
                  <Select options={FPS_OPTIONS} style={{ width: 130 }} />
                </Form.Item>
              </Space>

              {/* 格式和质量 */}
              <Space style={{ width: '100%' }}>
                <Form.Item name="format" label="格式" rules={[{ required: true }]}>
                  <Select options={FORMAT_OPTIONS} style={{ width: 150 }} />
                </Form.Item>
                <Form.Item name="quality" label="质量" rules={[{ required: true }]}>
                  <Select options={QUALITY_OPTIONS} style={{ width: 200 }} />
                </Form.Item>
              </Space>

              {/* 自定义码率 */}
              <Form.Item noStyle shouldUpdate={(prev, curr) => prev.quality !== curr.quality}>
                {({ getFieldValue }) =>
                  getFieldValue('quality') === 'custom' ? (
                    <Space>
                      <Form.Item name="videoBitrate" label="视频码率">
                        <InputNumber min={500} max={50000} addonAfter="kbps" />
                      </Form.Item>
                      <Form.Item name="audioBitrate" label="音频码率">
                        <InputNumber min={64} max={512} addonAfter="kbps" />
                      </Form.Item>
                    </Space>
                  ) : null
                }
              </Form.Item>

              {/* 输出路径 */}
              <Form.Item
                name="outputPath"
                label="保存位置"
                rules={[{ required: true, message: '请选择保存位置' }]}
              >
                <Input
                  placeholder="点击选择保存位置"
                  readOnly
                  addonAfter={
                    <Button
                      type="text"
                      icon={<FolderOutlined />}
                      onClick={handleSelectOutput}
                      style={{ margin: -8 }}
                    />
                  }
                />
              </Form.Item>

              {/* 视频信息 */}
              <div style={styles.infoBox}>
                <p>时长: {duration.toFixed(1)} 秒</p>
                <p>轨道: {tracks.length} 个</p>
                <p>预计帧数: {Math.ceil(duration * (form.getFieldValue('fps') || 30))} 帧</p>
              </div>
            </Form>
          ) : (
            // 草稿导出表单
            <Form
              form={draftForm}
              layout="vertical"
              initialValues={{
                format: 'jianying',
                projectName: `导出_${new Date().toLocaleDateString()}`,
                outputPath: '',
                copyMaterials: true,
              }}
            >
              {/* 格式选择 */}
              <Form.Item name="format" label="导出格式" rules={[{ required: true }]}>
                <Select style={{ width: '100%' }}>
                  {draftExporters.map((exp) => (
                    <Select.Option key={exp.format} value={exp.format}>
                      {exp.displayName}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>

              {/* 草稿名称 */}
              <Form.Item
                name="projectName"
                label="草稿名称"
                rules={[{ required: true, message: '请输入草稿名称' }]}
              >
                <Input placeholder="输入草稿名称" />
              </Form.Item>

              {/* 输出目录 */}
              <Form.Item
                name="outputPath"
                label="保存目录"
                rules={[{ required: true, message: '请选择保存目录' }]}
              >
                <Input
                  placeholder="点击选择保存目录"
                  readOnly
                  addonAfter={
                    <Button
                      type="text"
                      icon={<FolderOutlined />}
                      onClick={handleSelectDraftOutput}
                      style={{ margin: -8 }}
                    />
                  }
                />
              </Form.Item>

              {/* 复制素材选项 */}
              <Form.Item name="copyMaterials" valuePropName="checked">
                <Checkbox>复制素材到草稿目录（推荐，防止原素材被删除导致草稿失效）</Checkbox>
              </Form.Item>

              {/* 项目信息 */}
              <div style={styles.infoBox}>
                <p>时长: {duration.toFixed(1)} 秒</p>
                <p>轨道: {tracks.length} 个</p>
                <p>画布尺寸: {canvasSize.width} × {canvasSize.height}</p>
                <p style={{ color: '#faad14', marginTop: 8 }}>
                  提示: 草稿导出后可在对应软件中打开并继续编辑
                </p>
              </div>
            </Form>
          )}

          {/* 导出按钮 */}
          <div style={styles.footer}>
            <Space>
              <Button onClick={onClose}>取消</Button>
              <Button
                type="primary"
                icon={<ExportOutlined />}
                onClick={handleExport}
              >
                开始导出
              </Button>
            </Space>
          </div>
        </>
      )}
    </Modal>
  );
}

const styles: Record<string, React.CSSProperties> = {
  progressContainer: {
    textAlign: 'center',
    padding: 24,
  },
  progressMessage: {
    marginTop: 12,
    color: '#d4d4d8',
  },
  progressDetail: {
    fontSize: 12,
    color: '#71717a',
  },
  typeSelector: {
    marginBottom: 20,
  },
  infoBox: {
    background: '#27272a',
    borderRadius: 8,
    padding: '12px 16px',
    marginBottom: 16,
    fontSize: 12,
    color: '#a1a1aa',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: 16,
  },
};

export default SimpleExportDialog;
