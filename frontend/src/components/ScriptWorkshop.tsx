/**
 * 剧本工作室组件
 * 剧本编辑、导入、版本历史管理
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Input,
  Button,
  Space,
  message,
  Modal,
  Upload,
  List,
  Typography,
  Tooltip,
  Dropdown,
  Divider,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  SaveOutlined,
  ImportOutlined,
  ExportOutlined,
  HistoryOutlined,
  EditOutlined,
  RobotOutlined,
  ScissorOutlined,
  TeamOutlined,
  EnvironmentOutlined,
  AppstoreOutlined,
  DownOutlined,
} from '@ant-design/icons';
import { electronService } from '../services/electronService';

const { TextArea } = Input;
const { Text, Title } = Typography;

export interface ScriptVersion {
  id: string;
  content: string;
  timestamp: number;
  description?: string;
}

interface ScriptWorkshopProps {
  projectId: string;
  initialScript?: string;
  onScriptChange?: (script: string) => void;
  onGenerateShots?: (script: string) => void;
  onExtractEntities?: (script: string, type: 'character' | 'scene' | 'prop') => void;
  onPolishScript?: (script: string) => void;
  onGenerateScript?: (idea: string, style: string, duration: string) => void;
}

export const ScriptWorkshop: React.FC<ScriptWorkshopProps> = ({
  projectId,
  initialScript = '',
  onScriptChange,
  onGenerateShots,
  onExtractEntities,
  onPolishScript,
  onGenerateScript,
}) => {
  const [script, setScript] = useState(initialScript);
  const [versions, setVersions] = useState<ScriptVersion[]>([]);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [generateModalVisible, setGenerateModalVisible] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [idea, setIdea] = useState('');
  const [style, setStyle] = useState('治愈');
  const [duration, setDuration] = useState('3');

  // 加载剧本版本历史
  useEffect(() => {
    loadVersions();
  }, [projectId]);

  // 同步初始剧本
  useEffect(() => {
    setScript(initialScript);
  }, [initialScript]);

  const loadVersions = async () => {
    if (!electronService.isElectron()) {
      const data = localStorage.getItem(`koma_script_versions_${projectId}`);
      if (data) {
        setVersions(JSON.parse(data));
      }
      return;
    }

    // Electron 环境：从项目目录加载
    try {
      const storagePath = await electronService.getStoragePath?.();
      if (!storagePath) return;
      const versionsPath = `${storagePath}/projects/${projectId}/script-versions.json`;
      const exists = await electronService.fs.exists(versionsPath);
      if (exists) {
        const data = await electronService.fs.readFile(versionsPath);
        setVersions(JSON.parse(data));
      }
    } catch {
      // ignore
    }
  };

  const saveVersion = async (content: string, description?: string) => {
    const newVersion: ScriptVersion = {
      id: `v_${Date.now()}`,
      content,
      timestamp: Date.now(),
      description,
    };

    const updatedVersions = [newVersion, ...versions].slice(0, 50); // 最多 50 个版本

    if (!electronService.isElectron()) {
      localStorage.setItem(`koma_script_versions_${projectId}`, JSON.stringify(updatedVersions));
      setVersions(updatedVersions);
      return;
    }

    try {
      const storagePath = await electronService.getStoragePath?.();
      if (!storagePath) return;
      const versionsPath = `${storagePath}/projects/${projectId}/script-versions.json`;
      await electronService.fs.writeFile(versionsPath, JSON.stringify(updatedVersions, null, 2));
      setVersions(updatedVersions);
    } catch {
      // ignore
    }
  };

  const handleScriptChange = useCallback((value: string) => {
    setScript(value);
    onScriptChange?.(value);
  }, [onScriptChange]);

  const handleSave = async () => {
    await saveVersion(script, '手动保存');
    message.success('剧本已保存');
  };

  const handleImport = async () => {
    if (!electronService.isElectron()) {
      // 浏览器环境
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.txt,.md,.fountain';
      input.onchange = async (e: any) => {
        const file = e.target.files[0];
        if (file) {
          const content = await file.text();
          handleScriptChange(content);
          await saveVersion(content, `导入: ${file.name}`);
          message.success('剧本已导入');
        }
      };
      input.click();
      return;
    }

    const result = await electronService.dialog.openFile({
      title: '导入剧本',
      filters: [
        { name: '文本文件', extensions: ['txt', 'md', 'fountain'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });

    if (result.filePaths && result.filePaths.length > 0) {
      const content = await electronService.fs.readFile(result.filePaths[0]);
      handleScriptChange(content);
      await saveVersion(content, `导入: ${result.filePaths[0].split('/').pop()}`);
      message.success('剧本已导入');
    }
  };

  const handleExport = async () => {
    if (!electronService.isElectron()) {
      const blob = new Blob([script], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'script.txt';
      a.click();
      URL.revokeObjectURL(url);
      message.success('剧本已导出');
      return;
    }

    const result = await electronService.dialog.saveFile({
      title: '导出剧本',
      defaultPath: 'script.txt',
      filters: [
        { name: '文本文件', extensions: ['txt'] },
        { name: 'Markdown', extensions: ['md'] },
      ],
    });

    if (result.filePath) {
      await electronService.fs.writeFile(result.filePath, script);
      message.success('剧本已导出');
    }
  };

  const handleRestoreVersion = (version: ScriptVersion) => {
    handleScriptChange(version.content);
    setHistoryVisible(false);
    message.success('已恢复到该版本');
  };

  // AI 功能菜单
  const aiMenuItems: MenuProps['items'] = [
    {
      key: 'generate',
      icon: <RobotOutlined />,
      label: '从创意生成剧本',
      onClick: () => setGenerateModalVisible(true),
    },
    {
      key: 'polish',
      icon: <EditOutlined />,
      label: 'AI 润色剧本',
      disabled: !script.trim(),
      onClick: () => onPolishScript?.(script),
    },
    { type: 'divider' },
    {
      key: 'shots',
      icon: <ScissorOutlined />,
      label: '拆解为分镜',
      disabled: !script.trim(),
      onClick: () => onGenerateShots?.(script),
    },
    { type: 'divider' },
    {
      key: 'characters',
      icon: <TeamOutlined />,
      label: '提取角色',
      disabled: !script.trim(),
      onClick: () => onExtractEntities?.(script, 'character'),
    },
    {
      key: 'scenes',
      icon: <EnvironmentOutlined />,
      label: '提取场景',
      disabled: !script.trim(),
      onClick: () => onExtractEntities?.(script, 'scene'),
    },
    {
      key: 'props',
      icon: <AppstoreOutlined />,
      label: '提取道具',
      disabled: !script.trim(),
      onClick: () => onExtractEntities?.(script, 'prop'),
    },
  ];

  const handleGenerateFromIdea = async () => {
    if (!idea.trim()) {
      message.warning('请输入创意/灵感');
      return;
    }
    setGenerating(true);
    try {
      await onGenerateScript?.(idea, style, duration);
      setGenerateModalVisible(false);
      setIdea('');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card
      title="剧本工作室"
      extra={
        <Space>
          <Button icon={<SaveOutlined />} onClick={handleSave}>
            保存
          </Button>
          <Button icon={<ImportOutlined />} onClick={handleImport}>
            导入
          </Button>
          <Button icon={<ExportOutlined />} onClick={handleExport}>
            导出
          </Button>
          <Button icon={<HistoryOutlined />} onClick={() => setHistoryVisible(true)}>
            历史
          </Button>
          <Dropdown menu={{ items: aiMenuItems }}>
            <Button type="primary" icon={<RobotOutlined />}>
              AI 功能 <DownOutlined />
            </Button>
          </Dropdown>
        </Space>
      }
      style={{ height: '100%' }}
      bodyStyle={{ height: 'calc(100% - 57px)', padding: 0 }}
    >
      <TextArea
        value={script}
        onChange={(e) => handleScriptChange(e.target.value)}
        placeholder="在此输入或粘贴剧本内容...\n\n提示：\n- 使用 ## 标记场景\n- 使用 **角色名**：标记对话\n- 使用 （括号）标记动作指示"
        style={{
          height: '100%',
          resize: 'none',
          border: 'none',
          borderRadius: 0,
          fontSize: 14,
          lineHeight: 1.8,
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      />

      {/* 版本历史 Modal */}
      <Modal
        title="版本历史"
        open={historyVisible}
        onCancel={() => setHistoryVisible(false)}
        footer={null}
        width={600}
      >
        {versions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
            暂无历史版本
          </div>
        ) : (
          <List
            dataSource={versions}
            renderItem={(version) => (
              <List.Item
                actions={[
                  <Button
                    key="restore"
                    type="link"
                    onClick={() => handleRestoreVersion(version)}
                  >
                    恢复
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={new Date(version.timestamp).toLocaleString()}
                  description={
                    <Text type="secondary" ellipsis>
                      {version.description || version.content.slice(0, 100)}
                    </Text>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Modal>

      {/* 生成剧本 Modal */}
      <Modal
        title="从创意生成剧本"
        open={generateModalVisible}
        onOk={handleGenerateFromIdea}
        onCancel={() => setGenerateModalVisible(false)}
        okText="生成"
        cancelText="取消"
        confirmLoading={generating}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8 }}>创意/灵感</div>
          <TextArea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="输入你的创意或故事想法，如：一个程序员意外获得了穿越时空的能力，每次只能穿越5分钟..."
            rows={4}
          />
        </div>
        <Space size="large">
          <div>
            <div style={{ marginBottom: 8 }}>风格</div>
            <Input
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              placeholder="治愈/搞笑/悬疑"
              style={{ width: 120 }}
            />
          </div>
          <div>
            <div style={{ marginBottom: 8 }}>时长 (分钟)</div>
            <Input
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="3"
              style={{ width: 80 }}
            />
          </div>
        </Space>
      </Modal>
    </Card>
  );
};

export default ScriptWorkshop;
