/**
 * 吸附引擎
 * 处理时间线上的吸附逻辑
 */

export interface SnapPoint {
  time: number;           // 时间位置（帧）
  type: 'playhead' | 'item-start' | 'item-end' | 'marker' | 'grid';
  itemId?: string;
  label?: string;
}

export interface SnapResult {
  snapped: boolean;
  position: number;       // 吸附后的位置
  snapPoint?: SnapPoint;  // 吸附到的点
  delta: number;          // 与原始位置的差值
}

export interface SnapEngineOptions {
  enabled: boolean;
  threshold: number;      // 吸附阈值（像素）
  scale: number;          // 当前缩放比例
  snapToPlayhead: boolean;
  snapToClipEdge: boolean;
  snapToGrid: boolean;
  gridInterval: number;   // 网格间隔（帧）
}

/**
 * 吸附引擎类
 */
export class SnapEngine {
  private snapPoints: SnapPoint[] = [];
  private options: SnapEngineOptions;

  constructor(options?: Partial<SnapEngineOptions>) {
    this.options = {
      enabled: true,
      threshold: 10,
      scale: 1,
      snapToPlayhead: true,
      snapToClipEdge: true,
      snapToGrid: false,
      gridInterval: 30,
      ...options,
    };
  }

  /**
   * 更新选项
   */
  setOptions(options: Partial<SnapEngineOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * 设置吸附点
   */
  setSnapPoints(points: SnapPoint[]): void {
    this.snapPoints = points;
  }

  /**
   * 添加吸附点
   */
  addSnapPoint(point: SnapPoint): void {
    this.snapPoints.push(point);
  }

  /**
   * 移除吸附点
   */
  removeSnapPoint(itemId: string): void {
    this.snapPoints = this.snapPoints.filter(p => p.itemId !== itemId);
  }

  /**
   * 清除所有吸附点
   */
  clearSnapPoints(): void {
    this.snapPoints = [];
  }

  /**
   * 从轨道数据更新吸附点
   */
  updateFromTracks(tracks: Array<{ items: Array<{ id: string; start: number; end: number }> }>, playheadTime: number): void {
    this.snapPoints = [];

    // 添加播放头
    if (this.options.snapToPlayhead) {
      this.snapPoints.push({
        time: playheadTime,
        type: 'playhead',
        label: '播放头',
      });
    }

    // 添加片段边缘
    if (this.options.snapToClipEdge) {
      for (const track of tracks) {
        for (const item of track.items) {
          this.snapPoints.push({
            time: item.start,
            type: 'item-start',
            itemId: item.id,
          });
          this.snapPoints.push({
            time: item.end,
            type: 'item-end',
            itemId: item.id,
          });
        }
      }
    }
  }

  /**
   * 查找最近的吸附点
   */
  findSnapPosition(position: number, excludeItemId?: string): SnapResult {
    if (!this.options.enabled) {
      return {
        snapped: false,
        position,
        delta: 0,
      };
    }

    // 转换阈值为帧
    const thresholdInFrames = this.options.threshold / this.options.scale;

    let closestPoint: SnapPoint | undefined;
    let minDistance = Infinity;

    for (const point of this.snapPoints) {
      // 排除自己
      if (excludeItemId && point.itemId === excludeItemId) continue;

      const distance = Math.abs(point.time - position);
      if (distance <= thresholdInFrames && distance < minDistance) {
        minDistance = distance;
        closestPoint = point;
      }
    }

    // 检查网格吸附
    if (this.options.snapToGrid) {
      const gridPosition = Math.round(position / this.options.gridInterval) * this.options.gridInterval;
      const gridDistance = Math.abs(gridPosition - position);

      if (gridDistance <= thresholdInFrames && (!closestPoint || gridDistance < minDistance)) {
        return {
          snapped: true,
          position: gridPosition,
          snapPoint: { time: gridPosition, type: 'grid' },
          delta: gridPosition - position,
        };
      }
    }

    if (closestPoint) {
      return {
        snapped: true,
        position: closestPoint.time,
        snapPoint: closestPoint,
        delta: closestPoint.time - position,
      };
    }

    return {
      snapped: false,
      position,
      delta: 0,
    };
  }

  /**
   * 检查多个位置的吸附（用于拖拽时同时检查开始和结束位置）
   */
  findBestSnap(
    positions: { start: number; end: number },
    excludeItemId?: string
  ): { snapType: 'start' | 'end' | 'none'; result: SnapResult } {
    const startResult = this.findSnapPosition(positions.start, excludeItemId);
    const endResult = this.findSnapPosition(positions.end, excludeItemId);

    // 优先选择距离更近的吸附
    if (startResult.snapped && endResult.snapped) {
      if (Math.abs(startResult.delta) <= Math.abs(endResult.delta)) {
        return { snapType: 'start', result: startResult };
      } else {
        return { snapType: 'end', result: endResult };
      }
    }

    if (startResult.snapped) {
      return { snapType: 'start', result: startResult };
    }

    if (endResult.snapped) {
      return { snapType: 'end', result: endResult };
    }

    return {
      snapType: 'none',
      result: { snapped: false, position: positions.start, delta: 0 },
    };
  }

  /**
   * 获取指定范围内的吸附线（用于渲染）
   */
  getVisibleSnapLines(
    visibleRange: { start: number; end: number },
    excludeItemId?: string
  ): SnapPoint[] {
    return this.snapPoints.filter(p => {
      if (excludeItemId && p.itemId === excludeItemId) return false;
      return p.time >= visibleRange.start && p.time <= visibleRange.end;
    });
  }
}

// 单例
export const snapEngine = new SnapEngine();
export default snapEngine;
