/**
 * 项目设置弹窗
 * 允许编辑项目信息和媒体配置
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Form, Input, App, Tabs } from 'antd';
import type { Project } from '../../types';
import { ProjectMediaSelector } from './ProjectMediaSelector';

interface ProjectSettingsModalProps {
  project: Project | null;
  open: boolean;
  onClose: () => void;
  onSave: (updates: Partial<Project>) => void;
  onGoToGlobalSettings?: () => void;
}

export const ProjectSettingsModal: React.FC<ProjectSettingsModalProps> = ({
  project,
  open,
  onClose,
  onSave,
  onGoToGlobalSettings,
}) => {
  const { message } = App.useApp();
  const { t } = useTranslation('project');
  const [form] = Form.useForm();
  const [activeTab, setActiveTab] = useState('basic');
  const [mediaConfigs, setMediaConfigs] = useState<{
    llmConfigId?: string;
    ttiConfigId?: string;
    itvConfigId?: string;
    ttsConfigId?: string;
  }>({});

  useEffect(() => {
    if (project && open) {
      form.setFieldsValue({
        title: project.title,
        genre: project.genre,
      });
      setMediaConfigs({
        llmConfigId: project.llmConfigId,
        ttiConfigId: project.ttiConfigId,
        itvConfigId: project.itvConfigId,
        ttsConfigId: project.ttsConfigId,
      });
    }
  }, [project, open, form]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      onSave({
        title: values.title,
        genre: values.genre,
        ...mediaConfigs,
      });
      // message.success('项目设置已保存');
      onClose();
    } catch (err) {
      // 验证失败
    }
  };

  const tabItems = [
    {
      key: 'basic',
      label: t('settingsModal.tabBasic'),
      children: (
        <Form form={form} layout="vertical">
          <Form.Item
            name="title"
            label={t('settingsModal.projectNameLabel')}
            rules={[{ required: true, message: t('settingsModal.projectNameRequired') }]}
          >
            <Input placeholder={t('settingsModal.projectNameLabel')} />
          </Form.Item>

          <Form.Item name="genre" label={t('settingsModal.genreLabel')}>
            <Input placeholder={t('settingsModal.genrePlaceholder')} />
          </Form.Item>
        </Form>
      ),
    },
    {
      key: 'media',
      label: t('settingsModal.tabMedia'),
      children: (
        <>
          <div style={{ marginBottom: 16, color: '#888', fontSize: 13 }}>
            {t('settingsModal.mediaDesc')}
          </div>
          <ProjectMediaSelector
            llmConfigId={mediaConfigs.llmConfigId}
            ttiConfigId={mediaConfigs.ttiConfigId}
            itvConfigId={mediaConfigs.itvConfigId}
            ttsConfigId={mediaConfigs.ttsConfigId}
            onChange={setMediaConfigs}
            onGoToSettings={onGoToGlobalSettings}
          />
        </>
      ),
    },
  ];

  return (
    <Modal
      title={t('settingsModal.title')}
      open={open}
      onOk={handleSave}
      onCancel={onClose}
      okText={t('common:save')}
      cancelText={t('common:cancel')}
      width={600}
      maskClosable={false}
      destroyOnHidden
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        style={{ marginTop: 8 }}
      />
    </Modal>
  );
};
