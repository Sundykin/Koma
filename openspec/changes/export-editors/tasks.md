# Tasks

## 1. Core Export Framework
- [ ] 1.1 导出管理器
  - 格式注册机制
  - 资源收集与复制
  - 路径重写策略
- [ ] 1.2 时间线转换器
  - Track → 目标轨道映射
  - Clip → 目标片段映射
  - 时间码转换（帧/秒/timecode）

## 2. Jianying Export
- [ ] 2.1 草稿生成器
  - draft_content.json 结构
  - draft_meta_info.json 元数据
  - materials 素材索引
- [ ] 2.2 元素映射
  - 视频/图片片段
  - 音频片段
  - 文字/字幕
  - 贴纸（降级为图片）

## 3. Premiere Pro Export
- [ ] 3.1 FCP XML 7 生成
  - sequence 结构
  - video/audio track
  - clipitem 与 file 引用
- [ ] 3.2 关键帧导出
  - 位置/缩放/旋转/透明度
  - 缓动曲线近似

## 4. DaVinci Resolve Export
- [ ] 4.1 XML 兼容性
  - Resolve 特定属性
  - 色彩空间元数据

## 5. EDL Export
- [ ] 5.1 CMX 3600 格式
  - 基础剪辑点
  - FROM CLIP NAME 注释
- [ ] 5.2 多轨道处理
  - 视频轨展平
  - 音频轨分离

## 6. Subtitle Export
- [ ] 6.1 SRT 格式
- [ ] 6.2 ASS/SSA 格式（样式支持）
- [ ] 6.3 VTT 格式

## 7. UI Components
- [ ] 7.1 导出向导
  - 格式选择
  - 选项配置
  - 进度显示
- [ ] 7.2 导出报告
  - 成功/警告/错误统计
  - 不支持功能列表
  - 资源清单

## 8. Resource Management
- [ ] 8.1 素材打包
  - 复制/链接选项
  - 目录结构生成
- [ ] 8.2 路径处理
  - 相对/绝对路径
  - 跨平台路径转换
