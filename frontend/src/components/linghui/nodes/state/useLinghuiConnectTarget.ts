import { useStore } from '@xyflow/react';

/**
 * LibTV connection-target 抖动动画：当用户从另一个节点拖拽连线，且鼠标 hover 到当前节点上时，
 * 当前节点应该有视觉反馈（轻微 shake）。
 *
 * 实现：通过 xyflow 内建 `connection` state 派生。
 *  - connection.inProgress：用户正在拖拽连线
 *  - connection.fromNode.id：连线源节点 id
 *  - connection.toNode.id：连线当前 hover 到的目标节点 id
 *
 * 当 fromNode !== toNode === currentNode 时，返回 true，节点根加 `.isConnectTarget` 触发抖动。
 */
export function useLinghuiConnectTarget(nodeId: string): boolean {
  return useStore(state => {
    const connection = state.connection;
    if (!connection?.inProgress) return false;
    const toId = connection.toNode?.id ?? null;
    const fromId = connection.fromNode?.id ?? null;
    return toId === nodeId && fromId !== nodeId;
  });
}
