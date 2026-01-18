import React, { useState } from 'react';
import { Modal, Form, Input, Radio, Button, message, Space, Tooltip } from 'antd';
import {
  SoundOutlined,
  AppstoreOutlined,
  BulbOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import { Check } from 'lucide-react';
import { THEME_PRESETS } from '../config/themePresets';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: {
    title: string;
    mode: 'drama' | 'narration';
    script: string;
    theme?: string;
    stylePrompt?: string;
  }) => void;
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({ isOpen, onClose, onCreate }) => {
  const [form] = Form.useForm();
  const [selectedTheme, setSelectedTheme] = useState<string>('realistic');
  const [customStyle, setCustomStyle] = useState('');

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      onCreate({
        title: values.title,
        mode: values.mode || 'drama',
        script: values.script || '',
        theme: selectedTheme !== 'custom' ? selectedTheme : undefined,
        stylePrompt: selectedTheme === 'custom' ? customStyle : undefined,
      });
      form.resetFields();
      setSelectedTheme('realistic');
      setCustomStyle('');
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

  // 过滤掉 custom 选项，单独处理
  const presetThemes = THEME_PRESETS.filter(t => t.id !== 'custom');

  return (
    <Modal
      title="创建项目"
      open={isOpen}
      onCancel={onClose}
      onOk={handleCreate}
      okText="立即创建"
      cancelText="取消"
      width={680}
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
                style={{ width: '100%', height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
                style={{ width: '100%', height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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

        {/* 视觉风格选择 */}
        <Form.Item label="视觉风格">
          <div className="grid grid-cols-4 gap-2">
            {presetThemes.map(theme => {
              const isSelected = selectedTheme === theme.id;
              return (
                <div
                  key={theme.id}
                  className={`
                    relative p-2 rounded-lg cursor-pointer transition-all text-center
                    ${isSelected
                      ? 'bg-[#1a2e1a] border-2 border-green-500'
                      : 'bg-[#1a1a1a] border-2 border-gray-700 hover:border-gray-500'
                    }
                  `}
                  onClick={() => setSelectedTheme(theme.id)}
                >
                  {isSelected && (
                    <div className="absolute top-1 right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 text-white" />
                    </div>
                  )}
                  <div className="text-xs font-medium text-gray-200">{theme.name}</div>
                </div>
              );
            })}
            {/* 自定义选项 */}
            <div
              className={`
                relative p-2 rounded-lg cursor-pointer transition-all text-center
                ${selectedTheme === 'custom'
                  ? 'bg-[#1a2e1a] border-2 border-green-500'
                  : 'bg-[#1a1a1a] border-2 border-gray-700 hover:border-gray-500'
                }
              `}
              onClick={() => setSelectedTheme('custom')}
            >
              {selectedTheme === 'custom' && (
                <div className="absolute top-1 right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-white" />
                </div>
              )}
              <div className="text-xs font-medium text-gray-200">自定义</div>
            </div>
          </div>

          {selectedTheme === 'custom' && (
            <Input.TextArea
              className="mt-2"
              placeholder="输入自定义风格描述，如: 水彩画风格，柔和色彩..."
              value={customStyle}
              onChange={e => setCustomStyle(e.target.value)}
              rows={2}
            />
          )}

          {selectedTheme && selectedTheme !== 'custom' && (
            <div className="mt-2 text-xs text-gray-500">
              {THEME_PRESETS.find(t => t.id === selectedTheme)?.description}
            </div>
          )}
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
          labelCol={{ span: 24 }}
        >
          <Input.TextArea
            placeholder='请输入剧本,将为你自动分集 (文本请用"第n章/集"分割)'
            rows={4}
            showCount
            maxLength={50000}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};
