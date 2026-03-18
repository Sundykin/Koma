/**
 * 资产管理器
 * 使用左侧列表 + 右侧详情面板布局
 */
import React from 'react';
import { AssetManagerPanel } from './AssetManagerPanel';
import type { Character, Scene, Prop, ProjectStyleSnapshot } from '../../types';
import './AssetManager.css';

interface AssetManagerProps {
  projectId: string;
  ttiConfigId?: string;
  itvConfigId?: string;
  theme?: string;
  styleSnapshot?: ProjectStyleSnapshot;
  stylePrompt?: string;
  episodeId?: string;
  episodeName?: string;
  script?: string;
  llmConfigId?: string;
  characters?: Character[];
  scenes?: Scene[];
  props?: Prop[];
  onNext: () => void;
}

export const AssetManager: React.FC<AssetManagerProps> = (props) => {
  return <AssetManagerPanel {...props} />;
};

export default AssetManager;
