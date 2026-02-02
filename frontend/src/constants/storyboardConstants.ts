/**
 * 分镜布局常量
 * 确保表头与内容列宽同步
 * 左侧操作列固定宽度，内容区域使用 flex 分配
 */

// 左侧固定列宽度 (加宽以容纳全部操作按钮)
export const COL_ACTION_WIDTH = 'w-14'; // 56px 操作列

// 内容区域列宽度 (使用 flex 比例避免横向滚动)
export const SHOT_LAYOUT = {
  colScript: 'flex-[15] min-w-[120px]',
  colAssets: 'flex-[12] min-w-[100px]', // 资产列变窄
  colImageDesign: 'flex-[20] min-w-[160px]',
  colImageResult: 'flex-[18] min-w-[140px]', // 图像生成变宽
  colVideoDesign: 'flex-[20] min-w-[160px]',
  colVideoResult: 'flex-[15] min-w-[120px]',
};

export const ASSET_TYPES = {
  CHARACTER: { label: '角色', icon: 'UserOutlined', color: 'text-blue-400' },
  SCENE: { label: '场景', icon: 'EnvironmentOutlined', color: 'text-green-400' },
  PROP: { label: '道具', icon: 'ToolOutlined', color: 'text-orange-400' },
} as const;
