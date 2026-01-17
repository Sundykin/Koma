/**
 * 主题选择器
 * 选择项目的视觉风格主题
 */
import React, { useState, useCallback } from 'react';
import { THEME_PRESETS, type ThemePreset } from '../config/themePresets';

interface ThemeSelectorProps {
  value?: string;
  customStyle?: string;
  onChange: (theme: string | undefined, customStyle: string | undefined) => void;
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  value,
  customStyle,
  onChange,
}) => {
  const [isCustom, setIsCustom] = useState(!value || !THEME_PRESETS.find(t => t.id === value));
  const [customText, setCustomText] = useState(customStyle || '');

  const handleThemeSelect = useCallback((themeId: string) => {
    setIsCustom(false);
    onChange(themeId, undefined);
  }, [onChange]);

  const handleCustomToggle = useCallback(() => {
    setIsCustom(true);
    onChange(undefined, customText);
  }, [customText, onChange]);

  const handleCustomChange = useCallback((text: string) => {
    setCustomText(text);
    onChange(undefined, text);
  }, [onChange]);

  const containerStyle: React.CSSProperties = {
    padding: '16px',
  };

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '12px',
    marginBottom: '16px',
  };

  const cardStyle = (isSelected: boolean): React.CSSProperties => ({
    padding: '12px',
    borderRadius: '8px',
    border: isSelected ? '2px solid var(--color-primary, #1976d2)' : '2px solid #ddd',
    backgroundColor: isSelected ? 'rgba(25, 118, 210, 0.05)' : 'white',
    cursor: 'pointer',
    transition: 'all 0.2s',
  });

  const titleStyle: React.CSSProperties = {
    fontWeight: 'bold',
    fontSize: '14px',
    marginBottom: '4px',
  };

  const descStyle: React.CSSProperties = {
    fontSize: '12px',
    color: '#666',
    marginBottom: '8px',
  };

  const prefixStyle: React.CSSProperties = {
    fontSize: '10px',
    color: '#999',
    padding: '4px 8px',
    backgroundColor: '#f5f5f5',
    borderRadius: '4px',
    fontFamily: 'monospace',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

  const customInputStyle: React.CSSProperties = {
    width: '100%',
    minHeight: '80px',
    padding: '8px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    resize: 'vertical',
    fontFamily: 'inherit',
  };

  return (
    <div style={containerStyle}>
      <h4 style={{ marginTop: 0, marginBottom: '12px' }}>选择主题风格</h4>

      <div style={gridStyle}>
        {THEME_PRESETS.map(theme => (
          <div
            key={theme.id}
            style={cardStyle(value === theme.id && !isCustom)}
            onClick={() => handleThemeSelect(theme.id)}
          >
            <div style={titleStyle}>{theme.name}</div>
            <div style={descStyle}>{theme.description}</div>
            <div style={prefixStyle} title={theme.ttiStylePrefix}>
              {theme.ttiStylePrefix}
            </div>
          </div>
        ))}

        {/* 自定义选项 */}
        <div
          style={cardStyle(isCustom)}
          onClick={handleCustomToggle}
        >
          <div style={titleStyle}>自定义</div>
          <div style={descStyle}>输入自己的风格描述</div>
          <div style={prefixStyle}>Custom style...</div>
        </div>
      </div>

      {isCustom && (
        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            自定义风格描述 (英文)
          </label>
          <textarea
            style={customInputStyle}
            placeholder="e.g., watercolor painting style, soft colors, dreamy atmosphere..."
            value={customText}
            onChange={e => handleCustomChange(e.target.value)}
          />
          <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
            这段描述会作为前缀添加到所有图片生成的 prompt 中
          </div>
        </div>
      )}

      {value && !isCustom && (
        <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#f0f7ff', borderRadius: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>当前选择</div>
          <div style={{ fontSize: '14px' }}>
            {THEME_PRESETS.find(t => t.id === value)?.name || value}
          </div>
        </div>
      )}
    </div>
  );
};

export default ThemeSelector;
