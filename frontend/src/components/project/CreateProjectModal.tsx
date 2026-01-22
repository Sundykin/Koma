import React, { useState } from 'react';
import { Modal, Form, Input, Radio, Space, Tooltip } from 'antd';
import {
  SoundOutlined,
  AppstoreOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import { Check } from 'lucide-react';
import { THEME_PRESETS } from '../../config/themePresets';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: {
    title: string;
    mode: 'drama' | 'narration';
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
        initialValues={{ mode: 'drama' }}
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
            <Space orientation="vertical" style={{ width: '100%' }} size="middle">
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
                      ? 'bg-emerald-900/30 border-2 border-emerald-500'
                      : 'bg-zinc-800 border-2 border-zinc-700 hover:border-zinc-500'
                    }
                  `}
                  onClick={() => setSelectedTheme(theme.id)}
                >
                  {isSelected && (
                    <div className="absolute top-1 right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 text-white" />
                    </div>
                  )}
                  <div className="text-xs font-medium text-zinc-200">{theme.name}</div>
                </div>
              );
            })}
            {/* 自定义选项 */}
            <div
              className={`
                relative p-2 rounded-lg cursor-pointer transition-all text-center
                ${selectedTheme === 'custom'
                  ? 'bg-emerald-900/30 border-2 border-emerald-500'
                  : 'bg-zinc-800 border-2 border-zinc-700 hover:border-zinc-500'
                }
              `}
              onClick={() => setSelectedTheme('custom')}
            >
              {selectedTheme === 'custom' && (
                <div className="absolute top-1 right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-white" />
                </div>
              )}
              <div className="text-xs font-medium text-zinc-200">自定义</div>
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
            <div className="mt-2 text-xs text-zinc-500">
              {THEME_PRESETS.find(t => t.id === selectedTheme)?.description}
            </div>
          )}
        </Form.Item>
      </Form>
    </Modal>
  );
};
