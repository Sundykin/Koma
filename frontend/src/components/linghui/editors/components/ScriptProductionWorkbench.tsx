import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  AlertTriangle,
  Check,
  CircleCheck,
  Clapperboard,
  CloudCheck,
  CloudOff,
  Image as ImageIcon,
  LockKeyhole,
  MapPin,
  Plus,
  RefreshCw,
  LoaderCircle,
  ScrollText,
  Trash2,
  Unlock,
  Undo2,
  Users,
} from 'lucide-react';
import type {
  LinghuiProductionAsset,
  LinghuiProductionAssetKind,
  LinghuiProductionStage,
  LinghuiStoryboardFrame,
} from '../../../../types/linghui';
import {
  canDeleteLinghuiProductionAsset,
  canEditLinghuiProductionAsset,
  countLinghuiProductionAssetsByKind,
  auditLinghuiProductionConsistency,
  getLinghuiProductionConsistencyIssueId,
  isLinghuiProductionAssetConfirmed,
  listLinghuiProductionAssetReferenceVersions,
  resolveLinghuiProductionAssetCurrentReferenceVersion,
  resolveLinghuiProductionAssetAffectedShots,
  resolveLinghuiProductionAssetStatus,
  rollbackLinghuiProductionAssetReferenceVersion,
  selectLinghuiProductionAssetReferenceVersion,
} from '../state/linghuiProductionAssets';
import type { LinghuiProductionAssetSyncStatus } from '../hooks/useLinghuiProductionAssetSync';
import { toFileSystemDisplayUrl } from '../../../../services/fileSystemPort';

const STAGES: Array<{
  key: LinghuiProductionStage;
  label: string;
  description: string;
  Icon: typeof ScrollText;
}> = [
  { key: 'script', label: '剧本', description: '创作或导入', Icon: ScrollText },
  { key: 'assets', label: '资产', description: '提取并确认', Icon: Users },
  { key: 'storyboard', label: '分镜', description: '生成与调整', Icon: Clapperboard },
];

const KIND_META: Record<LinghuiProductionAssetKind, {
  label: string;
  Icon: typeof Users;
  emptyName: string;
}> = {
  character: { label: '角色', Icon: Users, emptyName: '未命名角色' },
  scene: { label: '场景', Icon: MapPin, emptyName: '未命名场景' },
  prop: { label: '道具', Icon: Box, emptyName: '未命名道具' },
};

interface ScriptProductionWorkbenchProps {
  stage: LinghuiProductionStage;
  shotCount: number;
  shots?: LinghuiStoryboardFrame[];
  assets: LinghuiProductionAsset[];
  selectedShotIds?: string[];
  acknowledgedConsistencyIssueIds?: string[];
  focusedAssetId?: string;
  syncStatus?: LinghuiProductionAssetSyncStatus;
  syncError?: string;
  onStageChange: (stage: LinghuiProductionStage) => void;
  onAssetsChange: (assets: LinghuiProductionAsset[]) => void;
  onRefreshAssets: () => void;
  onGenerateAssets: (assets: LinghuiProductionAsset[]) => void;
  onFocusAsset?: (assetId: string) => void;
  onSelectShots?: (shotIds: string[]) => void;
  onAcknowledgedConsistencyIssueIdsChange?: (issueIds: string[]) => void;
  onRetrySync?: () => void;
}

export const ScriptProductionWorkbench: React.FC<ScriptProductionWorkbenchProps> = ({
  stage,
  shotCount,
  shots = [],
  assets,
  selectedShotIds,
  acknowledgedConsistencyIssueIds = [],
  focusedAssetId,
  syncStatus = 'idle',
  syncError = '',
  onStageChange,
  onAssetsChange,
  onRefreshAssets,
  onGenerateAssets,
  onFocusAsset,
  onSelectShots,
  onAcknowledgedConsistencyIssueIdsChange,
  onRetrySync,
}) => {
  const [pendingDeleteAssetId, setPendingDeleteAssetId] = useState<string | null>(null);
  const assetCardRefs = useRef(new Map<string, HTMLDivElement>());
  const counts = useMemo(() => countLinghuiProductionAssetsByKind(assets), [assets]);
  const confirmedAssets = useMemo(
    () => assets.filter(isLinghuiProductionAssetConfirmed),
    [assets],
  );
  const allConsistencyIssues = useMemo(
    () => stage === 'storyboard' && shots.length > 0 && assets.length > 0
      ? auditLinghuiProductionConsistency(shots, assets)
      : [],
    [assets, shots, stage],
  );
  const acknowledgedIssueSet = useMemo(
    () => new Set(acknowledgedConsistencyIssueIds),
    [acknowledgedConsistencyIssueIds],
  );
  const acknowledgedIssueCount = useMemo(
    () => allConsistencyIssues.filter(issue => (
      acknowledgedIssueSet.has(getLinghuiProductionConsistencyIssueId(issue))
    )).length,
    [acknowledgedIssueSet, allConsistencyIssues],
  );
  const consistencyIssues = useMemo(
    () => allConsistencyIssues.filter(issue => (
      !acknowledgedIssueSet.has(getLinghuiProductionConsistencyIssueId(issue))
    )),
    [acknowledgedIssueSet, allConsistencyIssues],
  );
  const consistencyErrors = useMemo(
    () => consistencyIssues.filter(issue => issue.severity === 'error'),
    [consistencyIssues],
  );
  const consistencyWarnings = useMemo(
    () => consistencyIssues.filter(issue => issue.severity === 'warning'),
    [consistencyIssues],
  );
  const selectionEnabled = Boolean(selectedShotIds && onSelectShots);
  const selectedSet = useMemo(() => new Set(selectedShotIds ?? []), [selectedShotIds]);

  const kindLabel = (kind: LinghuiProductionAssetKind | 'project') => (
    kind === 'project' ? '全片' : KIND_META[kind].label
  );
  const issueTitle = (issue: ReturnType<typeof auditLinghuiProductionConsistency>[number]) => {
    if (issue.code === 'missing-asset') return `缺少${kindLabel(issue.kind)}资产 · ${issue.name}`;
    if (issue.code === 'unapproved-asset') return `${kindLabel(issue.kind)}资产未确认 · ${issue.name}`;
    if (issue.code === 'missing-reference') return `${kindLabel(issue.kind)}缺少参考图 · ${issue.name}`;
    if (issue.code === 'character-clothing-conflict') return `角色服装冲突 · ${issue.name}`;
    if (issue.code === 'scene-time-conflict') return `场景时段冲突 · ${issue.name}`;
    if (issue.code === 'prop-state-conflict') return `关键道具状态冲突 · ${issue.name}`;
    return `画面风格冲突 · ${issue.name}`;
  };
  const issueActionLabel = (issue: ReturnType<typeof auditLinghuiProductionConsistency>[number]) => {
    if (issue.code === 'missing-asset') return '提取缺失资产';
    if (issue.assetId) return '打开资产';
    return null;
  };
  const handleConsistencyIssue = (issue: ReturnType<typeof auditLinghuiProductionConsistency>[number]) => {
    if (issue.assetId) {
      if (onFocusAsset) onFocusAsset(issue.assetId);
      else onStageChange('assets');
      return;
    }
    onRefreshAssets();
    onStageChange('assets');
  };

  const handleSelectIssueShots = (issue: ReturnType<typeof auditLinghuiProductionConsistency>[number]) => {
    if (!onSelectShots || !selectedShotIds) return;
    const availableIds = new Set(shots.map(shot => shot.id));
    const nextIds = issue.shotIds.filter((shotId, index, ids) => (
      availableIds.has(shotId) && ids.indexOf(shotId) === index
    ));
    onSelectShots(nextIds);
  };

  const canAcknowledgeIssue = (issue: ReturnType<typeof auditLinghuiProductionConsistency>[number]) => (
    issue.code === 'character-clothing-conflict'
    || issue.code === 'scene-time-conflict'
    || issue.code === 'prop-state-conflict'
    || issue.code === 'style-conflict'
  );

  const handleAcknowledgeIssue = (issue: ReturnType<typeof auditLinghuiProductionConsistency>[number]) => {
    if (!onAcknowledgedConsistencyIssueIdsChange || !canAcknowledgeIssue(issue)) return;
    const issueId = getLinghuiProductionConsistencyIssueId(issue);
    onAcknowledgedConsistencyIssueIdsChange(Array.from(new Set([
      ...acknowledgedConsistencyIssueIds,
      issueId,
    ])));
  };

  useEffect(() => {
    if (stage !== 'assets' || !focusedAssetId) return;
    const card = assetCardRefs.current.get(focusedAssetId);
    card?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [assets, focusedAssetId, stage]);

  const updateAsset = (assetId: string, patch: Partial<LinghuiProductionAsset>) => {
    onAssetsChange(assets.map(asset => (
      asset.id === assetId && canEditLinghuiProductionAsset(asset)
        ? { ...asset, ...patch }
        : asset
    )));
  };

  const addAsset = (kind: LinghuiProductionAssetKind) => {
    const meta = KIND_META[kind];
    onAssetsChange([
      ...assets,
      {
        id: `production-manual-${kind}-${Date.now()}`,
        kind,
        name: meta.emptyName,
        description: '',
        sourceShotIds: [],
        confirmed: false,
        status: 'draft',
      },
    ]);
  };

  const unlockAsset = (assetId: string) => {
    onAssetsChange(assets.map(asset => (
      asset.id === assetId
        ? { ...asset, confirmed: true, status: 'approved' }
        : asset
    )));
  };

  const deleteAsset = (assetId: string) => {
    setPendingDeleteAssetId(null);
    onAssetsChange(assets.filter(item => item.id !== assetId));
  };

  const formatAffectedShots = (affectedShots: LinghuiStoryboardFrame[]) => affectedShots
    .slice(0, 4)
    .map((shot, index) => {
      const sourceIndex = shots.findIndex(item => item.id === shot.id);
      const displayNumber = shot.shotNumber ?? (sourceIndex >= 0 ? sourceIndex + 1 : index + 1);
      return `#${displayNumber} ${shot.title || '未命名镜头'}`;
    })
    .join('、');

  return (
    <div className="linghuiProductionWorkbench">
      <div className="linghuiProductionStageRail" aria-label="一体化制作流程">
        {STAGES.map((item, index) => {
          const Icon = item.Icon;
          const summary = item.key === 'script'
            ? '输入与生成'
            : item.key === 'assets'
              ? `${assets.length} 项资产`
              : `${shotCount} 个镜头`;
          return (
            <React.Fragment key={item.key}>
              {index > 0 ? <span className="linghuiProductionStageConnector" /> : null}
              <button
                type="button"
                className={`linghuiProductionStage ${stage === item.key ? 'isActive' : ''}`}
                onClick={() => onStageChange(item.key)}
                aria-current={stage === item.key ? 'step' : undefined}
                aria-label={`${index + 1} ${item.label}`}
              >
                <span className="linghuiProductionStageIndex">{index + 1}</span>
                <Icon size={14} />
                <span className="linghuiProductionStageCopy">
                  <strong>{item.label}</strong>
                  <small>{summary}</small>
                </span>
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {stage === 'storyboard' ? (
        <section className="linghuiProductionConsistency" aria-label="分镜一致性检查">
          <div className="linghuiProductionConsistencyHeader">
            <div>
              <div className="linghuiProductionConsistencyTitle">一致性检查</div>
              <div className="linghuiProductionConsistencySubtitle">
                分镜会沿用这里确认的角色、场景和道具；先处理风险可减少画面漂移。
              </div>
            </div>
            <div className="linghuiProductionConsistencyHeaderMeta">
              <span className={`linghuiProductionConsistencyStatus ${shots.length === 0 || assets.length === 0 ? 'isIdle' : consistencyErrors.length > 0 ? 'isError' : consistencyWarnings.length > 0 ? 'isWarning' : 'isReady'}`}>
                {shots.length === 0 ? '等待镜头' : assets.length === 0 ? '尚未建立资产' : consistencyErrors.length > 0 ? `${consistencyErrors.length} 项影响一致性` : consistencyWarnings.length > 0 ? `可生成 · ${consistencyWarnings.length} 项风险` : '可生成'}
              </span>
              {acknowledgedIssueCount > 0 && onAcknowledgedConsistencyIssueIdsChange ? (
                <button
                  type="button"
                  className="linghuiProductionConsistencyAcknowledged"
                  onClick={() => onAcknowledgedConsistencyIssueIdsChange([])}
                  title="重新显示已确认的有意变化"
                  aria-label="重新检查已确认变化"
                >
                  已确认 {acknowledgedIssueCount} 个变化
                </button>
              ) : null}
              {selectionEnabled && shots.length > 0 ? (
                <span className="linghuiProductionConsistencySelection" aria-label={`当前已选 ${selectedShotIds?.length ?? 0} 个镜头`}>
                  已选 {selectedShotIds?.length ?? 0}/{shots.length} 个镜头
                </span>
              ) : null}
            </div>
          </div>

          {shots.length === 0 ? (
            <div className="linghuiProductionConsistencyEmpty">生成或导入镜头后，这里会自动检查资产引用。</div>
          ) : assets.length === 0 ? (
            <div className="linghuiProductionConsistencyLegacy">
              <span>当前工作区还没有作品资产，先从镜头提取一次即可建立检查清单。</span>
              <button type="button" onClick={() => { onRefreshAssets(); onStageChange('assets'); }}>
                <RefreshCw size={12} />
                从镜头提取资产
              </button>
            </div>
          ) : consistencyIssues.length === 0 ? (
            <div className="linghuiProductionConsistencyReady">
              <CircleCheck size={14} />
              <span>角色、场景和道具引用完整，可以继续生成分镜。</span>
            </div>
          ) : (
            <div className="linghuiProductionConsistencyList">
              {consistencyIssues.map(issue => (
                <div className={`linghuiProductionConsistencyIssue is-${issue.severity}`} key={`${issue.code}-${issue.assetId || `${issue.kind}-${issue.name}`}`}>
                  <div className="linghuiProductionConsistencyIssueIcon">
                    {issue.code === 'missing-reference' ? <ImageIcon size={13} /> : <AlertTriangle size={13} />}
                  </div>
                  <div className="linghuiProductionConsistencyIssueCopy">
                    <strong>{issueTitle(issue)}</strong>
                    {issue.detail ? <span title={issue.detail}>证据：{issue.detail}</span> : null}
                    <span>影响 {issue.shotLabels.slice(0, 4).join('、')}{issue.shotLabels.length > 4 ? ` 等 ${issue.shotLabels.length} 个镜头` : ''}</span>
                  </div>
                  <div className="linghuiProductionConsistencyIssueActions">
                    {selectionEnabled && issue.shotIds.length > 0 ? (
                      <button
                        type="button"
                        className={issue.shotIds.length === selectedShotIds?.length && issue.shotIds.every(shotId => selectedSet.has(shotId)) ? 'isSelected' : undefined}
                        aria-pressed={issue.shotIds.length === selectedShotIds?.length && issue.shotIds.every(shotId => selectedSet.has(shotId))}
                        onClick={() => handleSelectIssueShots(issue)}
                      >
                        {issue.shotIds.length === selectedShotIds?.length && issue.shotIds.every(shotId => selectedSet.has(shotId))
                          ? `已选中 ${issue.shotIds.length} 个镜头`
                          : `选中 ${issue.shotIds.length} 个受影响镜头`}
                      </button>
                    ) : null}
                    {issueActionLabel(issue) ? (
                      <button type="button" onClick={() => handleConsistencyIssue(issue)}>
                        {issueActionLabel(issue)}
                      </button>
                    ) : null}
                    {canAcknowledgeIssue(issue) && onAcknowledgedConsistencyIssueIdsChange ? (
                      <button type="button" onClick={() => handleAcknowledgeIssue(issue)}>
                        确认有意变化
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {stage === 'assets' ? (
        <div className="linghuiProductionAssetPanel">
          <div className="linghuiProductionAssetHeader">
            <div>
              <div className="linghuiProductionAssetTitle">作品资产</div>
              <div className="linghuiProductionAssetSubtitle">
                从 {shotCount} 个镜头归并角色、场景与道具；确认后会生成可复用的参考图节点。
              </div>
            </div>
            <div className="linghuiProductionAssetStats">
              <span><Users size={12} />{counts.character} 角色</span>
              <span><MapPin size={12} />{counts.scene} 场景</span>
              <span><Box size={12} />{counts.prop} 道具</span>
            </div>
          </div>

          <div className="linghuiProductionAssetActions">
            <button type="button" onClick={onRefreshAssets} disabled={shotCount === 0}>
              <RefreshCw size={13} />
              从分镜重新提取
            </button>
            {(['character', 'scene', 'prop'] as const).map(kind => {
              const meta = KIND_META[kind];
              return (
                <button key={kind} type="button" onClick={() => addAsset(kind)}>
                  <Plus size={13} />
                  添加{meta.label}
                </button>
              );
            })}
            <span className="linghuiProductionAssetSpacer" />
            <button
              type="button"
              onClick={() => onAssetsChange(assets.map(asset => (
                resolveLinghuiProductionAssetStatus(asset) === 'locked'
                  ? asset
                  : { ...asset, confirmed: true, status: 'approved' }
              )))}
              disabled={assets.length === 0 || confirmedAssets.length === assets.length}
            >
              <Check size={13} />
              确认全部
            </button>
            <button
              type="button"
              className="isPrimary"
              disabled={confirmedAssets.length === 0}
              onClick={() => onGenerateAssets(confirmedAssets)}
            >
              <ImageIcon size={13} />
              生成 {confirmedAssets.length || ''} 个资产参考图
            </button>
          </div>

          <div className={`linghuiProductionAssetSync is-${syncStatus}`}>
            {syncStatus === 'syncing' ? (
              <><LoaderCircle size={12} className="linghuiProductionAssetSyncSpinner" />项目资产同步中</>
            ) : syncStatus === 'synced' ? (
              <><CloudCheck size={12} />已确认资产已同步到项目资产库</>
            ) : syncStatus === 'error' ? (
              <button type="button" onClick={onRetrySync} title={syncError || '项目资产同步失败'}>
                <CloudOff size={12} />
                同步失败，点击重试
              </button>
            ) : (
              <span>确认后的资产会自动同步到项目资产库</span>
            )}
          </div>

          {assets.length === 0 ? (
            <div className="linghuiProductionAssetEmpty">
              {shotCount === 0
                ? '先完成剧本生成或导入结构化镜头，再在这里集中管理资产。'
                : '当前镜头没有识别到实体。可以重新提取，或手动添加角色、场景和道具。'}
            </div>
          ) : (
            <div className="linghuiProductionAssetGrid">
              {assets.map(asset => {
                const meta = KIND_META[asset.kind];
                const Icon = meta.Icon;
                const status = resolveLinghuiProductionAssetStatus(asset);
                const isLocked = status === 'locked';
                const isConfirmed = status !== 'draft';
                const statusLabel = status === 'locked' ? '已锁定' : status === 'approved' ? '已批准' : '草稿';
                const affectedShots = resolveLinghuiProductionAssetAffectedShots(asset, shots);
                const isDeletePending = pendingDeleteAssetId === asset.id;
                const referenceVersions = listLinghuiProductionAssetReferenceVersions(asset);
                const currentReferenceVersion = resolveLinghuiProductionAssetCurrentReferenceVersion(asset);
                const currentReferenceVersionIndex = currentReferenceVersion
                  ? referenceVersions.findIndex(version => version.id === currentReferenceVersion.id)
                  : -1;
                const currentReferencePreview = currentReferenceVersion
                  ? toFileSystemDisplayUrl(currentReferenceVersion.source) ?? currentReferenceVersion.source
                  : '';
                return (
                  <div
                    key={asset.id}
                    ref={element => {
                      if (element) assetCardRefs.current.set(asset.id, element);
                      else assetCardRefs.current.delete(asset.id);
                    }}
                    className={`linghuiProductionAssetCard ${status !== 'draft' ? 'isConfirmed' : ''} is-${status} ${focusedAssetId === asset.id ? 'isFocused' : ''}`}
                    data-production-asset-id={asset.id}
                  >
                    <div className="linghuiProductionAssetCardHeader">
                      <span className={`linghuiProductionAssetKind is-${asset.kind}`}>
                        <Icon size={12} />
                        {meta.label}
                      </span>
                      {isLocked ? (
                        <span className="linghuiProductionAssetStatus isLocked" title="锁定资产需要先解锁才能编辑">
                          <LockKeyhole size={12} />
                          {statusLabel}
                        </span>
                      ) : (
                        <button
                          type="button"
                          className={`linghuiProductionAssetConfirm ${isConfirmed ? 'isActive' : ''}`}
                          onClick={() => updateAsset(asset.id, {
                            confirmed: !isConfirmed,
                            status: isConfirmed ? 'draft' : 'approved',
                          })}
                          aria-label={`${isConfirmed ? '取消确认' : '确认'}资产 ${asset.name}`}
                        >
                          <Check size={12} />
                          {isConfirmed ? statusLabel : '待确认'}
                        </button>
                      )}
                      {isLocked ? (
                        <button
                          type="button"
                          className="linghuiProductionAssetUnlock"
                          onClick={() => unlockAsset(asset.id)}
                          aria-label={`解锁资产 ${asset.name}`}
                          title="解锁编辑"
                        >
                          <Unlock size={12} />
                        </button>
                      ) : status === 'approved' ? (
                        <button
                          type="button"
                          className="linghuiProductionAssetLock"
                          onClick={() => updateAsset(asset.id, { confirmed: true, status: 'locked' })}
                          aria-label={`锁定资产 ${asset.name}`}
                          title="锁定资产，防止重新提取或误编辑"
                        >
                          <LockKeyhole size={12} />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="linghuiProductionAssetDelete"
                        onClick={() => {
                          if (affectedShots.length > 0) {
                            setPendingDeleteAssetId(asset.id);
                            return;
                          }
                          deleteAsset(asset.id);
                        }}
                        disabled={!canDeleteLinghuiProductionAsset(asset)}
                        aria-label={`删除资产 ${asset.name}`}
                        title={isLocked ? '已锁定资产，请先解锁' : '删除资产'}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <input
                      value={asset.name}
                      onChange={event => updateAsset(asset.id, { name: event.target.value })}
                      disabled={isLocked}
                      aria-label={`${meta.label}名称`}
                    />
                    <textarea
                      value={asset.description}
                      onChange={event => updateAsset(asset.id, { description: event.target.value })}
                      disabled={isLocked}
                      placeholder={`补充${meta.label}外观、空间或用途，供后续镜头保持一致`}
                      aria-label={`${asset.name}描述`}
                    />
                    <div className="linghuiProductionAssetCardMeta">
                      {asset.referenceImage
                        ? `参考图 · 当前 V${Math.max(1, currentReferenceVersionIndex + 1)} / ${referenceVersions.length || 1}`
                        : `${affectedShots.length || asset.sourceShotIds.length} 个关联镜头`}
                      {isLocked ? ' · 已锁定，重新提取不会覆盖' : ''}
                    </div>
                    {currentReferenceVersion ? (
                      <div className="linghuiProductionAssetVersions" aria-label={`参考图版本 ${asset.name}`}>
                        <div className="linghuiProductionAssetVersionCurrent">
                          <img src={currentReferencePreview} alt={`${asset.name} 当前参考图`} draggable={false} />
                          <span>
                            <strong>当前版本 V{currentReferenceVersionIndex + 1}</strong>
                            <small>{referenceVersions.length} 个候选 · {currentReferenceVersion.label || '参考图'}</small>
                          </span>
                          {currentReferenceVersionIndex > 0 ? (
                            <button
                              type="button"
                              onClick={() => onAssetsChange(rollbackLinghuiProductionAssetReferenceVersion(assets, asset.id))}
                              disabled={isLocked}
                              aria-label={`回退参考图 ${asset.name}`}
                              title={isLocked ? '已锁定资产，请先解锁' : '回退到上一个参考图版本'}
                            >
                              <Undo2 size={11} />
                              回退
                            </button>
                          ) : null}
                        </div>
                        {referenceVersions.length > 1 ? (
                          <div className="linghuiProductionAssetVersionList">
                            {referenceVersions.map((version, versionIndex) => {
                              const isCurrentVersion = version.id === currentReferenceVersion.id;
                              const preview = toFileSystemDisplayUrl(version.source) ?? version.source;
                              return (
                                <button
                                  type="button"
                                  key={version.id}
                                  className={isCurrentVersion ? 'isCurrent' : undefined}
                                  onClick={() => onAssetsChange(selectLinghuiProductionAssetReferenceVersion(assets, asset.id, version.id))}
                                  disabled={isLocked || isCurrentVersion}
                                  aria-label={`${isCurrentVersion ? '当前参考图版本' : '采用参考图版本'} ${asset.name} V${versionIndex + 1}`}
                                  title={version.label || `参考图版本 V${versionIndex + 1}`}
                                >
                                  <img src={preview} alt="" draggable={false} />
                                  <span>V{versionIndex + 1}{isCurrentVersion ? ' 当前' : ''}</span>
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {affectedShots.length > 0 ? (
                      <div className="linghuiProductionAssetImpactSummary" title={formatAffectedShots(affectedShots)}>
                        用于 {formatAffectedShots(affectedShots)}
                        {affectedShots.length > 4 ? ` 等 ${affectedShots.length} 个镜头` : ''}
                      </div>
                    ) : null}
                    {isDeletePending ? (
                      <div className="linghuiProductionAssetDeleteImpact" role="alert">
                        <strong>删除会影响 {affectedShots.length} 个镜头</strong>
                        <span>{formatAffectedShots(affectedShots)}</span>
                        <div>
                          <button type="button" onClick={() => setPendingDeleteAssetId(null)}>取消</button>
                          <button type="button" className="isDanger" onClick={() => deleteAsset(asset.id)}>仍然删除</button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};
