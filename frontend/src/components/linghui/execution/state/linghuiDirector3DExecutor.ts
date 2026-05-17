import type { LinghuiNodeResult } from '../../../../types/linghui';
import type { ExecutionNodeView } from './linghuiExecutionShared';
import { persistDirectorMediaSource } from './linghuiDirectorMediaPersistence';

/**
 * 3D 导演节点执行：把编辑器导出的 lineartDataUrl 落盘后当作主输出。
 *
 * 不调用任何远程 provider —— 渲染发生在编辑器里（Director3DViewport.captureCurrentView），
 * 用户点击「导出线稿参考」按钮即可写入 properties.lineartDataUrl。
 * 执行节点时：
 *   1. 把 dataUrl 落盘成 koma-local URL（下游 image/video provider 才接受）
 *   2. angleViews 同样落盘
 *   3. 主图 + 多视角包装成 LinghuiNodeResult，下游图片/视频节点可直接引用
 *
 * 如果还没导出，节点会失败并提示用户先在编辑器里导出。
 */
export async function executeDirector3DNode(
  node: ExecutionNodeView,
): Promise<LinghuiNodeResult> {
  const properties = node.properties as Record<string, unknown> | undefined;
  const lineartDataUrl = typeof properties?.lineartDataUrl === 'string' ? properties.lineartDataUrl : '';
  const directorPromptFragment = typeof properties?.directorPromptFragment === 'string' ? properties.directorPromptFragment : '';
  if (!lineartDataUrl) {
    throw new Error('请先在 3D 导演工作台编辑器里点击「导出线稿参考」');
  }

  const sceneJson = (() => {
    try {
      return JSON.stringify(properties?.scene ?? {});
    } catch {
      return '';
    }
  })();

  // 视频输出模式：用户在编辑器导出时间轴动画后，properties.timelineVideoUrl 已经
  // 是落盘 koma-local URL，直接打包成 video kind 给下游视频节点用（image-to-video / 视频参考）。
  const outputMode = properties?.outputMode === 'video' ? 'video' : 'lineart';
  const timelineVideoUrl = typeof properties?.timelineVideoUrl === 'string' ? properties.timelineVideoUrl : '';
  const timelineVideoPosterUrl = typeof properties?.timelineVideoPosterUrl === 'string' ? properties.timelineVideoPosterUrl : '';

  if (outputMode === 'video' && timelineVideoUrl) {
    const meta = (properties?.timelineVideoMeta ?? {}) as { duration?: number; fps?: number; frameCount?: number; width?: number; height?: number };
    // posterSource 优先用导出时落盘的首帧；缺失时回退到 lineartDataUrl 但仅当它已经是 koma-local
    const posterCandidate = timelineVideoPosterUrl
      || (lineartDataUrl.startsWith('koma-local://') ? lineartDataUrl : '');
    return {
      kind: 'video',
      primary: {
        kind: 'video',
        source: timelineVideoUrl,
        posterSource: posterCandidate || undefined,
        label: '3D 导演时间轴动画',
        mimeType: 'video/mp4',
        durationSec: typeof meta.duration === 'number' ? meta.duration : undefined,
        width: typeof meta.width === 'number' ? meta.width : undefined,
        height: typeof meta.height === 'number' ? meta.height : undefined,
      },
      metadata: {
        mode: 'director3d-video',
        directorPromptFragment,
        // description 写入 fragment：collectTextSnippets 自动喂给下游 video provider 的 prompt
        description: directorPromptFragment || undefined,
        scene: sceneJson,
        timeline: {
          duration: meta.duration,
          fps: meta.fps,
          frameCount: meta.frameCount,
        },
        // posterSource 显式标注：下游 image-to-video 用 posterSource 作为参考首帧
        posterSource: posterCandidate || undefined,
      },
    } as unknown as LinghuiNodeResult;
  }

  // 主图落盘：dataUrl → koma-local URL
  const persistedLineart = await persistDirectorMediaSource({
    source: lineartDataUrl,
    nodeId: node.id,
    slot: 'lineart',
  });

  const rawAngleViews = Array.isArray(properties?.angleViews) ? properties.angleViews : [];
  interface AngleItem { id: string; source: string; mimeType: string; label: string }
  // angleViews 落盘：每张并行 persist，失败回退到原 dataUrl
  const angleItems: AngleItem[] = (await Promise.all(
    rawAngleViews.map(async (view, index): Promise<AngleItem | null> => {
      const dataUrl = typeof (view as { dataUrl?: unknown })?.dataUrl === 'string' ? (view as { dataUrl: string }).dataUrl : '';
      if (!dataUrl) return null;
      const label = typeof (view as { label?: unknown })?.label === 'string' ? (view as { label: string }).label : `视角 ${index + 1}`;
      const id = typeof (view as { id?: unknown })?.id === 'string' ? (view as { id: string }).id : `angle-${index + 1}`;
      const persistedSource = await persistDirectorMediaSource({
        source: dataUrl,
        nodeId: node.id,
        slot: `angle-${id}`,
      });
      return { id: `director3d-${node.id}-${id}`, source: persistedSource, mimeType: 'image/png', label };
    }),
  )).filter((value): value is AngleItem => value !== null);

  const primaryItem = {
    id: `director3d-${node.id}`,
    source: persistedLineart,
    mimeType: 'image/png',
    label: '3D 导演线稿',
  };

  // 全局资产参考图聚合：把 scene.actors 上 snapshot 的 referenceImages 全部拼进 result.items，
  // 让下游图片节点拿到真实角色脸 / 服装 / 道具样式做参考。去重，按 actor.label 命名。
  interface ReferenceItem { id: string; source: string; mimeType: string; label: string }
  const referenceItems: ReferenceItem[] = [];
  const sceneActors = Array.isArray((properties?.scene as { actors?: unknown })?.actors)
    ? ((properties?.scene as { actors: unknown[] }).actors)
    : [];
  const seenReferenceUrls = new Set<string>();
  for (const actorRaw of sceneActors) {
    if (!actorRaw || typeof actorRaw !== 'object') continue;
    const actor = actorRaw as { label?: unknown; referenceImages?: unknown; id?: unknown };
    if (!Array.isArray(actor.referenceImages)) continue;
    const actorLabel = typeof actor.label === 'string' ? actor.label : '资产';
    const actorId = typeof actor.id === 'string' ? actor.id : 'unknown';
    let refIndex = 0;
    for (const url of actor.referenceImages) {
      if (typeof url !== 'string' || !url || seenReferenceUrls.has(url)) continue;
      seenReferenceUrls.add(url);
      refIndex += 1;
      referenceItems.push({
        id: `director3d-${node.id}-ref-${actorId}-${refIndex}`,
        source: url,
        mimeType: 'image/png',
        label: `${actorLabel} 参考图 ${refIndex}`,
      });
    }
  }

  const items = [primaryItem, ...angleItems, ...referenceItems];

  return {
    // angleViews / referenceImages 任一非空 → images 集合（用户可用 @ref_{nodeId}__item_N 引用）
    // 否则保持单图 kind，避免破坏既有节点行为
    kind: (angleItems.length > 0 || referenceItems.length > 0) ? 'images' : 'image',
    status: 'succeeded',
    label: '3D 导演线稿',
    items,
    primary: primaryItem,
    metadata: {
      mode: 'director3d',
      directorPromptFragment,
      // 把构图意图（机位 / 演员位置 / 姿态）同步写进 description，下游 image/video
      // executor 通过 collectTextSnippets → getLinghuiResultDescriptionText 会自动拼到
      // prompt 前面，避免"线稿能传，但镜头/姿态描述消失"的断链
      description: directorPromptFragment || undefined,
      scene: sceneJson,
      angleViewCount: angleItems.length,
      referenceImageCount: referenceItems.length,
    },
  } as unknown as LinghuiNodeResult;
}
