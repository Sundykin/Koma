/**
 * API Key 存储服务
 * 简化版：不加密，直接存储
 */

/**
 * "加密"设置 - 实际直接返回原值
 */
export async function encryptSettings<T>(settings: T): Promise<T> {
  return settings;
}

/**
 * "解密"设置 - 实际直接返回原值
 */
export async function decryptSettings<T>(settings: T): Promise<T> {
  return settings;
}

export default {
  encryptSettings,
  decryptSettings,
};
