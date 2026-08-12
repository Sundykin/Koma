/**
 * 番茄达人中心书籍导入向导
 *
 * 流程：登录态检查 → 输入书籍ID/链接搜书 → 选择可推广章节 → 下载正文
 *      → 项目设置 → 创建项目 → AI 自动分集(EpisodeSplitWizard) → 进入项目剧本步骤
 *
 * 数据链路：主进程内置登录窗口(persist:fanqie-kol)页面上下文发 XHR
 * （字节安全 SDK 自动补签），见 electron/service/fanqie/FanqieKolService.ts。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  App,
  Button,
  Input,
  InputNumber,
  Modal,
  Progress,
  Segmented,
  Select,
  Spin,
  Steps,
  Tag,
  Tooltip,
} from 'antd';
import {
  CheckCircleOutlined,
  LinkOutlined,
  LoginOutlined,
  ReloadOutlined,
  SearchOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { Episode } from '../../types';
import type { ProjectMeta } from '../../services/electronService';
import type { CreateProjectData } from '../../hooks/useProjects';
import {
  fanqieKolService,
  mergeChaptersToScript,
  parseBookIdFromInput,
  type FanqieBook,
  type FanqieChapter,
  type FanqieDownloadedChapter,
  type FanqieContentMenu,
  type FanqieFilterOption,
  type FanqieMenuEntry,
} from '../../services/fanqieKolService';
import { DEFAULT_THEME_PRESET_ID, getAllThemePresets, type ThemePresetCatalogItem } from '../../config/themePresets';
import { createLogger } from '../../store/logger';
import { EpisodeSplitWizard } from './EpisodeSplitWizard';

const logger = createLogger('FanqieImportDialog');

type WizardStep = 'auth' | 'book' | 'chapters' | 'download' | 'project' | 'split';

interface FanqieImportDialogProps {
  open: boolean;
  onClose: () => void;
  /** 复用 App 的 useProjects.createProject（保持项目列表状态同步） */
  createProject: (data: CreateProjectData) => Promise<ProjectMeta>;
  /**
   * 全流程结束（剧集已创建或用户跳过分集）：父级跳转到项目编辑器剧本步骤。
   * script 是下载章节合并后的全文，跳过分集时父级用它回填剧本编辑器，避免下载内容丢失。
   */
  onComplete: (result: { project: ProjectMeta; episodes: Episode[]; script: string }) => void;
}

export const FanqieImportDialog: React.FC<FanqieImportDialogProps> = ({
  open,
  onClose,
  createProject,
  onComplete,
}) => {
  const { message } = App.useApp();

  const [step, setStep] = useState<WizardStep>('auth');
  const [busy, setBusy] = useState(false);

  // auth
  const [authLoggedIn, setAuthLoggedIn] = useState(false);
  const [authMobile, setAuthMobile] = useState<string>('');

  // book
  const [bookTab, setBookTab] = useState<'search' | 'rank'>('rank');
  const [bookInput, setBookInput] = useState('');
  const [searchResults, setSearchResults] = useState<FanqieBook[]>([]);
  const [selectedBook, setSelectedBook] = useState<FanqieBook | null>(null);

  // 内容库（达人中心 content/menu + rank_list / book_list）
  const [menu, setMenu] = useState<FanqieContentMenu[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [genreIndex, setGenreIndex] = useState(0);
  const [menuIndex, setMenuIndex] = useState(0);
  /** 已选筛选：filterKey → option.value */
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [sortValue, setSortValue] = useState('');
  const [rankBooks, setRankBooks] = useState<FanqieBook[]>([]);
  const [rankLoading, setRankLoading] = useState(false);
  const [rankError, setRankError] = useState('');
  const [rankPage, setRankPage] = useState(0);
  const [rankHasMore, setRankHasMore] = useState(false);
  const [rankTotal, setRankTotal] = useState(0);

  // chapters
  const [chapters, setChapters] = useState<FanqieChapter[]>([]);
  const [downloadChapterIndex, setDownloadChapterIndex] = useState(0);
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(1);

  // download
  const [downloadTotal, setDownloadTotal] = useState(0);
  const [downloadCompleted, setDownloadCompleted] = useState(0);
  const [downloadCurrent, setDownloadCurrent] = useState('');
  const [downloaded, setDownloaded] = useState<FanqieDownloadedChapter[]>([]);
  const [downloadFailed, setDownloadFailed] = useState<Array<{ itemId: string; chapterName: string; error: string }>>([]);

  // project settings
  const [projectTitle, setProjectTitle] = useState('');
  const [projectMode, setProjectMode] = useState<'drama' | 'narration'>('drama');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [themePresets, setThemePresets] = useState<ThemePresetCatalogItem[]>([]);
  const [stylePresetId, setStylePresetId] = useState(DEFAULT_THEME_PRESET_ID);
  const [createdProject, setCreatedProject] = useState<ProjectMeta | null>(null);

  const downloadIdRef = useRef('');

  const mergedScript = useMemo(() => mergeChaptersToScript(downloaded), [downloaded]);

  const resetAll = useCallback(() => {
    setStep('auth');
    setBusy(false);
    setAuthLoggedIn(false);
    setAuthMobile('');
    setBookTab('rank');
    setBookInput('');
    setSearchResults([]);
    setSelectedBook(null);
    setMenu([]);
    setMenuLoading(false);
    setGenreIndex(0);
    setMenuIndex(0);
    setFilterValues({});
    setSortValue('');
    setRankBooks([]);
    setRankLoading(false);
    setRankError('');
    setRankPage(0);
    setRankHasMore(false);
    setRankTotal(0);
    setChapters([]);
    setDownloadChapterIndex(0);
    setRangeStart(1);
    setRangeEnd(1);
    setDownloadTotal(0);
    setDownloadCompleted(0);
    setDownloadCurrent('');
    setDownloaded([]);
    setDownloadFailed([]);
    setProjectTitle('');
    setProjectMode('drama');
    setAspectRatio('16:9');
    setStylePresetId(DEFAULT_THEME_PRESET_ID);
    setCreatedProject(null);
  }, []);

  // ---------- 登录态 ----------

  const checkAuth = useCallback(async () => {
    setBusy(true);
    try {
      const status = await fanqieKolService.getAuthStatus();
      setAuthLoggedIn(status.loggedIn);
      setAuthMobile(status.mobile || '');
      if (status.loggedIn) setStep('book');
    } catch (err: any) {
      logger.error('检查番茄登录态失败', err);
      setAuthLoggedIn(false);
    } finally {
      setBusy(false);
    }
  }, [message]);

  useEffect(() => {
    if (!open) return;
    resetAll();
    void checkAuth();
    const offAuth = fanqieKolService.onAuthChanged(({ loggedIn }) => {
      setAuthLoggedIn(loggedIn);
      if (loggedIn) {
        message.success('番茄达人中心登录成功');
        setStep(prev => (prev === 'auth' ? 'book' : prev));
      }
    });
    const offProgress = fanqieKolService.onDownloadProgress((p) => {
      if (p.downloadId !== downloadIdRef.current) return;
      setDownloadCompleted(p.completed);
      setDownloadTotal(p.total);
      setDownloadCurrent(p.currentChapterName || '');
      setDownloadFailed(p.failed);
    });
    return () => {
      offAuth();
      offProgress();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleOpenLogin = async () => {
    try {
      await fanqieKolService.openLogin();
      message.info('请在内置窗口中完成番茄达人中心登录');
    } catch (err: any) {
      message.error(err.message || '打开登录窗口失败');
    }
  };

  // ---------- 搜书 ----------

  const handleSearchBook = async () => {
    const keyword = bookInput.trim();
    if (!keyword) return;
    setBusy(true);
    setSelectedBook(null);
    try {
      const bookId = parseBookIdFromInput(keyword);
      const results = await fanqieKolService.searchBook(bookId || keyword);
      setSearchResults(results);
      if (results.length === 0) {
        message.warning('未找到书籍，请检查书籍 ID 或换个关键词');
        return;
      }
      // 精准命中 book_id 时直接选中
      const exact = bookId ? results.find(b => b.bookId === bookId) : null;
      if (exact) setSelectedBook(exact);
    } catch (err: any) {
      message.error(err.message || '搜索失败');
    } finally {
      setBusy(false);
    }
  };

  // ---------- 内容库（榜单 + 筛选） ----------

  const activeGenre = menu[genreIndex];
  const activeMenu: FanqieMenuEntry | undefined = activeGenre?.menus[menuIndex];

  /** 首次进入书单页拉一次筛选菜单（结构基本不变，会话内缓存在主进程） */
  const loadMenu = useCallback(async (refresh = false) => {
    setMenuLoading(true);
    setRankError('');
    try {
      const data = await fanqieKolService.getContentMenu(refresh);
      setMenu(data);
      setGenreIndex(0);
      setMenuIndex(0);
      setFilterValues({});
      setSortValue(data[0]?.menus[0]?.sortOptions[0]?.value || '');
    } catch (err: any) {
      setRankError(err.message || '获取内容库筛选条件失败');
    } finally {
      setMenuLoading(false);
    }
  }, []);

  const loadBooks = useCallback(async (pageIndex: number) => {
    if (!activeGenre || !activeMenu) return;
    setRankLoading(true);
    setRankError('');
    try {
      const result = await fanqieKolService.listBooks({
        type: activeMenu.type,
        rankId: activeMenu.rankId,
        genre: activeGenre.genre,
        sortKey: activeMenu.sortKey,
        sortValue: sortValue || undefined,
        filters: filterValues,
        pageIndex,
        pageSize: 20,
      });
      setRankBooks(result.books);
      setRankPage(result.pageIndex);
      setRankHasMore(result.hasMore);
      setRankTotal(result.total);
      if (result.books.length === 0) setRankError('当前筛选条件下没有书籍');
    } catch (err: any) {
      setRankError(err.message || '获取书单失败');
    } finally {
      setRankLoading(false);
    }
  }, [activeGenre, activeMenu, sortValue, filterValues]);

  // 进入书单页时拉菜单
  useEffect(() => {
    if (step !== 'book' || bookTab !== 'rank') return;
    if (menu.length > 0 || menuLoading) return;
    void loadMenu();
  }, [step, bookTab, menu.length, menuLoading, loadMenu]);

  // 菜单就绪 / 切榜单 / 改筛选 / 改排序 → 回到第一页重新取
  useEffect(() => {
    if (step !== 'book' || bookTab !== 'rank' || !activeMenu) return;
    void loadBooks(0);
    // loadBooks 已经把依赖收进闭包，这里只需在筛选条件变化时触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, bookTab, activeGenre?.genre, activeMenu?.itemKey, filterValues, sortValue]);

  /** 切榜单：筛选项各榜不同，切换时清空已选，排序回到该榜第一个选项 */
  const handleMenuChange = (index: number) => {
    setMenuIndex(index);
    setFilterValues({});
    setSortValue(activeGenre?.menus[index]?.sortOptions[0]?.value || '');
    setSelectedBook(null);
  };

  const handleGenreChange = (index: number) => {
    setGenreIndex(index);
    setMenuIndex(0);
    setFilterValues({});
    setSortValue(menu[index]?.menus[0]?.sortOptions[0]?.value || '');
    setSelectedBook(null);
  };

  /** 同一筛选项再点一次即取消（达人中心自己也是这个交互） */
  const toggleFilter = (key: string, value: string) => {
    setFilterValues(prev => {
      const next = { ...prev };
      if (next[key] === value) delete next[key];
      else next[key] = value;
      return next;
    });
    setSelectedBook(null);
  };

  // ---------- 章节列表 ----------

  const handleLoadChapters = async () => {
    if (!selectedBook) return;
    setBusy(true);
    try {
      const result = await fanqieKolService.listChapters(selectedBook.bookId);
      const downloadableCount = result.chapters.filter(c => c.downloadable).length;
      if (downloadableCount === 0) {
        message.warning('该书没有可推广章节，无法下载正文');
        return;
      }
      setChapters(result.chapters);
      setDownloadChapterIndex(result.downloadChapterIndex);
      setRangeStart(1);
      setRangeEnd(result.downloadChapterIndex);
      setStep('chapters');
    } catch (err: any) {
      message.error(err.message || '获取章节列表失败');
    } finally {
      setBusy(false);
    }
  };

  const selectedChapters = useMemo(
    () => chapters.filter(c => c.downloadable && c.index >= rangeStart && c.index <= rangeEnd),
    [chapters, rangeStart, rangeEnd],
  );

  // ---------- 下载 ----------

  const handleDownload = async () => {
    if (!selectedBook || selectedChapters.length === 0) return;
    setStep('download');
    setBusy(true);
    setDownloaded([]);
    setDownloadFailed([]);
    setDownloadCompleted(0);
    setDownloadTotal(selectedChapters.length);
    downloadIdRef.current = `fq-${Date.now()}`;
    try {
      const result = await fanqieKolService.downloadChapters(
        selectedBook.bookId,
        selectedChapters.map(c => ({ itemId: c.itemId, index: c.index, chapterName: c.chapterName })),
      );
      setDownloaded(result.chapters);
      setDownloadFailed(result.failed);
      if (result.chapters.length === 0) {
        message.error('所有章节下载失败，请稍后重试');
        setStep('chapters');
        return;
      }
      if (result.failed.length > 0) {
        message.warning(`${result.failed.length} 个章节下载失败，已跳过`);
      }
      setProjectTitle(selectedBook.bookName);
      setStep('project');
    } catch (err: any) {
      message.error(err.message || '下载失败');
      setStep('chapters');
    } finally {
      setBusy(false);
    }
  };

  // ---------- 创建项目 + 分集 ----------

  const handleCreateProject = async () => {
    const title = projectTitle.trim();
    if (!title) {
      message.warning('请输入项目名称');
      return;
    }
    if (!mergedScript.trim()) {
      message.error('章节内容为空，无法创建');
      return;
    }
    setBusy(true);
    try {
      if (themePresets.length === 0) {
        // 懒加载风格预设（仅此处需要）
        try {
          setThemePresets(await getAllThemePresets());
        } catch {
          // 预设拉取失败不阻塞，用默认
        }
      }
      const project = await createProject({
        title,
        mode: projectMode,
        aspectRatio,
        stylePresetId: stylePresetId || DEFAULT_THEME_PRESET_ID,
      });
      setCreatedProject(project);
      setStep('split');
    } catch (err: any) {
      message.error(err.message || '创建项目失败');
    } finally {
      setBusy(false);
    }
  };

  const handleSplitComplete = useCallback((episodes: Episode[]) => {
    if (createdProject) {
      onComplete({ project: createdProject, episodes, script: mergedScript });
    }
  }, [createdProject, onComplete, mergedScript]);

  // 用户在分集向导里取消：项目已建好，带着合并文本进入项目手动处理
  const handleSplitCancel = useCallback(() => {
    if (createdProject) {
      message.info('已跳过分集，下载的章节正文已带入剧本编辑器');
      onComplete({ project: createdProject, episodes: [], script: mergedScript });
    }
  }, [createdProject, onComplete, message, mergedScript]);

  // 打开弹窗时顺便预热风格预设列表（project 步骤要展示）
  useEffect(() => {
    if (!open) return;
    getAllThemePresets()
      .then(presets => {
        setThemePresets(presets);
        setStylePresetId(prev => (presets.some(p => p.id === prev) ? prev : (presets[0]?.id || DEFAULT_THEME_PRESET_ID)));
      })
      .catch(() => undefined);
  }, [open]);

  // ---------- 渲染 ----------
  //
  // 布局约定：弹窗**固定高度**，内容区自己滚。
  // 之前是内容撑高弹窗——换榜单、改筛选、进下一步都会让整个弹窗跳一次高度，
  // 分类有 34 个标签时更是直接顶到屏幕外。现在骨架是
  //   Steps（固定）+ 内容区（flex-1，内部滚动）+ 操作栏（固定）
  // 每一步只负责填内容区，操作按钮统一放到底部操作栏。

  const stepIndex = ['auth', 'book', 'chapters', 'download', 'project'].indexOf(step);

  const renderAuth = () => (
    <div className="h-full flex flex-col items-center justify-center gap-4">
      {busy ? (
        <Spin />
      ) : authLoggedIn ? (
        <>
          <CheckCircleOutlined className="text-3xl text-status-success" />
          <p className="text-text-secondary m-0">已登录番茄达人中心{authMobile ? `（${authMobile}）` : ''}</p>
        </>
      ) : (
        <>
          <p className="text-text-secondary m-0">
            下载可推广章节需要登录番茄达人中心（ kol.fanqieopen.com ）
          </p>
          <Button type="primary" icon={<LoginOutlined />} onClick={handleOpenLogin}>
            打开登录窗口
          </Button>
          <p className="text-xs text-text-muted m-0">
            在内置窗口中完成手机号验证码 / 密码登录，登录态会保存在本地
          </p>
          <Button type="text" icon={<ReloadOutlined />} onClick={checkAuth}>
            我已完成登录，重新检查
          </Button>
        </>
      )}
    </div>
  );

  const renderBookCard = (book: FanqieBook, rank?: number) => {
    const isSelected = selectedBook?.bookId === book.bookId;
    return (
      <div
        key={book.bookId}
        onClick={() => setSelectedBook(book)}
        className={`flex gap-2.5 p-2 rounded-lg border cursor-pointer transition-all ${
          isSelected ? 'border-accent bg-accent/5' : 'border-border-subtle hover:border-accent/40 bg-bg-surface'
        }`}
      >
        {typeof rank === 'number' && (
          <span className={`shrink-0 w-5 text-center text-xs font-semibold leading-5 ${
            rank <= 3 ? 'text-status-warning' : 'text-text-muted'
          }`}>{rank}</span>
        )}
        {book.thumbUrl ? (
          <img src={book.thumbUrl} alt={book.bookName} className="w-10 h-[54px] object-cover rounded shrink-0" />
        ) : (
          <div className="w-10 h-[54px] rounded bg-bg-elevated shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-medium text-text-primary truncate">{book.bookName}</span>
            {book.score > 0 && <Tag color="orange" className="!mr-0 !text-[11px] !leading-4">{book.score}分</Tag>}
          </div>
          <div className="text-[11px] text-text-tertiary mt-0.5 truncate">
            {book.author || '佚名'}
            {book.wordNum > 0 && ` · ${(book.wordNum / 10000).toFixed(1)}万字`}
            {book.chapterNum > 0 && ` · 共${book.chapterNum}章`}
          </div>
          {book.categories.length > 0 && (
            <div className="text-[11px] text-text-muted truncate">{book.categories.join(' / ')}</div>
          )}
        </div>
      </div>
    );
  };

  /**
   * 一组筛选条件的控件。选项少用行内标签（一眼可选），多了改下拉——
   * 分类有 34 个，全铺成标签会把筛选区撑成 4 行，正是弹窗高度失控的主因。
   */
  const renderFilterControl = (
    label: string,
    options: FanqieFilterOption[],
    selected: string,
    onPick: (value: string) => void,
    clearable = true,
  ) => {
    if (options.length <= 3) {
      return (
        <div key={label} className="flex items-center gap-1">
          <span className="text-[11px] text-text-tertiary shrink-0">{label}</span>
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => onPick(opt.value)}
              className={`px-1.5 h-6 text-[11px] rounded cursor-pointer transition-colors ${
                selected === opt.value
                  ? 'bg-accent text-on-accent'
                  : 'text-text-secondary hover:text-accent hover:bg-accent/10'
              }`}
            >
              {opt.name}
            </button>
          ))}
        </div>
      );
    }
    return (
      <Select
        key={label}
        size="small"
        className="!w-[124px]"
        placeholder={label}
        value={selected || undefined}
        onChange={v => onPick(v ?? '')}
        allowClear={clearable}
        showSearch
        optionFilterProp="label"
        options={options.map(o => ({ value: o.value, label: o.name }))}
      />
    );
  };

  /** 左栏：品类 + 榜单入口，竖排；内容多时自己滚，不影响弹窗高度 */
  const renderRankSidebar = () => (
    <div className="w-[104px] shrink-0 border-r border-border-subtle overflow-y-auto py-1">
      {menu.map((g, i) => (
        <button
          key={g.genre}
          onClick={() => handleGenreChange(i)}
          className={`w-full text-left px-2.5 h-7 text-xs cursor-pointer transition-colors ${
            i === genreIndex ? 'text-accent bg-accent/10 font-medium' : 'text-text-secondary hover:bg-bg-hover'
          }`}
        >
          {g.name}
        </button>
      ))}
      <div className="my-1 mx-2.5 border-t border-border-subtle" />
      {(activeGenre?.menus || []).map((m, i) => (
        <button
          key={m.itemKey}
          onClick={() => handleMenuChange(i)}
          className={`w-full text-left px-2.5 h-7 text-xs cursor-pointer transition-colors ${
            i === menuIndex ? 'text-accent bg-accent/10 font-medium' : 'text-text-tertiary hover:bg-bg-hover'
          }`}
        >
          {m.name}
        </button>
      ))}
    </div>
  );

  const renderRankTab = () => {
    if (menuLoading) {
      return (
        <div className="h-full flex flex-col items-center justify-center gap-3">
          <Spin />
          <p className="text-xs text-text-muted m-0">正在读取达人中心内容库筛选条件…</p>
        </div>
      );
    }
    if (menu.length === 0) {
      return (
        <div className="h-full flex flex-col items-center justify-center gap-2">
          <p className="text-sm text-status-warning m-0">{rankError || '未获取到内容库筛选条件'}</p>
          <Button size="small" onClick={() => void loadMenu(true)}>重新获取</Button>
        </div>
      );
    }

    return (
      <div className="h-full flex min-h-0">
        {renderRankSidebar()}

        <div className="flex-1 min-w-0 flex flex-col">
          {/* 筛选栏：固定不滚，控件按选项数量自适应，高度稳定 */}
          <div className="shrink-0 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 px-3 py-2 border-b border-border-subtle">
            {(activeMenu?.filters || []).map(f =>
              renderFilterControl(f.name, f.options, filterValues[f.key] || '', v => toggleFilter(f.key, v)))}
            {activeMenu?.sortKey && activeMenu.sortOptions.length > 0 &&
              renderFilterControl('排序', activeMenu.sortOptions, sortValue,
                v => { setSortValue(v); setSelectedBook(null); }, false)}
            <Tooltip title="重新拉取达人中心筛选条件（官方新增分类后用）">
              <Button size="small" type="text" className="!ml-auto" icon={<ReloadOutlined />}
                onClick={() => void loadMenu(true)} />
            </Tooltip>
          </div>

          {/* 书籍列表：唯一的滚动区 */}
          <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
            {rankLoading ? (
              <div className="h-full flex items-center justify-center"><Spin /></div>
            ) : rankError ? (
              <p className="pt-10 text-center text-sm text-text-muted m-0">{rankError}</p>
            ) : (
              <div className="space-y-1.5">
                {rankBooks.map((book, idx) => renderBookCard(book, rankPage * 20 + idx + 1))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderSearchTab = () => (
    <div className="h-full flex flex-col px-1">
      <div className="shrink-0 flex gap-2 py-2">
        <Input
          prefix={<LinkOutlined className="text-text-muted" />}
          placeholder="书名 / 书籍 ID / 达人中心书籍详情页链接"
          value={bookInput}
          onChange={e => setBookInput(e.target.value)}
          onPressEnter={handleSearchBook}
          allowClear
        />
        <Button type="primary" icon={<SearchOutlined />} loading={busy} onClick={handleSearchBook}>
          搜索
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {searchResults.length === 0 ? (
          <p className="pt-16 text-center text-sm text-text-muted m-0">输入书名或书籍 ID 后回车搜索</p>
        ) : (
          <div className="space-y-1.5 pb-2">{searchResults.map(book => renderBookCard(book))}</div>
        )}
      </div>
    </div>
  );

  const renderBook = () => (
    <div className="h-full flex flex-col min-h-0">
      <div className="shrink-0 pb-2">
        <Segmented
          block
          value={bookTab}
          onChange={v => setBookTab(v as 'search' | 'rank')}
          options={[
            { value: 'rank', label: '内容库 · 榜单筛选' },
            { value: 'search', label: '搜索 / 书籍 ID' },
          ]}
        />
      </div>
      <div className="flex-1 min-h-0 rounded-lg border border-border-subtle overflow-hidden">
        {bookTab === 'rank' ? renderRankTab() : renderSearchTab()}
      </div>
    </div>
  );

  const renderChapters = () => {
    const downloadableCount = chapters.filter(c => c.downloadable).length;
    return (
      <div className="h-full flex flex-col min-h-0 gap-3">
        <div className="shrink-0 p-2.5 rounded-lg bg-status-info/10 text-xs text-text-secondary">
          《{selectedBook?.bookName}》共 {chapters.length} 章，其中可推广章节 {downloadableCount} 章
          （第 1 ~ {downloadChapterIndex} 章），仅可推广章节可下载正文。
        </div>

        <div className="shrink-0 flex items-center gap-3">
          <span className="text-sm text-text-secondary whitespace-nowrap">下载范围</span>
          <InputNumber min={1} max={downloadChapterIndex} value={rangeStart}
            onChange={v => setRangeStart(Math.min(v || 1, rangeEnd))} />
          <span className="text-text-muted">至</span>
          <InputNumber min={rangeStart} max={downloadChapterIndex} value={rangeEnd}
            onChange={v => setRangeEnd(Math.max(v || downloadChapterIndex, rangeStart))} />
          <span className="text-xs text-text-muted">共 {selectedChapters.length} 章</span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-border-subtle p-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {selectedChapters.slice(0, 200).map(c => (
              <div key={c.itemId} className="text-xs text-text-tertiary truncate px-1 py-0.5" title={c.chapterName}>
                {c.chapterName}
              </div>
            ))}
            {selectedChapters.length > 200 && (
              <div className="text-xs text-text-muted px-1 py-0.5">… 等 {selectedChapters.length} 章</div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderDownload = () => (
    <div className="h-full flex flex-col items-center justify-center gap-3">
      <Progress
        className="!w-[70%]"
        percent={downloadTotal > 0 ? Math.round((downloadCompleted / downloadTotal) * 100) : 0}
        status={downloadFailed.length > 0 ? 'exception' : 'active'}
      />
      <p className="text-sm text-text-secondary m-0">
        已下载 {downloadCompleted} / {downloadTotal} 章
        {downloadCurrent ? ` · 刚完成：${downloadCurrent}` : ''}
      </p>
      {downloadFailed.length > 0 && (
        <p className="text-xs text-status-warning m-0">
          {downloadFailed.length} 章失败（将自动重试，仍失败则跳过）
        </p>
      )}
    </div>
  );

  const renderProject = () => (
    <div className="h-full overflow-y-auto space-y-4 pr-1">
      <div className="p-2.5 rounded-lg bg-status-success/10 text-xs text-text-secondary">
        已下载 {downloaded.length} 章（约 {Math.round(mergedScript.length / 10000)} 万字）
        {downloadFailed.length > 0 && `，${downloadFailed.length} 章失败已跳过`}
        。确认项目设置后，将创建项目并进入 AI 自动分集。
      </div>

      <div>
        <span className="block text-sm text-text-secondary mb-1.5">项目名称</span>
        <Input value={projectTitle} onChange={e => setProjectTitle(e.target.value)} placeholder="请输入项目名称" />
      </div>

      <div className="flex gap-6">
        <div>
          <span className="block text-sm text-text-secondary mb-1.5">叙事模式</span>
          <Segmented
            value={projectMode}
            onChange={v => setProjectMode(v as 'drama' | 'narration')}
            options={[
              { value: 'drama', label: '剧情模式' },
              { value: 'narration', label: '旁白解说' },
            ]}
          />
        </div>
        <div>
          <span className="block text-sm text-text-secondary mb-1.5">画面比例</span>
          <Segmented
            value={aspectRatio}
            onChange={v => setAspectRatio(v as '16:9' | '9:16')}
            options={[
              { value: '16:9', label: '16:9 横屏' },
              { value: '9:16', label: '9:16 竖屏' },
            ]}
          />
        </div>
      </div>

      <div>
        <span className="block text-sm text-text-secondary mb-1.5">视觉风格</span>
        <Select
          className="w-full"
          value={stylePresetId}
          onChange={setStylePresetId}
          options={themePresets.map(p => ({ value: p.id, label: `${p.name} — ${p.description}` }))}
          placeholder="选择视觉风格预设"
        />
      </div>
    </div>
  );

  /** 底部操作栏：每步的主按钮与状态都收在这里，位置固定不跳 */
  const renderFooter = () => {
    if (step === 'book') {
      return (
        <>
          <span className="text-xs text-text-muted truncate min-w-0">
            {selectedBook ? `已选：《${selectedBook.bookName}》` : '请选择一本书'}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            {bookTab === 'rank' && (rankPage > 0 || rankHasMore) && (
              <>
                <Button size="small" disabled={rankPage === 0 || rankLoading}
                  onClick={() => void loadBooks(rankPage - 1)}>上一页</Button>
                <span className="text-xs text-text-muted whitespace-nowrap">
                  第 {rankPage + 1} 页{rankTotal > 0 ? ` · 共 ${rankTotal} 本` : ''}
                </span>
                <Button size="small" disabled={!rankHasMore || rankLoading}
                  onClick={() => void loadBooks(rankPage + 1)}>下一页</Button>
              </>
            )}
            <Button type="primary" disabled={!selectedBook} loading={busy} onClick={handleLoadChapters}>
              获取章节列表
            </Button>
          </div>
        </>
      );
    }
    if (step === 'chapters') {
      return (
        <>
          <Button onClick={() => setStep('book')}>上一步</Button>
          <Button type="primary" icon={<ThunderboltOutlined />}
            disabled={selectedChapters.length === 0} onClick={handleDownload}>
            下载 {selectedChapters.length} 章正文
          </Button>
        </>
      );
    }
    if (step === 'project') {
      return (
        <>
          <span className="text-xs text-text-muted">下载完成，确认设置后创建项目</span>
          <Button type="primary" icon={<ThunderboltOutlined />} loading={busy}
            disabled={!projectTitle.trim()} onClick={handleCreateProject}>
            创建项目并自动分集
          </Button>
        </>
      );
    }
    // auth / download 这两步没有主动作，留空占位保持底栏高度一致
    return <span className="text-xs text-text-muted">&nbsp;</span>;
  };

  return (
    <>
      <Modal
        title="从番茄达人中心导入书籍"
        open={open && step !== 'split'}
        onCancel={onClose}
        footer={null}
        width={900}
        centered
        mask={{ closable: false }}
        destroyOnHidden
        styles={{ body: { padding: 0 } }}
      >
        {/* 固定高度骨架：Steps + 内容区（内部滚动）+ 操作栏 */}
        <div className="flex flex-col h-[560px]">
          <div className="shrink-0 px-6 pt-4 pb-3">
            <Steps
              size="small"
              current={stepIndex < 0 ? 4 : stepIndex}
              items={[
                { title: '登录' },
                { title: '书籍' },
                { title: '章节' },
                { title: '下载' },
                { title: '项目' },
              ]}
            />
          </div>

          <div className="flex-1 min-h-0 px-6">
            {step === 'auth' && renderAuth()}
            {step === 'book' && renderBook()}
            {step === 'chapters' && renderChapters()}
            {step === 'download' && renderDownload()}
            {step === 'project' && renderProject()}
          </div>

          <div className="shrink-0 flex items-center justify-between gap-3 px-6 py-3 mt-3 border-t border-border-subtle">
            {renderFooter()}
          </div>
        </div>
      </Modal>

      {/* AI 自动分集：复用现有向导。
          必须跟着 open 一起卸载——否则父级关掉弹窗后 step 仍是 'split'，
          分集向导会连同遮罩留在屏幕上关不掉，挡住后续所有操作。 */}
      {open && step === 'split' && createdProject && (
        <EpisodeSplitWizard
          visible
          projectId={createdProject.id}
          script={mergedScript}
          onCancel={handleSplitCancel}
          onComplete={handleSplitComplete}
        />
      )}
    </>
  );
};

export default FanqieImportDialog;
