import React from 'react';
import { Button, InputNumber, Popover } from 'antd';
import {
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  Box,
  Camera,
  Cylinder,
  Grid2x2,
  LayoutTemplate,
  Plus,
  Square,
  Users,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type {
  LinghuiDirector3DCreatureSpecies,
} from '../../../../types/linghui';
import {
  CREATURE_SPECIES_LIBRARY,
  DIRECTOR3D_CAMERA_PRESET_CATEGORY_LABELS,
  DIRECTOR3D_CHARACTER_PRESETS,
  DIRECTOR3D_PROP_CATEGORY_LABELS,
  DIRECTOR3D_SCENE_TEMPLATES,
  type Director3DCameraPreset,
  type Director3DCameraPresetCategory,
  type Director3DCharacterPreset,
  type Director3DBattalionOptions,
  type Director3DPropCategory,
  type Director3DPropPreset,
} from '../../director3d/director3dScene';
import type { LinghuiGlobalAsset } from '../../../../store/linghuiGlobalAssets';

export type Director3DAssetTab = 'props' | 'characters' | 'creatures' | 'cameras' | 'templates';

const ASSET_PROPS: Array<{ id: string; label: string }> = [
  { id: 'mannequin', label: '假人' },
];

const PROP_ICON_BY_TYPE: Record<Director3DPropPreset['type'], LucideIcon> = {
  'prop-box': Box,
  'prop-cylinder': Cylinder,
  'prop-plane': Square,
  'prop-camera': Camera,
  'prop-arrow': ArrowRight,
};

const CAMERA_PRESET_CATEGORY_ORDER: Director3DCameraPresetCategory[] = ['shot-size', 'angle', 'lens', 'classic'];

const LEFT_RAIL_TABS: Array<{ id: Director3DAssetTab; label: string; Icon: LucideIcon; title: string }> = [
  { id: 'characters', label: '人物', Icon: Users, title: '加角色 / 派兵布阵 / 全局角色库' },
  { id: 'creatures', label: '生物', Icon: Zap, title: '现实动物 + 玄幻生物' },
  { id: 'props', label: '道具', Icon: Box, title: '场景道具 + 全局道具库' },
  { id: 'cameras', label: '视角', Icon: Camera, title: '电影镜头预设' },
  { id: 'templates', label: '模板', Icon: LayoutTemplate, title: '快速套用整套场景' },
];

export interface Director3DBattalionPanelConfig {
  rows: number;
  cols: number;
  spacing: number;
  memberFacing: NonNullable<Director3DBattalionOptions['memberFacing']>;
}

interface Director3DAssetLibraryPanelProps {
  activeAssetTab: Director3DAssetTab;
  battalionConfig: Director3DBattalionPanelConfig;
  battalionOpen: boolean;
  cameraPresetGroups: Record<Director3DCameraPresetCategory, Director3DCameraPreset[]>;
  characterAssets: LinghuiGlobalAsset[];
  lastCameraPresetIds: string[];
  openLeftRailTab: Director3DAssetTab | null;
  propAssets: LinghuiGlobalAsset[];
  propCategoryOrder: Director3DPropCategory[];
  propsByCategory: Record<Director3DPropCategory, Director3DPropPreset[]>;
  onAddActor: () => void;
  onAddCharacter: (preset: Director3DCharacterPreset) => void;
  onAddCreature: (species: LinghuiDirector3DCreatureSpecies) => void;
  onAddGlobalAsset: (asset: LinghuiGlobalAsset) => void;
  onAddLiteSoldier: () => void;
  onAddProp: (preset: Director3DPropPreset) => void;
  onAddRidingHorse: () => void;
  onApplyCameraPreset: (preset: Director3DCameraPreset) => void;
  onApplyTemplate: (templateId: string) => void;
  onDeleteGlobalAsset: (asset: LinghuiGlobalAsset) => void;
  onDeployBattalion: () => void;
  onSetActiveAssetTab: (tab: Director3DAssetTab) => void;
  onSetBattalionConfig: React.Dispatch<React.SetStateAction<Director3DBattalionPanelConfig>>;
  onSetBattalionOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onSetOpenLeftRailTab: React.Dispatch<React.SetStateAction<Director3DAssetTab | null>>;
  onToggleAssetFavorite: (asset: LinghuiGlobalAsset) => void;
}

export const Director3DAssetLibraryPanel: React.FC<Director3DAssetLibraryPanelProps> = ({
  activeAssetTab,
  battalionConfig,
  battalionOpen,
  cameraPresetGroups,
  characterAssets,
  lastCameraPresetIds,
  openLeftRailTab,
  propAssets,
  propCategoryOrder,
  propsByCategory,
  onAddActor,
  onAddCharacter,
  onAddCreature,
  onAddGlobalAsset,
  onAddLiteSoldier,
  onAddProp,
  onAddRidingHorse,
  onApplyCameraPreset,
  onApplyTemplate,
  onDeleteGlobalAsset,
  onDeployBattalion,
  onSetActiveAssetTab,
  onSetBattalionConfig,
  onSetBattalionOpen,
  onSetOpenLeftRailTab,
  onToggleAssetFavorite,
}) => (
  <aside className="linghuiDirector3DRail">
    {LEFT_RAIL_TABS.map(tab => (
      <Popover
        key={tab.id}
        open={openLeftRailTab === tab.id}
        trigger="hover"
        placement="right"
        align={{ overflow: { adjustY: true, adjustX: true } }}
        mouseEnterDelay={0.1}
        mouseLeaveDelay={0.2}
        overlayClassName="linghuiDirector3DRailPopover"
        getPopupContainer={triggerNode => triggerNode.ownerDocument.body}
        onOpenChange={(open) => {
          if (open) {
            onSetOpenLeftRailTab(tab.id);
            onSetActiveAssetTab(tab.id);
          }
        }}
        content={(
          <div className="linghuiDirector3DRailPopoverInner">
            <div className="linghuiDirector3DRailPopoverTitle">{tab.label}</div>
            <div className="linghuiDirector3DAssetGrid">
              {activeAssetTab === 'characters' && (
                <>
                  <div className="linghuiDirector3DCameraGroupHeading">主角预设</div>
                  {DIRECTOR3D_CHARACTER_PRESETS.map(preset => (
                    <button
                      key={preset.id}
                      type="button"
                      className="linghuiDirector3DAssetTile"
                      onClick={() => onAddCharacter(preset)}
                      title={`${preset.label} · ${preset.hint}`}
                    >
                      <Users size={18} style={{ color: preset.color.startsWith('var(') ? undefined : preset.color }} />
                      <span>{preset.label}</span>
                    </button>
                  ))}
                  <div className="linghuiDirector3DCameraGroupHeading">通用</div>
                  {ASSET_PROPS.map(asset => (
                    <button key={asset.id} type="button" className="linghuiDirector3DAssetTile" onClick={onAddActor} title="加一个空白主角假人">
                      <Users size={20} />
                      <span>{asset.label}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    className="linghuiDirector3DAssetTile"
                    onClick={onAddLiteSoldier}
                    title="加一个低多边形群演占位，独立可拖拽，作为人群路人或填充背景"
                  >
                    <Users size={20} style={{ opacity: 0.6 }} />
                    <span>群演</span>
                  </button>
                  <button
                    type="button"
                    className="linghuiDirector3DAssetTile"
                    onClick={onAddRidingHorse}
                    title="添加骑手与马的组合，任一成员移动 / 旋转都会保持相对关系"
                  >
                    <Zap size={20} />
                    <span>人骑马</span>
                  </button>
                  {characterAssets.length > 0 ? (
                    <>
                      <div className="linghuiDirector3DCameraGroupHeading">我的全局库</div>
                      {characterAssets.map(asset => (
                        <button
                          key={asset.id}
                          type="button"
                          className={`linghuiDirector3DAssetTile linghuiDirector3DGlobalTile ${asset.favorite ? 'isFavorite' : ''}`}
                          onClick={() => onAddGlobalAsset(asset)}
                          onContextMenu={event => {
                            event.preventDefault();
                            onDeleteGlobalAsset(asset);
                          }}
                          title={`${asset.label}（右键删除 / 点击星标切换收藏）`}
                        >
                          <span className="linghuiDirector3DGlobalTileFavoriteSlot" onClick={(event) => { event.stopPropagation(); onToggleAssetFavorite(asset); }}>
                            {asset.favorite ? <BookmarkCheck size={12} /> : <Bookmark size={12} />}
                          </span>
                          <Users size={18} style={{ color: asset.color?.startsWith('var(') ? undefined : asset.color }} />
                          <span>{asset.label}</span>
                        </button>
                      ))}
                    </>
                  ) : null}
                </>
              )}
              {activeAssetTab === 'characters' && (
                <Popover
                  open={battalionOpen}
                  onOpenChange={onSetBattalionOpen}
                  trigger="click"
                  placement="rightTop"
                  overlayClassName="linghuiDirector3DBattalionPopover"
                  getPopupContainer={triggerNode => triggerNode.ownerDocument.body}
                  content={(
                    <div className="linghuiDirector3DBattalionPanel">
                      <div className="linghuiDirector3DBattalionTitle">派兵布阵</div>
                      <div className="linghuiDirector3DBattalionHint">一键铺 M 行 × N 列的低级假人，用于群戏排布或受阅式构图。</div>
                      <div className="linghuiDirector3DBattalionRow">
                        <span className="linghuiDirector3DBattalionLabel">行 × 列</span>
                        <InputNumber
                          size="small"
                          min={1}
                          max={12}
                          value={battalionConfig.rows}
                          onChange={value => onSetBattalionConfig(prev => ({ ...prev, rows: Math.max(1, Math.min(12, Math.round(Number(value) || 1))) }))}
                        />
                        <span className="linghuiDirector3DBattalionTimes">×</span>
                        <InputNumber
                          size="small"
                          min={1}
                          max={12}
                          value={battalionConfig.cols}
                          onChange={value => onSetBattalionConfig(prev => ({ ...prev, cols: Math.max(1, Math.min(12, Math.round(Number(value) || 1))) }))}
                        />
                        <span className="linghuiDirector3DBattalionTotal">= {battalionConfig.rows * battalionConfig.cols} 人</span>
                      </div>
                      <div className="linghuiDirector3DBattalionRow">
                        <span className="linghuiDirector3DBattalionLabel">间距</span>
                        <div className="linghuiDirector3DBattalionChipGroup">
                          {[
                            { value: 0.6, label: '密集' },
                            { value: 1.0, label: '标准' },
                            { value: 1.6, label: '稀疏' },
                          ].map(option => (
                            <button
                              key={option.value}
                              type="button"
                              className={`linghuiDirector3DBattalionChip ${Math.abs(battalionConfig.spacing - option.value) < 0.01 ? 'isActive' : ''}`}
                              onClick={() => onSetBattalionConfig(prev => ({ ...prev, spacing: option.value }))}
                            >
                              {option.label}
                              <span className="linghuiDirector3DBattalionChipMeta">{option.value}m</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="linghuiDirector3DBattalionRow">
                        <span className="linghuiDirector3DBattalionLabel">朝向</span>
                        <div className="linghuiDirector3DBattalionChipGroup">
                          {([
                            { value: 'forward' as const, label: '正向' },
                            { value: 'away' as const, label: '背向' },
                            { value: 'inward' as const, label: '向心' },
                            { value: 'outward' as const, label: '向外' },
                          ]).map(option => (
                            <button
                              key={option.value}
                              type="button"
                              className={`linghuiDirector3DBattalionChip ${battalionConfig.memberFacing === option.value ? 'isActive' : ''}`}
                              onClick={() => onSetBattalionConfig(prev => ({ ...prev, memberFacing: option.value }))}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="linghuiDirector3DBattalionActions">
                        <Button size="small" onClick={() => onSetBattalionOpen(false)}>取消</Button>
                        <Button size="small" type="primary" icon={<Plus size={14} />} onClick={onDeployBattalion}>
                          部署
                        </Button>
                      </div>
                    </div>
                  )}
                >
                  <button type="button" className="linghuiDirector3DAssetTile">
                    <Grid2x2 size={20} />
                    <span>派兵布阵</span>
                  </button>
                </Popover>
              )}
              {activeAssetTab === 'creatures' && (
                <>
                  <div className="linghuiDirector3DCameraGroupHeading">现实动物</div>
                  {CREATURE_SPECIES_LIBRARY.filter(spec => (
                    spec.kind === 'lion' || spec.kind === 'wolf' || spec.kind === 'tiger'
                    || spec.kind === 'bear' || spec.kind === 'horse' || spec.kind === 'eagle'
                  )).map(spec => (
                    <button
                      key={spec.kind}
                      type="button"
                      className="linghuiDirector3DAssetTile"
                      onClick={() => onAddCreature(spec.kind)}
                      title={spec.promptHint}
                    >
                      <Users size={20} />
                      <span>{spec.label}</span>
                    </button>
                  ))}
                  <div className="linghuiDirector3DCameraGroupHeading">玄幻生物</div>
                  {CREATURE_SPECIES_LIBRARY.filter(spec => (
                    spec.kind === 'dragon' || spec.kind === 'phoenix' || spec.kind === 'qilin'
                    || spec.kind === 'fox' || spec.kind === 'deer' || spec.kind === 'crane'
                  )).map(spec => (
                    <button
                      key={spec.kind}
                      type="button"
                      className="linghuiDirector3DAssetTile"
                      onClick={() => onAddCreature(spec.kind)}
                      title={spec.promptHint}
                    >
                      <Zap size={20} />
                      <span>{spec.label}</span>
                    </button>
                  ))}
                </>
              )}
              {activeAssetTab === 'cameras' && CAMERA_PRESET_CATEGORY_ORDER.flatMap(category => {
                const presets = cameraPresetGroups[category] ?? [];
                if (presets.length === 0) return [];
                return [
                  <div key={`${category}-heading`} className="linghuiDirector3DCameraGroupHeading">
                    {DIRECTOR3D_CAMERA_PRESET_CATEGORY_LABELS[category]}
                  </div>,
                  ...presets.map(preset => {
                    const active = lastCameraPresetIds[0] === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        className={`linghuiDirector3DAssetTile linghuiDirector3DCameraTile ${active ? 'isActive' : ''}`}
                        onClick={() => onApplyCameraPreset(preset)}
                        title={preset.hint ? `${preset.label} · ${preset.hint}` : preset.label}
                      >
                        <Camera size={18} />
                        <span>{preset.label}</span>
                      </button>
                    );
                  }),
                ];
              })}
              {activeAssetTab === 'props' && propCategoryOrder.flatMap(category => {
                const presets = propsByCategory[category] ?? [];
                if (presets.length === 0) return [];
                return [
                  <div key={`prop-cat-${category}`} className="linghuiDirector3DCameraGroupHeading">
                    {DIRECTOR3D_PROP_CATEGORY_LABELS[category]}
                  </div>,
                  ...presets.map(preset => {
                    const Icon = PROP_ICON_BY_TYPE[preset.type] ?? Box;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        className="linghuiDirector3DAssetTile"
                        onClick={() => onAddProp(preset)}
                        title={preset.promptHint ? `${preset.label} · ${preset.promptHint}` : preset.label}
                      >
                        <Icon size={20} />
                        <span>{preset.label}</span>
                      </button>
                    );
                  }),
                ];
              })}
              {activeAssetTab === 'props' && propAssets.length > 0 && (
                <>
                  <div className="linghuiDirector3DCameraGroupHeading">我的全局库</div>
                  {propAssets.map(asset => {
                    const Icon = PROP_ICON_BY_TYPE[asset.propType ?? 'prop-box'] ?? Box;
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        className={`linghuiDirector3DAssetTile linghuiDirector3DGlobalTile ${asset.favorite ? 'isFavorite' : ''}`}
                        onClick={() => onAddGlobalAsset(asset)}
                        onContextMenu={event => {
                          event.preventDefault();
                          onDeleteGlobalAsset(asset);
                        }}
                        title={`${asset.label}（右键删除 / 星标切换收藏）`}
                      >
                        <span className="linghuiDirector3DGlobalTileFavoriteSlot" onClick={(event) => { event.stopPropagation(); onToggleAssetFavorite(asset); }}>
                          {asset.favorite ? <BookmarkCheck size={12} /> : <Bookmark size={12} />}
                        </span>
                        <Icon size={18} />
                        <span>{asset.label}</span>
                      </button>
                    );
                  })}
                </>
              )}
              {activeAssetTab === 'templates' && DIRECTOR3D_SCENE_TEMPLATES.map(template => (
                <button
                  key={template.id}
                  type="button"
                  className="linghuiDirector3DAssetTile"
                  onClick={() => onApplyTemplate(template.id)}
                  title={template.hint}
                >
                  <LayoutTemplate size={20} />
                  <span>{template.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      >
        <button
          type="button"
          className={`linghuiDirector3DRailButton ${activeAssetTab === tab.id ? 'isActive' : ''}`}
          onMouseEnter={() => onSetActiveAssetTab(tab.id)}
          title={tab.title}
        >
          <tab.Icon size={18} />
          <span>{tab.label}</span>
        </button>
      </Popover>
    ))}
  </aside>
);
