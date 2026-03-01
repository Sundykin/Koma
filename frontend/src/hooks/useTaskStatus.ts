import { useEffect, useState } from 'react';
import { taskQueueService, type TaskInfo } from '../services/taskQueueService';

export function useTaskStatus(taskId: string | null | undefined) {
  const [status, setStatus] = useState<TaskInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) {
      setStatus(null);
      return;
    }

    let mounted = true;

    // 订阅任务更新
    const unsubscribe = taskQueueService.subscribe(taskId, (taskInfo) => {
      if (mounted) {
        setStatus(taskInfo);
      }
    });

    // 初始加载
    setLoading(true);
    taskQueueService
      .getTaskStatus(taskId)
      .then((taskInfo) => {
        if (mounted) {
          setStatus(taskInfo);
          setError(null);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [taskId]);

  return { status, loading, error };
}

export function useTaskList(filter?: {
  status?: string;
  projectId?: string;
}) {
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    // 初始加载
    setLoading(true);
    taskQueueService
      .listTasks(filter?.status)
      .then((taskList) => {
        if (mounted) {
          let filtered = taskList;
          if (filter?.projectId) {
            filtered = taskList.filter((t) => {
              const payload = t.payload as any;
              return payload?.projectId === filter.projectId;
            });
          }
          setTasks(filtered);
          setError(null);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    // 订阅所有任务更新（使用 IPC 事件，不再轮询）
    const unsubscribe = taskQueueService.subscribeAll((taskInfo) => {
      if (mounted) {
        setTasks((prev) => {
          const index = prev.findIndex((t) => t.taskId === taskInfo.taskId);
          if (index >= 0) {
            // 更新现有任务
            const next = [...prev];
            next[index] = { ...next[index], ...taskInfo };
            return next;
          } else {
            // 新任务
            return [...prev, taskInfo];
          }
        });
      }
    });

    // 定期刷新列表（作为备份，每 10 秒一次）
    const interval = setInterval(() => {
      if (mounted) {
        taskQueueService.listTasks(filter?.status).then((taskList) => {
          if (mounted) {
            let filtered = taskList;
            if (filter?.projectId) {
              filtered = taskList.filter((t) => {
                const payload = t.payload as any;
                return payload?.projectId === filter.projectId;
              });
            }
            setTasks(filtered);
          }
        });
      }
    }, 10000); // 10 秒轮询作为备份

    return () => {
      mounted = false;
      unsubscribe();
      clearInterval(interval);
    };
  }, [filter?.status, filter?.projectId]);

  return { tasks, loading, error };
}
