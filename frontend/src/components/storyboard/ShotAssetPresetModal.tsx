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

  // 只显示已绑定 Sora2 的资产
  const boundCharacters = useMemo(
    () => characters.filter(c => c.sora2CharacterId),
    [characters]
  );
  const boundProps = useMemo(
    () => props.filter(p => p.sora2PropId),
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
      setSelectedCharacterIds(boundCharacters.map(c => c.sora2CharacterId!));
    } else {
      setSelectedCharacterIds([]);
    }
  };

  const handleSelectAllProps = (checked: boolean) => {
    if (checked) {
      setSelectedPropIds(boundProps.map(p => p.sora2PropId!));
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
          {boundCharacters.length > 0 && (
            <Checkbox
              checked={selectedCharacterIds.length === boundCharacters.length}
              indeterminate={
                selectedCharacterIds.length > 0 &&
                selectedCharacterIds.length < boundCharacters.length
              }
              onChange={e => handleSelectAllCharacters(e.target.checked)}
            >
              全选
            </Checkbox>
          )}
          <Text type="secondary" style={{ fontSize: 12 }}>
            已选 {selectedCharacterIds.length}/{boundCharacters.length}
          </Text>
        </Space>

        {boundCharacters.length > 0 ? (
          <Row gutter={[12, 12]}>
            {boundCharacters.map(char =>
              <Col key={char.id} span={4}>
                {renderAssetCard(
                  char.sora2CharacterId!,
                  char.name,
                  char.costumePhotoPath,
                  selectedCharacterIds.includes(char.sora2CharacterId!),
                  () => handleCharacterToggle(char.sora2CharacterId!)
                )}
              </Col>
            )}
          </Row>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无已绑定 Sora2 的角色"
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
          {boundProps.length > 0 && (
            <Checkbox
              checked={selectedPropIds.length === boundProps.length}
              indeterminate={
                selectedPropIds.length > 0 &&
                selectedPropIds.length < boundProps.length
              }
              onChange={e => handleSelectAllProps(e.target.checked)}
            >
              全选
            </Checkbox>
          )}
          <Text type="secondary" style={{ fontSize: 12 }}>
            已选 {selectedPropIds.length}/{boundProps.length}
          </Text>
        </Space>

        {boundProps.length > 0 ? (
          <Row gutter={[12, 12]}>
            {boundProps.map(prop =>
              <Col key={prop.id} span={4}>
                {renderAssetCard(
                  prop.sora2PropId!,
                  prop.name,
                  prop.imagePath,
                  selectedPropIds.includes(prop.sora2PropId!),
                  () => handlePropToggle(prop.sora2PropId!)
                )}
              </Col>
            )}
          </Row>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无已绑定 Sora2 的道具"
            style={{ padding: '16px 0' }}
          />
        )}
      </div>

      {/* 提示信息 */}
      <Text
        type="secondary"
        style={{ display: 'block', marginTop: 16, fontSize: 12 }}
      >
        提示：选中的资产将优先出现在 AI 生成的分镜中。未绑定 Sora2 的资产不会显示在此列表。
      </Text>
    </Modal>
  );
};

export default ShotAssetPresetModal;
