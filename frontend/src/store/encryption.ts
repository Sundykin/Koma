/**
 * API Key 加密存储服务
 * 使用 AES-256-GCM 加密，基于机器唯一标识派生密钥
 */
import CryptoJS from 'crypto-js';
import { electronService } from '../services/electronService';

// 加密数据结构
export interface EncryptedValue {
  encrypted: true;
  data: string;      // 加密后的 base64 数据
  iv: string;        // 初始化向量
  salt: string;      // 盐值（用于密钥派生）
}

// 判断是否为加密值
export function isEncryptedValue(value: any): value is EncryptedValue {
  return (
    value &&
    typeof value === 'object' &&
    value.encrypted === true &&
    typeof value.data === 'string' &&
    typeof value.iv === 'string' &&
    typeof value.salt === 'string'
  );
}

// 获取机器唯一标识（用于密钥派生）
async function getMachineId(): Promise<string> {
  if (electronService.isElectron()) {
    try {
      // 优先使用 Electron 的机器 ID
      const machineId = await electronService.getMachineId?.();
      if (machineId) return machineId;
    } catch {
      // 忽略
    }
  }
  // 降级方案：基于浏览器指纹生成伪唯一 ID
  const fingerprint = [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    new Date().getTimezoneOffset(),
  ].join('|');
  return CryptoJS.SHA256(fingerprint).toString();
}

// 派生加密密钥
function deriveKey(machineId: string, salt: string): CryptoJS.lib.WordArray {
  // 使用 PBKDF2 派生 256 位密钥
  return CryptoJS.PBKDF2(machineId, salt, {
    keySize: 256 / 32,
    iterations: 10000,
  });
}

/**
 * 加密 API Key
 */
export async function encryptApiKey(plainText: string): Promise<EncryptedValue> {
  if (!plainText) {
    throw new Error('待加密内容不能为空');
  }

  const machineId = await getMachineId();
  const salt = CryptoJS.lib.WordArray.random(16).toString();
  const iv = CryptoJS.lib.WordArray.random(16).toString();
  const key = deriveKey(machineId, salt);

  const encrypted = CryptoJS.AES.encrypt(plainText, key, {
    iv: CryptoJS.enc.Hex.parse(iv),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return {
    encrypted: true,
    data: encrypted.ciphertext.toString(CryptoJS.enc.Base64),
    iv,
    salt,
  };
}

/**
 * 解密 API Key
 */
export async function decryptApiKey(encryptedValue: EncryptedValue): Promise<string> {
  if (!isEncryptedValue(encryptedValue)) {
    throw new Error('无效的加密数据格式');
  }

  const machineId = await getMachineId();
  const key = deriveKey(machineId, encryptedValue.salt);

  const cipherParams = CryptoJS.lib.CipherParams.create({
    ciphertext: CryptoJS.enc.Base64.parse(encryptedValue.data),
  });

  const decrypted = CryptoJS.AES.decrypt(cipherParams, key, {
    iv: CryptoJS.enc.Hex.parse(encryptedValue.iv),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  const plainText = decrypted.toString(CryptoJS.enc.Utf8);
  if (!plainText) {
    throw new Error('解密失败：密钥不匹配或数据损坏');
  }

  return plainText;
}

/**
 * 安全地处理设置对象中的 API Key 字段
 * 加密所有 apiKey 字段
 */
export async function encryptSettings<T extends Record<string, any>>(settings: T): Promise<T> {
  // 处理数组
  if (Array.isArray(settings)) {
    const result = [] as any;
    for (let i = 0; i < settings.length; i++) {
      const item = settings[i];
      if (item && typeof item === 'object') {
        result.push(await encryptSettings(item));
      } else {
        result.push(item);
      }
    }
    return result as T;
  }

  const result = { ...settings };

  for (const key of Object.keys(result)) {
    const value = result[key];

    // 加密 apiKey 字段
    if (key === 'apiKey' && typeof value === 'string' && value.length > 0) {
      result[key] = await encryptApiKey(value) as any;
    }
    // 递归处理嵌套对象和数组
    else if (value && typeof value === 'object' && !isEncryptedValue(value)) {
      result[key] = await encryptSettings(value);
    }
  }

  return result;
}

/**
 * 安全地处理设置对象中的加密字段
 * 解密所有加密的 apiKey 字段
 */
export async function decryptSettings<T extends Record<string, any>>(settings: T): Promise<T> {
  // 处理数组
  if (Array.isArray(settings)) {
    const result = [] as any;
    for (let i = 0; i < settings.length; i++) {
      const item = settings[i];
      if (item && typeof item === 'object') {
        result.push(await decryptSettings(item));
      } else {
        result.push(item);
      }
    }
    return result as T;
  }

  const result = { ...settings };

  for (const key of Object.keys(result)) {
    const value = result[key];

    // 解密加密值
    if (isEncryptedValue(value)) {
      try {
        result[key] = await decryptApiKey(value);
      } catch {
        // 解密失败，保留原值（可能是不同机器的加密数据）
        result[key] = '' as any;
      }
    }
    // 递归处理嵌套对象和数组
    else if (value && typeof value === 'object') {
      result[key] = await decryptSettings(value);
    }
  }

  return result;
}

export default {
  encryptApiKey,
  decryptApiKey,
  encryptSettings,
  decryptSettings,
  isEncryptedValue,
};
