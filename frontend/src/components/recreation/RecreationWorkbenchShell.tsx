/**
 * RecreationWorkbenchShell — R4 二创工作台主壳
 *
 * 二创独立于 project：用户拖入视频 → AI 12 维度 VLM 解析 → 选菜式修改。
 *
 * 5 个 Tab：
 *   - overview 视频库（拖入 + 历史卡片）
 *   - report   12 维度诊断报告浏览
 *   - cart     选菜式修改单
 *   - queue    任务队列
 *   - vault    物料版本树
 */
import React, { useState } from 'react';
import { Tabs, Tag, Button } from 'antd';
import { LayoutGrid, FileBarChart, ShoppingCart, ListChecks, Archive, Settings } from 'lucide-react';

import { useRecreationStore } from './recreationStore';
import { OverviewTab } from './tabs/OverviewTab';
import { ReportTab } from './tabs/ReportTab';
import { CartTab } from './tabs/CartTab';
import { QueueTab } from './tabs/QueueTab';
import { VaultTab } from './tabs/VaultTab';
import { AiConfigModal } from './AiConfigModal';

export const RecreationWorkbenchShell: React.FC = () => {
  const activeTab = useRecreationStore((s) => s.activeTab);
  const setTab = useRecreationStore((s) => s.setTab);
  const plan = useRecreationStore((s) => s.activePlan);
  const [aiConfigOpen, setAiConfigOpen] = useState(false);

  const cartCount = plan.items.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '20px 28px' }}>
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <h1 style={{ fontSize: 26, fontWeight: 600, margin: 0 }}>二创工作台</h1>
            <Tag color="processing">R4 · 多模态诊断 + 选菜修改</Tag>
          </div>
          <div style={{ marginTop: 6, color: 'rgba(0,0,0,0.55)', fontSize: 13 }}>
            导入视频 → AI 12 维度解析 → 选菜式修改 → 出片
          </div>
        </div>
        <Button icon={<Settings size={14} />} onClick={() => setAiConfigOpen(true)}>
          AI 能力配置
        </Button>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={(k) => setTab(k as never)}
        style={{ flex: '0 0 auto' }}
        items={[
          { key: 'overview', label: <span><LayoutGrid size={14} style={{ verticalAlign: -2, marginRight: 6 }} />视频库</span> },
          { key: 'report',   label: <span><FileBarChart size={14} style={{ verticalAlign: -2, marginRight: 6 }} />诊断报告</span> },
          {
            key: 'cart',
            label: (
              <span>
                <ShoppingCart size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
                修改单
                {cartCount > 0 && <Tag color="blue" style={{ marginLeft: 6 }}>{cartCount}</Tag>}
              </span>
            ),
          },
          { key: 'queue', label: <span><ListChecks size={14} style={{ verticalAlign: -2, marginRight: 6 }} />任务队列</span> },
          { key: 'vault', label: <span><Archive size={14} style={{ verticalAlign: -2, marginRight: 6 }} />物料库</span> },
        ]}
      />

      <div style={{ flex: 1, overflow: 'auto', paddingTop: 8 }}>
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'report' && <ReportTab />}
        {activeTab === 'cart' && <CartTab />}
        {activeTab === 'queue' && <QueueTab />}
        {activeTab === 'vault' && <VaultTab />}
      </div>

      <AiConfigModal
        open={aiConfigOpen}
        onClose={() => setAiConfigOpen(false)}
        onSaved={() => undefined}
      />
    </div>
  );
};

export default RecreationWorkbenchShell;
