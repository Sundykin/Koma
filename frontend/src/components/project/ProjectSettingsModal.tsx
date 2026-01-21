/**
 * 项目设置弹窗
 * 允许编辑项目信息和媒体配置
 */
import React, { useState, useEffect } from 'react';
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
      message.success('项目设置已保存');
      onClose();
    } catch (err) {
      // 验证失败
    }
  };

  const tabItems = [
    {
      key: 'basic',
      label: '基本信息',
      children: (
        <Form form={form} layout="vertical">
          <Form.Item
            name="title"
            label="项目名称"
            rules={[{ required: true, message: '请输入项目名称' }]}
          >
            <Input placeholder="请输入项目名称" />
          </Form.Item>

          <Form.Item name="genre" label="题材类型">
            <Input placeholder="如: 悬疑、爱情、科幻" />
          </Form.Item>
        </Form>
      ),
    },
    {
      key: 'media',
      label: '媒体配置',
      children: (
        <>
          <div style={{ marginBottom: 16, color: '#888', fontSize: 13 }}>
            选择此项目使用的媒体生成服务，留空则使用全局默认配置。
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
      title="项目设置"
      open={open}
      onOk={handleSave}
      onCancel={onClose}
      okText="保存"
      cancelText="取消"
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
