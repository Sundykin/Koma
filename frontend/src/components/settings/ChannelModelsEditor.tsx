import React from 'react';
import { Button, Card, Checkbox, Form, Input, Space, Tag, Typography, Tooltip } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { ModelCapability } from '../../providers/channel/types';
import { generateId } from '../../store/globalStore';

export interface CapabilityOption {
  value: ModelCapability;
  label: string;
}

function normalizeString(value: unknown): string {
  return String(value || '').trim();
}

export interface ChannelModelsEditorProps {
  /**
   * Form field name, defaults to "models".
   */
  name?: string;
  /**
   * Capability options to select from. When omitted, the editor will not render
   * a checkbox group and callers are expected to fill capabilities on save.
   */
  capabilityOptions?: CapabilityOption[];
  /**
   * When capabilityOptions is omitted, show these fixed capabilities as tags.
   */
  fixedCapabilities?: ModelCapability[];
  /**
   * Used when adding a new row.
   */
  defaultCapabilities?: ModelCapability[];
  modelNamePlaceholder?: string;
  labelPlaceholder?: string;
  helpText?: string;
}

export const ChannelModelsEditor: React.FC<ChannelModelsEditorProps> = ({
  name = 'models',
  capabilityOptions,
  fixedCapabilities,
  defaultCapabilities,
  modelNamePlaceholder = '填写三方渠道的模型名称，如: model-a / provider-model-001',
  labelPlaceholder = '展示名（可选）',
  helpText,
}) => (
  <div className="settings-models-editor">
    {helpText && (
      <Typography.Paragraph type="secondary" className="settings-models-help">
        {helpText}
      </Typography.Paragraph>
    )}

    <Form.List name={name}>
      {(fields, { add, remove }) => (
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          {fields.map((field, index) => (
            <Card
              key={field.key}
              size="small"
              className="settings-model-card"
              title={`模型 ${index + 1}`}
              extra={(
                <Tooltip title={fields.length === 1 ? '至少保留一个模型' : '删除该模型'}>
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    disabled={fields.length === 1}
                    onClick={() => remove(field.name)}
                  />
                </Tooltip>
              )}
            >
              <Form.Item name={[field.name, 'id']} hidden>
                <Input />
              </Form.Item>

              <div className="settings-model-grid">
                <Form.Item
                  name={[field.name, 'providerModelName']}
                  label="模型名称"
                  rules={[{
                    required: true,
                    message: '请输入模型名称',
                    transform: normalizeString,
                  }]}
                  style={{ marginBottom: 0 }}
                >
                  <Input placeholder={modelNamePlaceholder} />
                </Form.Item>

                <Form.Item
                  name={[field.name, 'label']}
                  label="展示名"
                  style={{ marginBottom: 0 }}
                >
                  <Input placeholder={labelPlaceholder} />
                </Form.Item>

                {capabilityOptions?.length ? (
                  <Form.Item
                    name={[field.name, 'capabilities']}
                    label="能力"
                    className="full-span"
                    rules={[{
                      validator: async (_rule, value: unknown) => {
                        const array = Array.isArray(value) ? value : [];
                        if (array.length === 0) {
                          throw new Error('请至少选择一个能力');
                        }
                      },
                    }]}
                    style={{ marginBottom: 0 }}
                  >
                    <Checkbox.Group
                      className="settings-model-capabilities"
                      options={capabilityOptions.map((option) => ({
                        value: option.value,
                        label: option.label,
                      }))}
                    />
                  </Form.Item>
                ) : fixedCapabilities?.length ? (
                  <div className="full-span">
                    <Typography.Text type="secondary">能力:</Typography.Text>
                    <div style={{ marginTop: 6 }}>
                      <Space wrap size={[6, 6]}>
                        {fixedCapabilities.map((capability) => (
                          <Tag key={capability} color="cyan">{capability}</Tag>
                        ))}
                      </Space>
                    </div>
                  </div>
                ) : null}
              </div>
            </Card>
          ))}

          <Button
            type="dashed"
            icon={<PlusOutlined />}
            block
            onClick={() => add({
              id: generateId(),
              providerModelName: '',
              label: '',
              capabilities: defaultCapabilities || [],
            })}
          >
            添加模型
          </Button>
        </Space>
      )}
    </Form.List>
  </div>
);

export default ChannelModelsEditor;
