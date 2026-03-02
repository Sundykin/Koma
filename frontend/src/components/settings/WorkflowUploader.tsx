/**
 * ComfyUI 工作流上传与节点映射组件
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Upload,
  Button,
  Card,
  Table,
  Select,
  Space,
  Tag,
  Modal,
  App,
  Tooltip,
  Empty,
} from 'antd';
import {
  UploadOutlined,
  DeleteOutlined,
  EyeOutlined,
  NodeIndexOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';

// ComfyUI 工作流节点类型
interface ComfyNode {
  id: string;
  type: string;
  title?: string;
  inputs: Record<string, any>;
  outputs?: any[];
}

// 解析后的工作流信息
interface ParsedWorkflow {
  nodes: ComfyNode[];
  inputNodes: ComfyNode[];  // 可作为输入的节点
  outputNodes: ComfyNode[]; // 输出节点
}

// 系统输入映射类型
type SystemInputType = 'positive_prompt' | 'negative_prompt' | 'image' | 'seed' | 'width' | 'height' | 'steps' | 'cfg';

// 常见的 ComfyUI 输入节点类型
const INPUT_NODE_TYPES = [
  'CLIPTextEncode',
  'KSampler',
  'KSamplerAdvanced',
  'EmptyLatentImage',
  'LoadImage',
  'VAEDecode',
  'CheckpointLoaderSimple',
];

interface WorkflowUploaderProps {
  value?: {
    workflowPath?: string;
    workflowMapping?: Record<string, string>;
  };
  onChange?: (value: { workflowPath?: string; workflowMapping?: Record<string, string>; workflowJson?: string }) => void;
  disabled?: boolean;
}

export const WorkflowUploader: React.FC<WorkflowUploaderProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const { message } = App.useApp();
  const { t } = useTranslation('settings');

  const SYSTEM_INPUTS: { key: SystemInputType; label: string; description: string }[] = [
    { key: 'positive_prompt', label: t('workflow.input.positivePrompt'), description: t('workflow.input.positivePromptDesc') },
    { key: 'negative_prompt', label: t('workflow.input.negativePrompt'), description: t('workflow.input.negativePromptDesc') },
    { key: 'image', label: t('workflow.input.image'), description: t('workflow.input.imageDesc') },
    { key: 'seed', label: t('workflow.input.seed'), description: t('workflow.input.seedDesc') },
    { key: 'width', label: t('workflow.input.width'), description: t('workflow.input.widthDesc') },
    { key: 'height', label: t('workflow.input.height'), description: t('workflow.input.heightDesc') },
    { key: 'steps', label: t('workflow.input.steps'), description: t('workflow.input.stepsDesc') },
    { key: 'cfg', label: t('workflow.input.cfgScale'), description: t('workflow.input.cfgScaleDesc') },
  ];
  const [workflow, setWorkflow] = useState<ParsedWorkflow | null>(null);
  const [workflowJson, setWorkflowJson] = useState<string>('');
  const [mapping, setMapping] = useState<Record<string, string>>(value?.workflowMapping || {});
  const [previewVisible, setPreviewVisible] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  useEffect(() => {
    if (value?.workflowMapping) {
      setMapping(value.workflowMapping);
    }
  }, [value?.workflowMapping]);

  // 解析 ComfyUI 工作流 JSON
  const parseWorkflow = (json: any): ParsedWorkflow => {
    const nodes: ComfyNode[] = [];
    const inputNodes: ComfyNode[] = [];
    const outputNodes: ComfyNode[] = [];

    // ComfyUI 工作流格式：{ "1": { "class_type": "...", "inputs": {...} }, ... }
    for (const [id, nodeData] of Object.entries(json)) {
      if (typeof nodeData !== 'object' || !nodeData) continue;

      const node: ComfyNode = {
        id,
        type: (nodeData as any).class_type || (nodeData as any).type || 'Unknown',
        title: (nodeData as any)._meta?.title,
        inputs: (nodeData as any).inputs || {},
      };
      nodes.push(node);

      // 识别输入节点
      if (INPUT_NODE_TYPES.some(t => node.type.includes(t))) {
        inputNodes.push(node);
      }

      // 识别输出节点（SaveImage、PreviewImage 等）
      if (node.type.includes('Save') || node.type.includes('Preview') || node.type.includes('Output')) {
        outputNodes.push(node);
      }
    }

    return { nodes, inputNodes, outputNodes };
  };

  // 处理文件上传
  const handleUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const json = JSON.parse(content);
        const parsed = parseWorkflow(json);

        if (parsed.nodes.length === 0) {
          message.error(t('workflow.parseError'));
          return;
        }

        setWorkflow(parsed);
        setWorkflowJson(content);
        setFileList([{
          uid: '-1',
          name: file.name,
          status: 'done',
        }]);

        // 自动映射常见节点
        const autoMapping: Record<string, string> = {};
        for (const node of parsed.inputNodes) {
          if (node.type === 'CLIPTextEncode' && !autoMapping.positive_prompt) {
            // 检查是否连接到正向或负向
            const inputText = node.inputs.text;
            if (typeof inputText === 'string') {
              if (inputText.toLowerCase().includes('negative') || node.title?.toLowerCase().includes('negative')) {
                autoMapping.negative_prompt = `${node.id}:text`;
              } else {
                autoMapping.positive_prompt = `${node.id}:text`;
              }
            }
          }
          if (node.type.includes('KSampler')) {
            if (!autoMapping.seed) autoMapping.seed = `${node.id}:seed`;
            if (!autoMapping.steps) autoMapping.steps = `${node.id}:steps`;
            if (!autoMapping.cfg) autoMapping.cfg = `${node.id}:cfg`;
          }
          if (node.type === 'EmptyLatentImage') {
            if (!autoMapping.width) autoMapping.width = `${node.id}:width`;
            if (!autoMapping.height) autoMapping.height = `${node.id}:height`;
          }
          if (node.type === 'LoadImage') {
            if (!autoMapping.image) autoMapping.image = `${node.id}:image`;
          }
        }
        setMapping(autoMapping);

        message.success(t('workflow.loadSuccess', { count: parsed.nodes.length }));

        onChange?.({
          workflowPath: file.name,
          workflowMapping: autoMapping,
          workflowJson: content,
        });
      } catch (err) {
        message.error(t('workflow.jsonParseError'));
      }
    };
    reader.readAsText(file);
    return false; // 阻止默认上传
  };

  // 更新映射
  const handleMappingChange = (systemInput: string, nodeInput: string) => {
    const newMapping = { ...mapping, [systemInput]: nodeInput };
    setMapping(newMapping);
    onChange?.({
      workflowPath: value?.workflowPath,
      workflowMapping: newMapping,
      workflowJson,
    });
  };

  // 清除工作流
  const handleClear = () => {
    setWorkflow(null);
    setWorkflowJson('');
    setMapping({});
    setFileList([]);
    onChange?.({
      workflowPath: undefined,
      workflowMapping: undefined,
      workflowJson: undefined,
    });
  };

  // 生成节点选项
  const getNodeOptions = () => {
    if (!workflow) return [];
    return workflow.inputNodes.map(node => ({
      label: `${node.title || node.type} (ID: ${node.id})`,
      options: Object.keys(node.inputs).map(inputKey => ({
        value: `${node.id}:${inputKey}`,
        label: `${node.title || node.type} → ${inputKey}`,
      })),
    }));
  };

  // 映射表格列
  const mappingColumns = [
    {
      title: t('workflow.table.systemInput'),
      dataIndex: 'label',
      width: 120,
    },
    {
      title: t('workflow.table.description'),
      dataIndex: 'description',
      width: 200,
      render: (text: string) => <span style={{ color: '#888', fontSize: 12 }}>{text}</span>,
    },
    {
      title: t('workflow.table.mapToNode'),
      dataIndex: 'key',
      render: (key: string) => (
        <Select
          value={mapping[key]}
          onChange={(val) => handleMappingChange(key, val)}
          placeholder={t('workflow.table.selectNodeInput')}
          allowClear
          style={{ width: '100%' }}
          options={getNodeOptions()}
          disabled={disabled || !workflow}
        />
      ),
    },
    {
      title: t('workflow.table.status'),
      width: 60,
      render: (_: any, record: any) => (
        mapping[record.key] ? (
          <CheckCircleOutlined style={{ color: '#52c41a' }} />
        ) : (
          <span style={{ color: '#d9d9d9' }}>—</span>
        )
      ),
    },
  ];

  return (
    <div>
      {/* 上传区域 */}
      <div style={{ marginBottom: 16 }}>
        <Space>
          <Upload
            accept=".json"
            maxCount={1}
            fileList={fileList}
            beforeUpload={handleUpload}
            onRemove={handleClear}
            disabled={disabled}
          >
            <Button icon={<UploadOutlined />} disabled={disabled}>
              {t('workflow.uploadBtn')}
            </Button>
          </Upload>

          {workflow && (
            <>
              <Tooltip title={t('workflow.previewNodesTooltip')}>
                <Button
                  icon={<EyeOutlined />}
                  onClick={() => setPreviewVisible(true)}
                />
              </Tooltip>
              <Tag color="green">
                <NodeIndexOutlined /> {t('workflow.nodeCountTag', { count: workflow.nodes.length })}
              </Tag>
            </>
          )}
        </Space>
      </div>

      {/* 节点映射配置 */}
      {workflow ? (
        <Card size="small" title={t('workflow.mappingCardTitle')} style={{ marginTop: 16 }}>
          <p style={{ marginBottom: 12, color: '#888', fontSize: 13 }}>
            {t('workflow.mappingDesc')}
          </p>
          <Table
            dataSource={SYSTEM_INPUTS}
            columns={mappingColumns}
            rowKey="key"
            pagination={false}
            size="small"
          />
        </Card>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t('workflow.emptyDesc')}
          style={{ marginTop: 16 }}
        />
      )}

      {/* 节点预览 Modal */}
      <Modal
        title={t('workflow.previewModalTitle')}
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        footer={null}
        width={700}
      >
        {workflow && (
          <Table
            dataSource={workflow.nodes}
            columns={[
              { title: 'ID', dataIndex: 'id', width: 60 },
              { title: t('workflow.preview.typeCol'), dataIndex: 'type', width: 200 },
              { title: t('workflow.preview.titleCol'), dataIndex: 'title', render: (t: string) => t || '—' },
              {
                title: t('workflow.preview.inputsCol'),
                dataIndex: 'inputs',
                render: (inputs: Record<string, any>) => (
                  <span style={{ fontSize: 12, color: '#888' }}>
                    {Object.keys(inputs).slice(0, 3).join(', ')}
                    {Object.keys(inputs).length > 3 && '...'}
                  </span>
                ),
              },
            ]}
            rowKey="id"
            size="small"
            pagination={{ pageSize: 10 }}
          />
        )}
      </Modal>
    </div>
  );
};
