import React from 'react';
import { Checkbox } from 'antd';
import type { LinghuiStoryboardFrame } from '../../../../types/linghui';
import { toFileSystemDisplayUrl } from '../../../../services/fileSystemPort';

interface ScriptShotViewsProps {
  shots: LinghuiStoryboardFrame[];
  selectedShotIds: string[];
  onToggleShot: (shotId: string, checked: boolean) => void;
  editable?: boolean;
  onChangeShot?: (shotId: string, patch: Partial<LinghuiStoryboardFrame>) => void;
}

interface ShotTableColumn {
  field: string;
  label: string;
}

type ShotTableRow = Record<string, unknown>;

const STORY_COLUMNS: ShotTableColumn[] = [
  { field: 'shotNumber', label: '镜头' },
  { field: 'storyboardImage', label: '画面' },
  { field: 'plotDescription', label: '剧情描述' },
  { field: 'durationSeconds', label: '时长' },
  { field: 'visualDescription', label: '画面描述' },
  { field: 'characters', label: '角色' },
  { field: 'videoReference', label: '视频参考' },
  { field: 'characterAction', label: '角色动作' },
  { field: 'emotion', label: '情绪' },
  { field: 'shotSize', label: '景别' },
  { field: 'sceneTags', label: '场景标签' },
  { field: 'lighting', label: '灯光' },
  { field: 'audioEffects', label: '音效' },
  { field: 'dialogue', label: '对白' },
  { field: 'imageGenerationPrompt', label: '生图提示词' },
  { field: 'videoMotionPrompt', label: '视频运动' },
];

const WIDE_TEXT_FIELDS = new Set([
  'content',
  'description',
  'plotDescription',
  'visualDescription',
  'visual_description',
  'characters',
  'characterAction',
  'lighting',
  'lightingAndAtmosphere',
  'imageGenerationPrompt',
  'videoMotionPrompt',
]);

const IMAGE_URL_PATTERN = /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|#|$)/i;

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

export function ScriptShotTable({ shots, selectedShotIds, onToggleShot, editable = false, onChangeShot }: ScriptShotViewsProps) {
  const rows = React.useMemo(() => shots.map(toShotTableRow), [shots]);
  const columns = React.useMemo(() => resolveShotTableColumns(rows), [rows]);
  const metrics = React.useMemo(() => resolveShotTableMetrics(rows, columns), [rows, columns]);
  const selectedSet = new Set(selectedShotIds);

  if (shots.length === 0 || columns.length === 0) {
    return (
      <div className="linghuiScriptShotTableEmpty">
        暂无数据
      </div>
    );
  }

  return (
    <div className="linghuiScriptShotTableWrap">
      <table
        className="linghuiScriptShotTable"
        style={{ minWidth: metrics.totalMinWidth }}
      >
        <thead>
          <tr>
            <th className="linghuiScriptShotSelectCell" />
            {columns.map(column => (
              <th key={column.field} style={{ width: metrics.widths.get(column.field) }}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shots.map((shot, index) => {
            const row = rows[index] ?? {};
            return (
              <tr key={shot.id} className={selectedSet.has(shot.id) ? 'isSelected' : ''}>
                <td className="linghuiScriptShotSelectCell">
                  <Checkbox checked={selectedSet.has(shot.id)} onChange={event => onToggleShot(shot.id, event.target.checked)} />
                </td>
                {columns.map(column => (
                  <ScriptShotTableCell
                    key={column.field}
                    field={column.field}
                    value={row[column.field]}
                    isImage={Boolean(metrics.imageFlags.get(column.field))}
                    editable={editable && isEditableShotField(column.field)}
                    onChange={nextValue => onChangeShot?.(shot.id, patchShotFromTableField(column.field, nextValue))}
                  />
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function toPreviewSource(source?: string): string {
  return toFileSystemDisplayUrl(source) || '';
}

function toShotTableRow(shot: LinghuiStoryboardFrame, index: number): ShotTableRow {
  const duration = Math.max(1, Math.round(shot.durationSec || 3));
  const imageSource = toPreviewSource(shot.image?.source);
  const videoReference = toPreviewSource(shot.videoReference?.referenceFrameImage);
  const title = shot.title || `镜头 ${index + 1}`;
  const description = shot.description || '';
  const plotDescription = shot.plotDescription || description || title;
  const visualDescription = shot.visualDescription || description;

  return {
    shotNumber: shot.shotNumber || index + 1,
    storyboardImage: imageSource,
    plotDescription,
    durationSeconds: `${duration} 秒`,
    visualDescription,
    characters: formatCharacters(shot.characters),
    videoReference,
    shotSize: shot.shotSize || '',
    characterAction: shot.characterAction || '',
    emotion: shot.emotion || '',
    sceneTags: shot.sceneTags || '',
    lighting: shot.lightingAndAtmosphere || '',
    audioEffects: shot.audioEffects || '',
    dialogue: shot.dialogue || '',
    imageGenerationPrompt: shot.imageGenerationPrompt || visualDescription,
    videoMotionPrompt: shot.videoMotionPrompt || [shot.characterAction, visualDescription].filter(Boolean).join('，'),
  };
}

function resolveShotTableColumns(rows: ShotTableRow[]): ShotTableColumn[] {
  const seenFields = new Set<string>();
  rows.forEach(row => {
    Object.keys(row).forEach(field => {
      const value = row[field];
      if (field === 'storyboardImage') {
        if (isImageCellValue(value)) seenFields.add(field);
        return;
      }
      if (toCellText(value).trim()) seenFields.add(field);
    });
  });

  return STORY_COLUMNS.filter(column => seenFields.has(column.field));
}

function resolveShotTableMetrics(rows: ShotTableRow[], columns: ShotTableColumn[]) {
  let totalMinWidth = 42;
  const widths = new Map<string, number>();
  const imageFlags = new Map<string, boolean>();

  columns.forEach(column => {
    const isImage = rows.some(row => isImageCellValue(row[column.field]));
    const width = isImage ? 90 : WIDE_TEXT_FIELDS.has(column.field) ? 200 : column.field === 'shotNumber' ? 58 : 140;
    widths.set(column.field, width);
    imageFlags.set(column.field, isImage);
    totalMinWidth += width;
  });

  return { widths, imageFlags, totalMinWidth };
}

function formatCharacters(characters?: LinghuiStoryboardFrame['characters']): string {
  if (!characters?.length) return '';
  return characters
    .map((character, index) => {
      const name = character.characterName?.trim() || `角色${index + 1}`;
      const description = character.characterDescription?.trim();
      const hasImage = Boolean(character.characterImageUrl?.trim());
      return [
        name,
        description ? `：${description}` : '',
        hasImage ? '（含角色图）' : '',
      ].join('');
    })
    .join('\n');
}

function ScriptShotTableCell(props: {
  field: string;
  value: unknown;
  isImage: boolean;
  editable?: boolean;
  onChange?: (value: string) => void;
}) {
  if (props.isImage && isImageCellValue(props.value)) {
    const src = toPreviewSource(String(props.value));
    return (
      <td className="linghuiScriptShotImageCell" style={{ width: 90 }}>
        <div className="linghuiScriptShotImageBox">
          <img src={src} alt={props.field} draggable={false} />
        </div>
      </td>
    );
  }

  const text = toCellText(props.value);
  return (
    <td>
      {props.editable ? (
        <textarea
          className="linghuiScriptShotTextCell linghuiScriptShotEditableCell nodrag nowheel"
          value={text}
          onChange={event => props.onChange?.(event.target.value)}
          onClick={event => event.stopPropagation()}
          onMouseDown={event => event.stopPropagation()}
          onKeyDown={event => event.stopPropagation()}
          aria-label={props.field}
        />
      ) : (
        <div className="linghuiScriptShotTextCell" onDoubleClick={selectCellText}>
          {text || <span className="linghuiScriptShotMuted">-</span>}
        </div>
      )}
    </td>
  );
}

function isEditableShotField(field: string): boolean {
  return [
    'plotDescription',
    'durationSeconds',
    'visualDescription',
    'characterAction',
    'emotion',
    'shotSize',
    'sceneTags',
    'lighting',
    'audioEffects',
    'dialogue',
    'imageGenerationPrompt',
    'videoMotionPrompt',
  ].includes(field);
}

function patchShotFromTableField(field: string, value: string): Partial<LinghuiStoryboardFrame> {
  switch (field) {
    case 'durationSeconds':
      return { durationSec: Number.parseFloat(value) || 1 };
    case 'lighting':
      return { lightingAndAtmosphere: value };
    default:
      return { [field]: value } as Partial<LinghuiStoryboardFrame>;
  }
}

function toCellText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

function isImageCellValue(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  const source = toPreviewSource(value) || value;
  return source.startsWith('data:image/')
    || source.startsWith('blob:')
    || IMAGE_URL_PATTERN.test(source)
    || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(value);
}

function selectCellText(event: React.MouseEvent<HTMLDivElement>) {
  event.preventDefault();
  event.stopPropagation();
  const range = document.createRange();
  range.selectNodeContents(event.currentTarget);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}
