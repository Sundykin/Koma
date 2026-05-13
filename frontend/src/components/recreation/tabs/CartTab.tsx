/**
 * CartTab — 选菜式修改单
 *
 * - 已加入的 ModificationItem 列表
 * - DAG 层级显示（哪些可并行 / 哪些依赖）
 * - 估价估时汇总
 * - 提交按钮 → 转 mock job 跳队列
 */
import React, { useState } from 'react';
import { Card, Tag, Button, Empty, Popconfirm, message, Divider, Tooltip } from 'antd';
import { Trash2, ArrowRight, Send, AlertCircle } from 'lucide-react';

import { useRecreationStore } from '../recreationStore';
import { MODIFICATION_LABEL } from '../mockData';
import { submitRecreationModifyTask } from '../../../services/recreationModifyClient';
import { loadRecreationAiConfig } from '../aiConfigStore';
import type { ModificationItem, ModificationKind } from '../types';

const KIND_COLOR: Record<ModificationKind, string> = {
  face_swap: '#4d6fff',
  body_reshape: '#b14fff',
  wardrobe: '#fa8c16',
  aspect_ratio: '#52c41a',
  language_dub: '#13c2c2',
  stylization: '#eb2f96',
};

function formatSec(sec: number): string {
  if (sec < 60) return `${sec} 秒`;
  if (sec < 3600) return `${Math.round(sec / 60)} 分钟`;
  if (sec < 86400) return `${(sec / 3600).toFixed(1)} 小时`;
  return `${(sec / 86400).toFixed(1)} 天`;
}

const ItemCard: React.FC<{ item: ModificationItem; onRemove: () => void }> = ({ item, onRemove }) => {
  const color = KIND_COLOR[item.kind];
  const unsupported = UNSUPPORTED_KINDS.has(item.kind);
  return (
    <Card
      size="small"
      styles={{ body: { padding: 14 } }}
      style={{ borderLeft: `3px solid ${color}`, background: unsupported ? '#fff2f0' : undefined }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Tag color={color} style={{ margin: 0 }}>{MODIFICATION_LABEL[item.kind]}</Tag>
            <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{item.shotCount} 镜</span>
            {unsupported && <Tag color="error" style={{ margin: 0 }}>暂不支持</Tag>}
          </div>
          <div style={{ fontSize: 13, marginBottom: 6 }}>{item.scopeText}</div>
          <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'rgba(0,0,0,0.55)' }}>
            <span>预计配额 <strong style={{ color: 'rgba(0,0,0,0.85)' }}>{item.estUnits}</strong></span>
            <span>预计耗时 <strong style={{ color: 'rgba(0,0,0,0.85)' }}>{formatSec(item.estDurationSec)}</strong></span>
            <span>
              可行性
              <strong
                style={{
                  color: item.feasibilityScore > 0.85 ? '#52c41a'
                    : item.feasibilityScore > 0.65 ? '#faad14' : '#d4380d',
                  marginLeft: 4,
                }}
              >
                {(item.feasibilityScore * 100).toFixed(0)}
              </strong>
            </span>
          </div>
        </div>
        <Popconfirm title="从修改单移除？" onConfirm={onRemove} okText="移除" cancelText="取消">
          <Button type="text" size="small" icon={<Trash2 size={14} />} danger />
        </Popconfirm>
      </div>
    </Card>
  );
};

const UNSUPPORTED_KINDS: ReadonlySet<ModificationKind> = new Set([
  // 所有能力都已接入逐帧 TTI 管线；保留集合以便未来出现真不可用能力时再加
]);

export const CartTab: React.FC = () => {
  const plan = useRecreationStore((s) => s.activePlan);
  const remove = useRecreationStore((s) => s.removeModificationItem);
  const clear = useRecreationStore((s) => s.clearPlan);
  const setTab = useRecreationStore((s) => s.setTab);
  const activeVideoId = useRecreationStore((s) => s.activeVideoId);
  const [submitting, setSubmitting] = useState(false);

  if (plan.items.length === 0) {
    return (
      <Empty
        description={
          <div>
            <div style={{ fontSize: 14, marginBottom: 4 }}>修改单是空的</div>
            <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
              到「诊断报告」页浏览，点 + 改造 按钮加入项目
            </div>
          </div>
        }
      />
    );
  }

  const totalUnits = plan.items.reduce((s, i) => s + i.estUnits, 0);
  const totalSec = plan.items.reduce((s, i) => s + i.estDurationSec, 0);
  const hasLowFeasibility = plan.items.some((i) => i.feasibilityScore < 0.7);
  const unsupportedItems = plan.items.filter((i) => UNSUPPORTED_KINDS.has(i.kind));

  const onSubmit = async (): Promise<void> => {
    if (!activeVideoId) {
      message.error('请先选择源视频');
      return;
    }
    if (unsupportedItems.length > 0) {
      message.error(`修改单含暂不支持的能力：${unsupportedItems.map((i) => MODIFICATION_LABEL[i.kind]).join('、')}，请先移除`);
      return;
    }
    setSubmitting(true);
    try {
      const aiCfg = await loadRecreationAiConfig().catch(() => null);
      const channelKey = aiCfg?.channelKey;
      let submitted = 0;
      let deduped = 0;
      for (const item of plan.items) {
        const res = await submitRecreationModifyTask({
          videoId: activeVideoId,
          planId: plan.planId,
          channelKey,
          item: {
            itemId: item.itemId,
            kind: item.kind,
            scopeText: item.scopeText,
            shotCount: item.shotCount,
            params: item.params,
          },
        });
        if (res.deduped) deduped++; else submitted++;
      }
      message.success(`已提交 ${submitted} 项${deduped > 0 ? `（${deduped} 项已在执行，已去重）` : ''}`);
      clear();
      setTab('queue');
    } catch (err) {
      message.error(`提交失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 16, height: '100%' }}>
      {/* 主区：DAG 层级 */}
      <div style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
        <div style={{ marginBottom: 12, fontSize: 14, color: 'rgba(0,0,0,0.65)' }}>
          DAG 依赖编排（同层可并行执行）
        </div>
        {plan.dagLayers.map((layer, idx) => (
          <div key={idx} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div
                style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: '#4d6fff', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 600,
                }}
              >
                {idx + 1}
              </div>
              <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.65)' }}>
                第 {idx + 1} 层 · {layer.length} 项{layer.length > 1 ? '（并行）' : ''}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 34 }}>
              {layer.map((itemId) => {
                const item = plan.items.find((i) => i.itemId === itemId);
                if (!item) return null;
                return (
                  <ItemCard
                    key={item.itemId}
                    item={item}
                    onRemove={() => remove(item.itemId)}
                  />
                );
              })}
            </div>
            {idx < plan.dagLayers.length - 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0' }}>
                <ArrowRight size={18} color="rgba(0,0,0,0.35)" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 侧栏：汇总 + 提交 */}
      <div style={{ width: 280, flexShrink: 0 }}>
        <Card size="small">
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>提交汇总</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0' }}>
            <span style={{ color: 'rgba(0,0,0,0.55)' }}>修改项</span>
            <strong>{plan.items.length}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0' }}>
            <span style={{ color: 'rgba(0,0,0,0.55)' }}>DAG 层级</span>
            <strong>{plan.dagLayers.length}</strong>
          </div>
          <Divider style={{ margin: '10px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0' }}>
            <span style={{ color: 'rgba(0,0,0,0.55)' }}>配额合计</span>
            <strong style={{ fontSize: 15 }}>{totalUnits}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0' }}>
            <span style={{ color: 'rgba(0,0,0,0.55)' }}>预计总耗时</span>
            <strong>{formatSec(totalSec)}</strong>
          </div>

          {hasLowFeasibility && (
            <div
              style={{
                marginTop: 12, padding: 10, borderRadius: 6,
                background: '#fffbe6', border: '1px solid #ffe58f',
                fontSize: 12, display: 'flex', gap: 8,
              }}
            >
              <AlertCircle size={14} color="#faad14" style={{ flexShrink: 0, marginTop: 2 }} />
              <span>有可行性偏低的修改项，建议拆分范围或降级到 Lite 档</span>
            </div>
          )}

          {unsupportedItems.length > 0 && (
            <div
              style={{
                marginTop: 12, padding: 10, borderRadius: 6,
                background: '#fff2f0', border: '1px solid #ffccc7',
                fontSize: 12, display: 'flex', gap: 8,
              }}
            >
              <AlertCircle size={14} color="#d4380d" style={{ flexShrink: 0, marginTop: 2 }} />
              <span>含 {unsupportedItems.length} 项当前未配置 channel 的能力（{unsupportedItems.map((i) => MODIFICATION_LABEL[i.kind]).join('、')}），需移除后再提交</span>
            </div>
          )}

          <Tooltip
            title={
              plan.items.length === 0 ? '修改单为空'
                : !activeVideoId ? '请先选择源视频'
                : unsupportedItems.length > 0 ? '含暂不支持的能力'
                : ''
            }
          >
            <Button
              type="primary"
              icon={<Send size={14} />}
              block
              size="large"
              style={{ marginTop: 16 }}
              disabled={plan.items.length === 0 || !activeVideoId || unsupportedItems.length > 0 || submitting}
              loading={submitting}
              onClick={onSubmit}
            >
              提交执行
            </Button>
          </Tooltip>
          <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(0,0,0,0.45)', textAlign: 'center' }}>
            提交后任务进入"任务队列"
          </div>
        </Card>
      </div>
    </div>
  );
};
