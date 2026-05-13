/**
 * ReportTab — R4 二创：12 维度诊断报告浏览
 *
 * 数据源：episode.metadata_json.diagnosis（由 VideoDiagnosisService 写入）
 *
 * 当前展示：
 *   - 12 维度状态导航（status / coverage）
 *   - 摘要文本 + 关键计数
 *   - 风险标记列表
 *   - 修改可行性表格
 *
 * 任意行右侧 "+ 改造" 按钮可弹 QuickAddDrawer 加入修改单。
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Card, Tag, Button, Empty, Drawer, Form, Select, Radio, ColorPicker, message, Spin, Input } from 'antd';
import {
  FileBarChart, Users, MapPin, Film, MessageSquare, Shirt, Activity, Sun,
  Type, Music, AlertTriangle, CheckSquare, Plus, ShoppingCart, Sparkles, Copy,
} from 'lucide-react';

import { useRecreationStore } from '../recreationStore';
import { DIMENSION_LABEL, MODIFICATION_LABEL } from '../mockData';
import { toKomaLocalUrl } from '../../../utils/urlUtils';
import type { DimensionKind, ModificationItem, ModificationKind } from '../types';

function getApi(): any {
  return (window as any).electronAPI?.recreationVideos;
}

const FrameStrip: React.FC<{
  framesIndex: number[] | undefined;
  sampledFrames: string[];
  fallbackCount?: number;
  size?: number;
}> = ({ framesIndex, sampledFrames, fallbackCount = 4, size = 80 }) => {
  const valid = (framesIndex ?? [])
    .filter((i) => i >= 0 && i < sampledFrames.length);
  const indices = valid.length > 0
    ? valid
    : sampledFrames.slice(0, fallbackCount).map((_, i) => i);
  if (indices.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
      {indices.map((idx) => (
        <Thumb key={idx} framePath={sampledFrames[idx]} index={idx} size={size} />
      ))}
    </div>
  );
};

const Thumb: React.FC<{
  framePath: string;
  index: number;
  highlight?: boolean;
  size?: number;
  badge?: string;
}> = ({ framePath, index, highlight, size = 96, badge }) => (
  <div
    style={{
      position: 'relative',
      width: size,
      height: Math.round(size * 9 / 16),
      borderRadius: 4,
      overflow: 'hidden',
      flexShrink: 0,
      border: highlight ? '2px solid #4d6fff' : '1px solid #eee',
      background: '#000',
    }}
  >
    <img
      src={toKomaLocalUrl(framePath)}
      alt={`frame ${index}`}
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      onError={(e) => {
        (e.currentTarget.style as any).opacity = '0.3';
      }}
    />
    <div
      style={{
        position: 'absolute', left: 4, bottom: 4,
        background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10,
        padding: '1px 5px', borderRadius: 3, fontFamily: 'monospace',
      }}
    >
      #{index}{badge ? ` · ${badge}` : ''}
    </div>
  </div>
);

const DIMENSION_ICONS: Record<DimensionKind, React.ReactNode> = {
  meta:        <FileBarChart size={14} />,
  character:   <Users size={14} />,
  scene:       <MapPin size={14} />,
  shot:        <Film size={14} />,
  script:      <MessageSquare size={14} />,
  wardrobe:    <Shirt size={14} />,
  action:      <Activity size={14} />,
  lighting:    <Sun size={14} />,
  ocr:         <Type size={14} />,
  music:       <Music size={14} />,
  risk:        <AlertTriangle size={14} />,
  prompts:     <Sparkles size={14} />,
  feasibility: <CheckSquare size={14} />,
};

interface DimensionStatus {
  status: 'ok' | 'partial' | 'failed' | 'skipped';
  coverage: number;
  modelUsed?: string;
  note?: string;
}

interface CharacterLite { description: string; appearance?: string; framesIndex?: number[] }
interface SceneLite     { kind: string; daytime: string; desc: string; framesIndex?: number[] }
interface RiskMarkLite  { kind: string; frameIndex: number; severity: number }
interface DescWithFrames { text: string; framesIndex?: number[] }

interface DiagnosticReportPayload {
  schemaVersion: string;
  videoId: string;
  generatedAt: number;
  summary: string;
  dimensions: Record<DimensionKind, DimensionStatus>;
  characters: CharacterLite[];
  scenes: SceneLite[];
  shotsDesc?: DescWithFrames;
  wardrobeDesc?: DescWithFrames;
  actionDesc?: DescWithFrames;
  lightingDesc?: DescWithFrames;
  scriptHintFromVisual?: DescWithFrames;
  risks: RiskMarkLite[];
  ocrTexts?: Array<{ frameIndex: number; text: string }>;
  musicMood?: { mood: string; energy: number; note?: string; framesIndex?: number[] };
  framePrompts?: Array<{ frameIndex: number; prompt: string }>;
  feasibilityHint?: string;
  sampledFrames: string[];
}

// —— QuickAdd 抽屉 ——————————————————————————————————————————————————

interface QuickAddPayload {
  kind: ModificationKind;
  scopeText: string;
  shotCount: number;
  /** face_swap 时：被替换角色的原描述（来自 VLM characters[i].description） */
  originalCharacter?: string;
}

const CHARACTER_PRESETS: Array<{ key: string; label: string; desc: string }> = [
  { key: 'sword_silver', label: '银发女剑客', desc: '银白色长发、红色瞳孔、冷艳气质、轻甲战士装' },
  { key: 'cat_pink', label: '粉发猫娘', desc: '粉色双马尾、猫耳、灵动活泼、JK 校服' },
  { key: 'mage_purple', label: '紫袍法师', desc: '紫色长发、月牙额饰、神秘冷艳、紫袍法袍' },
  { key: 'tan_warrior', label: '小麦色女战士', desc: '小麦色皮肤、黑色短发、健朗有力、皮甲狩猎装' },
  { key: 'gothic_white', label: '哥特白发少女', desc: '白色长发、紫色眼瞳、忧郁神秘、黑色哥特蕾丝裙' },
];

const BODY_PRESETS: Array<{ key: 'micro' | 'slim' | 'normal' | 'curvy' | 'strong'; label: string }> = [
  { key: 'micro', label: '娇小' },
  { key: 'slim', label: '修长清瘦' },
  { key: 'normal', label: '标准' },
  { key: 'curvy', label: '丰满' },
  { key: 'strong', label: '健壮' },
];

const QuickAddDrawer: React.FC<{
  open: boolean;
  payload: QuickAddPayload | null;
  onClose: () => void;
}> = ({ open, payload, onClose }) => {
  const addItem = useRecreationStore((s) => s.addModificationItem);
  const setTab = useRecreationStore((s) => s.setTab);
  const [kind, setKind] = useState<ModificationKind>('aspect_ratio');
  const [qualityTier, setQualityTier] = useState<'lite' | 'pro'>('lite');
  const [targetLang, setTargetLang] = useState('en');
  const [targetColor, setTargetColor] = useState('#a83232');
  const [wardrobeMode, setWardrobeMode] = useState<'recolor' | 'replace'>('replace');
  const [targetRatio, setTargetRatio] = useState<'16:9' | '9:16' | '1:1' | '4:3' | '3:4'>('9:16');
  const [aspectMode, setAspectMode] = useState<'fit' | 'fill'>('fit');
  const [stylePreset, setStylePreset] = useState<'anime' | 'oil' | 'ink' | 'pixel' | 'cyberpunk'>('anime');
  const [styleStrength, setStyleStrength] = useState<'low' | 'mid' | 'high'>('mid');
  const [dubText, setDubText] = useState('');
  const [targetCharacter, setTargetCharacter] = useState('');
  const [targetBody, setTargetBody] = useState<'micro' | 'slim' | 'normal' | 'curvy' | 'strong'>('normal');

  const UNSUPPORTED: ReadonlySet<ModificationKind> = new Set([
    // 已全部接入逐帧 TTI 管线，不再禁用
  ]);
  const unsupported = UNSUPPORTED.has(kind);

  useEffect(() => {
    if (payload) setKind(payload.kind);
  }, [payload]);

  if (!payload) return null;

  const onConfirm = (): void => {
    const item: ModificationItem = {
      itemId: `i-${Date.now()}`,
      kind,
      scopeText: payload.scopeText,
      shotCount: payload.shotCount,
      params:
        kind === 'face_swap'
          ? { qualityTier, targetCharacter, originalCharacter: payload.originalCharacter ?? '' }
          : kind === 'body_reshape'
          ? { targetBody }
          : kind === 'language_dub' ? { targetLang, dubText } :
          kind === 'wardrobe' ? { mode: wardrobeMode, targetColorHex: targetColor } :
          kind === 'aspect_ratio' ? { targetRatio, mode: aspectMode } :
          kind === 'stylization' ? { preset: stylePreset, strength: styleStrength } :
          {},
      estUnits: payload.shotCount * 2,
      estDurationSec: payload.shotCount * 60,
      feasibilityScore: unsupported ? 0.2 : 0.85,
    };
    addItem(item);
    message.success(`已加入修改单：${MODIFICATION_LABEL[kind]} · ${payload.scopeText}`);
    onClose();
    setTab('cart');
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={420}
      title="加入修改单"
      extra={
        <Button type="primary" onClick={onConfirm} disabled={unsupported}>
          {unsupported ? '当前不可用' : '加入修改单'}
        </Button>
      }
    >
      <Form layout="vertical">
        <Form.Item label="修改类型">
          <Select
            value={kind}
            onChange={(v) => setKind(v as ModificationKind)}
            options={(Object.keys(MODIFICATION_LABEL) as ModificationKind[]).map((k) => {
              const dis = UNSUPPORTED.has(k);
              return {
                value: k,
                label: dis ? `${MODIFICATION_LABEL[k]} · 本期未启用` : MODIFICATION_LABEL[k],
                disabled: dis,
              };
            })}
          />
          {unsupported && (
            <div style={{ marginTop: 6, fontSize: 12, color: '#d4380d' }}>
              当前未配置 {MODIFICATION_LABEL[kind]} 的算力 channel，请联系管理员
            </div>
          )}
        </Form.Item>
        <Form.Item label="应用范围">
          <Card size="small" style={{ background: '#f6f8fc', border: 'none' }}>
            <div style={{ fontSize: 13 }}>{payload.scopeText}</div>
            <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', marginTop: 4 }}>
              涉及 {payload.shotCount} 个镜头
            </div>
          </Card>
        </Form.Item>

        {kind === 'face_swap' && (
          <>
            {payload.originalCharacter && (
              <Form.Item label="原角色">
                <Card size="small" style={{ background: '#fafafa', border: 'none' }}>
                  <div style={{ fontSize: 13 }}>{payload.originalCharacter}</div>
                </Card>
              </Form.Item>
            )}
            <Form.Item label="新角色描述（抽卡）" required>
              <Input.TextArea
                value={targetCharacter}
                onChange={(e) => setTargetCharacter(e.target.value)}
                rows={3}
                placeholder="例：银白色长发、红色瞳孔、轻甲战士装、冷艳气质"
              />
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {CHARACTER_PRESETS.map((p) => (
                  <Button
                    key={p.key}
                    size="small"
                    onClick={() => setTargetCharacter(p.desc)}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(0,0,0,0.45)' }}>
                注：用逐帧 TTI 重绘，保留姿势/动作/构图/服装；新旧角色相差越大、帧间一致性越差
              </div>
            </Form.Item>
            <Form.Item label="质量档位">
              <Radio.Group value={qualityTier} onChange={(e) => setQualityTier(e.target.value)}>
                <Radio.Button value="lite">Lite</Radio.Button>
                <Radio.Button value="pro">Pro</Radio.Button>
              </Radio.Group>
            </Form.Item>
          </>
        )}
        {kind === 'body_reshape' && (
          <Form.Item label="目标体型">
            <Radio.Group value={targetBody} onChange={(e) => setTargetBody(e.target.value)}>
              {BODY_PRESETS.map((b) => (
                <Radio.Button key={b.key} value={b.key}>{b.label}</Radio.Button>
              ))}
            </Radio.Group>
            <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(0,0,0,0.45)' }}>
              注：保留脸/发型/服装/姿势，只改身材比例
            </div>
          </Form.Item>
        )}
        {kind === 'language_dub' && (
          <>
            <Form.Item label="目标语言">
              <Select
                value={targetLang}
                onChange={setTargetLang}
                options={[
                  { value: 'en', label: '英语' },
                  { value: 'ja', label: '日语' },
                  { value: 'ko', label: '韩语' },
                  { value: 'fr', label: '法语' },
                  { value: 'es', label: '西班牙语' },
                  { value: 'zh', label: '中文（重配）' },
                ]}
              />
            </Form.Item>
            <Form.Item label="配音文本" required>
              <Input.TextArea
                value={dubText}
                onChange={(e) => setDubText(e.target.value)}
                rows={5}
                placeholder="直接写要配的台词，将整段合成后替换源视频音轨"
              />
              <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(0,0,0,0.45)' }}>
                注：本期不做台词时间轴对齐，整段一口气配完盖到视频音轨上；适合纯解说类短片
              </div>
            </Form.Item>
          </>
        )}
        {kind === 'wardrobe' && (
          <>
            <Form.Item label="替换模式">
              <Radio.Group value={wardrobeMode} onChange={(e) => setWardrobeMode(e.target.value)}>
                <Radio.Button value="recolor">仅换色</Radio.Button>
                <Radio.Button value="replace">换款</Radio.Button>
              </Radio.Group>
            </Form.Item>
            <Form.Item label="目标颜色">
              <ColorPicker value={targetColor} onChange={(c) => setTargetColor(c.toHexString())} />
            </Form.Item>
            <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)' }}>
              注：当前 wardrobe 用逐帧 TTI 重绘，帧间会有闪烁，适合短片段
            </div>
          </>
        )}
        {kind === 'aspect_ratio' && (
          <>
            <Form.Item label="目标比例">
              <Radio.Group value={targetRatio} onChange={(e) => setTargetRatio(e.target.value)}>
                <Radio.Button value="9:16">9:16 竖屏</Radio.Button>
                <Radio.Button value="1:1">1:1 方形</Radio.Button>
                <Radio.Button value="16:9">16:9 横屏</Radio.Button>
                <Radio.Button value="4:3">4:3</Radio.Button>
                <Radio.Button value="3:4">3:4</Radio.Button>
              </Radio.Group>
            </Form.Item>
            <Form.Item label="适配方式">
              <Radio.Group value={aspectMode} onChange={(e) => setAspectMode(e.target.value)}>
                <Radio.Button value="fit">保留全部画面 + 黑边</Radio.Button>
                <Radio.Button value="fill">居中裁剪填满</Radio.Button>
              </Radio.Group>
            </Form.Item>
          </>
        )}
        {kind === 'stylization' && (
          <>
            <Form.Item label="风格预设">
              <Select
                value={stylePreset}
                onChange={setStylePreset}
                options={[
                  { value: 'anime', label: '动漫' },
                  { value: 'oil', label: '油画' },
                  { value: 'ink', label: '水墨' },
                  { value: 'pixel', label: '像素风' },
                  { value: 'cyberpunk', label: '赛博朋克' },
                ]}
              />
            </Form.Item>
            <Form.Item label="风格化强度">
              <Radio.Group value={styleStrength} onChange={(e) => setStyleStrength(e.target.value)}>
                <Radio.Button value="low">弱</Radio.Button>
                <Radio.Button value="mid">中</Radio.Button>
                <Radio.Button value="high">强</Radio.Button>
              </Radio.Group>
            </Form.Item>
            <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)' }}>
              注：当前用逐帧 TTI 重绘，帧间一致性差，仅适合预览
            </div>
          </>
        )}
      </Form>
    </Drawer>
  );
};

// —— 主组件 ——————————————————————————————————————————————————

export const ReportTab: React.FC = () => {
  const activeVideoId = useRecreationStore((s) => s.activeVideoId);
  const setTab = useRecreationStore((s) => s.setTab);
  const cartCount = useRecreationStore((s) => s.activePlan.items.length);

  const [report, setReport] = useState<DiagnosticReportPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeDim, setActiveDim] = useState<DimensionKind>('meta');
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddPayload, setQuickAddPayload] = useState<QuickAddPayload | null>(null);

  useEffect(() => {
    if (!activeVideoId) {
      setReport(null);
      return;
    }
    const api = getApi();
    if (!api) {
      setReport(null);
      return;
    }
    setLoading(true);
    api.loadDiagnosis(activeVideoId)
      .then((d: DiagnosticReportPayload | null) => setReport(d))
      .catch(() => setReport(null))
      .finally(() => setLoading(false));
  }, [activeVideoId]);

  const onAdd = (p: QuickAddPayload): void => {
    setQuickAddPayload(p);
    setQuickAddOpen(true);
  };

  if (!activeVideoId) {
    return (
      <Empty
        description={
          <div>
            <div style={{ fontSize: 14, marginBottom: 4 }}>请先选择视频</div>
            <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
              到「视频库」Tab 选择一个视频查看诊断报告
            </div>
          </div>
        }
      >
        <Button type="primary" onClick={() => setTab('overview')}>返回视频库</Button>
      </Empty>
    );
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>;
  }

  if (!report) {
    return (
      <Empty
        description={
          <div>
            <div style={{ fontSize: 14, marginBottom: 4 }}>该视频尚未生成诊断报告</div>
            <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
              到「视频库」Tab 点击 AI 解析 触发诊断
            </div>
          </div>
        }
      >
        <Button onClick={() => setTab('overview')}>返回视频库</Button>
      </Empty>
    );
  }

  const dims = Object.entries(report.dimensions) as Array<[DimensionKind, DimensionStatus]>;

  const renderDim = (): React.ReactNode => {
    // 维度级状态优先：skipped / failed 不进入业务渲染
    if (activeDim !== 'meta') {
      const info = report.dimensions[activeDim];
      if (info?.status === 'skipped') {
        return (
          <Empty
            description={
              <div>
                <div style={{ fontSize: 14, marginBottom: 4 }}>{DIMENSION_LABEL[activeDim]} 未启用</div>
                <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
                  {info.note ?? '本次解析未启用此能力'}
                </div>
              </div>
            }
          />
        );
      }
      if (info?.status === 'failed') {
        return (
          <Empty
            description={
              <div>
                <div style={{ fontSize: 14, marginBottom: 4, color: '#d4380d' }}>{DIMENSION_LABEL[activeDim]} 解析失败</div>
                <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
                  {info.note ?? '未知错误'}
                  {info.modelUsed && <> · model: {info.modelUsed}</>}
                </div>
              </div>
            }
          />
        );
      }
    }
    switch (activeDim) {
      case 'meta':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Card>
              <p style={{ fontSize: 15, marginBottom: 12 }}>{report.summary || '（VLM 未给出整体总结）'}</p>
              <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.65)' }}>
                <div>识别角色：<strong>{report.characters.length}</strong></div>
                <div>识别场景：<strong>{report.scenes.length}</strong></div>
                <div>抽样帧数：<strong>{report.sampledFrames.length}</strong></div>
                <div>风险点数：<strong>{report.risks.length}</strong></div>
              </div>
              <div style={{ marginTop: 12, fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
                生成于 {new Date(report.generatedAt).toLocaleString()}
              </div>
            </Card>
            {report.sampledFrames.length > 0 && (
              <Card title="抽样帧" size="small">
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                  {report.sampledFrames.map((p, i) => (
                    <Thumb key={p} framePath={p} index={i} size={140} />
                  ))}
                </div>
              </Card>
            )}
          </div>
        );
      case 'character':
        if (report.characters.length === 0) {
          return <Empty description="VLM 未识别出角色" />;
        }
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {report.characters.map((c, i) => (
              <Card
                key={i}
                size="small"
                title={`角色 ${i + 1}`}
                extra={
                  <Button
                    size="small"
                    type="link"
                    icon={<Plus size={12} />}
                    onClick={() =>
                      onAdd({
                        kind: 'face_swap',
                        scopeText: c.description.slice(0, 30),
                        shotCount: (c.framesIndex?.length ?? 0) || 1,
                        originalCharacter: c.description,
                      })
                    }
                  >
                    换脸
                  </Button>
                }
              >
                <div style={{ fontSize: 13 }}>{c.description}</div>
                {c.appearance && (
                  <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.55)', marginTop: 4 }}>
                    外貌：{c.appearance}
                  </div>
                )}
                {c.framesIndex && c.framesIndex.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)', marginBottom: 4 }}>
                      出现于帧 {c.framesIndex.join(', ')}
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {c.framesIndex
                        .filter((idx) => idx >= 0 && idx < report.sampledFrames.length)
                        .map((idx) => (
                          <Thumb
                            key={idx}
                            framePath={report.sampledFrames[idx]}
                            index={idx}
                            size={72}
                          />
                        ))}
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        );
      case 'scene':
        if (report.scenes.length === 0) return <Empty description="VLM 未识别出场景" />;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {report.scenes.map((s, i) => (
              <Card key={i} size="small" styles={{ body: { padding: 12 } }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <Tag>{s.kind}</Tag>
                  <Tag color="blue">{s.daytime}</Tag>
                  <div style={{ flex: 1 }}>{s.desc}</div>
                </div>
                <FrameStrip framesIndex={s.framesIndex} sampledFrames={report.sampledFrames} size={72} />
              </Card>
            ))}
          </div>
        );
      case 'shot':
        if (!report.shotsDesc?.text) return <Empty description="VLM 未给出镜头风格描述" />;
        return (
          <Card>
            <div style={{ fontSize: 13, lineHeight: 1.8 }}>{report.shotsDesc.text}</div>
            <FrameStrip framesIndex={report.shotsDesc.framesIndex} sampledFrames={report.sampledFrames} />
          </Card>
        );
      case 'script': {
        const hint = report.scriptHintFromVisual;
        if (!hint?.text) return <Empty description="VLM 未给出剧情暗示" />;
        return (
          <Card>
            <div style={{ fontSize: 13, lineHeight: 1.8, marginBottom: 12 }}>{hint.text}</div>
            <FrameStrip framesIndex={hint.framesIndex} sampledFrames={report.sampledFrames} />
            <Button
              size="small"
              icon={<Plus size={14} />}
              style={{ marginTop: 12 }}
              onClick={() => onAdd({ kind: 'language_dub', scopeText: '全片本地化', shotCount: 1 })}
            >
              全片本地化
            </Button>
          </Card>
        );
      }
      case 'action':
        if (!report.actionDesc?.text) return <Empty description="VLM 未给出动作 / 节奏描述" />;
        return (
          <Card>
            <div style={{ fontSize: 13, lineHeight: 1.8 }}>{report.actionDesc.text}</div>
            <FrameStrip framesIndex={report.actionDesc.framesIndex} sampledFrames={report.sampledFrames} />
          </Card>
        );
      case 'lighting':
        if (!report.lightingDesc?.text) return <Empty description="VLM 未给出光照描述" />;
        return (
          <Card>
            <div style={{ fontSize: 13, lineHeight: 1.8 }}>{report.lightingDesc.text}</div>
            <FrameStrip framesIndex={report.lightingDesc.framesIndex} sampledFrames={report.sampledFrames} />
          </Card>
        );
      case 'music':
        if (!report.musicMood) return <Empty description="VLM 未给出音乐情绪推断" />;
        return (
          <Card>
            <div style={{ fontSize: 13, lineHeight: 1.8 }}>
              <div>情绪：<strong>{report.musicMood.mood}</strong></div>
              <div>能量：<strong>{(report.musicMood.energy * 100).toFixed(0)}</strong></div>
              {report.musicMood.note && <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(0,0,0,0.55)' }}>{report.musicMood.note}</div>}
              <FrameStrip framesIndex={report.musicMood.framesIndex} sampledFrames={report.sampledFrames} />
              <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(0,0,0,0.45)' }}>
                注：基于画面情绪推断；非真实音频识别
              </div>
            </div>
          </Card>
        );
      case 'prompts': {
        const fps = (report.framePrompts ?? [])
          .filter((fp) => fp.frameIndex >= 0 && fp.frameIndex < report.sampledFrames.length);
        if (fps.length === 0) return <Empty description="VLM 未给出逐帧提示词" />;
        const copyOne = async (text: string): Promise<void> => {
          try {
            await navigator.clipboard.writeText(text);
            message.success('已复制');
          } catch {
            message.error('复制失败');
          }
        };
        const copyAll = async (): Promise<void> => {
          const text = fps.map((fp) => `Frame #${fp.frameIndex}\n${fp.prompt}`).join('\n\n');
          try {
            await navigator.clipboard.writeText(text);
            message.success(`已复制 ${fps.length} 条`);
          } catch {
            message.error('复制失败');
          }
        };
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button size="small" icon={<Copy size={12} />} onClick={copyAll}>
                复制全部 ({fps.length})
              </Button>
            </div>
            {fps.map((fp) => (
              <Card key={fp.frameIndex} size="small" styles={{ body: { padding: 12 } }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <Thumb framePath={report.sampledFrames[fp.frameIndex]} index={fp.frameIndex} size={140} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {fp.prompt}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <Button size="small" icon={<Copy size={12} />} onClick={() => copyOne(fp.prompt)}>
                        复制提示词
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        );
      }
      case 'feasibility':
        if (!report.feasibilityHint) return <Empty description="未配置 LLM，无可行性分析" />;
        return (
          <Card>
            <div style={{ fontSize: 13, lineHeight: 1.8, marginBottom: 12 }}>{report.feasibilityHint}</div>
            <FrameStrip framesIndex={undefined} sampledFrames={report.sampledFrames} fallbackCount={8} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <Button
                size="small"
                icon={<Plus size={14} />}
                onClick={() =>
                  onAdd({
                    kind: 'face_swap',
                    scopeText: '全片换脸',
                    shotCount: report.sampledFrames.length || 8,
                    originalCharacter: report.characters.map((c) => c.description).join('；'),
                  })
                }
              >
                + 换脸
              </Button>
              <Button size="small" icon={<Plus size={14} />} onClick={() => onAdd({ kind: 'wardrobe', scopeText: '全片服装替换', shotCount: report.sampledFrames.length || 8 })}>
                + 服装替换
              </Button>
              <Button size="small" icon={<Plus size={14} />} onClick={() => onAdd({ kind: 'language_dub', scopeText: '多语言本地化', shotCount: 1 })}>
                + 多语言
              </Button>
              <Button size="small" icon={<Plus size={14} />} onClick={() => onAdd({ kind: 'aspect_ratio', scopeText: '横竖屏适配', shotCount: 1 })}>
                + 横竖屏
              </Button>
            </div>
          </Card>
        );
      case 'wardrobe':
        if (!report.wardrobeDesc?.text) return <Empty description="VLM 未给出服装描述" />;
        return (
          <Card>
            <div style={{ fontSize: 13, lineHeight: 1.8, marginBottom: 12 }}>{report.wardrobeDesc.text}</div>
            <FrameStrip framesIndex={report.wardrobeDesc.framesIndex} sampledFrames={report.sampledFrames} />
            <Button
              size="small"
              icon={<Plus size={14} />}
              style={{ marginTop: 12 }}
              onClick={() => onAdd({ kind: 'wardrobe', scopeText: '服装替换', shotCount: 1 })}
            >
              服装替换
            </Button>
          </Card>
        );
      case 'ocr':
        if (!report.ocrTexts || report.ocrTexts.length === 0) {
          return <Empty description="画面中未识别出明显文字" />;
        }
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {report.ocrTexts.map((t, i) => {
              const validIdx = t.frameIndex >= 0 && t.frameIndex < report.sampledFrames.length;
              return (
                <Card key={i} size="small" styles={{ body: { padding: 12 } }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {validIdx && (
                      <Thumb framePath={report.sampledFrames[t.frameIndex]} index={t.frameIndex} size={72} />
                    )}
                    <div style={{ flex: 1, fontSize: 13 }}>{t.text}</div>
                  </div>
                </Card>
              );
            })}
          </div>
        );
      case 'risk':
        if (report.risks.length === 0) return <Empty description="无显著风险" />;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {report.risks.map((r, i) => {
              const color = r.severity > 0.7 ? 'error' : r.severity > 0.4 ? 'warning' : 'default';
              const validIdx = r.frameIndex >= 0 && r.frameIndex < report.sampledFrames.length;
              return (
                <Card key={i} size="small" styles={{ body: { padding: 12 } }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {validIdx && (
                      <Thumb
                        framePath={report.sampledFrames[r.frameIndex]}
                        index={r.frameIndex}
                        size={88}
                        highlight
                      />
                    )}
                    <Tag color={color as 'error' | 'warning' | 'default'}>{r.kind}</Tag>
                    <div style={{ flex: 1, fontSize: 12, color: 'rgba(0,0,0,0.55)' }}>
                      帧 #{r.frameIndex}
                    </div>
                    <div style={{ color: 'rgba(0,0,0,0.55)', fontSize: 12 }}>
                      严重度 {(r.severity * 100).toFixed(0)}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        );
    }
  };

  return (
    <div style={{ display: 'flex', gap: 16, height: '100%' }}>
      {/* 左侧维度导航 */}
      <div style={{ width: 200, flexShrink: 0, overflow: 'auto' }}>
        <Card size="small" styles={{ body: { padding: 6 } }}>
          {dims.map(([k, info]) => {
            const active = activeDim === k;
            return (
              <div
                key={k}
                onClick={() => setActiveDim(k)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: active ? '#eef2ff' : 'transparent',
                  color: active ? '#4d6fff' : 'rgba(0,0,0,0.75)',
                  marginBottom: 2,
                  fontSize: 13,
                }}
              >
                {DIMENSION_ICONS[k]}
                <span style={{ flex: 1 }}>{DIMENSION_LABEL[k]}</span>
                <span
                  style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: info.status === 'ok' ? '#52c41a'
                      : info.status === 'partial' ? '#faad14'
                      : info.status === 'skipped' ? '#bfbfbf'
                      : '#d4380d',
                  }}
                />
              </div>
            );
          })}
        </Card>
      </div>

      {/* 右侧主区 */}
      <div style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{DIMENSION_LABEL[activeDim]}</span>
            <span style={{ marginLeft: 8, fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
              覆盖率 {(report.dimensions[activeDim].coverage * 100).toFixed(0)}%
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              icon={<Plus size={14} />}
              onClick={() =>
                onAdd({
                  kind: 'face_swap',
                  scopeText: `全片换脸（${report.characters.length} 个角色）`,
                  shotCount: report.sampledFrames.length || 8,
                  originalCharacter: report.characters.map((c) => c.description).join('；'),
                })
              }
            >
              快速加：全片换脸
            </Button>
            <Button
              type="primary"
              icon={<ShoppingCart size={14} />}
              onClick={() => setTab('cart')}
            >
              去修改单 {cartCount > 0 ? `(${cartCount})` : ''}
            </Button>
          </div>
        </div>
        {renderDim()}
      </div>

      <QuickAddDrawer
        open={quickAddOpen}
        payload={quickAddPayload}
        onClose={() => setQuickAddOpen(false)}
      />
    </div>
  );
};
