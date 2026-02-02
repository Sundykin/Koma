/**
 * 剧集管理组件
 * 支持剧集列表展示、增删改、拖拽排序
 */
import React, { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Modal, Form, Input, InputNumber, App, Spin, Empty } from 'antd';
import { GripVertical, Play, Pencil, Trash2, Plus, Zap } from 'lucide-react';
import type { Episode } from '../../types';
import { createEpisode, saveEpisode, deleteEpisode, listEpisodes } from '../../store/projectStore';
import { createLLMProvider } from '../../providers';
import { getActiveLLMConfig } from '../../store/globalStore';

const { TextArea } = Input;

interface EpisodeManagerProps {
  projectId: string;
  fullScript?: string;
  onEpisodeSelect?: (episode: Episode) => void;
  selectedEpisodeId?: string;
}

export interface EpisodeManagerRef {
  refresh: () => void;
}

const statusConfig: Record<Episode['status'], { label: string; color: string }> = {
  draft: { label: '草稿', color: 'bg-zinc-700 text-zinc-400' },
  script: { label: '剧本', color: 'bg-blue-900/50 text-blue-400' },
  storyboard: { label: '分镜', color: 'bg-purple-900/50 text-purple-400' },
  generating: { label: '生成中', color: 'bg-orange-900/50 text-orange-400' },
  completed: { label: '已完成', color: 'bg-emerald-900/50 text-emerald-400' },
};

export const EpisodeManager = forwardRef<EpisodeManagerRef, EpisodeManagerProps>(({
  projectId,
  fullScript,
  onEpisodeSelect,
  selectedEpisodeId,
}, ref) => {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingEpisode, setEditingEpisode] = useState<Episode | null>(null);
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [splitCount, setSplitCount] = useState(3);

  const loadEpisodes = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listEpisodes(projectId);
      setEpisodes(list);
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId, message]);

  useEffect(() => { loadEpisodes(); }, [loadEpisodes]);

  useImperativeHandle(ref, () => ({ refresh: loadEpisodes }), [loadEpisodes]);

  const handleAddEpisode = async () => {
    const nextNumber = episodes.length + 1;
    try {
      const newEpisode = await createEpisode(projectId, {
        number: nextNumber,
        title: `第 ${nextNumber} 集`,
        status: 'draft',
      });
      setEpisodes([...episodes, newEpisode]);
      message.success('剧集已添加');
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const handleEditClick = (episode: Episode, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingEpisode(episode);
    form.setFieldsValue({ title: episode.title, scriptText: episode.scriptText || '' });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingEpisode) return;
    try {
      const values = await form.validateFields();
      const updated = await saveEpisode(projectId, editingEpisode.id, {
        title: values.title,
        scriptText: values.scriptText,
        status: values.scriptText?.trim() ? 'script' : 'draft',
      });
      if (updated) {
        setEpisodes(episodes.map(ep => ep.id === updated.id ? updated : ep));
      }
      setEditDialogOpen(false);
      setEditingEpisode(null);
      message.success('剧集已保存');
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(err.message);
    }
  };

  const handleDeleteEpisode = async (episode: Episode, e: React.MouseEvent) => {
    e.stopPropagation();
    modal.confirm({
      title: '确定删除此剧集？',
      content: `将删除"${episode.title}"及其所有数据`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteEpisode(projectId, episode.id);
          const remaining = episodes.filter(ep => ep.id !== episode.id);
          const renumbered = remaining.map((ep, idx) => ({ ...ep, number: idx + 1 }));
          setEpisodes(renumbered);
          for (const ep of renumbered) {
            await saveEpisode(projectId, ep.id, { number: ep.number });
          }
          message.success('剧集已删除');
        } catch (err: any) {
          message.error(err.message);
        }
      },
    });
  };

  const handleAutoSplit = async () => {
    if (!fullScript?.trim()) {
      message.warning('请先输入完整剧本');
      return;
    }
    setSplitting(true);
    try {
      const config = await getActiveLLMConfig();
      if (!config) throw new Error('请先配置 LLM');

      const provider = createLLMProvider({
        provider: config.provider === 'openai-compatible' ? 'openai' : config.provider as any,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        modelName: config.modelName,
      });

      const prompt = `请将以下剧本分割成 ${splitCount} 集，每集都有完整的故事弧和自然的节点。

剧本：
${fullScript}

请严格按以下 JSON 格式输出：
{
  "episodes": [
    { "title": "第X集标题", "scriptText": "该集的剧本内容" }
  ]
}`;

      const result = await provider.generateText(prompt, '你是一个专业影视编剧');
      const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```/) || [null, result];
      const jsonStr = (jsonMatch[1] || result).trim().replace(/^[^{]*/, '').replace(/[^}]*$/, '');
      const parsed = JSON.parse(jsonStr) as { episodes: { title: string; scriptText: string }[] };

      for (const ep of episodes) {
        await deleteEpisode(projectId, ep.id);
      }

      const newEpisodes: Episode[] = [];
      for (let i = 0; i < parsed.episodes.length; i++) {
        const split = parsed.episodes[i];
        const ep = await createEpisode(projectId, {
          number: i + 1,
          title: split.title,
          scriptText: split.scriptText,
          status: 'script',
        });
        newEpisodes.push(ep);
      }

      setEpisodes(newEpisodes);
      setSplitDialogOpen(false);
      message.success(`已分割为 ${newEpisodes.length} 集`);
    } catch (err: any) {
      message.error(`分割失败: ${err.message}`);
    } finally {
      setSplitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spin />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* 工具栏 */}
      {fullScript && (
        <div className="flex justify-end mb-2">
          <button
            onClick={() => setSplitDialogOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-purple-400 hover:text-purple-300 bg-purple-900/20 hover:bg-purple-900/30 border border-purple-800/50 rounded-md transition-colors"
          >
            <Zap className="w-3.5 h-3.5" />
            AI 分割
          </button>
        </div>
      )}

      {/* 剧集列表 */}
      {episodes.length === 0 ? (
        <Empty description="暂无剧集" className="py-8" />
      ) : (
        <div className="flex flex-col">
          {episodes.map((episode) => {
            const status = statusConfig[episode.status];
            const isSelected = selectedEpisodeId === episode.id;

            return (
              <div
                key={episode.id}
                onClick={() => onEpisodeSelect?.(episode)}
                className={`group flex items-center justify-between h-[72px] px-4 cursor-pointer transition-colors border-b border-zinc-800/80 ${
                  isSelected
                    ? 'bg-emerald-500/10 border-l-[3px] border-l-emerald-500'
                    : 'bg-zinc-900 hover:bg-zinc-800/50 border-l-[3px] border-l-transparent'
                }`}
              >
                {/* Left: Drag + Info */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <GripVertical className="w-4 h-4 text-zinc-600 opacity-50 cursor-grab" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-zinc-200 truncate">
                        第 {episode.number} 集: {episode.title}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${status.color}`}>
                        {status.label}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 truncate pr-4">
                      {episode.scriptText?.slice(0, 50) || '暂无剧本内容...'}
                    </p>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEpisodeSelect?.(episode);
                    }}
                    className="p-1.5 text-emerald-400 hover:text-emerald-300 border border-emerald-500/50 hover:border-emerald-400 rounded-md transition-colors"
                  >
                    <Play className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => handleEditClick(episode, e)}
                    className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded-md transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => handleDeleteEpisode(episode, e)}
                    className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded-md transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 添加剧集按钮 */}
      <button
        onClick={handleAddEpisode}
        className="flex items-center justify-center gap-2 h-12 border border-dashed border-zinc-700 hover:border-emerald-500/50 rounded-lg text-sm text-zinc-500 hover:text-emerald-400 transition-colors"
      >
        <Plus className="w-4 h-4" />
        添加剧集
      </button>

      {/* 编辑对话框 */}
      <Modal
        title={`编辑 - 第 ${editingEpisode?.number} 集`}
        open={editDialogOpen}
        onOk={handleSaveEdit}
        onCancel={() => setEditDialogOpen(false)}
        okText="保存"
        cancelText="取消"
        width={640}
      >
        <Form form={form} layout="vertical" className="mt-4">
          <Form.Item
            name="title"
            label="剧集标题"
            rules={[{ required: true, message: '请输入剧集标题' }]}
          >
            <Input placeholder="请输入剧集标题" />
          </Form.Item>
          <Form.Item name="scriptText" label="剧集剧本">
            <TextArea rows={12} placeholder="输入本集剧本内容..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* 自动分割对话框 */}
      <Modal
        title="AI 自动分割剧本"
        open={splitDialogOpen}
        onOk={handleAutoSplit}
        onCancel={() => !splitting && setSplitDialogOpen(false)}
        okText={splitting ? '分割中...' : '开始分割'}
        cancelText="取消"
        confirmLoading={splitting}
        closable={!splitting}
        maskClosable={!splitting}
      >
        <p className="text-zinc-400 text-sm mb-4">
          使用 AI 自动将完整剧本分割成多集。现有剧集将被替换。
        </p>
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-300">分割成</span>
          <InputNumber
            value={splitCount}
            onChange={(v) => setSplitCount(v || 1)}
            min={1}
            max={20}
            className="!w-20"
          />
          <span className="text-sm text-zinc-300">集</span>
        </div>
      </Modal>
    </div>
  );
});

EpisodeManager.displayName = 'EpisodeManager';

export default EpisodeManager;
