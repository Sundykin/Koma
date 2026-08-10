/**
 * 项目设置侧边栏
 * 整合项目基本信息（项目名 / 题材 / 画面比例 / 风格）+ 媒体模型配置（LLM/TTI/ITV/TTS）
 * 通过抽屉形式从右侧滑出，作为项目工作台的统一配置入口
 */
import React, { useState, useEffect, useCallback } from 'react';
import { createLogger } from '../../store/logger';

const logger = createLogger('TTSPreview');
import {
  Drawer, Form, Input, Tabs, Select, Button, Space, Tag,
  App as AntApp,
  Slider,
} from 'antd';
import { PlayCircleOutlined, PauseCircleOutlined } from '@ant-design/icons';
import {
  KOMA_TTS_VOICES,
  KOMA_TTS_VOICE_CATEGORY_LABEL,
  type KomaTTSVoiceMeta,
} from '../../providers/tts';
import { getKomaTTSVoiceSampleUrl } from '../../services/komaTTSVoiceSamples';
import type { DramaGenreTags, MediaModelSelection, Project } from '../../types';
import { ProjectMediaSelector } from './ProjectMediaSelector';
import type { ProjectMediaCategoryKey, ProjectMediaRequirement } from './projectMediaSelectionState';
import {
  DEFAULT_THEME_PRESET_ID,
  createProjectStyleSnapshot,
  getAllThemePresets,
  type ThemePresetCatalogItem,
} from '../../config/themePresets';
import {
  formatSpecPromptHint,
  type VideoDurationSpec,
} from '../../providers/itv/durationSpec';
import { listCardsOfKind } from '../../store/templates/genreCards';
import styles from './ProjectSettingsModal.module.scss';

interface ProjectSettingsModalProps {
  project: Project | null;
  open: boolean;
  onClose: () => void;
  onSave: (updates: Partial<Project>) => void;
  onGoToGlobalSettings?: () => void;
  /**
   * 当前项目选择的 ITV 渠道时长规格（如 grok enum 6/12/16/20、即梦 range 4-15）。
   * 「视频提示词」页签用它展示"当前模型能出多长"，推理时的时长也按它吸附。
   */
  itvDurationSpec?: VideoDurationSpec;
}

export const ProjectSettingsModal: React.FC<ProjectSettingsModalProps> = ({
  project,
  open,
  onClose,
  onSave,
  onGoToGlobalSettings,
  itvDurationSpec,
}) => {
  const { message } = AntApp.useApp();
  const [form] = Form.useForm();
  const [activeTab, setActiveTab] = useState('basic');
  const [mediaSelections, setMediaSelections] = useState<
    Partial<Record<'llm' | 'tti' | 'itv' | 'tts', MediaModelSelection>>
  >({});
  const [themePresets, setThemePresets] = useState<ThemePresetCatalogItem[]>([]);

  // 短剧风格标签（三轴）：项目级，注入分镜拆解与提示词推理
  const [genreTags, setGenreTags] = useState<DramaGenreTags>({});
  const [analyzingTags, setAnalyzingTags] = useState(false);

  // TTS 项目级偏好（音色 + 语速）。默认 cherry / 1.2 倍速。
  const [ttsVoiceId, setTtsVoiceId] = useState<string>('cherry');
  const [ttsSpeed, setTtsSpeed] = useState<number>(1.2);
  const mediaRequirements: Partial<Record<ProjectMediaCategoryKey, ProjectMediaRequirement>> = {
    itv: {
      description: '项目视频链路会按文生视频、图生视频、参考生视频、首尾帧视频等实际能力继续校验；这里用于设置项目默认视频模型。',
    },
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    const loadThemePresets = async () => {
      const presets = await getAllThemePresets();
      if (!cancelled) {
        setThemePresets(presets);
      }
    };

    loadThemePresets();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (project && open) {
      form.setFieldsValue({
        title: project.title,
        genre: project.genre,
        stylePresetId: project.stylePresetId || project.styleSnapshot?.sourcePresetId || DEFAULT_THEME_PRESET_ID,
      });
      setMediaSelections(project.mediaSelections || {});
      setGenreTags(project.genreTags || {});
      // TTS 偏好：项目里有就用项目里的；缺省 cherry + 1.2 倍速
      setTtsVoiceId(typeof project.ttsVoiceId === 'string' && project.ttsVoiceId.trim()
        ? project.ttsVoiceId.trim()
        : 'cherry');
      setTtsSpeed(typeof project.ttsSpeed === 'number' && Number.isFinite(project.ttsSpeed)
        ? project.ttsSpeed
        : 1.2);
    }
  }, [project, open, form]);

  /** 用当前项目剧本自动判定三轴标签；结果只回填表单，保存时才落库。 */
  const handleAnalyzeTags = useCallback(async () => {
    if (!project?.id) return;
    setAnalyzingTags(true);
    try {
      const { listEpisodes } = await import('../../store/projectStore');
      const episodes = await listEpisodes(project.id);
      // 取前 3 集就够判题材调性了；全集喂进去只是烧 token
      const joined = episodes
        .slice(0, 3)
        .map(episode => (episode.scriptText || '').trim())
        .filter(Boolean)
        .join('\n\n');
      if (!joined) {
        message.warning('项目还没有剧本内容，无法自动分析；可以先手动选标签');
        return;
      }
      const { analyzeDramaGenreTags } = await import('../../services/DramaGenreAnalysisService');
      const analyzed = await analyzeDramaGenreTags(joined);
      setGenreTags(analyzed);
      message.success('风格标签分析完成，确认无误后点保存');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '风格标签分析失败');
    } finally {
      setAnalyzingTags(false);
    }
  }, [project?.id, message]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const stylePresetId = values.stylePresetId || DEFAULT_THEME_PRESET_ID;
      const styleSnapshot = await createProjectStyleSnapshot(stylePresetId);
      onSave({
        title: values.title,
        genre: values.genre,
        stylePresetId,
        styleSnapshot,
        theme: undefined,
        stylePrompt: undefined,
        mediaSelections,
        genreTags,
        ttsVoiceId,
        ttsSpeed,
      } as Partial<Project>);
      onClose();
    } catch {
      // 验证失败
    }
  };

  const tabItems = [
    {
      key: 'basic',
      label: '基本信息',
      children: (
        <Form form={form} layout="vertical">
          <Form.Item
            name="title"
            label="项目名称"
            required
            rules={[{ required: true, message: '请输入项目名称' }]}
          >
            <Input placeholder="请输入项目名称" />
          </Form.Item>

          <Form.Item name="genre" label="题材类型">
            <Input placeholder="如: 悬疑、爱情、科幻" />
          </Form.Item>

          <Form.Item label="画面比例">
            <Input
              value={project?.aspectRatio === '9:16' ? '9:16 竖屏' : '16:9 横屏'}
              disabled
              className={styles.disabledInput}
            />
          </Form.Item>

          <Form.Item
            name="stylePresetId"
            label="项目风格"
            rules={[{ required: true, message: '请选择项目风格' }]}
            extra="风格来源统一使用全局风格目录；如果要新增或编辑自定义风格，请前往全局设置。"
          >
            <Select
              placeholder="请选择项目风格"
              options={themePresets.map((preset) => ({
                value: preset.id,
                label: preset.name,
              }))}
            />
          </Form.Item>
        </Form>
      ),
    },
    {
      key: 'media',
      label: '媒体配置',
      children: (
        <>
          <div className={styles.tabIntro}>
            选择此项目使用的媒体生成服务，留空则使用全局默认配置。
          </div>
          <ProjectMediaSelector
            mediaSelections={mediaSelections}
            onChange={setMediaSelections}
            onGoToSettings={onGoToGlobalSettings}
            requirements={mediaRequirements}
          />
        </>
      ),
    },
    {
      key: 'genre-tags',
      label: '风格标签',
      children: (
        <GenreTagsTab
          value={genreTags}
          onChange={setGenreTags}
          analyzing={analyzingTags}
          onAnalyze={handleAnalyzeTags}
        />
      ),
    },
    {
      key: 'video-prompt',
      label: '视频提示词',
      children: <VideoPromptDurationTab itvDurationSpec={itvDurationSpec} />,
    },
    {
      key: 'tts',
      label: '配音',
      children: (
        <TTSPreferenceTab
          voiceId={ttsVoiceId}
          speed={ttsSpeed}
          onVoiceChange={setTtsVoiceId}
          onSpeedChange={setTtsSpeed}
        />
      ),
    },
  ];

  return (
    <Drawer
      title="项目设置"
      open={open}
      onClose={onClose}
      size={520}
      destroyOnHidden
      placement="right"
      mask={{ closable: false }}
      footer={
        <div className={styles.drawerFooter}>
          <Space>
            <Button onClick={onClose}>取消</Button>
            <Button type="primary" onClick={handleSave}>保存</Button>
          </Space>
        </div>
      }
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
      />
    </Drawer>
  );
};


/* ========== 短剧风格标签 Tab ========== */

interface GenreTagsTabProps {
  value: DramaGenreTags;
  onChange: (next: DramaGenreTags) => void;
  analyzing: boolean;
  onAnalyze: () => void;
}

/**
 * 三轴标签选择。刻意不做成一个扁平多选框——「科幻」是题材、「搞笑」「狗血」是调性、
 * 「重生」「系统」是装置，混在一起选会让用户以为它们互斥。
 */
const GenreTagsTab: React.FC<GenreTagsTabProps> = ({ value, onChange, analyzing, onAnalyze }) => {
  const options = (kind: 'genre' | 'tone' | 'device') =>
    listCardsOfKind(kind).map(card => ({
      value: card.name,
      label: card.aliases.length ? `${card.name}（${card.aliases.slice(0, 3).join('/')}）` : card.name,
    }));

  const patch = (next: Partial<DramaGenreTags>) =>
    // 用户手改后清掉分析时间戳：这套标签不再是"自动判定"的结果
    onChange({ ...value, ...next, analyzedAt: undefined });

  return (
    <>
      <div className={styles.tabIntro}>
        风格标签会注入到<strong>分镜拆解</strong>和<strong>图片 / 视频提示词推理</strong>：
        题材决定压力从哪来与集尾钩子往哪长，调性决定台词语气、动作幅度与镜头节奏，
        前提装置决定主角比别人多什么、代价是什么。三轴正交，可以组合。
      </div>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Button onClick={onAnalyze} loading={analyzing} block>
          {analyzing ? '分析中…' : '按项目剧本自动分析标签'}
        </Button>

        <Form layout="vertical">
          <Form.Item
            label="主题材（决定压力从哪来，只能选一个）"
            extra="按「这部戏的压力主要来自哪里」选，不要按题材词面匹配。"
          >
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="未设置"
              value={value.genre}
              options={options('genre')}
              onChange={(genre) => patch({ genre })}
            />
          </Form.Item>

          <Form.Item
            label="辅题材（最多 2 个，只借 1-2 条）"
            extra="确实存在第二套压力机制时才选；主要矛盾仍归主题材。"
          >
            <Select
              mode="multiple"
              maxCount={2}
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="通常不用填"
              value={value.subGenres || []}
              options={options('genre').filter(option => option.value !== value.genre)}
              onChange={(subGenres) => patch({ subGenres })}
            />
          </Form.Item>

          <Form.Item label="调性（决定台词与镜头怎么演，可多选）">
            <Select
              mode="multiple"
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="未设置"
              value={value.tones || []}
              options={options('tone')}
              onChange={(tones) => patch({ tones })}
            />
          </Form.Item>

          <Form.Item
            label="前提装置（主角比别人多什么，可多选、可为空）"
            extra="重生 / 系统 / 马甲这类不是题材，是叠加在题材之上的一层。"
          >
            <Select
              mode="multiple"
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="没有就留空"
              value={value.premiseDevices || []}
              options={options('device')}
              onChange={(premiseDevices) => patch({ premiseDevices })}
            />
          </Form.Item>
        </Form>

        {value.reason && (
          <div>
            <Tag color="blue">{value.analyzedAt ? '自动判定依据' : '上次判定依据（已手改）'}</Tag>
            <div style={{ marginTop: 6, color: 'var(--token-text-secondary)' }}>{value.reason}</div>
          </div>
        )}
        <div style={{ color: 'var(--token-text-tertiary)', fontSize: 12 }}>
          每张卡的正文可以在「设置 → Prompt 模板 → 风格标签卡」里直接改。
        </div>
      </Space>
    </>
  );
};

/* ========== TTS 偏好 Tab ========== */

interface TTSPreferenceTabProps {
  voiceId: string;
  speed: number;
  onVoiceChange: (id: string) => void;
  onSpeedChange: (speed: number) => void;
}

/** 按 category 分组生成 Select options（带分组标题） */
function buildVoiceGroups(): Array<{ label: string; options: Array<{ value: string; label: string; meta: KomaTTSVoiceMeta }> }> {
  const groups = new Map<string, KomaTTSVoiceMeta[]>();
  KOMA_TTS_VOICES.forEach((v) => {
    const arr = groups.get(v.category) || [];
    arr.push(v);
    groups.set(v.category, arr);
  });
  // 顺序固定：通用 → 多语种 → 精品 → 方言
  const order: KomaTTSVoiceMeta['category'][] = ['common', 'multilang', 'premium', 'dialect'];
  return order
    .filter((cat) => groups.has(cat))
    .map((cat) => ({
      label: KOMA_TTS_VOICE_CATEGORY_LABEL[cat],
      options: (groups.get(cat) || []).map((v) => ({
        value: v.id,
        label: v.name,
        meta: v,
      })),
    }));
}

const TTSPreferenceTab: React.FC<TTSPreferenceTabProps> = ({ voiceId, speed, onVoiceChange, onSpeedChange }) => {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string>('');
  /** 等待 onCanPlay 触发后真正开始播放的目标 voice id —— 修"切音色后第一次点击不响"的核心。 */
  const [pendingPlayId, setPendingPlayId] = useState<string | null>(null);
  const groups = React.useMemo(() => buildVoiceGroups(), []);

  const stopPreview = useCallback(() => {
    const el = audioRef.current;
    if (el) { el.pause(); el.currentTime = 0; }
    setPreviewingId(null);
    setPendingPlayId(null);
  }, []);

  // 卸载组件 → 立刻停掉（试听独立于 voiceId 选择，不再因切音色而 stop）
  useEffect(() => () => stopPreview(), [stopPreview]);

  /** 试听：解析 url → 写 state → audio canplay 后自动播放。
      之前用 rAF + 立刻 play() 的方案：第一次点（src 从空切到 url）时 audio 还在加载，
      play() 实际拿不到数据；第二次点时 audio 已 buffered，play() 立即工作 → 表现为"双击才响"。
      改成 onCanPlay 触发：src 加载就绪 → 同步 play()。 */
  const handlePreview = useCallback(async (sampleFile: string, id: string) => {
    if (previewingId === id) { stopPreview(); return; }
    const url = await getKomaTTSVoiceSampleUrl(sampleFile);
    if (!url) {
       
      logger.warn('无法解析音色样本路径', { sampleFile, id });
      return;
    }
    // 切换试听对象：标记 pending → 写新 src → audio 重新 load → onCanPlay 里 play
    setPendingPlayId(id);
    if (url === previewSrc) {
      // 同一 src 不会触发 onCanPlay（已在 buffer 里），手动 play
      const el = audioRef.current;
      if (el) {
        el.currentTime = 0;
        el.play()
          .then(() => setPreviewingId(id))
          .catch((err) => {
             
            logger.warn('play() 失败', err);
            setPreviewingId(null);
          })
          .finally(() => setPendingPlayId(null));
      }
    } else {
      setPreviewSrc(url);
    }
  }, [previewingId, previewSrc, stopPreview]);

  /** audio 元素发出 canplay：检查 pendingPlayId 是不是给我们的播放任务。 */
  const handleAudioCanPlay = useCallback(() => {
    const el = audioRef.current;
    if (!el || !pendingPlayId) return;
    const targetId = pendingPlayId;
    el.currentTime = 0;
    el.play()
      .then(() => setPreviewingId(targetId))
      .catch((err) => {
         
        logger.warn('canplay 后 play() 失败', err);
        setPreviewingId(null);
      })
      .finally(() => setPendingPlayId(null));
  }, [pendingPlayId]);

  /** 单条 voice option 渲染：左边名字（搜索匹配的），右边▶ / ⏸。
      onMouseDown stopPropagation —— antd Select 用 mousedown 触发选中，
      没拦住的话点试听会同时被识别成"选中这个 voice"。 */
  const renderOption = useCallback((meta: KomaTTSVoiceMeta) => {
    const isThisPlaying = previewingId === meta.id;
    return (
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="truncate flex-1 min-w-0">{meta.name}</span>
        <Button
          type="text"
          size="small"
          icon={isThisPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handlePreview(meta.sampleFile, meta.id);
          }}
        />
      </div>
    );
  }, [previewingId, handlePreview]);

  return (
    <div className={styles.tabIntro ? styles.tabIntro : ''}>
      <Form layout="vertical">
        <Form.Item label="默认配音音色" extra="生成分镜配音时使用的默认音色；下拉里每条右侧 ▶ 可独立试听">
          <Select
            style={{ width: '100%' }}
            showSearch
            optionFilterProp="label"
            value={voiceId}
            onChange={onVoiceChange}
            placeholder="请选择音色"
            options={groups.map((g) => ({
              label: g.label,
              title: g.label,
              options: g.options.map((o) => ({
                value: o.value,
                label: o.label,        // 仍提供文字 label 给搜索 / 收起态显示
                voiceMeta: o.meta,
              })),
            }))}
            optionRender={(option) => {
              const meta = (option.data as { voiceMeta?: KomaTTSVoiceMeta }).voiceMeta;
              return meta ? renderOption(meta) : <span>{option.label}</span>;
            }}
          />
        </Form.Item>

        <Form.Item label={`语速倍数：${speed.toFixed(2)}x`} extra="OpenAI 兼容 speed 字段，建议 0.5-2.0；新项目默认 1.2x">
          <Slider
            min={0.5}
            max={2}
            step={0.05}
            value={speed}
            onChange={onSpeedChange}
            marks={{ 0.5: '0.5x', 1: '1x', 1.2: '1.2x', 1.5: '1.5x', 2: '2x' }}
          />
        </Form.Item>

        <div style={{ fontSize: 12, color: 'var(--token-text-secondary)' }}>
          内置 {KOMA_TTS_VOICES.length} 种音色（通用 / 多语种 / 精品角色 / 中文方言），点选后右侧 ▶ 可试听样本。
        </div>

        {/* in-DOM <audio> — 用 React state 同步 src，避免 new Audio() 在 Electron koma-local 下
            "src 设置后 play() 拿不到数据" 的时序问题。preload="auto" 让 src 一变就开始拉流。
            onCanPlay 是关键：data 准备好后由我们驱动 play()，避免"切音色后必须双击"。 */}
        <audio
          ref={audioRef}
          src={previewSrc || undefined}
          preload="auto"
          onCanPlay={handleAudioCanPlay}
          onEnded={() => setPreviewingId(null)}
          onError={() => { setPreviewingId(null); setPendingPlayId(null); }}
          style={{ display: 'none' }}
        />
      </Form>
    </div>
  );
};

/**
 * 视频提示词时长说明（只读）。
 *
 * 早期这里是"时长档位勾选"：模板池写死 multi-ref [6,10,15,20] / first-frame
 * [6,10,16,20]，用户勾选启用哪几档，推理时把分镜时长吸附到最近的一档。结果是
 * 12 秒的镜头按 10 秒的协议推、25 秒按 20 秒推，模板里的"总时长 X 秒"跟实际下发
 * 给视频模型的时长对不上。现在档位整体取消，时长直接取分镜时长按模型 spec 吸附，
 * 这个页签只剩"当前模型能出多长"的说明。
 */
interface VideoPromptDurationTabProps {
  itvDurationSpec?: VideoDurationSpec;
}

const VideoPromptDurationTab: React.FC<VideoPromptDurationTabProps> = ({ itvDurationSpec }) => {
  const capability = itvDurationSpec
    ? formatSpecPromptHint(itvDurationSpec)
    : '未识别到当前项目视频模型的时长规格，推理会按 4–30 秒兜底区间处理';

  return (
    <>
      <div className={styles.tabIntro}>
        视频提示词不再分时长档位。推理时直接使用<strong>每个分镜自己的时长</strong>，
        按当前项目所选视频模型的能力吸附成模型真正接受的秒数（兜底区间 4–30 秒），
        再写进提示词的"总时长"与"精确时长"字段。
      </div>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>当前视频模型时长能力</div>
          <div style={{ color: 'var(--token-text-secondary)' }}>{capability}</div>
        </div>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>两套推理协议</div>
          <div style={{ color: 'var(--token-text-secondary)' }}>
            参考模式（multi-ref）：使用 @角色 / @场景 / @道具 映射，适合需要多张参考图的分镜。<br />
            首帧延展模式（first-frame）：以单图为锚做微动延展，适合不需要多图引导的稳态镜头。<br />
            两套协议的正文都可以在「设置 → Prompt 模板 → 视频提示词推理」里直接改。
          </div>
        </div>
      </Space>
    </>
  );
};

