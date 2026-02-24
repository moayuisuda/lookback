import { proxy } from "valtio";
import type { Locale } from "../i18n/types";

export const LATEST_RELEASE_API =
  "https://api.github.com/repos/moayuisuda/lookback-release/releases/latest";
export const LATEST_RELEASE_PAGE =
  "https://github.com/moayuisuda/lookback-release/releases/latest";
const GITHUB_RELEASE_DOWNLOAD_PREFIX =
  "https://github.com/moayuisuda/lookback-release/releases/download/";
const MIRROR_RELEASE_DOWNLOAD_PREFIX =
  "https://xget.xi-xu.me/gh/moayuisuda/lookback-release/releases/download/";
const COMMAND_MARKET_TREE_API =
  "https://api.github.com/repos/moayuisuda/lookback-release/git/trees/main?recursive=1";
const COMMAND_MARKET_RAW_PREFIX =
  "https://raw.githubusercontent.com/moayuisuda/lookback-release/refs/heads/main/";

const LOOKBACK_IMPORT_DEEP_LINK = "lookback://import-command";
const LOOKBACK_IMPORT_FALLBACK_MS = 1800;

export type Platform = "mac" | "win" | "other";
export type FaqPlatform = "mac" | "win";
export type SiteRoute = "/" | "/market";

type ReleaseAsset = {
  name: string;
  browser_download_url: string;
};

type LatestReleaseApi = {
  tag_name: string;
  html_url: string;
  assets: ReleaseAsset[];
};

type LatestRelease = {
  tagName: string;
  htmlUrl: string;
  assets: ReleaseAsset[];
};

type GitTreeItem = {
  path: string;
  type: "blob" | "tree";
};

type GitTreeApi = {
  tree: GitTreeItem[];
};

type LocalizedCommandText = {
  title?: string;
  description?: string;
};

export type CommandMarketItem = {
  id: string;
  fileName: string;
  title: string;
  description: string;
  localized: Partial<Record<Locale, LocalizedCommandText>>;
  downloadUrl: string;
};

type SiteState = {
  locale: Locale;
  activeFeatureId: number;
  release: LatestRelease | null;
  releaseVersion: string;
  faqPlatform: FaqPlatform;
  route: SiteRoute;
  commandMarketItems: CommandMarketItem[];
  commandMarketHasLoaded: boolean;
  commandMarketLoading: boolean;
  commandMarketError: string;
  commandMarketDownloadingId: string | null;
};

export const siteState = proxy<SiteState>({
  locale: "zh",
  activeFeatureId: 0,
  release: null,
  releaseVersion: "",
  faqPlatform: "mac",
  route: "/",
  commandMarketItems: [],
  commandMarketHasLoaded: false,
  commandMarketLoading: false,
  commandMarketError: "",
  commandMarketDownloadingId: null,
});

function normalizeVersion(tagName: string) {
  return tagName.replace(/^v/i, "");
}

function resolveMirrorDownloadUrl(downloadUrl: string) {
  // 统一将 GitHub release 直链替换为镜像加速链路。
  if (!downloadUrl.startsWith(GITHUB_RELEASE_DOWNLOAD_PREFIX))
    return downloadUrl;
  return downloadUrl.replace(
    GITHUB_RELEASE_DOWNLOAD_PREFIX,
    MIRROR_RELEASE_DOWNLOAD_PREFIX,
  );
}

import { DEFAULT_COMMAND_FILES } from "../../../app/shared/constants";

function isCommandScript(path: string) {
  return path.startsWith("commands/") && /\.(jsx?|tsx?)$/i.test(path);
}

function getFileName(path: string) {
  const chunks = path.split("/");
  return chunks[chunks.length - 1] ?? path;
}

function toBaseName(fileName: string) {
  return fileName.replace(/\.[^/.]+$/, "");
}

function toLocalRoute(hash: string): SiteRoute {
  const normalized = hash.replace(/^#/, "").replace(/\/+$/, "");
  if (normalized === "/market") return "/market";
  return "/";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildLookBackImportDeepLink(commandUrl: string) {
  return `${LOOKBACK_IMPORT_DEEP_LINK}?url=${encodeURIComponent(commandUrl)}`;
}

function openLookBackImportWithFallback(
  deepLink: string,
  onFallback: () => Promise<void>,
) {
  return new Promise<void>((resolve) => {
    let settled = false;
    const cleanup = () => {
      window.clearTimeout(timer);
      window.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("blur", handleWindowBlur);
    };
    const resolveSuccess = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const resolveFallback = async () => {
      if (settled) return;
      settled = true;
      cleanup();
      await onFallback();
      resolve();
    };
    const handleVisibilityChange = () => {
      if (document.hidden) {
        resolveSuccess();
      }
    };
    const handlePageHide = () => {
      resolveSuccess();
    };
    const handleWindowBlur = () => {
      resolveSuccess();
    };
    const timer = window.setTimeout(() => {
      void resolveFallback();
    }, LOOKBACK_IMPORT_FALLBACK_MS);

    window.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("blur", handleWindowBlur);

    try {
      window.location.assign(deepLink);
    } catch {
      void resolveFallback();
    }
  });
}

async function loadCommandScript(path: string) {
  const response = await fetch(`${COMMAND_MARKET_RAW_PREFIX}${path}`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.text();
}

function extractConfigBlock(source: string) {
  const markerMatch = /export\s+const\s+config\s*=/.exec(source);
  if (!markerMatch) return "";
  const braceStart = source.indexOf("{", markerMatch.index);
  if (braceStart < 0) return "";
  let depth = 0;
  let quote: "'" | '"' | "`" | null = null;
  let escaping = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (inLineComment) {
      if (char === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaping) {
        escaping = false;
        continue;
      }
      if (char === "\\") {
        escaping = true;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === "/" && next === "/") {
      inLineComment = true;
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      inBlockComment = true;
      index += 1;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(braceStart, index + 1);
      }
    }
  }
  return "";
}

function extractObjectFieldValue(block: string, key: string) {
  const pattern = new RegExp(
    `\\b${escapeRegExp(key)}\\s*:\\s*(['"\`])([\\s\\S]*?)\\1`,
  );
  const result = block.match(pattern);
  if (!result) return "";
  return result[2].trim();
}

function extractLocaleBlock(block: string, locale: Locale) {
  const localeMatch = new RegExp(`\\b${locale}\\s*:\\s*\\{`).exec(block);
  if (!localeMatch) return "";
  const braceStart = block.indexOf("{", localeMatch.index);
  if (braceStart < 0) return "";
  let depth = 0;
  for (let index = braceStart; index < block.length; index += 1) {
    const char = block[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return block.slice(braceStart + 1, index);
    }
  }
  return "";
}

function extractI18nField(localeBlock: string, key: string) {
  const pattern = new RegExp(
    `['"\`]${escapeRegExp(key)}['"\`]\\s*:\\s*(['"\`])([\\s\\S]*?)\\1`,
  );
  const result = localeBlock.match(pattern);
  if (!result) return "";
  return result[2].trim();
}

async function parseCommandScript(
  path: string,
): Promise<CommandMarketItem | null> {
  const script = await loadCommandScript(path);
  const configBlock = extractConfigBlock(script);
  if (!configBlock) return null;

  const fileName = getFileName(path);
  const title = extractObjectFieldValue(configBlock, "title");
  const description = extractObjectFieldValue(configBlock, "description");
  const titleKey = extractObjectFieldValue(configBlock, "titleKey");
  const descriptionKey = extractObjectFieldValue(configBlock, "descriptionKey");
  const localized: Partial<Record<Locale, LocalizedCommandText>> = {};

  (["zh", "en"] as const).forEach((locale) => {
    const localeBlock = extractLocaleBlock(configBlock, locale);
    if (!localeBlock) return;
    const localeTitle = titleKey ? extractI18nField(localeBlock, titleKey) : "";
    const localeDescription = descriptionKey
      ? extractI18nField(localeBlock, descriptionKey)
      : "";
    if (!localeTitle && !localeDescription) return;
    localized[locale] = {
      title: localeTitle || undefined,
      description: localeDescription || undefined,
    };
  });

  return {
    id: extractObjectFieldValue(configBlock, "id") || toBaseName(fileName),
    fileName,
    title: title || toBaseName(fileName),
    description,
    localized,
    downloadUrl: `${COMMAND_MARKET_RAW_PREFIX}${path}`,
  };
}

export function getCommandMarketDisplay(
  item: CommandMarketItem,
  locale: Locale,
) {
  const isBuiltIn = DEFAULT_COMMAND_FILES.includes(item.fileName);
  const suffix = isBuiltIn
    ? locale === "zh"
      ? "（内置）"
      : " (Built-in)"
    : "";
  return {
    name: (item.localized[locale]?.title || item.title) + suffix,
    description: item.localized[locale]?.description || item.description,
  };
}

function isCommandMarketItem(
  item: CommandMarketItem | null,
): item is CommandMarketItem {
  return item !== null;
}

export const siteActions = {
  setLocale(locale: Locale) {
    siteState.locale = locale;
  },
  setActiveFeature(id: number) {
    siteState.activeFeatureId = id;
  },
  setLocalVersion(version: string) {
    siteState.releaseVersion = version;
  },
  setFaqPlatform(platform: FaqPlatform) {
    siteState.faqPlatform = platform;
  },
  syncRouteFromLocation() {
    siteState.route = toLocalRoute(window.location.hash);
  },
  goToRoute(route: SiteRoute) {
    if (siteState.route === route) return;
    window.location.hash = route === "/" ? "" : route;
    siteState.route = route;
  },
  setLatestRelease(release: LatestRelease) {
    siteState.release = release;
    siteState.releaseVersion = normalizeVersion(release.tagName);
  },
  async loadLatestRelease() {
    try {
      const resp = await fetch(LATEST_RELEASE_API);
      if (!resp.ok) return null;
      const raw = (await resp.json()) as LatestReleaseApi;
      const release: LatestRelease = {
        tagName: raw.tag_name,
        htmlUrl: raw.html_url,
        assets: raw.assets,
      };
      siteActions.setLatestRelease(release);
      return release;
    } catch {
      return null;
    }
  },
  pickPlatformAsset(assets: ReleaseAsset[], platform: Platform) {
    if (platform === "mac") {
      return (
        assets.find((asset) => asset.name.toLowerCase().endsWith(".dmg")) ??
        null
      );
    }
    if (platform === "win") {
      return (
        assets.find((asset) => asset.name.toLowerCase().endsWith(".exe")) ??
        null
      );
    }
    return null;
  },
  async resolveDownloadUrl(platform: Platform) {
    const release =
      siteState.release ?? (await siteActions.loadLatestRelease());
    if (!release) return LATEST_RELEASE_PAGE;
    const asset = siteActions.pickPlatformAsset(release.assets, platform);
    if (!asset) return release.htmlUrl;
    return resolveMirrorDownloadUrl(asset.browser_download_url);
  },
  async loadCommandMarket() {
    siteState.commandMarketLoading = true;
    siteState.commandMarketError = "";
    try {
      // Git tree recursive 接口可直接返回 commands 目录全量文件路径。
      const resp = await fetch(COMMAND_MARKET_TREE_API);
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      const raw = (await resp.json()) as GitTreeApi;
      const scriptPaths = raw.tree
        .filter((item) => item.type === "blob" && isCommandScript(item.path))
        .map((item) => item.path)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

      const items: Array<CommandMarketItem | null> = await Promise.all(
        scriptPaths.map(async (scriptPath) => {
          try {
            return await parseCommandScript(scriptPath);
          } catch {
            return null;
          }
        }),
      );
      siteState.commandMarketItems = items.filter(isCommandMarketItem);
    } catch (error) {
      siteState.commandMarketError =
        error instanceof Error ? error.message : String(error);
      siteState.commandMarketItems = [];
    } finally {
      siteState.commandMarketLoading = false;
      siteState.commandMarketHasLoaded = true;
    }
  },
  async downloadCommand(item: CommandMarketItem) {
    siteState.commandMarketDownloadingId = item.id;
    siteState.commandMarketError = "";
    try {
      const downloadFile = async () => {
        // 深链不可用时回退为普通下载。
        const resp = await fetch(item.downloadUrl);
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }
        const fileBlob = await resp.blob();
        const objectUrl = URL.createObjectURL(fileBlob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = item.fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(objectUrl);
      };
      const deepLink = buildLookBackImportDeepLink(item.downloadUrl);
      await openLookBackImportWithFallback(deepLink, downloadFile);
    } catch (error) {
      siteState.commandMarketError =
        error instanceof Error ? error.message : String(error);
    } finally {
      siteState.commandMarketDownloadingId = null;
    }
  },
};
