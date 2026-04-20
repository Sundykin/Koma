/**
 * LLM JSON 解析工具
 * 处理 LLM 返回的不规范 JSON，支持自动修复和多级降级
 */
import { jsonrepair } from 'jsonrepair';
import { createLogger } from '../store/logger';

const logger = createLogger('LLMJsonParser');

function previewText(s: string, headLen = 200, tailLen = 200) {
  if (s.length <= headLen + tailLen) {
    return { length: s.length, head: s, tail: '' };
  }
  return {
    length: s.length,
    head: s.slice(0, headLen),
    tail: s.slice(-tailLen),
  };
}

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
    logger.warn('解析终止：LLM 返回为空');
    throw new Error('JSON 解析失败: LLM 返回内容为空');
  }

  const cleaned = extractJSON(text);
  logger.debug('开始解析', {
    rawLength: text.length,
    cleanedLength: cleaned.length,
    rawPreview: previewText(text),
  });

  if (cleaned) {
    // 第一级：直接解析提取结果
    try {
      const result = JSON.parse(cleaned) as T;
      logger.debug('一级解析成功（直接 JSON.parse）');
      return result;
    } catch (err) {
      logger.debug('一级解析失败', { error: (err as Error).message });
    }

    // 第二级：jsonrepair 修复提取结果后解析
    try {
      const repaired = jsonrepair(cleaned);
      const result = JSON.parse(repaired) as T;
      logger.info('二级解析成功（jsonrepair 提取文本）', { repairedLength: repaired.length });
      return result;
    } catch (err) {
      logger.debug('二级解析失败', { error: (err as Error).message });
    }
  }

  // 第三级：对原始文本尝试 jsonrepair（extractJSON 可能提取为空或截断有误）
  try {
    const repaired = jsonrepair(text.trim());
    const result = JSON.parse(repaired) as T;
    logger.info('三级解析成功（jsonrepair 原始文本）', { repairedLength: repaired.length });
    return result;
  } catch (finalError) {
    const errMsg = finalError instanceof Error ? finalError.message : String(finalError);
    logger.error('三级降级全部失败', {
      error: errMsg,
      raw: previewText(text),
      cleaned: previewText(cleaned),
    });
    throw new Error(`JSON 解析失败: ${errMsg}`);
  }
}
