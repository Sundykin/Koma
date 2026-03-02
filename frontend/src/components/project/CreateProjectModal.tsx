import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Form, Input, Radio, Space, Tooltip } from 'antd';
import {
  SoundOutlined,
  AppstoreOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import { Check } from 'lucide-react';
import { THEME_PRESETS } from '../../config/themePresets';
import { PROJECT_TEMPLATES, type ProjectTemplate } from '../../config/projectTemplates';

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
  const { t } = useTranslation('project');
  const [form] = Form.useForm();
  const [selectedTheme, setSelectedTheme] = useState<string>('realistic');
  const [customStyle, setCustomStyle] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const handleSelectTemplate = (template: ProjectTemplate) => {
    setSelectedTemplate(template.id);
    form.setFieldsValue({
      title: template.id === 'blank' ? '' : template.name,
      mode: template.mode,
    });
    setSelectedTheme(template.theme);
  };

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
  const presetThemes = THEME_PRESETS.filter(th => th.id !== 'custom');

  return (
    <Modal
      title={t('createModal.title')}
      open={isOpen}
      onCancel={onClose}
      onOk={handleCreate}
      okText={t('createModal.okText')}
      cancelText={t('common:cancel')}
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
        {/* 模板选择 */}
        <Form.Item label={t('createModal.templateLabel')}>
          <div className="grid grid-cols-3 gap-2 mb-2">
            {PROJECT_TEMPLATES.map(template => {
              const isSelected = selectedTemplate === template.id;
              return (
                <div
                  key={template.id}
                  className={`
                    relative p-3 rounded-lg cursor-pointer transition-all text-center
                    ${isSelected
                      ? 'bg-emerald-900/30 border-2 border-emerald-500'
                      : 'bg-zinc-800 border-2 border-zinc-700 hover:border-zinc-500'
                    }
                  `}
                  onClick={() => handleSelectTemplate(template)}
                >
                  {isSelected && (
                    <div className="absolute top-1 right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 text-white" />
                    </div>
                  )}
                  <div className="text-lg mb-1">{template.icon}</div>
                  <div className="text-xs font-medium text-zinc-200">{template.name}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">{template.description}</div>
                </div>
              );
            })}
          </div>
        </Form.Item>

        <Form.Item
          name="title"
          label={t('createModal.projectNameLabel')}
          rules={[{ required: true, message: t('createModal.projectNameRequired') }]}
        >
          <Input placeholder={t('createModal.projectNamePlaceholder')} autoFocus />
        </Form.Item>

        <Form.Item name="mode" label={t('createModal.narrativeModeLabel')}>
          <Radio.Group buttonStyle="solid" style={{ width: '100%' }}>
            <Space orientation="vertical" style={{ width: '100%' }} size="middle">
              <Radio.Button
                value="drama"
                style={{ width: '100%', height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Space>
                  <AppstoreOutlined />
                  <span style={{ fontWeight: 'bold' }}>{t('createModal.modeDrama')}</span>
                  <Tooltip title={t('createModal.modeDramaTooltip')}>
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
                  <span style={{ fontWeight: 'bold' }}>{t('createModal.modeNarration')}</span>
                  <Tooltip title={t('createModal.modeNarrationTooltip')}>
                    <QuestionCircleOutlined style={{ opacity: 0.6, fontSize: 12 }} />
                  </Tooltip>
                </Space>
              </Radio.Button>
            </Space>
          </Radio.Group>
        </Form.Item>

        {/* 视觉风格选择 */}
        <Form.Item label={t('createModal.visualStyleLabel')}>
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
              <div className="text-xs font-medium text-zinc-200">{t('createModal.customStyle')}</div>
            </div>
          </div>

          {selectedTheme === 'custom' && (
            <Input.TextArea
              className="mt-2"
              placeholder={t('createModal.customStylePlaceholder')}
              value={customStyle}
              onChange={e => setCustomStyle(e.target.value)}
              rows={2}
            />
          )}

          {selectedTheme && selectedTheme !== 'custom' && (
            <div className="mt-2 text-xs text-zinc-500">
              {THEME_PRESETS.find(th => th.id === selectedTheme)?.description}
            </div>
          )}
        </Form.Item>
      </Form>
    </Modal>
  );
};
