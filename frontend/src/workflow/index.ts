/**
 * Workflow 模块统一导出
 */
export { WorkflowManager, workflowManager } from './workflowManager';
export { shotRenderWorkflow } from './shotRenderWorkflow';
export { generateScript } from './scriptGenerator';
export { generateShotList } from './shotListGenerator';

// 注册工作流处理器
import { workflowManager } from './workflowManager';
import { shotRenderWorkflow } from './shotRenderWorkflow';

workflowManager.registerHandler('shot-render', shotRenderWorkflow);
