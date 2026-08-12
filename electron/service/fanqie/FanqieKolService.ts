/**
 * 番茄达人中心 (kol.fanqieopen.com) 集成服务
 *
 * 背景（2026-08 实测结论）：
 * - 达人中心接口由字节安全 SDK 自动补签（msToken / a_bogus），签名逻辑无法在主进程
 *   独立复现；但 SDK 会自动给「页面上下文内发起的 XHR」补签。因此所有接口调用都在
 *   一个加载了 kol.fanqieopen.com 的内置 BrowserWindow 里通过 executeJavaScript
 *   执行 XHR 完成，Cookie 也由该窗口的持久化 session 自动携带。
 * - 请求必须带固定参数 app_id=457699&aid=457699&origin_app_id=457699&host_app_id=457699，
 *   缺失时服务端返回 200 空 body（反爬特征，不重试直接失败也查不出原因）。
 * - 关键接口：
 *   GET /api/platform/user/info/v1?role=1                       登录态 / 达人信息
 *   GET /api/platform/content/book/search/v1?keyword=…&tab_type=2   书籍搜索（书名/作者/BookID）
 *   GET /api/platform/content/chapter/list/v1?book_id=…&page_index=&page_size=200
 *     → { chapter_list: [{item_id,index,chapter_name}], total, download_chapter_index }
 *     download_chapter_index 是「可推广章节」上限（index 从 1 起），超范围章节正文取不到。
 *   GET /api/platform/content/chapter/detail/v1?book_id=…&item_id=…
 *     → data.content 为 <p> 段落 HTML；超范围章节 data 为 null。
 *
 * 登录：showLoginWindow() 把同一窗口显示出来让用户完成手机号/验证码或密码登录
 * （真实鉴权，Cookie 落在 persist:fanqie-kol 分区，长期有效）；轮询 user/info
 * 确认登录成功后回调并隐藏窗口。
 */
import { BrowserWindow } from 'electron';
import { logger } from 'ee-core/log';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getFanqieCacheDir } from '../paths';

const ORIGIN = 'https://kol.fanqieopen.com';
const HOME_PAGE = `${ORIGIN}/page/task`;
const LOGIN_PAGE = `${ORIGIN}/page/task?open_login=1`;
const SESSION_PARTITION = 'persist:fanqie-kol';
// 固定 app 参数（缺失会被反爬返回空 200）
const FIXED_PARAMS = 'app_id=457699&aid=457699&origin_app_id=457699&host_app_id=457699';
// 字节安全 SDK 对 Electron UA 可能拒绝工作，伪装成标准 Chrome
const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

const CHAPTER_PAGE_SIZE = 200;
const DETAIL_CONCURRENCY = 3;
const DETAIL_RETRY = 2;
const REQUEST_INTERVAL_MS = 120;

/** 榜单接口嗅探：页面加载后再收集多久的接口响应 */
const DISCOVERY_COLLECT_MS = 6000;
/** 嗅探结果的有效期：过期后重新嗅探，兜住达人中心改版 */
const DISCOVERY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** 签名 / 固定 app 参数：重放时由页面 SDK 与 FIXED_PARAMS 重新提供，捕获时要剔除 */
const VOLATILE_PARAM_RE = /^(ms_?token|a_bogus|x-bogus|_signature|_?rticket|device_id|iid|verifyfp|fp|timestamp|ts|_)$/i;
const FIXED_PARAM_KEYS = new Set(['app_id', 'aid', 'origin_app_id', 'host_app_id']);
const PAGE_PARAM_RE = /^(page_index|page_no|page_num|page|offset|cursor)$/i;
const PAGE_SIZE_PARAM_RE = /^(page_size|page_count|limit|count|size)$/i;
const RANK_PARAM_RE = /(rank|sort|order|tab|type|category|channel|filter|board)/i;

export interface FanqieAuthStatus {
  loggedIn: boolean;
  /** 脱敏手机号，如 136****5030 */
  mobile?: string;
  identityName?: string;
}

export interface FanqieBook {
  bookId: string;
  bookName: string;
  author: string;
  wordNum: number;
  score: number;
  thumbUrl: string;
  chapterNum: number;
  bookAbstract: string;
  categories: string[];
}

/**
 * 嗅探到的「书单/榜单」接口模板。
 *
 * 达人中心没有公开的榜单接口文档，这里不猜路径：直接用 CDP Network 域旁听
 * 达人中心首页自己发的请求，挑出返回书籍数组的那一个，把 path + 业务参数存下来复用。
 */
export interface FanqieRankEndpoint {
  /** 接口路径，如 /api/platform/content/book/list/v1 */
  path: string;
  /** 捕获到的业务查询参数（已剔除签名参数与固定 app 参数） */
  params: Record<string, string>;
  /** 探测出的分页参数名；页面没带分页参数时为空 */
  pageParam?: string;
  pageSizeParam?: string;
  /** 探测出的榜单 / 排序 / 分类类参数名，供前端做「换榜单」下拉 */
  rankParams: Array<{ key: string; value: string }>;
  /** 书籍数组在 envelope.data 里的字段路径，如 'book_list' 或 'list.items' */
  listPath: string;
  discoveredAt: number;
}

export interface FanqieRankResult {
  books: FanqieBook[];
  endpoint: FanqieRankEndpoint;
  /** 本次实际使用的分页游标（页面从 0 还是 1 起由捕获值决定） */
  pageIndex: number;
  hasMore: boolean;
}

export interface FanqieChapter {
  itemId: string;
  index: number;
  chapterName: string;
  /** index <= download_chapter_index，正文可下载 */
  downloadable: boolean;
}

export interface FanqieChapterListResult {
  chapters: FanqieChapter[];
  total: number;
  downloadChapterIndex: number;
}

export interface FanqieDownloadedChapter {
  itemId: string;
  index: number;
  chapterName: string;
  /** <p> 段落 HTML 原文 */
  contentHtml: string;
}

export interface FanqieDownloadProgress {
  downloadId: string;
  completed: number;
  total: number;
  currentChapterName?: string;
  failed: Array<{ itemId: string; chapterName: string; error: string }>;
}

type ApiEnvelope<T> = { code: number; message?: string; data: T };

class FanqieKolService {
  private win: BrowserWindow | null = null;
  private pageReady: Promise<void> | null = null;
  private loginPollTimer: NodeJS.Timeout | null = null;
  /** 嗅探到的书单接口模板（内存缓存，落盘见 rank-endpoint.json） */
  private rankEndpoint: FanqieRankEndpoint | null = null;
  /** 进行中的嗅探，避免并发重复打开页面 */
  private rankDiscovery: Promise<FanqieRankEndpoint> | null = null;

  // ========== 窗口与页面生命周期 ==========

  private createWindow(show: boolean): BrowserWindow {
    const win = new BrowserWindow({
      width: 1100,
      height: 800,
      show,
      title: '番茄达人中心',
      autoHideMenuBar: true,
      webPreferences: {
        partition: SESSION_PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    win.webContents.setUserAgent(CHROME_UA);
    // 用户手动关闭登录窗口：销毁引用，下次按需重建（隐藏模式）
    win.on('closed', () => {
      if (this.win === win) {
        this.win = null;
        this.pageReady = null;
        this.stopLoginPoll();
      }
    });
    return win;
  }

  /**
   * 确保后台页面就绪（隐藏窗口 + 首页加载完成）。
   * 页面就绪不代表 SDK 一定能签名，apiGet 内部有空 body 重载重试兜底。
   */
  private async ensurePage(): Promise<BrowserWindow> {
    if (this.win && !this.win.isDestroyed()) {
      if (this.pageReady) await this.pageReady;
      return this.win;
    }
    this.win = this.createWindow(false);
    const win = this.win;
    this.pageReady = (async () => {
      await win.loadURL(HOME_PAGE);
      // 等安全 SDK 初始化（bdms 全局对象出现）
      for (let i = 0; i < 40; i++) {
        const ready = await win.webContents
          .executeJavaScript('typeof window.bdms !== "undefined"', true)
          .catch(() => false);
        if (ready) return;
        await new Promise(r => setTimeout(r, 500));
      }
      logger.warn('[fanqie] 安全 SDK 等待超时，继续尝试调用');
    })();
    await this.pageReady;
    return win;
  }

  /** 页面上下文执行 XHR（SDK 自动补签 + Cookie 自动携带） */
  private async apiGet<T>(path: string, params: Record<string, string | number>, retried = false): Promise<T> {
    const win = await this.ensurePage();
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
    const url = `${path}?${qs.toString()}&${FIXED_PARAMS}`;

    const script = `new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', ${JSON.stringify(url)});
      xhr.setRequestHeader('Accept', 'application/json, text/plain, */*');
      xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText || '' });
      xhr.onerror = () => resolve({ status: 0, body: '' });
      xhr.send();
    })`;
    const res = (await win.webContents.executeJavaScript(script, true)) as { status: number; body: string };

    // 反爬空 body：重载页面重建 SDK 状态后重试一次
    if (res.status === 200 && res.body.length === 0 && !retried) {
      logger.warn('[fanqie] 接口返回空 body，重载页面后重试:', path);
      await this.reloadPage();
      return this.apiGet<T>(path, params, true);
    }
    if (res.status !== 200) {
      throw new Error(`番茄接口请求失败 (HTTP ${res.status})`);
    }
    if (!res.body) {
      throw new Error('番茄接口返回为空（可能触发了风控，请稍后重试）');
    }
    let envelope: ApiEnvelope<T>;
    try {
      envelope = JSON.parse(res.body);
    } catch {
      throw new Error('番茄接口返回格式异常');
    }
    if (envelope.code !== 0) {
      throw new Error(`番茄接口错误: ${envelope.message || `code=${envelope.code}`}`);
    }
    return envelope.data;
  }

  private async reloadPage(): Promise<void> {
    if (!this.win || this.win.isDestroyed()) {
      this.pageReady = null;
      return;
    }
    this.pageReady = (async () => {
      await this.win!.webContents.loadURL(HOME_PAGE);
      await new Promise(r => setTimeout(r, 1500));
    })();
    await this.pageReady;
  }

  // ========== 鉴权 ==========

  async getAuthStatus(): Promise<FanqieAuthStatus> {
    try {
      const data = await this.apiGet<any>('/api/platform/user/info/v1', { role: 1 });
      if (data && typeof data === 'object' && (data.mobile || data.identity_name)) {
        return { loggedIn: true, mobile: data.mobile, identityName: data.identity_name };
      }
      return { loggedIn: false };
    } catch (err) {
      logger.warn('[fanqie] getAuthStatus failed:', err);
      return { loggedIn: false };
    }
  }

  /**
   * 弹出可见登录窗口让用户完成真实登录；登录成功后 onSuccess 触发并隐藏窗口。
   * 同一窗口复用于后续接口调用（保持 SDK 与 Cookie 上下文）。
   */
  async showLoginWindow(onSuccess: () => void): Promise<void> {
    if (!this.win || this.win.isDestroyed()) {
      this.win = this.createWindow(true);
      this.pageReady = this.win.loadURL(LOGIN_PAGE).then(() => undefined);
    } else {
      await this.pageReady;
      this.win.show();
      this.win.focus();
      await this.win.webContents.loadURL(LOGIN_PAGE);
      this.pageReady = Promise.resolve();
    }
    await this.pageReady;

    this.stopLoginPoll();
    this.loginPollTimer = setInterval(async () => {
      const status = await this.getAuthStatus();
      if (status.loggedIn) {
        this.stopLoginPoll();
        if (this.win && !this.win.isDestroyed()) this.win.hide();
        onSuccess();
      }
    }, 2000);
  }

  private stopLoginPoll(): void {
    if (this.loginPollTimer) {
      clearInterval(this.loginPollTimer);
      this.loginPollTimer = null;
    }
  }

  async logout(): Promise<void> {
    const { session } = await import('electron');
    const ses = session.fromPartition(SESSION_PARTITION);
    await ses.clearStorageData({ storages: ['cookies', 'localstorage'] });
  }

  // ========== 书籍 / 章节 ==========

  async searchBook(keyword: string): Promise<FanqieBook[]> {
    const data = await this.apiGet<any>('/api/platform/content/book/search/v1', {
      keyword,
      tab_type: 2,
    });
    const list = data?.book_list || [];
    return list.map(mapBook);
  }

  // ========== 榜单 / 书单（接口自动嗅探） ==========

  /**
   * 拉取达人中心书单/榜单。
   *
   * 首次调用会走一次 CDP 嗅探（打开首页旁听接口，约 6s），之后直接命中缓存模板走
   * apiGet 快路径。`refresh` 强制重新嗅探（达人中心改版时用）。
   */
  async listRankBooks(options: {
    pageIndex?: number;
    pageSize?: number;
    /** 覆盖榜单/排序类参数，键名来自 endpoint.rankParams */
    rankOverrides?: Record<string, string>;
    refresh?: boolean;
  } = {}): Promise<FanqieRankResult> {
    const endpoint = await this.ensureRankEndpoint(options.refresh === true);

    const params: Record<string, string | number> = { ...endpoint.params };
    for (const [key, value] of Object.entries(options.rankOverrides || {})) {
      if (key in params) params[key] = value;
    }

    // 页面基准页码可能是 0 也可能是 1；调用方传的是「第几页（0 起）」的相对偏移
    const basePage = endpoint.pageParam ? Number(endpoint.params[endpoint.pageParam]) || 0 : 0;
    const pageIndex = Math.max(0, options.pageIndex ?? 0);
    if (endpoint.pageParam) params[endpoint.pageParam] = basePage + pageIndex;
    if (endpoint.pageSizeParam && options.pageSize) params[endpoint.pageSizeParam] = options.pageSize;

    const data = await this.apiGet<any>(endpoint.path, params);
    const list = readPath(data, endpoint.listPath);
    const books = Array.isArray(list) ? list.filter(isBookLike).map(mapBook) : [];
    const requestedSize = endpoint.pageSizeParam
      ? Number(params[endpoint.pageSizeParam]) || books.length
      : books.length;

    return {
      books,
      endpoint,
      pageIndex,
      hasMore: Boolean(endpoint.pageParam) && books.length > 0 && books.length >= requestedSize,
    };
  }

  private async ensureRankEndpoint(forceRefresh: boolean): Promise<FanqieRankEndpoint> {
    if (!forceRefresh) {
      const cached = this.rankEndpoint || readCachedRankEndpoint();
      if (cached && Date.now() - cached.discoveredAt < DISCOVERY_TTL_MS) {
        this.rankEndpoint = cached;
        return cached;
      }
    }
    // 并发调用共享同一次嗅探
    if (!this.rankDiscovery) {
      this.rankDiscovery = this.discoverRankEndpoint()
        .then(endpoint => {
          this.rankEndpoint = endpoint;
          writeCachedRankEndpoint(endpoint);
          return endpoint;
        })
        .finally(() => {
          this.rankDiscovery = null;
        });
    }
    return this.rankDiscovery;
  }

  /**
   * CDP 嗅探：附加调试器 → 打开首页 → 收集所有 /api/platform/ 响应
   * → 挑出「书籍数组最长」的那条作为书单接口。
   */
  private async discoverRankEndpoint(): Promise<FanqieRankEndpoint> {
    const win = await this.ensurePage();
    const wc = win.webContents;
    const dbg = wc.debugger;

    try {
      if (!dbg.isAttached()) dbg.attach('1.3');
    } catch (err) {
      throw new Error(`无法嗅探番茄书单接口（调试器附加失败，请先关闭该窗口的开发者工具）：${(err as Error).message}`);
    }

    const pendingUrls = new Map<string, string>();
    const bodyReads: Array<Promise<void>> = [];
    const captured: Array<{ url: string; body: string }> = [];

    const onMessage = (_event: unknown, method: string, params: any) => {
      if (method === 'Network.responseReceived') {
        const url: string = params?.response?.url || '';
        if (url.includes('/api/platform/')) pendingUrls.set(params.requestId, url);
        return;
      }
      if (method !== 'Network.loadingFinished') return;
      const url = pendingUrls.get(params?.requestId);
      if (!url) return;
      pendingUrls.delete(params.requestId);
      bodyReads.push(
        dbg
          .sendCommand('Network.getResponseBody', { requestId: params.requestId })
          .then((res: any) => {
            const body = res?.base64Encoded ? Buffer.from(res.body || '', 'base64').toString('utf8') : res?.body || '';
            if (body) captured.push({ url, body });
          })
          .catch(() => undefined),
      );
    };

    try {
      dbg.on('message', onMessage);
      await dbg.sendCommand('Network.enable');
      // 重新加载首页，确保首屏接口在旁听开始之后才发出
      this.pageReady = wc.loadURL(HOME_PAGE).then(() => undefined);
      await this.pageReady;
      await new Promise(r => setTimeout(r, DISCOVERY_COLLECT_MS));
      await Promise.all(bodyReads);
    } finally {
      dbg.removeListener('message', onMessage);
      await dbg.sendCommand('Network.disable').catch(() => undefined);
      try {
        dbg.detach();
      } catch {
        /* 已分离 */
      }
    }

    const endpoint = pickRankEndpoint(captured);
    if (!endpoint) {
      throw new Error(
        `未能在达人中心首页嗅探到书单接口（共捕获 ${captured.length} 个接口响应）。`
        + '请确认已登录达人中心，或稍后重试。',
      );
    }
    logger.info('[fanqie] 嗅探到书单接口:', endpoint.path, endpoint.listPath, endpoint.params);
    return endpoint;
  }

  /** 拉取全部章节（自动分页），并标注可推广范围 */
  async listChapters(bookId: string): Promise<FanqieChapterListResult> {
    const first = await this.apiGet<any>('/api/platform/content/chapter/list/v1', {
      book_id: bookId,
      page_index: 0,
      page_size: CHAPTER_PAGE_SIZE,
    });
    const total: number = first?.total || 0;
    const downloadChapterIndex: number = first?.download_chapter_index || 0;
    const raw: any[] = [...(first?.chapter_list || [])];

    const pages = Math.ceil(total / CHAPTER_PAGE_SIZE);
    for (let page = 1; page < pages; page++) {
      const data = await this.apiGet<any>('/api/platform/content/chapter/list/v1', {
        book_id: bookId,
        page_index: page,
        page_size: CHAPTER_PAGE_SIZE,
      });
      raw.push(...(data?.chapter_list || []));
    }

    const chapters: FanqieChapter[] = raw.map((c: any) => ({
      itemId: String(c.item_id),
      index: c.index,
      chapterName: c.chapter_name || `第${c.index}章`,
      downloadable: c.index <= downloadChapterIndex,
    }));
    return { chapters, total, downloadChapterIndex };
  }

  private async getChapterContent(bookId: string, itemId: string): Promise<string> {
    const data = await this.apiGet<any>('/api/platform/content/chapter/detail/v1', {
      book_id: bookId,
      item_id: itemId,
    });
    if (!data || typeof data.content !== 'string' || !data.content.trim()) {
      throw new Error('章节正文为空（可能超出可推广范围）');
    }
    return data.content;
  }

  /**
   * 批量下载章节正文。并发受限 + 间隔限速 + 单章重试；
   * onProgress 每章完成时回调（含失败列表），由 IPC 层转发渲染进程。
   */
  async downloadChapters(
    bookId: string,
    items: Array<{ itemId: string; index: number; chapterName: string }>,
    downloadId: string,
    onProgress: (p: FanqieDownloadProgress) => void,
  ): Promise<{ chapters: FanqieDownloadedChapter[]; failed: FanqieDownloadProgress['failed'] }> {
    const chapters: FanqieDownloadedChapter[] = [];
    const failed: FanqieDownloadProgress['failed'] = [];
    let completed = 0;

    const report = (currentChapterName?: string) => {
      onProgress({ downloadId, completed, total: items.length, currentChapterName, failed: [...failed] });
    };

    let cursor = 0;
    const worker = async () => {
      while (cursor < items.length) {
        const item = items[cursor++];
        let lastErr = '';
        let ok = false;
        for (let attempt = 0; attempt <= DETAIL_RETRY && !ok; attempt++) {
          try {
            const contentHtml = await this.getChapterContent(bookId, item.itemId);
            chapters.push({ ...item, contentHtml });
            ok = true;
          } catch (err: any) {
            lastErr = err?.message || String(err);
            if (attempt < DETAIL_RETRY) await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
          }
        }
        if (!ok) failed.push({ itemId: item.itemId, chapterName: item.chapterName, error: lastErr });
        completed++;
        report(item.chapterName);
        await new Promise(r => setTimeout(r, REQUEST_INTERVAL_MS));
      }
    };

    await Promise.all(Array.from({ length: Math.min(DETAIL_CONCURRENCY, items.length) }, worker));
    chapters.sort((a, b) => a.index - b.index);
    return { chapters, failed };
  }

  /** 应用退出前清理 */
  destroy(): void {
    this.stopLoginPoll();
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.win = null;
  }
}

// ========== 书籍映射与书单嗅探辅助 ==========

/** 兼容不同接口的字段命名，统一映射成 FanqieBook */
function mapBook(b: any): FanqieBook {
  const thumb = b.thumb_url || b.cover_url || b.pic_url || b.book_cover || '';
  return {
    bookId: String(b.book_id ?? b.bookId ?? ''),
    bookName: b.book_name || b.bookName || b.title || '',
    author: b.author || b.author_name || '',
    wordNum: Number(b.word_num ?? b.word_number ?? b.words ?? 0) || 0,
    score: Number(b.score ?? b.book_score ?? 0) || 0,
    thumbUrl: String(thumb).replace(/^http:/, 'https:'),
    chapterNum: Number(b.chapter_num ?? b.chapter_count ?? 0) || 0,
    bookAbstract: b.book_abstract || b.abstract || b.description || '',
    categories: Array.isArray(b.categories)
      ? b.categories.map((c: any) => (typeof c === 'string' ? c : c?.category_name)).filter(Boolean).slice(0, 4)
      : (typeof b.category === 'string' && b.category ? [b.category] : []),
  };
}

function isBookLike(item: unknown): boolean {
  if (!item || typeof item !== 'object') return false;
  const record = item as Record<string, unknown>;
  const id = record.book_id ?? record.bookId;
  return (typeof id === 'string' || typeof id === 'number') && String(id).length > 0;
}

/** 按 'a.b.c' 读取嵌套字段 */
function readPath(root: unknown, dottedPath: string): unknown {
  if (!dottedPath) return root;
  let cursor: any = root;
  for (const segment of dottedPath.split('.')) {
    if (cursor == null || typeof cursor !== 'object') return undefined;
    cursor = cursor[segment];
  }
  return cursor;
}

/** 在对象里广度优先找出「元素带 book_id 的数组」，返回相对 root 的字段路径 */
function findBookListPath(root: unknown, maxDepth = 4): { listPath: string; length: number } | null {
  const queue: Array<{ node: unknown; path: string; depth: number }> = [{ node: root, path: '', depth: 0 }];
  let best: { listPath: string; length: number } | null = null;

  while (queue.length > 0) {
    const { node, path: nodePath, depth } = queue.shift()!;
    if (node == null || typeof node !== 'object' || depth > maxDepth) continue;

    if (Array.isArray(node)) {
      const books = node.filter(isBookLike);
      if (books.length > 0 && (!best || books.length > best.length)) {
        best = { listPath: nodePath, length: books.length };
      }
      continue;
    }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (value && typeof value === 'object') {
        queue.push({ node: value, path: nodePath ? `${nodePath}.${key}` : key, depth: depth + 1 });
      }
    }
  }
  return best;
}

/** 从捕获到的响应里挑出书单接口：返回书最多的那条 */
function pickRankEndpoint(captured: Array<{ url: string; body: string }>): FanqieRankEndpoint | null {
  let best: { endpoint: FanqieRankEndpoint; length: number } | null = null;

  for (const { url, body } of captured) {
    let parsed: any;
    try {
      parsed = JSON.parse(body);
    } catch {
      continue;
    }
    if (parsed?.code !== 0) continue;
    // apiGet 会剥掉 envelope，listPath 必须相对 data 记录
    const dataRoot = parsed.data ?? parsed;
    const found = findBookListPath(dataRoot);
    if (!found) continue;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      continue;
    }

    const params: Record<string, string> = {};
    let pageParam: string | undefined;
    let pageSizeParam: string | undefined;
    const rankParams: Array<{ key: string; value: string }> = [];
    for (const [key, value] of parsedUrl.searchParams.entries()) {
      if (FIXED_PARAM_KEYS.has(key) || VOLATILE_PARAM_RE.test(key)) continue;
      params[key] = value;
      if (!pageParam && PAGE_PARAM_RE.test(key)) pageParam = key;
      else if (!pageSizeParam && PAGE_SIZE_PARAM_RE.test(key)) pageSizeParam = key;
      else if (RANK_PARAM_RE.test(key)) rankParams.push({ key, value });
    }

    const endpoint: FanqieRankEndpoint = {
      path: parsedUrl.pathname,
      params,
      pageParam,
      pageSizeParam,
      rankParams,
      listPath: found.listPath,
      discoveredAt: Date.now(),
    };
    if (!best || found.length > best.length) best = { endpoint, length: found.length };
  }

  return best?.endpoint ?? null;
}

function rankEndpointCachePath(): string {
  return path.join(getFanqieCacheDir(), 'rank-endpoint.json');
}

function readCachedRankEndpoint(): FanqieRankEndpoint | null {
  try {
    const raw = fs.readFileSync(rankEndpointCachePath(), 'utf8');
    const parsed = JSON.parse(raw) as FanqieRankEndpoint;
    if (parsed?.path && typeof parsed.discoveredAt === 'number') {
      return { ...parsed, rankParams: parsed.rankParams || [], params: parsed.params || {} };
    }
  } catch {
    /* 无缓存或已损坏，重新嗅探 */
  }
  return null;
}

function writeCachedRankEndpoint(endpoint: FanqieRankEndpoint): void {
  try {
    fs.mkdirSync(getFanqieCacheDir(), { recursive: true });
    fs.writeFileSync(rankEndpointCachePath(), JSON.stringify(endpoint, null, 2), 'utf8');
  } catch (err) {
    logger.warn('[fanqie] 书单接口缓存写入失败:', err);
  }
}

export const fanqieKolService = new FanqieKolService();
