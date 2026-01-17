/**
 * 项目设置弹窗
 * 允许编辑项目信息和媒体配置
 */
import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Divider, App } from 'antd';
import type { Project } from '../types';
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

  return (
    <Modal
      title="项目设置"
      open={open}
      onOk={handleSave}
      onCancel={onClose}
      okText="保存"
      cancelText="取消"
      width={560}
      maskClosable={false}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
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

        <Divider>媒体服务配置</Divider>

        <div style={{ marginBottom: 8, color: '#888', fontSize: 13 }}>
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
      </Form>
    </Modal>
  );
};
