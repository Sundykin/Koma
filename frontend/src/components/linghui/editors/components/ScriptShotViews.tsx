import React from 'react';
import { Checkbox } from 'antd';
import type { LinghuiStoryboardFrame } from '../../../../types/linghui';
import { toFileSystemDisplayUrl } from '../../../../services/fileSystemPort';

interface ScriptShotViewsProps {
  shots: LinghuiStoryboardFrame[];
  selectedShotIds: string[];
  onToggleShot: (shotId: string, checked: boolean) => void;
}

export function ScriptShotCards({ shots, selectedShotIds, onToggleShot }: ScriptShotViewsProps) {
  const selectedSet = new Set(selectedShotIds);

  return (
    <div className="linghuiScriptShotGrid">
      {shots.map((shot, index) => {
        const previewSource = toPreviewSource(shot.image?.source);
        const checked = selectedSet.has(shot.id);

        return (
          <label key={shot.id} className={`linghuiScriptShotCard ${checked ? 'isSelected' : ''}`}>
            <div className="linghuiScriptShotCardHeader">
              <Checkbox checked={checked} onChange={event => onToggleShot(shot.id, event.target.checked)} />
              <span className="linghuiScriptShotIndex">#{index + 1}</span>
              <span className="linghuiScriptShotDuration">{Math.max(1, Math.round(shot.durationSec || 3))} 秒</span>
            </div>
            {previewSource ? (
              <div className="linghuiScriptShotPreview">
                <img src={previewSource} alt={shot.title} />
              </div>
            ) : null}
            <div className="linghuiScriptShotTitle">{shot.title || `镜头 ${index + 1}`}</div>
            <div className="linghuiScriptShotDescription">{shot.description || '暂无镜头描述'}</div>
          </label>
        );
      })}
    </div>
  );
}

export function ScriptShotTable({ shots, selectedShotIds, onToggleShot }: ScriptShotViewsProps) {
  const selectedSet = new Set(selectedShotIds);

  return (
    <div className="linghuiScriptShotTableWrap">
      <table className="linghuiScriptShotTable">
        <thead>
          <tr>
            <th />
            <th>镜头</th>
            <th>描述</th>
            <th>时长</th>
          </tr>
        </thead>
        <tbody>
          {shots.map((shot, index) => (
            <tr key={shot.id} className={selectedSet.has(shot.id) ? 'isSelected' : ''}>
              <td>
                <Checkbox checked={selectedSet.has(shot.id)} onChange={event => onToggleShot(shot.id, event.target.checked)} />
              </td>
              <td>{shot.title || `镜头 ${index + 1}`}</td>
              <td>{shot.description || '暂无镜头描述'}</td>
              <td>{Math.max(1, Math.round(shot.durationSec || 3))} 秒</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function toPreviewSource(source?: string): string {
  return toFileSystemDisplayUrl(source) || '';
}
