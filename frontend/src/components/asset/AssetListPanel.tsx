import React, { useMemo, useState } from 'react';
import { Tabs, Button, Typography, Empty, Tooltip, Modal, Checkbox, List, Avatar, Space, Input } from 'antd';
import {
  UserOutlined,
  EnvironmentOutlined,
  InboxOutlined,
  PlusOutlined,
  PlusCircleOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { v4 as uuidv4 } from 'uuid';
import { useTranslation } from 'react-i18next';
import type { Character, Scene, Prop } from '../../types';
import { saveCharacters, saveScenes, saveProps, loadCharacters, loadScenes, loadProps } from '../../store/projectStore';
import { electronService } from '../../services/electronService';
import {
  getCharacterCostumePhotoSource,
  getPropPreviewImageSource,
  getScenePreviewImageSource,
} from '../../utils/mediaSelectors';

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
  canBindExisting?: boolean;
  existingCharacterCandidates?: Character[];
  existingSceneCandidates?: Scene[];
  existingPropCandidates?: Prop[];
  onBindExistingCharacter?: (character: Character) => Promise<void> | void;
  onBindExistingScene?: (scene: Scene) => Promise<void> | void;
  onBindExistingProp?: (prop: Prop) => Promise<void> | void;
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
  canBindExisting = false,
  existingCharacterCandidates = [],
  existingSceneCandidates = [],
  existingPropCandidates = [],
  onBindExistingCharacter,
  onBindExistingScene,
  onBindExistingProp,
  projectId,
}) => {
  const { t } = useTranslation();
  const [bindModalType, setBindModalType] = useState<AssetType | null>(null);
  const [selectedExistingIds, setSelectedExistingIds] = useState<string[]>([]);
  const [bindingExisting, setBindingExisting] = useState(false);
  const [bindSearchText, setBindSearchText] = useState('');

  const currentExistingCandidates = useMemo<(Character | Scene | Prop)[]>(() => {
    if (bindModalType === 'character') return existingCharacterCandidates;
    if (bindModalType === 'scene') return existingSceneCandidates;
    if (bindModalType === 'prop') return existingPropCandidates;
    return [];
  }, [bindModalType, existingCharacterCandidates, existingSceneCandidates, existingPropCandidates]);

  const filteredExistingCandidates = useMemo<(Character | Scene | Prop)[]>(() => {
    const keyword = bindSearchText.trim().toLowerCase();
    if (!keyword) return currentExistingCandidates;

    return currentExistingCandidates.filter((asset) => {
      const fields: Array<string | undefined> = [asset.name, asset.prompt, asset.description];

      if (bindModalType === 'character') {
        const character = asset as Character;
        fields.push(character.role, character.gender, character.age, character.appearance);
      } else if (bindModalType === 'scene') {
        const scene = asset as Scene;
        fields.push(scene.location, scene.time, scene.mood);
      } else if (bindModalType === 'prop') {
        const prop = asset as Prop;
        fields.push(prop.type);
      }

      return fields.some((field) => field?.toLowerCase().includes(keyword));
    });
  }, [bindModalType, bindSearchText, currentExistingCandidates]);

  const openBindExistingModal = (type: AssetType) => {
    setBindModalType(type);
    setSelectedExistingIds([]);
    setBindSearchText('');
  };

  const closeBindExistingModal = () => {
    if (bindingExisting) return;
    setBindModalType(null);
    setSelectedExistingIds([]);
    setBindSearchText('');
  };

  const handleToggleExistingAsset = (assetId: string, checked: boolean) => {
    setSelectedExistingIds(prev => checked
      ? Array.from(new Set([...prev, assetId]))
      : prev.filter(id => id !== assetId)
    );
  };

  const handleConfirmBindExisting = async () => {
    if (!bindModalType || selectedExistingIds.length === 0) return;

    const selectedIdSet = new Set(selectedExistingIds);
    const selectedAssets = currentExistingCandidates.filter(asset => selectedIdSet.has(asset.id));

    setBindingExisting(true);
    try {
      for (const asset of selectedAssets) {
        if (bindModalType === 'character') {
          await onBindExistingCharacter?.(asset as Character);
        } else if (bindModalType === 'scene') {
          await onBindExistingScene?.(asset as Scene);
        } else {
          await onBindExistingProp?.(asset as Prop);
        }
      }
      setBindModalType(null);
      setSelectedExistingIds([]);
      setBindSearchText('');
    } finally {
      setBindingExisting(false);
    }
  };

  const toLocalUrl = (path?: string) => {
    if (!path) return '';
    if (/^https?:\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) {
      return path;
    }
    return electronService.fs.toLocalUrl(path);
  };

  // 新建角色
  const handleCreateCharacter = async () => {
    const newChar: Character = {
      id: uuidv4(),
      name: t('asset.newCharacter'),
      role: 'supporting',
      gender: 'unknown',
      prompt: '',  // 统一使用 prompt 字段
    };
    const allChars = await loadCharacters(projectId);
    await saveCharacters(projectId, [...allChars, newChar]);
    onCreateCharacter(newChar);
  };

  // 新建场景
  const handleCreateScene = async () => {
    const newScene: Scene = {
      id: uuidv4(),
      name: t('asset.newScene'),
      prompt: '',  // 统一使用 prompt 字段
    };
    const allScenes = await loadScenes(projectId);
    await saveScenes(projectId, [...allScenes, newScene]);
    onCreateScene(newScene);
  };

  // 新建道具
  const handleCreateProp = async () => {
    const newProp: Prop = {
      id: uuidv4(),
      name: t('asset.newProp'),
      prompt: '',  // 统一使用 prompt 字段
    };
    const allProps = await loadProps(projectId);
    await saveProps(projectId, [...allProps, newProp]);
    onCreateProp(newProp);
  };

  // 获取角色类型标签
  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'protagonist': return t('asset.protagonist');
      case 'antagonist': return t('asset.antagonist');
      default: return t('asset.supporting');
    }
  };

  const getAssetTypeLabel = (type: AssetType | null) => {
    if (type === 'character') return t('asset.character');
    if (type === 'scene') return t('asset.scene');
    if (type === 'prop') return t('asset.prop');
    return t('asset.title');
  };

  const getExistingCandidates = (type: AssetType): (Character | Scene | Prop)[] => {
    if (type === 'character') return existingCharacterCandidates;
    if (type === 'scene') return existingSceneCandidates;
    return existingPropCandidates;
  };

  const renderHeaderActions = (type: AssetType, onCreate: () => void) => {
    const candidateCount = getExistingCandidates(type).length;

    return (
      <Space size={4}>
        {canBindExisting && (
          <Tooltip title={candidateCount === 0 ? t('asset.noExistingAssetsToAdd') : t('asset.addExistingFromProject')}>
            <Button
              size="small"
              icon={<PlusCircleOutlined />}
              onClick={() => openBindExistingModal(type)}
              disabled={candidateCount === 0}
              ghost
            >
              {t('asset.addExisting')}
            </Button>
          </Tooltip>
        )}
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={onCreate}
          ghost
        >
          {t('asset.new')}
        </Button>
      </Space>
    );
  };

  const getExistingAssetMeta = (asset: Character | Scene | Prop) => {
    if (bindModalType === 'character') {
      const character = asset as Character;
      return {
        imagePath: getCharacterCostumePhotoSource(character),
        subtitle: getRoleLabel(character.role || 'supporting'),
        description: character.description,
        icon: <UserOutlined />,
      };
    }
    if (bindModalType === 'scene') {
      const scene = asset as Scene;
      return {
        imagePath: getScenePreviewImageSource(scene),
        subtitle: scene.location,
        description: scene.description,
        icon: <EnvironmentOutlined />,
      };
    }

    const prop = asset as Prop;
    return {
      imagePath: getPropPreviewImageSource(prop),
      subtitle: prop.type,
      description: prop.description,
      icon: <InboxOutlined />,
    };
  };

  const existingAssetEmptyDescription = bindSearchText.trim()
    ? t('asset.noMatchingExistingAssets')
    : t('asset.noExistingAssetsToAdd');

  const renderExistingAssetModal = () => (
    <Modal
      open={!!bindModalType}
      title={t('asset.addExistingTitle', { type: getAssetTypeLabel(bindModalType) })}
      okText={t('asset.addToEpisode')}
      cancelText={t('common.cancel')}
      onOk={handleConfirmBindExisting}
      onCancel={closeBindExistingModal}
      okButtonProps={{ disabled: selectedExistingIds.length === 0, loading: bindingExisting }}
      cancelButtonProps={{ disabled: bindingExisting }}
      destroyOnHidden
    >
      {currentExistingCandidates.length > 0 ? (
        <>
          <Text type="secondary" className="block mb-3">
            {t('asset.selectExistingAssetsHint')}
          </Text>
          <Input.Search
            allowClear
            className="mb-3"
            placeholder={t('common.search')}
            value={bindSearchText}
            onChange={(event) => setBindSearchText(event.target.value)}
            disabled={bindingExisting}
          />
          <List
            dataSource={filteredExistingCandidates}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={existingAssetEmptyDescription}
                />
              ),
            }}
            renderItem={(asset) => {
              const meta = getExistingAssetMeta(asset);
              const checked = selectedExistingIds.includes(asset.id);
              const imageSrc = meta.imagePath ? toLocalUrl(meta.imagePath) : undefined;

              return (
                <List.Item
                  key={asset.id}
                  className="cursor-pointer"
                  onClick={() => handleToggleExistingAsset(asset.id, !checked)}
                >
                  <List.Item.Meta
                    avatar={
                      <Space size={8}>
                        <Checkbox
                          checked={checked}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => handleToggleExistingAsset(asset.id, event.target.checked)}
                        />
                        <Avatar
                          shape="square"
                          size={48}
                          src={imageSrc}
                          icon={!imageSrc ? meta.icon : undefined}
                          style={{ background: '#18181b' }}
                        />
                      </Space>
                    }
                    title={<Text>{asset.name}</Text>}
                    description={
                      <Space direction="vertical" size={0}>
                        {meta.subtitle && <Text type="secondary">{meta.subtitle}</Text>}
                        {meta.description && (
                          <Text type="secondary" ellipsis={{ tooltip: meta.description }}>
                            {meta.description}
                          </Text>
                        )}
                      </Space>
                    }
                  />
                </List.Item>
              );
            }}
          />
          <Text type="secondary">
            {t('asset.selectedExistingCount', { count: selectedExistingIds.length })}
          </Text>
        </>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('asset.noExistingAssetsToAdd')} />
      )}
    </Modal>
  );

  // 资产卡片项
  const renderAssetCard = (
    id: string,
    name: string,
    imagePath?: string,
    isBound?: boolean,
    subtitle?: string,
    extraInfo?: string
  ) => {
    const isSelected = selectedId === id;
    return (
      <div
        key={id}
        className={`relative group cursor-pointer border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900 transition-all hover:border-zinc-600 ${
          isSelected ? 'ring-2 ring-emerald-500 border-transparent' : ''
        }`}
        onClick={() => onSelect(selectedType, id)}
      >
        {/* 图片区域 - 16:9 比例 */}
        <div className="aspect-video w-full bg-zinc-950 relative overflow-hidden">
          {imagePath ? (
            <img
              src={toLocalUrl(imagePath)}
              alt={name}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-700 bg-zinc-900">
              {selectedType === 'character' && <UserOutlined style={{ fontSize: 24 }} />}
              {selectedType === 'scene' && <EnvironmentOutlined style={{ fontSize: 24 }} />}
              {selectedType === 'prop' && <InboxOutlined style={{ fontSize: 24 }} />}
            </div>
          )}
          
          {/* 绑定状态角标 */}
          {isBound && (
            <div className="absolute top-1 right-1 bg-emerald-500/90 text-white rounded-full p-0.5 shadow-sm">
              <CheckCircleOutlined style={{ fontSize: 12 }} />
            </div>
          )}
          
          {/* 悬浮信息 */}
          {extraInfo && (
            <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Tooltip title={extraInfo}>
                <InfoCircleOutlined className="text-zinc-300 bg-black/50 rounded-full p-1 text-xs" />
              </Tooltip>
            </div>
          )}
        </div>

        {/* 信息区域 */}
        <div className="p-2">
          <div className="flex items-center justify-between gap-1">
            <Text className="text-zinc-200 text-sm font-medium truncate flex-1" ellipsis={{ tooltip: name }}>
              {name}
            </Text>
          </div>
          {subtitle && (
            <Text className="text-zinc-500 text-xs block truncate mt-0.5">
              {subtitle}
            </Text>
          )}
        </div>
      </div>
    );
  };

  // 角色列表 - 网格布局
  const renderCharacters = () => (
    <div className="h-full flex flex-col">
      <div className="p-2 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
        <span className="text-xs text-zinc-500">{t('asset.totalCharacters', { count: characters.length })}</span>
        {renderHeaderActions('character', handleCreateCharacter)}
      </div>
      <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
        {characters.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {characters.map(char => renderAssetCard(
              char.id,
              char.name,
              getCharacterCostumePhotoSource(char),
              !!char.sora2CharacterId,
              getRoleLabel(char.role || 'supporting'),
              char.description
            ))}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('asset.noCharacters')} />
          </div>
        )}
      </div>
    </div>
  );

  // 场景列表
  const renderScenes = () => (
    <div className="h-full flex flex-col">
      <div className="p-2 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
        <span className="text-xs text-zinc-500">{t('asset.totalScenes', { count: scenes.length })}</span>
        {renderHeaderActions('scene', handleCreateScene)}
      </div>
      <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
        {scenes.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {scenes.map(scene => renderAssetCard(
              scene.id,
              scene.name,
              getScenePreviewImageSource(scene),
              false,
              scene.location,
              scene.description
            ))}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('asset.noScenes')} />
          </div>
        )}
      </div>
    </div>
  );

  // 道具列表
  const renderProps = () => (
    <div className="h-full flex flex-col">
      <div className="p-2 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
        <span className="text-xs text-zinc-500">{t('asset.totalProps', { count: props.length })}</span>
        {renderHeaderActions('prop', handleCreateProp)}
      </div>
      <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
        {props.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {props.map(prop => renderAssetCard(
              prop.id,
              prop.name,
              getPropPreviewImageSource(prop),
              !!prop.sora2PropId,
              prop.type,
              prop.description
            ))}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('asset.noProps')} />
          </div>
        )}
      </div>
    </div>
  );

  const tabItems = [
    {
      key: 'character',
      label: <span><UserOutlined /> {t('asset.character')}</span>,
      children: renderCharacters(),
    },
    {
      key: 'scene',
      label: <span><EnvironmentOutlined /> {t('asset.scene')}</span>,
      children: renderScenes(),
    },
    {
      key: 'prop',
      label: <span><InboxOutlined /> {t('asset.prop')}</span>,
      children: renderProps(),
    },
  ];

  return (
    <div className="h-full flex flex-col bg-zinc-950">
      <Tabs
        activeKey={selectedType}
        onChange={(key) => {
          onSelect(key as AssetType, null);
        }}
        items={tabItems}
        size="small"
        className="asset-panel-tabs h-full"
        type="card"
        tabBarStyle={{ margin: 0, padding: '4px 4px 0', background: '#18181b', borderBottom: '1px solid #27272a' }}
      />
      {renderExistingAssetModal()}
      <style>{`
        .asset-panel-tabs .ant-tabs-content {
          height: calc(100% - 38px);
        }
        .asset-panel-tabs .ant-tabs-tabpane {
          height: 100%;
        }
        /* 自定义滚动条 */
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #3f3f46;
          border-radius: 2px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #52525b;
        }
      `}</style>
    </div>
  );
};

export default AssetListPanel;
