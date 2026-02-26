/**
 * 导出对话框组件
 */
import React, { useState, useCallback, useRef } from 'react';
import { Modal, Form, Select, InputNumber, Input, Button, Progress, Space, Radio, App } from 'antd';
import { ExportOutlined, FolderOutlined } from '@ant-design/icons';
import { useTrackStore } from '../../store/trackStore';
import { useShallow } from 'zustand/react/shallow';
import { ExportRenderer, ExportConfig, ExportProgress } from '../../services/exportRenderer';
import { saveFileDialog } from '../../services/electronService';

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
}

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
  { label: '1080p (1920×1080)', width: 1920, height: 1080 },
  { label: '720p (1280×720)', width: 1280, height: 720 },
  { label: '480p (854×480)', width: 854, height: 480 },
  { label: '4K (3840×2160)', width: 3840, height: 2160 },
];

export function ExportDialog({ open, onClose }: ExportDialogProps) {
  const { modal } = App.useApp();
  const { tracks, config: timelineConfig } = useTrackStore(useShallow(s => ({
    tracks: s.tracks,
    config: s.config,
  })));

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
      console.error('[ExportDialog] Select output failed:', err);
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
        title: '导出完成',
        content: `视频已保存到: ${config.outputPath}`,
      });

      onClose();
    } catch (err) {
      if ((err as Error).message !== 'Export aborted') {
        modal.error({
          title: '导出失败',
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
      title="导出视频"
      open={open}
      onCancel={handleCancel}
      footer={null}
      width={500}
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
          <Form.Item label="分辨率预设">
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
            <Form.Item name="width" label="宽度" rules={[{ required: true }]}>
              <InputNumber min={320} max={7680} step={2} addonAfter="px" />
            </Form.Item>
            <Form.Item name="height" label="高度" rules={[{ required: true }]}>
              <InputNumber min={240} max={4320} step={2} addonAfter="px" />
            </Form.Item>
            <Form.Item name="fps" label="帧率" rules={[{ required: true }]}>
              <InputNumber min={15} max={120} addonAfter="fps" />
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

          {/* 导出按钮 */}
          <Form.Item>
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
