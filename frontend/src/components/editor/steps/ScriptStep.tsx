/**
 * 编辑器第一步：剧本（项目工作台）
 *
 * 把"项目工作台"（ProjectOverview）作为统一的项目生产步骤：
 *   - 左：剧集导航
 *   - 中：剧本编辑器（含解析 / 推文文案 / 导入剧本）
 *   - 右：项目资产概览
 *   - 顶：项目设置 / 模型选择 / 导入剧本入口
 *
 * 业务逻辑（剧集管理 / 自动保存 / 解析 / 推文 / 导入剧本 / 模型选择）完全
 * 复用 ProjectOverview，此包装层只把 EditorStepContext 适配成 ProjectOverview 所需 props，
 * 把 onEnterEpisode 接到上层，并保留旧的 start-production 入口映射到项目工作台。
 */
import React from 'react';
import { ProjectOverview } from '../../project/ProjectOverview';
import type { EditorStepContext } from '../../../workflow/editorStepRegistry';
import type { Episode, Project } from '../../../types';

export const ScriptStep: React.FC<{ ctx: EditorStepContext }> = ({ ctx }) => {
  return (
    <ProjectOverview
      project={ctx.activeProject}
      activeEpisodeId={ctx.activeEpisode?.id}
      onEnterEpisode={(episode: Episode, options) => {
        // 选剧集 → 同步到上层；旧“开始制作”入口统一回到项目工作台。
        ctx.onActiveEpisodeChange?.(episode);
        if (options?.mode === 'start-production') {
          ctx.onStepChange('script');
        }
      }}
      onOpenAssets={() => ctx.onStepChange('assets')}
      onOpenStoryboard={() => ctx.onStepChange('storyboard')}
      onProjectUpdate={(updates: Partial<Project>) => ctx.onProjectUpdate?.(updates)}
      onScriptChange={(text) => ctx.onScriptChange?.(text)}
      openImportSignal={ctx.scriptImportSignal}
    />
  );
};
