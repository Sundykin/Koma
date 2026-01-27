/**
 * 分集管理组件
 * 支持分集列表展示、增删改、LLM 自动分割
 */
import React, { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import {
  Button,
  Flex,
  Modal,
  Form,
  Input,
  InputNumber,
  Tag,
  Space,
  Typography,
  Empty,
  Spin,
  App,
  Popconfirm,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  ThunderboltOutlined,
  HolderOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import type { Episode } from '../../types';
import { createEpisode, saveEpisode, deleteEpisode, listEpisodes } from '../../store/projectStore';
import { createLLMProvider } from '../../providers';
import { getActiveLLMConfig } from '../../store/globalStore';

const { Text, Paragraph } = Typography;
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

// 分集状态标签颜色
const statusColors: Record<Episode['status'], string> = {
  draft: 'default',
  script: 'processing',
  storyboard: 'purple',
  generating: 'warning',
  completed: 'success',
};

const statusLabels: Record<Episode['status'], string> = {
  draft: '草稿',
  script: '剧本',
  storyboard: '分镜',
  generating: '生成中',
  completed: '已完成',
};

export const EpisodeManager = forwardRef<EpisodeManagerRef, EpisodeManagerProps>(({
  projectId,
  fullScript,
  onEpisodeSelect,
  selectedEpisodeId,
}, ref) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingEpisode, setEditingEpisode] = useState<Episode | null>(null);
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [splitCount, setSplitCount] = useState(3);

  // 加载分集列表
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

  useEffect(() => {
    loadEpisodes();
  }, [loadEpisodes]);

  // 暴露 refresh 方法给父组件
  useImperativeHandle(ref, () => ({
    refresh: loadEpisodes,
  }), [loadEpisodes]);

  // 添加分集
  const handleAddEpisode = async () => {
    const nextNumber = episodes.length + 1;
    try {
      const newEpisode = await createEpisode(projectId, {
        number: nextNumber,
        title: `第 ${nextNumber} 集`,
        status: 'draft',
      });
      setEpisodes([...episodes, newEpisode]);
      message.success('分集已添加');
    } catch (err: any) {
      message.error(err.message);
    }
  };

  // 打开编辑对话框
  const handleEditClick = (episode: Episode) => {
    setEditingEpisode(episode);
    form.setFieldsValue({
      title: episode.title,
      scriptText: episode.scriptText || '',
    });
    setEditDialogOpen(true);
  };

  // 保存编辑
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
      message.success('分集已保存');
    } catch (err: any) {
      if (err.errorFields) return; // 表单验证失败
      message.error(err.message);
    }
  };

  // 删除分集
  const handleDeleteEpisode = async (episodeId: string) => {
    try {
      await deleteEpisode(projectId, episodeId);
      const remaining = episodes.filter(ep => ep.id !== episodeId);
      // 重新编号
      const renumbered = remaining.map((ep, idx) => ({ ...ep, number: idx + 1 }));
      setEpisodes(renumbered);
      // 保存重新编号
      for (const ep of renumbered) {
        await saveEpisode(projectId, ep.id, { number: ep.number });
      }
      message.success('分集已删除');
    } catch (err: any) {
      message.error(err.message);
    }
  };

  // LLM 自动分割剧本
  const handleAutoSplit = async () => {
    if (!fullScript?.trim()) {
      message.warning('请先输入完整剧本');
      return;
    }

    setSplitting(true);

    try {
      const config = await getActiveLLMConfig();
      if (!config) {
        throw new Error('请先配置 LLM');
      }

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
}

要求：
1. 每集标题要能体现该集主要内容
2. 分割点要选在情节自然过渡处
3. 保持剧本原文，不要改写或缩减`;

      const result = await provider.generateText(prompt, '你是一个专业影视编剧');

      // 解析 JSON
      const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```/) || [null, result];
      const jsonStr = (jsonMatch[1] || result).trim().replace(/^[^{]*/, '').replace(/[^}]*$/, '');
      const parsed = JSON.parse(jsonStr) as { episodes: { title: string; scriptText: string }[] };

      // 清空现有分集并创建新分集
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

  return (
    <div>
      {/* 标题栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Text strong style={{ fontSize: 16 }}>分集管理</Text>
        <Space>
          {fullScript && (
            <Button
              icon={<ThunderboltOutlined />}
              onClick={() => setSplitDialogOpen(true)}
              size="small"
            >
              自动分割
            </Button>
          )}
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAddEpisode}
            size="small"
          >
            添加分集
          </Button>
        </Space>
      </div>

      {/* 分集列表 */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      ) : episodes.length === 0 ? (
        <Empty description='暂无分集，点击"添加分集"创建' />
      ) : (
        <Flex vertical gap={8} style={{ border: '1px solid #303030', borderRadius: 8 }}>
          {episodes.map((episode) => (
            <div
              key={episode.id}
              role="button"
              tabIndex={0}
              className={`group flex items-center justify-between px-4 py-3 border-b border-zinc-800 cursor-pointer transition-colors hover:bg-zinc-800/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${
                selectedEpisodeId === episode.id
                  ? 'bg-emerald-500/10 border-l-[3px] border-l-emerald-500'
                  : 'border-l-[3px] border-l-transparent'
              }`}
              onClick={() => onEpisodeSelect?.(episode)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onEpisodeSelect?.(episode);
                }
              }}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <HolderOutlined className="text-zinc-600 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-zinc-200">
                      第 {episode.number} 集: {episode.title}
                    </span>
                    <Tag className="m-0" color={statusColors[episode.status]} variant="filled">
                      {statusLabels[episode.status]}
                    </Tag>
                  </div>
                  <div className="text-xs text-zinc-500 truncate pr-4">
                    {episode.scriptText || '暂无剧本内容'}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200">
                <Tooltip title="进入创作">
                  <Button
                    type="primary"
                    size="small"
                    ghost
                    icon={<PlayCircleOutlined />}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEpisodeSelect?.(episode);
                    }}
                  />
                </Tooltip>
                <Button
                  type="text"
                  size="small"
                  className="text-zinc-400 hover:text-white"
                  icon={<EditOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditClick(episode);
                  }}
                />
                <Popconfirm
                  title="确定删除此分集？"
                  onConfirm={(e) => {
                    e?.stopPropagation();
                    handleDeleteEpisode(episode.id);
                  }}
                  onCancel={(e) => e?.stopPropagation()}
                >
                  <Button
                    type="text"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={(e) => e.stopPropagation()}
                  />
                </Popconfirm>
              </div>
            </div>
          ))}
        </Flex>
      )}

      {/* 编辑对话框 */}
      <Modal
        title={`编辑分集 - 第 ${editingEpisode?.number} 集`}
        open={editDialogOpen}
        onOk={handleSaveEdit}
        onCancel={() => setEditDialogOpen(false)}
        okText="保存"
        cancelText="取消"
        width={640}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="title"
            label="分集标题"
            rules={[{ required: true, message: '请输入分集标题' }]}
          >
            <Input placeholder="请输入分集标题" />
          </Form.Item>
          <Form.Item name="scriptText" label="分集剧本">
            <TextArea rows={12} placeholder="输入本集剧本内容..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* 自动分割对话框 */}
      <Modal
        title="LLM 自动分割剧本"
        open={splitDialogOpen}
        onOk={handleAutoSplit}
        onCancel={() => !splitting && setSplitDialogOpen(false)}
        okText={splitting ? '分割中...' : '开始分割'}
        cancelText="取消"
        confirmLoading={splitting}
        closable={!splitting}
        maskClosable={!splitting}
      >
        <Paragraph type="secondary" style={{ marginBottom: 16 }}>
          使用 AI 自动将完整剧本分割成多集。现有分集将被替换。
        </Paragraph>
        <Form.Item label="分割成几集">
          <InputNumber
            value={splitCount}
            onChange={(v) => setSplitCount(v || 1)}
            min={1}
            max={20}
            style={{ width: 120 }}
          />
        </Form.Item>
      </Modal>
    </div>
  );
});

EpisodeManager.displayName = 'EpisodeManager';

export default EpisodeManager;
