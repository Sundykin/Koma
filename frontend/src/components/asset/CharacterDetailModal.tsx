/**
 * 角色详情弹窗（纯渲染层）
 * 状态与逻辑已拆分至 useCharacterDetailState.ts
 */
import React from 'react';
import {
  Modal, Form, Input, Select, Button, Space, Progress, Spin, App,
  Row, Col, Divider, Typography, Popconfirm,
} from 'antd';
import {
  UserOutlined, SaveOutlined, DeleteOutlined, UploadOutlined,
  ThunderboltOutlined, PlayCircleOutlined, CheckCircleOutlined,
  LoadingOutlined, EditOutlined, LinkOutlined,
} from '@ant-design/icons';
import { useCharacterDetailState, CharacterDetailModalProps } from './useCharacterDetailState';

const { TextArea } = Input;
const { Text } = Typography;

const roleOptions = [
  { value: 'protagonist', label: '主角' },
  { value: 'antagonist', label: '反派' },
  { value: 'supporting', label: '配角' },
];

export const CharacterDetailModal: React.FC<CharacterDetailModalProps> = (props) => {
  const { open, onClose } = props;
  const { message } = App.useApp();
  const state = useCharacterDetailState(props, message);
  const {
    form, editedCharacter, setEditedCharacter,
    isPromptEditing, setIsPromptEditing, customPrompt, setCustomPrompt,
    generating, progress, progressStep,
    previewImage, setPreviewImage,
    autoPrompt,
    handleSave, handleGenerateCostume, handleUploadCostume,
    handleGenerateVideo, handleUploadVideo,
    handleExtractCharacter, handleDelete, toLocalUrl,
  } = state;

  if (!editedCharacter) return null;

  return (
    <>
      <Modal
        title={<Space><UserOutlined /><span>角色详情: {editedCharacter.name}</span></Space>}
        open={open} onCancel={onClose} width={900}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Popconfirm title="确定删除此角色？" description="删除后无法恢复" onConfirm={handleDelete} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
              <Button danger icon={<DeleteOutlined />}>删除角色</Button>
            </Popconfirm>
            <Space>
              <Button onClick={onClose}>取消</Button>
              <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>保存修改</Button>
            </Space>
          </div>
        }>
        {generating && (
          <div style={{ marginBottom: 16 }}>
            <Space style={{ marginBottom: 8 }}><Spin indicator={<LoadingOutlined spin />} size="small" /><Text>{progressStep}</Text></Space>
            <Progress percent={Math.round(progress)} strokeColor="#52c41a" />
          </div>
        )}

        <Row gutter={24}>
          <Col span={10}>
            <div style={{ marginBottom: 16 }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>定妆照（三视图）</Text>
              <div style={{ aspectRatio: '3/2', background: '#1a1a1a', borderRadius: 8, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: editedCharacter.costumePhotoPath ? 'pointer' : 'default' }}
                onClick={() => editedCharacter.costumePhotoPath && setPreviewImage(toLocalUrl(editedCharacter.costumePhotoPath))}>
                {editedCharacter.costumePhotoPath ? (
                  <img src={toLocalUrl(editedCharacter.costumePhotoPath)} alt="定妆照" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (<Text type="secondary">未生成（正面/侧面/背面）</Text>)}
              </div>
              <Space style={{ marginTop: 8, width: '100%' }} wrap>
                <Button icon={generating === 'costume' ? <LoadingOutlined /> : <ThunderboltOutlined />} onClick={handleGenerateCostume} disabled={generating !== null}>
                  {editedCharacter.costumePhotoPath ? '重新生成' : '生成'}
                </Button>
                <Button icon={<UploadOutlined />} onClick={handleUploadCostume} disabled={generating !== null}>上传</Button>
              </Space>
            </div>
          </Col>
          <Col span={14}>
            <Form form={form} layout="vertical" size="small">
              <Row gutter={16}>
                <Col span={12}><Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}><Input /></Form.Item></Col>
                <Col span={12}><Form.Item name="role" label="角色类型"><Select options={roleOptions} /></Form.Item></Col>
              </Row>
            </Form>
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text strong style={{ fontSize: 13 }}>生成提示词</Text>
                <Button type="text" size="small" icon={isPromptEditing ? <CheckCircleOutlined /> : <EditOutlined />} onClick={() => setIsPromptEditing(!isPromptEditing)}>
                  {isPromptEditing ? '完成' : '编辑'}
                </Button>
              </div>
              <TextArea value={customPrompt || autoPrompt} onChange={(e) => setCustomPrompt(e.target.value)} rows={4}
                placeholder="描述角色外貌、服装、特征..." disabled={!isPromptEditing}
                style={{ background: isPromptEditing ? '#09090b' : '#1a1a1a', borderColor: isPromptEditing ? '#3f3f46' : '#27272a' }} />
              {customPrompt && (
                <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
                  使用自定义提示词 · <a onClick={() => setCustomPrompt('')}>恢复自动</a>
                </Text>
              )}
            </div>
          </Col>
        </Row>

        <Divider />

        <Row gutter={24}>
          <Col span={12}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>预览视频</Text>
            <div style={{ aspectRatio: '9/16', maxHeight: 200, background: '#1a1a1a', borderRadius: 8, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {editedCharacter.previewVideoPath ? (
                <video src={toLocalUrl(editedCharacter.previewVideoPath)} controls style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (<Text type="secondary">未生成</Text>)}
            </div>
            <Space style={{ marginTop: 8 }}>
              <Button icon={generating === 'video' ? <LoadingOutlined /> : <PlayCircleOutlined />} onClick={handleGenerateVideo} disabled={generating !== null || !editedCharacter.costumePhotoPath}>
                {editedCharacter.previewVideoPath ? '重新生成' : '生成'}
              </Button>
              <Button icon={<UploadOutlined />} onClick={handleUploadVideo} disabled={generating !== null}>上传</Button>
            </Space>
          </Col>
          <Col span={12}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>Sora2 角色绑定</Text>
            <div style={{ padding: 16, background: '#1a1a1a', borderRadius: 8, minHeight: 100 }}>
              {editedCharacter.sora2CharacterId ? (
                <div style={{ textAlign: 'center' }}>
                  <CheckCircleOutlined style={{ fontSize: 24, color: '#52c41a', marginBottom: 8 }} />
                  <div><Text type="success">已绑定</Text></div>
                  <Text type="secondary" style={{ fontSize: 10, wordBreak: 'break-all' }}>{editedCharacter.sora2CharacterId}</Text>
                </div>
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <LinkOutlined style={{ fontSize: 24, color: '#52525b', marginBottom: 8 }} />
                  <div><Text type="secondary">未绑定</Text></div>
                </div>
              )}
              <div style={{ marginTop: 12, padding: '8px 0', borderTop: '1px solid #27272a' }}>
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>提取时间范围（秒）</Text>
                <Space size="small">
                  <Input type="number" size="small" style={{ width: 60 }} min={0} max={10} step={0.5} placeholder="起始"
                    value={editedCharacter.timestampRange?.start ?? 1}
                    onChange={(e) => {
                      const start = parseFloat(e.target.value) || 0;
                      const currentEnd = editedCharacter.timestampRange?.end ?? 3;
                      setEditedCharacter(prev => prev ? { ...prev, timestampRange: { start, end: Math.max(currentEnd, start + 0.5) } } : null);
                    }} />
                  <Text type="secondary">-</Text>
                  <Input type="number" size="small" style={{ width: 60 }} min={0} max={10} step={0.5} placeholder="结束"
                    value={editedCharacter.timestampRange?.end ?? 3}
                    onChange={(e) => {
                      const end = parseFloat(e.target.value) || 3;
                      const start = editedCharacter.timestampRange?.start ?? 1;
                      if (end - start > 3) { message.warning('时间范围不能超过3秒'); return; }
                      setEditedCharacter(prev => prev ? { ...prev, timestampRange: { start, end } } : null);
                    }} />
                  <Text type="secondary" style={{ fontSize: 11 }}>最多3秒</Text>
                </Space>
              </div>
            </div>
            <Button block style={{ marginTop: 8 }} icon={generating === 'extract' ? <LoadingOutlined /> : <LinkOutlined />}
              onClick={handleExtractCharacter} disabled={generating !== null || !editedCharacter.previewVideoPath}>
              {editedCharacter.sora2CharacterId ? '重新提取' : '提取角色'}
            </Button>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>需要先生成预览视频才能提取</Text>
          </Col>
        </Row>
      </Modal>

      <Modal open={!!previewImage} onCancel={() => setPreviewImage(null)} footer={null} centered width="auto" styles={{ body: { padding: 0 } }}>
        {previewImage && <img src={previewImage} alt="Preview" style={{ maxWidth: '90vw', maxHeight: '85vh' }} />}
      </Modal>
    </>
  );
};

export default CharacterDetailModal;
