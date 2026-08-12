import { describe, expect, it } from 'vitest';
import {
  buildTunnelHeaders,
  isNgrokTunnelUrl,
  resolveComfyAuthMode,
  validateBasicCredential,
} from './remoteAccess';
import { toBasicAuthorization } from '../channel/auth';

describe('isNgrokTunnelUrl / buildTunnelHeaders', () => {
  it('识别各代 ngrok 域名', () => {
    expect(isNgrokTunnelUrl('https://lightsome-noncomprehensiblely-bryleigh.ngrok-free.dev')).toBe(true);
    expect(isNgrokTunnelUrl('https://a.ngrok-free.app/view?filename=x.mp4')).toBe(true);
    expect(isNgrokTunnelUrl('https://a.ngrok.io')).toBe(true);
  });

  it('自建域名与局域网地址不加隧道 header', () => {
    expect(isNgrokTunnelUrl('http://192.168.1.10:8188')).toBe(false);
    expect(isNgrokTunnelUrl('https://comfy.example.com')).toBe(false);
    // 防止 endsWith 被伪造域名骗过
    expect(isNgrokTunnelUrl('https://evil-ngrok-free.dev.attacker.com')).toBe(false);
    expect(isNgrokTunnelUrl('not a url')).toBe(false);
    expect(isNgrokTunnelUrl(undefined)).toBe(false);
  });

  it('ngrok 主机才带 skip-warning header', () => {
    expect(buildTunnelHeaders('https://a.ngrok-free.dev')).toEqual({ 'ngrok-skip-browser-warning': 'true' });
    expect(buildTunnelHeaders('http://127.0.0.1:8188')).toEqual({});
  });
});

describe('resolveComfyAuthMode', () => {
  it('归一各种写法', () => {
    expect(resolveComfyAuthMode('basic')).toBe('basic');
    expect(resolveComfyAuthMode('Basic-Auth')).toBe('basic');
    expect(resolveComfyAuthMode('bearer')).toBe('bearer');
    expect(resolveComfyAuthMode('BEARER-HEADER')).toBe('bearer');
  });

  it('未声明 / 无法识别一律当无认证（局域网直连是默认场景）', () => {
    expect(resolveComfyAuthMode(undefined)).toBe('none');
    expect(resolveComfyAuthMode('')).toBe('none');
    expect(resolveComfyAuthMode('whatever')).toBe('none');
  });
});

describe('validateBasicCredential', () => {
  it('用户名:密码 通过', () => {
    expect(validateBasicCredential('comfy:vFtF3k6ce7oU2jSx')).toBeNull();
  });

  it('已经是整段 Basic header 值也放行', () => {
    expect(validateBasicCredential('Basic Y29tZnk6cHdk')).toBeNull();
  });

  it('缺冒号或空值给出可读错误', () => {
    expect(validateBasicCredential('justapassword')).toContain('冒号');
    expect(validateBasicCredential('')).toContain('没填凭据');
    expect(validateBasicCredential(undefined)).toContain('没填凭据');
  });
});

describe('toBasicAuthorization', () => {
  it('按 RFC 7617 编码 用户名:密码', () => {
    expect(toBasicAuthorization('comfy:vFtF3k6ce7oU2jSx')).toBe('Basic Y29tZnk6dkZ0RjNrNmNlN29VMmpTeA==');
  });

  it('已带前缀的值原样返回', () => {
    expect(toBasicAuthorization('Basic Y29tZnk6cHdk')).toBe('Basic Y29tZnk6cHdk');
  });

  it('非 ASCII 密码按 UTF-8 编码而不是抛错', () => {
    // btoa 直接吃中文会抛 InvalidCharacterError，必须先转 UTF-8 字节
    expect(() => toBasicAuthorization('comfy:密码')).not.toThrow();
    expect(toBasicAuthorization('comfy:密码')).toBe('Basic Y29tZnk65a+G56CB');
  });
});
