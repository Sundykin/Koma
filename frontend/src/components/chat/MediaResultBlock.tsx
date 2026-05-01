/**
 * 媒体生成结果卡片
 * - 顶部：prompt + 元信息
 * - 中部：图片网格 / 视频
 * - 底部：操作按钮（重新编辑 / 再次生成 / 删除该批次）
 * 生成中显示 Spinner 占位；失败显示错误提示。
 */
import React, { useCallback } from 'react';
import { Spin, Image as AntImage, message } from 'antd';
import { LoadingOutlined, EditOutlined, ReloadOutlined, DeleteOutlined, DownloadOutlined, PaperClipOutlined } from '@ant-design/icons';
import type { ChatImageRef, MediaResultMeta } from './chatMediaGeneration';
import { electronService } from '../../services/electronService';
import styles from './MediaResultBlock.module.css';

interface MediaResultBlockProps {
  meta: MediaResultMeta;
  onReedit?: () => void;
  onRegenerate?: () => void;
  onDelete?: () => void;
  /** 把这批生成结果（图片）作为参考图加到输入框 pending 队列 */
  onUseAsReference?: (refs: ChatImageRef[]) => void;
}

/** 下载远程 URL 到用户选择的本地路径 */
async function downloadMediaToLocal(url: string, suggestedName: string): Promise<void> {
  if (!electronService.isElectron()) {
    // 浏览器：用 anchor download
    const a = document.createElement('a');
    a.href = url;
    a.download = suggestedName;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return;
  }
  const saveResult = await electronService.dialog.saveFile({
    defaultPath: suggestedName,
    title: '保存到本地',
  });
  if (saveResult?.canceled || !saveResult?.filePath) return;
  const result = await electronService.fs.downloadFile(url, saveResult.filePath);
  if (!result?.success) {
    message.error('下载失败');
    return;
  }
  message.success(`已保存到 ${saveResult.filePath}`);
}

const MODE_LABEL: Record<MediaResultMeta['mode'], string> = {
  'text-to-image': '图片创作',
  'image-to-image': '图片创作',
  'text-to-video': '视频创作',
  'image-to-video': '视频创作',
  'start-end-to-video': '视频创作',
  'reference-to-video': '视频创作',
};

export const MediaResultBlock: React.FC<MediaResultBlockProps> = ({
  meta,
  onReedit,
  onRegenerate,
  onDelete,
  onUseAsReference,
}) => {
  const handleDownloadOne = useCallback(async (url: string, mimeType: string | undefined, idx: number) => {
    const ext = mimeType?.includes('png') ? 'png' : mimeType?.includes('webp') ? 'webp' : 'jpg';
    await downloadMediaToLocal(url, `koma-image-${Date.now()}-${idx + 1}.${ext}`);
  }, []);
  const handleDownloadVideo = useCallback(async () => {
    if (!meta.video) return;
    await downloadMediaToLocal(meta.video, `koma-${meta.mode}-${Date.now()}.mp4`);
  }, [meta.video, meta.mode]);
  const metaLine: string[] = [];
  if (meta.modelLabel) metaLine.push(meta.modelLabel);
  if (meta.aspectRatio) metaLine.push(meta.aspectRatio);
  if (meta.resolution && meta.mode !== 'image-to-video') metaLine.push(meta.resolution);
  if (meta.duration && meta.mode === 'image-to-video') metaLine.push(`${meta.duration}s`);
  if (meta.count && meta.count > 1) metaLine.push(`${meta.count} 张`);

  const imagesCount = meta.images?.length ?? 0;

  return (
    <div className={styles.card}>
      {/* 头部：prompt + 元信息 */}
      <div className={styles.header}>
        <div className={styles.prompt}>{meta.prompt || `（${MODE_LABEL[meta.mode]}）`}</div>
        {metaLine.length > 0 && (
          <div className={styles.metaLine}>
            {metaLine.map((t, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className={styles.metaDivider}>|</span>}
                <span>{t}</span>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* 主内容区 */}
      <div className={styles.body}>
        {meta.generating && (
          <div className={styles.placeholder}>
            <Spin indicator={<LoadingOutlined style={{ fontSize: 28 }} spin />} />
            <span>正在{MODE_LABEL[meta.mode]}...</span>
          </div>
        )}

        {!meta.generating && meta.error && (
          <div className={styles.errorBlock}>
            <span>{MODE_LABEL[meta.mode]}失败</span>
            <span className={styles.errorMsg}>{meta.error}</span>
          </div>
        )}

        {!meta.generating && !meta.error && imagesCount > 0 && (
          <div className={styles.imageGrid}>
            <AntImage.PreviewGroup>
              {meta.images!.map((img, idx) => (
                <div key={img.id} className={styles.imageItem}>
                  <AntImage
                    src={img.source}
                    alt={img.label}
                    width={160}
                    height={160}
                    rootClassName={styles.imageWrapper}
                    className={styles.image}
                    preview={{ mask: '点击查看大图' }}
                  />
                  <div className={styles.imageOverlay}>
                    {onUseAsReference && (
                      <button
                        type="button"
                        className={styles.imageOverlayBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          onUseAsReference([img]);
                        }}
                        title="作为参考图"
                      >
                        <PaperClipOutlined />
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.imageOverlayBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDownloadOne(img.source, img.mimeType, idx);
                      }}
                      title="下载到本地"
                    >
                      <DownloadOutlined />
                    </button>
                  </div>
                </div>
              ))}
            </AntImage.PreviewGroup>
          </div>
        )}

        {!meta.generating && !meta.error && meta.video && (
          <div className={styles.videoItem}>
            <video
              className={styles.video}
              src={meta.video}
              controls
              poster={meta.images?.[0]?.source}
            />
            <div className={styles.videoOverlay}>
              <button
                type="button"
                className={styles.imageOverlayBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleDownloadVideo();
                }}
                title="下载视频"
              >
                <DownloadOutlined />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 操作栏：单图操作（下载 / 作为参考）已在每张图 hover 时显示，这里只剩批次级动作 */}
      {!meta.generating && !meta.error && (
        <div className={styles.actions}>
          {onReedit && (
            <button type="button" className={styles.actionButton} onClick={onReedit}>
              <EditOutlined />
              <span>重新编辑</span>
            </button>
          )}
          {onRegenerate && (
            <button type="button" className={styles.actionButton} onClick={onRegenerate}>
              <ReloadOutlined />
              <span>再次生成</span>
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className={`${styles.actionButton} ${styles.actionDanger}`}
              onClick={onDelete}
            >
              <DeleteOutlined />
              <span>删除该批次</span>
            </button>
          )}
        </div>
      )}
      {!meta.generating && meta.error && onDelete && (
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.actionButton} ${styles.actionDanger}`}
            onClick={onDelete}
          >
            <DeleteOutlined />
            <span>删除该批次</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default MediaResultBlock;
