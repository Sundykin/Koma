import React, { useEffect, useState } from 'react';
import { useReactFlow, useStore } from '@xyflow/react';
import type { QuickCreateState } from '../state/linghuiCanvasShared';

interface LinghuiCanvasQuickCreateGhostEdgeProps {
  quickCreate: QuickCreateState | null;
}

interface ConnectionEndpoints {
  start: { x: number; y: number };
  end: { x: number; y: number };
}

/**
 * 复刻 LibTV "拖出连线到空白处后连线不消失" 的视觉：
 * 当 quickCreate 由"从节点拖出连线"触发时（即 sourceConnection 非空），
 * 在屏幕坐标系下画一条贝塞尔曲线，从源节点的右侧 output handle 中心连到 quickCreate 弹窗左边缘。
 * 弹窗位置随用户鼠标松开位置变化；曲线随 viewport pan/zoom 实时更新。
 *
 * 关闭时机：quickCreate 被关闭（选了下游节点 / 按 Esc / 在画布其他地方点击）。
 */
export const LinghuiCanvasQuickCreateGhostEdge: React.FC<LinghuiCanvasQuickCreateGhostEdgeProps> = ({
  quickCreate,
}) => {
  const reactFlow = useReactFlow();
  // 订阅 viewport 变化让线条随平移/缩放刷新；用最小依赖避免重渲所有 nodes。
  const viewport = useStore(state => ({
    x: state.transform[0],
    y: state.transform[1],
    zoom: state.transform[2],
  }));
  const [endpoints, setEndpoints] = useState<ConnectionEndpoints | null>(null);

  useEffect(() => {
    if (!quickCreate || !quickCreate.sourceConnection) {
      setEndpoints(null);
      return;
    }

    const sourceNodeId = quickCreate.sourceConnection.sourceNodeId;
    const sourceNode = reactFlow.getNode(sourceNodeId);
    if (!sourceNode) {
      setEndpoints(null);
      return;
    }

    // 旧版 React Flow 用 positionAbsolute，新版统一存到 position 字段并由 internals 维护；
    // 这里读 internals.positionAbsolute（@xyflow/react v12），缺失时降级到 position。
    const internals = (sourceNode as unknown as {
      internals?: { positionAbsolute?: { x: number; y: number } };
    }).internals;
    const position = internals?.positionAbsolute ?? sourceNode.position;
    const width = sourceNode.measured?.width ?? sourceNode.width ?? 0;
    const height = sourceNode.measured?.height ?? sourceNode.height ?? 0;

    // LibTV 节点 output handle 视觉中心在节点右中。
    const flowAnchorX = position.x + width;
    const flowAnchorY = position.y + height / 2;
    const screenStart = reactFlow.flowToScreenPosition({ x: flowAnchorX, y: flowAnchorY });

    // quickCreate.screenX/Y 是松开时的 client 坐标，弹窗以此为锚点。
    // 终点选弹窗左边略偏内一点，让曲线落到面板边缘。
    setEndpoints({
      start: { x: screenStart.x, y: screenStart.y },
      end: { x: quickCreate.screenX, y: quickCreate.screenY },
    });
  }, [quickCreate, reactFlow, viewport.x, viewport.y, viewport.zoom]);

  if (!endpoints) return null;

  const { start, end } = endpoints;
  // 贝塞尔控制点：源端右侧水平拉出，目标端左侧水平拉入，营造 LibTV 顺滑曲线。
  const dx = Math.max(60, Math.abs(end.x - start.x) * 0.4);
  const c1x = start.x + dx;
  const c1y = start.y;
  const c2x = end.x - dx;
  const c2y = end.y;
  const path = `M ${start.x} ${start.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${end.x} ${end.y}`;

  return (
    <svg
      className="linghuiQuickCreateGhostEdge"
      width="100%"
      height="100%"
      aria-hidden="true"
    >
      <path d={path} className="linghuiQuickCreateGhostEdgePath" />
      <circle cx={start.x} cy={start.y} r={4} className="linghuiQuickCreateGhostEdgeAnchor" />
    </svg>
  );
};
