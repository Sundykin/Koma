/**
 * Workflow 模块统一导出
 */
export { shotRenderWorkflow, batchRenderShots } from './shotRenderWorkflow';
export { generateScript } from './scriptGenerator';
export { generateShotList } from './shotListGenerator';
export {
  generateSceneImage,
  generateAllSceneImages,
  generatePropImage,
  generateAllPropImages,
  generatePropPreviewVideo,
  extractAndBindProp,
} from './scenePropAssetWorkflow';
export {
  generateCostumePhoto,
  generateCharacterPreviewVideo,
  extractAndBindCharacter,
  buildCostumePhotoPrompt,
  getCharacterPrompt,
} from './characterAssetWorkflow';
export { initWorkflowDelegates } from './workflowAdapter';
