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
const LOGIN_TIMEOUT_MS = 240000;
const DETAIL_IMAGE_SCAN_STEPS = 10;

export const config = {
  id: COMMAND_ID,
  i18n: {
    en: {
      "command.followPractice.title": "Follow Practice",
      "command.followPractice.description": "Track practice notes and add their images to the canvas",
      "command.followPractice.userId": "User ID",
      "command.followPractice.keywords": "Keywords",
      "command.followPractice.headless": "Headless mode",
      "command.followPractice.headless.hint": "If login is repeatedly required, try turning this on",
      "command.followPractice.refresh": "Fetch",
      "command.followPractice.clear": "Clear",
      "command.followPractice.clearTitle": "Clear todos",
      "command.followPractice.clearMessage": "Are you sure you want to clear all todos? This action cannot be undone.",
      "command.followPractice.login": "Login",
      "command.followPractice.follow": "Practice",
      "command.followPractice.checkIn": "Check in",
      "command.followPractice.cancelCheckIn": "Cancel check-in",
      "command.followPractice.done": "Done",
      "command.followPractice.pending": "Todo",
      "command.followPractice.images": "{{count}} images",
      "command.followPractice.empty": "No todos",
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
      "command.followPractice.headless": "无头模式",
      "command.followPractice.headless.hint": "如果一直提示未登录，尝试开启",
      "command.followPractice.refresh": "拉取",
      "command.followPractice.clear": "清空",
      "command.followPractice.clearTitle": "清空待办",
      "command.followPractice.clearMessage": "确定要清空全部待办吗？此操作无法撤销。",
      "command.followPractice.login": "登录",
      "command.followPractice.follow": "跟练",
      "command.followPractice.checkIn": "打卡",
      "command.followPractice.cancelCheckIn": "取消打卡",
      "command.followPractice.done": "已打卡",
      "command.followPractice.pending": "待办",
      "command.followPractice.images": "{{count}} 张图",
      "command.followPractice.empty": "暂无待办",
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

const buildProfileUrl = (userId) =>
  `https://www.xiaohongshu.com/user/profile/${encodeURIComponent(userId.trim())}`;

const runShell = async (shell, payload) =>
  shell({
    timeoutMs: SHELL_TIMEOUT_MS,
    ...payload,
  });

const ensureDir = async (shell, dirPath) => {
  if (isWin()) {
    const script = [
      "$ErrorActionPreference='Stop'",
      "$dir=$args[0]",
      "if (!(Test-Path -LiteralPath $dir -PathType Container)) {",
      "  New-Item -ItemType Directory -Path $dir -Force | Out-Null",
      "}",
    ].join("; ");
    return runShell(shell, {
      command: "powershell.exe",
      args: ["-NoProfile", "-Command", script, dirPath],
    });
  }
  return runShell(shell, {
    command: "mkdir",
    args: ["-p", dirPath],
  });
};

const pathExists = async (shell, filePath) => {
  if (isWin()) {
    const script = "if (Test-Path -LiteralPath $args[0]) { exit 0 }; exit 1";
    const result = await runShell(shell, {
      command: "powershell.exe",
      args: ["-NoProfile", "-Command", script, filePath],
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
    const script = [
      "$ErrorActionPreference='Stop'",
      "$path=$args[0]",
      "$data=$args[1]",
      "$dir=[IO.Path]::GetDirectoryName($path)",
      "if ($dir) { [IO.Directory]::CreateDirectory($dir) | Out-Null }",
      "[IO.File]::WriteAllBytes($path, [Convert]::FromBase64String($data))",
    ].join("; ");
    return runShell(shell, {
      command: "powershell.exe",
      args: ["-NoProfile", "-Command", script, filePath, encoded],
    });
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

const getScriptCommand = () =>
  isWin()
    ? "\"%npm_node_execpath%\" scraper.cjs"
    : "\"$npm_node_execpath\" scraper.cjs";

const getInstallBrowserCommand = () =>
  isWin()
    ? "\"%npm_node_execpath%\" node_modules\\playwright\\cli.js install chromium"
    : "\"$npm_node_execpath\" node_modules/playwright/cli.js install chromium";

const buildPackageJson = () =>
  JSON.stringify(
    {
      private: true,
      scripts: {
        scrape: getScriptCommand(),
        "install-browser": getInstallBrowserCommand(),
      },
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
const { chromium } = require("playwright");

const RESULT_PREFIX = "__FOLLOW_PRACTICE_RESULT__";
const DEBUG_PREFIX = "__FOLLOW_PRACTICE_DEBUG__";
const DEFAULT_IMAGE_SCAN_STEP = ${DETAIL_IMAGE_SCAN_STEPS};
const DETAIL_IMAGE_STABLE_ROUNDS = 3;
const CARD_FIND_MAX_STEPS = 36;
const CARD_FIND_SLEEP_MS = 320;

const decodePayload = () => {
  const encoded = process.argv[process.argv.length - 1] || "";
  return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
      const login = typeof item.loginRequired === "boolean" ? " loginRequired=" + item.loginRequired : "";
      const cookies = item.authCookies ? " authCookies=" + item.authCookies : "";
      return String(item.ts || "") + " " + String(item.stage || "") + note + urlPath + login + cookies;
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

const cleanText = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim();

const getNoteIdFromUrl = (url) => {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/(?:explore|discovery\/item)\/([^/?#]+)/);
    return match ? match[1] : "";
  } catch {
    return "";
  }
};

const collectVisibleProfileCards = () => {
  const getText = (node) =>
    String(node && node.innerText ? node.innerText : "")
      .replace(/\s+/g, " ")
      .trim();
  const keepCoverImage = (image) => {
    const src = image.currentSrc || image.src || "";
    const rect = image.getBoundingClientRect();
    if (!src || /avatar|favicon|logo|qrcode|sprite|icon/i.test(src)) return false;
    return rect.width >= 80 && rect.height >= 80;
  };
  const findCardImage = (anchor, title) => {
    let card = anchor;
    for (let depth = 0; depth < 8 && card && card.parentElement; depth += 1) {
      card = card.parentElement;
      if (!(card.innerText || "").includes(title)) continue;
      const images = Array.from(card.querySelectorAll("img")).filter(keepCoverImage);
      if (images.length > 0) {
        return images.sort((a, b) => {
          const rectA = a.getBoundingClientRect();
          const rectB = b.getBoundingClientRect();
          return rectB.width * rectB.height - rectA.width * rectA.height;
        })[0];
      }
    }
    return null;
  };

  const anchors = Array.from(document.querySelectorAll("a")).filter((node) =>
    /^day\d+/i.test(getText(node)),
  );
  return anchors.map((anchor, index) => {
    const title = getText(anchor);
    const image = findCardImage(anchor, title);
    return {
      noteId: title,
      url: String(anchor.href || ""),
      title,
      desc: getText(anchor.parentElement || anchor),
      coverUrl: image ? image.currentSrc || image.src || "" : "",
      index,
    };
  });
};

const appendVisibleProfileCards = async (page) =>
  page.evaluate((collectorSource) => {
    const collect = new Function("return (" + collectorSource + ")")();
    window.__followPracticeCards = Array.isArray(window.__followPracticeCards)
      ? window.__followPracticeCards
      : [];
    const seen = new Set(window.__followPracticeCards.map((card) => card.noteId));
    for (const card of collect()) {
      if (!card.noteId || seen.has(card.noteId)) continue;
      seen.add(card.noteId);
      window.__followPracticeCards.push(card);
    }
    return window.__followPracticeCards.length;
  }, collectVisibleProfileCards.toString());

const scrollToBottom = async (page) => {
  let stableCount = 0;
  let lastHeight = 0;
  let lastCount = 0;
  let lastScrollY = -1;

  await page.evaluate(() => {
    window.__followPracticeCards = [];
    window.scrollTo(0, 0);
  });
  await sleep(600);

  for (let i = 0; i < 80; i += 1) {
    const collectedCount = await appendVisibleProfileCards(page);
    const metrics = await page.evaluate(() => {
      const step = Math.max(window.innerHeight * 0.85, 700);
      window.scrollBy(0, step);
      return {
        height: document.body.scrollHeight,
        scrollY: window.scrollY,
      };
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
    if (stableCount >= 5) break;
    await sleep(900);
  }
  await appendVisibleProfileCards(page);
};

const isLoginRequired = async (page) =>
  page.evaluate(() => {
    const text = String(document.body.innerText || "");
    return (
      location.pathname.startsWith("/login") ||
      location.pathname.startsWith("/website-login") ||
      text.includes("登录即可查看") ||
      text.includes("手机号登录")
    );
  });

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
  while (Date.now() < deadline) {
    loop += 1;
    const cookies = await context.cookies(profileUrl).catch(() => []);
    const authCookies = cookies
      .filter((cookie) => ["web_session", "id_token"].includes(cookie.name))
      .map((cookie) => String(cookie.name) + ":" + String(String(cookie.value || "").length))
      .join(",");

    const loginRequired = await isLoginRequired(page).catch(() => true);
    const path = await page.evaluate(() => location.pathname).catch(() => "(unknown)");
    pushDebug("login-poll", {
      loop,
      path,
      loginRequired,
      authCookies,
      pageClosed: page.isClosed(),
    });

    // cookie 存在且页面已离开登录页，才算真正登录成功
    if (hasAuthCookie(cookies) && !loginRequired) {
      pushDebug("login-complete", { note: "auth-cookie-and-page-ok", authCookies, path });
      return true;
    }
    if (page.isClosed()) {
      pushDebug("login-abort", { note: "page-closed" });
      return false;
    }

    await sleep(1000);
  }
  pushDebug("login-timeout", { note: "deadline-reached" });
  return false;
};

const applyStealth = async (context) => {
  await context.addInitScript(() => {
    const defineGetter = (obj, key, value) => {
      try {
        Object.defineProperty(obj, key, {
          get: () => value,
          configurable: true,
        });
      } catch {}
    };

    defineGetter(Navigator.prototype, "webdriver", undefined);
    defineGetter(Navigator.prototype, "languages", ["zh-CN", "zh", "en-US", "en"]);
    defineGetter(Navigator.prototype, "platform", "MacIntel");
    defineGetter(Navigator.prototype, "hardwareConcurrency", 8);
    defineGetter(Navigator.prototype, "deviceMemory", 8);
    defineGetter(Navigator.prototype, "plugins", [
      { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer" },
      { name: "Chrome PDF Viewer", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai" },
      { name: "Native Client", filename: "internal-nacl-plugin" },
    ]);

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
        if (param === 37445) return "Intel Inc.";
        if (param === 37446) return "Intel Iris OpenGL Engine";
        return getParameter.call(this, param);
      };
    } catch {}

    try {
      const getParameter2 = WebGL2RenderingContext.prototype.getParameter;
      WebGL2RenderingContext.prototype.getParameter = function (param) {
        if (param === 37445) return "Intel Inc.";
        if (param === 37446) return "Intel Iris OpenGL Engine";
        return getParameter2.call(this, param);
      };
    } catch {}

    try {
      defineGetter(window, "__playwright__binding__", undefined);
      defineGetter(window, "__pwInitScripts", undefined);
    } catch {}
  });
};

const collectProfileCards = async (page) =>
  page.evaluate((collectorSource) => {
    const collect = new Function("return (" + collectorSource + ")")();
    const sourceRows = [
      ...(Array.isArray(window.__followPracticeCards) ? window.__followPracticeCards : []),
      ...collect(),
    ];
    const rows = [];
    const seen = new Set();
    for (const row of sourceRows) {
      const title = String(row.title || row.noteId || "").trim();
      if (!title || seen.has(title)) continue;
      seen.add(title);
      rows.push({
        noteId: title,
        url: String(row.url || ""),
        title,
        desc: String(row.desc || ""),
        coverUrl: String(row.coverUrl || ""),
        index: Number(row.index || rows.length),
      });
    }
    return rows;
  }, collectVisibleProfileCards.toString());

const collectDetailImages = async (page) => {
  const urls = [];
  const seenUrl = new Set();
  const seenSlideIndexes = new Set();
  let stableRounds = 0;
  for (let i = 0; i < DEFAULT_IMAGE_SCAN_STEP; i += 1) {
    const batch = await page.evaluate(() => {
      const slides = Array.from(document.querySelectorAll("[data-swiper-slide-index]"));
      const rows = [];
      for (const slide of slides) {
        const slideIndex = String(slide.getAttribute("data-swiper-slide-index") || "").trim();
        if (!slideIndex) continue;
        const images = Array.from(slide.querySelectorAll("img"));
        const urls = images
          .map((image) => image.currentSrc || image.src || image.getAttribute("src") || "")
          .filter(Boolean);
        if (urls.length > 0) {
          rows.push({ slideIndex, urls });
        }
      }
      return rows;
    });

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
    if (stableRounds >= DETAIL_IMAGE_STABLE_ROUNDS && urls.length > 0) {
      break;
    }

    await page.keyboard.press("ArrowRight").catch(() => null);
    await sleep(180);
  }
  return unique(urls).filter(shouldKeepImage);
};

const findAndClickProfileCard = async (page, title) => {
  const targetTitle = cleanText(title);
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => null);
  await sleep(500);

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

    const metrics = await page.evaluate(() => {
      const step = Math.max(window.innerHeight * 0.85, 700);
      window.scrollBy(0, step);
      return {
        height: document.body.scrollHeight,
        scrollY: window.scrollY,
      };
    });

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

const collectNoteDetail = async (page, card, profileUrl) => {
  try {
    await page.bringToFront().catch(() => null);
    const directUrl = String(card.url || "").trim();
    if (/^https?:\/\//i.test(directUrl)) {
      await page.goto(directUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    } else {
      if (page.url() !== profileUrl) {
        await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      }
      const clicked = await findAndClickProfileCard(page, card.title);
      if (!clicked) {
        throw new Error("Note card not found: " + card.title);
      }
    }
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => null);
    await page
      .waitForFunction(
        () =>
          Array.from(document.images).some((image) => {
            const width = image.naturalWidth || image.width || 0;
            const height = image.naturalHeight || image.height || 0;
            return width >= 220 && height >= 220;
          }),
        { timeout: 4000 },
      )
      .catch(() => null);
    await sleep(500);
    if (await isLoginRequired(page)) {
      const path = await page.evaluate(() => location.pathname).catch(() => "(unknown)");
      pushDebug("login-required", { note: "detail-page", path, mode: "detail" });
      throw new Error("Please login first");
    }
    await page.evaluate(() => window.scrollTo(0, 0)).catch(() => null);

    const detail = await page.evaluate(() => {
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
    });

    const images = await collectDetailImages(page);
    const detailUrl = page.url();
    const noteId = getNoteIdFromUrl(detailUrl) || card.noteId;
    if (!/^https?:\/\//i.test(directUrl)) {
      await page.keyboard.press("Escape").catch(() => null);
      if (page.url() !== profileUrl) {
        await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => null);
      }
      await sleep(400);
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
    const contextOptions = {
      headless: useHeadless,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
        "--no-sandbox",
        "--lang=zh-CN,zh",
        "--window-size=1440,900",
      ],
      locale: "zh-CN",
      viewport: { width: 1440, height: 900 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    };
    context = await chromium.launchPersistentContext(payload.userDataDir, contextOptions);
    await applyStealth(context);
    const page = await context.newPage();
    await page.goto(payload.profileUrl, { waitUntil: "domcontentloaded", timeout: 45000 });

    if (payload.mode === "login") {
      await page.evaluate(() => window.scrollTo(0, 0)).catch(() => null);
      const loginCompleted = await waitForLoginComplete(context, page, payload.profileUrl, 230000);
      if (!loginCompleted) {
        throw new Error("Login timeout");
      }
      console.log(RESULT_PREFIX + JSON.stringify({ success: true, todos: [] }));
      return;
    }

    await sleep(2500);
    // 如果落在登录/验证码页，等待用户手动完成，而不是立刻报错关窗
    const loginRequiredAfterOpen = await isLoginRequired(page);
    if (loginRequiredAfterOpen) {
      const path = await page.evaluate(() => location.pathname).catch(() => "(unknown)");
      pushDebug("login-gate", { note: "waiting-for-user", path, mode: String(payload.mode || "") });
      await page.evaluate(() => window.scrollTo(0, 0)).catch(() => null);
      const resolved = await waitForLoginComplete(context, page, payload.profileUrl, 230000);
      if (!resolved) {
        throw new Error("Login timeout — please login in the browser window");
      }
      // 登录完成后跳回主页
      await page.goto(payload.profileUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
      await sleep(2000);
    }

    // detail 模式有直链，直接跳转，不需要滚动列表
    if (payload.mode === "detail") {
      const detail = await collectNoteDetail(page, payload.card, payload.profileUrl);
      console.log(RESULT_PREFIX + JSON.stringify({ success: true, todos: [detail] }));
      return;
    }

    await scrollToBottom(page);

    const cards = await collectProfileCards(page);
    const loginRequiredAfterCards = await isLoginRequired(page);
    if (cards.length === 0 || loginRequiredAfterCards) {
      const path = await page.evaluate(() => location.pathname).catch(() => "(unknown)");
      pushDebug("login-required", {
        note: cards.length === 0 ? "empty-cards" : "after-cards",
        path,
        mode: String(payload.mode || ""),
      });
      throw new Error("Please login first");
    }

    const todos = cards
      .filter((card) => matchesKeywords(card, keywords))
      .map((card) => ({ ...card, imageUrls: [] }));
    console.log(RESULT_PREFIX + JSON.stringify({ success: true, todos }));
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
    .slice(-8)
    .map((item) => {
      const stage = String(item.stage || "debug");
      const note = item.note ? `:${item.note}` : "";
      const path = item.path ? ` path=${item.path}` : "";
      const login = typeof item.loginRequired === "boolean" ? ` loginRequired=${item.loginRequired}` : "";
      const cookies = item.authCookies ? ` authCookies=${item.authCookies}` : "";
      return `${stage}${note}${path}${login}${cookies}`;
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
  return Array.isArray(payload.todos) ? payload.todos : [];
};

const prepareRuntime = async (shell, state, setStatePatch) => {
  const runtimeDir = await getRuntimeDir();
  const packagePath = pathJoin(runtimeDir, "package.json");
  const scraperPath = pathJoin(runtimeDir, "scraper.cjs");
  const playwrightPath = pathJoin(runtimeDir, "node_modules", "playwright", "package.json");

  const dirResult = await ensureDir(shell, runtimeDir);
  if (!dirResult.success) {
    throw new Error(dirResult.error || dirResult.stderr || "Failed to prepare directory");
  }

  const packageResult = await writeTextFile(shell, packagePath, buildPackageJson());
  if (!packageResult.success) {
    throw new Error(packageResult.error || packageResult.stderr || "Failed to write package");
  }

  const scraperResult = await writeTextFile(shell, scraperPath, getScraperSource());
  if (!scraperResult.success) {
    throw new Error(scraperResult.error || scraperResult.stderr || "Failed to write scraper");
  }

  const hasPlaywright = await pathExists(shell, playwrightPath);
  if (!hasPlaywright) {
    const installResult = await runShell(shell, {
      command: "npm",
      args: ["--prefix", runtimeDir, "install", "playwright"],
    });
    if (!installResult.success) {
      throw new Error(installResult.error || installResult.stderr || "Playwright install failed");
    }
    setStatePatch({ browserReady: false });
  }

  if (!state.browserReady || !hasPlaywright) {
    const browserResult = await runShell(shell, {
      command: "npm",
      args: ["--prefix", runtimeDir, "run", "install-browser"],
    });
    if (!browserResult.success) {
      throw new Error(browserResult.error || browserResult.stderr || "Browser install failed");
    }
    setStatePatch({ browserReady: true });
  }

  return runtimeDir;
};

const mergeTodos = (currentTodos, scrapedTodos) => {
  const currentById = new Map(currentTodos.map((todo) => [todo.noteId, todo]));
  const next = [];
  const now = Date.now();
  for (const scraped of scrapedTodos) {
    const noteId = String(scraped?.noteId || "").trim();
    if (!noteId) continue;
    const previous = currentById.get(noteId);
    const imageUrls = Array.isArray(scraped.imageUrls) ? scraped.imageUrls.filter(Boolean) : [];
    next.push(
      normalizeTodo({
        ...previous,
        noteId,
        url: String(scraped.url || previous?.url || ""),
        title: String(scraped.title || previous?.title || ""),
        desc: String(scraped.desc || previous?.desc || ""),
        coverUrl: String(scraped.coverUrl || previous?.coverUrl || imageUrls[0] || ""),
        imageUrls: imageUrls.length > 0 ? imageUrls : previous?.imageUrls || [],
        status: previous?.status || "pending",
        createdAt: previous?.createdAt || now,
        updatedAt: now,
        checkedAt: previous?.checkedAt || 0,
        followedAt: previous?.followedAt || 0,
      }),
    );
  }

  for (const todo of currentTodos) {
    if (!next.some((item) => item.noteId === todo.noteId)) {
      next.push(todo);
    }
  }
  return next;
};

const scrapeTodos = async (shell, runtimeDir, userId, keywords, headless) => {
  const payload = {
    mode: "scrape",
    profileUrl: buildProfileUrl(userId),
    userDataDir: pathJoin(runtimeDir, "xhs-profile"),
    keywords: splitKeywords(keywords),
    headless: headless !== false,
  };
  const result = await runShell(shell, {
    command: "npm",
    args: ["--prefix", runtimeDir, "run", "scrape", "--", encodeBase64(JSON.stringify(payload))],
  });
  if (!result.success) {
    throw new Error(withShellDebug(result.error || result.stderr || "Scrape failed", result));
  }
  return parseScrapeResult(result.stdout);
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
    command: "npm",
    args: ["--prefix", runtimeDir, "run", "scrape", "--", encodeBase64(JSON.stringify(payload))],
  });
  if (!result.success) {
    throw new Error(withShellDebug(result.error || result.stderr || "Scrape failed", result));
  }
  const [detail] = parseScrapeResult(result.stdout);
  if (!detail) throw new Error("No note detail");
  return detail;
};

const openLoginWindow = async (shell, runtimeDir, userId) => {
  const payload = {
    mode: "login",
    profileUrl: buildProfileUrl(userId),
    userDataDir: pathJoin(runtimeDir, "xhs-profile"),
  };
  const result = await runShell(shell, {
    command: "npm",
    args: ["--prefix", runtimeDir, "run", "scrape", "--", encodeBase64(JSON.stringify(payload))],
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
  const [status, setStatus] = useState({ key: "command.followPractice.status.ready" });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoginOpening, setIsLoginOpening] = useState(false);
  const [activeNoteId, setActiveNoteId] = useState("");
  const refreshTaskRef = useRef(null);
  const storedStateRef = useRef(storedState);
  const userIdRef = useRef(userId);
  const keywordsRef = useRef(keywords);
  const headlessRef = useRef(headless);

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
        const runtimeDir = await prepareRuntime(shell, storedStateRef.current, setStatePatch);
        setStatus({ key: "command.followPractice.status.refreshing" });
        const scraped = await scrapeTodos(shell, runtimeDir, activeUserId, activeKeywords, activeHeadless);
        const nextTodos = mergeTodos(storedStateRef.current.todos, scraped);
        patchState({
          todos: nextTodos,
          userId: activeUserId,
          keywords: activeKeywords,
          headless: activeHeadless,
          lastRefreshAt: Date.now(),
        });
        setStatus({
          key: "command.followPractice.status.updated",
          params: { count: nextTodos.length },
        });
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

  const handleClear = () => {
    const confirmed = window.confirm(
      `${t("command.followPractice.clearTitle")}\n\n${t("command.followPractice.clearMessage")}`,
    );
    if (!confirmed) return;

    patchState({
      todos: [],
      lastRefreshAt: 0,
    });
    setStatus({ key: "command.followPractice.status.cleared" });
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
        actions.globalActions.pushToast(
          { key: "toast.command.followPractice.noImages" },
          "warning",
        );
        return;
      }

      const canvasName = canvasSnap.currentCanvasName || "Default";
      const metas = await downloadTodoImages(context, activeTodo, canvasName);
      if (!metas.length) {
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
    <div className="flex h-[520px] flex-col bg-neutral-950 text-neutral-100">
      <div className="flex shrink-0 items-start gap-3 border-b border-neutral-800 px-4 py-3">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
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
          disabled={isRefreshing || storedState.todos.length === 0}
          className="mt-5 h-8 rounded bg-red-600 px-3 text-sm font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
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
            <span className="pointer-events-none absolute left-1/2 top-5 z-10 w-52 -translate-x-1/2 rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-left text-xs font-normal leading-relaxed text-neutral-200 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
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
          <div className="flex h-full items-center justify-center text-sm text-neutral-500">
            {t("command.followPractice.empty")}
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
                      className="h-8 rounded border border-neutral-700 px-3 text-sm text-neutral-100 hover:border-primary disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {t("command.followPractice.follow")}
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
