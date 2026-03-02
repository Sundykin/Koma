/**
 * 新建角色弹窗
 */
import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Form, Input, Select, Button, App } from 'antd';
import { UserAddOutlined } from '@ant-design/icons';
import { v4 as uuidv4 } from 'uuid';
import type { Character } from '../../types';
import { saveCharacters, loadCharacters } from '../../store/projectStore';
import { toUserMessage } from '../../utils/errorMessages';

interface CreateCharacterModalProps {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onCreate: (character: Character) => void;
}

export const CreateCharacterModal: React.FC<CreateCharacterModalProps> = ({
  open,
  projectId,
  onClose,
  onCreate,
}) => {
  const { t } = useTranslation(['asset', 'common']);
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const newCharacter: Character = {
        id: uuidv4(),
        name: values.name,
        role: values.role || 'supporting',
        prompt: values.prompt || '',  // 统一使用 prompt 字段
      };

      // 保存到存储
      const characters = await loadCharacters(projectId);
      characters.push(newCharacter);
      await saveCharacters(projectId, characters);

      onCreate(newCharacter);
      form.resetFields();
      onClose();
      message.success(t('createCharacter.successCreated'));
    } catch (err: any) {
      if (err.errorFields) {
        // 表单验证错误
        return;
      }
      message.error(toUserMessage(err) || t('createCharacter.errorCreate'));
    } finally {
      setLoading(false);
    }
  }, [form, projectId, onCreate, onClose, message]);

  const handleCancel = useCallback(() => {
    form.resetFields();
    onClose();
  }, [form, onClose]);

  const roleOptions = [
    { value: 'protagonist', label: t('character.role.protagonist') },
    { value: 'antagonist', label: t('character.role.antagonist') },
    { value: 'supporting', label: t('character.role.supporting') },
  ];

  return (
    <Modal
      title={
        <span>
          <UserAddOutlined style={{ marginRight: 8 }} />
          {t('createCharacter.title')}
        </span>
      }
      open={open}
      onCancel={handleCancel}
      onOk={handleSubmit}
      okText={t('createCharacter.create')}
      cancelText={t('common:cancel')}
      confirmLoading={loading}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item
          name="name"
          label={t('createCharacter.form.name')}
          rules={[{ required: true, message: t('createCharacter.form.nameRequired') }]}
        >
          <Input placeholder={t('createCharacter.form.namePlaceholder')} />
        </Form.Item>

        <Form.Item name="role" label={t('createCharacter.form.role')} initialValue="supporting">
          <Select options={roleOptions} />
        </Form.Item>

        <Form.Item name="age" label={t('createCharacter.form.age')}>
          <Input placeholder={t('createCharacter.form.agePlaceholder')} />
        </Form.Item>

        <Form.Item name="description" label={t('createCharacter.form.description')}>
          <TextArea rows={2} placeholder={t('createCharacter.form.descriptionPlaceholder')} />
        </Form.Item>

        <Form.Item name="appearance" label={t('createCharacter.form.appearance')}>
          <TextArea rows={3} placeholder={t('createCharacter.form.appearancePlaceholder')} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default CreateCharacterModal;
