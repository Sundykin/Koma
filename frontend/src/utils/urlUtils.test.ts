/**
 * urlUtils 单元测试
 */
import { describe, it, expect } from 'vitest';
import { toKomaLocalUrl, fromKomaLocalUrl } from './urlUtils';

describe('urlUtils', () => {
  describe('toKomaLocalUrl', () => {
    it('should return empty string for empty input', () => {
      expect(toKomaLocalUrl('')).toBe('');
    });

    it('should return http URLs unchanged', () => {
      const url = 'http://example.com/image.png';
      expect(toKomaLocalUrl(url)).toBe(url);
    });

    it('should return https URLs unchanged', () => {
      const url = 'https://example.com/image.png';
      expect(toKomaLocalUrl(url)).toBe(url);
    });

    it('should return koma-local URLs unchanged', () => {
      const url = 'koma-local:///path/to/file.png';
      expect(toKomaLocalUrl(url)).toBe(url);
    });

    it('should return data URLs unchanged', () => {
      const url = 'data:image/png;base64,iVBORw0KGgo=';
      expect(toKomaLocalUrl(url)).toBe(url);
    });

    it('should return blob URLs unchanged', () => {
      const url = 'blob:http://localhost:3000/abc-123';
      expect(toKomaLocalUrl(url)).toBe(url);
    });

    it('should convert Unix local path to koma-local URL', () => {
      const path = '/home/user/images/photo.png';
      expect(toKomaLocalUrl(path)).toBe('koma-local:////home/user/images/photo.png');
    });

    it('should convert Windows local path to koma-local URL', () => {
      const path = 'C:\\Users\\user\\images\\photo.png';
      expect(toKomaLocalUrl(path)).toBe('koma-local:///C:/Users/user/images/photo.png');
    });

    it('should handle relative paths', () => {
      const path = 'images/photo.png';
      expect(toKomaLocalUrl(path)).toBe('koma-local:///images/photo.png');
    });

    it('should handle paths with spaces', () => {
      const path = '/home/user/my images/photo.png';
      expect(toKomaLocalUrl(path)).toBe('koma-local:////home/user/my images/photo.png');
    });

    it('should handle paths with special characters', () => {
      const path = '/home/user/图片/照片.png';
      expect(toKomaLocalUrl(path)).toBe('koma-local:////home/user/图片/照片.png');
    });
  });

  describe('fromKomaLocalUrl', () => {
    it('should return empty string for empty input', () => {
      expect(fromKomaLocalUrl('')).toBe('');
    });

    it('should extract path from koma-local URL', () => {
      const url = 'koma-local:///home/user/images/photo.png';
      expect(fromKomaLocalUrl(url)).toBe('home/user/images/photo.png');
    });

    it('should extract Windows path from koma-local URL', () => {
      const url = 'koma-local:///C:/Users/user/images/photo.png';
      expect(fromKomaLocalUrl(url)).toBe('C:/Users/user/images/photo.png');
    });

    it('should return http URLs unchanged', () => {
      const url = 'http://example.com/image.png';
      expect(fromKomaLocalUrl(url)).toBe(url);
    });

    it('should return https URLs unchanged', () => {
      const url = 'https://example.com/image.png';
      expect(fromKomaLocalUrl(url)).toBe(url);
    });

    it('should return data URLs unchanged', () => {
      const url = 'data:image/png;base64,iVBORw0KGgo=';
      expect(fromKomaLocalUrl(url)).toBe(url);
    });

    it('should return blob URLs unchanged', () => {
      const url = 'blob:http://localhost:3000/abc-123';
      expect(fromKomaLocalUrl(url)).toBe(url);
    });

    it('should return local paths unchanged', () => {
      const path = '/home/user/images/photo.png';
      expect(fromKomaLocalUrl(path)).toBe(path);
    });

    it('should handle paths with spaces', () => {
      const url = 'koma-local:///home/user/my images/photo.png';
      expect(fromKomaLocalUrl(url)).toBe('home/user/my images/photo.png');
    });

    it('should handle paths with special characters', () => {
      const url = 'koma-local:///home/user/图片/照片.png';
      expect(fromKomaLocalUrl(url)).toBe('home/user/图片/照片.png');
    });
  });

  describe('round-trip conversion', () => {
    it('should preserve path after round-trip for relative paths', () => {
      const originalPath = 'images/photo.png';
      const url = toKomaLocalUrl(originalPath);
      const extractedPath = fromKomaLocalUrl(url);
      expect(extractedPath).toBe(originalPath);
    });

    it('should preserve Windows path after round-trip', () => {
      const originalPath = 'C:/Users/user/images/photo.png';
      const url = toKomaLocalUrl(originalPath);
      const extractedPath = fromKomaLocalUrl(url);
      expect(extractedPath).toBe(originalPath);
    });
  });
});
