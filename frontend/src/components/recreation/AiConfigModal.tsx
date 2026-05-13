/**
 * AiConfigModal — 二创 AI 能力配置 modal（极简版）
 *
 * 仅 2 个档位：
 *   VLM —— 看图 + 输出所有视觉维度（人物/场景/镜头/服装/动作/光照/OCR/音乐/风险）
 *   LLM —— 基于 VLM 结果做可行性推理 + 剧情走向暗示
 */
import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, Select, message, Divider, Alert } from 'antd';

import { loadRecreationAiConfig, saveRecreationAiConfig, type RecreationAiConfig } from './aiConfigStore';
import { loadSettings } from '../../store/globalStore';
import { listConfiguredModelSelectOptions } from '../../providers/channel/resolver';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (cfg: RecreationAiConfig) => void;
}

type Option = { value: string; label: string };

export const AiConfigModal: React.FC<Props> = ({ open, onClose, onSaved }) => {
  const [config, setConfig] = useState<RecreationAiConfig | null>(null);
  const [llmOptions, setLlmOptions] = useState<Option[]>([]);
  const [ttsOptions, setTtsOptions] = useState<Option[]>([]);
  const [ttiOptions, setTtiOptions] = useState<Option[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([loadRecreationAiConfig(), loadSettings()])
      .then(([cfg, settings]) => {
        if (cancelled) return;
        setConfig(cfg);
        if (settings) {
          const llmOpts = listConfiguredModelSelectOptions(settings, 'llm', 'llm.chat').map((c) => ({
            value: c.value, label: `${c.channelLabel} / ${c.modelLabel}`,
          }));
          const ttsOpts = listConfiguredModelSelectOptions(settings, 'tts', 'speech.text-to-speech').map((c) => ({
            value: c.value, label: `${c.channelLabel} / ${c.modelLabel}`,
          }));
          const ttiOpts = listConfiguredModelSelectOptions(settings, 'tti', 'image.text-to-image').map((c) => ({
            value: c.value, label: `${c.channelLabel} / ${c.modelLabel}`,
          }));
          setLlmOptions(llmOpts);
          setTtsOptions(ttsOpts);
          setTtiOptions(ttiOpts);
          // 缺省值兜底
          setConfig((prev) => {
            if (!prev) return prev;
            const next = { ...prev };
            if (!next.channelKey && llmOpts.length > 0) next.channelKey = llmOpts[0].value;
            if (!next.ttsSelection && ttsOpts.length > 0) next.ttsSelection = ttsOpts[0].value;
            if (!next.ttiSelection && ttiOpts.length > 0) next.ttiSelection = ttiOpts[0].value;
            return next;
          });
        }
      })
      .catch((err) => message.error(`加载失败：${err instanceof Error ? err.message : String(err)}`));
    return () => { cancelled = true; };
  }, [open]);

  const update = (patch: Partial<RecreationAiConfig>) => {
    setConfig((prev) => (prev ? { ...prev, ...patch } : prev));
  };
  const updateModel = (k: keyof RecreationAiConfig['models'], v: string) => {
    setConfig((prev) => (prev ? { ...prev, models: { ...prev.models, [k]: v } } : prev));
  };

  const onOk = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await saveRecreationAiConfig(config);
      message.success('已保存');
      onSaved(config);
      onClose();
    } catch (err) {
      message.error(`保存失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="二创 AI 能力配置"
      width={520}
      onCancel={onClose}
      onOk={onOk}
      okText="保存"
      cancelText="取消"
      confirmLoading={saving}
      destroyOnHidden
    >
      {!config ? (
        <div style={{ padding: 40, textAlign: 'center' }}>加载中…</div>
      ) : (
        <Form layout="vertical">
          <Alert
            type="info"
            showIcon
            message="多模态模型一站式：VLM 看图同时识别人物 / 场景 / 镜头 / 服装 / 动作 / 光照 / OCR 屏内文字 / 风险等；LLM 单独负责可行性推理"
            style={{ marginBottom: 16 }}
          />
          <Form.Item label="基础 LLM Channel" extra="VLM 诊断 + LLM 可行性推理共用此 channel；TTS / TTI 各自单选">
            <Select
              value={config.channelKey}
              onChange={(v) => update({ channelKey: v })}
              options={llmOptions}
              placeholder={llmOptions.length === 0 ? '先去设置里配置一个 LLM 渠道' : '选择 LLM Channel'}
              notFoundContent="无可用 LLM 渠道"
            />
          </Form.Item>

          <Form.Item label="TTS Channel（配音用）" extra="language_dub 修改单合成新音轨；选择后可使用「多语言本地化」">
            <Select
              value={config.ttsSelection}
              onChange={(v) => update({ ttsSelection: v })}
              options={ttsOptions}
              placeholder={ttsOptions.length === 0 ? '先去设置里配置一个 TTS 渠道' : '选择 TTS Channel'}
              notFoundContent="无可用 TTS 渠道（缺省可用 EdgeTTS 免费）"
              allowClear
            />
          </Form.Item>

          <Form.Item label="TTI Channel（逐帧重绘用）" extra="stylization / wardrobe 修改单逐帧调 TTI 重绘；30 秒视频 ≈ 60 张图，耗时和成本注意">
            <Select
              value={config.ttiSelection}
              onChange={(v) => update({ ttiSelection: v })}
              options={ttiOptions}
              placeholder={ttiOptions.length === 0 ? '先去设置里配置一个 TTI 渠道' : '选择 TTI Channel'}
              notFoundContent="无可用 TTI 渠道"
              allowClear
            />
          </Form.Item>

          <Divider style={{ margin: '12px 0' }}>模型名（仅 VLM / LLM 需要手填）</Divider>

          <Form.Item label="VLM 多模态模型" extra="看图 + 一次性输出 10+ 维度（人物/场景/镜头/服装/动作/光照/OCR/音乐/风险）">
            <Input
              value={config.models.vlm ?? ''}
              onChange={(e) => updateModel('vlm', e.target.value)}
              placeholder="gpt-5.5"
            />
          </Form.Item>

          <Form.Item label="LLM 推理模型" extra="基于 VLM 结果做修改可行性分析、剧情走向暗示">
            <Input
              value={config.models.llm ?? ''}
              onChange={(e) => updateModel('llm', e.target.value)}
              placeholder="glm-5"
            />
          </Form.Item>
        </Form>
      )}
    </Modal>
  );
};
