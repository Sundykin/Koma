import React from 'react';
import type {
  LinghuiImageToolKey,
  LinghuiNodeData,
  LinghuiNodeRunState,
  LinghuiNodeType,
  LinghuiVideoToolKey,
} from '../../../../types/linghui';
import { AgentNodeEditor } from './AgentNodeEditor';
import { AudioNodeEditor } from './AudioNodeEditor';
import { ImageNodeEditor } from './ImageNodeEditor';
import { PanoramaNodeEditor } from './PanoramaNodeEditor';
import { ScriptNodeEditor } from './ScriptNodeEditor';
import { StoryboardNodeEditor } from './StoryboardNodeEditor';
import { TextNodeEditor } from './TextNodeEditor';
import { VideoNodeEditor } from './VideoNodeEditor';
import type { LinghuiPromptReferenceItem } from '../state/linghuiPromptReferences';
import type {
  LinghuiReferenceAudio,
  LinghuiReferenceImage,
  LinghuiReferenceVideo,
} from '../state/linghuiReferenceMedia';

interface LinghuiNodeEditorSurfaceProps {
  nodeId: string;
  nodeType: LinghuiNodeType;
  nodeData: LinghuiNodeData;
  nodeRuns: Record<string, LinghuiNodeRunState>;
  workspaceId?: string;
  referenceImages: LinghuiReferenceImage[];
  referenceVideos: LinghuiReferenceVideo[];
  referenceAudios: LinghuiReferenceAudio[];
  promptReferences: LinghuiPromptReferenceItem[];
  productionAssetSourceNodeData?: LinghuiNodeData | null;
  activeImageTool: LinghuiImageToolKey | null;
  activeVideoTool: LinghuiVideoToolKey | null;
  onImageToolChange: (tool: LinghuiImageToolKey | null) => void;
  onVideoToolChange: (tool: LinghuiVideoToolKey | null) => void;
  onCreateDerivedVideoFrames?: React.ComponentProps<typeof VideoNodeEditor>['onCreateDerivedFrames'];
  onCreateDerivedVideoClips?: React.ComponentProps<typeof VideoNodeEditor>['onCreateDerivedVideos'];
  onCreateDerivedVideoAnalysis?: React.ComponentProps<typeof VideoNodeEditor>['onCreateDerivedAnalysis'];
  onExecuteMultiAngle?: (options: Parameters<React.ComponentProps<typeof ImageNodeEditor>['onExecuteMultiAngle']>[0]) => void;
  onApplyImageToolPreset?: React.ComponentProps<typeof ImageNodeEditor>['onApplyImageToolPreset'];
  onAssetLibraryMutate?: () => void;
  onRunNode: (nodeId: string) => void;
  onDeriveScriptShots: (nodeId: string, shots: Parameters<React.ComponentProps<typeof ScriptNodeEditor>['onDeriveShots']>[0]) => void;
  onGenerateScriptImages: (nodeId: string, shots: Parameters<React.ComponentProps<typeof ScriptNodeEditor>['onGenerateImages']>[0]) => void;
  onGenerateScriptVideos: (nodeId: string, shots: Parameters<React.ComponentProps<typeof ScriptNodeEditor>['onGenerateVideos']>[0]) => void;
}

export const LinghuiNodeEditorSurface: React.FC<LinghuiNodeEditorSurfaceProps> = ({
  nodeId,
  nodeType,
  nodeData,
  nodeRuns,
  workspaceId,
  referenceImages,
  referenceVideos,
  referenceAudios,
  promptReferences,
  productionAssetSourceNodeData,
  activeImageTool,
  activeVideoTool,
  onImageToolChange,
  onVideoToolChange,
  onCreateDerivedVideoFrames,
  onCreateDerivedVideoClips,
  onCreateDerivedVideoAnalysis,
  onExecuteMultiAngle,
  onApplyImageToolPreset,
  onAssetLibraryMutate,
  onRunNode,
  onDeriveScriptShots,
  onGenerateScriptImages,
  onGenerateScriptVideos,
}) => (
  <>
    {nodeType === 'linghui/text' && (
      <TextNodeEditor
        nodeId={nodeId}
        nodeData={nodeData}
        nodeRun={nodeRuns[nodeId]}
        promptReferences={promptReferences}
        onRun={() => onRunNode(nodeId)}
      />
    )}
    {nodeType === 'linghui/agent' && (
      <AgentNodeEditor
        nodeId={nodeId}
        nodeData={nodeData}
        nodeRun={nodeRuns[nodeId]}
        promptReferences={promptReferences}
        onRun={() => onRunNode(nodeId)}
      />
    )}
    {nodeType === 'linghui/image' && (
      <ImageNodeEditor
        nodeId={nodeId}
        nodeData={nodeData}
        nodeRun={nodeRuns[nodeId]}
        referenceImages={referenceImages}
        promptReferences={promptReferences}
        workspaceId={workspaceId}
        productionAssetSourceNodeData={productionAssetSourceNodeData}
        activeTool={activeImageTool}
        onToolChange={onImageToolChange}
        onExecuteMultiAngle={options => onExecuteMultiAngle?.(options)}
        onApplyImageToolPreset={onApplyImageToolPreset}
        onAssetLibraryMutate={onAssetLibraryMutate}
        onRun={() => onRunNode(nodeId)}
      />
    )}
    {nodeType === 'linghui/panorama' && (
      <PanoramaNodeEditor
        nodeId={nodeId}
        nodeData={nodeData}
        nodeRun={nodeRuns[nodeId]}
        referenceImages={referenceImages}
        promptReferences={promptReferences}
        workspaceId={workspaceId}
        activeTool={activeImageTool}
        onToolChange={onImageToolChange}
        onExecuteMultiAngle={options => onExecuteMultiAngle?.(options)}
        onRun={() => onRunNode(nodeId)}
      />
    )}
    {nodeType === 'linghui/video' && (
      <VideoNodeEditor
        nodeId={nodeId}
        nodeData={nodeData}
        nodeRun={nodeRuns[nodeId]}
        referenceImages={referenceImages}
        referenceVideos={referenceVideos}
        referenceAudios={referenceAudios}
        promptReferences={promptReferences}
        workspaceId={workspaceId}
        activeTool={activeVideoTool}
        onToolChange={onVideoToolChange}
        onCreateDerivedFrames={onCreateDerivedVideoFrames}
        onCreateDerivedVideos={onCreateDerivedVideoClips}
        onCreateDerivedAnalysis={onCreateDerivedVideoAnalysis}
        onRun={() => onRunNode(nodeId)}
      />
    )}
    {nodeType === 'linghui/audio' && (
      <AudioNodeEditor
        nodeId={nodeId}
        nodeData={nodeData}
        nodeRun={nodeRuns[nodeId]}
        promptReferences={promptReferences}
        workspaceId={workspaceId}
        onAssetLibraryMutate={onAssetLibraryMutate}
        onRun={() => onRunNode(nodeId)}
      />
    )}
    {nodeType === 'linghui/script' && (
      <ScriptNodeEditor
        nodeId={nodeId}
        nodeData={nodeData}
        nodeRun={nodeRuns[nodeId]}
        promptReferences={promptReferences}
        workspaceId={workspaceId}
        onAssetLibraryMutate={onAssetLibraryMutate}
        onRun={() => onRunNode(nodeId)}
        onDeriveShots={shots => onDeriveScriptShots(nodeId, shots)}
        onGenerateImages={shots => onGenerateScriptImages(nodeId, shots)}
        onGenerateVideos={shots => onGenerateScriptVideos(nodeId, shots)}
      />
    )}
    {nodeType === 'linghui/storyboard' && (
      <StoryboardNodeEditor
        nodeId={nodeId}
        nodeData={nodeData}
        nodeRun={nodeRuns[nodeId]}
        promptReferences={promptReferences}
        workspaceId={workspaceId}
        onAssetLibraryMutate={onAssetLibraryMutate}
        onRun={() => onRunNode(nodeId)}
        onDeriveShots={shots => onDeriveScriptShots(nodeId, shots)}
        onGenerateImages={shots => onGenerateScriptImages(nodeId, shots)}
        onGenerateVideos={shots => onGenerateScriptVideos(nodeId, shots)}
      />
    )}
  </>
);
