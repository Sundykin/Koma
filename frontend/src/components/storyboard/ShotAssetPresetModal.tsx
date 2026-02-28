/**
 * AI 分镜预选资产对话框
 * 在启动 AI 分镜生成前，让用户选择要使用的角色和道具
 */
import React, { useState, useMemo } from 'react';
import {
  Modal,
  Checkbox,
  Row,
  Col,
  Typography,
  Empty,
  Image,
  Space,
  Divider,
} from 'antd';
import {
  UserOutlined,
  InboxOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import type { Character, Prop } from '../../types';
import type { PresetAssets } from '../../services/ShotAnalysisService';
import { electronService } from '../../services/electronService';

const { Text } = Typography;

interface ShotAssetPresetModalProps {
  open: boolean;
  characters: Character[];
  props: Prop[];
  onConfirm: (assets: PresetAssets) => void;
  onCancel: () => void;
}

export const ShotAssetPresetModal: React.FC<ShotAssetPresetModalProps> = ({
  open,
  characters,
  props,
  onConfirm,
  onCancel,
}) => {
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>([]);
  const [selectedPropIds, setSelectedPropIds] = useState<string[]>([]);

  // 展示可用资产（不再依赖特定 Provider 绑定字段）
  const availableCharacters = useMemo(
    () => characters,
    [characters]
  );
  const availableProps = useMemo(
    () => props,
    [props]
  );

  const handleConfirm = () => {
    onConfirm({
      characterIds: selectedCharacterIds,
      propIds: selectedPropIds,
    });
    // 重置选择
    setSelectedCharacterIds([]);
    setSelectedPropIds([]);
  };

  const handleCancel = () => {
    setSelectedCharacterIds([]);
    setSelectedPropIds([]);
    onCancel();
  };

  const handleCharacterToggle = (charId: string) => {
    setSelectedCharacterIds(prev =>
      prev.includes(charId)
        ? prev.filter(id => id !== charId)
        : [...prev, charId]
    );
  };

  const handlePropToggle = (propId: string) => {
    setSelectedPropIds(prev =>
      prev.includes(propId)
        ? prev.filter(id => id !== propId)
        : [...prev, propId]
    );
  };

  const handleSelectAllCharacters = (checked: boolean) => {
    if (checked) {
      setSelectedCharacterIds(availableCharacters.map(c => c.id));
    } else {
      setSelectedCharacterIds([]);
    }
  };

  const handleSelectAllProps = (checked: boolean) => {
    if (checked) {
      setSelectedPropIds(availableProps.map(p => p.id));
    } else {
      setSelectedPropIds([]);
    }
  };

  const toLocalUrl = (path?: string) => path ? electronService.fs.toLocalUrl(path) : '';

  const renderAssetCard = (
    id: string,
    name: string,
    imagePath?: string,
    selected: boolean = false,
    onClick?: () => void
  ) => (
    <div
      key={id}
      onClick={onClick}
      style={{
        position: 'relative',
        padding: 8,
        borderRadius: 8,
        border: `2px solid ${selected ? '#52c41a' : '#27272a'}`,
        background: selected ? 'rgba(82, 196, 26, 0.1)' : '#18181b',
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
    >
      {/* 选中标记 */}
      {selected && (
        <CheckCircleOutlined
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            color: '#52c41a',
            fontSize: 16,
            zIndex: 1,
          }}
        />
      )}
      {/* 图片 */}
      <div
        style={{
          aspectRatio: '1/1',
          background: '#0a0a0a',
          borderRadius: 4,
          overflow: 'hidden',
          marginBottom: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {imagePath ? (
          <Image
            src={toLocalUrl(imagePath)}
            alt={name}
            preview={false}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>无图片</Text>
        )}
      </div>
      {/* 名称 */}
      <Text
        style={{
          display: 'block',
          textAlign: 'center',
          fontSize: 12,
          color: selected ? '#52c41a' : '#a1a1aa',
        }}
        ellipsis
      >
        {name}
      </Text>
    </div>
  );

  return (
    <Modal
      title="选择 AI 分镜使用的资产"
      open={open}
      onOk={handleConfirm}
      onCancel={handleCancel}
      okText="开始生成"
      cancelText="取消"
      width={700}
      styles={{
        body: { maxHeight: '60vh', overflowY: 'auto' },
      }}
    >
      {/* 角色区域 */}
      <div style={{ marginBottom: 16 }}>
        <Space style={{ marginBottom: 12 }}>
          <UserOutlined />
          <Text strong>角色</Text>
          {availableCharacters.length > 0 && (
            <Checkbox
              checked={selectedCharacterIds.length === availableCharacters.length}
              indeterminate={
                selectedCharacterIds.length > 0 &&
                selectedCharacterIds.length < availableCharacters.length
              }
              onChange={e => handleSelectAllCharacters(e.target.checked)}
            >
              全选
            </Checkbox>
          )}
          <Text type="secondary" style={{ fontSize: 12 }}>
            已选 {selectedCharacterIds.length}/{availableCharacters.length}
          </Text>
        </Space>

        {availableCharacters.length > 0 ? (
          <Row gutter={[12, 12]}>
            {availableCharacters.map(char =>
              <Col key={char.id} span={4}>
                {renderAssetCard(
                  char.id,
                  char.name,
                  char.costumePhotoPath,
                  selectedCharacterIds.includes(char.id),
                  () => handleCharacterToggle(char.id)
                )}
              </Col>
            )}
          </Row>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无可用角色资产"
            style={{ padding: '16px 0' }}
          />
        )}
      </div>

      <Divider style={{ margin: '16px 0' }} />

      {/* 道具区域 */}
      <div>
        <Space style={{ marginBottom: 12 }}>
          <InboxOutlined />
          <Text strong>道具</Text>
          {availableProps.length > 0 && (
            <Checkbox
              checked={selectedPropIds.length === availableProps.length}
              indeterminate={
                selectedPropIds.length > 0 &&
                selectedPropIds.length < availableProps.length
              }
              onChange={e => handleSelectAllProps(e.target.checked)}
            >
              全选
            </Checkbox>
          )}
          <Text type="secondary" style={{ fontSize: 12 }}>
            已选 {selectedPropIds.length}/{availableProps.length}
          </Text>
        </Space>

        {availableProps.length > 0 ? (
          <Row gutter={[12, 12]}>
            {availableProps.map(prop =>
              <Col key={prop.id} span={4}>
                {renderAssetCard(
                  prop.id,
                  prop.name,
                  prop.imagePath,
                  selectedPropIds.includes(prop.id),
                  () => handlePropToggle(prop.id)
                )}
              </Col>
            )}
          </Row>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无可用道具资产"
            style={{ padding: '16px 0' }}
          />
        )}
      </div>

      {/* 提示信息 */}
      <Text
        type="secondary"
        style={{ display: 'block', marginTop: 16, fontSize: 12 }}
      >
        提示：选中的资产将优先出现在 AI 生成的分镜中。
      </Text>
    </Modal>
  );
};

export default ShotAssetPresetModal;
