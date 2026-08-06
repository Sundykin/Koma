/**
 * 新建角色弹窗
 * 两种模式：手动新建 / 从演员库选择（复用已有演员的设定、定妆照与音色）
 */
import React, { useState, useCallback, useEffect } from 'react';
import { Modal, Form, Input, Select, App, Segmented, Empty, Spin, Tag, Popconfirm } from 'antd';
import { UserAddOutlined, TeamOutlined, DeleteOutlined } from '@ant-design/icons';
import { v4 as uuidv4 } from 'uuid';
import type { Character, CharacterGender } from '../../types';
import type { ActorProfile } from '../../types/actor-library';
import { saveCharacters, loadCharacters } from '../../store/projectStore';
import { electronService } from '../../services/electronService';
import {
  createCharacterFromActor,
  deleteActor,
  loadActorLibrary,
} from '../../services/actorLibraryService';
import styles from './CreateCharacterModal.module.scss';

const { TextArea } = Input;

interface CreateCharacterModalProps {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onCreate: (character: Character) => void;
}

const GENDER_LABEL: Record<string, string> = {
  male: '男',
  female: '女',
  neutral: '中性',
  unknown: '未知',
};

const ROLE_LABEL: Record<string, string> = {
  protagonist: '主角',
  antagonist: '反派',
  supporting: '配角',
};

export const CreateCharacterModal: React.FC<CreateCharacterModalProps> = ({
  open,
  projectId,
  onClose,
  onCreate,
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'manual' | 'library'>('manual');

  const [actors, setActors] = useState<ActorProfile[]>([]);
  const [actorsLoading, setActorsLoading] = useState(false);
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || mode !== 'library') return;
    let cancelled = false;
    setActorsLoading(true);
    loadActorLibrary()
      .then(list => { if (!cancelled) setActors(list); })
      .catch(() => { if (!cancelled) setActors([]); })
      .finally(() => { if (!cancelled) setActorsLoading(false); });
    return () => { cancelled = true; };
  }, [open, mode]);

  const handleSubmit = useCallback(async () => {
    setLoading(true);
    try {
      let newCharacter: Character;

      if (mode === 'library') {
        const actor = actors.find(a => a.id === selectedActorId);
        if (!actor) {
          message.warning('请先选择一位演员');
          return;
        }
        newCharacter = await createCharacterFromActor(actor, projectId);
      } else {
        const values = await form.validateFields();
        newCharacter = {
          id: uuidv4(),
          name: values.name,
          role: values.role || 'supporting',
          age: values.age || undefined,
          gender: values.gender || 'unknown',
          prompt: values.prompt || '',
        };
      }

      // 保存到存储
      const characters = await loadCharacters(projectId);
      characters.push(newCharacter);
      await saveCharacters(projectId, characters);

      onCreate(newCharacter);
      form.resetFields();
      setSelectedActorId(null);
      onClose();
      message.success(mode === 'library' ? `已从演员库添加「${newCharacter.name}」` : '角色创建成功');
    } catch (err: any) {
      if (err?.errorFields) {
        // 表单验证错误
        return;
      }
      message.error(err.message || '创建失败');
    } finally {
      setLoading(false);
    }
  }, [form, mode, actors, selectedActorId, projectId, onCreate, onClose, message]);

  const handleCancel = useCallback(() => {
    form.resetFields();
    setSelectedActorId(null);
    onClose();
  }, [form, onClose]);

  const handleDeleteActor = useCallback(async (actor: ActorProfile) => {
    try {
      await deleteActor(actor.id);
      setActors(prev => prev.filter(a => a.id !== actor.id));
      if (selectedActorId === actor.id) setSelectedActorId(null);
      message.success(`已从演员库移除「${actor.name}」`);
    } catch (err: any) {
      message.error(err.message || '移除失败');
    }
  }, [selectedActorId, message]);

  const roleOptions = [
    { value: 'protagonist', label: '主角' },
    { value: 'antagonist', label: '反派' },
    { value: 'supporting', label: '配角' },
  ];
  const genderOptions: Array<{ value: CharacterGender; label: string }> = [
    { value: 'male', label: '男' },
    { value: 'female', label: '女' },
    { value: 'neutral', label: '中性' },
    { value: 'unknown', label: '未知' },
  ];

  const renderActorCard = (actor: ActorProfile) => {
    const photoUrl = actor.costumePhotoPath
      ? electronService.fs.toLocalUrl(actor.costumePhotoPath)
      : actor.costumePhotoRemoteUrl || '';
    const selected = selectedActorId === actor.id;
    return (
      <div
        key={actor.id}
        className={`${styles.actorCard} ${selected ? styles.actorCardSelected : ''}`}
        onClick={() => setSelectedActorId(actor.id)}
      >
        <div className={styles.actorPhoto}>
          {photoUrl ? (
            <img src={photoUrl} alt={actor.name} />
          ) : (
            <UserAddOutlined className={styles.actorPhotoPlaceholder} />
          )}
        </div>
        <div className={styles.actorMeta}>
          <div className={styles.actorName}>{actor.name}</div>
          <div className={styles.actorTags}>
            {actor.role && <Tag color="purple">{ROLE_LABEL[actor.role] ?? actor.role}</Tag>}
            {actor.gender && <Tag>{GENDER_LABEL[actor.gender] ?? actor.gender}</Tag>}
            {actor.age && <Tag>{actor.age}</Tag>}
            {actor.voiceId && <Tag color="blue">已绑音色</Tag>}
            {(actor.costumePhotoPath || actor.costumePhotoRemoteUrl) && <Tag color="green">有定妆照</Tag>}
          </div>
        </div>
        <Popconfirm
          title="从演员库移除该演员？"
          description="不影响已加入项目的角色"
          onConfirm={() => handleDeleteActor(actor)}
          okButtonProps={{ danger: true }}
        >
          <span
            className={styles.actorDelete}
            onClick={e => e.stopPropagation()}
          >
            <DeleteOutlined />
          </span>
        </Popconfirm>
      </div>
    );
  };

  return (
    <Modal
      title={
        <span>
          <UserAddOutlined className={styles.titleIcon} />
          新建角色
        </span>
      }
      open={open}
      onCancel={handleCancel}
      onOk={handleSubmit}
      okText={mode === 'library' ? '添加所选演员' : '创建'}
      okButtonProps={{ disabled: mode === 'library' && !selectedActorId }}
      cancelText="取消"
      confirmLoading={loading}
      destroyOnHidden
      width={mode === 'library' ? 640 : 520}
    >
      <Segmented
        block
        value={mode}
        onChange={v => setMode(v as 'manual' | 'library')}
        options={[
          { label: '手动新建', value: 'manual', icon: <UserAddOutlined /> },
          { label: '从演员库选择', value: 'library', icon: <TeamOutlined /> },
        ]}
        className={styles.modeSegmented}
      />

      {mode === 'manual' ? (
        <Form form={form} layout="vertical" className={styles.form}>
          <Form.Item
            name="name"
            label="角色名称"
            rules={[{ required: true, message: '请输入角色名称' }]}
          >
            <Input placeholder="如：叶青凡" />
          </Form.Item>

          <Form.Item name="role" label="角色类型" initialValue="supporting">
            <Select options={roleOptions} />
          </Form.Item>

          <Form.Item name="age" label="年龄">
            <Input placeholder="如：28岁" />
          </Form.Item>

          <Form.Item name="gender" label="性别" initialValue="unknown">
            <Select options={genderOptions} />
          </Form.Item>

          <Form.Item
            name="prompt"
            label="视觉提示词"
            rules={[{ required: true, message: '请输入角色视觉提示词' }]}
          >
            <TextArea rows={4} placeholder="只描述角色可见外貌、服装、材质、配色、体态等客观视觉信息" />
          </Form.Item>
        </Form>
      ) : (
        <div className={styles.actorLibrary}>
          {actorsLoading ? (
            <div className={styles.actorLibraryLoading}><Spin /></div>
          ) : actors.length === 0 ? (
            <Empty
              description={
                <>
                  演员库还是空的
                  <br />
                  在角色详情面板点「存为演员」，即可把已有角色（含定妆照、音色）收入演员库
                </>
              }
            />
          ) : (
            <div className={styles.actorGrid}>
              {actors.map(renderActorCard)}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

export default CreateCharacterModal;
