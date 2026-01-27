# Seedream TTI Provider 插件

豆包 Seedream 4.0 文生图/图生图服务插件，基于 VectorEngine API。

## 功能

- **文生图**：输入提示词，生成图片
- **图生图**：输入参考图 + 提示词，生成新图片
- **多分辨率**：支持 1K/2K/4K 预设或自定义尺寸
- **水印控制**：可开关 AI 水印

## 安装

1. 运行 `npm install` 安装依赖
2. 运行 `npm run build` 构建插件
3. 运行 `npm run zip` 打包为 zip
4. 在 Koma 设置 → 插件管理 中导入 zip 文件

## 配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| API Key | VectorEngine 访问令牌 | - |
| 服务地址 | API 端点 | https://api.vectorengine.ai |
| 默认尺寸 | 1K/2K/4K 或自定义 | 2K |
| 水印 | 是否添加水印 | 开启 |

## API 说明

使用豆包 Seedream 4.0 模型（doubao-seedream-4-0-250828）

- 端点：POST /v1/images/generations
- 同步接口，直接返回图片 URL
- 图片 URL 24 小时内有效

## 尺寸选项

| 预设 | 分辨率 |
|------|--------|
| 1K | 1024×1024 |
| 2K | 2048×2048 |
| 4K | 4096×4096 |
| 自定义 | 512-4096，宽高比 1:16 至 16:1 |

## License

MIT
