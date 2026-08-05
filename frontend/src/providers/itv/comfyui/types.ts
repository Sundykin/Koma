/**
 * ComfyUI API 格式工作流（prompt 格式）类型定义。
 *
 * API 格式即 ComfyUI 前端「导出（API）」产物：以节点 id 为 key，
 * 每个节点含 class_type / inputs / _meta。inputs 的值要么是字面量，
 * 要么是 [上游节点 id, 输出槽位] 形式的连线。
 */

/** [上游节点 id, 输出槽位] */
export type ComfyLink = [string, number];

export interface ComfyWorkflowNode {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: { title?: string };
}

export type ComfyWorkflow = Record<string, ComfyWorkflowNode>;

export function isComfyLink(value: unknown): value is ComfyLink {
  return Array.isArray(value)
    && value.length === 2
    && typeof value[0] === 'string'
    && typeof value[1] === 'number';
}

/** ComfyUI /upload/image 响应，也是 LoadImage.inputs.image 的取值来源 */
export interface ComfyUploadedImage {
  name: string;
  subfolder?: string;
  type?: string;
}

/** LoadImage 在子目录下需要 `subfolder/name` 形式 */
export function toLoadImageValue(uploaded: ComfyUploadedImage): string {
  const subfolder = String(uploaded.subfolder || '').replace(/^\/+|\/+$/g, '');
  return subfolder ? `${subfolder}/${uploaded.name}` : uploaded.name;
}
