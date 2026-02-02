# SCDN 图床服务插件

SCDN 图床服务，支持图片上传并获取远程 URL，用于 AI 图像生成和视频生成。

## 功能

- 自动上传手动导入的资产图片到图床
- 获取远程 URL 供 AI 生成服务使用
- 支持多种输出格式（WebP、JPEG、PNG、GIF）
- 支持多个 CDN 域名选择
- 上传失败自动重试 3 次

## 配置

在插件设置面板中配置：

| 参数 | 说明 | 默认值 |
|------|------|--------|
| 启用图床 | 是否启用图床服务 | 否 |
| API 端点 | SCDN API 地址 | https://img.scdn.io/api/v1.php |
| 输出格式 | 图片输出格式 | WebP |
| CDN 域名 | 图片外链域名 | 自动选择 |

## 可用 CDN 域名

- 默认（自动选择）
- 失控的防御系统 (img.scdn.io)
- CloudFlare (cloudflareimg.cdn.sn)
- EdgeOne (edgeoneimg.cdn.sn)
- ESA (esaimg.cdn1.vip)

## 使用方式

1. 安装并启用本插件
2. 在插件配置中启用图床服务
3. 在资产管理中手动上传图片时，会自动上传到图床
4. 远程 URL 会保存到资产的 xxxUrl 字段

## API 文档

详见 [图床API文档.md](../../图床API文档.md)

## 开发

```bash
# 安装依赖
npm install

# 构建
npm run build

# 监听构建
npm run build:watch

# 打包
npm run zip
```
