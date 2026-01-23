/**
 * 可配置的通用 Provider
 * 根据 ChannelConfig 配置动态执行 API 调用
 */
import type { ProgressInfo } from '../../types';
import type {
  ChannelConfig,
  ChannelContext,
  ChannelResult,
  ChannelProgressInfo,
  ChannelValidationResult,
} from './types';
import { renderTemplate, renderUrl, buildBodyFromMappings, parseJsonTemplate } from './templateEngine';
import { extractValue, mapStatus, extractFields } from './jsonPathResolver';

export class ConfigurableProvider {
  private config: ChannelConfig;

  constructor(config: ChannelConfig) {
    this.config = config;
  }

  /**
   * 验证配置有效性
   */
  validate(): ChannelValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.config.id) {
      errors.push('渠道 ID 不能为空');
    }
    if (!this.config.name) {
      errors.push('渠道名称不能为空');
    }
    if (!this.config.baseUrl) {
      errors.push('基础 URL 不能为空');
    }
    if (!this.config.auth.keyValue && this.config.auth.type !== 'none') {
      warnings.push('API Key 未配置');
    }
    if (!this.config.generate.url) {
      errors.push('生成接口 URL 不能为空');
    }
    if (!this.config.query.url) {
      errors.push('查询接口 URL 不能为空');
    }
    if (!this.config.generate.responseMapping.taskId) {
      errors.push('生成接口响应映射缺少 taskId');
    }
    if (!this.config.query.responseMapping.status) {
      errors.push('查询接口响应映射缺少 status');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 构建请求头
   */
  private buildHeaders(extraHeaders?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...extraHeaders,
    };

    const { auth } = this.config;

    switch (auth.type) {
      case 'bearer':
        headers['Authorization'] = `Bearer ${auth.keyValue}`;
        break;
      case 'header':
        if (auth.keyName) {
          const prefix = auth.prefix || '';
          headers[auth.keyName] = `${prefix}${auth.keyValue}`;
        }
        break;
      case 'query':
        // query 类型在 URL 中处理
        break;
      case 'none':
        // 无需鉴权
        break;
    }

    return headers;
  }

  /**
   * 构建 URL（处理 query 类型鉴权）
   */
  private buildUrl(urlTemplate: string, context: ChannelContext): string {
    let url = renderUrl(urlTemplate, { ...context, baseUrl: this.config.baseUrl });

    // 处理 query 类型鉴权
    if (this.config.auth.type === 'query' && this.config.auth.keyName) {
      const separator = url.includes('?') ? '&' : '?';
      url += `${separator}${this.config.auth.keyName}=${encodeURIComponent(this.config.auth.keyValue)}`;
    }

    return url;
  }

  /**
   * 构建请求体
   */
  private buildBody(context: ChannelContext): string {
    const { generate } = this.config;

    if (generate.bodyTemplate) {
      // 使用模板
      const body = parseJsonTemplate(generate.bodyTemplate, context);
      return JSON.stringify(body);
    } else if (generate.bodyMapping) {
      // 使用字段映射
      const body = buildBodyFromMappings(generate.bodyMapping, context);
      return JSON.stringify(body);
    }

    return '{}';
  }

  /**
   * 执行生成任务
   * @param context 执行上下文
   * @returns 任务 ID
   */
  async generate(context: ChannelContext): Promise<ChannelResult> {
    const { generate } = this.config;

    const url = this.buildUrl(generate.url, context);
    const headers = this.buildHeaders(generate.headers);
    const body = this.buildBody(context);

    const response = await fetch(url, {
      method: generate.method,
      headers,
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`生成任务失败 (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    // 提取任务 ID
    const taskId = extractValue(data, generate.responseMapping.taskId);
    if (!taskId) {
      throw new Error('无法从响应中提取任务 ID');
    }

    return {
      taskId: String(taskId),
      rawResponse: data,
    };
  }

  /**
   * 查询任务进度
   * @param taskId 任务 ID
   * @returns 进度信息
   */
  async checkProgress(taskId: string): Promise<ChannelProgressInfo> {
    const { query } = this.config;

    const context: ChannelContext = {
      baseUrl: this.config.baseUrl,
      apiKey: this.config.auth.keyValue,
      taskId,
    };

    const url = this.buildUrl(query.url, context);
    const headers = this.buildHeaders(query.headers);

    const fetchOptions: RequestInit = {
      method: query.method,
      headers,
    };

    if (query.method === 'POST' && query.body) {
      fetchOptions.body = renderTemplate(query.body, context);
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      return {
        taskId,
        status: 'failed',
        progress: 0,
        error: `查询失败 (${response.status})`,
      };
    }

    const data = await response.json();
    const { responseMapping, statusMapping } = query;

    // 提取状态
    const rawStatus = extractValue(data, responseMapping.status);
    const status = mapStatus(String(rawStatus || ''), statusMapping);

    // 提取进度
    const progress = responseMapping.progress
      ? Number(extractValue(data, responseMapping.progress)) || 0
      : status === 'completed' ? 100 : status === 'failed' ? 0 : 50;

    const result: ChannelProgressInfo = {
      taskId,
      status,
      progress,
      rawResponse: data,
    };

    // 提取结果 URL
    if (status === 'completed' && responseMapping.resultUrl) {
      result.resultUrl = extractValue(data, responseMapping.resultUrl);
    }

    // 提取错误信息
    if (status === 'failed' && responseMapping.error) {
      result.error = extractValue(data, responseMapping.error) || '任务失败';
    }

    // 提取额外字段
    if (responseMapping.extra) {
      result.extra = extractFields(data, responseMapping.extra);
    }

    return result;
  }

  /**
   * 执行任务并轮询结果
   * @param context 执行上下文
   * @param onProgress 进度回调
   * @returns 最终结果
   */
  async executeWithPolling(
    context: ChannelContext,
    onProgress?: (progress: ChannelProgressInfo) => void
  ): Promise<ChannelProgressInfo> {
    // 创建任务
    const { taskId } = await this.generate(context);

    const { polling } = this.config;
    const startTime = Date.now();

    // 初始延迟
    if (polling.initialDelay) {
      await this.delay(polling.initialDelay);
    }

    // 轮询
    while (Date.now() - startTime < polling.maxDuration) {
      const progress = await this.checkProgress(taskId);

      if (onProgress) {
        onProgress(progress);
      }

      if (progress.status === 'completed' || progress.status === 'failed') {
        return progress;
      }

      await this.delay(polling.interval);
    }

    // 超时
    return {
      taskId,
      status: 'failed',
      progress: 0,
      error: '任务超时',
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取渠道配置
   */
  getConfig(): ChannelConfig {
    return this.config;
  }

  /**
   * 获取渠道类型
   */
  getType(): string {
    return this.config.type;
  }

  /**
   * 获取渠道名称
   */
  getName(): string {
    return this.config.name;
  }
}
