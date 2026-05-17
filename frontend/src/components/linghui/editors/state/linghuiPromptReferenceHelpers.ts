import type { MediaAssetSource, ProviderAssetInput } from '../../../../types';
import type {
  LinghuiImageNodeProperties,
  LinghuiMediaItem,
  LinghuiNodeData,
  LinghuiNodeResult,
  LinghuiScriptNodeProperties,
  LinghuiTextNodeProperties,
  LinghuiVideoNodeProperties,
} from '../../../../types/linghui';
import {
  getLinghuiResultDescriptionText,
  getLinghuiResultItems,
  getLinghuiResultPrimaryMedia,
  getLinghuiResultShots,
  getLinghuiResultText,
} from '../../../../types/linghui';
import { resolveLinghuiImageResultWithSelectedPrimary } from './linghuiImageCollections';
import { buildLinghuiVisualSourceKey, resolveLinghuiMediaAssetSource } from '../../utils/linghuiMediaAssetSource';

interface PromptRefItem {
  id: string; nodeId: string; kind: 'image' | 'video' | 'audio' | 'text';
  name: string; description?: string; source?: MediaAssetSource; previewSource?: string; textValue?: string;
}

export function resolvePromptReferenceSourceValue(source?: MediaAssetSource): string | undefined {
  if (!source) return undefined;
  if (typeof source === 'string') { const n = source.trim(); return n || undefined; }
  const asAny = source as unknown as { remoteUrl?: string; localPath?: string };
  const remoteUrl = typeof asAny.remoteUrl === 'string' ? asAny.remoteUrl.trim() : '';
  if (remoteUrl) return remoteUrl;
  const localPath = typeof asAny.localPath === 'string' ? asAny.localPath.trim() : '';
  return localPath || undefined;
}

export function resolveImageFallbackMode(properties: LinghuiImageNodeProperties): 'import' | 'generate' {
  if (properties.mode === 'import' || properties.mode === 'generate') return properties.mode;
  return String(properties.source ?? '').trim() ? 'import' : 'generate';
}

export function buildRefKey(ref: MediaAssetSource | ProviderAssetInput): string {
  if (typeof ref === 'string') return ref;
  if (ref && typeof ref === 'object' && 'transport' in ref && 'value' in ref) return `${ref.transport}:${ref.value}`;
  const anyRef = ref as unknown as Record<string, unknown> | undefined;
  const rUrl = typeof anyRef?.remoteUrl === 'string' ? anyRef.remoteUrl : '';
  const lPath = typeof anyRef?.localPath === 'string' ? anyRef.localPath : '';
  return rUrl || lPath || JSON.stringify(ref);
}

export function getMediaUploadSource(media?: { kind?: string; source?: string; posterSource?: string; mimeType?: string; width?: number; height?: number; durationSec?: number; metadata?: Record<string, unknown>; }): MediaAssetSource | undefined {
  if (!media) return undefined;
  return resolveLinghuiMediaAssetSource(media as LinghuiMediaItem);
}

export function getMediaPreviewSource(media?: { kind?: string; source?: string; posterSource?: string; }): string | undefined {
  if (!media) return undefined;
  if (media.kind === 'video') return media.posterSource || media.source || undefined;
  if (media.kind === 'audio') return media.posterSource || undefined;
  return media.source || undefined;
}

export function getDescriptionText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function pushVisualRef(bucket: PromptRefItem[], params: { id: string; nodeId: string; kind: 'image' | 'video' | 'audio' | 'text'; name: string; description?: string; source?: MediaAssetSource; previewSource?: string }) {
  if (!params.source) return;
  bucket.push({ id: params.id, nodeId: params.nodeId, kind: params.kind as any, name: params.name, description: params.description, source: params.source, previewSource: params.previewSource ?? resolvePromptReferenceSourceValue(params.source) });
}

function pushTextRef(bucket: PromptRefItem[], params: { id: string; nodeId: string; name: string; description?: string; textValue?: string }) {
  const tv = getDescriptionText(params.textValue);
  if (!tv) return;
  bucket.push({ id: params.id, nodeId: params.nodeId, kind: 'text', name: params.name, description: params.description, textValue: tv });
}

export function buildResultReferences(nodeId: string, nodeData: LinghuiNodeData, result?: LinghuiNodeResult): PromptRefItem[] {
  const refs: PromptRefItem[] = [];
  if (!result) return refs;
  const nr = nodeData.linghuiType === 'linghui/image' || nodeData.linghuiType === 'linghui/panorama'
    ? resolveLinghuiImageResultWithSelectedPrimary(nodeData.properties as unknown as LinghuiImageNodeProperties, result) ?? result : result;
  const primary = getLinghuiResultPrimaryMedia(nr);
  const items = getLinghuiResultItems(nr);
  const shots = getLinghuiResultShots(nr);
  const textValue = getLinghuiResultText(nr);
  const baseName = getDescriptionText(primary?.label, nodeData.label) || nodeData.label;
  const baseDesc = `来自上游节点：${nodeData.label}`;
  const pk = primary?.kind;

  if (pk === 'audio') {
    const as = getMediaUploadSource(primary);
    if (as) { pushVisualRef(refs, { id: nodeId, nodeId, kind: 'audio', name: baseName, description: baseDesc, source: as, previewSource: getMediaPreviewSource(primary) ?? resolvePromptReferenceSourceValue(as) }); }
    else { refs.push({ id: nodeId, nodeId, kind: 'audio', name: baseName, description: baseDesc, textValue: getDescriptionText(textValue) || getDescriptionText(getLinghuiResultDescriptionText(nr)) || baseName }); }
  } else if (pk === 'video' && !getMediaUploadSource(primary)) {
    refs.push({ id: nodeId, nodeId, kind: 'video', name: baseName, description: baseDesc, textValue: baseName });
  } else {
    const ps = getMediaUploadSource(primary);
    const pp = getMediaPreviewSource(primary);
    pushVisualRef(refs, { id: nodeId, nodeId, kind: primary?.kind === 'video' ? 'video' : 'image', name: baseName, description: baseDesc, source: ps, previewSource: pp ?? resolvePromptReferenceSourceValue(ps) });
  }

  if (nodeData.linghuiType !== 'linghui/image') {
    items.forEach((item, index) => {
      const ir = getMediaUploadSource(item); const ip = getMediaPreviewSource(item);
      const psk = buildLinghuiVisualSourceKey(getMediaUploadSource(primary)); const isk = buildLinghuiVisualSourceKey(ir);
      if (pk !== 'audio' && index === 0 && isk && psk === isk) return;
      if (item.kind === 'audio') {
        const an = getDescriptionText(item.label, `${baseName} ${index + 1}`) || `${baseName} ${index + 1}`;
        if (ir) { pushVisualRef(refs, { id: `${nodeId}__item_${index + 1}`, nodeId, kind: 'audio', name: an, description: `${baseDesc} · 产物 ${index + 1}`, source: ir, previewSource: ip ?? resolvePromptReferenceSourceValue(ir) }); }
        else { refs.push({ id: `${nodeId}__item_${index + 1}`, nodeId, kind: 'audio', name: an, description: `${baseDesc} · 产物 ${index + 1}`, textValue: an }); }
        return;
      }
      if (item.kind === 'video' && !ir) { refs.push({ id: `${nodeId}__item_${index + 1}`, nodeId, kind: 'video', name: getDescriptionText(item.label, `${baseName} ${index + 1}`) || `${baseName} ${index + 1}`, description: `${baseDesc} · 产物 ${index + 1}`, textValue: getDescriptionText(item.label, `${baseName} ${index + 1}`) || `${baseName} ${index + 1}` }); return; }
      pushVisualRef(refs, { id: `${nodeId}__item_${index + 1}`, nodeId, kind: item.kind === 'video' ? 'video' : 'image', name: getDescriptionText(item.label, `${baseName} ${index + 1}`) || `${baseName} ${index + 1}`, description: `${baseDesc} · 产物 ${index + 1}`, source: ir, previewSource: ip ?? resolvePromptReferenceSourceValue(ir) });
    });
  }

  shots.forEach((shot, index) => {
    const ss = getMediaUploadSource(shot.image);
    const sid = `${nodeId}__shot_${index + 1}`;
    const sn = getDescriptionText(shot.title, `${baseName} 分镜 ${index + 1}`) || `${baseName} 分镜 ${index + 1}`;
    const sd = getDescriptionText(shot.description, `${baseDesc} · 分镜 ${index + 1}`);
    if (ss) { pushVisualRef(refs, { id: sid, nodeId, kind: 'image', name: sn, description: sd, source: ss, previewSource: resolvePromptReferenceSourceValue(ss) }); return; }
    pushTextRef(refs, { id: sid, nodeId, name: sn, description: sd, textValue: shot.description || shot.title });
  });
  pushTextRef(refs, { id: `${nodeId}__text`, nodeId, name: `${baseName} 文本`, description: baseDesc, textValue: getDescriptionText(textValue) || getDescriptionText(getLinghuiResultDescriptionText(nr)) });
  return refs;
}

export function buildFallbackReference(nodeId: string, nodeData: LinghuiNodeData): PromptRefItem[] {
  if (nodeData.linghuiType === 'linghui/audio') {
    const s = getDescriptionText((nodeData.properties as Record<string, unknown>)?.source);
    if (!s) return []; return [{ id: nodeId, nodeId, kind: 'audio', name: nodeData.label, description: `来自上游节点：${nodeData.label}`, source: s, previewSource: s }];
  }
  if (nodeData.linghuiType === 'linghui/image' || nodeData.linghuiType === 'linghui/panorama') {
    const p = nodeData.properties as unknown as LinghuiImageNodeProperties;
    const m = resolveImageFallbackMode(p); const s = getDescriptionText(p.source);
    if (!s || m !== 'import') return []; return [{ id: nodeId, nodeId, kind: 'image', name: nodeData.label, description: `来自上游节点：${nodeData.label}`, source: s, previewSource: s }];
  }
  if (nodeData.linghuiType === 'linghui/video') {
    const p = nodeData.properties as unknown as LinghuiVideoNodeProperties;
    const s = getDescriptionText(p.source); const ps = getDescriptionText(p.posterSource);
    if (!s && !ps) return []; return [{ id: nodeId, nodeId, kind: 'video', name: nodeData.label, description: `来自上游节点：${nodeData.label}`, ...(s ? { source: s, previewSource: ps || s } : { textValue: nodeData.label }) }];
  }
  if (nodeData.linghuiType === 'linghui/text') {
    const p = nodeData.properties as unknown as LinghuiTextNodeProperties;
    if (p.mode !== 'manual') return []; const c = getDescriptionText(p.content);
    if (!c) return []; return [{ id: `${nodeId}__text`, nodeId, kind: 'text', name: nodeData.label, description: `来自上游节点：${nodeData.label}`, textValue: c }];
  }
  if (nodeData.linghuiType === 'linghui/storyboard') {
    const p = nodeData.properties as Record<string, unknown> | undefined;
    const c = getDescriptionText(p?.prompt); if (!c) return []; return [{ id: `${nodeId}__text`, nodeId, kind: 'text', name: nodeData.label, description: `来自上游节点：${nodeData.label}`, textValue: c }];
  }
  if (nodeData.linghuiType === 'linghui/script') {
    const p = nodeData.properties as unknown as LinghuiScriptNodeProperties;
    const c = getDescriptionText(p.mode === 'manual' ? p.content : p.prompt); if (!c) return []; return [{ id: `${nodeId}__text`, nodeId, kind: 'text', name: nodeData.label, description: `来自上游节点：${nodeData.label}`, textValue: c }];
  }
  if (nodeData.linghuiType === 'linghui/director3d') {
    const p = nodeData.properties as Record<string, unknown> | undefined;
    const om = p?.outputMode === 'video' ? 'video' : 'lineart';
    const tv = getDescriptionText(p?.timelineVideoUrl); const tp = getDescriptionText(p?.timelineVideoPosterUrl);
    const lt = getDescriptionText(p?.lineartDataUrl);
    if (om === 'video' && tv) return [{ id: nodeId, nodeId, kind: 'video', name: nodeData.label, description: `来自上游节点：${nodeData.label}（3D 导演时间轴动画）`, source: tv, previewSource: tp || tv }];
    if (lt && (lt.startsWith('koma-local://') || lt.startsWith('http'))) return [{ id: nodeId, nodeId, kind: 'image', name: nodeData.label, description: `来自上游节点：${nodeData.label}（3D 线稿）`, source: lt, previewSource: lt }];
    return [];
  }
  return [];
}
