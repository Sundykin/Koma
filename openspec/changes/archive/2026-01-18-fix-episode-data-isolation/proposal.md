# Proposal: 修复分集数据隔离

## Summary
分集详情页显示的角色/场景/分镜没有按分集正确过滤，所有分集显示相同数据。

## Problem
1. `Storyboard.tsx` 调用 `loadShots(projectId)` 从项目级加载分镜，忽略了 `episodeId`
2. 分镜应该从分集的 `analysis.json` 中加载，而非项目级 `shots.json`
3. `AssetManager` 已有过滤逻辑，但依赖 `episodeAnalysis` 数据存在

## Solution
1. 添加 `loadEpisodeShots(projectId, episodeId)` 函数
2. 修改 `Storyboard.tsx` 使用分集级分镜加载
3. 修改 `saveShots` 同时更新分集分析结果
