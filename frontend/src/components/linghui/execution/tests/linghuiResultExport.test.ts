import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LinghuiNodeRunState, LinghuiRFNodeSnapshot } from '../../../../types/linghui';
import {
  createMemoryFileSystemPort,
  resetDefaultFileSystemPort,
  setDefaultFileSystemPort,
} from '../../../../services/fileSystemPort';
import { exportLinghuiNodeResults } from '../state/linghuiResultExport';

function createNode(params: {
  id: string;
  label: string;
  linghuiType: LinghuiRFNodeSnapshot['data']['linghuiType'];
  properties?: Record<string, unknown>;
}): LinghuiRFNodeSnapshot {
  return {
    id: params.id,
    type: `node-${params.id}`,
    position: { x: 0, y: 0 },
    data: {
      linghuiType: params.linghuiType,
      label: params.label,
      accent: '#000000',
      background: '#ffffff',
      properties: params.properties ?? {},
      inputs: [],
      outputs: [],
      active: false,
    },
  };
}

describe('exportLinghuiNodeResults', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetDefaultFileSystemPort();
  });

  it('throws a clear error when the active port cannot pick a directory', async () => {
    setDefaultFileSystemPort(createMemoryFileSystemPort());

    await expect(exportLinghuiNodeResults({
      workspaceName: 'Demo',
      targets: [],
    })).rejects.toThrow('当前文件系统实现不支持结果导出');
  });

  it('exports image and text results through the active file system port', async () => {
    const port = createMemoryFileSystemPort({
      files: {
        '/fixtures/cat.png': Uint8Array.from([137, 80, 78, 71]),
      },
      pickDirectory: '/exports',
      capabilities: {
        directoryPicker: true,
        nativeLocalPaths: true,
      },
    });
    setDefaultFileSystemPort(port);
    vi.spyOn(Date, 'now').mockReturnValue(new Date(2026, 3, 3, 18, 20, 30).getTime());

    const imageNode = createNode({
      id: 'image-node',
      label: '结果图',
      linghuiType: 'linghui/image',
    });
    const textNode = createNode({
      id: 'text-node',
      label: '说明',
      linghuiType: 'linghui/text',
      properties: {
        content: 'fallback text',
      },
    });

    const imageRunState: LinghuiNodeRunState = {
      status: 'succeeded',
      result: {
        kind: 'image',
        primary: {
          kind: 'image',
          source: 'koma-local://files/fixtures/cat.png',
          label: '主图',
        },
      },
    };
    const textRunState: LinghuiNodeRunState = {
      status: 'succeeded',
      result: {
        kind: 'text',
        text: '导出说明',
      },
    };

    const summary = await exportLinghuiNodeResults({
      workspaceName: 'Demo Workspace',
      targets: [
        { node: imageNode, runState: imageRunState },
        { node: textNode, runState: textRunState },
      ],
    });

    expect(summary).toEqual({
      bundleDir: '/exports/Demo-Workspace-results-20260403-182030',
      fileCount: 3,
      nodeCount: 2,
      skippedNodeIds: [],
    });

    const snapshot = port.snapshot();
    const decoder = new TextDecoder();
    const manifestPath = '/exports/Demo-Workspace-results-20260403-182030/manifest.json';
    const imagePath = '/exports/Demo-Workspace-results-20260403-182030/01-结果图/result.png';
    const textPath = '/exports/Demo-Workspace-results-20260403-182030/02-说明/content.txt';

    expect(Array.from(snapshot.files[imagePath])).toEqual([137, 80, 78, 71]);
    expect(decoder.decode(snapshot.files[textPath])).toBe('导出说明');

    const manifest = JSON.parse(decoder.decode(snapshot.files[manifestPath])) as {
      exportedNodeCount: number;
      requestedNodeCount: number;
      nodes: Array<{ nodeId: string; exported: boolean; files: Array<{ path: string }> }>;
    };
    expect(manifest.exportedNodeCount).toBe(2);
    expect(manifest.requestedNodeCount).toBe(2);
    expect(manifest.nodes).toEqual([
      expect.objectContaining({
        nodeId: 'image-node',
        exported: true,
        files: [expect.objectContaining({ path: '01-结果图/result.png' })],
      }),
      expect.objectContaining({
        nodeId: 'text-node',
        exported: true,
        files: [expect.objectContaining({ path: '02-说明/content.txt' })],
      }),
    ]);
  });
});
