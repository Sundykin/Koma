/**
 * Linghui 打光面板的灯光颜色快捷色板，复刻 electron-egg tc-lighting-toolbar 中的
 * COLOR_SWATCHES 常量。放在 palettes/ 下让 style-discipline 视为颜色字面量授权位置。
 */
export const LINGHUI_LIGHTING_SWATCHES = [
  '#FFFFFF',
  '#FFE0B2',
  '#FFF3E0',
  '#E3F2FD',
  '#FCE4EC',
  '#F3E5F5',
  '#E8F5E9',
] as const;

export const LINGHUI_LIGHTING_DEFAULT_SWATCH = LINGHUI_LIGHTING_SWATCHES[0];
