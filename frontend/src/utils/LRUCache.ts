/**
 * 通用 LRU 缓存
 * 支持自定义 dispose 回调，用于清理 video/image 等资源
 */
export class LRUCache<K, V> {
  private map = new Map<K, V>();
  private readonly maxSize: number;
  private readonly onEvict?: (key: K, value: V) => void;

  constructor(maxSize: number, onEvict?: (key: K, value: V) => void) {
    this.maxSize = maxSize;
    this.onEvict = onEvict;
  }

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    // 移到最近使用位置（Map 保持插入顺序）
    const value = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      // 淘汰最久未使用的（Map 迭代器第一个元素）
      const oldest = this.map.keys().next().value!;
      const oldValue = this.map.get(oldest)!;
      this.map.delete(oldest);
      this.onEvict?.(oldest, oldValue);
    }
    this.map.set(key, value);
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  delete(key: K): boolean {
    const value = this.map.get(key);
    if (value !== undefined) {
      this.onEvict?.(key, value);
    }
    return this.map.delete(key);
  }

  get size(): number {
    return this.map.size;
  }

  clear(): void {
    if (this.onEvict) {
      for (const [key, value] of this.map) {
        this.onEvict(key, value);
      }
    }
    this.map.clear();
  }

  forEach(fn: (value: V, key: K) => void): void {
    this.map.forEach(fn);
  }
}
