import React from 'react';
import type { LinghuiNodeResult, LinghuiStoryboardResult } from '../../../../types/linghui';
import { useNodeRunState } from '../state/LinghuiNodeRunsContext';
import { toFileSystemDisplayUrl } from '../../../../services/fileSystemPort';

function getPreviewSource(source?: string): string {
  return toFileSystemDisplayUrl(source) || '';
}

function getThumbnailSource(result: LinghuiNodeResult): string {
  if (result.kind === 'video') {
    return getPreviewSource(result.primary?.posterSource) || getPreviewSource(result.primary?.source) || '';
  }
  if (result.kind === 'audio') {
    return '';
  }
  if (result.kind === 'image' || result.kind === 'shot' || result.kind === 'grid') {
    return getPreviewSource(result.primary?.source) || '';
  }
  if (result.kind === 'images' && result.items?.length) {
    return getPreviewSource(result.items[0]?.source) || '';
  }
  if (result.kind === 'storyboard' && result.shots?.length) {
    return getPreviewSource(result.shots[0]?.image?.source) || '';
  }
  return '';
}

const ImagePreview: React.FC<{ source?: string; alt?: string }> = ({ source, alt = 'preview' }) => {
  const src = getPreviewSource(source);
  if (!src) return <div className="linghuiNodePreviewPlaceholder">暂无图片预览</div>;
  return <img className="linghuiNodePreviewImage" src={src} alt={alt} />;
};

const VideoPreview: React.FC<{ source?: string; posterSource?: string }> = ({ source, posterSource }) => {
  const src = getPreviewSource(source);
  const poster = getPreviewSource(posterSource);

  if (src) {
    return (
      <video
        className="linghuiNodePreviewVideo"
        src={src}
        poster={poster || undefined}
        muted
        loop
        autoPlay
        playsInline
      />
    );
  }

  if (poster) return <ImagePreview source={posterSource} alt="video-poster" />;
  return <div className="linghuiNodePreviewPlaceholder">暂无视频预览</div>;
};

const TextPreview: React.FC<{ text: string }> = ({ text }) => (
  <div className="linghuiNodePreviewText">{text}</div>
);

const AudioPreview: React.FC<{ source?: string; label?: string; durationSec?: number; text?: string }> = ({
  source,
  label,
  durationSec,
  text,
}) => {
  const src = getPreviewSource(source);
  if (!src) {
    return <div className="linghuiNodePreviewPlaceholder">暂无音频预览</div>;
  }

  return (
    <div className="linghuiNodePreviewAudioWrap">
      <audio className="linghuiNodePreviewAudio" src={src} controls />
      <div className="linghuiNodePreviewAudioMeta">
        <span>{label || '音频结果'}</span>
        {durationSec ? <span>{Math.max(1, Math.round(durationSec))} 秒</span> : null}
      </div>
      {text ? <div className="linghuiNodePreviewText">{text}</div> : null}
    </div>
  );
};

const ImageGrid: React.FC<{ items: Array<{ source?: string; label?: string }> }> = ({ items }) => (
  <div className="linghuiNodePreviewGrid">
    {items.slice(0, 4).map((item, i) => {
      const src = getPreviewSource(item.source);
      return (
        <figure key={i} className="linghuiNodePreviewTile">
          {src
            ? <img src={src} alt={item.label || 'preview-item'} />
            : <div className="linghuiNodePreviewPlaceholder">无预览</div>
          }
          <figcaption>{item.label || '结果'}</figcaption>
        </figure>
      );
    })}
  </div>
);

const StoryboardPreview: React.FC<{ result: LinghuiStoryboardResult }> = ({ result }) => (
  <div className="linghuiNodeStoryboardList">
    {result.shots?.slice(0, 3).map(shot => {
      const src = getPreviewSource(shot.image?.source);
      return (
        <div key={shot.id} className="linghuiNodeStoryboardItem">
          <div className="linghuiNodeStoryboardThumb">
            {src ? <img src={src} alt={shot.title} /> : '无图'}
          </div>
          <div className="linghuiNodeStoryboardMeta">
            <div className="linghuiNodeStoryboardTitle">{shot.title}</div>
            <div className="linghuiNodeStoryboardDetail">{shot.durationSec} 秒</div>
          </div>
        </div>
      );
    })}
  </div>
);

function ExpandedPreview({ result, message, isError }: { result?: LinghuiNodeResult; message: string; isError: boolean }) {
  if (!result) {
    return (
      <div className={`linghuiNodePreviewPlaceholder ${isError ? 'is-error' : ''}`}>
        {message}
      </div>
    );
  }

  switch (result.kind) {
    case 'text':
      return <TextPreview text={result.text || '暂无文本输出'} />;
    case 'audio':
      return (
        <AudioPreview
          source={result.primary?.source}
          label={result.primary?.label}
          durationSec={result.primary?.durationSec}
          text={result.text}
        />
      );
    case 'video':
      return <VideoPreview source={result.primary?.source} posterSource={result.primary?.posterSource} />;
    case 'grid':
      return (
        <>
          <ImagePreview source={result.primary?.source} alt="grid-preview" />
          {result.items?.length ? <ImageGrid items={result.items} /> : null}
        </>
      );
    case 'image':
    case 'shot':
      return <ImagePreview source={result.primary?.source} />;
    case 'images':
      return <ImageGrid items={result.items ?? []} />;
    case 'storyboard':
      return <StoryboardPreview result={result} />;
    default:
      return <div className="linghuiNodePreviewPlaceholder">暂无可展示的结果</div>;
  }
}

function CompactThumbnail({ result }: { result?: LinghuiNodeResult }) {
  if (!result) return null;

  if (result.kind === 'text') {
    return <div className="linghuiNodeThumbText">{(result.text || '').slice(0, 80)}</div>;
  }

  if (result.kind === 'audio') {
    return (
      <div className="linghuiNodeThumbAudio">
        <span className="linghuiNodeThumbAudioIcon">♪</span>
        <span>{result.primary?.label || '音频结果'}</span>
      </div>
    );
  }

  const src = getThumbnailSource(result);
  if (src) {
    return <img className="linghuiNodeThumbImage" src={src} alt="thumbnail" />;
  }
  return null;
}

interface NodeResultPreviewProps {
  nodeId: string;
  expanded: boolean;
}

export const NodeResultPreview: React.FC<NodeResultPreviewProps> = ({ nodeId, expanded }) => {
  const runState = useNodeRunState(nodeId);
  const result = runState?.result;
  const message = runState?.error || runState?.message || '运行后结果会显示在这里';
  const isError = runState?.status === 'failed';

  return (
    <div className={`linghuiNodeWidget linghuiNodePreviewWidget ${expanded ? '' : 'isCollapsed'}`}>
      {expanded && <div className="linghuiNodeWidgetLabel">结果展示</div>}

      <div className="linghuiNodeWidgetHeader">
        <span className="linghuiNodeWidgetHint">
          {expanded ? '直接在节点上查看输出' : ''}
        </span>
      </div>

      {expanded ? (
        <div className="linghuiNodePreviewBody">
          <ExpandedPreview result={result} message={message} isError={isError} />
        </div>
      ) : (
        <div className="linghuiNodeThumbContainer">
          <CompactThumbnail result={result} />
        </div>
      )}
    </div>
  );
};
