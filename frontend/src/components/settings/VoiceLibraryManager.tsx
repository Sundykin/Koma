/**
 * 音色库（settings → 模型配置 → 音色）
 *
 * 左侧分类（内置 4 + 自定义可增删），右侧该分类下的音色卡片。
 * 内置 Koma 46 个音色只能预览，不能删改；用户自建的音色可上传 wav/mp3 + 改名 + 删除。
 *
 * 预留入口（未做 UI）：导入 / 导出 manifest JSON 做团队分享。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  App, Button, Empty, Form, Input, Modal, Select, Spin, Tag, Upload,
} from 'antd';
import type { UploadFile, RcFile } from 'antd/es/upload/interface';
import {
  DeleteOutlined, EditOutlined, FolderAddOutlined, InboxOutlined,
  PlayCircleOutlined, PlusOutlined, SoundOutlined,
} from '@ant-design/icons';
import {
  createVoiceCategory, createVoiceProfile, deleteVoiceCategory,
  deleteVoiceProfile, groupProfilesByCategory, loadVoiceLibrary,
  renameVoiceCategory, resolveVoiceSampleUrl, updateVoiceProfile,
} from '../../services/voiceLibrary/voiceLibraryService';
import {
  isBuiltinVoiceCategoryId, type VoiceCategory, type VoiceLibrarySnapshot,
  type VoiceProfile,
} from '../../types/voice-library';
import styles from './VoiceLibraryManager.module.scss';

const ALLOWED_AUDIO_EXTS = ['wav', 'mp3', 'm4a', 'aac', 'ogg', 'flac', 'webm'];

interface ProfileFormValues {
  name: string;
  language?: string;
  gender?: 'male' | 'female' | 'neutral';
  providerVoiceId?: string;
  note?: string;
  uploadFile?: UploadFile[];
}

interface ProfileModalState {
  open: boolean;
  mode: 'create' | 'edit';
  categoryId: string;
  profile?: VoiceProfile;
}

function languageTagText(language?: string): string | null {
  if (!language) return null;
  const map: Record<string, string> = {
    'zh-CN': '中文', 'en': '英文', 'ja': '日语', 'ko': '韩语',
    'fr': '法语', 'de': '德语', 'es': '西语', 'it': '意语', 'ru': '俄语',
    'pt-PT': '葡语·欧', 'pt-BR': '葡语·巴', 'es-419': '西语·拉美',
    'zh-CN-dialect': '方言',
  };
  return map[language] ?? language;
}

function genderTagText(gender?: string): string | null {
  if (gender === 'male') return '男声';
  if (gender === 'female') return '女声';
  if (gender === 'neutral') return '中性';
  return null;
}

async function fileToBase64(file: Blob): Promise<{ data: string; ext: string }> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  const data = btoa(binary);
  const name = (file as File).name ?? '';
  const ext = (name.split('.').pop() || 'wav').toLowerCase();
  return { data, ext: ALLOWED_AUDIO_EXTS.includes(ext) ? ext : 'wav' };
}

// ───── 试听播放（同一时间只播一个） ─────

function useAudioPreview() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingProfileId, setPlayingProfileId] = useState<string | null>(null);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingProfileId(null);
  }, []);

  const play = useCallback(async (profile: VoiceProfile) => {
    stop();
    const url = await resolveVoiceSampleUrl(profile.sampleFile);
    if (!url) return;
    const audio = new Audio(url);
    audioRef.current = audio;
    setPlayingProfileId(profile.id);
    audio.addEventListener('ended', () => {
      if (audioRef.current === audio) {
        audioRef.current = null;
        setPlayingProfileId(null);
      }
    });
    try {
      await audio.play();
    } catch {
      if (audioRef.current === audio) {
        audioRef.current = null;
        setPlayingProfileId(null);
      }
    }
  }, [stop]);

  useEffect(() => () => stop(), [stop]);

  return { play, stop, playingProfileId };
}

// ───── 主组件 ─────

export const VoiceLibraryManager: React.FC = () => {
  const { message, modal } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<VoiceLibrarySnapshot>({ categories: [], profiles: [] });
  const [activeCategoryId, setActiveCategoryId] = useState<string>('');
  const [profileModal, setProfileModal] = useState<ProfileModalState>({ open: false, mode: 'create', categoryId: '' });
  const [profileForm] = Form.useForm<ProfileFormValues>();
  const { play, stop, playingProfileId } = useAudioPreview();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await loadVoiceLibrary();
        if (cancelled) return;
        setSnapshot(snap);
        setActiveCategoryId((prev) => prev || snap.categories[0]?.id || '');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const grouped = useMemo(() => groupProfilesByCategory(snapshot), [snapshot]);
  const activeGroup = grouped.find((g) => g.category.id === activeCategoryId);
  const activeCategory = activeGroup?.category;
  const profiles = activeGroup?.profiles ?? [];

  // ───── 分类操作 ─────

  const handleCreateCategory = useCallback(() => {
    let name = '';
    modal.confirm({
      title: '新建分类',
      content: (
        <Input autoFocus placeholder="例如：我的播音音色"
          onChange={(e) => { name = e.target.value; }} />
      ),
      onOk: async () => {
        if (!name.trim()) { message.warning('分类名不能为空'); throw new Error(); }
        const next = await createVoiceCategory(name, snapshot);
        setSnapshot(next);
        const created = next.categories.find((c) => c.name === name.trim() && c.source === 'custom');
        if (created) setActiveCategoryId(created.id);
        message.success('已新建分类');
      },
    });
  }, [modal, message, snapshot]);

  const handleRenameCategory = useCallback((category: VoiceCategory) => {
    let name = category.name;
    modal.confirm({
      title: '重命名分类',
      content: (
        <Input autoFocus defaultValue={category.name}
          onChange={(e) => { name = e.target.value; }} />
      ),
      onOk: async () => {
        if (!name.trim() || name.trim() === category.name) return;
        const next = await renameVoiceCategory(category.id, name, snapshot);
        setSnapshot(next);
        message.success('已重命名');
      },
    });
  }, [modal, message, snapshot]);

  const handleDeleteCategory = useCallback((category: VoiceCategory) => {
    const count = snapshot.profiles.filter((p) => p.categoryId === category.id).length;
    modal.confirm({
      title: `删除分类「${category.name}」？`,
      content: count > 0 ? `该分类下有 ${count} 个音色，会一并删除（含已上传的样本文件）。` : '该分类为空。',
      okType: 'danger',
      onOk: async () => {
        const next = await deleteVoiceCategory(category.id, snapshot);
        setSnapshot(next);
        if (activeCategoryId === category.id) {
          setActiveCategoryId(next.categories[0]?.id ?? '');
        }
        message.success('已删除');
      },
    });
  }, [modal, message, snapshot, activeCategoryId]);

  // ───── Profile 操作 ─────

  const openCreateProfile = useCallback(() => {
    if (!activeCategory || activeCategory.source !== 'custom') return;
    profileForm.resetFields();
    setProfileModal({ open: true, mode: 'create', categoryId: activeCategory.id });
  }, [activeCategory, profileForm]);

  const openEditProfile = useCallback((profile: VoiceProfile) => {
    profileForm.setFieldsValue({
      name: profile.name,
      language: profile.language,
      gender: profile.gender,
      providerVoiceId: profile.providerVoiceId,
      note: profile.note,
    });
    setProfileModal({ open: true, mode: 'edit', categoryId: profile.categoryId, profile });
  }, [profileForm]);

  const handleProfileSubmit = useCallback(async () => {
    const values = await profileForm.validateFields();
    const upload = values.uploadFile?.[0];
    const file = upload?.originFileObj as RcFile | undefined;
    const sample = file ? await fileToBase64(file) : undefined;

    try {
      if (profileModal.mode === 'create') {
        if (!sample) { message.warning('请上传音色样本'); return; }
        const next = await createVoiceProfile({
          categoryId: profileModal.categoryId,
          name: values.name,
          language: values.language,
          gender: values.gender,
          providerVoiceId: values.providerVoiceId,
          note: values.note,
          sampleDataBase64: sample.data,
          sampleExt: sample.ext,
        }, snapshot);
        setSnapshot(next);
        message.success('已创建音色');
      } else if (profileModal.profile) {
        const next = await updateVoiceProfile({
          profileId: profileModal.profile.id,
          name: values.name,
          language: values.language,
          gender: values.gender,
          providerVoiceId: values.providerVoiceId,
          note: values.note,
          sampleDataBase64: sample?.data,
          sampleExt: sample?.ext,
        }, snapshot);
        setSnapshot(next);
        message.success('已保存');
      }
      setProfileModal({ open: false, mode: 'create', categoryId: '' });
      profileForm.resetFields();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    }
  }, [profileForm, profileModal, snapshot, message]);

  const handleDeleteProfile = useCallback((profile: VoiceProfile) => {
    modal.confirm({
      title: `删除音色「${profile.name}」？`,
      content: '已上传的样本文件会一并删除；任何引用此音色的角色会回退到项目默认音色。',
      okType: 'danger',
      onOk: async () => {
        if (playingProfileId === profile.id) stop();
        const next = await deleteVoiceProfile(profile.id, snapshot);
        setSnapshot(next);
        message.success('已删除');
      },
    });
  }, [modal, message, snapshot, playingProfileId, stop]);

  // ───── 渲染 ─────

  if (loading) {
    return <div className={styles.loadingState}><Spin /></div>;
  }

  const builtinCategories = grouped.filter((g) => g.category.source === 'builtin');
  const customCategories = grouped.filter((g) => g.category.source === 'custom');

  return (
    <div className={styles.layout}>
      {/* 左侧：分类 */}
      <aside className={styles.sider}>
        <div className={styles.siderGroup}>
          <div className={styles.siderGroupHeader}>
            <span>内置音色</span>
          </div>
          {builtinCategories.map(({ category, profiles: ps }) => (
            <div
              key={category.id}
              className={`${styles.siderItem} ${styles.siderItemBuiltin} ${activeCategoryId === category.id ? styles.siderItemActive : ''}`}
              onClick={() => setActiveCategoryId(category.id)}
            >
              <span>{category.name}</span>
              <span className={styles.siderCount}>{ps.length}</span>
            </div>
          ))}
        </div>

        <div className={styles.siderGroup}>
          <div className={styles.siderGroupHeader}>
            <span>自定义</span>
            <Button type="text" size="small" icon={<FolderAddOutlined />} onClick={handleCreateCategory} title="新建分类" />
          </div>
          {customCategories.length === 0 ? (
            <div className={styles.siderItem} style={{ opacity: 0.5, cursor: 'default' }}>
              <span>暂无自定义分类</span>
            </div>
          ) : customCategories.map(({ category, profiles: ps }) => (
            <div
              key={category.id}
              className={`${styles.siderItem} ${activeCategoryId === category.id ? styles.siderItemActive : ''}`}
              onClick={() => setActiveCategoryId(category.id)}
            >
              <span>{category.name}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className={styles.siderCount}>{ps.length}</span>
                <span className={styles.siderItemActions}>
                  <Button type="text" size="small" icon={<EditOutlined />}
                    onClick={(e) => { e.stopPropagation(); handleRenameCategory(category); }} />
                  <Button type="text" size="small" danger icon={<DeleteOutlined />}
                    onClick={(e) => { e.stopPropagation(); handleDeleteCategory(category); }} />
                </span>
              </span>
            </div>
          ))}
        </div>
      </aside>

      {/* 右侧：音色卡片 */}
      <section className={styles.content}>
        <div className={styles.contentHeader}>
          <div className={styles.contentTitle}>
            <SoundOutlined />
            <span>{activeCategory?.name ?? '请选择分类'}</span>
            <span className={styles.contentSubtitle}>
              共 {profiles.length} 个音色 · {activeCategory?.source === 'builtin' ? '只读' : '可编辑'}
            </span>
          </div>
          {activeCategory?.source === 'custom' && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateProfile}>上传音色</Button>
          )}
        </div>

        {profiles.length === 0 ? (
          <Empty className={styles.emptyHint}
            description={activeCategory?.source === 'custom' ? '点击右上角"上传音色"，把 wav / mp3 拖进来即可。' : '该分类暂无音色'} />
        ) : (
          <div className={styles.grid}>
            {profiles.map((profile) => {
              const lang = languageTagText(profile.language);
              const gender = genderTagText(profile.gender);
              const isPlaying = playingProfileId === profile.id;
              return (
                <div key={profile.id} className={styles.card}>
                  <div className={styles.cardHead}>
                    <div>
                      <div className={styles.cardName}>{profile.name}</div>
                      {profile.note && (
                        <div className={styles.cardMeta} style={{ marginTop: 4 }}>{profile.note}</div>
                      )}
                    </div>
                    <Button
                      type={isPlaying ? 'primary' : 'text'}
                      size="small"
                      icon={<PlayCircleOutlined />}
                      onClick={() => (isPlaying ? stop() : play(profile))}
                      title={isPlaying ? '停止' : '试听'}
                    />
                  </div>
                  <div className={styles.cardMeta}>
                    {lang && <Tag color="blue">{lang}</Tag>}
                    {gender && <Tag color={profile.gender === 'female' ? 'magenta' : 'cyan'}>{gender}</Tag>}
                    {profile.providerVoiceId && <Tag>{profile.providerVoiceId}</Tag>}
                  </div>
                  {profile.source === 'custom-sample' && (
                    <div className={styles.cardFoot}>
                      <span className={styles.cardMeta}>自定义</span>
                      <span className={styles.cardActions}>
                        <Button type="text" size="small" icon={<EditOutlined />}
                          onClick={() => openEditProfile(profile)} />
                        <Button type="text" size="small" danger icon={<DeleteOutlined />}
                          onClick={() => handleDeleteProfile(profile)} />
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 上传 / 编辑音色 Modal */}
      <Modal
        title={profileModal.mode === 'create' ? '上传音色' : '编辑音色'}
        open={profileModal.open}
        onCancel={() => { setProfileModal({ open: false, mode: 'create', categoryId: '' }); profileForm.resetFields(); }}
        onOk={handleProfileSubmit}
        destroyOnHidden
        okText="保存"
        cancelText="取消"
      >
        <Form form={profileForm} layout="vertical">
          <Form.Item name="name" label="音色名称" rules={[{ required: true, message: '请填名称' }]}>
            <Input placeholder="例如：老爷爷 · 慈祥" autoFocus />
          </Form.Item>
          <Form.Item name="language" label="语言">
            <Select allowClear placeholder="选填" options={[
              { label: '中文', value: 'zh-CN' }, { label: '英文', value: 'en' },
              { label: '日语', value: 'ja' }, { label: '韩语', value: 'ko' },
              { label: '法语', value: 'fr' }, { label: '德语', value: 'de' },
              { label: '西语', value: 'es' }, { label: '意语', value: 'it' },
              { label: '俄语', value: 'ru' }, { label: '方言', value: 'zh-CN-dialect' },
            ]} />
          </Form.Item>
          <Form.Item name="gender" label="性别">
            <Select allowClear placeholder="选填" options={[
              { label: '男声', value: 'male' }, { label: '女声', value: 'female' }, { label: '中性', value: 'neutral' },
            ]} />
          </Form.Item>
          <Form.Item
            name="providerVoiceId"
            label="上游 voice id（可选）"
            tooltip="若已在 TTS provider 那侧克隆出该音色，填入它的 voice id，分镜出配音时会直接走该 id。留空则前端仅作为'音色标签'用，不会真去合成。"
          >
            <Input placeholder="例如：custom-voice-001" />
          </Form.Item>
          <Form.Item name="note" label="备注">
            <Input.TextArea rows={2} placeholder="选填" />
          </Form.Item>
          <Form.Item
            name="uploadFile"
            label={profileModal.mode === 'create' ? '音色样本（必填）' : '替换样本（留空保留原样本）'}
            valuePropName="fileList"
            getValueFromEvent={(e) => Array.isArray(e) ? e : e?.fileList}
            rules={profileModal.mode === 'create' ? [{ required: true, message: '请上传音色样本' }] : []}
          >
            <Upload.Dragger
              accept={ALLOWED_AUDIO_EXTS.map((e) => `.${e}`).join(',')}
              beforeUpload={() => false}
              maxCount={1}
            >
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">拖入音频文件或点击选择</p>
              <p className="ant-upload-hint">支持 {ALLOWED_AUDIO_EXTS.join(' / ')}</p>
            </Upload.Dragger>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
