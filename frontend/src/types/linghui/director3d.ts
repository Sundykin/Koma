/**
 * 灵绘 3D 导演工作台：演员/绑定/相机/背景/场景/关键帧/时间轴/节点 properties
 * （从 types/linghui.ts 拆出）
 */
import type { LinghuiPanoramaProjectionMode } from './imageNodes';

// --- 3D 导演工作台节点 ---

/**
 * 场景物件类型：
 * - mannequin：可摆姿势的主角假人，全套头/躯干/四肢，唯一持有 posePreset 字段
 * - mannequin-lite：单个低级群演占位（独立可拖拽），简化为胶囊形，用作普通群演
 * - formation：整体方阵（rows × cols 个胶囊小人，整体可移动旋转，不可单独拆移），
 *   元数据存在 actor.formation 字段
 * - prop-box / prop-cylinder / prop-plane：基础几何辅助构图（桌椅/桶/墙板等占位）
 * - prop-camera：相机模型，标注次要机位 / OTS 参考点
 * - prop-arrow：方向箭头，标注运动轨迹 / 视线
 */
export type LinghuiDirector3DActorType =
  | 'mannequin'
  | 'mannequin-lite'
  | 'formation'
  | 'creature'
  | 'prop-box'
  | 'prop-cylinder'
  | 'prop-plane'
  | 'prop-camera'
  | 'prop-arrow';

/**
 * 动物 / 玄幻生物子类型（actor.type='creature' 时使用）。
 * 详见 director3d/director3dCreature.ts。
 */
export type LinghuiDirector3DCreatureSpecies =
  | 'lion' | 'wolf' | 'tiger' | 'bear' | 'horse' | 'eagle'
  | 'dragon' | 'phoenix' | 'qilin' | 'fox' | 'deer' | 'crane';

export type LinghuiDirector3DCreatureAction =
  | 'idle' | 'walk' | 'run' | 'pounce' | 'fly' | 'roar';

export interface LinghuiDirector3DCreatureRig {
  spine: [number, number, number];
  neck: [number, number, number];
  frontLeftLeg: [number, number, number];
  frontRightLeg: [number, number, number];
  rearLeftLeg: [number, number, number];
  rearRightLeg: [number, number, number];
  tail: [number, number, number];
}

/**
 * 方阵元数据（actor.type === 'formation' 时使用）。
 * actor.position 是方阵的几何中心，actor.rotationY 是整体朝向；
 * 方阵内的每个小人位置由 rows/cols/spacing 派生，不存储独立坐标。
 */
export interface LinghuiDirector3DFormationConfig {
  rows: number;
  cols: number;
  spacing: number;
  /**
   * 方阵内部成员的相对朝向：
   *  - forward：全部朝向方阵正前方（与 actor.rotationY 一致）
   *  - away：全部背对方阵正前方
   *  - inward：面朝方阵几何中心
   *  - outward：背朝方阵几何中心
   */
  memberFacing: 'forward' | 'away' | 'inward' | 'outward';
}

export type LinghuiDirector3DActorGroupRole =
  | 'rider'
  | 'mount'
  | 'passenger'
  | 'carrier'
  | 'linked';

export type LinghuiDirector3DActorPose =
  | 'idle'
  | 'walk'
  | 'run'
  | 'sit'
  | 'wave'
  | 'point';
export type LinghuiDirector3DBackgroundMode = 'none' | 'color' | 'image-plane' | 'panorama';
export type LinghuiDirector3DRenderMode = 'preview' | 'lineart' | 'silhouette' | 'depth' | 'composition';

export interface LinghuiDirector3DActor {
  id: string;
  label: string;
  type: LinghuiDirector3DActorType;
  /** 世界坐标 [x,y,z]，y=0 为地面，单位米 */
  position: [number, number, number];
  /** 绕 Y 轴朝向，弧度 */
  rotationY: number;
  /** 整体缩放，1.0 = 默认身高 1.75m */
  scale: number;
  /** 颜色（参考图区分用），CSS 颜色串 */
  color: string;
  posePreset: LinghuiDirector3DActorPose;
  /**
   * 轻量实体组合标识。组合成员仍保存世界绝对坐标，编辑器层根据 groupId
   * 做移动 / 旋转联动，避免 nested transform 破坏导出、关键帧和老场景。
   */
  groupId?: string;
  /** 组合内角色，例如 rider / mount；用于 UI 与 prompt 描述。 */
  groupRole?: LinghuiDirector3DActorGroupRole;
  /** 组合显示名，例如“人骑马”。 */
  groupLabel?: string;
  /**
   * 骨骼姿态（rig）。仅 type='mannequin' 时有意义。
   * 每个关节存局部欧拉角（XYZ，弧度）。详见 director3d/director3dRig.ts。
   * 不存在时回退 RIG_PRESETS[posePreset]，保持老 scene 向后兼容。
   * 关键帧 / timeline 之间可按关节线性插值，做连续骨骼动画。
   */
  rig?: LinghuiDirector3DRig;
  /** 方阵元数据，仅 type='formation' 时存在 */
  formation?: LinghuiDirector3DFormationConfig;
  /** 生物子类型（仅 type='creature' 时存在） */
  species?: LinghuiDirector3DCreatureSpecies;
  /** 生物当前动作（仅 type='creature' 时使用，离散切换） */
  creatureAction?: LinghuiDirector3DCreatureAction;
  /** 生物骨架姿态（仅 type='creature' 时使用，关节级 LERP 动画） */
  creatureRig?: LinghuiDirector3DCreatureRig;
  /**
   * 参考图（koma-local URL 数组）。从全局资产库加入场景时一次性 snapshot 复制过来；
   * director3d executor 把所有 actor 的参考图聚合后写入 result.items，
   * 让下游图片节点直接拿到真实视觉指引（角色脸 / 服装 / 道具样式）。
   */
  referenceImages?: string[];
  /** 来自哪个全局资产 id（弱引用，用于未来同步更新） */
  sourceGlobalAssetId?: string;
}

/**
 * 骨骼绑定（rig）。每个关节为局部欧拉角 [x,y,z]，单位弧度。
 * 渲染时 Mannequin 组件把这些值挂到对应的 group rotation 上；
 * 时间轴插值时关节角度独立 LERP，做连续骨骼动画。
 *
 * 关节命名：
 *  - spine：躯干前后倾 / 转
 *  - neck：头部俯仰 / 转
 *  - left/right shoulder：肩关节
 *  - left/right elbow：肘关节（前臂）
 *  - left/right hip：髋关节
 *  - left/right knee：膝关节（小腿）
 */
export interface LinghuiDirector3DRig {
  spine: [number, number, number];
  neck: [number, number, number];
  leftShoulder: [number, number, number];
  rightShoulder: [number, number, number];
  leftElbow: [number, number, number];
  rightElbow: [number, number, number];
  leftHip: [number, number, number];
  rightHip: [number, number, number];
  leftKnee: [number, number, number];
  rightKnee: [number, number, number];
}

export interface LinghuiDirector3DCamera {
  position: [number, number, number];
  /** LookAt 目标点 */
  target: [number, number, number];
  /** 视场角，单位度 */
  fov: number;
  /** 倾斜（roll），单位度 */
  roll: number;
  aspectRatio: string;
}

export interface LinghuiDirector3DBackground {
  mode: LinghuiDirector3DBackgroundMode;
  /** image-plane 模式下的图片 URL */
  source?: string;
  /** panorama 模式下绑定的上游全景节点 id（运行时按其结果贴几何） */
  sourceNodeId?: string;
  /** 投影模式（panorama 模式下决定贴圆柱/球带/球体） */
  projectionMode?: LinghuiPanoramaProjectionMode;
  /** 纯色背景（color 模式） */
  color?: string;
  /** 全景背景的 yaw 偏移，弧度 */
  yawOffset?: number;
}

export interface LinghuiDirector3DScene {
  version: 1;
  background: LinghuiDirector3DBackground;
  camera: LinghuiDirector3DCamera;
  actors: LinghuiDirector3DActor[];
  render: {
    mode: LinghuiDirector3DRenderMode;
    showGrid: boolean;
    showCameraFrame: boolean;
    transparentBackground: boolean;
    /**
     * 用户最近应用的摄影机预设 id 列表（最新在前，保留最多 3 个）。
     * 这些预设的 english 会拼进 directorPromptFragment 让下游 AI 看到镜头术语。
     */
    lastCameraPresetIds?: string[];
  };
  /** 时间轴（关键帧 + 补间）。空时表示静态镜头。 */
  timeline?: LinghuiDirector3DTimeline;
}

/**
 * 时间轴关键帧：在时间轴某个时间点上的 scene 快照。
 * 不存 render 模式 —— 整个 timeline 共享一套渲染设置。
 *
 * actor 字段拆成"连续可插值"和"离散切换"：
 *  - 连续：position / rotationY / scale → 在两 keyframe 间线性 / 短弧插值
 *  - 离散：posePreset / color / formation.rows/cols/memberFacing → 在 alpha>=0.5 时切换
 *  - 半连续：formation.spacing → 线性插值（间距感受连续）
 */
export interface LinghuiDirector3DKeyframeActor {
  id: string;
  position: [number, number, number];
  rotationY: number;
  scale: number;
  /** 假人姿势（mannequin 才有意义）；alpha>=0.5 时切到 next 的值 */
  posePreset?: LinghuiDirector3DActorPose;
  /**
   * 骨骼姿态。两个关键帧都存在 rig 时按关节线性插值，做连续动画；
   * 单边缺失时按"中立站立"补齐再插值。详见 director3d/director3dRig.ts。
   */
  rig?: LinghuiDirector3DRig;
  /** 颜色；alpha>=0.5 时切换 */
  color?: string;
  /** 方阵参数（仅 type='formation' 时有效）；rows/cols/memberFacing 离散切换，spacing 线性 */
  formation?: LinghuiDirector3DFormationConfig;
  /** 生物动作（仅 type='creature'）；离散切换 */
  creatureAction?: LinghuiDirector3DCreatureAction;
  /** 生物骨架；关节级 LERP 动画 */
  creatureRig?: LinghuiDirector3DCreatureRig;
}

/**
 * 关键帧"作用域"：
 *  - 'scene'（默认 / 旧数据兼容）：整场快照，同时插值 camera + 所有 actors
 *  - 'camera'：仅记录相机参数，actor 字段忽略，时间轴专属 camera 轨
 *  - `actor:${actorId}`：仅记录该 actor 的快照，camera 忽略
 *
 * 插值时同一 actor 只从 scope='scene' 或 scope='actor:{id}' 的关键帧里取值，
 * 相机只从 scope='scene' 或 scope='camera' 的关键帧里取值。
 */
export type LinghuiDirector3DKeyframeScope = 'scene' | 'camera' | `actor:${string}`;

export interface LinghuiDirector3DKeyframe {
  id: string;
  /** 关键帧时间（秒） */
  time: number;
  label?: string;
  /**
   * 作用域；缺省视为 'scene'（兼容旧数据）。新版自动加帧只生成 'camera' / 'actor:xxx' 范围。
   */
  scope?: LinghuiDirector3DKeyframeScope;
  /** 该时刻所有 actor 的状态快照（按 actor.id 索引）；未列出的 actor 表示不存在 / 不渲染 */
  actors: LinghuiDirector3DKeyframeActor[];
  /** 该时刻相机参数（完整复用 LinghuiDirector3DCamera） */
  camera: LinghuiDirector3DCamera;
  /**
   * 相机的"轨道"参数（绕 target 的 yaw 累计弧度 + pitch + distance）。
   *
   * 为什么单独存：camera.position 是 [x,y,z]，绕 360° 后 position 与起点相同，
   * 仅看 position 无法区分"没动"与"转了一圈"。orbit 段记录用户实际累计的 yaw
   * （不取模），插值时优先用 yaw/pitch/distance 线性 lerp 重算 position，
   * 这样用户拍下"720° 环绕"关键帧后，回放能真实地转两圈而不是直接停在起点。
   */
  cameraOrbit?: { yaw: number; pitch: number; distance: number };
  /** 背景（不插值，按 segment 起点取） */
  background?: LinghuiDirector3DBackground;
}

export type LinghuiDirector3DEasing = 'linear' | 'ease-in-out' | 'ease-in' | 'ease-out';

/**
 * 视频导出分辨率档位。数字代表垂直像素数；宽度按当前 scene.camera.aspectRatio 计算
 * （e.g. 720p + 16:9 → 1280×720；1080p + 21:9 → 2520×1080）。
 */
export type LinghuiDirector3DExportResolution = '480p' | '720p' | '1080p' | '1440p' | '2160p';

export interface LinghuiDirector3DTimeline {
  version: 1;
  /** 关键帧列表，必须按 time 升序；UI 写入前会自动 sort */
  keyframes: LinghuiDirector3DKeyframe[];
  /** 总时长（秒），默认 8 */
  duration: number;
  /** 输出帧率，默认 24 */
  fps: number;
  /** 补间缓动 */
  easing: LinghuiDirector3DEasing;
  /** 时间轴导出分辨率档位，默认 720p；未设置时按 720p 处理 */
  exportResolution?: LinghuiDirector3DExportResolution;
}

/**
 * 单张额外视角导出：用于"三视图"、"360 环绕九宫格"等批量导出场景。
 *
 * angleViews 不取代主图（lineartDataUrl 仍是主输出，等同于单视角导出）。下游
 * 图片节点会把 lineartDataUrl 作为 result.primary、把 angleViews 同步追加到
 * result.items，让用户用 @ref_xxx__item_N 引用任意一张。
 */
export interface LinghuiDirector3DAngleView {
  id: string;
  label: string;
  /** PNG dataUrl */
  dataUrl: string;
  camera: LinghuiDirector3DCamera;
  renderMode: LinghuiDirector3DRenderMode;
}

export interface LinghuiDirector3DNodeProperties {
  /** 完整 3D 场景描述。会随节点一起持久化。 */
  scene: LinghuiDirector3DScene;
  /** 用户输入的额外说明，编译为 prompt fragment 时拼到末尾。 */
  prompt: string;
  /** 额外视角导出（三视图 / 九宫格等）。空数组 / undefined = 仅有主图。 */
  angleViews?: LinghuiDirector3DAngleView[];
  /** 最近一次批量导出走的是哪个预设，仅作 UI 高亮 */
  lastAngleBatchKind?: 'three-view' | 'orbit-9' | 'custom';
  /**
   * 输出模式：
   *  - 'lineart'（默认）：lineart 单图 / 多视角图集（现行行为）
   *  - 'video'：时间轴渲染出的动画 mp4，作为下游 video / image-to-video 节点的参考
   */
  outputMode?: 'lineart' | 'video';
  /** 时间轴导出后落盘的视频 URL（koma-local://...），仅 outputMode='video' 时使用 */
  timelineVideoUrl?: string;
  /** 时间轴动画首帧 PNG URL（作为下游 video 节点 posterSource / image-to-video 输入） */
  timelineVideoPosterUrl?: string;
  /** 视频元信息：时长 / fps / 帧数（用于下游视频节点 prompt 携带） */
  timelineVideoMeta?: {
    duration: number;
    fps: number;
    frameCount: number;
    width: number;
    height: number;
  };
}

