import React, { useMemo } from 'react';
import { Button, Drawer, Empty, Segmented, Spin } from 'antd';
import type {
  LinghuiWorkflowTemplateRecord,
  LinghuiWorkspaceAssetRecord,
  LinghuiWorkspaceHistoryRecord,
} from '../../../../store/linghuiStorage';
import type { LinghuiNodeCatalogItem } from '../../../../types/linghui';
import { LINGHUI_WORKFLOW_BLOCK_LABEL } from '../../../../constants/linghuiWorkflowBlock';
import { LINGHUI_NODE_CATALOG } from '../state/linghuiNodeDefs';
import { resolveLinghuiRecipeTemplateLabel } from '../state/linghuiRecipeTemplates';
import { toFileSystemDisplayUrl } from '../../../../services/fileSystemPort';

export type LinghuiAssetFilter = 'all' | 'image' | 'video' | 'audio' | 'text';
export type LinghuiLibraryDrawerKey = 'workflow' | 'asset' | 'history' | 'tutorial';

const LINGHUI_TUTORIAL_SHORTCUTS = [
  ['双击空白', '快速创建节点'],
  ['右键画布', '打开工作流 / 资产 / 历史 / 教程入口'],
  ['Cmd/Ctrl + C / V', '复制、粘贴节点或工作流块'],
  ['Cmd/Ctrl + D', '为当前选中创建副本'],
  ['Delete / Backspace', '删除选中节点或工作流块'],
  ['Cmd/Ctrl + Z / Shift + Z', '撤销 / 重做'],
  ['鼠标模式', '滚轮平移，左键框选'],
  ['手模式', '拖动画布，滚轮缩放'],
];

const LINGHUI_TUTORIAL_GUIDES = [
  '图片、视频、音频文件可以直接拖进画布，系统会自动创建对应节点。',
  '框选节点后会出现“创建工作流块”，工作流块可双击标题改名，也可右键取消或保存为工作流。',
  '节点右键可以继续创建下游、运行当前节点，或把结果沉淀成资产。',
  '运行后的结果会进入历史抽屉，可以随时重新发送回画布继续创作。',
];

function toPreviewSource(source?: string): string {
  return toFileSystemDisplayUrl(source) || '';
}

function getDrawerTitle(activeDrawer: LinghuiLibraryDrawerKey | null): string {
  switch (activeDrawer) {
    case 'workflow':
      return '工作流模板';
    case 'asset':
      return '工作区资产';
    case 'history':
      return '历史结果';
    case 'tutorial':
      return '灵绘教程';
    default:
      return '';
  }
}

function getWorkflowTemplateSourceLabel(template: LinghuiWorkflowTemplateRecord): string {
  return template.source === 'system' ? '系统 Recipe' : '工作区模板';
}

function getWorkflowTemplateKindLabel(template: LinghuiWorkflowTemplateRecord): string | null {
  if (template.recipeKey) {
    return resolveLinghuiRecipeTemplateLabel(template.recipeKey);
  }
  return template.kind === 'saved-workflow' ? '已保存工作流' : null;
}

function buildWorkflowTemplateMeta(template: LinghuiWorkflowTemplateRecord): string[] {
  const items = [
    `${template.nodeCount} 节点`,
    `${template.linkCount} 连线`,
  ];

  if (template.groupCount > 0) {
    items.push(`${LINGHUI_WORKFLOW_BLOCK_LABEL} ${template.groupCount}`);
  }

  if (template.source === 'system') {
    items.push('内置配方');
  } else {
    items.push(new Date(template.updatedAt).toLocaleString());
  }

  return items;
}

interface LinghuiLibraryDrawerProps {
  activeDrawer: LinghuiLibraryDrawerKey | null;
  assetFilter: LinghuiAssetFilter;
  workflowLoading: boolean;
  assetLoading: boolean;
  historyLoading: boolean;
  workflowTemplates: LinghuiWorkflowTemplateRecord[];
  workspaceAssets: LinghuiWorkspaceAssetRecord[];
  workspaceHistory: LinghuiWorkspaceHistoryRecord[];
  nodeCatalog?: LinghuiNodeCatalogItem[];
  onClose: () => void;
  onAssetFilterChange: (filter: LinghuiAssetFilter) => void;
  onRefreshWorkflows: () => void;
  onSendWorkflowToCanvas: (template: LinghuiWorkflowTemplateRecord) => void;
  onRefreshAssets: () => void;
  onSendAssetToCanvas: (asset: LinghuiWorkspaceAssetRecord) => void;
  onRefreshHistory: () => void;
  onSendHistoryToCanvas: (record: LinghuiWorkspaceHistoryRecord) => void;
}

export function LinghuiLibraryDrawer({
  activeDrawer,
  assetFilter,
  workflowLoading,
  assetLoading,
  historyLoading,
  workflowTemplates,
  workspaceAssets,
  workspaceHistory,
  nodeCatalog = LINGHUI_NODE_CATALOG,
  onClose,
  onAssetFilterChange,
  onRefreshWorkflows,
  onSendWorkflowToCanvas,
  onRefreshAssets,
  onSendAssetToCanvas,
  onRefreshHistory,
  onSendHistoryToCanvas,
}: LinghuiLibraryDrawerProps) {
  const filteredAssets = useMemo(() => {
    if (assetFilter === 'all') return workspaceAssets;
    return workspaceAssets.filter(asset => asset.kind === assetFilter);
  }, [assetFilter, workspaceAssets]);

  const systemWorkflowTemplates = useMemo(() => (
    workflowTemplates.filter(template => template.source === 'system')
  ), [workflowTemplates]);

  const workspaceWorkflowTemplates = useMemo(() => (
    workflowTemplates.filter(template => template.source !== 'system')
  ), [workflowTemplates]);

  const renderWorkflowTemplateCard = (template: LinghuiWorkflowTemplateRecord) => {
    const kindLabel = getWorkflowTemplateKindLabel(template);
    const metaItems = buildWorkflowTemplateMeta(template);
    return (
      <div key={template.id} className="linghuiLibraryTemplateCard">
        <div className="linghuiLibraryCardBody">
          <div className="linghuiLibraryCardTitle">{template.name}</div>
          <div className="linghuiLibraryCardMeta">
            {metaItems.map(item => (
              <span key={`${template.id}-${item}`}>{item}</span>
            ))}
          </div>
          {(template.description || kindLabel) && (
            <div className="linghuiLibraryCardText">
              {template.description || kindLabel}
            </div>
          )}
          <div className="linghuiLibraryBadgeRow">
            <span className={`linghuiLibraryBadge ${template.source === 'system' ? 'isSystem' : 'isWorkspace'}`}>
              {getWorkflowTemplateSourceLabel(template)}
            </span>
            {kindLabel && (
              <span className="linghuiLibraryBadge">
                {kindLabel}
              </span>
            )}
          </div>
          {template.sampleNodeLabels.length > 0 && (
            <div className="linghuiLibraryTagRow">
              {template.sampleNodeLabels.map(label => (
                <span key={`${template.id}-${label}`} className="linghuiLibraryTag">{label}</span>
              ))}
            </div>
          )}
        </div>
        <Button type="primary" size="small" onClick={() => onSendWorkflowToCanvas(template)}>
          发送到画布
        </Button>
      </div>
    );
  };

  return (
    <Drawer
      title={getDrawerTitle(activeDrawer)}
      placement="right"
      size={420}
      open={activeDrawer !== null}
      onClose={onClose}
      className="linghuiLibraryDrawer"
      rootClassName="linghuiLibraryDrawer"
    >
      {activeDrawer === 'workflow' && (
        <div className="linghuiLibraryDrawerBody">
          <div className="linghuiLibrarySectionHeader">
            <div>
              <div className="linghuiLibrarySectionTitle">可复用工作流</div>
              <div className="linghuiLibrarySectionHint">来自工作流块右键“保存为工作流”的模板库。</div>
            </div>
            <Button size="small" onClick={onRefreshWorkflows}>
              刷新
            </Button>
          </div>

          {workflowLoading ? (
            <div className="linghuiLibraryDrawerLoading">
              <Spin size="large" />
            </div>
          ) : workflowTemplates.length === 0 ? (
            <div className="linghuiLibraryDrawerEmpty">
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有工作流模板，先在画布上保存一个工作流块吧" />
            </div>
          ) : (
            <div className="linghuiLibraryDrawerBody">
              {systemWorkflowTemplates.length > 0 && (
                <div className="linghuiLibrarySection">
                  <div className="linghuiLibrarySectionHeader">
                    <div>
                      <div className="linghuiLibrarySectionTitle">系统 Recipe</div>
                      <div className="linghuiLibrarySectionHint">内置工作流骨架，包含推荐的节点关系和参数预设。</div>
                    </div>
                  </div>
                  <div className="linghuiLibraryCardList">
                    {systemWorkflowTemplates.map(renderWorkflowTemplateCard)}
                  </div>
                </div>
              )}

              {workspaceWorkflowTemplates.length > 0 && (
                <div className="linghuiLibrarySection">
                  <div className="linghuiLibrarySectionHeader">
                    <div>
                      <div className="linghuiLibrarySectionTitle">工作区模板</div>
                      <div className="linghuiLibrarySectionHint">来自工作流块右键“保存为工作流”的模板库。</div>
                    </div>
                  </div>
                  <div className="linghuiLibraryCardList">
                    {workspaceWorkflowTemplates.map(renderWorkflowTemplateCard)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeDrawer === 'asset' && (
        <div className="linghuiLibraryDrawerBody">
          <div className="linghuiAssetDrawerToolbar">
            <Segmented<LinghuiAssetFilter>
              options={[
                { label: '全部', value: 'all' },
                { label: '图片', value: 'image' },
                { label: '视频', value: 'video' },
                { label: '音频', value: 'audio' },
                { label: '文本', value: 'text' },
              ]}
              value={assetFilter}
              onChange={value => onAssetFilterChange(value as LinghuiAssetFilter)}
            />
            <Button size="small" onClick={onRefreshAssets}>
              刷新
            </Button>
          </div>

          {assetLoading ? (
            <div className="linghuiLibraryDrawerLoading">
              <Spin size="large" />
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="linghuiLibraryDrawerEmpty">
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前工作区还没有这类资产" />
            </div>
          ) : (
            <div className="linghuiLibraryCardList">
              {filteredAssets.map(asset => {
                const previewSource = toPreviewSource(asset.previewSource || asset.posterSource || asset.source);
                return (
                  <div key={asset.id} className="linghuiAssetDrawerCard">
                    <div className={`linghuiAssetDrawerPreview ${previewSource ? 'hasPreview' : 'isTextual'}`}>
                      {previewSource && (asset.kind === 'image' || asset.kind === 'video') ? (
                        <img src={previewSource} alt={asset.name} />
                      ) : (
                        <div className="linghuiAssetDrawerPreviewFallback">
                          <span className="linghuiAssetDrawerPreviewKind">{asset.kind.toUpperCase()}</span>
                          <span className="linghuiAssetDrawerPreviewName">{asset.name}</span>
                        </div>
                      )}
                    </div>

                    <div className="linghuiAssetDrawerCardBody">
                      <div className="linghuiAssetDrawerCardTitle">{asset.name}</div>
                      <div className="linghuiAssetDrawerCardMeta">
                        <span>{asset.kind}</span>
                        <span>{new Date(asset.createdAt).toLocaleString()}</span>
                      </div>
                      {asset.text && (
                        <div className="linghuiAssetDrawerCardText">{asset.text}</div>
                      )}
                      <Button type="primary" size="small" onClick={() => onSendAssetToCanvas(asset)}>
                        发送到画布
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeDrawer === 'history' && (
        <div className="linghuiLibraryDrawerBody">
          <div className="linghuiLibrarySectionHeader">
            <div>
              <div className="linghuiLibrarySectionTitle">最近运行结果</div>
              <div className="linghuiLibrarySectionHint">执行成功后的产物会自动进入这里，可继续复用。</div>
            </div>
            <Button size="small" onClick={onRefreshHistory}>
              刷新
            </Button>
          </div>

          {historyLoading ? (
            <div className="linghuiLibraryDrawerLoading">
              <Spin size="large" />
            </div>
          ) : workspaceHistory.length === 0 ? (
            <div className="linghuiLibraryDrawerEmpty">
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有历史结果，先运行一些节点吧" />
            </div>
          ) : (
            <div className="linghuiLibraryCardList">
              {workspaceHistory.map(record => {
                const previewSource = toPreviewSource(record.previewSource || record.posterSource || record.source);
                return (
                  <div key={record.id} className="linghuiAssetDrawerCard">
                    <div className={`linghuiAssetDrawerPreview ${previewSource ? 'hasPreview' : 'isTextual'}`}>
                      {previewSource && (record.kind === 'image' || record.kind === 'video') ? (
                        <img src={previewSource} alt={record.name} />
                      ) : (
                        <div className="linghuiAssetDrawerPreviewFallback">
                          <span className="linghuiAssetDrawerPreviewKind">{record.kind.toUpperCase()}</span>
                          <span className="linghuiAssetDrawerPreviewName">{record.name}</span>
                        </div>
                      )}
                    </div>

                    <div className="linghuiAssetDrawerCardBody">
                      <div className="linghuiAssetDrawerCardTitle">{record.name}</div>
                      <div className="linghuiAssetDrawerCardMeta">
                        <span>{record.kind}</span>
                        <span>{record.nodeType.replace('linghui/', '')}</span>
                        <span>{new Date(record.createdAt).toLocaleString()}</span>
                      </div>
                      {record.text && (
                        <div className="linghuiAssetDrawerCardText">{record.text}</div>
                      )}
                      <Button type="primary" size="small" onClick={() => onSendHistoryToCanvas(record)}>
                        发送到画布
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeDrawer === 'tutorial' && (
        <div className="linghuiLibraryDrawerBody">
          <div className="linghuiLibrarySection">
            <div className="linghuiLibrarySectionHeader">
              <div>
                <div className="linghuiLibrarySectionTitle">画布操作手册</div>
                <div className="linghuiLibrarySectionHint">把高频操作都收在这，方便随时对照。</div>
              </div>
            </div>
            <div className="linghuiTutorialList">
              {LINGHUI_TUTORIAL_GUIDES.map(item => (
                <div key={item} className="linghuiTutorialItem">{item}</div>
              ))}
            </div>
          </div>

          <div className="linghuiLibrarySection">
            <div className="linghuiLibrarySectionHeader">
              <div>
                <div className="linghuiLibrarySectionTitle">快捷键</div>
                <div className="linghuiLibrarySectionHint">和画布交互最直接的一组快捷方式。</div>
              </div>
            </div>
            <div className="linghuiShortcutList">
              {LINGHUI_TUTORIAL_SHORTCUTS.map(([shortcut, description]) => (
                <div key={shortcut} className="linghuiShortcutItem">
                  <span className="linghuiShortcutKey">{shortcut}</span>
                  <span className="linghuiShortcutDesc">{description}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="linghuiLibrarySection">
            <div className="linghuiLibrarySectionHeader">
              <div>
                <div className="linghuiLibrarySectionTitle">节点类型</div>
                <div className="linghuiLibrarySectionHint">当前灵绘里可直接使用的核心节点。</div>
              </div>
            </div>
            <div className="linghuiLibraryTagRow">
              {nodeCatalog.map(item => (
                <span key={item.type} className="linghuiLibraryTag">{item.label}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}
