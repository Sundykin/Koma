import type { CSSProperties } from 'react';
import { Download, Image as ImageIcon } from 'lucide-react';
import type { DisplayImageItem } from '../state/imageNodeDisplayItems';

interface ImageNodeThumbDeckProps {
  displayItems: DisplayImageItem[];
  isExpanded: boolean;
  expandedDeckStyle?: CSSProperties;
  onStopSurfaceEvent: (event: React.SyntheticEvent) => void;
  onUpdatePrimaryImage: (item: DisplayImageItem) => void;
  onDownloadImage: (item: DisplayImageItem) => void;
}

export function ImageNodeThumbDeck({
  displayItems,
  isExpanded,
  expandedDeckStyle,
  onStopSurfaceEvent,
  onUpdatePrimaryImage,
  onDownloadImage,
}: ImageNodeThumbDeckProps) {
  return (
    <div
      className={`linghuiCompactThumbDeck ${displayItems.length > 1 ? 'isStacked' : 'isSingle'} ${isExpanded ? 'isExpanded' : ''}`}
      data-count={displayItems.length}
      style={expandedDeckStyle}
    >
      {displayItems.map((item, index) => {
        return (
          <div
            key={item.key}
            className={`linghuiCompactThumbLayer ${item.isPrimary ? 'isPrimary' : ''}`}
            style={{ '--layer-index': index } as CSSProperties}
          >
            {item.preview ? <img src={item.preview} alt={item.label || `图片 ${index + 1}`} draggable={false} /> : <ImageIcon size={18} />}
            {isExpanded && (
              <div className="linghuiCompactThumbLayerOverlay">
                <div className="linghuiCompactThumbLayerTop">
                  {item.isPrimary ? <span className="linghuiCompactThumbPrimaryBadge">主图</span> : <span />}
                </div>
                <div className="linghuiCompactThumbLayerActions">
                  <button
                    type="button"
                    className="linghuiCompactThumbActionButton nodrag nopan"
                    onMouseDown={onStopSurfaceEvent}
                    onPointerDown={onStopSurfaceEvent}
                    onClick={(event) => {
                      onStopSurfaceEvent(event);
                      onUpdatePrimaryImage(item);
                    }}
                    disabled={item.isPrimary}
                    title={item.isPrimary ? '当前主图' : '设为主图'}
                  >
                    设为主图
                  </button>
                  <button
                    type="button"
                    className="linghuiCompactThumbActionButton nodrag nopan"
                    onMouseDown={onStopSurfaceEvent}
                    onPointerDown={onStopSurfaceEvent}
                    onClick={(event) => {
                      onStopSurfaceEvent(event);
                      onDownloadImage(item);
                    }}
                    title="下载图片"
                  >
                    <Download size={12} />
                    <span>下载</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
