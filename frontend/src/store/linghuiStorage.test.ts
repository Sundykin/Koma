import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createLinghuiWorkspace,
  createLinghuiWorkspaceHistoryRecord,
  createLinghuiWorkflowTemplate,
  deleteLinghuiWorkspace,
  listLinghuiWorkflowTemplates,
  listLinghuiWorkspaces,
  loadLinghuiWorkspace,
} from './linghuiStorage';
import { DEFAULT_LINGHUI_WORKSPACE_NAME } from '../types/linghui';

const { linghuiApiMock, saveFileMock } = vi.hoisted(() => ({
  linghuiApiMock: {
    listWorkspaces: vi.fn(),
    loadWorkspace: vi.fn(),
    saveWorkspace: vi.fn(),
    createWorkspace: vi.fn(),
    saveWorkspaceAs: vi.fn(),
    deleteWorkspace: vi.fn(),
    importWorkspace: vi.fn(),
    exportWorkspace: vi.fn(),
    getWorkspaceDir: vi.fn(),
    listWorkflowTemplates: vi.fn(),
    createWorkflowTemplate: vi.fn(),
    listWorkspaceAssets: vi.fn(),
    createWorkspaceAsset: vi.fn(),
    listWorkspaceHistoryRecords: vi.fn(),
    createWorkspaceHistoryRecord: vi.fn(),
    importWorkspaceAsset: vi.fn(),
  },
  saveFileMock: vi.fn(),
}));

vi.mock('../services/electronService', () => ({
  electronService: {
    isElectron: () => true,
    linghui: linghuiApiMock,
    dialog: {
      saveFile: saveFileMock,
    },
  },
}));

describe('linghuiStorage', () => {
  beforeEach(() => {
    Object.values(linghuiApiMock).forEach(mock => mock.mockReset());
    saveFileMock.mockReset();
  });

  it('通过后端创建工作区并返回规范化名称', async () => {
    linghuiApiMock.createWorkspace.mockResolvedValueOnce({
      id: 'workspace-1',
      name: DEFAULT_LINGHUI_WORKSPACE_NAME,
      description: '',
      createdAt: 1,
      updatedAt: 1,
      lastOpenedAt: 1,
      viewport: { x: 0, y: 0, zoom: 1 },
      graphData: { version: 2, nodes: [], edges: [], groups: [] },
      nodeRuns: {},
      executionLogs: [],
      nodeCount: 0,
      linkCount: 0,
      groupCount: 0,
    });

    const workspace = await createLinghuiWorkspace('   ');

    expect(linghuiApiMock.createWorkspace).toHaveBeenCalledWith('   ');
    expect(workspace.name).toBe(DEFAULT_LINGHUI_WORKSPACE_NAME);
  });

  it('工作区列表与详情都通过后端读取', async () => {
    linghuiApiMock.listWorkspaces.mockResolvedValueOnce([
      {
        id: 'workspace-1',
        name: '镜头工作区',
        createdAt: 1,
        updatedAt: 2,
        lastOpenedAt: 3,
        nodeCount: 2,
        linkCount: 1,
        groupCount: 0,
      },
    ]);
    linghuiApiMock.loadWorkspace.mockResolvedValueOnce({
      id: 'workspace-1',
      name: '镜头工作区',
      description: '',
      createdAt: 1,
      updatedAt: 2,
      lastOpenedAt: 3,
      viewport: { x: 0, y: 0, zoom: 1 },
      graphData: { version: 2, nodes: [], edges: [], groups: [] },
      nodeRuns: {},
      executionLogs: [],
      nodeCount: 2,
      linkCount: 1,
      groupCount: 0,
    });

    const list = await listLinghuiWorkspaces();
    const detail = await loadLinghuiWorkspace('workspace-1');

    expect(list).toHaveLength(1);
    expect(detail?.id).toBe('workspace-1');
    expect(linghuiApiMock.listWorkspaces).toHaveBeenCalledTimes(1);
    expect(linghuiApiMock.loadWorkspace).toHaveBeenCalledWith('workspace-1');
  });

  it('会合并系统 Recipe 模板与后端工作区模板', async () => {
    linghuiApiMock.listWorkflowTemplates.mockResolvedValueOnce([
      {
        id: 'workspace-template-1',
        workspaceId: 'workspace-1',
        name: '我的自定义流程',
        source: 'workspace',
        kind: 'saved-workflow',
        createdAt: 10,
        updatedAt: 20,
        nodeCount: 1,
        linkCount: 0,
        groupCount: 0,
        sampleNodeLabels: ['图片节点'],
        snapshotPath: '/tmp/workflow.json',
        snapshot: {
          nodes: [],
          edges: [],
          groups: [],
        },
      },
    ]);

    const templates = await listLinghuiWorkflowTemplates('workspace-1');
    const builtinTemplates = templates.filter(template => template.source === 'system');
    const workspaceTemplate = templates.find(template => template.id === 'workspace-template-1');

    expect(linghuiApiMock.listWorkflowTemplates).toHaveBeenCalledWith('workspace-1');
    expect(builtinTemplates.map(template => template.recipeKey)).toEqual([
      'character-design-flow',
      'storyboard-creation-flow',
      'voiceover-workflow',
    ]);
    expect(workspaceTemplate).toEqual(expect.objectContaining({
      source: 'workspace',
      kind: 'saved-workflow',
      workspaceId: 'workspace-1',
    }));
  });

  it('创建工作流模板时直接委托后端存储', async () => {
    linghuiApiMock.createWorkflowTemplate.mockResolvedValueOnce({
      id: 'wf-1',
      workspaceId: 'workspace-1',
      name: '三镜头流程',
      source: 'workspace',
      kind: 'saved-workflow',
      createdAt: 10,
      updatedAt: 10,
      nodeCount: 0,
      linkCount: 0,
      groupCount: 0,
      sampleNodeLabels: [],
      snapshotPath: '/tmp/wf.json',
      snapshot: {
        nodes: [],
        edges: [],
        groups: [],
      },
    });

    const template = await createLinghuiWorkflowTemplate({
      workspaceId: 'workspace-1',
      name: '三镜头流程',
      snapshot: { nodes: [], edges: [], groups: [] },
    });

    expect(template.name).toBe('三镜头流程');
    expect(linghuiApiMock.createWorkflowTemplate).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      name: '三镜头流程',
      snapshot: { nodes: [], edges: [], groups: [] },
    });
  });

  it('创建历史结果时保留后端物化后的 run 数据', async () => {
    linghuiApiMock.createWorkspaceHistoryRecord.mockResolvedValueOnce({
      record: {
        id: 'history-1',
        workspaceId: 'workspace-1',
        nodeId: 'video-node-1',
        nodeType: 'linghui/video',
        kind: 'video',
        name: '视频',
        createdAt: 1774838708788,
        source: '/tmp/video.mp4',
        previewSource: '/tmp/poster.png',
        posterSource: '/tmp/poster.png',
        snapshotPath: '/tmp/history.json',
      },
      materializedRun: {
        status: 'succeeded',
        updatedAt: 1774838708788,
        result: {
          kind: 'video',
          primary: {
            kind: 'video',
            source: '/tmp/video.mp4',
            posterSource: '/tmp/poster.png',
          },
        },
      },
    });

    const result = await createLinghuiWorkspaceHistoryRecord({
      workspaceId: 'workspace-1',
      nodeId: 'video-node-1',
      nodeData: {
        linghuiType: 'linghui/video',
        label: '视频',
        accent: '#22c55e',
        background: '#0f1720',
        properties: { prompt: '猫咪懒洋洋地起床' },
        inputs: [],
        outputs: [],
        active: false,
      },
      nodeRun: {
        status: 'succeeded',
        updatedAt: 1774838708788,
        result: {
          kind: 'video',
          primary: {
            kind: 'video',
            source: 'https://example.com/video.mp4',
            posterSource: 'https://example.com/poster.png',
          },
        },
      },
    });

    expect(result.record.source).toBe('/tmp/video.mp4');
    expect((result.materializedRun?.result as any)?.primary?.posterSource).toBe('/tmp/poster.png');
    expect(linghuiApiMock.createWorkspaceHistoryRecord).toHaveBeenCalledTimes(1);
  });

  it('删除工作区时通过后端删除', async () => {
    linghuiApiMock.deleteWorkspace.mockResolvedValueOnce({ success: true });

    await deleteLinghuiWorkspace('workspace-1');

    expect(linghuiApiMock.deleteWorkspace).toHaveBeenCalledWith('workspace-1');
  });
});
