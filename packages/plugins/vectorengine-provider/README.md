# VectorEngine Provider 插件

Koma 插件 - VectorEngine.ai 视频生成服务提供者

## 功能

- **图生视频 (ITV)**: 使用 Sora-2 模型从图片生成视频
- **角色提取**: 从视频中提取角色用于后续生成

## 安装

### 方式一：从 ZIP 安装

1. 运行 `npm run zip` 生成 `vectorengine-provider.zip`
2. 在 Koma 应用中打开「设置 → 插件管理」
3. 拖拽 zip 文件到导入区域
4. 确认权限请求

### 方式二：开发模式

1. 在 Koma 插件管理中选择「从文件夹导入」
2. 选择本插件目录

## 配置

1. 从 [VectorEngine.ai](https://api.vectorengine.ai) 获取 API Key
2. 在插件配置页面输入 API Key
3. 点击「测试连接」验证配置
4. 保存配置

## API 接口

### 图生视频

- 端点: `POST /v1/video/create`
- 支持参数:
  - `images`: 图片 URL 数组
  - `model`: 模型名称 (sora-2-all, sora-2)
  - `orientation`: 画面方向 (portrait, landscape)
  - `prompt`: 提示词
  - `size`: 分辨率 (small=720p, large=1080p)
  - `duration`: 时长 (10, 15, 20 秒)
  - `watermark`: 是否保留水印

### 查询任务

- 端点: `GET /v1/video/query?id={taskId}`

### 角色提取

- 端点: `POST /sora/v1/characters`
- 支持参数:
  - `url`: 视频 URL
  - `timestamps`: 时间范围 (如 "1,3")
  - `from_task`: 从已有任务创建

## 权限说明

| 权限 | 用途 |
|------|------|
| `settings:read` | 读取应用设置 |
| `settings:write` | 保存渠道配置 |
| `storage:limited` | 保存插件配置 |
| `network:external` | 访问 VectorEngine API |

## 开发

```bash
# 安装依赖
npm install

# 构建
npm run build

# 监听模式
npm run build:watch

# 打包 ZIP
npm run zip
```

## 许可证

MIT
