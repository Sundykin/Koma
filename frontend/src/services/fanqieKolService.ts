/**
 * 番茄达人中心前端服务 —— 薄封装 fanqie:* IPC
 *
 * 主进程侧实现见 electron/service/fanqie/FanqieKolService.ts：
 * 接口调用在内置登录窗口的页面上下文里发 XHR（字节安全 SDK 自动补签 + Cookie 自动携带）。
 */
import { electronService } from './electronService';

interface IpcOk<T> {
  ok: true;
  data: T;
}
interface IpcFail {
  ok: false;
  code: string;
  message: string;
}
type IpcResult<T> = IpcOk<T> | IpcFail;

async function invoke<T>(channel: string, args?: unknown): Promise<T> {
  if (!electronService.isElectron()) {
    throw new Error('番茄书籍导入仅在桌面应用中可用');
  }
  const res = (await electronService.ipc.invoke(channel, args)) as IpcResult<T>;
  if (!res || typeof res !== 'object' || !('ok' in res)) {
    throw new Error(`fanqieKolService: unexpected IPC response from '${channel}'`);
  }
  if (res.ok === false) {
    throw new Error(res.message || `[${res.code}] 请求失败`);
  }
  return res.data;
}

export interface FanqieAuthStatus {
  loggedIn: boolean;
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

/** 嗅探到的达人中心书单接口模板（主进程 CDP 捕获，详见 FanqieKolService） */
export interface FanqieRankEndpoint {
  path: string;
  params: Record<string, string>;
  pageParam?: string;
  pageSizeParam?: string;
  /** 榜单 / 排序 / 分类类参数，供「换榜单」下拉覆盖 */
  rankParams: Array<{ key: string; value: string }>;
  listPath: string;
  discoveredAt: number;
}

export interface FanqieRankResult {
  books: FanqieBook[];
  endpoint: FanqieRankEndpoint;
  pageIndex: number;
  hasMore: boolean;
}

export interface FanqieChapter {
  itemId: string;
  index: number;
  chapterName: string;
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
  contentHtml: string;
}

export interface FanqieDownloadProgress {
  downloadId: string;
  completed: number;
  total: number;
  currentChapterName?: string;
  failed: Array<{ itemId: string; chapterName: string; error: string }>;
}

export const fanqieKolService = {
  getAuthStatus: () => invoke<FanqieAuthStatus>('fanqie:getAuthStatus'),

  /** 弹出内置登录窗口（真实手机号/密码鉴权）；登录成功通过 onAuthChanged 通知 */
  openLogin: () => invoke<{ opened: boolean }>('fanqie:openLogin'),

  logout: () => invoke<boolean>('fanqie:logout'),

  searchBook: (keyword: string) => invoke<FanqieBook[]>('fanqie:searchBook', { keyword }),

  /**
   * 达人中心书单/榜单。首次调用主进程会自动嗅探接口（约 6 秒），之后走缓存模板。
   * refresh=true 强制重新嗅探（达人中心改版导致列表为空时使用）。
   */
  listRankBooks: (options: {
    pageIndex?: number;
    pageSize?: number;
    rankOverrides?: Record<string, string>;
    refresh?: boolean;
  } = {}) => invoke<FanqieRankResult>('fanqie:listRankBooks', options),

  listChapters: (bookId: string) => invoke<FanqieChapterListResult>('fanqie:listChapters', { bookId }),

  downloadChapters: (
    bookId: string,
    items: Array<{ itemId: string; index: number; chapterName: string }>,
  ) =>
    invoke<{ chapters: FanqieDownloadedChapter[]; failed: FanqieDownloadProgress['failed'] }>(
      'fanqie:downloadChapters',
      { downloadId: `fq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, bookId, items },
    ),

  onAuthChanged(callback: (data: { loggedIn: boolean }) => void): () => void {
    const w = window as any;
    if (!w.electron?.ipcRenderer) return () => undefined;
    const listener = (_event: unknown, data: { loggedIn: boolean }) => callback(data);
    w.electron.ipcRenderer.on('fanqie:auth-changed', listener);
    return () => w.electron.ipcRenderer.removeListener('fanqie:auth-changed', listener);
  },

  onDownloadProgress(callback: (data: FanqieDownloadProgress) => void): () => void {
    const w = window as any;
    if (!w.electron?.ipcRenderer) return () => undefined;
    const listener = (_event: unknown, data: FanqieDownloadProgress) => callback(data);
    w.electron.ipcRenderer.on('fanqie:download-progress', listener);
    return () => w.electron.ipcRenderer.removeListener('fanqie:download-progress', listener);
  },
};

/**
 * 从用户输入提取书籍 ID：支持纯数字 ID、达人中心书籍详情链接
 * （…/book-detail?…&book_id=7590221243043826712&…）、番茄小说阅读页链接。
 * 无法识别时返回 null。
 */
export function parseBookIdFromInput(input: string): string | null {
  const text = (input || '').trim();
  if (!text) return null;
  if (/^\d{15,25}$/.test(text)) return text;
  const fromQuery = text.match(/[?&]book_id=(\d{15,25})/);
  if (fromQuery) return fromQuery[1];
  const fromPath = text.match(/\/(\d{15,25})(?:[/?#]|$)/);
  if (fromPath) return fromPath[1];
  return null;
}

/**
 * 章节正文 HTML（<p> 段落）→ 纯文本。
 * 每段一行，段间单换行；去除残留标签与 HTML 实体。
 */
export function chapterHtmlToText(html: string): string {
  if (!html) return '';
  const withBreaks = html
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\/p>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
  const text = withBreaks
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * 剥离章节名开头的章节号，只保留真正的标题：
 *   「第12章 重回旧宅」→「重回旧宅」
 *   「第一百零八章：终局」→「终局」
 *   「第12章」→ ''（没有标题正文，调用方应整行省略）
 *
 * 存在的意义：带「第N章」的行会被 episodeBoundaryDetector 判定为分集边界，
 * 导致导入后的剧本被按章切成几十上百集。剥离后由 AI 按目标集数规划。
 * 不带章节号的名字（「楔子」「番外·雪夜」）原样返回。
 */
export function stripChapterNumberPrefix(chapterName: string): string {
  const raw = (chapterName || '').trim();
  if (!raw) return '';
  // 「第」+ 数字（阿拉伯/全角/中文）+ 章节量词 + 可选分隔符，其余部分即真正的标题
  const matched = raw.match(
    /^第\s*[0-9０-９零〇一二三四五六七八九十百千万两]+\s*[章节回话集卷部篇]\s*[:：.、,，\-—–|｜]*\s*(.*)$/,
  );
  return matched ? matched[1].trim() : raw;
}

/**
 * 下载完成的章节合并为完整剧本文本。
 *
 * 章节号被剥离（见 stripChapterNumberPrefix）：保留的纯标题不会被识别成分集边界，
 * 分集完全交给 AI 按目标集数规划；没有标题正文的章节直接省略标题行。
 */
export function mergeChaptersToScript(chapters: FanqieDownloadedChapter[]): string {
  return chapters
    .slice()
    .sort((a, b) => a.index - b.index)
    .map(ch => {
      const title = stripChapterNumberPrefix(ch.chapterName);
      const body = chapterHtmlToText(ch.contentHtml);
      return title ? `${title}\n\n${body}` : body;
    })
    .filter(Boolean)
    .join('\n\n');
}
