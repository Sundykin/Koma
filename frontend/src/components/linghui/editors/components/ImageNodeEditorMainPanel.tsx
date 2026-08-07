import React from 'react';
import { Button, Dropdown, Popover } from 'antd';
import type { MenuProps } from 'antd';
import { ArrowUp, Camera, Image as ImageIcon, Trash2, UploadCloud } from 'lucide-react';
import type { LinghuiPromptReferenceItem } from '../state/linghuiPromptReferences';
import { LinghuiPromptEditor } from './LinghuiPromptEditor';

export interface ImageNodeEditorDisplayReferenceImage {
  source?: string;
  label?: string;
  badge: string;
}

interface ImageNodeEditorImportPanelProps {
  activeLibTVToolPanel: React.ReactNode;
  productionAssetAction?: React.ReactNode;
  currentImageLabel?: string;
  hasCurrentImage: boolean;
  hasImportSource: boolean;
  nodeLabel: string;
  onClearImage: () => void;
  onReplaceImage: () => void;
}

export const ImageNodeEditorImportPanel: React.FC<ImageNodeEditorImportPanelProps> = ({
  activeLibTVToolPanel,
  productionAssetAction,
  currentImageLabel,
  hasCurrentImage,
  hasImportSource,
  nodeLabel,
  onClearImage,
  onReplaceImage,
}) => (
  <div className="linghuiEditorPanel" onMouseDown={event => event.stopPropagation()}>
    {productionAssetAction}
    {activeLibTVToolPanel ?? (
      <div className="linghuiEditorControlRow">
        {hasCurrentImage ? (
          <span className="linghuiEditorSummaryPill">{currentImageLabel || nodeLabel}</span>
        ) : (
          <span className="linghuiEditorSummaryPill">尚未上传图片</span>
        )}
        <div className="linghuiEditorActionGroup">
          <Button size="small" icon={<UploadCloud size={14} />} onClick={onReplaceImage}>
            {hasCurrentImage ? '替换图片' : '导入图片'}
          </Button>
          <Button size="small" icon={<Trash2 size={14} />} danger disabled={!hasImportSource} onClick={onClearImage}>
            清空
          </Button>
        </div>
      </div>
    )}
  </div>
);

interface ImageNodeEditorGeneratePanelProps {
  activeLibTVToolPanel: React.ReactNode;
  productionAssetAction?: React.ReactNode;
  cameraButtonSummary: string;
  cameraSettingsContent: React.ReactNode;
  derivedBannerText: string;
  displayReferenceImages: ImageNodeEditorDisplayReferenceImage[];
  focusRegionPanel: React.ReactNode;
  generateButtonText: string;
  getPreviewSource: (source?: string) => string;
  imageSettingsContent: React.ReactNode;
  isDerivedFromController: boolean;
  isImageGenerating: boolean;
  isRunActionLocked: boolean;
  markPointPanel: React.ReactNode;
  modelSummary: string;
  parameterSummary: string;
  prompt: string;
  promptReferences: LinghuiPromptReferenceItem[];
  providerMenuItems: MenuProps['items'];
  providerSelectedKey?: string;
  providersAvailable: boolean;
  onPromptChange: (value: string) => void;
  onRun: () => void;
}

export const ImageNodeEditorGeneratePanel: React.FC<ImageNodeEditorGeneratePanelProps> = ({
  activeLibTVToolPanel,
  productionAssetAction,
  cameraButtonSummary,
  cameraSettingsContent,
  derivedBannerText,
  displayReferenceImages,
  focusRegionPanel,
  generateButtonText,
  getPreviewSource,
  imageSettingsContent,
  isDerivedFromController,
  isImageGenerating,
  isRunActionLocked,
  markPointPanel,
  modelSummary,
  parameterSummary,
  prompt,
  promptReferences,
  providerMenuItems,
  providerSelectedKey,
  providersAvailable,
  onPromptChange,
  onRun,
}) => (
  <div className="linghuiEditorPanel" onMouseDown={event => event.stopPropagation()}>
    {productionAssetAction}
    {activeLibTVToolPanel ?? (
      <>
      {displayReferenceImages.length > 0 && (
        <div className="linghuiEditorSection">
          <div className="linghuiEditorRefs">
            {displayReferenceImages.map((ref, index) => {
              const src = getPreviewSource(ref.source);
              return (
                <div key={`${ref.source || ref.label || index}-${ref.badge}`} className="linghuiEditorRefThumb">
                  {src ? <img src={src} alt={ref.label || `参考 ${index + 1}`} /> : <ImageIcon size={16} />}
                  <span className="linghuiEditorRefBadge">{ref.badge}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isDerivedFromController && (
        <div className="linghuiEditorDerivedBanner" role="note">
          <span className="linghuiEditorDerivedBannerBadge">派生</span>
          <span className="linghuiEditorDerivedBannerText">{derivedBannerText}</span>
        </div>
      )}

      <div className="linghuiEditorPrompt">
        <LinghuiPromptEditor
          value={prompt}
          onChange={onPromptChange}
          references={promptReferences}
          placeholder="输入 @ 引用上游产物"
          surfaceStyle="fusion"
          minHeight="64px"
          maxHeight="152px"
        />
      </div>

      {focusRegionPanel}
      {markPointPanel}

      <div className="linghuiEditorControlRow">
        <Dropdown
          trigger={providersAvailable ? ['click'] : []}
          menu={{
            items: providerMenuItems,
            selectable: true,
            selectedKeys: providerSelectedKey ? [providerSelectedKey] : [],
          }}
          classNames={{ root: 'linghuiNodeEditorDropdownMenu linghuiEditorModelDropdownMenu' }}
          getPopupContainer={triggerNode => triggerNode.ownerDocument.body}
          styles={{ root: { zIndex: 1200 } }}
        >
          <button
            type="button"
            className={`linghuiEditorInlineTrigger ${!providersAvailable ? 'isDisabled' : ''}`}
            onClick={event => event.stopPropagation()}
            disabled={!providersAvailable}
          >
            {modelSummary}
          </button>
        </Dropdown>

        <Popover
          trigger="click"
          placement="bottomRight"
          content={imageSettingsContent}
          overlayClassName="linghuiEditorPopover"
          getPopupContainer={triggerNode => triggerNode.ownerDocument.body}
          zIndex={1200}
        >
          <button
            type="button"
            className="linghuiEditorInlineTrigger"
            onClick={event => event.stopPropagation()}
          >
            {parameterSummary}
          </button>
        </Popover>

        <Popover
          trigger="click"
          placement="bottomRight"
          content={cameraSettingsContent}
          overlayClassName="linghuiEditorPopover"
          getPopupContainer={triggerNode => triggerNode.ownerDocument.body}
          zIndex={1200}
        >
          <button
            type="button"
            className="linghuiEditorInlineTrigger isCameraTrigger"
            title="选择镜头参数"
            onClick={event => event.stopPropagation()}
          >
            <Camera size={13} />
            <span>{cameraButtonSummary}</span>
          </button>
        </Popover>

        <div className="linghuiEditorActionGroup">
          <Button
            type="primary"
            size="small"
            icon={<ArrowUp size={12} />}
            onClick={onRun}
            disabled={isImageGenerating || isRunActionLocked}
            loading={isImageGenerating}
          >
            {generateButtonText}
          </Button>
        </div>
      </div>
      </>
    )}
  </div>
);
