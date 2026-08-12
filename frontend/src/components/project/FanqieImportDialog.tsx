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
  type FanqieRankEndpoint,
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

  // rank（达人中心书单：接口由主进程自动嗅探）
  const [rankBooks, setRankBooks] = useState<FanqieBook[]>([]);
  const [rankLoading, setRankLoading] = useState(false);
  const [rankLoaded, setRankLoaded] = useState(false);
  const [rankError, setRankError] = useState('');
  const [rankPage, setRankPage] = useState(0);
  const [rankHasMore, setRankHasMore] = useState(false);
  const [rankEndpoint, setRankEndpoint] = useState<FanqieRankEndpoint | null>(null);
  const [rankFilter, setRankFilter] = useState('');

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
    setRankBooks([]);
    setRankLoading(false);
    setRankLoaded(false);
    setRankError('');
    setRankPage(0);
    setRankHasMore(false);
    setRankEndpoint(null);
    setRankFilter('');
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

  // ---------- 达人中心书单 ----------

  /**
   * 拉取书单。首次（或 refresh）时主进程要打开达人中心首页旁听接口，约 6 秒；
   * 之后命中缓存模板，翻页是普通请求。
   */
  const loadRankBooks = useCallback(async (pageIndex: number, refresh = false) => {
    setRankLoading(true);
    setRankError('');
    try {
      const result = await fanqieKolService.listRankBooks({ pageIndex, refresh });
      setRankBooks(result.books);
      setRankEndpoint(result.endpoint);
      setRankPage(result.pageIndex);
      setRankHasMore(result.hasMore);
      setRankLoaded(true);
      if (result.books.length === 0) {
        setRankError('书单返回为空，可尝试「重新嗅探接口」');
      }
    } catch (err: any) {
      setRankError(err.message || '获取书单失败');
      setRankLoaded(true);
    } finally {
      setRankLoading(false);
    }
  }, []);

  // 进入书籍步骤且停在书单页时自动加载一次
  useEffect(() => {
    if (step !== 'book' || bookTab !== 'rank' || rankLoaded || rankLoading) return;
    void loadRankBooks(0);
  }, [step, bookTab, rankLoaded, rankLoading, loadRankBooks]);

  const filteredRankBooks = useMemo(() => {
    const keyword = rankFilter.trim().toLowerCase();
    if (!keyword) return rankBooks;
    return rankBooks.filter(b =>
      b.bookName.toLowerCase().includes(keyword)
      || b.author.toLowerCase().includes(keyword)
      || b.categories.some(c => c.toLowerCase().includes(keyword)),
    );
  }, [rankBooks, rankFilter]);

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

  const stepIndex = ['auth', 'book', 'chapters', 'download', 'project'].indexOf(step);

  const renderAuth = () => (
    <div className="py-8 flex flex-col items-center gap-4">
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
        </>
      )}
      {!busy && !authLoggedIn && (
        <Button type="text" icon={<ReloadOutlined />} onClick={checkAuth}>
          我已完成登录，重新检查
        </Button>
      )}
    </div>
  );

  const renderBookCard = (book: FanqieBook, rank?: number) => {
    const isSelected = selectedBook?.bookId === book.bookId;
    return (
      <div
        key={book.bookId}
        onClick={() => setSelectedBook(book)}
        className={`flex gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
          isSelected
            ? 'border-accent bg-accent/5'
            : 'border-border-subtle hover:border-accent/40 bg-bg-surface'
        }`}
      >
        {typeof rank === 'number' && (
          <span
            className={`shrink-0 w-5 text-center text-sm font-semibold leading-6 ${
              rank <= 3 ? 'text-status-warning' : 'text-text-muted'
            }`}
          >
            {rank}
          </span>
        )}
        {book.thumbUrl ? (
          <img src={book.thumbUrl} alt={book.bookName} className="w-12 h-16 object-cover rounded flex-shrink-0" />
        ) : (
          <div className="w-12 h-16 rounded bg-bg-elevated flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-text-primary truncate">{book.bookName}</span>
            {book.score > 0 && <Tag color="orange" className="!mr-0">{book.score}分</Tag>}
          </div>
          <div className="text-xs text-text-tertiary mt-1">
            {book.author || '佚名'}
            {book.wordNum > 0 && ` · ${(book.wordNum / 10000).toFixed(1)}万字`}
            {book.chapterNum > 0 && ` · 共${book.chapterNum}章`}
          </div>
          {book.categories.length > 0 && (
            <div className="text-xs text-text-muted mt-0.5">{book.categories.join(' / ')}</div>
          )}
        </div>
      </div>
    );
  };

  const renderRankTab = () => (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          prefix={<SearchOutlined className="text-text-muted" />}
          placeholder="在当前书单中过滤书名 / 作者 / 分类"
          value={rankFilter}
          onChange={e => setRankFilter(e.target.value)}
          allowClear
        />
        <Tooltip title="达人中心改版或书单为空时，重新嗅探书单接口">
          <Button
            icon={<ReloadOutlined />}
            loading={rankLoading}
            onClick={() => void loadRankBooks(0, true)}
          >
            重新嗅探
          </Button>
        </Tooltip>
      </div>

      {rankEndpoint && rankEndpoint.rankParams.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-xs text-text-muted">当前书单：</span>
          {rankEndpoint.rankParams.map(p => (
            <Tag key={p.key} className="!mr-0 !text-[11px]">{p.key}={p.value}</Tag>
          ))}
        </div>
      )}

      {rankLoading ? (
        <div className="py-10 flex flex-col items-center gap-3">
          <Spin />
          <p className="text-xs text-text-muted m-0">
            正在从达人中心读取书单（首次需要嗅探接口，约 6 秒）…
          </p>
        </div>
      ) : rankError ? (
        <div className="py-8 text-center space-y-2">
          <p className="text-sm text-status-warning m-0">{rankError}</p>
          <Button size="small" onClick={() => void loadRankBooks(0, true)}>重新嗅探接口</Button>
        </div>
      ) : (
        <>
          <div className="max-h-[320px] overflow-y-auto space-y-2 pr-1">
            {filteredRankBooks.length === 0 ? (
              <p className="py-8 text-center text-sm text-text-muted m-0">没有匹配的书籍</p>
            ) : (
              filteredRankBooks.map((book, idx) =>
                renderBookCard(book, rankFilter.trim() ? undefined : rankPage * rankBooks.length + idx + 1),
              )
            )}
          </div>
          {(rankPage > 0 || rankHasMore) && (
            <div className="flex items-center justify-center gap-3">
              <Button size="small" disabled={rankPage === 0} onClick={() => void loadRankBooks(rankPage - 1)}>
                上一页
              </Button>
              <span className="text-xs text-text-muted">第 {rankPage + 1} 页</span>
              <Button size="small" disabled={!rankHasMore} onClick={() => void loadRankBooks(rankPage + 1)}>
                下一页
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );

  const renderSearchTab = () => (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          prefix={<LinkOutlined className="text-text-muted" />}
          placeholder="如 https://kol.fanqieopen.com/page/content/book-detail?…&book_id=7590221243043826712 或书籍 ID / 书名"
          value={bookInput}
          onChange={e => setBookInput(e.target.value)}
          onPressEnter={handleSearchBook}
          allowClear
        />
        <Button type="primary" icon={<SearchOutlined />} loading={busy} onClick={handleSearchBook}>
          搜索
        </Button>
      </div>

      {searchResults.length > 0 && (
        <div className="max-h-[320px] overflow-y-auto space-y-2 pr-1">
          {searchResults.map(book => renderBookCard(book))}
        </div>
      )}
    </div>
  );

  const renderBook = () => (
    <div className="space-y-4">
      <Segmented
        block
        value={bookTab}
        onChange={v => setBookTab(v as 'search' | 'rank')}
        options={[
          { value: 'rank', label: '达人中心书单' },
          { value: 'search', label: '搜索 / 书籍 ID' },
        ]}
      />

      {bookTab === 'rank' ? renderRankTab() : renderSearchTab()}

      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted truncate">
          {selectedBook ? `已选：《${selectedBook.bookName}》` : '请选择一本书'}
        </span>
        <Button
          type="primary"
          disabled={!selectedBook}
          loading={busy}
          onClick={handleLoadChapters}
        >
          获取章节列表
        </Button>
      </div>
    </div>
  );

  const renderChapters = () => {
    const downloadableCount = chapters.filter(c => c.downloadable).length;
    return (
      <div className="space-y-4">
        <div className="p-3 rounded-lg bg-status-info/10 text-sm text-text-secondary">
          《{selectedBook?.bookName}》共 {chapters.length} 章，其中可推广章节 {downloadableCount} 章
          （第 1 ~ {downloadChapterIndex} 章），仅可推广章节可下载正文。
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-text-secondary whitespace-nowrap">下载范围</span>
          <InputNumber
            min={1}
            max={downloadChapterIndex}
            value={rangeStart}
            onChange={v => setRangeStart(Math.min(v || 1, rangeEnd))}
          />
          <span className="text-text-muted">至</span>
          <InputNumber
            min={rangeStart}
            max={downloadChapterIndex}
            value={rangeEnd}
            onChange={v => setRangeEnd(Math.max(v || downloadChapterIndex, rangeStart))}
          />
          <span className="text-xs text-text-muted">共 {selectedChapters.length} 章</span>
        </div>

        <div className="max-h-[200px] overflow-y-auto rounded-lg border border-border-subtle p-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {selectedChapters.slice(0, 100).map(c => (
              <div key={c.itemId} className="text-xs text-text-tertiary truncate px-1 py-0.5" title={c.chapterName}>
                {c.chapterName}
              </div>
            ))}
            {selectedChapters.length > 100 && (
              <div className="text-xs text-text-muted px-1 py-0.5">… 等 {selectedChapters.length} 章</div>
            )}
          </div>
        </div>

        <div className="flex justify-between">
          <Button onClick={() => setStep('book')}>上一步</Button>
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            disabled={selectedChapters.length === 0}
            onClick={handleDownload}
          >
            下载 {selectedChapters.length} 章正文
          </Button>
        </div>
      </div>
    );
  };

  const renderDownload = () => (
    <div className="py-6 space-y-4">
      <Progress
        percent={downloadTotal > 0 ? Math.round((downloadCompleted / downloadTotal) * 100) : 0}
        status={downloadFailed.length > 0 ? 'exception' : 'active'}
      />
      <p className="text-center text-sm text-text-secondary m-0">
        已下载 {downloadCompleted} / {downloadTotal} 章
        {downloadCurrent ? ` · 刚完成：${downloadCurrent}` : ''}
      </p>
      {downloadFailed.length > 0 && (
        <p className="text-center text-xs text-status-warning m-0">
          {downloadFailed.length} 章失败（将自动重试，仍失败则跳过）
        </p>
      )}
    </div>
  );

  const renderProject = () => (
    <div className="space-y-4">
      <div className="p-3 rounded-lg bg-status-success/10 text-sm text-text-secondary">
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

      <div className="flex justify-end">
        <Button
          type="primary"
          icon={<ThunderboltOutlined />}
          loading={busy}
          disabled={!projectTitle.trim()}
          onClick={handleCreateProject}
        >
          创建项目并自动分集
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <Modal
        title="从番茄达人中心导入书籍"
        open={open && step !== 'split'}
        onCancel={onClose}
        footer={null}
        width={720}
        centered
        mask={{ closable: false }}
        destroyOnHidden
      >
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
          className="mb-6"
        />

        {step === 'auth' && renderAuth()}
        {step === 'book' && renderBook()}
        {step === 'chapters' && renderChapters()}
        {step === 'download' && renderDownload()}
        {step === 'project' && renderProject()}
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
