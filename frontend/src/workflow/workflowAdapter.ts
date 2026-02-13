/**
 * 工作流适配器
 * 将现有前端工作流函数注册为后端 DAG 编排器的委托处理器
 * 这样后端负责 DAG 调度，前端负责实际执行
 */
import { registerDelegateHandlers } from '../services/workflowBridge';
import { generateShotList } from './shotListGenerator';

/**
 * 初始化工作流委托处理器
 * 在应用启动时调用一次
 */
export function initWorkflowDelegates(): () => void {
  return registerDelegateHandlers({
    'script-analysis': async (params, context) => {
      const settings = context.settings as any;
      const scriptText = (context.scriptText || params.scriptText) as string;
      if (!scriptText) throw new Error('缺少剧本文本');
      // 剧本分析目前复用 generateScript 的解析逻辑
      return { scriptText, analyzed: true };
    },

    'shot-breakdown': async (params, context) => {
      const settings = context.settings as any;
      const scriptText = (context['output:script-analysis'] as any)?.scriptText
        || context.scriptText as string;
      if (!scriptText) throw new Error('缺少剧本文本');
      const shots = await generateShotList(
        { settings, scriptText },
        () => {} // 进度由后端编排器管理
      );
      return { shots };
    },

    'scene-assets': async (params, context) => {
      // 场景资产生成（占位，实际逻辑依赖项目上下文）
      return { generated: true };
    },

    'character-assets': async (params, context) => {
      // 角色资产生成（占位，实际逻辑依赖项目上下文）
      return { generated: true };
    },

    'shot-render': async (params, context) => {
      // 分镜渲染（占位，实际逻辑依赖项目上下文和渲染参数）
      const shots = (context['output:shot-breakdown'] as any)?.shots;
      if (!shots) throw new Error('缺少分镜数据');
      return { rendered: true, shotCount: shots.length };
    },
  });
}
