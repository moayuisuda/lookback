import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const DEFAULT_IMAGE_SCAN_STEP = 10;
const DETAIL_IMAGE_STABLE_ROUNDS = 3;
const CARD_FIND_MAX_STEPS = 36;
const CARD_FIND_SLEEP_MS = 150;
const LOGIN_WAIT_TIMEOUT_MS = 600000;
const LOGIN_POLL_MIN_LOOPS_BEFORE_ACCEPT = 8;
const PROFILE_SCROLL_MAX_STEPS = 80;
const PROFILE_SCROLL_IDLE_ROUNDS = 5;
const PROFILE_SCROLL_WAIT_MS = 900;
const PROFILE_SCROLL_INITIAL_WAIT_MS = 600;
const PROFILE_SCROLL_MAX_CARDS = 100;
const RISK_BASE_ACTION_DELAY_MS = 1000;
const RISK_MAX_RETRIES = 3;
const RISK_COOLDOWN_STEPS_MS = [5000, 10000, 20000, 30000];
const CHROME_MAJOR_VERSION = "145";
const FINGERPRINT_FILE_NAME = "xhs-browser-fingerprint.json";
const SYSTEM_BROWSER_NOT_FOUND = "SYSTEM_BROWSER_NOT_FOUND";
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
  const browserPaths = getFallbackBrowserPaths().filter((executablePath) =>
    fs.existsSync(executablePath),
  );
  if (browserPaths.length === 0) {
    throw new Error(SYSTEM_BROWSER_NOT_FOUND);
  }

  for (const executablePath of browserPaths) {
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

export const runFollowPracticeScraper = async (payload) => {
  let context;
  try {
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
      return { success: true, todos: [], debug: getDebugSummary() };
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
      return { success: true, todos: [detail], debug: getDebugSummary() };
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
      return { success: true, todos: [], debug: getDebugSummary() };
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
      return { success: true, todos: todosWithImages, debug: getDebugSummary() };
    } else {
      // scrape 模式：只返回卡片列表
      return { success: true, todos, debug: getDebugSummary() };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    pushDebug("run-failed", { note: message, mode: String(payload?.mode || "") });
    return {
      success: false,
      error: message,
      debug: getDebugSummary(),
      mode: String(payload?.mode || ""),
    };
  } finally {
    if (context) await context.close().catch(() => null);
  }
};
