# Tasks: 修复剧集数据隔离

- [x] 1. 添加 `loadEpisodeShots(projectId, episodeId)` 从剧集加载分镜
- [x] 2. 添加 `saveEpisodeShots(projectId, episodeId, shots)` 保存分镜到剧集
- [x] 3. 修改 `Storyboard.tsx` 使用剧集级分镜加载/保存
- [x] 4. 修改 `ShotAnalysisService.ts` 保存分镜到剧集
- [x] 5. 编译验证

## 测试项（手动）
- [ ] 切换不同剧集，确认分镜数据不同
- [ ] 新生成 AI 分镜，确认保存到对应剧集
- [ ] 确认角色/场景按剧集过滤显示
