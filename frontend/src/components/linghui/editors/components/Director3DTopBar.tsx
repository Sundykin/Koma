import React from 'react';
import { Tooltip } from 'antd';
import { Box, Camera, Grid2x2, Maximize2, Minimize2, Users } from 'lucide-react';
import type { LinghuiDirector3DRenderMode, LinghuiDirector3DScene } from '../../../../types/linghui';

interface Director3DTopBarStats {
  mannequins: number;
  liteMannequins: number;
  formations: number;
  formationMembers: number;
  props: number;
}

interface Director3DTopBarProps {
  immersive: boolean;
  renderModeForExport: LinghuiDirector3DRenderMode;
  renderModeLabels: Record<LinghuiDirector3DRenderMode, string>;
  scene: LinghuiDirector3DScene;
  stats: Director3DTopBarStats;
  onToggleImmersive: () => void;
}

export const Director3DTopBar: React.FC<Director3DTopBarProps> = ({
  immersive,
  renderModeForExport,
  renderModeLabels,
  scene,
  stats,
  onToggleImmersive,
}) => (
  <div className="linghuiDirector3DTopBar">
    <span className="linghuiDirector3DTopBarChip">
      <Camera size={11} />
      {Math.round(scene.camera.fov)}° · {scene.camera.aspectRatio}
    </span>
    <span className="linghuiDirector3DTopBarChip">
      <Users size={11} />
      {stats.mannequins} 角色
    </span>
    {stats.liteMannequins > 0 ? (
      <span className="linghuiDirector3DTopBarChip">
        <Users size={11} style={{ opacity: 0.6 }} />
        {stats.liteMannequins} 群演
      </span>
    ) : null}
    {stats.formations > 0 ? (
      <span className="linghuiDirector3DTopBarChip" title={`${stats.formations} 个方阵 / 共 ${stats.formationMembers} 人`}>
        <Grid2x2 size={11} />
        {stats.formations} 方阵 · {stats.formationMembers} 人
      </span>
    ) : null}
    {stats.props > 0 ? (
      <span className="linghuiDirector3DTopBarChip">
        <Box size={11} />
        {stats.props} 道具
      </span>
    ) : null}
    <span className="linghuiDirector3DTopBarChip">
      {renderModeLabels[renderModeForExport]}
    </span>
    <span className="linghuiDirector3DTopBarChip" title="Cmd/Ctrl+F 沉浸 · 1-4 切换渲染模式">
      ⌘F / 1-4
    </span>
    <Tooltip title={immersive ? '退出沉浸 (Cmd/Ctrl+F)' : '沉浸模式 (Cmd/Ctrl+F)'} placement="bottom">
      <button
        type="button"
        className="linghuiDirector3DTopBarBtn"
        onClick={onToggleImmersive}
      >
        {immersive ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
      </button>
    </Tooltip>
  </div>
);
