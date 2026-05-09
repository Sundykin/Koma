# 灵绘全景节点与 3D 导演工作台节点设计探索

## 目的

本文先沉淀思路，不进入实现。目标是把两个相互关联的能力设计清楚：

1. 全景节点：让全景生图提示词、出图比例、投影展示算法互相匹配，减少左右拼接痕迹，并在预览时降低畸变。
2. 3D 导演工作台节点：提供一个可摆机位、放置假人、输出线稿参考图的 3D 草图工作台，用于给生图/生视频提供位置、构图和动作参考。

这两者不应做成两个孤立功能。全景节点应成为 3D 导演工作台的背景空间来源之一，3D 导演工作台则应把全景环境转化为可控机位下的构图参考。

## 当前基础

代码里已经有一些可复用的半成品：

- 全景提示词模板：[panoramaPromptTemplate.ts](/Users/sunmeng/workspace/Koma/frontend/src/components/linghui/panorama/panoramaPromptTemplate.ts)
- 全景预览器：[PanoramaViewer.tsx](/Users/sunmeng/workspace/Koma/frontend/src/components/linghui/panorama/PanoramaViewer.tsx)
- 全景节点编辑器：[PanoramaNodeEditor.tsx](/Users/sunmeng/workspace/Koma/frontend/src/components/linghui/editors/components/PanoramaNodeEditor.tsx)
- 全景执行分支：[linghuiExecutionNodeExecutors.ts](/Users/sunmeng/workspace/Koma/frontend/src/components/linghui/execution/state/linghuiExecutionNodeExecutors.ts)
- 多角度 3D 相机预览：[LinghuiMultiAngle3DViewport.tsx](/Users/sunmeng/workspace/Koma/frontend/src/components/linghui/editors/components/LinghuiMultiAngle3DViewport.tsx)

现有全景预览器的思路是“带状球面”：只把画面映射到赤道附近，屏蔽南北极，限制 pitch，降低头顶/脚下拉花。这是一个合理方向，但它和生图提示词必须严格同频：如果提示词暗示“完整 equirectangular 2:1 球面全景”，展示却按“宽幅带状环境板”处理，边缘与畸变预期会错位。

## 核心判断

全景节点要先明确“我们到底生成什么”。

不建议一上来追求真正完整的 360x180 equirectangular 全景，因为多数通用生图模型并不稳定理解极区、经纬展开、左右无缝边界。当前更现实的目标是：

| 模式 | 推荐程度 | 输出形态 | 展示算法 | 适用场景 |
| --- | --- | --- | --- | --- |
| AR720 band panorama | 默认 | 21:9 或 16:9 超宽环境带 | 圆柱/带状球面 | 灵绘预览、导演工作台背景 |
| Equirectangular 2:1 | 高级 | 2:1 经纬全景图 | 完全球面 | 需要完整上下视角 |
| Flat wide plate | 兼容 | 普通宽幅图 | 平面/轻微 parallax | 模型不支持全景时兜底 |

第一阶段应把默认能力定义为 **AR720 环境带**，而不是假装所有图都是严格球面全景。这样提示词可以更诚实，展示算法也可以更稳。

这里的 AR720 更适合作为产品层命名，不建议在模型提示词里反复强调“720°”。对生图模型来说，最稳定的表达应是“ultra-wide wraparound environment band / panoramic environment plate”。也就是说：产品里叫全景，内部契约里叫 projection，提示词里描述它是可环绕的宽幅环境板。

## 全景投影契约

建议新增一个比 `panoramaTemplate` 更底层的字段：

```ts
type PanoramaProjectionMode =
  | 'ar720-band'
  | 'equirectangular-2to1'
  | 'flat-wide';
```

`panoramaTemplate: auto | indoor | outdoor` 继续保留，用来描述场景类型；`projectionMode` 用来描述图像如何生成和如何展示。

```text
panoramaTemplate = 场景语义：自动 / 室内 / 室外
projectionMode   = 投影契约：环境带 / 真 2:1 球面 / 普通宽幅
aspectRatio      = 出图比例：21:9 / 16:9 / 2:1
viewerMode       = 展示算法：cylinder-band / sphere-band / equirect-sphere / flat
```

推荐默认值：

| 字段 | 默认值 | 原因 |
| --- | --- | --- |
| `projectionMode` | `ar720-band` | 最符合现有 16:9/21:9 出图和当前带状预览 |
| `aspectRatio` | `21:9` | 比 16:9 更适合环绕阅读，边缘拼接压力也更容易观察 |
| `viewerMode` | `cylinder-band` 或现有 `sphere-band` | 只展示赤道附近，减少极区畸变 |

2:1 真球面全景应作为高级选项。只有当出图比例、提示词和预览算法都进入 `equirectangular-2to1` 时，才允许强调完整 360x180 经纬展开。

## 全景节点方案

### 产品目标

全景节点应解决三件事：

1. 生图阶段减少拼接痕迹：特别是左右边界的主题断裂、重复物、光影跳变。
2. 展示阶段减少畸变：避免把非 2:1 图硬塞进完整球面造成头顶/脚下旋涡。
3. 下游可用：能够作为 3D 导演工作台背景，支持从不同机位截图作为参考图。

### 提示词策略

当前模板已经强调 seam-safe、horizon、zenith/nadir。下一步应从“长模板”升级成“投影契约”：

```text
Projection Contract
  kind: ar720-band | equirectangular-2to1 | flat-wide
  aspect: 21:9 | 16:9 | 2:1
  horizon: centered
  edgePolicy: left-right continuity
  polePolicy: avoid important detail near top/bottom
```

生成 prompt 时，不只拼一段固定英文，而是按投影模式组合：

- `ar720-band`：强调“wraparound horizontal environment band”，避免要求完整天空顶点和脚底极点。
- `equirectangular-2to1`：明确“true 2:1 equirectangular panorama, 360 horizontal, 180 vertical”，并更强约束极区。
- `flat-wide`：只要求宽幅场景板，不做球面承诺。

建议保留 `auto / indoor / outdoor`，但它们应作为场景子类型，而不是投影模式本身：

```text
projectionMode: ar720-band
sceneKind: auto | indoor | outdoor
userPrompt: ...
```

更具体的 prompt 编译顺序：

```text
projection contract
  + scene specialization(auto/indoor/outdoor)
  + user prompt
  + seam safety rule
  + distortion safety rule
  + quality tail
```

三种投影模式的提示词要明显不同：

| 模式 | Prompt 重点 | 避免 |
| --- | --- | --- |
| `ar720-band` | 宽幅环绕环境带、地平线居中、左右边缘自然续接、上下边缘少细节 | 不写 true equirectangular，不强求完整头顶脚底 |
| `equirectangular-2to1` | true 2:1 equirectangular, 360 horizontal, 180 vertical, seamless left-right | 不允许 16:9/21:9 时启用 |
| `flat-wide` | cinematic wide environment plate, stable perspective | 不写 wraparound / 360 / sphere |

现有模板里的 seam-safe、horizon、zenith/nadir 思路可以保留，但要按模式裁剪。默认 `ar720-band` 里，“zenith/nadir”不应被写得像严格球面协议，更适合改成“top/bottom distortion-sensitive bands”。

### 展示算法策略

展示算法应根据结果比例/元数据自动选择：

| 输入 | 默认算法 | 说明 |
| --- | --- | --- |
| 约 2:1 | equirectangular sphere | 完整球面，pitch 可更大 |
| 16:9 / 21:9 | cylindrical band 或 sphere band | 限制上下视角，避免极区畸变 |
| 其他比例 | flat wide plate | 不强行环绕 |

当前 `PanoramaViewer` 使用 sphere band，是可保留路线。但建议加入一个 `projectionMode` 参数，并逐步支持 cylinder band。对宽幅环境带来说，圆柱投影通常比球面带更少垂直压缩感：

```text
AR720 band viewer

image strip ──▶ inside cylinder ──▶ camera yaw rotate
                    │
                    ├─ pitch limit small
                    ├─ no top/bottom poles
                    └─ optional subtle floor/sky fill outside band
```

展示算法建议用“元数据优先，比例兜底”：

```ts
function resolvePanoramaViewerMode(input) {
  if (input.projectionMode === 'equirectangular-2to1') return 'equirect-sphere';
  if (input.projectionMode === 'flat-wide') return 'flat';
  if (input.projectionMode === 'ar720-band') return 'cylinder-band';

  const ratio = input.width / input.height;
  if (Math.abs(ratio - 2) < 0.08) return 'equirect-sphere';
  if (ratio >= 1.75) return 'cylinder-band';
  return 'flat';
}
```

`PanoramaViewer` 当前的 pitch 限制是正确方向。后续可以按模式拆开：

| `viewerMode` | 水平拖动 | 垂直拖动 | 几何 |
| --- | --- | --- | --- |
| `cylinder-band` | 360° yaw | 小 pitch，约 ±30° 到 ±45° | 圆柱内壁 |
| `sphere-band` | 360° yaw | 中 pitch，约 ±50° | 赤道球带 |
| `equirect-sphere` | 360° yaw | 大 pitch，但限制避免迷失 | 完整球体 |
| `flat` | 不环绕或轻微 pan | 不环绕 | 平面图 |

第一版可以继续使用现有 `sphere-band`，但 UI 和 metadata 先叫清楚。等稳定后再把 `ar720-band` 的默认展示切到 `cylinder-band`。

### 拼接质量检查

不要只靠提示词。建议增加轻量 QA 视图：

- 左右边界并排预览：把左 8% 和右 8% 摘出来并排显示，用户一眼看 seam。
- seam score：用 canvas 对左右边缘做低分辨率颜色/梯度差异估算，只做提示，不做硬判定。
- wrap preview：把图横向重复 1.5 次显示，暴露重复主体和边界断裂。

这一步成本低，但对调 prompt 非常有价值。

建议 seam 诊断不要当成报错，而是当成“质量仪表”：

```text
全景预览
  ├─ 环绕视图
  ├─ 左右边界
  │    ├─ left 8%
  │    └─ right 8%
  ├─ 横向重复
  │    └─ image repeated 1.5x / 2x
  └─ seam score
       └─ 仅提示：低 / 中 / 高风险
```

验收标准可以先定得务实：

- 21:9 默认结果在预览中不出现明显上下旋涡或极区拉花。
- 用户能在一个面板里看到左右边界是否断裂。
- 同一张图切换小窗和全屏时视角/畸变逻辑一致。
- 非 2:1 图不会被误认为完整 equirectangular 球面。
- prompt 里不再混用“宽幅环境带”和“完整 2:1 球面全景”的互相冲突描述。

### 全景节点阶段任务

1. 定义 `projectionMode`
   - `ar720-band` 默认
   - `equirectangular-2to1` 高级
   - `flat-wide` 兼容

2. 重构提示词编译器
   - 从单个长模板改为 projection contract + scene specialization + user prompt + quality tail
   - 保留旧 `panoramaTemplate` 兼容

3. 展示器支持模式选择
   - 2:1 走完整 sphere
   - 16:9/21:9 走 band/cylinder
   - 非标准比例平面展示

4. 增加 seam 诊断工具
   - 左右边界对比
   - 横向重复预览
   - 可选 seam score

5. 和 3D 导演工作台打通
   - 全景节点输出可作为 director background
   - director 可从背景中提取当前机位截图

### 全景数据流建议

```text
PanoramaNodeEditor
  ├─ properties.panoramaTemplate
  ├─ properties.projectionMode
  └─ properties.aspectRatio
          │
          ▼
wrapWithPanoramaTemplate / compilePanoramaPrompt
          │
          ▼
executeImageNode
          │
          ▼
result.metadata.panorama
  ├─ projectionMode
  ├─ aspectRatio
  ├─ promptTemplate
  └─ inferredViewerMode
          │
          ▼
PanoramaViewport
```

这样后续 3D 导演工作台拿到背景时，不需要猜这张图到底该贴球、贴圆柱还是贴平面。

## 3D 导演工作台节点方案

### 产品定位

3D 导演工作台不是专业 DCC，不是 Blender，也不是最终渲染器。它的定位是：

> 用低成本 3D 草图表达机位、人物站位、朝向、动作关系和场景背景，输出 AI 容易参考的线稿/深度/剪影图。

它应该服务于生图和生视频，而不是替代它们。

### 节点契约

建议新增节点类型：`linghui/director3d`。

输入：

| 槽位 | 类型 | 用途 |
| --- | --- | --- |
| 0 | image/panorama | 背景图或全景环境 |
| 1 | image | 角色外观参考 |
| 2 | text | 分镜/动作描述 |

输出：

| 输出 | 类型 | 用途 |
| --- | --- | --- |
| image | 线稿参考图、深度图或构图图 |
| text | 机位/站位/动作说明 prompt fragment |

如果短期不想扩展多输出类型，可以先只输出 `image`，把文字说明写入结果 metadata，后续再引入更完整的 `scene3d` 数据类型。

更推荐的节点输出语义：

```text
primary image:
  当前相机视角的线稿/构图参考图

metadata:
  scene3d json
  camera prompt fragment
  actor/crowd prompt fragment
  background snapshot source

future outputs:
  depth image
  silhouette image
  clean background snapshot
```

第一版不要急着引入复杂多输出端口。可以先把 lineart 作为主结果，metadata 里保留扩展空间；等下游图片节点支持“结构参考 / 深度参考 / 背景参考”的语义区分后，再升级多输出。

### 数据模型草案

```ts
interface Director3DScene {
  version: 1;
  background: {
    mode: 'none' | 'panorama' | 'image-plane' | 'color';
    sourceNodeId?: string;
    source?: string;
    projectionMode?: 'ar720-band' | 'equirectangular-2to1' | 'flat-wide';
    yawOffset?: number;
  };
  camera: {
    position: [number, number, number];
    target: [number, number, number];
    focalLength: number;
    fov: number;
    roll: number;
    aspectRatio: string;
  };
  actors: DirectorActor[];
  crowds: DirectorCrowd[];
  render: {
    mode: 'lineart' | 'silhouette' | 'depth' | 'composition';
    showGrid: boolean;
    showCameraFrame: boolean;
    transparentBackground: boolean;
  };
}
```

坐标系建议固定：

```text
X：画面左右 / 世界左右
Y：高度
Z：前后深度
地面：Y = 0
默认人物高度：1.75 单位
默认相机高度：1.55 单位
```

背景接入建议分三档：

| 背景模式 | 展示方式 | 适用 |
| --- | --- | --- |
| `panorama` | 按 projectionMode 贴圆柱/球带/球体 | 全景节点输出 |
| `image-plane` | 固定在远处的背景板 | 普通场景图 |
| `color` / `none` | 纯色或透明 | 只要线稿构图 |

高级假人：

```ts
interface DirectorActor {
  id: string;
  label: string;
  type: 'advanced-mannequin';
  position: [number, number, number];
  rotationY: number;
  scale: number;
  posePreset: string;
  joints?: Record<string, number[]>;
  sourceReferenceId?: string;
}
```

低级假人/群众：

```ts
interface DirectorCrowd {
  id: string;
  type: 'crowd';
  formation: 'grid' | 'arc' | 'line' | 'random-cluster';
  count: number;
  position: [number, number, number];
  spacing: number;
  orientationMode: 'same-direction' | 'face-camera' | 'face-target' | 'random';
  variation: number;
}
```

高级假人和低级假人的边界要清楚：

| 类型 | 能力 | 渲染复杂度 | 目标 |
| --- | --- | --- | --- |
| 高级假人 | 单体拖放、缩放、朝向、姿势预设、少量关节微调 | 中 | 主角、重要配角 |
| 低级假人 | 批量生成、队形、朝向规则、随机扰动 | 低 | 方阵、群演、围观人群 |

低级假人建议使用 instanced mesh，不做关节，只用不同高度、肩宽、朝向和站姿剪影变化。这样军队方阵或吃瓜群众可以一次放几十到几百个，不拖垮画布。

### 编辑体验

建议界面分三层：

```text
┌────────────────────────────────────────────┐
│ 3D viewport                                 │
│ - orbit / pan / zoom                        │
│ - drag actor                                │
│ - camera frame overlay                      │
│ - background panorama/image                 │
├────────────────────────────────────────────┤
│ Toolbar                                     │
│ camera | actor | crowd | pose | render      │
├────────────────────────────────────────────┤
│ Inspector                                   │
│ selected actor/camera/background properties │
└────────────────────────────────────────────┘
```

MVP 交互先做：

- 拖拽放置一个基础假人
- 调整位置、大小、朝向
- 调整相机位置/视角/FOV
- 选择背景：无、图片平面、全景节点
- 输出当前相机视角线稿图

高级交互后做：

- 姿势库：站立、走路、奔跑、坐、挥手、持物、对峙、跌倒
- 关节微调：头、胸腔、上臂、前臂、大腿、小腿
- 群众生成：方阵、排队、围观、散点、军阵
- 多机位快照：同一个场景导出多个镜头参考

交互优先级可以这样拆：

| 优先级 | 交互 | 备注 |
| --- | --- | --- |
| P0 | 相机 orbit/pan/zoom、FOV、画幅框 | 没有这个就不是导演台 |
| P0 | 添加/选择/拖动/旋转/缩放基础假人 | 先表达站位关系 |
| P0 | 导出当前视角 lineart PNG | 打通 AI 参考链路 |
| P1 | 姿势预设 | 比自由 IK 更早做 |
| P1 | 背景接入全景节点 | 两个功能形成闭环 |
| P2 | 群众/方阵生成 | 解决大场面 |
| P3 | 关节微调/IK/动作库 | 高级能力，后置 |

### 渲染输出

输出给 AI 的参考图不应追求真实材质，而应清楚表达结构。推荐四种渲染模式：

| 模式 | 用途 |
| --- | --- |
| lineart | 生图主参考，表达人体轮廓、透视和动作 |
| silhouette | 强调人物群体位置和形状 |
| depth | 帮模型理解前后空间 |
| composition | 背景 + 半透明假人 + 相机框 |

技术上可以先用 Three.js 原生能力实现：

- 假人用 capsule/sphere/cylinder procedural mesh
- 线稿用 edges geometry 或自定义材质
- 深度图用 override material
- 截图用 WebGL canvas `toDataURL`，再走现有媒体落盘逻辑

高级阶段再考虑 GLTF 骨骼模型、IK、BVH/动作库。MVP 不需要引入重量级 3D 资产依赖。

lineart 导出建议分两层：

1. 视口实时显示：用 toon/solid material + edge overlay，保证编辑时流畅。
2. 导出时渲染：临时切换到高对比线稿材质，隐藏控制器、网格、选中框，再 `toDataURL` 落盘。

对 AI 来说，线稿图里最好保留：

- 相机画幅和透视关系
- 人物轮廓、头胸骨盆朝向
- 四肢大方向
- 人物前后遮挡关系
- 地面接触点和影子/脚底参考

不建议保留：

- 太密的网格
- UI 控制柄
- 复杂材质纹理
- 过多小关节标记

### 与生图/生视频的关系

导演工作台输出应被下游图片节点当作“结构参考图”，同时给 prompt 增加可读说明：

```text
Use the attached line drawing as composition and pose reference.
Keep camera angle, actor positions, body orientation, crowd distribution,
and foreground/background depth relationship consistent with the reference.
```

如果背景来自全景节点，下游图片节点可以同时收到：

1. 全景背景当前机位截图
2. 线稿/深度图参考
3. 文字化机位描述

这比单独给一张全景图更可靠，因为 AI 更容易跟随“当前镜头截图 + 结构线稿”。

### 导演工作台与现有多角度能力的关系

现有 `LinghuiMultiAngle3DViewport` 已经有相机方位、俯仰、距离和简单 3D 预览，它适合作为技术种子，但新导演台不要被“多角度生图”绑定死。

建议关系是：

```text
MultiAngle
  └─ 单角色参考图的固定机位选择器

Director3D
  └─ 多角色 / 背景 / 构图 / 动作关系的自由场景编辑器
```

可以复用的部分：

- Three.js/R3F 使用方式
- 相机角度枚举经验
- prompt fragment 编译经验
- 现有图片节点引用和落盘链路

需要新建的部分：

- scene3d schema
- actor/crowd 管理
- 背景投影适配
- lineart/depth 渲染输出
- 导演台节点编辑器

### 3D 导演 MVP 验收标准

- 能新建一个导演台节点，打开后看到稳定 3D 视口。
- 能添加至少 1 个高级假人，调整位置、大小、朝向。
- 能调整相机视角和画幅，导出当前视角线稿。
- 能把普通图片作为背景板。
- 能把全景节点结果作为背景，并使用对应 projectionMode 展示。
- 导出的线稿可被下游图片节点作为参考图使用。
- 保存/重新打开项目后，scene3d 状态完整恢复。

## 两个节点的组合工作流

推荐目标工作流：

```text
文本/场景描述
   │
   ▼
全景节点
   │  生成 seam-safe 背景环境
   ▼
3D 导演工作台
   │  摆相机、摆假人、导出线稿和背景截图
   ▼
图片节点
   │  使用背景截图 + 线稿参考生成正式画面
   ▼
视频节点
      使用正式画面 + 动作提示生成镜头视频
```

这条链路的关键是：全景节点负责“环境一致性”，导演工作台负责“构图和动作关系”，图片/视频节点负责“最终视觉质量”。

## 推荐实施路线

### Phase 1：全景节点定标

目标：先让全景结果和展示算法稳定匹配。

- 增加 `projectionMode`
- 重构全景 prompt compiler
- `PanoramaViewport` 根据比例/模式选择 sphere/band/cylinder/flat
- 增加 seam 诊断预览
- 给现有全景执行测试补 metadata 断言

### Phase 2：3D 导演工作台 MVP

目标：能摆一个基础 3D 草图并导出线稿参考图。

- 新增 `linghui/director3d` 节点定义
- 建立 `Director3DScene` schema
- Viewport 支持相机、地面网格、基础假人
- 支持背景图片平面和全景背景
- 支持导出当前相机视角 lineart PNG
- 下游图片节点可引用导出的 reference

### Phase 3：假人与群众能力增强

目标：让导演台真正能表达动作和调度。

- 姿势预设库
- 高级假人关节编辑
- 群众/方阵生成器
- 多角色分组、朝向目标、随机变化
- 常见分镜模板：对话、对峙、追逐、军阵、围观

### Phase 4：导演台到生成链路优化

目标：让 AI 更稳定遵循构图参考。

- lineart + depth + background snapshot 多参考输出
- 生成 prompt fragment
- 下游图片节点新增“结构参考”语义
- 视频节点可读取导演台 metadata，生成更明确的机位/动作提示

## 风险与开放问题

1. 通用生图模型不一定可靠理解无缝全景。需要用 seam preview 和 projection fallback 降低失败成本。
2. 21:9 宽幅图不应强行当完整球面。否则展示畸变会被误认为生图质量问题。
3. 高级假人如果太早做骨骼/IK，会拖慢 MVP。应先用姿势预设 + 少量关键关节。
4. AI 是否遵循线稿参考取决于 provider 能力。需要把“结构参考”作为独立语义，而不是普通图片参考混在一起。
5. 群众数量会影响 Three.js 性能。低级假人应使用 instancing 或合批渲染。

## 建议优先级

最建议先做：

1. 全景 `projectionMode` 与展示算法匹配
2. seam 诊断预览
3. 3D 导演 MVP：基础假人 + 相机 + lineart 导出

暂缓：

1. 完整 2:1 真球面全景强保证
2. 高级骨骼 IK
3. 复杂动画时间线
4. 从图片反推 3D 场景

一句话路线：

先把全景节点做成可靠的“可环绕背景板”，再把 3D 导演工作台做成“构图和动作线稿生成器”。不要一开始追求真实 3D 生产系统，先服务 AI 生成链路的可控参考。
