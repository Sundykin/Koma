# Tasks: 修复分集数据隔离

- [x] 1. 添加 `loadEpisodeShots(projectId, episodeId)` 从分集加载分镜
- [x] 2. 添加 `saveEpisodeShots(projectId, episodeId, shots)` 保存分镜到分集
- [x] 3. 修改 `Storyboard.tsx` 使用分集级分镜加载/保存
- [x] 4. 修改 `ShotAnalysisService.ts` 保存分镜到分集
- [x] 5. 编译验证

## 测试项（手动）
- [ ] 切换不同分集，确认分镜数据不同
- [ ] 新生成 AI 分镜，确认保存到对应分集
- [ ] 确认角色/场景按分集过滤显示
