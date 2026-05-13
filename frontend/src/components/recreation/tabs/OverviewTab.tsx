/**
 * OverviewTab — 视频库（拖入 + 历史卡片）
 *
 * 拖拽 / 点选视频文件 → 主进程 importVideo → ffprobe 元数据 → SQLite 落库
 * → 卡片显示，可触发 AI 解析或查看诊断报告
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Card, Empty, Tag, Button, Spin, Popconfirm, message, Tooltip } from 'antd';
import { UploadCloud, FileVideo, Play, FileBarChart, Trash2, Clock } from 'lucide-react';

import { useRecreationStore, type RecreationVideo } from '../recreationStore';
import { submitVideoDiagnosisTask } from '../../../services/videoDiagnosisClient';
import { openFileDialog } from '../../../services/electronService';
import { loadRecreationAiConfig } from '../aiConfigStore';

function getApi(): any {
  return (window as any).electronAPI?.recreationVideos;
}
function getWebUtils(): any {
  // webUtils 在 electronAPI 命名空间下（不是 electron）
  return (window as any).electronAPI?.webUtils;
}

function formatBytes(n: number | null): string {
  if (!n) return '?';
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
function formatDuration(ms: number | null): string {
  if (!ms) return '?';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}m ${sec.toString().padStart(2, '0')}s`;
}
function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}

const STATUS_TAG: Record<RecreationVideo['diagnosisStatus'], { color: string; label: string }> = {
  none:      { color: 'default',    label: '未解析' },
  running:   { color: 'processing', label: '解析中' },
  completed: { color: 'success',    label: '已解析' },
  failed:    { color: 'error',      label: '解析失败' },
};

const VideoCard: React.FC<{
  video: RecreationVideo;
  busy: boolean;
  onOpenReport: () => void;
  onRunDiagnosis: () => void;
  onDelete: () => void;
}> = ({ video, busy, onOpenReport, onRunDiagnosis, onDelete }) => {
  const st = STATUS_TAG[video.diagnosisStatus];
  return (
    <Card hoverable styles={{ body: { padding: 14 } }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div
          style={{
            width: 76, height: 52, borderRadius: 6, flexShrink: 0,
            background: 'linear-gradient(135deg, #6a83ff 0%, #b14fff 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <FileVideo size={22} color="#fff" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Tooltip title={video.filename}>
            <div
              style={{
                fontSize: 14, fontWeight: 600, marginBottom: 4,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {video.filename}
            </div>
          </Tooltip>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.55)', marginBottom: 6 }}>
            {formatDuration(video.durationMs)} · {video.width && video.height ? `${video.width}×${video.height}` : '?'} ·{' '}
            {formatBytes(video.sizeBytes)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Tag color={st.color as never}>{st.label}</Tag>
            <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Clock size={11} /> {formatTime(video.createdAt)}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {video.diagnosisStatus === 'completed' && (
              <Button size="small" type="primary" icon={<FileBarChart size={14} />} onClick={onOpenReport}>
                查看报告
              </Button>
            )}
            <Button
              size="small"
              icon={<Play size={14} />}
              onClick={onRunDiagnosis}
              loading={busy}
            >
              {video.diagnosisStatus === 'completed' ? '重新解析'
                : video.diagnosisStatus === 'running' ? '重置并重试'
                : video.diagnosisStatus === 'failed' ? '重试'
                : 'AI 解析'}
            </Button>
            <Popconfirm title="删除此视频及相关数据？" onConfirm={onDelete} okText="删除" cancelText="取消">
              <Button size="small" type="text" danger icon={<Trash2 size={14} />} />
            </Popconfirm>
          </div>
        </div>
      </div>
    </Card>
  );
};

export const OverviewTab: React.FC = () => {
  const openReport = useRecreationStore((s) => s.openReport);
  const setTab = useRecreationStore((s) => s.setTab);

  const [videos, setVideos] = useState<RecreationVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [busyImport, setBusyImport] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    const api = getApi();
    if (!api) return;
    setLoading(true);
    try {
      const list = await api.list();
      setVideos(Array.isArray(list) ? list : []);
    } catch (err) {
      message.error(`加载视频列表失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 订阅 tasks:updated：video-diagnosis 完成/失败时刷新
  useEffect(() => {
    const api = (window as any).electronAPI?.tasks;
    if (!api?.onUpdated) return;
    const off = api.onUpdated((_e: unknown, env: { record?: any }) => {
      const rec = env?.record;
      if (!rec) return;
      if (rec.type !== 'video-diagnosis') return;
      if (['completed', 'failed', 'cancelled'].includes(rec.status)) {
        refresh();
      }
    });
    return () => off?.();
  }, [refresh]);

  const importByPath = async (srcPath: string, filename?: string): Promise<void> => {
    const api = getApi();
    if (!api) return;
    setBusyImport(true);
    try {
      const v = await api.import(srcPath, filename);
      message.success(`已导入：${v?.filename ?? filename ?? '视频'}`);
      await refresh();
    } catch (err) {
      message.error(`导入失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusyImport(false);
    }
  };

  const onDrop = async (e: React.DragEvent): Promise<void> => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    const webUtils = getWebUtils();
    if (!webUtils?.getPathForFile) {
      message.error('preload 未挂载 webUtils，无法识别拖拽路径；请点击选择');
      return;
    }
    const failed: string[] = [];
    for (const file of files) {
      const path = webUtils.getPathForFile(file);
      if (!path) {
        failed.push(file.name);
        continue;
      }
      await importByPath(path, file.name);
    }
    if (failed.length > 0) {
      message.warning(
        `${failed.length === 1 ? '无法识别' : `${failed.length} 个文件无法识别`}：` +
        `${failed[0]}${failed.length > 1 ? ' 等' : ''}。` +
        '部分来源（如某些云盘 / Finder Quick Look）不暴露真实路径，请改用「点击选择」。',
        5,
      );
    }
  };

  const onPick = async (): Promise<void> => {
    const result = await openFileDialog({
      title: '选择视频文件',
      filters: [{ name: '视频', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi'] }],
      properties: ['openFile'],
    });
    if (!result || result.canceled || !result.filePaths?.length) return;
    for (const p of result.filePaths) {
      await importByPath(p);
    }
  };

  const onRunDiagnosis = async (v: RecreationVideo): Promise<void> => {
    const aiConfig = await loadRecreationAiConfig();
    if (!aiConfig.channelKey) {
      message.warning('请先点右上角「AI 能力配置」选择一个 LLM channel');
      return;
    }
    setBusy((prev) => ({ ...prev, [v.id]: true }));
    try {
      // 如果视频卡在 running（上一次任务异常结束未回滚），先重置状态
      // 否则按钮 disable 永远走不出来
      const api = getApi();
      if (v.diagnosisStatus === 'running' && api?.setDiagnosisStatus) {
        await api.setDiagnosisStatus(v.id, 'none').catch(() => undefined);
      }
      const { deduped } = await submitVideoDiagnosisTask({
        videoId: v.id,
        videoLabel: v.filename,
        channelKey: aiConfig.channelKey,
        models: aiConfig.models,
      });
      if (deduped) {
        message.info('该视频已有运行中的解析任务');
      } else {
        message.success('已提交解析任务');
      }
      setTab('queue');
    } catch (err) {
      message.error(`提交失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy((prev) => ({ ...prev, [v.id]: false }));
    }
  };

  const onDelete = async (v: RecreationVideo): Promise<void> => {
    const api = getApi();
    if (!api) return;
    try {
      await api.delete(v.id);
      message.success('已删除');
      await refresh();
    } catch (err) {
      message.error(`删除失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div style={{ padding: '8px 0' }}>
      {/* 上传区 */}
      <div
        onClick={busyImport ? undefined : onPick}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        style={{
          border: `2px dashed ${dragOver ? '#4d6fff' : '#d6d6e0'}`,
          borderRadius: 12,
          padding: '36px 24px',
          textAlign: 'center',
          cursor: busyImport ? 'wait' : 'pointer',
          background: dragOver ? 'rgba(77, 111, 255, 0.06)' : 'rgba(248, 249, 252, 0.6)',
          transition: 'all 0.18s',
          marginBottom: 24,
          opacity: busyImport ? 0.7 : 1,
        }}
      >
        {busyImport ? <Spin /> : <UploadCloud size={42} color={dragOver ? '#4d6fff' : '#999'} style={{ marginBottom: 12 }} />}
        <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4, marginTop: busyImport ? 12 : 0 }}>
          {busyImport ? '正在导入…' : '拖拽视频文件到此处，或点击选择'}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
          支持 mp4 / mov / mkv / webm / avi；本地复制 + ffprobe 提取元数据
        </div>
      </div>

      {/* 历史视频 */}
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'rgba(0,0,0,0.75)' }}>
        视频库（{videos.length}）
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
      ) : videos.length === 0 ? (
        <Empty description="还没有导入视频" />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
            gap: 14,
          }}
        >
          {videos.map((v) => (
            <VideoCard
              key={v.id}
              video={v}
              busy={!!busy[v.id]}
              onOpenReport={() => openReport(v.id)}
              onRunDiagnosis={() => onRunDiagnosis(v)}
              onDelete={() => onDelete(v)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
