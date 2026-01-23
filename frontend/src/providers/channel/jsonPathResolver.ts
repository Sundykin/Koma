/**
 * JSONPath 解析器
 * 支持简单的 JSONPath 表达式
 */

// 支持的 JSONPath 语法：
// $.field           - 根级字段
// $.field.subfield  - 嵌套字段
// $.field[0]        - 数组索引
// $.field[*]        - 数组所有元素（返回数组）
// $.field[0].name   - 数组元素的字段

const JSONPATH_REGEX = /^\$\.?(.*)$/;
const ARRAY_INDEX_REGEX = /^(\w+)\[(\d+|\*)\]$/;

/**
 * 从 JSON 对象中提取值
 * @param data JSON 对象
 * @param path JSONPath 表达式
 * @returns 提取的值或 undefined
 */
export function extractValue(data: any, path: string): any {
  if (!data || !path) {
    return undefined;
  }

  // 检查是否是有效的 JSONPath
  const match = JSONPATH_REGEX.exec(path);
  if (!match) {
    return undefined;
  }

  const pathPart = match[1];
  if (!pathPart) {
    return data;
  }

  // 分割路径
  const segments = parsePathSegments(pathPart);
  let current = data;

  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }

    // 检查是否是数组访问
    const arrayMatch = ARRAY_INDEX_REGEX.exec(segment);
    if (arrayMatch) {
      const fieldName = arrayMatch[1];
      const indexOrWildcard = arrayMatch[2];

      // 获取数组字段
      current = current[fieldName];
      if (!Array.isArray(current)) {
        return undefined;
      }

      if (indexOrWildcard === '*') {
        // 通配符，返回整个数组（后续处理）
        continue;
      } else {
        const index = parseInt(indexOrWildcard, 10);
        current = current[index];
      }
    } else {
      current = current[segment];
    }
  }

  return current;
}

/**
 * 解析路径段
 * 处理点号分���，同时保留数组访问语法
 */
function parsePathSegments(path: string): string[] {
  const segments: string[] = [];
  let current = '';
  let inBracket = false;

  for (let i = 0; i < path.length; i++) {
    const char = path[i];

    if (char === '[') {
      inBracket = true;
      current += char;
    } else if (char === ']') {
      inBracket = false;
      current += char;
    } else if (char === '.' && !inBracket) {
      if (current) {
        segments.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current) {
    segments.push(current);
  }

  return segments;
}

/**
 * 根据状态映射确定统一状态
 * @param rawStatus 原始状态值
 * @param mapping 状态映射配置
 * @returns 统一状态
 */
export function mapStatus(
  rawStatus: string,
  mapping: {
    pending: string[];
    processing: string[];
    completed: string[];
    failed: string[];
  }
): 'queued' | 'processing' | 'completed' | 'failed' {
  const status = String(rawStatus).toLowerCase();

  if (mapping.pending.some(s => s.toLowerCase() === status)) {
    return 'queued';
  }
  if (mapping.processing.some(s => s.toLowerCase() === status)) {
    return 'processing';
  }
  if (mapping.completed.some(s => s.toLowerCase() === status)) {
    return 'completed';
  }
  if (mapping.failed.some(s => s.toLowerCase() === status)) {
    return 'failed';
  }

  // 默认为 processing
  return 'processing';
}

/**
 * 从响应中提取多个字段
 * @param data 响应数据
 * @param mappings 字段映射 { fieldName: jsonPath }
 * @returns 提取的字段对象
 */
export function extractFields(
  data: any,
  mappings: Record<string, string>
): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [fieldName, jsonPath] of Object.entries(mappings)) {
    const value = extractValue(data, jsonPath);
    if (value !== undefined) {
      result[fieldName] = value;
    }
  }

  return result;
}
