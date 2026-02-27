/**
 * 用户友好的错误消息映射
 * 将技术性 API 错误转换为用户可理解的提示
 */

// HTTP 状态码 → 用户消息
const HTTP_ERROR_MAP: Record<number, string> = {
  400: '请求参数有误，请检查配置',
  401: 'API Key 无效或已过期，请检查配置',
  403: '无权访问该服务，请检查 API Key 权限',
  404: 'API 地址不正确，请检查服务地址',
  429: 'API 请求过于频繁或额度不足，请稍后重试',
  500: '服务端内部错误，请稍后重试',
  502: '服务暂时不可用，请稍后重试',
  503: '服务维护中，请稍后重试',
  504: '服务响应超时，请检查网络或稍后重试',
};

// 错误关键词 → 用户消息
const ERROR_KEYWORD_MAP: Array<[RegExp, string]> = [
  [/timeout|timed?\s*out|ETIMEDOUT/i, '连接超时，请检查网络或服务地址'],
  [/ECONNREFUSED/i, '无法连接到服务，请检查服务地址是否正确且服务已启动'],
  [/ENOTFOUND|DNS/i, '无法解析服务地址，请检查地址是否正确'],
  [/network|fetch failed|ERR_NETWORK/i, '网络连接失败，请检查网络设置'],
  [/quota|rate.?limit|too many/i, 'API 额度不足或请求过于频繁，请稍后重试或检查账户余额'],
  [/invalid.*key|unauthorized|authentication/i, 'API Key 无效，请检查配置'],
  [/not.?implemented|not.?supported/i, '该功能暂未实现'],
  [/insufficient.*balance|余额/i, '账户余额不足，请充值后重试'],
];

/**
 * 将技术错误转换为用户友好消息
 */
export function toUserMessage(error: unknown): string {
  if (!error) return '未知错误';

  const msg = error instanceof Error ? error.message : String(error);

  // 检查 HTTP 状态码
  const statusMatch = msg.match(/status[:\s]*(\d{3})/i);
  if (statusMatch) {
    const code = parseInt(statusMatch[1]);
    if (HTTP_ERROR_MAP[code]) return HTTP_ERROR_MAP[code];
  }

  // 检查关键词
  for (const [pattern, userMsg] of ERROR_KEYWORD_MAP) {
    if (pattern.test(msg)) return userMsg;
  }

  // 如果消息较短且不含技术术语，直接返回
  if (msg.length < 80 && !/stack|trace|at\s+\w/i.test(msg)) {
    return msg;
  }

  return '操作失败，请重试或检查配置';
}

/**
 * 格式化连接测试结果
 */
export function formatTestResult(
  success: boolean,
  latencyMs?: number,
  error?: string
): { text: string; type: 'success' | 'error' } {
  if (success) {
    const latency = latencyMs ? ` (${latencyMs}ms)` : '';
    return { text: `连接成功${latency}`, type: 'success' };
  }
  return { text: error || '连接失败，请检查配置', type: 'error' };
}
