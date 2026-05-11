# Change: 二创工作流 — 三场景工业级（预告片 / 横竖屏 / 多语言）

## Why

影视公司客户要求 Koma Studio **基于现有 Electron 桌面架构**，加入完整工业级二创工作流，不接受 MVP。一部头部剧 = 200–500 条衍生物料，目前 80% 人工排产，**典型产能瓶颈**。

经多轮多角色评审（架构师 / 工程师 / 质疑者 / 后期总监），从最初 9 个场景收敛到 **3 个真正能在现有架构上做到工业级、客户真实愿意付费、规避大厂正面竞争的场景**：

1. **预告片多版本**（30s/60s/90s × 角色/概念/最终）
2. **多平台横竖屏适配**（16:9 → 9:16/1:1/4:5 × 抖音/B站/YouTube Shorts 等 8+ 平台）
3. **多语言本地化**（dub + 嘴型对齐 + 字幕本地化 + 屏显文字）

**法务红线扫描器、4K 修复、续集铺垫、素材授权包、IP 衍生** 五个场景明确不做（法务问题由影视公司自行承担，4K 修复由客户 BYOL Topaz）。

期望结果：6 个月内（含 30 天基建月），3 个场景在现有架构上达到工业级 SLA，可被影视后期组日常排产使用。

## What Changes

### 三个新工作流（recreation-workflow capability，新增）
- **预告片生产线**：基于已有"剧本→分镜"流水线扩展，加入节奏分析、自动选段、长度自适应、多版本派生
- **横竖屏适配线**：主体跟踪 + 智能 reframe + 字幕重排 + 各平台 LUFS/封面/钩子规格预设
- **多语言本地化线**：人声分离 + ASR + 译文 + TTS 配音 + 嘴型对齐 + 屏显文字 inpaint + 字幕烧录/外挂

### 媒体处理层重构（media-pipeline capability，新增）
- **TaskService 双层调度**：保留内核队列，新增 child_process worker pool（CPU/GPU 任务移出主进程，并发 4→32）
- **FFmpeg 硬件加速 + proxy media**：VideoToolbox/NVENC/QSV 硬件加解码（5–10× 加速）；原片落盘 + 1080p H.264 代理 + 关键帧 webp 三层
- **SQLite 单写者串行化 + Postgres 只读镜像**：保留 SQLite 主库，外挂 Postgres CDC 镜像供跨项目检索

### 第三方 API 提供商扩展
新增 2 类 provider 抽象：
- `itv-pro`（vid2vid 风格化 / 视频生成增强）
- `align`（嘴型对齐：Sync.so / HeyGen 双供应商热备）

新增 1 个视频理解能力（复用现有 LLM provider 抽象，扩展输入类型）

### 数据模型扩展
- `SourceMedia`：母带级登记（含原始时码、版本、proxy 路径）
- `MaterialPackage`：物料 ticket（状态机：草稿 → 制作中 → 初审 → 终审 → 已交付）
- `LocaleTrack`：单语言轨（含原文 STT / 译文 / TTS 音频 / 嘴型对齐结果 / 字幕 / 屏显文字本地化）

### 私有化部署能力
- Provider profile 配置：企业版可强制路由所有云 provider 到本地 vLLM/SDXL/ComfyUI 白名单
- 出网审计日志：所有外部 API 调用记录请求/响应摘要 + 时间戳，可导出
- 素材 ed25519 指纹（复用 release-signing 公钥基建）

### 前端
新增 2 个 UI 模块：
- 多语言配音工作台（双栏编辑：原文 STT × 译文，时码轴对齐，配音回放/重生成单段，嘴型对齐预览，屏显 OCR 标记）
- 横竖屏适配台（主体跟随框预览，字幕重排，平台规格预设矩阵）

预告片**不新增 UI**，复用现有 storyboard + timeline，加入"节奏分析视图"作为侧边面板。

## Impact

- **新增 specs**: `recreation-workflow`、`media-pipeline`
- **修改 specs**: `electron-integration`（preload bridge 新增 namespaces；TaskService 公开 child_process worker API；私有化 profile 接口）
- **新增代码**（~4000 行新代码 + ~600 行修改，**严格扩展非重写**）:
  - `electron/service/media-pipeline/` 全套（worker pool 调度 / proxy 生成 / hwaccel 路由 / SQLite 写串行）
  - `electron/service/recreation/` 全套（trailer-cut / aspect-adapt / localization 三个 service）
  - `electron/service/recreation/providers/` 扩展 itv-pro / align 抽象
  - `electron/controller/recreation.ts`、`media-pipeline.ts`
  - 前端 `services/recreationClient.ts` / `store/recreation/` / `hooks/useRecreation.ts` / `components/recreation/{LocalizationWorkbench,AspectAdaptStudio}.tsx`
  - 私有化 profile：`electron/service/enterprise/`（provider 路由白名单 + 出网审计）
- **修改代码**:
  - `electron/service/tasks/TaskService.ts`：并发 4 → 32 + worker dispatcher
  - `electron/service/tasks/TaskRunner.ts`：新增 child_process worker 协议
  - `electron/service/ffmpeg.ts`：加入 hwaccel 自动检测 + 命令行参数注入；新增 proxy 生成 API
  - `electron/service/storage/`：加单写者串行层；新增 CDC 同步 worker
  - `electron/preload/bridge.ts`：白名单 + 命名空间
  - `electron/preload/index.ts`：preload() 初始化 media-pipeline + recreation service
  - 现有 LLM provider 抽象扩展支持 video input
- **新增依赖**:
  - `opentimelineio-js` 或调 Python 边车（M4 才用）
  - `p-queue`（已有，提并发上限）

## Non-goals

明确不做（法务、版权、合规问题影视公司自负）：
- ❌ 4K 修复（影视公司 BYOL Topaz Video AI）
- ❌ 续集铺垫物料 / IP 衍生（创意活，非工业流水线）
- ❌ 素材授权包（BD/法务活）
- ❌ 法务红线扫描器
- ❌ 高光合集 / CP 剪辑（剪映影视版已成熟，不重复造轮子）
- ❌ 解说版生成（赛道太卷，差异化弱）
- ❌ 自研嘴型对齐 / 自研 dub 模型（调 Sync.so / HeyGen / ElevenLabs API）
- ❌ NLE 互通（AAF/XML/EDL）—— 推迟到下个 change
- ❌ 协作 Web 端 / 云端 SaaS —— 桌面端架构保留

## Constraints

1. **不推翻现有架构**：Electron + 本地 SQLite + 本地 ffmpeg 保留；所有改动以"扩展"为名（4/12 模块改动比 ≤ 重度扩展上限）
2. **API 透传 BYOL**：所有第三方 API（HeyGen / Sync.so / ElevenLabs / 火山 / 阿里 / Topaz）客户自带许可，Koma 不做账号代持
3. **6 个月工业级，含 30 天基建月**：M0 基建（30 天）→ M1 预告 → M2 横竖屏 → M3 多语言 → M4 私有化打包
4. **POC 第 60 天必须 2 个 demo 场景可演示**（预告 + 横竖屏简版）
5. **80GB ProRes 抽帧不阻塞 UI**（worker 隔离硬约束）
6. **50 万 shot 不爆 SQLITE_BUSY**（写串行化硬约束）
