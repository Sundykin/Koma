import React from 'react';
import { Modal, Tag } from 'antd';
import type { LinghuiExecutionPlan } from '../state/linghuiExecutionPlan';

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '约 0 秒';
  }
  if (seconds < 60) {
    return `约 ${Math.round(seconds)} 秒`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = Math.round(seconds % 60);
  return remainSeconds > 0 ? `约 ${minutes} 分 ${remainSeconds} 秒` : `约 ${minutes} 分钟`;
}

interface LinghuiExecutionPlanModalProps {
  open: boolean;
  scopeLabel: string;
  plan: LinghuiExecutionPlan | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export const LinghuiExecutionPlanModal: React.FC<LinghuiExecutionPlanModalProps> = ({
  open,
  scopeLabel,
  plan,
  onConfirm,
  onCancel,
}) => {
  return (
    <Modal
      open={open}
      title="执行计划"
      okText="确认执行"
      cancelText="取消"
      onOk={onConfirm}
      onCancel={onCancel}
      className="linghuiExecutionPlanModal"
      width={760}
      destroyOnHidden
    >
      {!plan ? null : (
        <div className="linghuiExecutionPlanBody">
          <div className="linghuiExecutionPlanHero">
            <div className="linghuiExecutionPlanEyebrow">Explain Before Run</div>
            <div className="linghuiExecutionPlanTitle">{scopeLabel}</div>
            <div className="linghuiExecutionPlanDescription">
              本轮将执行 {plan.totalNodes} 个节点，其中补跑依赖 {plan.dependencyNodeCount} 个。
            </div>
          </div>

          <div className="linghuiExecutionPlanGrid">
            <div className="linghuiExecutionPlanStatCard">
              <div className="linghuiExecutionPlanStatLabel">预计总耗时</div>
              <div className="linghuiExecutionPlanStatValue">{formatDuration(plan.estimatedTotalDurationSec)}</div>
              <div className="linghuiExecutionPlanStatHint">按波次最长节点累加估算</div>
            </div>
            <div className="linghuiExecutionPlanStatCard">
              <div className="linghuiExecutionPlanStatLabel">执行波次</div>
              <div className="linghuiExecutionPlanStatValue">{plan.waveCount}</div>
              <div className="linghuiExecutionPlanStatHint">当前最大并行度 {plan.maxParallelism}</div>
            </div>
            <div className="linghuiExecutionPlanStatCard">
              <div className="linghuiExecutionPlanStatLabel">成本估算</div>
              <div className="linghuiExecutionPlanStatValue">
                {plan.estimatedCostStatus === 'available' ? `¥${plan.estimatedCostCny?.toFixed(2) ?? '0.00'}` : '暂不可估'}
              </div>
              <div className="linghuiExecutionPlanStatHint">{plan.costUnavailableReason || '已使用当前 Provider 定价估算'}</div>
            </div>
          </div>

          <div className="linghuiExecutionPlanSection">
            <div className="linghuiExecutionPlanSectionTitle">瓶颈节点</div>
            <div className="linghuiExecutionPlanBadgeRow">
              {plan.bottleneckNodeIds.length > 0 ? plan.nodes
                .filter(node => node.isBottleneck)
                .map(node => (
                  <Tag key={node.nodeId} color="gold">
                    {node.label} · {formatDuration(node.estimatedDurationSec)}
                  </Tag>
                )) : (
                  <span className="linghuiExecutionPlanEmpty">当前没有识别到瓶颈节点</span>
                )}
            </div>
          </div>

          <div className="linghuiExecutionPlanSection">
            <div className="linghuiExecutionPlanSectionTitle">执行波次</div>
            <div className="linghuiExecutionPlanWaveList">
              {plan.waves.map(wave => (
                <div key={`wave-${wave.index}`} className="linghuiExecutionPlanWaveCard">
                  <div className="linghuiExecutionPlanWaveHeader">
                    <div className="linghuiExecutionPlanWaveTitle">第 {wave.index + 1} 波</div>
                    <div className="linghuiExecutionPlanWaveMeta">
                      <span>并行 {wave.parallelism}</span>
                      <span>{formatDuration(wave.estimatedDurationSec)}</span>
                    </div>
                  </div>
                  <div className="linghuiExecutionPlanBadgeRow">
                    {wave.nodeIds.map(nodeId => {
                      const node = plan.nodes.find(item => item.nodeId === nodeId);
                      if (!node) return null;
                      return (
                        <span
                          key={nodeId}
                          className={`linghuiExecutionPlanNodeBadge ${node.isBottleneck ? 'isBottleneck' : ''}`}
                        >
                          {node.label}
                          <em>{node.estimateSource === 'history' ? '历史' : '兜底'} · {formatDuration(node.estimatedDurationSec)}</em>
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default LinghuiExecutionPlanModal;
