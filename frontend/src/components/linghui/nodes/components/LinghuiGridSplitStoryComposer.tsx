import React, { useEffect, useState } from 'react';
import { Modal, Input, Button } from 'antd';
import type { LinghuiImageNineGridPresetDef } from '../../editors/state/linghuiImageToolPresets';

/**
 * 宫格切分前的"剧情编辑"中间步骤。
 *
 * LibTV 的 grid-split preset 点击即生成；灵绘加一层"编辑剧情" Modal 让用户：
 * 1. 看到 preset 自带的基础提示词（promptSnippet）
 * 2. 在 textarea 里补充自己的角色 / 目标 / 冲突 / 转折等剧情节拍
 * 3. 确认后才提交，提交时把 preset.promptSnippet + 用户补充剧情合并送给 generator
 *
 * 取消按钮关闭面板回到 toolbar 状态；确认按钮调用 onConfirm(mergedPrompt)，由调用方完成
 * onApplyImageToolPreset 派生。
 */
interface LinghuiGridSplitStoryComposerProps {
  preset: LinghuiImageNineGridPresetDef | null;
  /** 点击"生成"：返回合并后的 promptSnippet（preset + 用户补充剧情）。 */
  onConfirm: (preset: LinghuiImageNineGridPresetDef, mergedPromptSnippet: string) => void;
  onCancel: () => void;
}

const STORY_HINT_BY_GRID_TYPE: Record<9 | 16 | 25, string> = {
  9: '主角是谁？最强冲突 / 转折 / 结尾分别是什么？9 格里希望强调哪 3 个节拍？',
  16: '把剧情拆成 16 个清晰节拍：建立场景 → 人物行动 → 冲突升级 → 关键反应 → 结尾悬念。',
  25: '长段落剧情推演 25 格：环境建立 → 人物目标 → 行动 → 障碍 → 反转 → 高潮 → 收束。',
};

export const LinghuiGridSplitStoryComposer: React.FC<LinghuiGridSplitStoryComposerProps> = ({
  preset,
  onConfirm,
  onCancel,
}) => {
  const [draft, setDraft] = useState('');

  // 切换 preset 时清空草稿
  useEffect(() => {
    if (preset) setDraft('');
  }, [preset?.scene]);

  const handleConfirm = () => {
    if (!preset) return;
    const trimmed = draft.trim();
    // 合并策略：preset 的基础 promptSnippet 在前，用户剧情在尾部追加（保证 LibTV 同源样式 + 加入用户语境）
    const merged = trimmed.length > 0
      ? `${preset.promptSnippet}\n\n用户补充剧情：${trimmed}`
      : preset.promptSnippet;
    onConfirm(preset, merged);
  };

  const hint = preset ? STORY_HINT_BY_GRID_TYPE[preset.gridType] : '';

  return (
    <Modal
      open={Boolean(preset)}
      title={preset ? `编辑剧情 · ${preset.label}` : '编辑剧情'}
      onCancel={onCancel}
      destroyOnHidden
      width={560}
      mask={{ closable: false }}
      footer={[
        <Button key="cancel" onClick={onCancel}>取消</Button>,
        <Button
          key="confirm"
          type="primary"
          onClick={handleConfirm}
        >
          生成宫格
        </Button>,
      ]}
    >
      {preset ? (
        <div className="linghuiGridSplitStoryComposerBody">
          <div className="linghuiGridSplitStoryComposerDescription">{preset.description}</div>
          <div className="linghuiGridSplitStoryComposerHint">{hint}</div>
          <Input.TextArea
            autoFocus
            value={draft}
            onChange={event => setDraft(event.target.value)}
            placeholder={hint}
            autoSize={{ minRows: 5, maxRows: 12 }}
            allowClear
          />
          <details className="linghuiGridSplitStoryComposerPresetPreview">
            <summary>查看预置基础提示词</summary>
            <pre>{preset.promptSnippet}</pre>
          </details>
        </div>
      ) : null}
    </Modal>
  );
};
