/**
 * 模板引擎
 * 支持 {{variable}} 格式的占位符替换
 */
import type { ChannelContext } from './types';

// 占位符正则
const PLACEHOLDER_REGEX = /\{\{(\w+(?:\.\w+)*)\}\}/g;

/**
 * 从对象中获取嵌套属性值
 * @param obj 对象
 * @param path 属性路径，如 "metadata.style" 或 "imageUrls"
 * @returns 属性值或 undefined
 */
function getNestedValue(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

/**
 * 替换模板中的占位符
 * @param template 模板字符串
 * @param context 上下文变量
 * @returns 替换后的字符串
 */
export function renderTemplate(template: string, context: ChannelContext): string {
  return template.replace(PLACEHOLDER_REGEX, (match, path) => {
    const value = getNestedValue(context, path);

    if (value === undefined || value === null) {
      return '';
    }

    // 数组和对象序列化为 JSON
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    return String(value);
  });
}

/**
 * 替换 URL 中的占位符
 * @param url URL 模板
 * @param context 上下文变量
 * @returns 替换后的 URL
 */
export function renderUrl(url: string, context: ChannelContext): string {
  return renderTemplate(url, context);
}

/**
 * 根据字段映射构建请求体
 * @param mappings 字段映射配置
 * @param context 上下文变量
 * @returns 请求体对象
 */
export function buildBodyFromMappings(
  mappings: Array<{
    name: string;
    source: string;
    type?: string;
    defaultValue?: any;
    required?: boolean;
    condition?: string;
  }>,
  context: ChannelContext
): Record<string, any> {
  const body: Record<string, any> = {};

  for (const mapping of mappings) {
    // 检查条件
    if (mapping.condition) {
      const conditionValue = getNestedValue(context, mapping.condition);
      if (!conditionValue) {
        continue;
      }
    }

    // 获取值
    let value = getNestedValue(context, mapping.source);

    // 使用默认值
    if (value === undefined || value === null) {
      if (mapping.defaultValue !== undefined) {
        value = mapping.defaultValue;
      } else if (mapping.required) {
        throw new Error(`Required field "${mapping.source}" is missing`);
      } else {
        continue;
      }
    }

    // 类型转换
    if (mapping.type) {
      switch (mapping.type) {
        case 'number':
          value = Number(value);
          break;
        case 'boolean':
          value = Boolean(value);
          break;
        case 'string':
          value = String(value);
          break;
        case 'array':
          if (!Array.isArray(value)) {
            value = [value];
          }
          break;
      }
    }

    // 设置嵌套属性
    setNestedValue(body, mapping.name, value);
  }

  return body;
}

/**
 * 设置对象的嵌套属性值
 * @param obj 对象
 * @param path 属性路径，如 "metadata.style"
 * @param value 值
 */
function setNestedValue(obj: any, path: string, value: any): void {
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current)) {
      current[part] = {};
    }
    current = current[part];
  }

  current[parts[parts.length - 1]] = value;
}

/**
 * 解析 JSON 模板并替换占位符
 * @param template JSON 模板字符串
 * @param context 上下文变量
 * @returns 解析后的对象
 */
export function parseJsonTemplate(template: string, context: ChannelContext): Record<string, any> {
  // 首先替换所有占位符
  const renderedJson = renderTemplate(template, context);

  // 解析 JSON
  try {
    return JSON.parse(renderedJson);
  } catch (e) {
    throw new Error(`Failed to parse JSON template: ${(e as Error).message}`);
  }
}

/**
 * 检查模板中使用的变量
 * @param template 模板字符串
 * @returns 变量名列表
 */
export function extractVariables(template: string): string[] {
  const variables: string[] = [];
  let match;

  while ((match = PLACEHOLDER_REGEX.exec(template)) !== null) {
    if (!variables.includes(match[1])) {
      variables.push(match[1]);
    }
  }

  // 重置正则状态
  PLACEHOLDER_REGEX.lastIndex = 0;

  return variables;
}
