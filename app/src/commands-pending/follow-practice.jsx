// This file is intended to be dynamically loaded.
// Imports are not allowed. Dependencies are passed via context.

const COMMAND_ID = "followPractice";
const STORAGE_KEY = "lookback.command.followPractice.v1";
const RESULT_PREFIX = "__FOLLOW_PRACTICE_RESULT__";
const DEBUG_PREFIX = "__FOLLOW_PRACTICE_DEBUG__";
const DEFAULT_USER_ID = "65fa3bb2000000000b00f730";
const DEFAULT_KEYWORDS = "day";
const REFRESH_EXPIRE_MS = 12 * 60 * 60 * 1000;
const SHELL_TIMEOUT_MS = 120000;
const LOGIN_TIMEOUT_MS = 600000;
const DETAIL_IMAGE_SCAN_STEPS = 10;
const PROFILE_SCROLL_MAX_STEPS = 80;
const PROFILE_SCROLL_IDLE_ROUNDS = 5;
const PROFILE_SCROLL_WAIT_MS = 900;
const PROFILE_SCROLL_INITIAL_WAIT_MS = 600;
const PROFILE_SCROLL_MAX_CARDS = 100;
const NPM_REGISTRY = "https://registry.npmmirror.com";

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

const encodeBase64 = (value) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const splitKeywords = (value) =>
  String(value || "")
    .split(/[\s,，、]+/)
    .map((item) => item.trim())
    .filter(Boolean);

// Simple djb2-style hash for change detection – fast and good enough
const simpleHash = (str) => {
  let h = 5381;
  for (let i = 0; i < str.length; i += 1) {
    h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
};

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

const pathExists = async (shell, filePath) => {
  if (isWin()) {
    const script = `if (Test-Path -LiteralPath '${psEscape(filePath)}') { exit 0 }; exit 1`;
    const result = await runShell(shell, {
      command: "powershell.exe",
      args: ["-NoProfile", "-Command", script],
    });
    return result.success;
  }
  const result = await runShell(shell, {
    command: "test",
    args: ["-e", filePath],
  });
  return result.success;
};

const writeTextFile = async (shell, filePath, content) => {
  const encoded = encodeBase64(content);
  if (isWin()) {
    const chunkSize = 4000;
    const chunks = [];
    for (let i = 0; i < encoded.length; i += chunkSize) {
      chunks.push(encoded.slice(i, i + chunkSize));
    }

    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i];
      const script = [
        "$ErrorActionPreference='Stop'",
        `$path='${psEscape(filePath)}'`,
        `$data='${chunk}'`,
        "$dir=[IO.Path]::GetDirectoryName($path)",
        "if ($dir) { [IO.Directory]::CreateDirectory($dir) | Out-Null }",
        "$text=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($data))",
        i === 0
          ? "Set-Content -LiteralPath $path -Value $text -Encoding utf8 -NoNewline"
          : "Add-Content -LiteralPath $path -Value $text -Encoding utf8 -NoNewline",
      ].join("; ");
      const result = await runShell(shell, {
        command: "powershell.exe",
        args: ["-NoProfile", "-Command", script],
      });
      if (!result.success) {
        return result;
      }
    }

    return {
      success: true,
      code: 0,
      signal: null,
      stdout: "",
      stderr: "",
      timedOut: false,
      error: null,
    };
  }

  const script = [
    "target=$1",
    "data=$2",
    "mkdir -p \"$(dirname \"$target\")\"",
    "if printf '%s' \"$data\" | base64 -d > \"$target\" 2>/dev/null; then exit 0; fi",
    "printf '%s' \"$data\" | base64 -D > \"$target\"",
  ].join("; ");
  return runShell(shell, {
    command: "sh",
    args: ["-c", script, "write-follow-practice-file", filePath, encoded],
  });
};

const readTextFile = async (shell, filePath) => {
  if (isWin()) {
    const script = [
      `$path='${psEscape(filePath)}'`,
      "if (!(Test-Path -LiteralPath $path -PathType Leaf)) { exit 1 }",
      "Get-Content -LiteralPath $path -Raw -Encoding utf8",
    ].join("; ");
    const result = await runShell(shell, {
      command: "powershell.exe",
      args: ["-NoProfile", "-Command", script],
    });
    return result.success ? String(result.stdout || "").trim() : null;
  }
  const result = await runShell(shell, {
    command: "sh",
    args: ["-c", `cat "${filePath}" 2>/dev/null || exit 1`],
  });
  return result.success ? String(result.stdout || "").trim() : null;
};

const buildPackageJson = () =>
  JSON.stringify(
    {
      private: true,
    },
    null,
    2,
  );

const getRuntimeDir = async () => {
  const storageDir = await window.electron?.getStorageDir?.();
  if (!storageDir) throw new Error("Storage directory unavailable");
  return pathJoin(storageDir, "command-runtimes", "follow-practice");
};

const getScraperSource = () => String.raw`
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RESULT_PREFIX = "__FOLLOW_PRACTICE_RESULT__";
const DEBUG_PREFIX = "__FOLLOW_PRACTICE_DEBUG__";
const DEFAULT_IMAGE_SCAN_STEP = ${DETAIL_IMAGE_SCAN_STEPS};
const DETAIL_IMAGE_STABLE_ROUNDS = 3;
const CARD_FIND_MAX_STEPS = 36;
const CARD_FIND_SLEEP_MS = 150;
const LOGIN_WAIT_TIMEOUT_MS = ${LOGIN_TIMEOUT_MS};
const LOGIN_POLL_MIN_LOOPS_BEFORE_ACCEPT = 8;
const PROFILE_SCROLL_MAX_STEPS = ${PROFILE_SCROLL_MAX_STEPS};
const PROFILE_SCROLL_IDLE_ROUNDS = ${PROFILE_SCROLL_IDLE_ROUNDS};
const PROFILE_SCROLL_WAIT_MS = ${PROFILE_SCROLL_WAIT_MS};
const PROFILE_SCROLL_INITIAL_WAIT_MS = ${PROFILE_SCROLL_INITIAL_WAIT_MS};
const PROFILE_SCROLL_MAX_CARDS = ${PROFILE_SCROLL_MAX_CARDS};
const RISK_BASE_ACTION_DELAY_MS = 1000;
const RISK_MAX_RETRIES = 3;
const RISK_COOLDOWN_STEPS_MS = [5000, 10000, 20000, 30000];
const CHROME_MAJOR_VERSION = "145";
const FINGERPRINT_FILE_NAME = "xhs-browser-fingerprint.json";
const MACOS_CHROME_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/" +
  CHROME_MAJOR_VERSION +
  ".0.0.0 Safari/537.36";
const SEC_CH_UA =
  '"Not:A-Brand";v="99", "Google Chrome";v="' +
  CHROME_MAJOR_VERSION +
  '", "Chromium";v="' +
  CHROME_MAJOR_VERSION +
  '"';

const decodePayload = () => {
  const encoded = process.argv[process.argv.length - 1] || "";
  return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const pickOne = (items) => items[Math.floor(Math.random() * items.length)];

const buildSecChUa = (chromeMajorVersion) =>
  '"Not:A-Brand";v="99", "Google Chrome";v="' +
  chromeMajorVersion +
  '", "Chromium";v="' +
  chromeMajorVersion +
  '"';

const buildUserAgent = (chromeMajorVersion) =>
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/" +
  chromeMajorVersion +
  ".0.0.0 Safari/537.36";

const normalizeFingerprint = (value) => {
  const raw = value && typeof value === "object" ? value : {};
  const screen = raw.screen && typeof raw.screen === "object" ? raw.screen : {};
  const gpu = raw.gpu && typeof raw.gpu === "object" ? raw.gpu : {};
  const chromeMajorVersion = String(raw.chromeMajorVersion || CHROME_MAJOR_VERSION);
  return {
    version: 1,
    chromeMajorVersion,
    userAgent: String(raw.userAgent || buildUserAgent(chromeMajorVersion)),
    secChUa: String(raw.secChUa || buildSecChUa(chromeMajorVersion)),
    platform: "MacIntel",
    languages: Array.isArray(raw.languages) && raw.languages.length
      ? raw.languages.map(String)
      : ["zh-CN", "zh", "en-US", "en"],
    hardwareConcurrency: Number(raw.hardwareConcurrency) || 8,
    deviceMemory: Number(raw.deviceMemory) || 8,
    devicePixelRatio: Number(raw.devicePixelRatio) || 2,
    screen: {
      width: Number(screen.width) || 1440,
      height: Number(screen.height) || 900,
      availWidth: Number(screen.availWidth) || Number(screen.width) || 1440,
      availHeight: Number(screen.availHeight) || Math.max((Number(screen.height) || 900) - 25, 1),
      colorDepth: Number(screen.colorDepth) || 30,
      pixelDepth: Number(screen.pixelDepth) || Number(screen.colorDepth) || 30,
    },
    gpu: {
      vendor: String(gpu.vendor || "Intel Inc."),
      renderer: String(gpu.renderer || "Intel Iris OpenGL Engine"),
    },
    createdAt: String(raw.createdAt || new Date().toISOString()),
  };
};

const createFingerprint = () => {
  const screen = pickOne([
    { width: 1440, height: 900, availWidth: 1440, availHeight: 875, colorDepth: 30, pixelDepth: 30 },
    { width: 1512, height: 982, availWidth: 1512, availHeight: 956, colorDepth: 30, pixelDepth: 30 },
    { width: 1728, height: 1117, availWidth: 1728, availHeight: 1092, colorDepth: 30, pixelDepth: 30 },
    { width: 1920, height: 1080, availWidth: 1920, availHeight: 1055, colorDepth: 24, pixelDepth: 24 },
  ]);
  const gpu = pickOne([
    { vendor: "Intel Inc.", renderer: "Intel Iris OpenGL Engine" },
    { vendor: "Apple Inc.", renderer: "Apple M1" },
    { vendor: "Apple Inc.", renderer: "Apple M2" },
    { vendor: "Apple Inc.", renderer: "Apple M3" },
  ]);
  return normalizeFingerprint({
    screen,
    gpu,
    hardwareConcurrency: pickOne([8, 10, 12]),
    deviceMemory: pickOne([8, 16]),
    devicePixelRatio: 2,
  });
};

const getFingerprintPath = (userDataDir) =>
  path.join(path.dirname(String(userDataDir || "")), FINGERPRINT_FILE_NAME);

const readJsonFile = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
};

const writeJsonFileAtomic = (filePath, data) => {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath =
    filePath +
    ".tmp-" +
    process.pid +
    "-" +
    Date.now() +
    "-" +
    Math.random().toString(16).slice(2);
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tempPath, filePath);
};

const withRuntimeFileLock = async (targetPath, callback) => {
  const lockDir = targetPath + ".lock";
  const startedAt = Date.now();
  while (true) {
    try {
      fs.mkdirSync(lockDir);
      break;
    } catch (error) {
      if (Date.now() - startedAt > 10000) {
        throw error;
      }
      await sleep(80 + Math.round(Math.random() * 120));
    }
  }
  try {
    return await callback();
  } finally {
    fs.rmSync(lockDir, { recursive: true, force: true });
  }
};

const loadPersistentFingerprint = async (userDataDir) => {
  const fingerprintPath = getFingerprintPath(userDataDir);
  return withRuntimeFileLock(fingerprintPath, async () => {
    const existing = readJsonFile(fingerprintPath);
    if (existing) {
      const fingerprint = normalizeFingerprint(existing);
      pushDebug("fingerprint-load", { note: "runtime", path: fingerprintPath });
      return fingerprint;
    }
    const fingerprint = createFingerprint();
    writeJsonFileAtomic(fingerprintPath, fingerprint);
    pushDebug("fingerprint-create", { note: "runtime", path: fingerprintPath });
    return fingerprint;
  });
};

const antiRiskState = {
  actionDelayMs: RISK_BASE_ACTION_DELAY_MS,
  baseActionDelayMs: RISK_BASE_ACTION_DELAY_MS,
  lastActionAt: 0,
  verifyCount: 0,
  actionCount: 0,
};

const randomBetween = (min, max) => min + Math.random() * (max - min);

const gaussianRandom = (mean = 0, stdDev = 1) => {
  const u1 = Math.max(Number.EPSILON, Math.random());
  const u2 = Math.max(Number.EPSILON, Math.random());
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return z0 * stdDev + mean;
};

const getHumanJitterMs = () => {
  let jitter = Math.max(0, gaussianRandom(300, 150));
  if (Math.random() < 0.05) {
    jitter += randomBetween(2000, 5000);
  }
  return Math.round(jitter);
};

const humanDelay = async (reason = "action", minimumMs = antiRiskState.actionDelayMs) => {
  const elapsed = Date.now() - antiRiskState.lastActionAt;
  const baseWait = Math.max(0, minimumMs - elapsed);
  const waitMs = Math.round(baseWait + getHumanJitterMs());
  if (waitMs > 0) {
    pushDebug("anti-risk-delay", { note: reason, waitMs });
    await sleep(waitMs);
  }
};

const markHumanAction = () => {
  antiRiskState.lastActionAt = Date.now();
  antiRiskState.actionCount += 1;
};

const isRetryableBrowserError = (error) => {
  const message = toErrorMessage(error);
  return (
    isTransientPageError(error) ||
    message.includes("Timeout") ||
    message.includes("net::") ||
    message.includes("Navigation failed") ||
    message.includes("Target closed") ||
    /^HTTP (429|500|502|503|504)\b/.test(message)
  );
};

const backoffDelay = async (attempt, reason) => {
  const waitMs = Math.round(1000 * 2 ** (attempt - 1) + randomBetween(0, 1000));
  pushDebug("anti-risk-retry", { note: reason, attempt, waitMs });
  await sleep(waitMs);
};

const coolDownForRisk = async (reason = "risk-detected") => {
  antiRiskState.verifyCount += 1;
  antiRiskState.actionDelayMs = Math.max(
    antiRiskState.actionDelayMs,
    antiRiskState.baseActionDelayMs * 2,
  );
  const index = Math.min(antiRiskState.verifyCount - 1, RISK_COOLDOWN_STEPS_MS.length - 1);
  const waitMs = RISK_COOLDOWN_STEPS_MS[index];
  pushDebug("anti-risk-cooldown", {
    note: reason,
    verifyCount: antiRiskState.verifyCount,
    waitMs,
    actionDelayMs: antiRiskState.actionDelayMs,
  });
  await sleep(waitMs);
};

const resetRiskCooldown = () => {
  antiRiskState.verifyCount = 0;
};

const navigateWithRetry = async (page, url, options, label = "navigate") => {
  let lastError = null;
  for (let attempt = 1; attempt <= RISK_MAX_RETRIES; attempt += 1) {
    try {
      await humanDelay(label);
      const response = await page.goto(url, options);
      markHumanAction();
      if (response && [429, 500, 502, 503, 504].includes(response.status())) {
        throw new Error("HTTP " + response.status() + " during " + label);
      }
      resetRiskCooldown();
      return response;
    } catch (error) {
      lastError = error;
      if (!isRetryableBrowserError(error) || attempt >= RISK_MAX_RETRIES) {
        throw error;
      }
      await backoffDelay(attempt, label);
    }
  }
  throw lastError || new Error(label + " failed");
};

const debugEvents = [];
const pushDebug = (stage, extra = {}) => {
  const event = {
    ts: new Date().toISOString(),
    stage,
    ...extra,
  };
  debugEvents.push(event);
  if (debugEvents.length > 60) {
    debugEvents.splice(0, debugEvents.length - 60);
  }
  console.log(DEBUG_PREFIX + JSON.stringify(event));
};

const getDebugSummary = () =>
  debugEvents
    .slice(-8)
    .map((item) => {
      const note = item.note ? ":" + item.note : "";
      const urlPath = item.path ? " path=" + item.path : "";
      const url = item.url ? " url=" + item.url : "";
      const login = typeof item.loginRequired === "boolean" ? " loginRequired=" + item.loginRequired : "";
      const cookies = item.authCookies ? " authCookies=" + item.authCookies : "";
      const counts = [
        typeof item.slideCount === "number" ? "slides=" + item.slideCount : "",
        typeof item.imageCount === "number" ? "images=" + item.imageCount : "",
        typeof item.rawCount === "number" ? "raw=" + item.rawCount : "",
        typeof item.keptCount === "number" ? "kept=" + item.keptCount : "",
        typeof item.added === "number" ? "added=" + item.added : "",
      ].filter(Boolean).join(" ");
      return String(item.ts || "") + " " + String(item.stage || "") + note + urlPath + url + login + cookies + (counts ? " " + counts : "");
    })
    .join(" | ");

const shouldKeepImage = (url) => {
  const value = String(url || "");
  if (!/^https?:\/\//i.test(value)) return false;
  if (!/(xhscdn|xiaohongshu|sns-webpic|sns-img)/i.test(value)) return false;
  if (/(avatar|favicon|logo|qrcode|sprite|icon)/i.test(value)) return false;
  return true;
};

const unique = (items) => {
  const result = [];
  const seen = new Set();
  for (const item of items) {
    const value = String(item || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
};

const toErrorMessage = (error) => {
  if (error instanceof Error) return error.message;
  return String(error || "Unknown error");
};

const isTransientPageError = (error) => {
  const message = toErrorMessage(error);
  return (
    message.includes("Execution context was destroyed") ||
    message.includes("Cannot find context with specified id") ||
    message.includes("Frame was detached")
  );
};

const waitForPageReady = async (page) => {
  await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => null);
  await sleep(250);
};

const evaluateWithRetry = async (page, callback, label = "page-evaluate") => {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await page.evaluate(callback);
    } catch (error) {
      lastError = error;
      if (!isTransientPageError(error) || page.isClosed() || attempt >= 3) {
        throw error;
      }
      pushDebug("page-evaluate-retry", {
        note: label,
        attempt,
        error: toErrorMessage(error),
      });
      await waitForPageReady(page);
    }
  }
  throw lastError || new Error("Page evaluate failed");
};

const evaluateWithArgRetry = async (page, callback, arg, label = "page-evaluate-arg") => {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await page.evaluate(callback, arg);
    } catch (error) {
      lastError = error;
      if (!isTransientPageError(error) || page.isClosed() || attempt >= 3) {
        throw error;
      }
      pushDebug("page-evaluate-retry", {
        note: label,
        attempt,
        error: toErrorMessage(error),
      });
      await waitForPageReady(page);
    }
  }
  throw lastError || new Error("Page evaluate with arg failed");
};

const getPagePath = async (page) =>
  evaluateWithRetry(page, () => location.pathname, "location-path").catch(() => "(unknown)");

const getFallbackBrowserPaths = () => {
  if (process.platform === "win32") {
    const localAppData = String(process.env.LOCALAPPDATA || "");
    const programFiles = String(process.env.PROGRAMFILES || "");
    const programFilesX86 = String(process.env["PROGRAMFILES(X86)"] || "");
    return unique([
      path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe"),
    ]).filter(Boolean);
  }

  if (process.platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ];
  }

  return [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
    "/usr/bin/microsoft-edge",
    "/usr/bin/microsoft-edge-stable",
  ];
};

const launchContextWithFallback = async (userDataDir, contextOptions) => {
  const attempts = [];
  try {
    pushDebug("browser-launch", { note: "bundled-playwright" });
    return await chromium.launchPersistentContext(userDataDir, contextOptions);
  } catch (error) {
    attempts.push("bundled=" + toErrorMessage(error));
    pushDebug("browser-launch-failed", {
      note: "bundled-playwright",
      error: toErrorMessage(error),
    });
  }

  for (const executablePath of getFallbackBrowserPaths()) {
    if (!fs.existsSync(executablePath)) continue;
    try {
      pushDebug("browser-launch", { note: executablePath });
      return await chromium.launchPersistentContext(userDataDir, {
        ...contextOptions,
        executablePath,
      });
    } catch (error) {
      attempts.push(executablePath + "=" + toErrorMessage(error));
      pushDebug("browser-launch-failed", {
        note: executablePath,
        error: toErrorMessage(error),
      });
    }
  }

  throw new Error("Browser launch failed: " + attempts.join(" | "));
};

const cleanText = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim();

const getNoteIdFromUrl = (url) => {
  try {
    const parsed = new URL(url);
    // /user/profile/{userId}/{noteId}  OR  /explore/{noteId}
    const m =
      parsed.pathname.match(/\/user\/profile\/[^/]+\/([^/?#]+)/) ||
      parsed.pathname.match(/\/(?:explore|discovery\/item)\/([^/?#]+)/);
    return m ? m[1] : "";
  } catch {
    return "";
  }
};

const collectVisibleProfileCards = () => {
  const getText = (node) =>
    String(node && node.innerText ? node.innerText : "")
      .replace(/\s+/g, " ")
      .trim();
  const getLines = (node) =>
    String(
      node && (node.innerText || node.textContent) ? node.innerText || node.textContent : "",
    )
      .split(/\r?\n+/)
      .map((item) => String(item || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
  const isPracticeTitle = (value) => /^day\s*\d+\b/i.test(String(value || "").trim());
  const keepCoverImage = (image) => {
    const src = image.currentSrc || image.src || "";
    const rect = image.getBoundingClientRect();
    if (!src || /avatar|favicon|logo|qrcode|sprite|icon/i.test(src)) return false;
    return rect.width >= 80 && rect.height >= 80;
  };

  const findPracticeTitle = (node) => {
    const lines = getLines(node);
    const match = lines.find((line) => isPracticeTitle(line));
    if (match) return match;
    const text = getText(node);
    return isPracticeTitle(text) ? text : "";
  };

  const findCardRoot = (anchor) => {
    let node = anchor.parentElement || anchor;
    for (let depth = 0; depth < 10 && node && node.parentElement; depth += 1) {
      if (Array.from(node.querySelectorAll("img")).some(keepCoverImage) && findPracticeTitle(node)) {
        return node;
      }
      node = node.parentElement;
    }
    return anchor.parentElement || anchor;
  };

  const findCardImage = (cardRoot) => {
    const images = Array.from(cardRoot.querySelectorAll("img")).filter(keepCoverImage);
    if (images.length === 0) return null;
    return images.sort((a, b) => {
      const rectA = a.getBoundingClientRect();
      const rectB = b.getBoundingClientRect();
      return rectB.width * rectB.height - rectA.width * rectA.height;
    })[0];
  };

  // XHS actual DOM structure:
  //   <a href="/user/profile/{userId}/{noteId}?xsec_token=...">  ← has token, is the real link
  //   <a href="/explore/{noteId}" style="display:none">          ← hidden, no token
  // Select profile-style links that contain a noteId segment after the userId.
  // Also keep /explore/ links as fallback (in case structure changes).
  const candidateAnchors = Array.from(
    document.querySelectorAll(
      "a[href*='/user/profile/'], a[href*='/explore/'], a[href*='/discovery/item/']",
    ),
  );

  // noteId → best { anchor, url, hasToken }
  const noteMap = new Map();
  for (const anchor of candidateAnchors) {
    const href = String(anchor.href || "");
    if (!href) continue;
    let noteId = "";
    try {
      const parsed = new URL(href);
      const m =
        parsed.pathname.match(/\/user\/profile\/[^/]+\/([^/?#]+)/) ||
        parsed.pathname.match(/\/(?:explore|discovery\/item)\/([^/?#]+)/);
      noteId = m ? m[1] : "";
    } catch {
      continue;
    }
    if (!noteId) continue;
    const hasToken = /[?&]xsec_token=/i.test(href);
    const existing = noteMap.get(noteId);
    if (!existing || (!existing.hasToken && hasToken)) {
      noteMap.set(noteId, { anchor, url: href, hasToken });
    }
  }

  const results = [];
  let index = 0;
  for (const { anchor, url } of noteMap.values()) {
    const cardRoot = findCardRoot(anchor);
    const title = findPracticeTitle(cardRoot);
    if (!title) continue;
    const image = findCardImage(cardRoot);
    const desc = getText(cardRoot);
    results.push({
      noteId: title,
      url,
      title,
      desc,
      coverUrl: image ? image.currentSrc || image.src || "" : "",
      index,
    });
    index += 1;
  }
  return results;
};

const appendVisibleProfileCards = async (page) =>
  evaluateWithArgRetry(page, (collectorSource) => {
    const collect = new Function("return (" + collectorSource + ")")();
    const normalizeKey = (value) =>
      String(value || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    const hasToken = (url) => /[?&]xsec_token=/i.test(String(url || ""));
    window.__followPracticeCards = Array.isArray(window.__followPracticeCards)
      ? window.__followPracticeCards
      : [];
    // Build index by noteId key for O(1) lookup and in-place URL upgrades
    const indexMap = new Map(
      window.__followPracticeCards.map((card, i) => [normalizeKey(card.noteId), i]),
    );
    for (const card of collect()) {
      const key = normalizeKey(card.noteId);
      if (!key) continue;
      if (indexMap.has(key)) {
        // Already collected – upgrade URL if the new one has a token and the old one doesn't
        const existingIdx = indexMap.get(key);
        const existing = window.__followPracticeCards[existingIdx];
        if (!hasToken(existing.url) && hasToken(card.url)) {
          window.__followPracticeCards[existingIdx] = { ...existing, url: card.url };
        }
      } else {
        indexMap.set(key, window.__followPracticeCards.length);
        window.__followPracticeCards.push(card);
      }
    }
    return window.__followPracticeCards.length;
  }, collectVisibleProfileCards.toString(), "append-visible-profile-cards");

const scrollToBottom = async (page, payload) => {
  let stableCount = 0;
  let lastHeight = 0;
  let lastCount = 0;
  let lastScrollY = -1;

  await evaluateWithRetry(page, () => {
    window.__followPracticeCards = [];
    const root = document.scrollingElement || document.documentElement || document.body;
    if (root && typeof root.scrollTo === "function") {
      root.scrollTo(0, 0);
    }
    window.scrollTo(0, 0);
  }, "scroll-to-top-reset");
  await humanDelay("profile-scroll-start", PROFILE_SCROLL_INITIAL_WAIT_MS);

  // snapshot DOM anchor stats before starting scroll
  const anchorStats = await evaluateWithRetry(page, () => {
    const allAnchors = Array.from(document.querySelectorAll("a[href]"));
    const exploreLike = allAnchors.filter((a) => {
      const h = String(a.href || "");
      return /\/(?:explore|discovery\/item)\//.test(h) || /\/user\/profile\/[^/]+\/[^/?#]+/.test(h);
    });
    const profileLike = allAnchors.filter((a) => /\/user\/profile\//.test(String(a.href || "")));
    const sampleHrefs = allAnchors.slice(0, 8).map((a) => String(a.href || "").slice(0, 100));
    const exploreHrefs = exploreLike.slice(0, 4).map((a) => String(a.href || "").slice(0, 120));
    return {
      totalAnchors: allAnchors.length,
      exploreLike: exploreLike.length,
      profileLike: profileLike.length,
      sampleHrefs,
      exploreHrefs,
      pathname: location.pathname,
      scrollHeight: document.documentElement.scrollHeight,
    };
  }, "anchor-stats-snapshot");
  pushDebug("anchor-stats", {
    note: "before-scroll",
    totalAnchors: anchorStats.totalAnchors,
    exploreLike: anchorStats.exploreLike,
    profileLike: anchorStats.profileLike,
    sampleHrefs: anchorStats.sampleHrefs,
    exploreHrefs: anchorStats.exploreHrefs,
    pathname: anchorStats.pathname,
    scrollHeight: anchorStats.scrollHeight,
  });

  for (let i = 0; i < PROFILE_SCROLL_MAX_STEPS; i += 1) {
    const collectedCount = await appendVisibleProfileCards(page);
    const metrics = await evaluateWithRetry(page, () => {
      const root = document.scrollingElement || document.documentElement || document.body;
      const step = Math.max(window.innerHeight * 0.85, 700);
      const scrollTop = root ? root.scrollTop : window.scrollY;
      const target = scrollTop + step;
      if (root && typeof root.scrollTo === "function") {
        root.scrollTo(0, target);
      }
      window.scrollTo(0, target);
      return {
        height: Math.max(
          root ? root.scrollHeight : 0,
          document.body ? document.body.scrollHeight : 0,
          document.documentElement ? document.documentElement.scrollHeight : 0,
        ),
        scrollY: root ? root.scrollTop : window.scrollY,
      };
    }, "scroll-to-bottom-step");
    markHumanAction();

    pushDebug("scroll-step", {
      step: i,
      collectedCount,
      height: metrics.height,
      scrollY: metrics.scrollY,
      stableCount,
    });

    if (
      metrics.height === lastHeight &&
      metrics.scrollY === lastScrollY &&
      collectedCount === lastCount
    ) {
      stableCount += 1;
    } else {
      stableCount = 0;
    }

    lastHeight = metrics.height;
    lastCount = collectedCount;
    lastScrollY = metrics.scrollY;
    
    // 达到最大卡片数量限制，停止滚动
    const maxCards = payload.maxCards || PROFILE_SCROLL_MAX_CARDS;
    if (collectedCount >= maxCards) {
      pushDebug("scroll-stop", { note: "max-cards-reached", collectedCount, maxCards });
      break;
    }
    
    if (stableCount >= PROFILE_SCROLL_IDLE_ROUNDS) break;
    await humanDelay("profile-scroll-step", PROFILE_SCROLL_WAIT_MS);
  }
  await appendVisibleProfileCards(page);
};

const isLoginRequired = async (page) =>
  page.evaluate(() => {
    const path = String(location.pathname || "");
    const text = String(document.body.innerText || "").replace(/\s+/g, " ");
    // Detect QR-code login modal or login page overlay (XHS shows modal on profile page)
    const hasQrModal =
      // path-based detection
      path.startsWith("/login") ||
      path.startsWith("/website-login") ||
      // Text patterns that appear in the XHS login modal/page
      text.includes("扫码登录") ||
      text.includes("手机号登录") ||
      text.includes("登录即可查看") ||
      text.includes("登录 / 注册") ||
      text.includes("登录/注册") ||
      text.includes("登录后查看") ||
      text.includes("Please log in") ||
      // DOM element: canvas inside a dialog/modal usually means QR code
      (() => {
        const dialogs = Array.from(
          document.querySelectorAll(
            '[class*="login"], [class*="Login"], [class*="modal"], [class*="Modal"], [role="dialog"]',
          ),
        );
        return dialogs.some(
          (el) => el.querySelector("canvas") || (el.textContent || "").includes("扫码"),
        );
      })();
    return hasQrModal;
  });

const detectLoginRequired = async (page) => {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await isLoginRequired(page);
    } catch (error) {
      lastError = error;
      if (!isTransientPageError(error) || page.isClosed() || attempt >= 3) {
        throw error;
      }
      pushDebug("page-evaluate-retry", {
        note: "is-login-required",
        attempt,
        error: toErrorMessage(error),
      });
      await waitForPageReady(page);
    }
  }
  throw lastError || new Error("Failed to detect login state");
};

const getAccessIssue = async (page) =>
  evaluateWithRetry(
    page,
    () => {
      const path = String(location.pathname || "");
      const params = new URLSearchParams(location.search || "");
      const bodyText = String(document.body.innerText || "").replace(/\s+/g, " ").trim();
      if (path.startsWith("/website-login/error")) {
        return {
          kind: "risk",
          message:
            params.get("error_msg") ||
            params.get("verifyMsg") ||
            bodyText ||
            "Access blocked",
        };
      }
      if (path.startsWith("/login") || path.startsWith("/website-login")) {
        return {
          kind: "login",
          message: "Please login first",
        };
      }
      return null;
    },
    "get-access-issue",
  );

const hasAuthCookie = (cookies) => {
  const nowSec = Date.now() / 1000;
  return cookies.some((cookie) => {
    if (!["web_session", "id_token"].includes(cookie.name)) return false;
    if (String(cookie.value || "").length <= 16) return false;
    // expires === -1 是 session cookie，不限时；否则必须未过期
    if (typeof cookie.expires === "number" && cookie.expires > 0 && cookie.expires < nowSec) return false;
    return true;
  });
};

const waitForLoginComplete = async (context, page, profileUrl, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  let loop = 0;
  // Track whether we have ever observed the login/QR modal.
  // We must see it appear (seenLoginRequired=true) before we accept
  // its disappearance as proof of successful login.  This prevents
  // a stale session-cookie (expires=-1) from immediately satisfying
  // the hasAuthCookie check before the QR code has even had time to render.
  let seenLoginRequired = false;

  // Give the page extra time to fully render before the first check,
  // so the QR modal (if any) has a chance to appear.
  while (Date.now() < deadline) {
    loop += 1;

    // Wait for the page to be in a stable state before evaluating.
    await waitForPageReady(page).catch(() => null);

    const cookies = await context.cookies(profileUrl).catch(() => []);
    const authCookies = cookies
      .filter((cookie) => ["web_session", "id_token"].includes(cookie.name))
      .map((cookie) => String(cookie.name) + ":" + String(String(cookie.value || "").length))
      .join(",");

    const loginRequired = await detectLoginRequired(page).catch(() => true);
    const path = await getPagePath(page);

    if (loginRequired) seenLoginRequired = true;

    pushDebug("login-poll", {
      loop,
      path,
      loginRequired,
      seenLoginRequired,
      authCookies,
      pageClosed: page.isClosed(),
    });

    if (page.isClosed()) {
      pushDebug("login-abort", { note: "page-closed" });
      return false;
    }

    // Only accept "logged in" when:
    // 1. A valid auth cookie exists, AND
    // 2. The login/QR modal is no longer visible, AND
    // 3. We actually observed the modal at some point (seenLoginRequired),
    //    OR we have waited long enough (loop >= 6, ~10 s) that we're confident
    //    the page had enough time to show the modal if one was needed.
    if (hasAuthCookie(cookies) && !loginRequired && (seenLoginRequired || loop >= LOGIN_POLL_MIN_LOOPS_BEFORE_ACCEPT)) {
      pushDebug("login-complete", { note: "auth-cookie-and-page-ok", authCookies, path, loop });
      return true;
    }

    await sleep(1500);
  }
  pushDebug("login-timeout", { note: "deadline-reached" });
  return false;
};

const waitForInteractiveLogin = async (context, page, profileUrl, mode, returnUrl = profileUrl) => {
  const path = await getPagePath(page);
  pushDebug("login-gate", { note: "waiting-for-user", path, mode: String(mode || "") });
  await evaluateWithRetry(page, () => window.scrollTo(0, 0), "login-gate-scroll-top").catch(
    () => null,
  );
  const resolved = await waitForLoginComplete(context, page, profileUrl, LOGIN_WAIT_TIMEOUT_MS);
  if (!resolved) {
    throw new Error("Login timeout - please complete verification in the browser window");
  }
  await navigateWithRetry(page, returnUrl, { waitUntil: "domcontentloaded", timeout: 45000 }, "login-return").catch(() => null);
  await humanDelay("login-return-settle", 2000);
};

const applyStealth = async (context, fingerprint) => {
  await context.addInitScript((identity) => {
    const defineGetter = (obj, key, value) => {
      try {
        Object.defineProperty(obj, key, {
          get: () => value,
          configurable: true,
        });
      } catch {}
    };

    defineGetter(Navigator.prototype, "webdriver", undefined);
    defineGetter(Navigator.prototype, "languages", identity.languages);
    defineGetter(Navigator.prototype, "platform", identity.platform);
    defineGetter(Navigator.prototype, "hardwareConcurrency", identity.hardwareConcurrency);
    defineGetter(Navigator.prototype, "deviceMemory", identity.deviceMemory);
    defineGetter(Navigator.prototype, "plugins", [
      { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer" },
      { name: "Chrome PDF Viewer", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai" },
      { name: "Native Client", filename: "internal-nacl-plugin" },
    ]);
    defineGetter(window, "devicePixelRatio", identity.devicePixelRatio);

    try {
      defineGetter(Screen.prototype, "width", identity.screen.width);
      defineGetter(Screen.prototype, "height", identity.screen.height);
      defineGetter(Screen.prototype, "availWidth", identity.screen.availWidth);
      defineGetter(Screen.prototype, "availHeight", identity.screen.availHeight);
      defineGetter(Screen.prototype, "colorDepth", identity.screen.colorDepth);
      defineGetter(Screen.prototype, "pixelDepth", identity.screen.pixelDepth);
    } catch {}

    try {
      if (!window.chrome) {
        Object.defineProperty(window, "chrome", {
          value: { runtime: {} },
          configurable: true,
        });
      }
    } catch {}

    try {
      const permissions = navigator.permissions;
      const originalQuery = permissions && permissions.query ? permissions.query.bind(permissions) : null;
      if (originalQuery) {
        permissions.query = (params) => {
          if (params && params.name === "notifications") {
            return Promise.resolve({ state: Notification.permission });
          }
          return originalQuery(params);
        };
      }
    } catch {}

    try {
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function (param) {
        if (param === 37445) return identity.gpu.vendor;
        if (param === 37446) return identity.gpu.renderer;
        return getParameter.call(this, param);
      };
    } catch {}

    try {
      const getParameter2 = WebGL2RenderingContext.prototype.getParameter;
      WebGL2RenderingContext.prototype.getParameter = function (param) {
        if (param === 37445) return identity.gpu.vendor;
        if (param === 37446) return identity.gpu.renderer;
        return getParameter2.call(this, param);
      };
    } catch {}

    try {
      defineGetter(window, "__playwright__binding__", undefined);
      defineGetter(window, "__pwInitScripts", undefined);
    } catch {}
  }, fingerprint);
};

const collectProfileCards = async (page) =>
  evaluateWithArgRetry(page, (collectorSource) => {
    const collect = new Function("return (" + collectorSource + ")")();
    const normalizeKey = (value) =>
      String(value || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    const sourceRows = [
      ...(Array.isArray(window.__followPracticeCards) ? window.__followPracticeCards : []),
      ...collect(),
    ];
    const rows = [];
    const seen = new Set();
    for (const row of sourceRows) {
      const noteId = String(row.noteId || "").trim();
      const title = String(row.title || noteId || "").trim();
      const dedupeKey = normalizeKey(noteId || title);
      if (!title || !dedupeKey || seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      rows.push({
        noteId: noteId || title,
        url: String(row.url || ""),
        title,
        desc: String(row.desc || ""),
        coverUrl: String(row.coverUrl || ""),
        index: Number(row.index || rows.length),
      });
    }
    return rows;
  }, collectVisibleProfileCards.toString(), "collect-profile-cards");

const collectDetailImages = async (page) => {
  const urls = [];
  const seenUrl = new Set();
  const seenSlideIndexes = new Set();
  let stableRounds = 0;
  const initialStats = await evaluateWithRetry(page, () => {
    const normalizeUrl = (value) =>
      String(value || "")
        .replace(/\\u002F/g, "/")
        .replace(/\\\//g, "/")
        .trim();
    const images = Array.from(document.querySelectorAll("img"));
    const sources = Array.from(document.querySelectorAll("source[srcset]"));
    const backgroundNodes = Array.from(document.querySelectorAll("[style*='background']"));
    const imageSamples = images
      .map((image) =>
        normalizeUrl(
          image.currentSrc ||
            image.src ||
            image.getAttribute("src") ||
            image.getAttribute("data-src") ||
            image.getAttribute("data-original") ||
            image.getAttribute("data-lazy-src") ||
            image.getAttribute("srcset"),
        ),
      )
      .filter(Boolean)
      .slice(0, 5);
    const sourceSamples = sources
      .map((source) => normalizeUrl(source.getAttribute("srcset")))
      .filter(Boolean)
      .slice(0, 3);
    const backgroundSamples = backgroundNodes
      .map((node) => String(node.getAttribute("style") || "").match(/url\((['"]?)(.*?)\1\)/)?.[2] || "")
      .map(normalizeUrl)
      .filter(Boolean)
      .slice(0, 3);
    return {
      url: location.href,
      path: location.pathname,
      title: String(document.title || "").slice(0, 80),
      slideCount: document.querySelectorAll("[data-swiper-slide-index]").length,
      imageCount: images.length,
      sourceCount: sources.length,
      backgroundCount: backgroundNodes.length,
      imageSamples,
      sourceSamples,
      backgroundSamples,
    };
  }, "detail-image-initial-stats");
  pushDebug("detail-image-dom", initialStats);

  for (let i = 0; i < DEFAULT_IMAGE_SCAN_STEP; i += 1) {
    const batch = await evaluateWithRetry(page, () => {
      const slides = Array.from(document.querySelectorAll("[data-swiper-slide-index]"));
      const rows = [];
      for (const slide of slides) {
        const slideIndex = String(slide.getAttribute("data-swiper-slide-index") || "").trim();
        if (!slideIndex) continue;
        const images = Array.from(slide.querySelectorAll("img"));
        const urls = images
          .map((image) =>
            image.currentSrc ||
            image.src ||
            image.getAttribute("src") ||
            image.getAttribute("data-src") ||
            image.getAttribute("data-original") ||
            image.getAttribute("data-lazy-src") ||
            image.getAttribute("srcset") ||
            "",
          )
          .filter(Boolean);
        if (urls.length > 0) {
          rows.push({ slideIndex, urls });
        }
      }
      return rows;
    }, "collect-detail-images");

    let added = 0;
    for (const row of batch) {
      const slideIndex = String(row?.slideIndex || "").trim();
      if (!slideIndex || seenSlideIndexes.has(slideIndex)) continue;
      seenSlideIndexes.add(slideIndex);
      const rowUrls = Array.isArray(row?.urls) ? row.urls : [];
      for (const rawUrl of rowUrls) {
        const value = String(rawUrl || "").replace(/\\u002F/g, "/").replace(/\\\//g, "/").trim();
        if (!value || seenUrl.has(value)) continue;
        seenUrl.add(value);
        urls.push(value);
        added += 1;
      }
    }

    if (added === 0) {
      stableRounds += 1;
    } else {
      stableRounds = 0;
    }
    pushDebug("detail-image-scan", {
      step: i,
      batchCount: batch.length,
      added,
      rawCount: urls.length,
      stableRounds,
    });
    if (stableRounds >= DETAIL_IMAGE_STABLE_ROUNDS && urls.length > 0) {
      break;
    }

    await page.keyboard.press("ArrowRight").catch(() => null);
    await sleep(80);
  }
  const uniqueUrls = unique(urls);
  const keptUrls = uniqueUrls.filter(shouldKeepImage);
  pushDebug("detail-image-result", {
    url: page.url(),
    rawCount: uniqueUrls.length,
    keptCount: keptUrls.length,
    rejectedCount: uniqueUrls.length - keptUrls.length,
    rawSamples: uniqueUrls.slice(0, 5),
    keptSamples: keptUrls.slice(0, 5),
  });
  return keptUrls;
};

const findAndClickProfileCard = async (page, title) => {
  const targetTitle = cleanText(title);
  await evaluateWithRetry(page, () => window.scrollTo(0, 0), "find-card-scroll-top").catch(
    () => null,
  );
  await sleep(200);

  let stableCount = 0;
  let lastHeight = 0;
  let lastScrollY = -1;

  for (let i = 0; i < CARD_FIND_MAX_STEPS; i += 1) {
    const clicked = await page
      .evaluate((target) => {
        const normalize = (value) =>
          String(value || "")
            .replace(/\s+/g, " ")
            .trim();
        const anchors = Array.from(document.querySelectorAll("a"));
        const anchor = anchors.find((node) => normalize(node.innerText || node.textContent) === target);
        if (!anchor) return false;

        anchor.scrollIntoView({ block: "center", inline: "center" });
        anchor.click();
        return true;
      }, targetTitle)
      .catch(() => false);
    if (clicked) return true;

    const metrics = await evaluateWithRetry(page, () => {
      const step = Math.max(window.innerHeight * 0.85, 700);
      window.scrollBy(0, step);
      return {
        height: document.body.scrollHeight,
        scrollY: window.scrollY,
      };
    }, "find-card-scroll-step");

    if (metrics.height === lastHeight && metrics.scrollY === lastScrollY) {
      stableCount += 1;
    } else {
      stableCount = 0;
    }
    lastHeight = metrics.height;
    lastScrollY = metrics.scrollY;
    if (stableCount >= 4) break;
    await sleep(CARD_FIND_SLEEP_MS);
  }

  return false;
};

const collectNoteDetail = async (
  context,
  page,
  card,
  profileUrl,
  allowRelogin = true,
  loginHandler = null,
) => {
  try {
    await page.bringToFront().catch(() => null);
    const directUrl = String(card.url || "").trim();
    // XHS requires xsec_token to open a note URL directly on PC;
    // without the token the page redirects to homepage.
    // Only use goto when the URL contains the token, otherwise fall back to click.
    const hasToken = /[?&]xsec_token=/i.test(directUrl);
    if (/^https?:\/\//i.test(directUrl) && hasToken) {
      await navigateWithRetry(page, directUrl, { waitUntil: "domcontentloaded", timeout: 15000 }, "detail-direct");
      await humanDelay("detail-direct-settle", 300);
    } else {
      if (!page.url().includes(profileUrl.replace(/^https?:\/\/[^/]+/, ""))) {
        await navigateWithRetry(page, profileUrl, { waitUntil: "domcontentloaded", timeout: 30000 }, "detail-profile-return");
      }
      await humanDelay("detail-card-before-click", 500);
      const clicked = await findAndClickProfileCard(page, card.title);
      if (!clicked) {
        throw new Error("Note card not found: " + card.title);
      }
      markHumanAction();
      await humanDelay("detail-card-open-settle", 400);
    }
    pushDebug("detail-opened", {
      note: String(card.noteId || card.title || ""),
      url: page.url(),
      path: await getPagePath(page),
      hasToken,
    });
    const accessIssue = await getAccessIssue(page);
    if (accessIssue?.kind === "risk") {
      await coolDownForRisk("detail-access-risk");
      throw new Error(accessIssue.message || "Access blocked");
    }
    if (await detectLoginRequired(page)) {
      const path = await getPagePath(page);
      pushDebug("login-required", { note: "detail-page", path, mode: "detail" });
      if (!allowRelogin) {
        throw new Error("Please login first");
      }
      const returnUrl = /^https?:\/\//i.test(directUrl) ? directUrl : profileUrl;
      const loginSession = loginHandler
        ? await loginHandler(returnUrl, "detail")
        : await waitForInteractiveLogin(context, page, profileUrl, "detail", returnUrl).then(
            () => ({ context, page }),
          );
      return collectNoteDetail(
        loginSession.context,
        loginSession.page,
        card,
        profileUrl,
        false,
        loginHandler,
      );
    }
    await evaluateWithRetry(page, () => window.scrollTo(0, 0), "detail-scroll-top").catch(
      () => null,
    );

    const detail = await evaluateWithRetry(page, () => {
      const textOf = (selector) =>
        Array.from(document.querySelectorAll(selector))
          .map((node) => String(node.innerText || node.textContent || "").trim())
          .filter(Boolean)
          .join("\n");
      const title =
        textOf("#detail-title") ||
        textOf("[class*='title']") ||
        String(document.title || "").trim();
      const desc =
        textOf("#detail-desc") ||
        textOf("[class*='desc']") ||
        textOf("[class*='content']") ||
        String(document.body.innerText || "").trim();
      return {
        title,
        desc,
        bodyText: String(document.body.innerText || "").trim(),
      };
    }, "collect-note-detail");

    const images = await collectDetailImages(page);
    const detailUrl = page.url();
    const noteId = getNoteIdFromUrl(detailUrl) || card.noteId;
    pushDebug("detail-collected", {
      note: String(noteId || card.noteId || card.title || ""),
      url: detailUrl,
      imageCount: images.length,
      title: String(detail.title || card.title || "").slice(0, 80),
    });
    if (!/^https?:\/\//i.test(directUrl)) {
      await page.keyboard.press("Escape").catch(() => null);
      if (page.url() !== profileUrl) {
        await navigateWithRetry(page, profileUrl, { waitUntil: "domcontentloaded", timeout: 30000 }, "detail-close-return").catch(() => null);
      }
      await humanDelay("detail-close-settle", 200);
    }
    return {
      ...card,
      noteId,
      url: detailUrl,
      title: card.title,
      desc: detail.desc || card.desc || detail.bodyText,
      imageUrls: images,
    };
  } finally {}
};

const matchesKeywords = (note, keywords) => {
  if (!keywords.length) return true;
  const haystack = [note.title, note.desc].join("\n").toLowerCase();
  return keywords.some((keyword) => haystack.includes(String(keyword).toLowerCase()));
};

(async () => {
  let context;
  let payload = null;
  try {
    payload = decodePayload();
    const keywords = Array.isArray(payload.keywords) ? payload.keywords : [];
    const useHeadless = payload.mode === "login" ? false : payload.headless !== false;
    pushDebug("run-start", {
      mode: String(payload.mode || ""),
      profileUrl: String(payload.profileUrl || ""),
      userDataDir: String(payload.userDataDir || ""),
      headless: useHeadless,
    });
    const fingerprint = await loadPersistentFingerprint(payload.userDataDir);
    const buildContextOptions = (headless) => ({
      headless,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
        "--no-sandbox",
        "--lang=zh-CN,zh",
        "--window-size=" + fingerprint.screen.width + "," + fingerprint.screen.height,
      ],
      locale: "zh-CN",
      viewport: { width: fingerprint.screen.width, height: fingerprint.screen.height },
      userAgent: fingerprint.userAgent,
      extraHTTPHeaders: {
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
        dnt: "1",
        "sec-ch-ua": fingerprint.secChUa,
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
      },
    });
    let contextHeadless = useHeadless;
    let page = null;

    const openSession = async (headless, url) => {
      context = await launchContextWithFallback(payload.userDataDir, buildContextOptions(headless));
      contextHeadless = headless;
      await applyStealth(context, fingerprint);
      page = await context.newPage();
      await navigateWithRetry(page, url, { waitUntil: "domcontentloaded", timeout: 45000 }, "open-session");
      return { context, page };
    };

    const reopenHeadedForLogin = async (returnUrl) => {
      pushDebug("login-gate", {
        note: "reopen-headed-browser",
        mode: String(payload.mode || ""),
        path: await getPagePath(page).catch(() => "(unknown)"),
      });
      if (context) {
        await context.close().catch(() => null);
        context = null;
      }
      return openSession(false, returnUrl || payload.profileUrl);
    };

    const ensureInteractiveLogin = async (returnUrl = payload.profileUrl, mode = payload.mode) => {
      if (contextHeadless) {
        await reopenHeadedForLogin(returnUrl);
      }
      // At this point context/page are the headed session opened by reopenHeadedForLogin.
      // waitForInteractiveLogin uses the current context/page closure vars.
      await waitForInteractiveLogin(context, page, payload.profileUrl, mode, returnUrl);
      // Login done. If original mode was headless, reopen headless so subsequent scraping is hidden.
      // Must close the headed context first to avoid zombie processes.
      if (useHeadless && !contextHeadless) {
        pushDebug("login-gate", { note: "reopen-headless-after-login" });
        if (context) {
          await context.close().catch(() => null);
          context = null;
        }
        await openSession(true, returnUrl || payload.profileUrl);
      }
      return { context, page };
    };

    await openSession(useHeadless, payload.profileUrl);

    if (payload.mode === "login") {
      await evaluateWithRetry(page, () => window.scrollTo(0, 0), "login-scroll-top").catch(
        () => null,
      );
      const loginCompleted = await waitForLoginComplete(
        context,
        page,
        payload.profileUrl,
        LOGIN_WAIT_TIMEOUT_MS,
      );
      if (!loginCompleted) {
        throw new Error("Login timeout");
      }
      console.log(RESULT_PREFIX + JSON.stringify({ success: true, todos: [] }));
      return;
    }

    await humanDelay("open-session-settle", 2500);
    // 如果落在登录/验证码页，等待用户手动完成，而不是立刻报错关窗
    const accessIssueAfterOpen = await getAccessIssue(page);
    if (accessIssueAfterOpen?.kind === "risk") {
      await coolDownForRisk("open-access-risk");
      throw new Error(accessIssueAfterOpen.message || "Access blocked");
    }
    const loginRequiredAfterOpen = await detectLoginRequired(page);
    if (loginRequiredAfterOpen) {
      const path = await getPagePath(page);
      pushDebug("login-gate", { note: "waiting-for-user", path, mode: String(payload.mode || "") });
      await evaluateWithRetry(page, () => window.scrollTo(0, 0), "login-gate-scroll-top").catch(
        () => null,
      );
      await ensureInteractiveLogin(payload.profileUrl, payload.mode);
      const resolved = true;
      if (!resolved) {
        throw new Error("Login timeout — please login in the browser window");
      }
      // 登录完成后跳回主页
      await navigateWithRetry(page, payload.profileUrl, { waitUntil: "domcontentloaded", timeout: 45000 }, "post-login-profile");
      await humanDelay("post-login-settle", 2000);
    }

    // detail 模式有直链，直接跳转，不需要滚动列表
    if (payload.mode === "detail") {
      const detail = await collectNoteDetail(
        context,
        page,
        payload.card,
        payload.profileUrl,
        true,
        ensureInteractiveLogin,
      );
      console.log(RESULT_PREFIX + JSON.stringify({ success: true, todos: [detail] }));
      return;
    }

    await scrollToBottom(page, payload);

    let cards = await collectProfileCards(page);
    const accessIssueAfterCards = await getAccessIssue(page);
    if (accessIssueAfterCards?.kind === "risk") {
      await coolDownForRisk("cards-access-risk");
      throw new Error(accessIssueAfterCards.message || "Access blocked");
    }
    let loginRequiredAfterCards = await detectLoginRequired(page);
    if (loginRequiredAfterCards) {
      pushDebug("login-required", {
        note: "after-cards-waiting",
        path: await getPagePath(page),
        mode: String(payload.mode || ""),
      });
      await ensureInteractiveLogin(payload.profileUrl, payload.mode);
      await scrollToBottom(page, payload);
      cards = await collectProfileCards(page);
      const accessIssueAfterRetry = await getAccessIssue(page);
      if (accessIssueAfterRetry?.kind === "risk") {
        await coolDownForRisk("cards-retry-access-risk");
        throw new Error(accessIssueAfterRetry.message || "Access blocked");
      }
      loginRequiredAfterCards = await detectLoginRequired(page);
    }
    if (loginRequiredAfterCards) {
      const path = await getPagePath(page);
      pushDebug("login-required", {
        note: "after-cards",
        path,
        mode: String(payload.mode || ""),
      });
      throw new Error("Please login first");
    }

    if (cards.length === 0) {
      pushDebug("scrape-empty", {
        note: "no-cards-after-scroll",
        path: await getPagePath(page),
        mode: String(payload.mode || ""),
      });
      console.log(RESULT_PREFIX + JSON.stringify({ success: true, todos: [] }));
      return;
    }

    const todos = cards
      .filter((card) => matchesKeywords(card, keywords))
      .map((card) => ({ ...card, imageUrls: [] }));

    // 只有传入了 card 参数（detail 模式）或者明确要求抓取图片时才收集详情
    // scrape 模式只返回卡片列表，不点进详情页
    if (payload.card || payload.collectImages) {
      // 在同一个 browser 进程里逐张抓取图片，避免每次都重启 Chromium
      const todosWithImages = [];
      for (const todo of todos) {
        try {
          await humanDelay("detail-batch-next", antiRiskState.actionDelayMs);
          const detail = await collectNoteDetail(
            context,
            page,
            todo,
            payload.profileUrl,
            true,
            ensureInteractiveLogin,
          );
          todosWithImages.push(detail);
        } catch (detailError) {
          pushDebug("detail-error", { note: toErrorMessage(detailError), noteId: todo.noteId });
          todosWithImages.push(todo);
        }
      }
      console.log(RESULT_PREFIX + JSON.stringify({ success: true, todos: todosWithImages }));
    } else {
      // scrape 模式：只返回卡片列表
      console.log(RESULT_PREFIX + JSON.stringify({ success: true, todos }));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    pushDebug("run-failed", { note: message, mode: String(payload?.mode || "") });
    console.log(
      RESULT_PREFIX +
        JSON.stringify({
          success: false,
          error: message,
          debug: getDebugSummary(),
          mode: String(payload?.mode || ""),
        }),
    );
  } finally {
    if (context) await context.close().catch(() => null);
  }
})();
`;

const collectDebugTrace = (output) => {
  const entries = String(output || "")
    .split(/\r?\n/)
    .filter((item) => item.startsWith(DEBUG_PREFIX))
    .map((item) => safeJsonParse(item.slice(DEBUG_PREFIX.length), null))
    .filter(Boolean)
    .slice(-12)
    .map((item) => {
      const stage = String(item.stage || "debug");
      const parts = [stage];
      if (item.note) parts.push(`note=${item.note}`);
      if (item.path) parts.push(`path=${item.path}`);
      if (item.url) parts.push(`url=${String(item.url).slice(0, 160)}`);
      if (typeof item.loginRequired === "boolean") parts.push(`loginRequired=${item.loginRequired}`);
      if (item.authCookies) parts.push(`authCookies=${item.authCookies}`);
      // scroll-step fields
      if (typeof item.step === "number") parts.push(`step=${item.step}`);
      if (typeof item.collectedCount === "number") parts.push(`collected=${item.collectedCount}`);
      if (typeof item.height === "number") parts.push(`height=${item.height}`);
      if (typeof item.scrollY === "number") parts.push(`scrollY=${item.scrollY}`);
      if (typeof item.stableCount === "number") parts.push(`stable=${item.stableCount}`);
      if (typeof item.slideCount === "number") parts.push(`slides=${item.slideCount}`);
      if (typeof item.imageCount === "number") parts.push(`images=${item.imageCount}`);
      if (typeof item.sourceCount === "number") parts.push(`sources=${item.sourceCount}`);
      if (typeof item.backgroundCount === "number") parts.push(`backgrounds=${item.backgroundCount}`);
      if (typeof item.batchCount === "number") parts.push(`batch=${item.batchCount}`);
      if (typeof item.added === "number") parts.push(`added=${item.added}`);
      if (typeof item.rawCount === "number") parts.push(`raw=${item.rawCount}`);
      if (typeof item.keptCount === "number") parts.push(`kept=${item.keptCount}`);
      if (typeof item.rejectedCount === "number") parts.push(`rejected=${item.rejectedCount}`);
      // anchor-stats fields
      if (typeof item.totalAnchors === "number") parts.push(`totalAnchors=${item.totalAnchors}`);
      if (typeof item.exploreLike === "number") parts.push(`exploreLike=${item.exploreLike}`);
      if (typeof item.profileLike === "number") parts.push(`profileLike=${item.profileLike}`);
      if (item.pathname) parts.push(`pathname=${item.pathname}`);
      if (item.scrollHeight) parts.push(`scrollHeight=${item.scrollHeight}`);
      if (Array.isArray(item.sampleHrefs)) parts.push(`samples=[${item.sampleHrefs.slice(0, 3).join(",")}]`);
      if (Array.isArray(item.exploreHrefs)) parts.push(`exploreHrefs=[${item.exploreHrefs.join(",")}]`);
      if (Array.isArray(item.imageSamples)) parts.push(`imageSamples=[${item.imageSamples.slice(0, 3).join(",")}]`);
      if (Array.isArray(item.sourceSamples)) parts.push(`sourceSamples=[${item.sourceSamples.slice(0, 2).join(",")}]`);
      if (Array.isArray(item.backgroundSamples)) parts.push(`backgroundSamples=[${item.backgroundSamples.slice(0, 2).join(",")}]`);
      if (Array.isArray(item.rawSamples)) parts.push(`rawSamples=[${item.rawSamples.slice(0, 3).join(",")}]`);
      if (Array.isArray(item.keptSamples)) parts.push(`keptSamples=[${item.keptSamples.slice(0, 3).join(",")}]`);
      return parts.join(" ");
    });
  return entries.join(" | ");
};

const withShellDebug = (message, result) => {
  const trace = collectDebugTrace(result?.stdout || "");
  const stderr = String(result?.stderr || "").trim();
  const parts = [message];
  if (trace) parts.push(`debug=${trace}`);
  if (stderr) parts.push(`stderr=${stderr.split(/\r?\n/).slice(-2).join(" ")}`);
  return parts.join(" | ");
};

const parseScrapeResult = (stdout) => {
  const text = String(stdout || "");
  const debugTrace = collectDebugTrace(text);
  const line = text
    .split(/\r?\n/)
    .reverse()
    .find((item) => item.startsWith(RESULT_PREFIX));
  if (!line) {
    throw new Error(debugTrace ? `No scraper result | debug=${debugTrace}` : "No scraper result");
  }
  const payload = safeJsonParse(line.slice(RESULT_PREFIX.length), null);
  if (!payload || payload.success !== true) {
    const error = payload?.error || "Scrape failed";
    const payloadDebug = payload?.debug ? String(payload.debug) : "";
    const mergedDebug = [payloadDebug, debugTrace].filter(Boolean).join(" | ");
    throw new Error(mergedDebug ? `${error} | debug=${mergedDebug}` : error);
  }
  const todos = Array.isArray(payload.todos) ? payload.todos : [];
  return { todos, debugTrace };
};

const prepareRuntime = async (shell, state, setStatePatch) => {
  const runtimeDir = await getRuntimeDir();
  const packagePath = pathJoin(runtimeDir, "package.json");
  const scraperPath = pathJoin(runtimeDir, "scraper.cjs");
  const scraperHashPath = pathJoin(runtimeDir, "scraper.hash");
  const playwrightPath = pathJoin(runtimeDir, "node_modules", "playwright", "package.json");

  const dirResult = await ensureDir(shell, runtimeDir);
  if (!dirResult.success) {
    throw new Error(dirResult.error || dirResult.stderr || "Failed to prepare directory");
  }

  // Only write package.json if it doesn't exist yet
  const hasPackage = await pathExists(shell, packagePath);
  if (!hasPackage) {
    const packageResult = await writeTextFile(shell, packagePath, buildPackageJson());
    if (!packageResult.success) {
      throw new Error(packageResult.error || packageResult.stderr || "Failed to write package");
    }
  }

  // Only write scraper.cjs if content has changed (compare hash)
  const scraperSource = getScraperSource();
  const scraperHash = simpleHash(scraperSource);
  const existingHash = await readTextFile(shell, scraperHashPath);
  if (existingHash !== scraperHash) {
    const scraperResult = await writeTextFile(shell, scraperPath, scraperSource);
    if (!scraperResult.success) {
      throw new Error(scraperResult.error || scraperResult.stderr || "Failed to write scraper");
    }
    await writeTextFile(shell, scraperHashPath, scraperHash);
  }

  const hasPlaywright = await pathExists(shell, playwrightPath);
  if (!hasPlaywright) {
    const installResult = await runShell(shell, {
      command: "npm",
      args: ["--prefix", runtimeDir, "install", "playwright", "--registry", NPM_REGISTRY],
    });
    if (!installResult.success) {
      throw new Error(installResult.error || installResult.stderr || "Playwright install failed");
    }
  }

  if (!state.browserReady || !hasPlaywright) {
    setStatePatch({ browserReady: true });
  }

  return runtimeDir;
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

const scrapeTodos = async (shell, runtimeDir, userId, keywords, headless, maxCards) => {
  const payload = {
    mode: "scrape",
    profileUrl: buildProfileUrl(userId),
    userDataDir: pathJoin(runtimeDir, "xhs-profile"),
    keywords: splitKeywords(keywords),
    headless: headless !== false,
    maxCards: Number(maxCards) || PROFILE_SCROLL_MAX_CARDS,
  };
  const result = await runShell(shell, {
    command: "node",
    args: ["scraper.cjs", encodeBase64(JSON.stringify(payload))],
    cwd: runtimeDir,
    timeoutMs: LOGIN_TIMEOUT_MS,
  });
  if (!result.success) {
    throw new Error(withShellDebug(result.error || result.stderr || "Scrape failed", result));
  }
  const { todos, debugTrace } = parseScrapeResult(result.stdout);
  return { todos, debugTrace };
};

const scrapeTodoDetail = async (shell, runtimeDir, userId, todo, headless) => {
  const payload = {
    mode: "detail",
    profileUrl: buildProfileUrl(userId),
    userDataDir: pathJoin(runtimeDir, "xhs-profile"),
    headless: headless !== false,
    card: {
      noteId: todo.noteId,
      url: todo.url,
      title: todo.title || todo.noteId,
      desc: todo.desc,
      coverUrl: todo.coverUrl,
    },
  };
  const result = await runShell(shell, {
    command: "node",
    args: ["scraper.cjs", encodeBase64(JSON.stringify(payload))],
    cwd: runtimeDir,
    timeoutMs: LOGIN_TIMEOUT_MS,
  });
  if (!result.success) {
    throw new Error(withShellDebug(result.error || result.stderr || "Scrape failed", result));
  }
  const { todos: detailTodos, debugTrace } = parseScrapeResult(result.stdout);
  const [detail] = detailTodos;
  if (!detail) throw new Error("No note detail");
  return { ...detail, __debugTrace: debugTrace };
};

const openLoginWindow = async (shell, runtimeDir, userId) => {
  const payload = {
    mode: "login",
    profileUrl: buildProfileUrl(userId),
    userDataDir: pathJoin(runtimeDir, "xhs-profile"),
  };
  const result = await runShell(shell, {
    command: "node",
    args: ["scraper.cjs", encodeBase64(JSON.stringify(payload))],
    cwd: runtimeDir,
    timeoutMs: LOGIN_TIMEOUT_MS,
  });
  if (!result.success) {
    throw new Error(withShellDebug(result.error || result.stderr || "Login failed", result));
  }
  parseScrapeResult(result.stdout);
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
  const [activeNoteId, setActiveNoteId] = useState("");
  const refreshTaskRef = useRef(null);
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
    if (refreshTaskRef.current) return refreshTaskRef.current;

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
        const runtimeDir = await prepareRuntime(shell, storedStateRef.current, setStatePatch);
        setStatus({ key: "command.followPractice.status.refreshing" });
        const { todos: scraped, debugTrace } = await scrapeTodos(shell, runtimeDir, activeUserId, activeKeywords, activeHeadless, activeMaxCards);
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
        const message = error instanceof Error ? error.message : String(error);
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
        refreshTaskRef.current = null;
      }
    })();

    refreshTaskRef.current = task;
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
      const message = error instanceof Error ? error.message : String(error);
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
      const runtimeDir = await prepareRuntime(shell, storedStateRef.current, setStatePatch);
      setStatus({ key: "command.followPractice.status.login" });
      await openLoginWindow(shell, runtimeDir, userIdRef.current);
      setStatus({ key: "command.followPractice.status.loginReady" });
      patchState({ browserReady: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
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
        const runtimeDir = await prepareRuntime(shell, storedStateRef.current, setStatePatch);
        const detail = await scrapeTodoDetail(
          shell,
          runtimeDir,
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
      const message = error instanceof Error ? error.message : String(error);
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
          disabled={isRefreshing}
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
          disabled={isLoginOpening || isRefreshing}
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
                      disabled={isBusy}
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
