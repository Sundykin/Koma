/**
 * 主题选择器（暗色系）
 * 选择项目的视觉风格主题
 */
import React, { useState, useCallback } from 'react';
import { THEME_PRESETS, type ThemePreset } from '../config/themePresets';
import { Check } from 'lucide-react';

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

  return (
    <div className="p-4">
      <h4 className="text-gray-300 text-sm font-medium mb-3">选择主题风格</h4>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {THEME_PRESETS.map(theme => {
          const isSelected = value === theme.id && !isCustom;
          return (
            <div
              key={theme.id}
              className={`
                relative p-3 rounded-lg cursor-pointer transition-all
                ${isSelected
                  ? 'bg-[#1a1a1a] border-2 border-green-500'
                  : 'bg-[#1a1a1a] border-2 border-gray-800 hover:border-gray-600'
                }
              `}
              onClick={() => handleThemeSelect(theme.id)}
            >
              {isSelected && (
                <div className="absolute top-2 right-2 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
              <div className="text-sm font-medium text-gray-200 mb-1">{theme.name}</div>
              <div className="text-xs text-gray-500 mb-2">{theme.description}</div>
              <div
                className="text-[10px] text-gray-600 px-2 py-1 bg-[#0f0f0f] rounded font-mono truncate"
                title={theme.ttiStylePrefix}
              >
                {theme.ttiStylePrefix}
              </div>
            </div>
          );
        })}

        {/* 自定义选项 */}
        <div
          className={`
            relative p-3 rounded-lg cursor-pointer transition-all
            ${isCustom
              ? 'bg-[#1a1a1a] border-2 border-green-500'
              : 'bg-[#1a1a1a] border-2 border-gray-800 hover:border-gray-600'
            }
          `}
          onClick={handleCustomToggle}
        >
          {isCustom && (
            <div className="absolute top-2 right-2 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
              <Check className="w-3 h-3 text-white" />
            </div>
          )}
          <div className="text-sm font-medium text-gray-200 mb-1">自定义</div>
          <div className="text-xs text-gray-500 mb-2">输入自己的风格描述</div>
          <div className="text-[10px] text-gray-600 px-2 py-1 bg-[#0f0f0f] rounded font-mono">
            Custom style...
          </div>
        </div>
      </div>

      {isCustom && (
        <div className="mt-4">
          <label className="block text-xs text-gray-400 mb-2 font-medium">
            自定义风格描述
          </label>
          <textarea
            className="w-full min-h-[80px] p-3 text-sm bg-[#0f0f0f] border border-gray-700 rounded-lg text-gray-300 placeholder-gray-600 resize-y focus:outline-none focus:border-green-600 transition-colors"
            placeholder="e.g., watercolor painting style, soft colors, dreamy atmosphere..."
            value={customText}
            onChange={e => handleCustomChange(e.target.value)}
          />
          <div className="text-[11px] text-gray-600 mt-2">
            这段描述会作为前缀添加到所有图片生成的 prompt 中
          </div>
        </div>
      )}

      {value && !isCustom && (
        <div className="mt-4 p-3 bg-[#1a1a1a] border border-green-900/50 rounded-lg">
          <div className="text-[11px] text-green-500 font-medium mb-1">当前选择</div>
          <div className="text-sm text-gray-300">
            {THEME_PRESETS.find(t => t.id === value)?.name || value}
          </div>
        </div>
      )}
    </div>
  );
};

export default ThemeSelector;
