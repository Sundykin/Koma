/**
 * 资源系统类型定义
 */

// 资源类型
export type ResourceType = 'video' | 'audio' | 'image';

// 资源状态
export type ResourceStatus = 'pending' | 'processing' | 'ready' | 'error';

// 媒体信息
export interface MediaInfo {
  duration?: number;      // 毫秒
  width?: number;
  height?: number;
  fps?: number;
  format: string;
  videoCodec?: string;
  audioCodec?: string;
  bitrate?: number;
  audioChannels?: number;
  audioSampleRate?: number;
  hasVideo: boolean;
  hasAudio: boolean;
}

// 资源
export interface Resource {
  id: string;
  type: ResourceType;
  name: string;
  path: string;           // 原始文件路径
  localPath?: string;     // 复制到项目目录的路径
  // 元数据
  width?: number;
  height?: number;
  duration?: number;      // 毫秒
  fps?: number;
  format?: string;
  size: number;           // 字节
  // 缓存
  thumbnailPath?: string;
  waveformPath?: string;
  framesPath?: string;    // 抽帧目录
  // 状态
  status: ResourceStatus;
  error?: string;
  createdAt: number;
  updatedAt: number;
  // 引用
  refCount: number;       // 引用计数（被轨道项引用的次数）
}

// 资源导入选项
export interface ResourceImportOptions {
  copyToProject?: boolean;  // 是否复制到项目目录
  extractFrames?: boolean;  // 是否抽帧
  generateWaveform?: boolean; // 是否生成波形
  splitAudio?: boolean;     // 是否分离音频
  framesFps?: number;       // 抽帧帧率
  framesWidth?: number;     // 抽帧宽度
}

// 资源过滤条件
export interface ResourceFilter {
  type?: ResourceType;
  status?: ResourceStatus;
  search?: string;
}

// 资源排序
export interface ResourceSort {
  field: 'name' | 'createdAt' | 'size' | 'duration';
  order: 'asc' | 'desc';
}

// 资源库状态
export interface ResourceLibraryState {
  resources: Map<string, Resource>;
  selectedIds: Set<string>;
  filter: ResourceFilter;
  sort: ResourceSort;
  viewMode: 'grid' | 'list';
  loading: boolean;
  error?: string;
}

// 资源操作类型
export type ResourceActionType =
  | 'add'
  | 'remove'
  | 'update'
  | 'select'
  | 'deselect'
  | 'setFilter'
  | 'setSort'
  | 'setViewMode';

// 辅助函数：检测资源类型
export function detectResourceType(filename: string): ResourceType | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return null;

  const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v'];
  const audioExts = ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac'];
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];

  if (videoExts.includes(ext)) return 'video';
  if (audioExts.includes(ext)) return 'audio';
  if (imageExts.includes(ext)) return 'image';

  return null;
}

// 辅助函数：格式化文件大小
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// 辅助函数：格式化时长
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// 辅助函数：创建资源
export function createResource(
  id: string,
  type: ResourceType,
  name: string,
  path: string,
  size: number
): Resource {
  const now = Date.now();
  return {
    id,
    type,
    name,
    path,
    size,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    refCount: 0
  };
}

// 辅助函数：更新资源
export function updateResource(
  resource: Resource,
  updates: Partial<Resource>
): Resource {
  return {
    ...resource,
    ...updates,
    updatedAt: Date.now()
  };
}

// 辅助函数：检查资源是否可用
export function isResourceReady(resource: Resource): boolean {
  return resource.status === 'ready';
}

// 辅助函数：获取资源的缩略图 URL
export function getResourceThumbnailUrl(resource: Resource): string | null {
  if (resource.thumbnailPath) {
    return `koma-local:///${resource.thumbnailPath.replace(/\\/g, '/')}`;
  }
  return null;
}

// 辅助函数：获取资源的波形图 URL
export function getResourceWaveformUrl(resource: Resource): string | null {
  if (resource.waveformPath) {
    return `koma-local:///${resource.waveformPath.replace(/\\/g, '/')}`;
  }
  return null;
}
