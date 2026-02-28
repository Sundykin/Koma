/**
 * 视频混音对话框
 * 对已生成的视频进行二次编辑
 */
import React, { useState } from 'react';
import {
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  Space,
  Typography,
  Alert,
  Progress,
  App,
} from 'antd';
import { VideoCameraOutlined } from '@ant-design/icons';

const { TextArea } = Input;
const { Text } = Typography;

export interface RemixModalProps {
  open: boolean;
  videoTaskId: string;
  videoUrl?: string;
  onCancel: () => void;
  onSubmit: (params: {
    prompt: string;
    duration?: number;
    aspectRatio?: string;
    model?: string;
  }) => Promise<void>;
}

export const VideoRemixModal: React.FC<RemixModalProps> = ({
  open,
  videoTaskId,
  videoUrl,
  onCancel,
  onSubmit,
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      setProgress(0);

      // 模拟进度
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 5, 90));
      }, 500);

      await onSubmit({
        prompt: values.prompt,
        duration: values.duration,
        aspectRatio: values.aspectRatio,
        model: values.model,
      });

      clearInterval(progressInterval);
      setProgress(100);
      message.success('混音任务已提交');
      form.resetFields();
      onCancel();
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(`混音失败: ${err.message}`);
    } finally {
      setSubmitting(false);
      setProgress(0);
    }
  };

  return (
    <Modal
      title={
        <Space>
          <VideoCameraOutlined />
          <span>视频混音</span>
        </Space>
      }
      open={open}
      onOk={handleSubmit}
      onCancel={onCancel}
      okText={submitting ? '处理中...' : '开始混音'}
      cancelText="取消"
      confirmLoading={submitting}
      width={520}
      maskClosable={!submitting}
      closable={!submitting}
      destroyOnHidden
    >
      <Alert
        message="混音功能说明"
        description="混音可以对已生成的视频进行二次编辑，根据新的提示词生成变体视频。"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      {videoUrl && (
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary">原视频预览：</Text>
          <video
            src={videoUrl}
            controls
            style={{ width: '100%', maxHeight: 200, marginTop: 8, borderRadius: 8 }}
          />
        </div>
      )}

      <Form form={form} layout="vertical">
        <Form.Item
          name="prompt"
          label="混音指令"
          rules={[{ required: true, message: '请输入混音指令' }]}
          tooltip="描述你希望对视频做的修改，例如：将场景改为夜晚、添加雨天效果"
        >
          <TextArea
            rows={4}
            placeholder="描述你希望对视频做的修改..."
            maxLength={1000}
            showCount
          />
        </Form.Item>

        <Form.Item name="model" label="模型">
          <Input placeholder="可选，留空则使用当前 ITV 渠道默认模型" />
        </Form.Item>

        <Space size="large" style={{ width: '100%' }}>
          <Form.Item name="duration" label="时长（秒）" style={{ marginBottom: 0 }}>
            <InputNumber min={5} max={25} placeholder="默认保持原时长" style={{ width: 150 }} />
          </Form.Item>

          <Form.Item name="aspectRatio" label="宽高比" style={{ marginBottom: 0 }}>
            <Select placeholder="默认保持原比例" allowClear style={{ width: 150 }}>
              <Select.Option value="16:9">16:9 横屏</Select.Option>
              <Select.Option value="9:16">9:16 竖屏</Select.Option>
              <Select.Option value="1:1">1:1 方形</Select.Option>
            </Select>
          </Form.Item>
        </Space>
      </Form>

      {submitting && (
        <div style={{ marginTop: 16 }}>
          <Text type="secondary">正在处理混音任务...</Text>
          <Progress percent={progress} status="active" />
        </div>
      )}
    </Modal>
  );
};

export default VideoRemixModal;
