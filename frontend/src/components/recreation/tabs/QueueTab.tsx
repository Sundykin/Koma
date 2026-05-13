/**
 * QueueTab — 任务队列（项目级）
 *
 * 从 tasksIPC 拉真实 TaskRecord，按 type 过滤二创相关任务：
 *   - video-diagnosis    AI 12 维度解析
 *   - recreation-modify  修改单执行
 *
 * 订阅 tasks:updated 事件实时更新；不再用 mock setInterval。
 */
import React, { useEffect, useState } from 'react';
import { Card, Progress, Tag, Button, Empty, Popconfirm, message, Tooltip } from 'antd';
import { Play, Pause, X, CheckCircle2, AlertCircle, RotateCw } from 'lucide-react';

import { listTaskRecords, type TaskRecord } from '../../../services/tasksIPC';

const TYPES = ['video-diagnosis', 'recreation-modify'] as const;

const TYPE_LABEL: Record<string, string> = {
  'video-diagnosis': 'AI 12 维度解析',
  'recreation-modify': '修改单执行',
};

const STATUS_COLOR: Record<string, 'default' | 'processing' | 'success' | 'error'> = {
  pending: 'default',
  queued: 'default',
  running: 'processing',
  processing: 'processing',
  completed: 'success',
  failed: 'error',
  cancelled: 'default',
};
const STATUS_LABEL: Record<string, string> = {
  pending: '排队中',
  queued: '排队中',
  running: '运行中',
  processing: '运行中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}

const JobCard: React.FC<{ task: TaskRecord }> = ({ task }) => {
  const isActive = task.status === 'running' || task.status === 'pending' || task.status === 'processing' || task.status === 'queued';
  const isDone = task.status === 'completed';
  const isFailed = task.status === 'failed';
  const stage = (task.payload?.stage as string | undefined) ?? (task.payload?.targetName as string | undefined);

  return (
    <Card size="small" styles={{ body: { padding: 14 } }} style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div
          style={{
            width: 36, height: 36, borderRadius: 6, flexShrink: 0,
            background: isDone ? '#f6ffed' : isFailed ? '#fff1f0' : '#e6f4ff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {isDone ? <CheckCircle2 size={20} color="#52c41a" />
            : isFailed ? <AlertCircle size={20} color="#d4380d" />
            : task.status === 'running' || task.status === 'processing' ? <Play size={18} color="#4d6fff" />
            : <Pause size={18} color="#bfbfbf" />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>
              {TYPE_LABEL[task.type] ?? task.type}
            </span>
            <Tag color={STATUS_COLOR[task.status] ?? 'default'}>{STATUS_LABEL[task.status] ?? task.status}</Tag>
            <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)' }}>{formatTime(task.createdAt)}</span>
          </div>
          {stage && (
            <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.55)', marginBottom: 6 }}>{stage}</div>
          )}
          {isActive && (
            <Progress
              percent={Math.round((task.progress ?? 0) * 100)}
              status={task.status === 'running' || task.status === 'processing' ? 'active' : 'normal'}
              size="small"
            />
          )}
          {isFailed && task.error && (
            <div style={{ fontSize: 12, color: '#d4380d', marginTop: 4 }}>{task.error}</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {isFailed && (
            <Tooltip title="重新提交">
              <Button size="small" icon={<RotateCw size={14} />} onClick={() => message.info('重试功能开发中')}>
                重试
              </Button>
            </Tooltip>
          )}
          {isActive && (
            <Popconfirm
              title="取消任务？"
              onConfirm={() => message.info('取消功能开发中')}
              okText="取消任务"
              cancelText="不取消"
            >
              <Button size="small" type="text" danger icon={<X size={14} />} />
            </Popconfirm>
          )}
        </div>
      </div>
    </Card>
  );
};

export const QueueTab: React.FC = () => {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = React.useCallback(async () => {
    setLoading(true);
    try {
      // 拉所有二创相关 task；按 type 分别查再合并（scope 是 recreation:<videoId>，所以不按 scope 过滤）
      const lists = await Promise.all(TYPES.map((t) => listTaskRecords({ type: t })));
      const merged = lists.flat()
        .filter((t) => (t.scope || '').startsWith('recreation:'))
        .sort((a, b) => b.createdAt - a.createdAt);
      setTasks(merged);
    } catch (err) {
      message.error(`加载任务失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  // 订阅 tasks:updated 实时刷新
  useEffect(() => {
    const api = (window as any).electronAPI?.tasks;
    if (!api?.onUpdated) return;
    const off = api.onUpdated((_e: unknown, env: { record?: TaskRecord }) => {
      const rec = env?.record;
      if (!rec) return;
      if (!TYPES.includes(rec.type as never)) return;
      if (!rec.scope?.startsWith('recreation:')) return;
      fetch();
    });
    return () => off?.();
  }, [fetch]);

  if (loading && tasks.length === 0) {
    return <Empty description="加载中..." />;
  }
  if (tasks.length === 0) {
    return (
      <Empty
        description={
          <div>
            <div style={{ fontSize: 14, marginBottom: 4 }}>还没有任务</div>
            <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
              到「视频库」Tab 导入视频后触发 AI 解析
            </div>
          </div>
        }
      />
    );
  }

  const groups: Array<{ label: string; jobs: TaskRecord[] }> = [
    { label: '进行中', jobs: tasks.filter((j) => j.status === 'running' || j.status === 'processing') },
    { label: '排队中', jobs: tasks.filter((j) => j.status === 'pending' || j.status === 'queued') },
    { label: '已完成', jobs: tasks.filter((j) => j.status === 'completed') },
    { label: '失败', jobs: tasks.filter((j) => j.status === 'failed') },
    { label: '已取消', jobs: tasks.filter((j) => j.status === 'cancelled') },
  ].filter((g) => g.jobs.length > 0);

  return (
    <div>
      {groups.map((g) => (
        <div key={g.label} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.55)', marginBottom: 8, fontWeight: 500 }}>
            {g.label} · {g.jobs.length}
          </div>
          {g.jobs.map((t) => <JobCard key={t.id} task={t} />)}
        </div>
      ))}
    </div>
  );
};
