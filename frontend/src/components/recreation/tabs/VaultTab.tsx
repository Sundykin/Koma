/**
 * VaultTab — 物料版本树（R4 二创独立版本）
 *
 * 物料 = recreation_videos 的派生版本（修改单执行后产物）
 * 数据源：electronAPI.recreationVideos.listDerived(activeVideoId)
 *
 * 同时订阅 tasks:updated 广播：cart 提交后 task 进入 running，
 * 完成时 fulfiller 写入派生行，前端 task watcher 收到 completed 后 reload 列表。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Card, Empty, Tag, Button, Spin, message } from 'antd';
import { FolderOpen, Download, Trash2 } from 'lucide-react';

import { useRecreationStore, type RecreationVideo } from '../recreationStore';
import { MODIFICATION_LABEL } from '../mockData';
import { toKomaLocalUrl } from '../../../utils/urlUtils';
import { subscribeTaskUpdates, type TaskRecord } from '../../../services/tasksIPC';
import type { ModificationKind } from '../types';

function getApi(): any { return (window as any).electronAPI?.recreationVideos; }
function getShellApi(): any { return (window as any).electronAPI?.shell; }

function formatBytes(b: number | null): string {
  if (!b || b <= 0) return '-';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return '-';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const VaultTab: React.FC = () => {
  const activeVideoId = useRecreationStore((s) => s.activeVideoId);
  const setTab = useRecreationStore((s) => s.setTab);
  const [rows, setRows] = useState<RecreationVideo[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!activeVideoId) {
      setRows([]);
      return;
    }
    const api = getApi();
    if (!api?.listDerived) return;
    setLoading(true);
    try {
      const list = await api.listDerived(activeVideoId);
      setRows(Array.isArray(list) ? list : []);
    } catch (err) {
      message.error(`加载物料失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [activeVideoId]);

  useEffect(() => { void reload(); }, [reload]);

  // 订阅 task 完成事件：recreation-modify 完成时刷新列表
  useEffect(() => {
    if (!activeVideoId) return;
    const unsub = subscribeTaskUpdates((t: TaskRecord) => {
      if (t.type !== 'recreation-modify') return;
      if (t.scope !== `recreation:${activeVideoId}`) return;
      if (t.status === 'completed') void reload();
    });
    return () => { unsub?.(); };
  }, [activeVideoId, reload]);

  if (!activeVideoId) {
    return (
      <Empty
        description={
          <div>
            <div style={{ fontSize: 14, marginBottom: 4 }}>请先选择视频</div>
            <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
              到「视频库」Tab 选择一个视频查看派生物料
            </div>
          </div>
        }
      >
        <Button type="primary" onClick={() => setTab('overview')}>返回视频库</Button>
      </Empty>
    );
  }

  if (loading && rows.length === 0) {
    return <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>;
  }

  if (rows.length === 0) {
    return (
      <Empty
        description={
          <div>
            <div style={{ fontSize: 14, marginBottom: 4 }}>暂无派生物料</div>
            <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
              到「诊断报告」加入修改项，回到「修改单」点提交执行后会在这里出现
            </div>
          </div>
        }
      >
        <Button onClick={() => setTab('report')}>去添加修改项</Button>
      </Empty>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)' }}>
          共 <strong>{rows.length}</strong> 个派生物料
        </div>
        <Button size="small" onClick={reload} loading={loading}>刷新</Button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
        {rows.map((row) => (
          <Card key={row.id} size="small" styles={{ body: { padding: 0 } }}>
            <div
              style={{
                width: '100%',
                aspectRatio: '16 / 9',
                background: '#000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              <video
                src={toKomaLocalUrl(row.filePath)}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                controls
                preload="metadata"
              />
            </div>
            <div style={{ padding: 12 }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                {row.derivedKind && (
                  <Tag color="blue">
                    {MODIFICATION_LABEL[row.derivedKind as ModificationKind] ?? row.derivedKind}
                  </Tag>
                )}
                {row.width && row.height && (
                  <Tag>{row.width}×{row.height}</Tag>
                )}
              </div>
              <div style={{ fontSize: 13, marginBottom: 4, wordBreak: 'break-all' }}>
                {row.filename}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)' }}>
                {formatDuration(row.durationMs)} · {formatBytes(row.sizeBytes)} · {new Date(row.createdAt).toLocaleString()}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                <Button
                  size="small"
                  icon={<FolderOpen size={12} />}
                  onClick={() => {
                    const shell = getShellApi();
                    if (shell?.showItemInFolder) shell.showItemInFolder(row.filePath);
                    else message.warning('当前平台不支持打开所在目录');
                  }}
                >
                  打开目录
                </Button>
                <Button
                  size="small"
                  icon={<Download size={12} />}
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = toKomaLocalUrl(row.filePath);
                    a.download = row.filename;
                    a.click();
                  }}
                >
                  下载
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
