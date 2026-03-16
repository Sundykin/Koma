/**
 * LLM JSON 解析工具
 * 处理 LLM 返回的不规范 JSON，支持自动修复和多级降级
 */
import { jsonrepair } from 'jsonrepair';

/**
 * 从 LLM 响应文本中提取 JSON 字符串
 * 支持 ```json 代码块、裸 JSON 等格式
 */
function extractJSON(text: string): string {
  const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/) ||
                         text.match(/```\s*([\s\S]*?)\s*```/);
  const raw = jsonBlockMatch ? jsonBlockMatch[1] : text;

  return raw.trim().replace(/^[^{[]*/, '').replace(/[^}\]]*$/, '');
}

/**
 * 解析 LLM 返回的 JSON，带三级降级：
 * 1. 直接 JSON.parse（提取后的文本）
 * 2. jsonrepair 修复后解析（提取后的文本）
 * 3. jsonrepair 直接处理原始文本（绕过提取逻辑）
 */
export function parseLLMJSON<T>(text: string): T {
  if (!text || !text.trim()) {
    throw new Error('JSON 解析失败: LLM 返回内容为空');
  }

  const cleaned = extractJSON(text);

  if (cleaned) {
    // 第一级：直接解析提取结果
    try {
      return JSON.parse(cleaned);
    } catch {
      // fall through
    }

    // 第二级：jsonrepair 修复提取结果后解析
    try {
      const repaired = jsonrepair(cleaned);
      return JSON.parse(repaired);
    } catch {
      // fall through
    }
  }

  // 第三级：对原始文本尝试 jsonrepair（extractJSON 可能提取为空或截断有误）
  try {
    const repaired = jsonrepair(text.trim());
    return JSON.parse(repaired);
  } catch (finalError) {
    throw new Error(
      `JSON 解析失败: ${finalError instanceof Error ? finalError.message : String(finalError)}`
    );
  }
}
