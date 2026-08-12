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

/** 内容库任务类型：2 = 番茄小说（与搜书接口的 tab_type 一致） */
const CONTENT_TASK_TYPE = 2;

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

/** 筛选项的一个可选值（value 原样回传给接口，分类的 value 是段 JSON 字符串） */
export interface FanqieFilterOption {
  name: string;
  value: string;
}

/** 一组筛选条件，如「频道」「分类」「连载状态」「上架时间」「字数」 */
export interface FanqieFilter {
  /** 查询参数名，如 gender / category / creation_status */
  key: string;
  name: string;
  options: FanqieFilterOption[];
}

/**
 * 内容库里的一个榜单 / 列表入口。
 *
 * type 决定走哪个接口：
 *  - 2 = 榜单（爆款榜 / 阅读榜 / 潜力榜）→ ranking/rank_list/by_conf/v1，需要 rankId
 *  - 1 = 全部内容 → content/book/list/by_conf/v1，需要 genre
 */
export interface FanqieMenuEntry {
  name: string;
  itemKey: string;
  type: 1 | 2;
  rankId: number;
  filters: FanqieFilter[];
  /** 排序参数名（一般是 sort_key）；没有排序时为空 */
  sortKey?: string;
  sortOptions: FanqieFilterOption[];
  tips?: string;
}

/** 内容库顶层分类（网文 / 漫画），各自带一组榜单入口 */
export interface FanqieContentMenu {
  name: string;
  genre: number;
  menus: FanqieMenuEntry[];
}

export interface FanqieBookListResult {
  books: FanqieBook[];
  total: number;
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
  /** 内容库筛选菜单缓存（结构基本不变，一次会话取一次够用） */
  private contentMenu: FanqieContentMenu[] | null = null;

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

  // ========== 内容库：筛选菜单 + 书单 ==========

  /**
   * 内容库筛选菜单。
   *
   * 达人中心自己就是用这个接口渲染「爆款榜 / 阅读榜 / 潜力榜 / 全部内容」四个入口
   * 以及各自的筛选项（频道 / 分类 / 连载状态 / 是否独家 / 上架时间 / 字数）与排序。
   * 直接取它，筛选项就跟官网完全一致，官方加分类我们不用改代码。
   */
  async getContentMenu(forceRefresh = false): Promise<FanqieContentMenu[]> {
    if (!forceRefresh && this.contentMenu) return this.contentMenu;
    const data = await this.apiGet<any[]>('/api/platform/content/menu/v1', {
      task_type: CONTENT_TASK_TYPE,
    });
    const menu = (Array.isArray(data) ? data : []).map(mapContentMenu).filter(g => g.menus.length > 0);
    this.contentMenu = menu;
    return menu;
  }

  /**
   * 按内容库的榜单 / 筛选条件取书。
   *
   * 两个接口按菜单项的 type 分流：
   *  - type=2 榜单     → ranking/rank_list/by_conf/v1（rank_id 指定是哪个榜），返回 rank_books
   *  - type=1 全部内容 → content/book/list/by_conf/v1（genre 指定网文/漫画），返回 book_list
   * filters 原样透传（键取自菜单的 filters[].key，值取自 options[].value），
   * 不做特殊处理——分类那种值本身是段 JSON 字符串，服务端认得。
   */
  async listBooks(options: {
    type: 1 | 2;
    rankId?: number;
    genre?: number;
    sortKey?: string;
    sortValue?: string;
    filters?: Record<string, string>;
    pageIndex?: number;
    pageSize?: number;
  }): Promise<FanqieBookListResult> {
    const pageIndex = Math.max(0, options.pageIndex ?? 0);
    const pageSize = Math.max(1, Math.min(50, options.pageSize ?? 20));

    const params: Record<string, string | number> = {
      content_tab: CONTENT_TASK_TYPE,
      page_index: pageIndex,
      page_size: pageSize,
    };
    for (const [key, value] of Object.entries(options.filters || {})) {
      if (value) params[key] = value;
    }
    if (options.sortKey && options.sortValue) {
      params[options.sortKey] = options.sortValue;
    }

    let path: string;
    if (options.type === 2) {
      if (!options.rankId) throw new Error('榜单缺少 rank_id');
      path = '/api/platform/ranking/rank_list/by_conf/v1';
      params.rank_id = options.rankId;
    } else {
      path = '/api/platform/content/book/list/by_conf/v1';
      params.genre = options.genre ?? 0;
    }

    const data = await this.apiGet<any>(path, params);
    // 榜单接口返回 rank_books，全部内容返回 book_list
    const rawList: any[] = Array.isArray(data?.rank_books)
      ? data.rank_books
      : Array.isArray(data?.book_list) ? data.book_list : [];
    const books = rawList.map(mapBook).filter(b => b.bookId);
    const total = Number(data?.total) || 0;

    return {
      books,
      total,
      pageIndex,
      // total 是结果总数（全部内容会给 10000 这种上限值），按页推算还有没有下一页
      hasMore: books.length >= pageSize && (pageIndex + 1) * pageSize < total,
    };
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

/** 菜单原始结构 → 类型安全的 FanqieContentMenu */
function mapContentMenu(raw: any): FanqieContentMenu {
  const menus: FanqieMenuEntry[] = (Array.isArray(raw?.menu_details) ? raw.menu_details : [])
    .map((m: any): FanqieMenuEntry => ({
      name: String(m?.name || ''),
      itemKey: String(m?.item_key ?? ''),
      type: Number(m?.type) === 1 ? 1 : 2,
      rankId: Number(m?.rank_id) || 0,
      filters: (Array.isArray(m?.filters) ? m.filters : [])
        .map((f: any): FanqieFilter => ({
          key: String(f?.key || ''),
          name: String(f?.name || ''),
          options: mapOptions(f?.options),
        }))
        .filter((f: FanqieFilter) => f.key && f.options.length > 0),
      sortKey: m?.sorts?.key ? String(m.sorts.key) : undefined,
      sortOptions: mapOptions(m?.sorts?.options),
      tips: m?.tips ? String(m.tips) : undefined,
    }))
    .filter((m: FanqieMenuEntry) => m.name);

  return {
    name: String(raw?.name || ''),
    genre: Number(raw?.genre) || 0,
    menus,
  };
}

function mapOptions(raw: unknown): FanqieFilterOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((o: any) => ({ name: String(o?.name || ''), value: String(o?.value ?? '') }))
    .filter(o => o.name && o.value !== '');
}

export const fanqieKolService = new FanqieKolService();
