/**
 * 用户友好的错误消息映射
 * 将技术性 API 错误转换为用户可理解的提示
 */

// IPC 错误码 → 用户消息
const IPC_ERROR_CODE_MAP: Record<string, string> = {
  // 通用
  UNKNOWN_ERROR: '操作失败，请重试',
  INVALID_PARAMS: '参数有误，请检查输入',
  NOT_FOUND: '请求的资源不存在',
  PERMISSION_DENIED: '没有权限执行此操作',
  TIMEOUT: '操作超时，请稍后重试',
  HANDLER_NOT_FOUND: '功能暂不可用',

  // 项目
  PROJECT_NOT_FOUND: '项目不存在，可能已被删除',
  PROJECT_CREATE_FAILED: '项目创建失败，请重试',
  PROJECT_IMPORT_FAILED: '项目导入失败，请检查文件格式',
  PROJECT_EXPORT_FAILED: '项目导出失败，请检查存储空间',

  // 持久化
  PERSISTENCE_READ_FAILED: '数据读取失败，请重试',
  PERSISTENCE_WRITE_FAILED: '数据保存失败，请检查存储空间',
  PERSISTENCE_DELETE_FAILED: '数据删除失败',
  PERSISTENCE_BATCH_FAILED: '批量操作失败，已自动回滚',

  // Chat
  CHAT_SESSION_NOT_FOUND: '会话不存在，请创建新会话',
  CHAT_SEND_FAILED: '消息发送失败，请重试',
  CHAT_STREAM_FAILED: 'AI 响应中断，请重试',
  CHAT_NO_PROVIDER: '未配置 AI 模型，请先在设置中配置',
  CHAT_PROVIDER_ERROR: 'AI 服务出错，请检查配置或稍后重试',
  CHAT_PLAN_PARSE_FAILED: 'AI 返回格式异常，正在重试',

  // Provider
  PROVIDER_NOT_FOUND: '未找到对应的 AI 服务',
  PROVIDER_CONFIG_INVALID: 'AI 服务配置有误，请检查设置',
  PROVIDER_KEY_INVALID: 'API Key 无效或已过期，请检查配置',
  PROVIDER_QUOTA_EXCEEDED: 'API 额度不足，请检查账户余额',
  PROVIDER_NETWORK_ERROR: '无法连接 AI 服务，请检查网络',

  // 插件
  PLUGIN_NOT_FOUND: '插件不存在',
  PLUGIN_INSTALL_FAILED: '插件安装失败',
  PLUGIN_ACTIVATE_FAILED: '插件启动失败，请检查兼容性',
  PLUGIN_SANDBOX_ERROR: '插件运行出错',
  PLUGIN_CONFLICT: '插件冲突，请先卸载同名插件',

  // MCP
  MCP_CONNECTION_FAILED: 'MCP 服务连接失败',
  MCP_TOOL_CALL_FAILED: '工具调用失败',
  MCP_SERVER_NOT_FOUND: 'MCP 服务不存在',

  // 工作流
  WORKFLOW_NOT_FOUND: '工作流不存在',
  WORKFLOW_EXEC_FAILED: '工作流执行失败',
  WORKFLOW_NODE_FAILED: '工作流节点执行失败',
  WORKFLOW_CANCELLED: '工作流已取消',

  // 文件
  FS_NOT_FOUND: '文件不存在',
  FS_READ_FAILED: '文件读取失败',
  FS_WRITE_FAILED: '文件写入失败，请检查存储空间',
  FS_ACCESS_DENIED: '没有文件访问权限',

  // FFmpeg
  FFMPEG_NOT_FOUND: '未检测到 FFmpeg，请安装后重试',
  FFMPEG_EXEC_FAILED: '音视频处理失败',

  // 配置
  CONFIG_READ_FAILED: '配置读取失败',
  CONFIG_WRITE_FAILED: '配置保存失败',
  CONFIG_MIGRATION_FAILED: '配置升级失败，请联系支持',
  CONFIG_SECRETS_UNAVAILABLE: '安全存储不可用，密钥将以明文保存',
};

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
 * 将 IPC 错误码转换为用户友好消息
 */
export function ipcCodeToMessage(code: string): string | undefined {
  return IPC_ERROR_CODE_MAP[code];
}

/**
 * 将技术错误转换为用户友好消息
 * 优先匹配 IPC 错误码，其次匹配 HTTP 状态码，最后匹配关键词
 */
export function toUserMessage(error: unknown): string {
  if (!error) return '未知错误';

  // IPC envelope error object: { code, message }
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: string }).code;
    const mapped = IPC_ERROR_CODE_MAP[code];
    if (mapped) return mapped;
  }

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
