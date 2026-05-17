import React from 'react';
import { App, Button, Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { Download, Film } from 'lucide-react';
import { fromKomaLocalUrl } from '../../../../utils/urlUtils';
import { electronService } from '../../../../services/electronService';
import { getPreviewSource } from '../state/videoNodeEditorShared';

const decodeKomaLocalSource = fromKomaLocalUrl;

function isRemoteSource(source: string): boolean {
  return /^https?:\/\//i.test(source);
}

function isLocalSource(source: string): boolean {
  return Boolean(source) && !isRemoteSource(source) && !source.startsWith('data:') && !source.startsWith('blob:');
}

interface VideoAccessCardProps {
  source: string;
  posterSource?: string;
  emptyDescription: string;
  pills?: string[];
  onDownload?: () => void;
}

export function VideoAccessCard({ source, posterSource, emptyDescription, pills = [], onDownload }: VideoAccessCardProps) {
  const { message } = App.useApp();
  const rawSource = source.startsWith('koma-local://') ? decodeKomaLocalSource(source) : source;
  const previewSource = posterSource ? getPreviewSource(posterSource) : '';
  const sourceLabel = rawSource.split(/[\\/]/).pop() || '视频文件';
  const canOpen = Boolean(rawSource) && (isRemoteSource(rawSource) || isLocalSource(rawSource));
  const canReveal = isLocalSource(rawSource);

  const handleOpen = async () => {
    if (!canOpen) return;
    try {
      if (isRemoteSource(rawSource)) await electronService.shell.openExternal(rawSource);
      else await electronService.shell.openPath(rawSource);
    } catch (error) { message.error(error instanceof Error ? error.message : '打开视频失败'); }
  };

  const handleReveal = async () => {
    if (!canReveal) return;
    try { await electronService.shell.showItemInFolder(rawSource); }
    catch (error) { message.error(error instanceof Error ? error.message : '定位视频文件失败'); }
  };

  return (
    <div className="linghuiEditorPlayerCard">
      <div className="linghuiEditorPlayerSurface isStatic">
        {previewSource ? (
          <img className="linghuiEditorPlayerPoster" src={previewSource} alt={sourceLabel} />
        ) : (
          <div className="linghuiEditorPlayerPlaceholder">
            <Film size={24} />
            <span>{emptyDescription}</span>
          </div>
        )}
        <div className="linghuiEditorPlayerOverlay">
          {onDownload ? (<Button size="small" onClick={onDownload} icon={<Download size={14} />}>下载</Button>) : null}
          {canOpen ? (<Button size="small" type="primary" onClick={handleOpen}>{isRemoteSource(rawSource) ? '在浏览器打开' : '在系统播放器打开'}</Button>) : null}
          {canReveal ? (<Button size="small" onClick={handleReveal}>打开所在位置</Button>) : null}
        </div>
      </div>
      <div className="linghuiEditorPassThroughTitle">{sourceLabel}</div>
      <div className="linghuiEditorPassThroughMeta">{rawSource}</div>
      {pills.length > 0 ? (
        <div className="linghuiEditorPlayerMetaRow">{pills.map(item => (<span key={item} className="linghuiEditorSummaryPill">{item}</span>))}</div>
      ) : null}
    </div>
  );
}

export function TooltipLabel({ label, tooltip }: { label: React.ReactNode; tooltip: React.ReactNode }) {
  return (
    <div className="linghuiEditorLabelWithTooltip">
      <span>{label}</span>
      <Tooltip title={tooltip}>
        <span className="linghuiEditorInfoIcon" aria-label="查看说明"><InfoCircleOutlined /></span>
      </Tooltip>
    </div>
  );
}
