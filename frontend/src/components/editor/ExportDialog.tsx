/**
 * 导出对话框组件
 */
import React, { useState, useCallback, useRef } from 'react';
import { Modal, Form, Select, InputNumber, Input, Button, Progress, Space, Radio, App } from 'antd';
import { ExportOutlined, FolderOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useTrackStore } from '../../store/trackStore';
import { ExportRenderer, ExportConfig, ExportProgress } from '../../services/exportRenderer';
import { saveFileDialog } from '../../services/electronService';
import { VIDEO_RESOLUTIONS } from '../../constants/dimensions';
import { createLogger } from '../../store/logger';

const logger = createLogger('ExportDialog');

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
}

const RESOLUTION_PRESETS = [
  { label: '1080p (1920×1080)', ...VIDEO_RESOLUTIONS['1080p'] },
  { label: '720p (1280×720)', ...VIDEO_RESOLUTIONS['720p'] },
  { label: '480p (854×480)', ...VIDEO_RESOLUTIONS['480p'] },
  { label: '4K (3840×2160)', ...VIDEO_RESOLUTIONS['4K'] },
];

export function ExportDialog({ open, onClose }: ExportDialogProps) {
  const { t } = useTranslation();
  const { modal } = App.useApp();
  const { tracks, config: timelineConfig } = useTrackStore();

  const FORMAT_OPTIONS = [
    { value: 'mp4', label: 'MP4 (H.264)' },
    { value: 'webm', label: 'WebM (VP9)' },
    { value: 'gif', label: t('video.gifAnimation') },
  ];

  const QUALITY_OPTIONS = [
    { value: 'low', label: t('video.lowQuality') },
    { value: 'medium', label: t('video.mediumQuality') },
    { value: 'high', label: t('video.highQuality') },
    { value: 'custom', label: t('video.customQuality') },
  ];

  const [form] = Form.useForm();
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const exporterRef = useRef<ExportRenderer | null>(null);

  // 处理输出路径选择
  const handleSelectOutput = useCallback(async () => {
    try {
      const result = await saveFileDialog({
        defaultPath: `export_${Date.now()}.mp4`,
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
      logger.error('Select output failed:', err);
    }
  }, [form]);

  // 开始导出
  const handleExport = useCallback(async () => {
    try {
      const values = await form.validateFields();

      const config: ExportConfig = {
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

      const exporter = new ExportRenderer(config);
      exporterRef.current = exporter;

      exporter.onProgress((p) => {
        setProgress(p);
      });

      await exporter.export(tracks);

      // 导出完成
      modal.success({
        title: t('video.exportComplete'),
        content: `${t('video.savedTo')}: ${config.outputPath}`,
      });

      onClose();
    } catch (err) {
      if ((err as Error).message !== 'Export aborted') {
        modal.error({
          title: t('video.exportFailed'),
          content: (err as Error).message,
        });
      }
    } finally {
      setExporting(false);
      exporterRef.current?.dispose();
      exporterRef.current = null;
    }
  }, [form, tracks, onClose]);

  // 取消导出
  const handleCancel = useCallback(() => {
    if (exporting) {
      exporterRef.current?.abort();
    } else {
      onClose();
    }
  }, [exporting, onClose]);

  // 分辨率预设变更
  const handleResolutionPreset = useCallback((preset: typeof RESOLUTION_PRESETS[0]) => {
    form.setFieldsValue({
      width: preset.width,
      height: preset.height,
    });
  }, [form]);

  return (
    <Modal
      title={t('video.export')}
      open={open}
      onCancel={handleCancel}
      footer={null}
      width={500}
      mask={{ closable: !exporting }}
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
              {t('video.frame')} {progress.currentFrame} / {progress.totalFrames}
              {progress.estimatedTimeRemaining !== undefined && (
                <> · {t('video.remaining')} {Math.round(progress.estimatedTimeRemaining)}{t('video.seconds')}</>
              )}
            </p>
          )}
          <Button
            danger
            onClick={handleCancel}
            style={{ marginTop: 16 }}
          >
            {t('video.cancelExport')}
          </Button>
        </div>
      ) : (
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            width: timelineConfig.width,
            height: timelineConfig.height,
            fps: timelineConfig.fps,
            format: 'mp4',
            quality: 'medium',
            videoBitrate: 5000,
            audioBitrate: 192,
            outputPath: '',
          }}
        >
          {/* 分辨率预设 */}
          <Form.Item label={t('video.resolutionPreset')}>
            <Radio.Group
              buttonStyle="solid"
              onChange={(e) => {
                const preset = RESOLUTION_PRESETS.find(
                  (p) => `${p.width}x${p.height}` === e.target.value
                );
                if (preset) handleResolutionPreset(preset);
              }}
            >
              {RESOLUTION_PRESETS.map((p) => (
                <Radio.Button key={`${p.width}x${p.height}`} value={`${p.width}x${p.height}`}>
                  {p.label.split(' ')[0]}
                </Radio.Button>
              ))}
            </Radio.Group>
          </Form.Item>

          {/* 自定义分辨率 */}
          <Space>
            <Form.Item name="width" label={t('video.width')} rules={[{ required: true }]}>
              <InputNumber min={320} max={7680} step={2} addonAfter="px" />
            </Form.Item>
            <Form.Item name="height" label={t('video.height')} rules={[{ required: true }]}>
              <InputNumber min={240} max={4320} step={2} addonAfter="px" />
            </Form.Item>
            <Form.Item name="fps" label={t('video.frameRate')} rules={[{ required: true }]}>
              <InputNumber min={15} max={120} addonAfter="fps" />
            </Form.Item>
          </Space>

          {/* 格式和质量 */}
          <Space style={{ width: '100%' }}>
            <Form.Item name="format" label={t('video.format')} rules={[{ required: true }]}>
              <Select options={FORMAT_OPTIONS} style={{ width: 150 }} />
            </Form.Item>
            <Form.Item name="quality" label={t('video.quality')} rules={[{ required: true }]}>
              <Select options={QUALITY_OPTIONS} style={{ width: 200 }} />
            </Form.Item>
          </Space>

          {/* 自定义码率 */}
          <Form.Item noStyle shouldUpdate={(prev, curr) => prev.quality !== curr.quality}>
            {({ getFieldValue }) =>
              getFieldValue('quality') === 'custom' ? (
                <Space>
                  <Form.Item name="videoBitrate" label={t('video.videoBitrate')}>
                    <InputNumber min={500} max={50000} addonAfter="kbps" />
                  </Form.Item>
                  <Form.Item name="audioBitrate" label={t('video.audioBitrate')}>
                    <InputNumber min={64} max={512} addonAfter="kbps" />
                  </Form.Item>
                </Space>
              ) : null
            }
          </Form.Item>

          {/* 输出路径 */}
          <Form.Item
            name="outputPath"
            label={t('video.saveLocation')}
            rules={[{ required: true, message: t('video.selectSaveLocation') }]}
          >
            <Input
              placeholder={t('video.clickToSelect')}
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

          {/* 导出按钮 */}
          <Form.Item>
            <Space>
              <Button onClick={onClose}>{t('common.cancel')}</Button>
              <Button
                type="primary"
                icon={<ExportOutlined />}
                onClick={handleExport}
              >
                {t('video.startExport')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
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
};

export default ExportDialog;
