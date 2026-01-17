import React from 'react';
import { Modal, Form, Input, Radio, Button, message, Space, Tooltip } from 'antd';
import {
  SoundOutlined,
  AppstoreOutlined,
  BulbOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: { title: string; mode: 'drama' | 'narration'; script: string }) => void;
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({ isOpen, onClose, onCreate }) => {
  const [form] = Form.useForm();

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      onCreate({
        title: values.title,
        mode: values.mode || 'drama',
        script: values.script || ''
      });
      form.resetFields();
    } catch {
      // 验证失败
    }
  };

  const generateRandomScript = () => {
    form.setFieldValue('script', `# 第一集:AI 随机生成的奇幻开端

[场景:云端之上]

主角睁开眼,发现自己正漂浮在云海之中。

主角
(惊讶)
"这是哪里?"

突然,一道金光划破天际...`);
    message.success('剧本已生成');
  };

  return (
    <Modal
      title="创建项目"
      open={isOpen}
      onCancel={onClose}
      onOk={handleCreate}
      okText="立即创建"
      cancelText="取消"
      width={600}
      centered
      maskClosable={false}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ mode: 'drama', script: '' }}
        style={{ marginTop: 16 }}
      >
        <Form.Item
          name="title"
          label="项目名称"
          rules={[{ required: true, message: '请输入项目名称' }]}
        >
          <Input placeholder="请输入短剧项目名称" autoFocus />
        </Form.Item>

        <Form.Item name="mode" label="叙事模式">
          <Radio.Group buttonStyle="solid" style={{ width: '100%' }}>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <Radio.Button
                value="drama"
                style={{ width: '100%', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Space>
                  <AppstoreOutlined />
                  <span style={{ fontWeight: 'bold' }}>剧情模式</span>
                  <Tooltip title="适合传统影视剧,包含对话、动作和场景描写">
                    <QuestionCircleOutlined style={{ opacity: 0.6, fontSize: 12 }} />
                  </Tooltip>
                </Space>
              </Radio.Button>
              <Radio.Button
                value="narration"
                style={{ width: '100%', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Space>
                  <SoundOutlined />
                  <span style={{ fontWeight: 'bold' }}>旁白解说模式</span>
                  <Tooltip title="适合纪录片或解说类视频,以旁白驱动画面">
                    <QuestionCircleOutlined style={{ opacity: 0.6, fontSize: 12 }} />
                  </Tooltip>
                </Space>
              </Radio.Button>
            </Space>
          </Radio.Group>
        </Form.Item>

        <Form.Item
          name="script"
          label={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              <span>剧本导入 <span style={{ color: '#666', fontWeight: 'normal' }}>(选填)</span></span>
              <Button
                type="link"
                size="small"
                icon={<BulbOutlined />}
                onClick={generateRandomScript}
                style={{ padding: 0, height: 'auto' }}
              >
                AI随机生成剧本
              </Button>
            </div>
          }
          labelCol={{ style: { width: '100%' } }}
        >
          <Input.TextArea
            placeholder='请输入剧本,将为你自动分集 (文本请用"第n章/集"分割)'
            rows={5}
            showCount
            maxLength={50000}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};
