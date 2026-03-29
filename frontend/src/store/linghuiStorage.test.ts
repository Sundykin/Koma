import { beforeEach, describe, expect, it } from 'vitest';
import {
  createLinghuiWorkspace,
  deleteLinghuiWorkspace,
  listLinghuiWorkspaces,
  loadLinghuiWorkspace,
} from './linghuiStorage';
import { DEFAULT_LINGHUI_WORKSPACE_NAME } from '../types/linghui';

describe('linghuiStorage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete (window as typeof window & { electronAPI?: unknown }).electronAPI;
  });

  it('为空工作区名称回退到未命名灵绘', async () => {
    const workspace = await createLinghuiWorkspace('   ');

    expect(workspace.name).toBe(DEFAULT_LINGHUI_WORKSPACE_NAME);
  });

  it('删除工作区时会清理索引与关联的历史数据键', async () => {
    const workspace = await createLinghuiWorkspace('测试灵绘');

    window.localStorage.setItem(`koma.linghui.doc.workflow-index.${workspace.id}`, JSON.stringify([{ id: 'wf-1' }]));
    window.localStorage.setItem(`koma.linghui.doc.history-index.${workspace.id}`, JSON.stringify([{ id: 'history-1' }]));
    window.localStorage.setItem(`koma.linghui.doc.asset-index.${workspace.id}`, JSON.stringify([{ id: 'asset-1' }]));

    await deleteLinghuiWorkspace(workspace.id);

    expect(await listLinghuiWorkspaces()).toEqual([]);
    expect(await loadLinghuiWorkspace(workspace.id)).toBeNull();
    expect(window.localStorage.getItem(`koma.linghui.doc.workflow-index.${workspace.id}`)).toBeNull();
    expect(window.localStorage.getItem(`koma.linghui.doc.history-index.${workspace.id}`)).toBeNull();
    expect(window.localStorage.getItem(`koma.linghui.doc.asset-index.${workspace.id}`)).toBeNull();
  });
});
