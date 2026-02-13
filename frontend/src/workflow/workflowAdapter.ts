/**
 * 工作流适配器
 * 将现有前端工作流函数注册为后端 DAG 编排器的委托处理器
 * 后端负责 DAG 调度（拓扑排序、并行、HITL），前端负责实际执行
 */
import { registerDelegateHandlers } from '../services/workflowBridge';
import { generateShotList } from './shotListGenerator';
import { generateAllSceneImages, generateAllPropImages } from './scenePropAssetWorkflow';
import { generateCostumePhoto } from './characterAssetWorkflow';
import { batchRenderShots } from './shotRenderWorkflow';
import { loadScenes, loadProps, loadCharacters } from '../store/projectStore';

/**
 * 初始化工作流委托处理器
 * 在应用启动时调用一次
 */
export function initWorkflowDelegates(): () => void {
  return registerDelegateHandlers({
    'script-analysis': async (params, context) => {
      const scriptText = (context.scriptText || params.scriptText) as string;
      if (!scriptText) throw new Error('缺少剧本文本');
      return { scriptText, analyzed: true };
    },

    'shot-breakdown': async (params, context) => {
      const settings = context.settings as any;
      const scriptText = (context['output:script-analysis'] as any)?.scriptText
        || context.scriptText as string;
      if (!scriptText) throw new Error('缺少剧本文本');
      const shots = await generateShotList(
        { settings, scriptText },
        () => {}
      );
      return { shots };
    },

    'scene-assets': async (params, context) => {
      const projectId = context.projectId as string;
      if (!projectId) throw new Error('缺少 projectId');

      const scenes = await loadScenes(projectId);
      const props = await loadProps(projectId);
      if (scenes.length === 0 && props.length === 0) {
        return { scenes: 0, props: 0 };
      }

      const opts = {
        projectId,
        theme: context.theme as string | undefined,
        stylePrompt: context.stylePrompt as string | undefined,
        ttiConfigId: (context.projectConfigIds as any)?.ttiConfigId,
      };

      const sceneResult = scenes.length > 0
        ? await generateAllSceneImages({ ...opts, scenes, onProgress: () => {} })
        : { success: 0, failed: 0 };

      const propResult = props.length > 0
        ? await generateAllPropImages({ ...opts, props, onProgress: () => {} })
        : { success: 0, failed: 0 };

      return {
        scenes: sceneResult.success,
        scenesFailed: sceneResult.failed,
        props: propResult.success,
        propsFailed: propResult.failed,
      };
    },

    'character-assets': async (params, context) => {
      const projectId = context.projectId as string;
      if (!projectId) throw new Error('缺少 projectId');

      const characters = await loadCharacters(projectId);
      if (characters.length === 0) return { generated: 0 };

      const results = [];
      for (const character of characters) {
        const result = await generateCostumePhoto({
          projectId,
          character,
          theme: context.theme as string | undefined,
          stylePrompt: context.stylePrompt as string | undefined,
          ttiConfigId: (context.projectConfigIds as any)?.ttiConfigId,
          onProgress: () => {},
        });
        results.push({ characterId: character.id, ...result });
      }

      const success = results.filter(r => r.success).length;
      return { generated: success, failed: results.length - success, results };
    },

    'shot-render': async (params, context) => {
      const projectId = context.projectId as string;
      if (!projectId) throw new Error('缺少 projectId');

      // 优先从上游 shot-breakdown 获取分镜数据
      const shots = (context['output:shot-breakdown'] as any)?.shots;
      if (!shots || shots.length === 0) throw new Error('缺少分镜数据');

      const result = await batchRenderShots(
        {
          projectId,
          shots,
          projectConfigIds: context.projectConfigIds as any,
          theme: context.theme as string | undefined,
          stylePrompt: context.stylePrompt as string | undefined,
        },
        () => {}
      );

      return {
        total: result.total,
        success: result.success,
        failed: result.failed,
      };
    },
  });
}
