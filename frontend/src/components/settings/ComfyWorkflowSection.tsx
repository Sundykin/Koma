/**
 * ComfyUI 工作流导入区（渠道模型编辑器内嵌）。
 *
 * 用户粘贴/导入「导出（API）」格式的工作流 JSON 后，自动识别节点角色并预览
 * （提示词/负面/种子/尺寸/参考图/输出类型），识别不准时可在「节点绑定覆盖」
 * 里手动指定 —— 全部写入模型 defaults.workflowJson / defaults.nodeBindings，
 * 运行时由 ComfyUITTIProvider / ComfyUIITVProvider 读取，无需改代码。
 */
import React, { useMemo } from 'react';
import { Alert, Button, Collapse, Form, Input, Select, Space, Tag, Typography, Upload } from 'antd';
import { DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import {
  parseComfyWorkflowJson,
  analyzeComfyWorkflow,
  type ComfyNodeCandidate,
} from '../../providers/itv/comfyui/workflowImport';

export interface ComfyWorkflowSectionProps {
  /** Form.List 的字段名（默认 models） */
  listName: string;
  /** 当前模型在 Form.List 里的下标字段名 */
  fieldName: number;
}

function candidateLabel(c: ComfyNodeCandidate): string {
  const title = c.title && c.title !== c.classType ? ` · ${c.title}` : '';
  return `#${c.nodeId} ${c.classType}${title}`;
}

const KIND_META: Record<string, { color: string; label: string }> = {
  image: { color: 'green', label: '图片输出' },
  video: { color: 'purple', label: '视频输出' },
  unknown: { color: 'orange', label: '未识别输出' },
};

export const ComfyWorkflowSection: React.FC<ComfyWorkflowSectionProps> = ({ listName, fieldName }) => {
  const form = Form.useFormInstance();
  const jsonPath = [listName, fieldName, 'defaults', 'workflowJson'];
  const workflowJson = Form.useWatch(jsonPath, form) as string | undefined;

  const parsed = useMemo(
    () => parseComfyWorkflowJson(String(workflowJson || '')),
    [workflowJson],
  );
  const analysis = useMemo(
    () => (parsed.ok && parsed.workflow ? analyzeComfyWorkflow(parsed.workflow) : null),
    [parsed],
  );

  const setJson = (text: string) => {
    form.setFieldValue(jsonPath, text);
    // 内容变化后立即触发表单重新校验/收集
    form.validateFields([[listName, fieldName, 'defaults', 'workflowJson']]).catch(() => undefined);
  };

  const summaryTags = analysis ? [
    analysis.prompt && `提示词 → #${analysis.prompt.nodeId}`,
    analysis.negativePrompt && `负面 → #${analysis.negativePrompt.nodeId}`,
    analysis.seeds.length > 0 && `种子 → ${analysis.seeds.map(s => `#${s.nodeId}`).join('/')}`,
    analysis.sizeNode && `批量/尺寸 → #${analysis.sizeNode.nodeId}`,
    analysis.aspectNode && `比例 → #${analysis.aspectNode.nodeId}`,
    analysis.referenceImages.length > 0 && `参考图 × ${analysis.referenceImages.length}`,
    analysis.duration && `时长 → #${analysis.duration.nodeId}`,
    analysis.fps && `帧率 → #${analysis.fps.nodeId}`,
  ].filter(Boolean) as string[] : [];

  return (
    <div className="full-span">
      <Typography.Text type="secondary">ComfyUI 工作流（可选，导入「导出（API）」格式 JSON 后按此执行）</Typography.Text>
      <Space size={8} style={{ marginTop: 6, marginBottom: 6 }} wrap>
        <Upload
          accept=".json,application/json"
          showUploadList={false}
          beforeUpload={(file) => {
            file.text().then(setJson).catch(() => undefined);
            return false;
          }}
        >
          <Button size="small" icon={<UploadOutlined />}>导入 JSON 文件</Button>
        </Upload>
        {workflowJson ? (
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => setJson('')}
          >
            移除工作流
          </Button>
        ) : null}
        {analysis ? (
          <>
            <Tag color={KIND_META[analysis.kind].color}>{KIND_META[analysis.kind].label}</Tag>
            <Tag>{analysis.nodeCount} 个节点</Tag>
          </>
        ) : null}
      </Space>

      <Form.Item
        name={jsonPath.slice(1)}
        rules={[{
          validator: async (_rule, value: unknown) => {
            const text = String(value || '').trim();
            if (!text) return;
            const result = parseComfyWorkflowJson(text);
            if (!result.ok) throw new Error(result.error);
          },
        }]}
        className="settings-form-item-flush"
        style={{ marginBottom: 8 }}
      >
        <Input.TextArea
          rows={3}
          placeholder='粘贴 ComfyUI「导出（API）」格式的 JSON；留空则使用内置工作流'
          style={{ fontFamily: 'monospace', fontSize: 12 }}
        />
      </Form.Item>

      {parsed.ok === false && String(workflowJson || '').trim() ? (
        <Alert type="error" showIcon message={parsed.error} style={{ marginBottom: 8 }} />
      ) : null}

      {analysis ? (
        <>
          <div style={{ marginBottom: 8 }}>
            <Space wrap size={[4, 4]}>
              {summaryTags.map(tag => <Tag key={tag} color="cyan">{tag}</Tag>)}
            </Space>
          </div>
          {analysis.warnings.map(warning => (
            <Alert key={warning} type="warning" showIcon message={warning} style={{ marginBottom: 6 }} />
          ))}
          <Collapse
            ghost
            items={[{
              key: 'overrides',
              label: <Typography.Text type="secondary">节点绑定覆盖（自动识别不准时手动指定）</Typography.Text>,
              children: (
                <div className="settings-model-grid">
                  <Form.Item
                    name={[fieldName, 'defaults', 'nodeBindings', 'promptNodeId']}
                    label="提示词节点"
                    className="settings-form-item-flush"
                  >
                    <Select
                      allowClear
                      placeholder={analysis.prompt ? `自动（${candidateLabel(analysis.prompt)}）` : '自动'}
                      options={analysis.candidates.prompt.map(c => ({ value: c.nodeId, label: candidateLabel(c) }))}
                    />
                  </Form.Item>
                  <Form.Item
                    name={[fieldName, 'defaults', 'nodeBindings', 'negativePromptNodeId']}
                    label="负面提示词节点"
                    className="settings-form-item-flush"
                  >
                    <Select
                      allowClear
                      placeholder={analysis.negativePrompt ? `自动（${candidateLabel(analysis.negativePrompt)}）` : '自动'}
                      options={analysis.candidates.negativePrompt.map(c => ({ value: c.nodeId, label: candidateLabel(c) }))}
                    />
                  </Form.Item>
                  <Form.Item
                    name={[fieldName, 'defaults', 'nodeBindings', 'sizeNodeId']}
                    label="尺寸/批量节点"
                    className="settings-form-item-flush"
                  >
                    <Select
                      allowClear
                      placeholder={analysis.sizeNode ? `自动（${candidateLabel(analysis.sizeNode)}）` : '自动'}
                      options={analysis.candidates.size.map(c => ({ value: c.nodeId, label: candidateLabel(c) }))}
                    />
                  </Form.Item>
                  <Form.Item
                    name={[fieldName, 'defaults', 'nodeBindings', 'seedNodeIds']}
                    label="种子节点（可多选）"
                    className="settings-form-item-flush"
                  >
                    <Select
                      mode="multiple"
                      allowClear
                      placeholder={analysis.seeds.length > 0 ? `自动（${analysis.seeds.map(s => `#${s.nodeId}`).join(', ')}）` : '自动'}
                      options={analysis.candidates.seed.map(c => ({ value: c.nodeId, label: candidateLabel(c) }))}
                    />
                  </Form.Item>
                </div>
              ),
            }]}
          />
        </>
      ) : null}
    </div>
  );
};

export default ComfyWorkflowSection;
