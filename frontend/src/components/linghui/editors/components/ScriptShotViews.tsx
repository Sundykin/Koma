import React from 'react';
import { Checkbox } from 'antd';
import { Box, MapPin, UserRound } from 'lucide-react';
import type { LinghuiProductionAsset, LinghuiProductionAssetKind, LinghuiStoryboardFrame } from '../../../../types/linghui';
import { toFileSystemDisplayUrl } from '../../../../services/fileSystemPort';
import {
  resolveLinghuiShotProductionAssetProjection,
} from '../state/linghuiProductionAssets';

interface ScriptShotViewsProps {
  shots: LinghuiStoryboardFrame[];
  selectedShotIds: string[];
  onToggleShot: (shotId: string, checked: boolean) => void;
  editable?: boolean;
  onChangeShot?: (shotId: string, patch: Partial<LinghuiStoryboardFrame>) => void;
  productionAssets?: LinghuiProductionAsset[];
  onOpenProductionAsset?: (assetId: string) => void;
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
  { field: 'productionAssets', label: '生产资产' },
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
  'productionAssets',
  'characterAction',
  'lighting',
  'lightingAndAtmosphere',
  'imageGenerationPrompt',
  'videoMotionPrompt',
]);

const IMAGE_URL_PATTERN = /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|#|$)/i;

export function ScriptShotCards({
  shots,
  selectedShotIds,
  onToggleShot,
  productionAssets = [],
  onOpenProductionAsset,
}: ScriptShotViewsProps) {
  const selectedSet = new Set(selectedShotIds);

  return (
    <div className="linghuiScriptShotGrid">
      {shots.map((shot, index) => {
        const previewSource = toPreviewSource(shot.image?.source);
        const checked = selectedSet.has(shot.id);

        const projection = resolveLinghuiShotProductionAssetProjection(shot, productionAssets);

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
            <div className="linghuiScriptShotDescription">{shot.plotDescription || shot.description || '暂无镜头描述'}</div>
            <div className="linghuiScriptShotFieldList">
              <ScriptShotCardField label="画面" value={shot.visualDescription} />
              <ScriptShotCardField label="生图" value={shot.imageGenerationPrompt} />
              <ScriptShotCardField label="视频" value={shot.videoMotionPrompt} />
            </div>
            {productionAssets.length > 0 ? (
              <ScriptShotAssetSummary
                projection={projection}
                onOpenProductionAsset={onOpenProductionAsset}
              />
            ) : null}
          </label>
        );
      })}
    </div>
  );
}

function ScriptShotCardField({ label, value }: { label: string; value?: string }) {
  const text = String(value ?? '').trim();
  if (!text) return null;

  return (
    <div className="linghuiScriptShotCardField">
      <span>{label}</span>
      <em>{text}</em>
    </div>
  );
}

export function ScriptShotTable({
  shots,
  selectedShotIds,
  onToggleShot,
  editable = false,
  onChangeShot,
  productionAssets = [],
  onOpenProductionAsset,
}: ScriptShotViewsProps) {
  const rows = React.useMemo(
    () => shots.map((shot, index) => toShotTableRow(shot, index, productionAssets)),
    [productionAssets, shots],
  );
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
                  column.field === 'productionAssets' ? (
                    <td key={column.field} className="linghuiScriptShotAssetCell">
                      <ScriptShotAssetSummary
                        projection={resolveLinghuiShotProductionAssetProjection(shot, productionAssets)}
                        onOpenProductionAsset={onOpenProductionAsset}
                      />
                    </td>
                  ) : (
                    <ScriptShotTableCell
                      key={column.field}
                      field={column.field}
                      value={row[column.field]}
                      isImage={Boolean(metrics.imageFlags.get(column.field))}
                      editable={editable && isEditableShotField(column.field)}
                      onChange={nextValue => onChangeShot?.(shot.id, patchShotFromTableField(column.field, nextValue))}
                    />
                  )
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

function toShotTableRow(
  shot: LinghuiStoryboardFrame,
  index: number,
  productionAssets: LinghuiProductionAsset[],
): ShotTableRow {
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
    productionAssets: formatProductionAssetSummary(resolveLinghuiShotProductionAssetProjection(shot, productionAssets)),
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

const PRODUCTION_ASSET_KIND_META: Record<LinghuiProductionAssetKind, { label: string; Icon: typeof UserRound }> = {
  character: { label: '角色', Icon: UserRound },
  scene: { label: '场景', Icon: MapPin },
  prop: { label: '道具', Icon: Box },
};

function formatProductionAssetSummary(
  projection: ReturnType<typeof resolveLinghuiShotProductionAssetProjection>,
): string {
  return [
    ...projection.references.map(reference => `${PRODUCTION_ASSET_KIND_META[reference.asset.kind].label} ${reference.asset.name}`),
    ...projection.missing.map(missing => `缺失${PRODUCTION_ASSET_KIND_META[missing.kind].label} ${missing.name}`),
  ].join('\n');
}

function ScriptShotAssetSummary({
  projection,
  onOpenProductionAsset,
}: {
  projection: ReturnType<typeof resolveLinghuiShotProductionAssetProjection>;
  onOpenProductionAsset?: (assetId: string) => void;
}) {
  if (projection.references.length === 0 && projection.missing.length === 0) return null;

  return (
    <div className="linghuiScriptShotAssetSummary" aria-label="本镜头生产资产">
      <span className="linghuiScriptShotAssetLabel">资产</span>
      <div className="linghuiScriptShotAssetChips">
        {projection.references.map(reference => {
          const meta = PRODUCTION_ASSET_KIND_META[reference.asset.kind];
          const Icon = meta.Icon;
          return onOpenProductionAsset ? (
            <button
              key={reference.asset.id}
              type="button"
              className="linghuiScriptShotAssetChip"
              onClick={event => {
                event.preventDefault();
                event.stopPropagation();
                onOpenProductionAsset(reference.asset.id);
              }}
              title={`跳回资产：${reference.asset.name}`}
              aria-label={`跳回资产 ${reference.asset.name}`}
            >
              <Icon size={10} />
              {reference.asset.name}
            </button>
          ) : (
            <span key={reference.asset.id} className="linghuiScriptShotAssetChip">
              <Icon size={10} />
              {reference.asset.name}
            </span>
          );
        })}
        {projection.missing.map(missing => {
          const meta = PRODUCTION_ASSET_KIND_META[missing.kind];
          const Icon = meta.Icon;
          return (
            <span
              key={`missing-${missing.kind}-${missing.name}`}
              className="linghuiScriptShotAssetChip isMissing"
              title={`未建立${meta.label}资产：${missing.name}`}
            >
              <Icon size={10} />
              {missing.name}
            </span>
          );
        })}
      </div>
    </div>
  );
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
