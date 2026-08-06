import React, { useMemo, useState } from 'react';
import { Tabs, Button, Typography, Empty, Tooltip, Modal, Checkbox, List, Avatar, Space, Input, Spin } from 'antd';
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
import styles from './AssetListPanel.module.scss';

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
  /** 正在批量生成图片的资产 id — 卡片显示「生成中」遮罩 */
  generatingIds?: Set<string>;
  /** 提供时空列表里显示「从剧本提取资产」按钮（需要当前剧集已有剧本） */
  canExtract?: boolean;
  extracting?: boolean;
  onExtractAssets?: () => void;
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
  generatingIds,
  canExtract = false,
  extracting = false,
  onExtractAssets,
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
      // description / appearance 已经折叠进 prompt，搜索仅看 prompt + 结构化基本信息。
      const fields: Array<string | undefined> = [asset.name, asset.prompt];

      if (bindModalType === 'character') {
        const character = asset as Character;
        fields.push(character.role, character.gender, character.age);
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

  const appendImageVersion = (url: string, version?: string | number) => {
    if (version === undefined || version === null || version === '') return url;
    const [base, hash = ''] = url.split('#', 2);
    const separator = base.includes('?') ? '&' : '?';
    return `${base}${separator}v=${encodeURIComponent(String(version))}${hash ? `#${hash}` : ''}`;
  };

  const toVersionedImageUrl = (path?: string, version?: string | number) => {
    const url = toLocalUrl(path);
    return url ? appendImageVersion(url, version) : '';
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
    // 列表副标题展示用：以前读 description（独立字段），现在 description 已并入 prompt，
    // 直接读 prompt 即可。
    if (bindModalType === 'character') {
      const character = asset as Character;
      return {
        imagePath: getCharacterCostumePhotoSource(character),
        subtitle: getRoleLabel(character.role || 'supporting'),
        description: character.prompt,
        icon: <UserOutlined />,
      };
    }
    if (bindModalType === 'scene') {
      const scene = asset as Scene;
      return {
        imagePath: getScenePreviewImageSource(scene),
        subtitle: scene.location,
        description: scene.prompt,
        icon: <EnvironmentOutlined />,
      };
    }

    const prop = asset as Prop;
    return {
      imagePath: getPropPreviewImageSource(prop),
      subtitle: prop.type,
      description: prop.prompt,
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
                          className={styles.avatarPlaceholder}
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
    extraInfo?: string,
    imageVersion?: string | number,
  ) => {
    const isSelected = selectedId === id;
    const isGenerating = generatingIds?.has(id) ?? false;
    return (
      <div
        key={id}
        className={`relative group cursor-pointer border border-border-subtle rounded-lg overflow-hidden bg-bg-surface transition-all hover:border-border ${
          isSelected ? 'ring-2 ring-accent border-transparent' : ''
        }`}
        onClick={() => onSelect(selectedType, id)}
      >
        {/* 图片区域 - 16:9 比例 */}
        <div className="aspect-video w-full bg-bg-app relative overflow-hidden">
          {imagePath ? (
            <img
              src={toVersionedImageUrl(imagePath, imageVersion)}
              alt={name}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-text-muted bg-bg-surface">
              {selectedType === 'character' && <UserOutlined className={styles.emptyAssetIcon} />}
              {selectedType === 'scene' && <EnvironmentOutlined className={styles.emptyAssetIcon} />}
              {selectedType === 'prop' && <InboxOutlined className={styles.emptyAssetIcon} />}
            </div>
          )}

          {/* 生成中遮罩 */}
          {isGenerating && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60 z-10">
              <Spin size="small" />
              <span className="text-xs text-white/90">{t('asset.generating')}</span>
            </div>
          )}
          
          {/* 绑定状态角标 */}
          {isBound && (
            <div className="absolute top-1 right-1 bg-accent/90 text-on-accent rounded-full p-0.5 shadow-sm">
              <CheckCircleOutlined className={styles.boundIcon} />
            </div>
          )}
          
          {/* 悬浮信息 */}
          {extraInfo && (
            <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Tooltip title={extraInfo}>
                <InfoCircleOutlined className="text-text-secondary bg-black/50 rounded-full p-1 text-xs" />
              </Tooltip>
            </div>
          )}
        </div>

        {/* 信息区域 */}
        <div className="p-2">
          <div className="flex items-center justify-between gap-1">
            <Text className="text-text-primary text-sm font-medium truncate flex-1" ellipsis={{ tooltip: name }}>
              {name}
            </Text>
          </div>
          {subtitle && (
            <Text className="text-text-tertiary text-xs block truncate mt-0.5">
              {subtitle}
            </Text>
          )}
        </div>
      </div>
    );
  };

  // 图片就绪计数（定妆照/场景图/道具图）——让用户一眼看到"还差几张没生成"
  const characterImageReadyCount = useMemo(
    () => characters.filter(char => Boolean(getCharacterCostumePhotoSource(char))).length,
    [characters],
  );
  const sceneImageReadyCount = useMemo(
    () => scenes.filter(scene => Boolean(getScenePreviewImageSource(scene))).length,
    [scenes],
  );
  const propImageReadyCount = useMemo(
    () => props.filter(prop => Boolean(getPropPreviewImageSource(prop))).length,
    [props],
  );

  /** 标题栏的就绪徽标：全部有图时淡色，有缺时警示色 */
  const renderReadyBadge = (ready: number, total: number) => {
    if (total === 0) return null;
    const complete = ready === total;
    return (
      <span className={`text-xs ${complete ? 'text-text-tertiary' : 'text-status-warning'}`}>
        · {ready}/{total} 有图
      </span>
    );
  };

  // 空态：可提取时给出直接动作，而不是只显示一句"暂无"
  const renderEmptyState = (emptyText: string) => (
    <div className="h-full flex items-center justify-center">
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText}>
        {canExtract && onExtractAssets && (
          <Button
            type="primary"
            ghost
            size="small"
            loading={extracting}
            onClick={onExtractAssets}
          >
            {extracting ? t('asset.extractingAssets') : t('asset.extractAssetsFromScript')}
          </Button>
        )}
      </Empty>
    </div>
  );


  // 角色列表 - 网格布局
  const renderCharacters = () => (
    <div className="h-full flex flex-col">
      <div className="p-2 border-b border-border-subtle flex justify-between items-center bg-bg-surface/50">
        <span className="text-xs text-text-tertiary">{t('asset.totalCharacters', { count: characters.length })}</span>
        {renderReadyBadge(characterImageReadyCount, characters.length)}
        {renderHeaderActions('character', handleCreateCharacter)}
      </div>
      <div className={`flex-1 overflow-y-auto p-2 ${styles.scrollbar}`}>
        {characters.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {characters.map(char => renderAssetCard(
              char.id,
              char.name,
              getCharacterCostumePhotoSource(char),
              !!char.sora2CharacterId,
              getRoleLabel(char.role || 'supporting'),
              char.prompt,
              char.media?.costumePhoto?.createdAt,
            ))}
          </div>
        ) : (
          renderEmptyState(t('asset.noCharacters'))
        )}
      </div>
    </div>
  );

  // 场景列表
  const renderScenes = () => (
    <div className="h-full flex flex-col">
      <div className="p-2 border-b border-border-subtle flex justify-between items-center bg-bg-surface/50">
        <span className="text-xs text-text-tertiary">{t('asset.totalScenes', { count: scenes.length })}</span>
        {renderReadyBadge(sceneImageReadyCount, scenes.length)}
        {renderHeaderActions('scene', handleCreateScene)}
      </div>
      <div className={`flex-1 overflow-y-auto p-2 ${styles.scrollbar}`}>
        {scenes.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {scenes.map(scene => renderAssetCard(
              scene.id,
              scene.name,
              getScenePreviewImageSource(scene),
              false,
              scene.location,
              scene.prompt
            ))}
          </div>
        ) : (
          renderEmptyState(t('asset.noScenes'))
        )}
      </div>
    </div>
  );

  // 道具列表
  const renderProps = () => (
    <div className="h-full flex flex-col">
      <div className="p-2 border-b border-border-subtle flex justify-between items-center bg-bg-surface/50">
        <span className="text-xs text-text-tertiary">{t('asset.totalProps', { count: props.length })}</span>
        {renderReadyBadge(propImageReadyCount, props.length)}
        {renderHeaderActions('prop', handleCreateProp)}
      </div>
      <div className={`flex-1 overflow-y-auto p-2 ${styles.scrollbar}`}>
        {props.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {props.map(prop => renderAssetCard(
              prop.id,
              prop.name,
              getPropPreviewImageSource(prop),
              !!prop.sora2PropId,
              prop.type,
              prop.prompt
            ))}
          </div>
        ) : (
          renderEmptyState(t('asset.noProps'))
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
    <div className={styles.root}>
      <Tabs
        activeKey={selectedType}
        onChange={(key) => {
          onSelect(key as AssetType, null);
        }}
        items={tabItems}
        size="small"
        className={styles.tabs}
        type="card"
      />
      {renderExistingAssetModal()}
    </div>
  );
};

export default AssetListPanel;
