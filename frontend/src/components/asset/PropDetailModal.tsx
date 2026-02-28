/**
 * 道具详情弹窗（纯渲染层）
 * 状态与逻辑已拆分至 usePropDetailState.ts
 */
import React from 'react';
import {
  Modal, Form, Input, Select, Button, Space, Progress, Spin, App,
  Row, Col, Divider, Typography, Popconfirm,
} from 'antd';
import {
  InboxOutlined, SaveOutlined, DeleteOutlined, UploadOutlined,
  ThunderboltOutlined, PlayCircleOutlined, CheckCircleOutlined,
  LoadingOutlined, LinkOutlined, EditOutlined,
} from '@ant-design/icons';
import { usePropDetailState, PropDetailModalProps } from './usePropDetailState';

const { TextArea } = Input;
const { Text } = Typography;

const typeOptions = [
  { value: '武器', label: '武器' },
  { value: '日常', label: '日常' },
  { value: '关键线索', label: '关键线索' },
  { value: '其他', label: '其他' },
];

export const PropDetailModal: React.FC<PropDetailModalProps> = (props) => {
  const { open, onClose } = props;
  const { message } = App.useApp();
  const state = usePropDetailState(props, message);
  const {
    form, editedProp,
    isPromptEditing, setIsPromptEditing, customPrompt, setCustomPrompt,
    generating, progress, progressStep,
    previewImage, setPreviewImage,
    handleSave, handleGenerateImage, handleUploadImage,
    handleGenerateVideo, handleUploadVideo,
    handleExtractProp, handleDelete, toLocalUrl,
  } = state;

  if (!editedProp) return null;

  return (
    <>
      <Modal
        title={<Space><InboxOutlined /><span>道具详情: {editedProp.name}</span></Space>}
        open={open} onCancel={onClose} width={900}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Popconfirm title="确定删除此道具？" description="删除后无法恢复" onConfirm={handleDelete} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
              <Button danger icon={<DeleteOutlined />}>删除道具</Button>
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
              <Text strong style={{ display: 'block', marginBottom: 8 }}>道具图片</Text>
              <div style={{ aspectRatio: '1/1', background: '#1a1a1a', borderRadius: 8, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: editedProp.imagePath ? 'pointer' : 'default' }}
                onClick={() => editedProp.imagePath && setPreviewImage(toLocalUrl(editedProp.imagePath))}>
                {editedProp.imagePath ? (
                  <img src={toLocalUrl(editedProp.imagePath)} alt="道具图" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 8 }} />
                ) : (<Text type="secondary">未生成</Text>)}
              </div>
              <Space style={{ marginTop: 8, width: '100%' }} wrap>
                <Button icon={generating === 'image' ? <LoadingOutlined /> : <ThunderboltOutlined />} onClick={handleGenerateImage} disabled={generating !== null}>
                  {editedProp.imagePath ? '重新生成' : '生成'}
                </Button>
                <Button icon={<UploadOutlined />} onClick={handleUploadImage} disabled={generating !== null}>上传</Button>
              </Space>
            </div>
          </Col>
          <Col span={14}>
            <Form form={form} layout="vertical" size="small">
              <Row gutter={16}>
                <Col span={12}><Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}><Input /></Form.Item></Col>
                <Col span={12}><Form.Item name="type" label="道具类型"><Select options={typeOptions} /></Form.Item></Col>
              </Row>
              <Form.Item name="description" label="道具描述（用于AI生成）">
                <TextArea rows={3} placeholder="如：古老的怀表，金色外壳，雕刻精美..." />
              </Form.Item>
            </Form>
          </Col>
        </Row>

        <Divider />

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text strong>生成提示词</Text>
            <Button type="text" size="small" icon={isPromptEditing ? <CheckCircleOutlined /> : <EditOutlined />}
              onClick={() => { if (isPromptEditing && !customPrompt) setCustomPrompt(''); setIsPromptEditing(!isPromptEditing); }}>
              {isPromptEditing ? '完成' : '编辑'}
            </Button>
          </div>
          {isPromptEditing ? (
            <TextArea value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} rows={3} placeholder="输入自定义提示词，留空使用自动生成" />
          ) : (
            <div style={{ padding: 12, background: '#1a1a1a', borderRadius: 8, fontSize: 12, color: '#a1a1aa', lineHeight: 1.6 }}>
              {customPrompt || editedProp.description || '(无提示词)'}
            </div>
          )}
          {customPrompt && (
            <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
              使用自定义提示词 · <a onClick={() => setCustomPrompt('')}>恢复自动</a>
            </Text>
          )}
        </div>

        <Divider />

        <Row gutter={24}>
          <Col span={12}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>预览视频</Text>
            <div style={{ aspectRatio: '1/1', maxHeight: 200, background: '#1a1a1a', borderRadius: 8, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {editedProp.previewVideoPath ? (
                <video src={toLocalUrl(editedProp.previewVideoPath)} controls style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (<Text type="secondary">未生成</Text>)}
            </div>
            <Space style={{ marginTop: 8 }}>
              <Button icon={generating === 'video' ? <LoadingOutlined /> : <PlayCircleOutlined />} onClick={handleGenerateVideo} disabled={generating !== null || !editedProp.imagePath}>
                {editedProp.previewVideoPath ? '重新生成' : '生成'}
              </Button>
              <Button icon={<UploadOutlined />} onClick={handleUploadVideo} disabled={generating !== null}>上传</Button>
            </Space>
          </Col>
        </Row>
      </Modal>

      <Modal open={!!previewImage} onCancel={() => setPreviewImage(null)} footer={null} centered width="auto" styles={{ body: { padding: 0 } }}>
        {previewImage && <img src={previewImage} alt="Preview" style={{ maxWidth: '90vw', maxHeight: '85vh' }} />}
      </Modal>
    </>
  );
};

export default PropDetailModal;
