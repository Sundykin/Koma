/**
 * 资产列表面板
 * 显示角色/场景/道具列表，支持选择和新建
 */
import React, { useState } from 'react';
import { Tabs, Button, Image, Typography, Empty } from 'antd';
import {
  UserOutlined,
  EnvironmentOutlined,
  InboxOutlined,
  PlusOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { v4 as uuidv4 } from 'uuid';
import type { Character, Scene, Prop } from '../../types';
import { saveCharacters, saveScenes, saveProps, loadCharacters, loadScenes, loadProps } from '../../store/projectStore';
import { electronService } from '../../services/electronService';

const { Text } = Typography;

export type AssetType = 'character' | 'scene' | 'prop';

interface AssetListPanelProps {
  characters: Character[];
  scenes: Scene[];
  props: Prop[];
  selectedType: AssetType;
  selectedId: string | null;
  onSelect: (type: AssetType, id: string | null) => void;
  onCreateCharacter: (char: Character) => void;
  onCreateScene: (scene: Scene) => void;
  onCreateProp: (prop: Prop) => void;
  projectId: string;
}

export const AssetListPanel: React.FC<AssetListPanelProps> = ({
  characters,
  scenes,
  props,
  selectedType,
  selectedId,
  onSelect,
  onCreateCharacter,
  onCreateScene,
  onCreateProp,
  projectId,
}) => {
  const toLocalUrl = (path?: string) => path ? electronService.fs.toLocalUrl(path) : '';

  // 新建角色
  const handleCreateCharacter = async () => {
    const newChar: Character = {
      id: uuidv4(),
      name: '新角色',
      role: 'supporting',
      description: '',
      appearance: '',
    };
    const allChars = await loadCharacters(projectId);
    await saveCharacters(projectId, [...allChars, newChar]);
    onCreateCharacter(newChar);
  };

  // 新建场景
  const handleCreateScene = async () => {
    const newScene: Scene = {
      id: uuidv4(),
      name: '新场景',
      location: '',
      time: 'day',
      mood: '',
      description: '',
    };
    const allScenes = await loadScenes(projectId);
    await saveScenes(projectId, [...allScenes, newScene]);
    onCreateScene(newScene);
  };

  // 新建道具
  const handleCreateProp = async () => {
    const newProp: Prop = {
      id: uuidv4(),
      name: '新道具',
      type: '其他',
      description: '',
    };
    const allProps = await loadProps(projectId);
    await saveProps(projectId, [...allProps, newProp]);
    onCreateProp(newProp);
  };

  // 资产列表项
  const renderAssetItem = (
    id: string,
    name: string,
    imagePath?: string,
    isBound?: boolean,
    subtitle?: string
  ) => {
    const isSelected = selectedId === id;
    return (
      <div
        key={id}
        className={`assetListItem ${isSelected ? 'selected' : ''}`}
        onClick={() => onSelect(selectedType, id)}
      >
        <div className="assetListItemThumb">
          {imagePath ? (
            <Image
              src={toLocalUrl(imagePath)}
              alt={name}
              preview={false}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div className="assetListItemNoImage">
              {selectedType === 'character' && <UserOutlined />}
              {selectedType === 'scene' && <EnvironmentOutlined />}
              {selectedType === 'prop' && <InboxOutlined />}
            </div>
          )}
        </div>
        <div className="assetListItemInfo">
          <Text className="assetListItemName" ellipsis>{name}</Text>
          {subtitle && <Text className="assetListItemSub" type="secondary" ellipsis>{subtitle}</Text>}
        </div>
        {isBound && (
          <CheckCircleOutlined className="assetListItemBound" />
        )}
      </div>
    );
  };

  // 角色列表
  const renderCharacters = () => (
    <div className="assetListContent">
      {characters.length > 0 ? (
        characters.map(char => renderAssetItem(
          char.id,
          char.name,
          char.costumePhotoPath,
          !!char.sora2CharacterId,
          char.role === 'protagonist' ? '主角' : char.role === 'antagonist' ? '反派' : '配角'
        ))
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无角色" />
      )}
      <Button
        type="dashed"
        icon={<PlusOutlined />}
        className="assetListAddBtn"
        onClick={handleCreateCharacter}
      >
        新建角色
      </Button>
    </div>
  );

  // 场景列表
  const renderScenes = () => (
    <div className="assetListContent">
      {scenes.length > 0 ? (
        scenes.map(scene => renderAssetItem(
          scene.id,
          scene.name,
          scene.imagePath,
          false,
          scene.location
        ))
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无场景" />
      )}
      <Button
        type="dashed"
        icon={<PlusOutlined />}
        className="assetListAddBtn"
        onClick={handleCreateScene}
      >
        新建场景
      </Button>
    </div>
  );

  // 道具列表
  const renderProps = () => (
    <div className="assetListContent">
      {props.length > 0 ? (
        props.map(prop => renderAssetItem(
          prop.id,
          prop.name,
          prop.imagePath,
          !!prop.sora2PropId,
          prop.type
        ))
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无道具" />
      )}
      <Button
        type="dashed"
        icon={<PlusOutlined />}
        className="assetListAddBtn"
        onClick={handleCreateProp}
      >
        新建道具
      </Button>
    </div>
  );

  const tabItems = [
    {
      key: 'character',
      label: <span><UserOutlined /> 角色</span>,
      children: renderCharacters(),
    },
    {
      key: 'scene',
      label: <span><EnvironmentOutlined /> 场景</span>,
      children: renderScenes(),
    },
    {
      key: 'prop',
      label: <span><InboxOutlined /> 道具</span>,
      children: renderProps(),
    },
  ];

  return (
    <div className="assetListPanel">
      <Tabs
        activeKey={selectedType}
        onChange={(key) => {
          onSelect(key as AssetType, null);
        }}
        items={tabItems}
        size="small"
      />
    </div>
  );
};

export default AssetListPanel;
