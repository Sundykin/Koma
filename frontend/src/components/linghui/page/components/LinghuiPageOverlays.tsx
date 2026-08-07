import { LinghuiLibraryDrawer, type LinghuiAssetFilter, type LinghuiLibraryDrawerKey } from '../../library/components/LinghuiLibraryDrawer';
import type { LinghuiProductionAssetFilter } from '../../library/state/linghuiProductionAssetRecords';
import type {
  LinghuiWorkflowTemplateRecord,
  LinghuiWorkspaceAssetRecord,
  LinghuiWorkspaceHistoryRecord,
} from '../../../../store/linghuiStorage';
import { LinghuiExecutionPlanModal } from '../../execution/components/LinghuiExecutionPlanModal';
import type { LinghuiExecutionPlan } from '../../execution/state/linghuiExecutionPlan';

interface LinghuiPageOverlaysProps {
  activeDrawer: LinghuiLibraryDrawerKey | null;
  activeWorkspaceId?: string;
  assetFilter: LinghuiAssetFilter;
  productionAssetFilter: LinghuiProductionAssetFilter;
  assetLoading: boolean;
  historyLoading: boolean;
  pendingExecutionPlan: {
    scopeLabel: string;
    plan: LinghuiExecutionPlan;
  } | null;
  workflowLoading: boolean;
  workflowTemplates: LinghuiWorkflowTemplateRecord[];
  workspaceAssets: LinghuiWorkspaceAssetRecord[];
  workspaceHistory: LinghuiWorkspaceHistoryRecord[];
  onAssetFilterChange: (filter: LinghuiAssetFilter) => void;
  onProductionAssetFilterChange: (filter: LinghuiProductionAssetFilter) => void;
  onCancelExecutionPlan: () => void;
  onCloseDrawer: () => void;
  onConfirmExecutionPlan: () => void;
  onRefreshAssets: (workspaceId: string | null) => void;
  onRefreshHistory: (workspaceId: string | null) => void;
  onRefreshWorkflows: (workspaceId: string | null) => void;
  onSendAssetToCanvas: (asset: LinghuiWorkspaceAssetRecord) => void;
  onSendHistoryToCanvas: (history: LinghuiWorkspaceHistoryRecord) => void;
  onSendWorkflowToCanvas: (template: LinghuiWorkflowTemplateRecord) => void;
}

export function LinghuiPageOverlays({
  activeDrawer,
  activeWorkspaceId,
  assetFilter,
  productionAssetFilter,
  assetLoading,
  historyLoading,
  pendingExecutionPlan,
  workflowLoading,
  workflowTemplates,
  workspaceAssets,
  workspaceHistory,
  onAssetFilterChange,
  onProductionAssetFilterChange,
  onCancelExecutionPlan,
  onCloseDrawer,
  onConfirmExecutionPlan,
  onRefreshAssets,
  onRefreshHistory,
  onRefreshWorkflows,
  onSendAssetToCanvas,
  onSendHistoryToCanvas,
  onSendWorkflowToCanvas,
}: LinghuiPageOverlaysProps) {
  const workspaceId = activeWorkspaceId ?? null;
  return (
    <>
      <LinghuiLibraryDrawer
        activeDrawer={activeDrawer}
        assetFilter={assetFilter}
        productionAssetFilter={productionAssetFilter}
        workflowLoading={workflowLoading}
        assetLoading={assetLoading}
        historyLoading={historyLoading}
        workflowTemplates={workflowTemplates}
        workspaceAssets={workspaceAssets}
        workspaceHistory={workspaceHistory}
        onClose={onCloseDrawer}
        onAssetFilterChange={onAssetFilterChange}
        onProductionAssetFilterChange={onProductionAssetFilterChange}
        onRefreshWorkflows={() => {
          void onRefreshWorkflows(workspaceId);
        }}
        onSendWorkflowToCanvas={onSendWorkflowToCanvas}
        onRefreshAssets={() => {
          void onRefreshAssets(workspaceId);
        }}
        onSendAssetToCanvas={onSendAssetToCanvas}
        onRefreshHistory={() => {
          void onRefreshHistory(workspaceId);
        }}
        onSendHistoryToCanvas={onSendHistoryToCanvas}
      />

      <LinghuiExecutionPlanModal
        open={pendingExecutionPlan !== null}
        scopeLabel={pendingExecutionPlan?.scopeLabel ?? '执行计划'}
        plan={pendingExecutionPlan?.plan ?? null}
        onConfirm={() => {
          void onConfirmExecutionPlan();
        }}
        onCancel={onCancelExecutionPlan}
      />
    </>
  );
}
