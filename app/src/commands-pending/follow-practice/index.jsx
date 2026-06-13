import { runFollowPracticeScraper } from "./scraper.js";

const COMMAND_ID = "followPractice";
const STORAGE_KEY = "lookback.command.followPractice.v1";
const DEFAULT_USER_ID = "65fa3bb2000000000b00f730";
const DEFAULT_KEYWORDS = "day";
const REFRESH_EXPIRE_MS = 12 * 60 * 60 * 1000;
const SHELL_TIMEOUT_MS = 120000;
const PROFILE_SCROLL_MAX_CARDS = 100;
const SYSTEM_BROWSER_NOT_FOUND = "SYSTEM_BROWSER_NOT_FOUND";

export const config = {
  id: COMMAND_ID,
  i18n: {
    en: {
      "command.followPractice.title": "Follow Practice",
      "command.followPractice.description": "Track practice notes and add their images to the canvas",
      "command.followPractice.userId": "User ID",
      "command.followPractice.keywords": "Keywords",
      "command.followPractice.maxCards": "Max Cards",
      "command.followPractice.headless": "Headless mode",
      "command.followPractice.headless.hint": "If login is repeatedly required, try turning this on",
      "command.followPractice.refresh": "Fetch",
      "command.followPractice.clear": "Clear",
      "command.followPractice.clearTitle": "Clear todos",
      "command.followPractice.clearMessage": "Are you sure you want to clear all todos? This action cannot be undone.",
      "command.followPractice.login": "Login",
      "command.followPractice.follow": "Practice",
      "command.followPractice.loading": "Loading",
      "command.followPractice.checkIn": "Check in",
      "command.followPractice.cancelCheckIn": "Cancel check-in",
      "command.followPractice.done": "Done",
      "command.followPractice.pending": "Todo",
      "command.followPractice.images": "{{count}} images",
      "command.followPractice.empty": "No todos",
      "command.followPractice.empty.hint": "First fetch or expired login requires signing in again in the popup window",
      "command.followPractice.empty.respect": "Please respect the target account's profile preferences",
      "command.followPractice.status.ready": "Ready",
      "command.followPractice.status.preparing": "Preparing environment...",
      "command.followPractice.status.refreshing": "Refreshing...",
      "command.followPractice.status.login": "Waiting for login...",
      "command.followPractice.status.loginReady": "Login completed",
      "command.followPractice.status.fetchingImages": "Fetching note images...",
      "command.followPractice.status.importing": "Adding images...",
      "command.followPractice.status.updated": "Updated {{count}} todos",
      "command.followPractice.status.cleared": "Cleared",
      "command.followPractice.status.imported": "Added {{count}} images",
      "command.followPractice.status.failed": "Failed: {{error}}",
      "command.followPractice.error.systemBrowserNotFound": "Chrome or Microsoft Edge was not found. Please install one of them and try again.",
      "command.followPractice.lastRefresh": "Last refresh {{time}}",
      "toast.command.followPractice.imported": "Added {{count}} images",
      "toast.command.followPractice.noImages": "No images found for this note",
      "toast.command.followPractice.failed": "Follow practice failed: {{error}}",
    },
    zh: {
      "command.followPractice.title": "打卡跟练",
      "command.followPractice.description": "抓取练习帖子，生成待办并把图片加入当前画板",
      "command.followPractice.userId": "用户 ID",
      "command.followPractice.keywords": "匹配关键词",
      "command.followPractice.maxCards": "最大数量",
      "command.followPractice.headless": "无头模式",
      "command.followPractice.headless.hint": "如果一直提示未登录，尝试开启",
      "command.followPractice.refresh": "拉取",
      "command.followPractice.clear": "清空",
      "command.followPractice.clearTitle": "清空待办",
      "command.followPractice.clearMessage": "确定要清空全部待办吗？此操作无法撤销。",
      "command.followPractice.login": "登录",
      "command.followPractice.follow": "跟练",
      "command.followPractice.loading": "加载中",
      "command.followPractice.checkIn": "打卡",
      "command.followPractice.cancelCheckIn": "取消打卡",
      "command.followPractice.done": "已打卡",
      "command.followPractice.pending": "待办",
      "command.followPractice.images": "{{count}} 张图",
      "command.followPractice.empty": "暂无待办",
      "command.followPractice.empty.hint": "第一次拉取/登录过期 需要重新在弹出窗口登录",
      "command.followPractice.empty.respect": "请尊重目标账号简介中的意愿",
      "command.followPractice.status.ready": "就绪",
      "command.followPractice.status.preparing": "正在准备环境...",
      "command.followPractice.status.refreshing": "正在刷新...",
      "command.followPractice.status.login": "等待登录...",
      "command.followPractice.status.loginReady": "登录完成",
      "command.followPractice.status.fetchingImages": "正在抓取帖子图片...",
      "command.followPractice.status.importing": "正在加入图片...",
      "command.followPractice.status.updated": "已更新 {{count}} 条待办",
      "command.followPractice.status.cleared": "已清空",
      "command.followPractice.status.imported": "已加入 {{count}} 张图片",
      "command.followPractice.status.failed": "失败：{{error}}",
      "command.followPractice.error.systemBrowserNotFound": "未找到 Chrome 或 Microsoft Edge，请先安装其中一个浏览器后再重试。",
      "command.followPractice.lastRefresh": "上次刷新 {{time}}",
      "toast.command.followPractice.imported": "已加入 {{count}} 张图片",
      "toast.command.followPractice.noImages": "这个帖子没有可用图片",
      "toast.command.followPractice.failed": "打卡跟练失败：{{error}}",
    },
  },
  titleKey: "command.followPractice.title",
  title: "Follow Practice",
  descriptionKey: "command.followPractice.description",
  description: "Track practice notes and add their images to the canvas",
  keywords: ["follow", "practice", "todo", "checkin", "小红书", "打卡", "跟练"],
};

const isWin = () => String(navigator.platform || "").toLowerCase().includes("win");

const pathJoin = (base, ...parts) => {
  const separator = isWin() ? "\\" : "/";
  const normalizedBase = String(base || "").replace(/[\\/]+$/, "");
  return [normalizedBase, ...parts.filter(Boolean)].join(separator);
};

const safeJsonParse = (value, fallback) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const normalizeTodo = (todo) => ({
  noteId: String(todo?.noteId || ""),
  url: String(todo?.url || ""),
  title: String(todo?.title || ""),
  desc: String(todo?.desc || ""),
  coverUrl: String(todo?.coverUrl || ""),
  imageUrls: Array.isArray(todo?.imageUrls) ? todo.imageUrls.filter(Boolean) : [],
  status: todo?.status === "done" ? "done" : "pending",
  createdAt: Number(todo?.createdAt || Date.now()),
  updatedAt: Number(todo?.updatedAt || Date.now()),
  checkedAt: Number(todo?.checkedAt || 0),
  followedAt: Number(todo?.followedAt || 0),
});

const loadState = () => {
  const rawText = localStorage.getItem(STORAGE_KEY) || "";
  const raw = safeJsonParse(rawText || "", null);
  const todos = Array.isArray(raw?.todos) ? raw.todos.map(normalizeTodo) : [];
  return {
    userId: String(raw?.userId || DEFAULT_USER_ID),
    keywords: String(raw?.keywords || DEFAULT_KEYWORDS),
    headless: raw?.headless !== false,
    maxCards: Number(raw?.maxCards) || PROFILE_SCROLL_MAX_CARDS,
    todos,
    lastRefreshAt: Number(raw?.lastRefreshAt || 0),
    browserReady: raw?.browserReady === true,
  };
};

const saveState = (nextState) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
};

const splitKeywords = (value) =>
  String(value || "")
    .split(/[\s,，、]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const buildProfileUrl = (userId) =>
  `https://www.xiaohongshu.com/user/profile/${encodeURIComponent(userId.trim())}`;

const runShell = async (shell, payload) =>
  shell({
    timeoutMs: SHELL_TIMEOUT_MS,
    ...payload,
  });

const psEscape = (value) => String(value).replace(/'/g, "''");

const ensureDir = async (shell, dirPath) => {
  if (isWin()) {
    const script = [
      "$ErrorActionPreference='Stop'",
      `$dir='${psEscape(dirPath)}'`,
      "if (!(Test-Path -LiteralPath $dir -PathType Container)) {",
      "  New-Item -ItemType Directory -Path $dir -Force | Out-Null",
      "}",
    ].join("; ");
    return runShell(shell, {
      command: "powershell.exe",
      args: ["-NoProfile", "-Command", script],
    });
  }
  return runShell(shell, {
    command: "mkdir",
    args: ["-p", dirPath],
  });
};

const removeDir = async (shell, dirPath) => {
  if (isWin()) {
    const script = [
      "$ErrorActionPreference='Stop'",
      `$dir='${psEscape(dirPath)}'`,
      "if (Test-Path -LiteralPath $dir -PathType Container) {",
      "  Remove-Item -LiteralPath $dir -Recurse -Force",
      "}",
    ].join("; ");
    return runShell(shell, {
      command: "powershell.exe",
      args: ["-NoProfile", "-Command", script],
    });
  }

  return runShell(shell, {
    command: "rm",
    args: ["-rf", dirPath],
  });
};

const getRuntimeDir = async () => {
  const storageDir = await window.electron?.getStorageDir?.();
  if (!storageDir) throw new Error("Storage directory unavailable");
  return pathJoin(storageDir, "command-runtimes", "follow-practice");
};


const prepareRuntime = async (shell, state, setStatePatch) => {
  const runtimeDir = await getRuntimeDir();
  const dirResult = await ensureDir(shell, runtimeDir);
  if (!dirResult.success) {
    throw new Error(dirResult.error || dirResult.stderr || "Failed to prepare directory");
  }

  if (!state.browserReady) {
    setStatePatch({ browserReady: true });
  }

  return {
    runtimeDir,
    profileDir: pathJoin(runtimeDir, "xhs-profile"),
  };
};

const assertScraperSuccess = (payload, fallbackMessage) => {
  if (payload?.success === true) {
    return {
      todos: Array.isArray(payload.todos) ? payload.todos : [],
      debugTrace: payload.debug ? String(payload.debug) : "",
    };
  }
  const message = payload?.error ? String(payload.error) : fallbackMessage;
  const debugTrace = payload?.debug ? String(payload.debug) : "";
  throw new Error(debugTrace ? `${message} | debug=${debugTrace}` : message);
};

const scrapeTodos = async (runtime, userId, keywords, headless, maxCards) => {
  const payload = {
    mode: "scrape",
    profileUrl: buildProfileUrl(userId),
    userDataDir: runtime.profileDir,
    keywords: splitKeywords(keywords),
    headless: headless !== false,
    maxCards: Number(maxCards) || PROFILE_SCROLL_MAX_CARDS,
  };
  return assertScraperSuccess(await runFollowPracticeScraper(payload), "Scrape failed");
};

const scrapeTodoDetail = async (runtime, userId, todo, headless) => {
  const payload = {
    mode: "detail",
    profileUrl: buildProfileUrl(userId),
    userDataDir: runtime.profileDir,
    headless: headless !== false,
    card: {
      noteId: todo.noteId,
      url: todo.url,
      title: todo.title || todo.noteId,
      desc: todo.desc,
      coverUrl: todo.coverUrl,
    },
  };
  const { todos, debugTrace } = assertScraperSuccess(
    await runFollowPracticeScraper(payload),
    "Scrape failed",
  );
  const [detail] = todos;
  if (!detail) throw new Error("No note detail");
  return { ...detail, __debugTrace: debugTrace };
};

const openLoginWindow = async (runtime, userId) => {
  const payload = {
    mode: "login",
    profileUrl: buildProfileUrl(userId),
    userDataDir: runtime.profileDir,
  };
  assertScraperSuccess(await runFollowPracticeScraper(payload), "Login failed");
};

const clearLoginState = async (shell) => {
  const runtimeDir = await getRuntimeDir();
  const profileDir = pathJoin(runtimeDir, "xhs-profile");
  const result = await removeDir(shell, profileDir);
  if (!result.success) {
    throw new Error(result.error || result.stderr || "Failed to clear login state");
  }
};

const getTodoTextKey = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const getTodoTitleKey = (todo) => getTodoTextKey(todo?.title || todo?.noteId);

const mergeTodoRecord = (previous, scraped, now) => {
  const imageUrls = Array.isArray(scraped?.imageUrls) ? scraped.imageUrls.filter(Boolean) : [];
  const previousImages = Array.isArray(previous?.imageUrls) ? previous.imageUrls.filter(Boolean) : [];
  return normalizeTodo({
    ...previous,
    noteId: String(scraped?.noteId || previous?.noteId || ""),
    url: String(scraped?.url || previous?.url || ""),
    title: String(scraped?.title || previous?.title || ""),
    desc: String(scraped?.desc || previous?.desc || ""),
    coverUrl: String(scraped?.coverUrl || previous?.coverUrl || imageUrls[0] || previousImages[0] || ""),
    imageUrls: imageUrls.length > 0 ? unique([...previousImages, ...imageUrls]) : previousImages,
    status: previous?.status || "pending",
    createdAt: previous?.createdAt || now,
    updatedAt: now,
    checkedAt: previous?.checkedAt || 0,
    followedAt: previous?.followedAt || 0,
  });
};

const mergeTodos = (currentTodos, scrapedTodos) => {
  const currentById = new Map();
  const currentByTitle = new Map();
  for (const todo of currentTodos) {
    const noteId = String(todo?.noteId || "").trim();
    const titleKey = getTodoTitleKey(todo);
    if (noteId && !currentById.has(noteId)) currentById.set(noteId, todo);
    if (titleKey && !currentByTitle.has(titleKey)) currentByTitle.set(titleKey, todo);
  }

  const next = [];
  const nextById = new Map();
  const nextByTitle = new Map();
  const now = Date.now();
  const indexTodo = (todo, index) => {
    const noteId = String(todo?.noteId || "").trim();
    const titleKey = getTodoTitleKey(todo);
    if (noteId) nextById.set(noteId, index);
    if (titleKey) nextByTitle.set(titleKey, index);
  };

  for (const scraped of scrapedTodos) {
    const noteId = String(scraped?.noteId || "").trim();
    if (!noteId) continue;
    const titleKey = getTodoTitleKey(scraped);
    const existingIndex =
      (noteId && nextById.has(noteId) ? nextById.get(noteId) : undefined) ??
      (titleKey && nextByTitle.has(titleKey) ? nextByTitle.get(titleKey) : undefined);
    if (typeof existingIndex === "number") {
      next[existingIndex] = mergeTodoRecord(next[existingIndex], scraped, now);
      indexTodo(next[existingIndex], existingIndex);
      continue;
    }

    const previous = currentById.get(noteId) || currentByTitle.get(titleKey);
    const merged = mergeTodoRecord(previous, scraped, now);
    next.push(merged);
    indexTodo(merged, next.length - 1);
  }

  for (const todo of currentTodos) {
    const noteId = String(todo?.noteId || "").trim();
    const titleKey = getTodoTitleKey(todo);
    if (noteId && nextById.has(noteId)) continue;
    if (titleKey && nextByTitle.has(titleKey)) continue;
    next.push(todo);
    indexTodo(todo, next.length - 1);
  }
  return next;
};

const createImageMeta = (downloaded, todo) => {
  const name = String(downloaded.filename || "image");
  const dot = name.lastIndexOf(".");
  return {
    id: `temp_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    filename: dot > 0 ? name.slice(0, dot) : name,
    imagePath: downloaded.path,
    pageUrl: todo.url,
    tags: [],
    createdAt: Date.now(),
    dominantColor: downloaded.dominantColor ?? null,
    tone: downloaded.tone ?? null,
    hasVector: false,
    width: downloaded.width || 0,
    height: downloaded.height || 0,
  };
};

const downloadTodoImages = async (context, todo, canvasName) => {
  const { API_BASE_URL } = context.config;
  const metas = [];
  for (const imageUrl of todo.imageUrls) {
    const resp = await fetch(`${API_BASE_URL}/api/download-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: imageUrl,
        canvasName,
      }),
    });
    if (!resp.ok) continue;
    const data = await resp.json();
    if (data?.success && data.path) {
      metas.push(createImageMeta(data, todo));
    }
  }
  return metas;
};

const getCanvasCenter = (canvasSnap) => {
  const viewport = canvasSnap.canvasViewport || {};
  const dimensions = canvasSnap.dimensions || {};
  const scale = viewport.scale || 1;
  return {
    x: ((dimensions.width || 0) / 2 - (viewport.x || 0)) / scale,
    y: ((dimensions.height || 0) / 2 - (viewport.y || 0)) / scale,
  };
};

const formatTime = (timestamp) => {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleString();
};

const resolveErrorMessage = (error, t) => {
  const message = error instanceof Error ? error.message : String(error);
  if (message === SYSTEM_BROWSER_NOT_FOUND) {
    return t("command.followPractice.error.systemBrowserNotFound");
  }
  return message;
};

const isRefreshExpired = (timestamp) => {
  const value = Number(timestamp);
  return value > 0 && Date.now() - value >= REFRESH_EXPIRE_MS;
};

export const ui = ({ context }) => {
  const { React, hooks, actions, shell } = context;
  const { useEffect, useMemo, useRef, useState } = React;
  const { useEnvState, useT } = hooks;
  const { t } = useT();
  const { canvas: canvasSnap } = useEnvState();

  const [storedState, setStoredState] = useState(() => loadState());
  const [userId, setUserId] = useState(storedState.userId);
  const [keywords, setKeywords] = useState(storedState.keywords);
  const [headless, setHeadless] = useState(storedState.headless !== false);
  const [maxCards, setMaxCards] = useState(storedState.maxCards);
  const [status, setStatus] = useState({ key: "command.followPractice.status.ready" });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoginOpening, setIsLoginOpening] = useState(false);
  const [isScraperRunning, setIsScraperRunning] = useState(false);
  const [activeNoteId, setActiveNoteId] = useState("");
  const scraperTaskRef = useRef(null);
  const storedStateRef = useRef(storedState);
  const userIdRef = useRef(userId);
  const keywordsRef = useRef(keywords);
  const headlessRef = useRef(headless);
  const maxCardsRef = useRef(maxCards);

  const writeState = (next) => {
    storedStateRef.current = next;
    saveState(next);
    setStoredState(next);
  };

  const patchState = (patch) => {
    writeState({ ...storedStateRef.current, ...patch });
  };

  const setStatePatch = (patch) => patchState(patch);

  const handleUserIdChange = (value) => {
    setUserId(value);
    userIdRef.current = value;
    patchState({ userId: value });
  };

  const handleKeywordsChange = (value) => {
    setKeywords(value);
    keywordsRef.current = value;
    patchState({ keywords: value });
  };

  const handleHeadlessChange = (value) => {
    setHeadless(value);
    headlessRef.current = value;
    patchState({ headless: value });
  };

  const handleMaxCardsChange = (value) => {
    const num = Number(value) || PROFILE_SCROLL_MAX_CARDS;
    setMaxCards(num);
    maxCardsRef.current = num;
    patchState({ maxCards: num });
  };

  const refreshTodos = async (reason = "manual") => {
    if (scraperTaskRef.current) return scraperTaskRef.current;

    const task = (async () => {
      try {
        if (
          reason === "expiredOnOpen" &&
          !isRefreshExpired(storedStateRef.current.lastRefreshAt)
        ) {
          return;
        }
        setIsRefreshing(true);
        setStatus({ key: "command.followPractice.status.preparing" });
        const activeUserId = userIdRef.current;
        const activeKeywords = keywordsRef.current;
        const activeHeadless = headlessRef.current;
        const activeMaxCards = maxCardsRef.current;
        const runtime = await prepareRuntime(shell, storedStateRef.current, setStatePatch);
        setStatus({ key: "command.followPractice.status.refreshing" });
        const { todos: scraped, debugTrace } = await scrapeTodos(runtime, activeUserId, activeKeywords, activeHeadless, activeMaxCards);
        const nextTodos = mergeTodos(storedStateRef.current.todos, scraped);
        patchState({
          todos: nextTodos,
          userId: activeUserId,
          keywords: activeKeywords,
          headless: activeHeadless,
          maxCards: activeMaxCards,
          lastRefreshAt: Date.now(),
        });
        if (nextTodos.length === 0 && debugTrace) {
          setStatus({
            key: "command.followPractice.status.failed",
            params: { error: `0 条 | debug=${debugTrace}` },
          });
        } else {
          setStatus({
            key: "command.followPractice.status.updated",
            params: { count: nextTodos.length },
          });
        }
      } catch (error) {
        const message = resolveErrorMessage(error, t);
        setStatus({
          key: "command.followPractice.status.failed",
          params: { error: message },
        });
        actions.globalActions.pushToast(
          {
            key: "toast.command.followPractice.failed",
            params: { error: message },
          },
          "error",
        );
      } finally {
        setIsRefreshing(false);
        scraperTaskRef.current = null;
        setIsScraperRunning(false);
      }
    })();

    scraperTaskRef.current = task;
    setIsScraperRunning(true);
    return task;
  };

  useEffect(() => {
    const lastRefreshAt = Number(storedStateRef.current.lastRefreshAt || 0);
    if (isRefreshExpired(lastRefreshAt)) {
      void refreshTodos("expiredOnOpen");
    }
  }, []);

  const handleClear = async () => {
    const confirmed = window.confirm(
      `${t("command.followPractice.clearTitle")}\n\n${t("command.followPractice.clearMessage")}`,
    );
    if (!confirmed) return;

    try {
      setIsRefreshing(true);
      await clearLoginState(shell);
      patchState({
        todos: [],
        lastRefreshAt: 0,
        browserReady: false,
      });
      setStatus({ key: "command.followPractice.status.cleared" });
    } catch (error) {
      const message = resolveErrorMessage(error, t);
      setStatus({
        key: "command.followPractice.status.failed",
        params: { error: message },
      });
      actions.globalActions.pushToast(
        {
          key: "toast.command.followPractice.failed",
          params: { error: message },
        },
        "error",
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleLogin = async () => {
    try {
      setIsLoginOpening(true);
      setStatus({ key: "command.followPractice.status.preparing" });
      const runtime = await prepareRuntime(shell, storedStateRef.current, setStatePatch);
      setStatus({ key: "command.followPractice.status.login" });
      await openLoginWindow(runtime, userIdRef.current);
      setStatus({ key: "command.followPractice.status.loginReady" });
      patchState({ browserReady: true });
    } catch (error) {
      const message = resolveErrorMessage(error, t);
      setStatus({
        key: "command.followPractice.status.failed",
        params: { error: message },
      });
      actions.globalActions.pushToast(
        {
          key: "toast.command.followPractice.failed",
          params: { error: message },
        },
        "error",
      );
    } finally {
      setIsLoginOpening(false);
    }
  };

  const updateTodo = (noteId, patch) => {
    const todos = storedStateRef.current.todos.map((todo) =>
      todo.noteId === noteId ? normalizeTodo({ ...todo, ...patch }) : todo,
    );
    patchState({ todos });
  };

  const handleFollow = async (todo) => {
    try {
      setActiveNoteId(todo.noteId);
      let activeTodo = todo;
      let detailDebugTrace = "";
      if (!activeTodo.imageUrls.length) {
        setStatus({ key: "command.followPractice.status.fetchingImages" });
        const runtime = await prepareRuntime(shell, storedStateRef.current, setStatePatch);
        const detail = await scrapeTodoDetail(
          runtime,
          userIdRef.current,
          activeTodo,
          headlessRef.current,
        );
        detailDebugTrace = String(detail.__debugTrace || "");
        activeTodo = normalizeTodo({
          ...activeTodo,
          ...detail,
          noteId: activeTodo.noteId,
          imageUrls: Array.isArray(detail.imageUrls) ? detail.imageUrls : [],
          updatedAt: Date.now(),
        });
        updateTodo(todo.noteId, activeTodo);
      }

      setStatus({ key: "command.followPractice.status.importing" });
      if (!activeTodo.imageUrls.length) {
        if (detailDebugTrace) {
          setStatus({
            key: "command.followPractice.status.failed",
            params: { error: `No images | debug=${detailDebugTrace}` },
          });
        }
        actions.globalActions.pushToast(
          { key: "toast.command.followPractice.noImages" },
          "warning",
        );
        return;
      }

      const canvasName = canvasSnap.currentCanvasName || "Default";
      const metas = await downloadTodoImages(context, activeTodo, canvasName);
      if (!metas.length) {
        setStatus({
          key: "command.followPractice.status.failed",
          params: {
            error: `Downloaded 0/${activeTodo.imageUrls.length} images from ${activeTodo.url || activeTodo.noteId}`,
          },
        });
        actions.globalActions.pushToast(
          { key: "toast.command.followPractice.noImages" },
          "warning",
        );
        return;
      }

      actions.canvasActions.addManyImagesToCanvasCentered(metas, getCanvasCenter(canvasSnap));
      updateTodo(todo.noteId, { followedAt: Date.now() });
      setStatus({
        key: "command.followPractice.status.imported",
        params: { count: metas.length },
      });
      actions.globalActions.pushToast(
        {
          key: "toast.command.followPractice.imported",
          params: { count: metas.length },
        },
        "success",
      );
    } catch (error) {
      const message = resolveErrorMessage(error, t);
      setStatus({
        key: "command.followPractice.status.failed",
        params: { error: message },
      });
      actions.globalActions.pushToast(
        {
          key: "toast.command.followPractice.failed",
          params: { error: message },
        },
        "error",
      );
    } finally {
      setActiveNoteId("");
    }
  };

  const handleCheckIn = (todo) => {
    if (todo.status === "done") {
      updateTodo(todo.noteId, {
        status: "pending",
        checkedAt: 0,
      });
      return;
    }

    updateTodo(todo.noteId, {
      status: "done",
      checkedAt: Date.now(),
    });
  };

  const visibleTodos = useMemo(
    () =>
      storedState.todos.map((todo) => ({
        ...todo,
        displayTitle: todo.title || todo.desc || todo.noteId,
      })),
    [storedState.todos],
  );

  const statusText = t(status.key, status.params);
  const lastRefreshText = storedState.lastRefreshAt
    ? t("command.followPractice.lastRefresh", {
        time: formatTime(storedState.lastRefreshAt),
      })
    : "";

  return (
    <div className="flex h-130 flex-col bg-neutral-950 text-neutral-100">
      <div className="flex shrink-0 items-start gap-3 border-b border-neutral-800 px-4 py-3">
        <label className="flex w-54 shrink-0 flex-col gap-1">
          <span className="text-xs text-neutral-400">
            {t("command.followPractice.userId")}
          </span>
          <input
            value={userId}
            onChange={(event) => handleUserIdChange(event.target.value)}
            className="h-8 rounded border border-neutral-700 bg-neutral-900 px-2 text-sm text-neutral-100 outline-none focus:border-primary"
          />
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-xs text-neutral-400">
            {t("command.followPractice.keywords")}
          </span>
          <input
            value={keywords}
            onChange={(event) => handleKeywordsChange(event.target.value)}
            className="h-8 rounded border border-neutral-700 bg-neutral-900 px-2 text-sm text-neutral-100 outline-none focus:border-primary"
          />
        </label>
        <label className="flex w-16 shrink-0 flex-col gap-1">
          <span className="text-xs text-neutral-400">
            {t("command.followPractice.maxCards")}
          </span>
          <input
            type="number"
            value={maxCards}
            onChange={(event) => setMaxCards(Number(event.target.value) || PROFILE_SCROLL_MAX_CARDS)}
            onBlur={(event) => handleMaxCardsChange(event.target.value)}
            min="1"
            max="500"
            className="h-8 rounded border border-neutral-700 bg-neutral-900 px-2 text-sm text-neutral-100 outline-none focus:border-primary"
          />
        </label>
        <button
          type="button"
          onClick={() => void refreshTodos("manual")}
          disabled={isScraperRunning}
          className="mt-5 h-8 rounded border border-neutral-700 px-3 text-sm text-neutral-100 hover:border-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t("command.followPractice.refresh")}
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="mt-5 h-8 rounded bg-red-600 px-3 text-sm font-medium text-white hover:bg-red-500"
        >
          {t("command.followPractice.clear")}
        </button>
        <button
          type="button"
          onClick={() => void handleLogin()}
          disabled={isScraperRunning}
          className="mt-5 h-8 rounded bg-primary px-3 text-sm font-medium text-neutral-950 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t("command.followPractice.login")}
        </button>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-900 px-4 py-2 text-xs">
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-neutral-300">
            <input
              type="checkbox"
              checked={headless}
              onChange={(event) => handleHeadlessChange(event.target.checked)}
              className="h-3.5 w-3.5 rounded border border-neutral-600 bg-neutral-900 accent-primary"
            />
            <span>{t("command.followPractice.headless")}</span>
          </label>
          <span className="group relative inline-flex h-4 w-4 items-center justify-center rounded-full border border-neutral-600 text-[10px] font-semibold text-neutral-400">
            ?
            <span className="pointer-events-none absolute left-1/2 top-5 z-10 w-24 -translate-x-1/2 rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-left text-xs font-normal leading-relaxed text-neutral-200 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              {t("command.followPractice.headless.hint")}
            </span>
          </span>
        </div>
        <div className="flex min-w-0 items-center justify-end gap-3 text-neutral-400">
          <span className="truncate">{statusText}</span>
          {lastRefreshText ? <span className="shrink-0">{lastRefreshText}</span> : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {visibleTodos.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <div className="text-sm text-neutral-500">
              {t("command.followPractice.empty")}
            </div>
            <div className="max-w-72 text-xs leading-relaxed text-neutral-600">
              {t("command.followPractice.empty.hint")}
            </div>
            <div className="max-w-72 text-xs leading-relaxed text-neutral-600">
              {t("command.followPractice.empty.respect")}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {visibleTodos.map((todo) => {
              const isBusy = activeNoteId === todo.noteId;
              const isDone = todo.status === "done";
              return (
                <div
                  key={todo.noteId}
                  className="grid grid-cols-[56px_1fr_auto] items-center gap-3 rounded border border-neutral-800 bg-neutral-900/70 p-2"
                >
                  <div className="h-14 w-14 overflow-hidden rounded bg-neutral-800">
                    {todo.coverUrl ? (
                      <img
                        src={todo.coverUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm text-neutral-100">
                      {todo.displayTitle}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-neutral-500">
                      <span className={isDone ? "text-primary" : ""}>
                        {isDone
                          ? t("command.followPractice.done")
                          : t("command.followPractice.pending")}
                      </span>
                      <span>
                        {t("command.followPractice.images", {
                          count: todo.imageUrls.length,
                        })}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleFollow(todo)}
                      disabled={isBusy || isScraperRunning}
                      aria-busy={isBusy}
                      className="inline-flex h-8 min-w-[76px] items-center justify-center gap-1.5 rounded border border-neutral-700 px-3 text-sm text-neutral-100 hover:border-primary disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isBusy ? (
                        <>
                          <span
                            className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-neutral-600 border-t-primary"
                            aria-hidden="true"
                          />
                          <span>{t("command.followPractice.loading")}</span>
                        </>
                      ) : (
                        t("command.followPractice.follow")
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCheckIn(todo)}
                      className={
                        isDone
                          ? "h-8 rounded bg-primary px-3 text-sm font-medium text-neutral-950"
                          : "h-8 rounded bg-neutral-100 px-3 text-sm font-medium text-neutral-950"
                      }
                    >
                      {isDone
                        ? t("command.followPractice.cancelCheckIn")
                        : t("command.followPractice.checkIn")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
