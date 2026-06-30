import { proxy } from "valtio";
import type { Locale } from "../i18n/types";

export const LATEST_RELEASE_API =
  "https://api.github.com/repos/moayuisuda/lookback-release/releases/latest";
export const LATEST_RELEASE_PAGE =
  "https://github.com/moayuisuda/lookback-release/releases/latest";
export const PICAPTAIN_RELEASE_API =
  "https://api.github.com/repos/moayuisuda/OnlyRef/releases/latest";
const COMMAND_MARKET_TREE_API =
  "https://api.github.com/repos/moayuisuda/lookback/git/trees/main?recursive=1";
const COMMAND_MARKET_RAW_PREFIX =
  "https://raw.githubusercontent.com/moayuisuda/lookback/refs/heads/main/";
const COMMAND_MARKET_CONTENTS_PREFIX =
  "https://api.github.com/repos/moayuisuda/lookback/contents/";
const DEVELOPER_DOC_URLS = {
  jsx: "https://raw.githubusercontent.com/moayuisuda/lookback/refs/heads/main/open/dev-jsx-command.md",
  folder:
    "https://raw.githubusercontent.com/moayuisuda/lookback/refs/heads/main/open/dev-folder-command.md",
} as const;
const LOOKBACK_IMPORT_DEEP_LINK = "lookback://import-command";
const LOOKBACK_IMPORT_FALLBACK_MS = 1800;
const DEVELOPER_DOC_COPIED_VISIBLE_MS = 1800;

export type SiteRoute = "/" | "/market" | "/developer" | "/picaptain";
type DeveloperDocId = keyof typeof DEVELOPER_DOC_URLS;

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

type CommandMarketFile = {
  path: string;
  relativePath: string;
};

type CommandPluginManifest = {
  lookback?: {
    id?: string;
    ui?: string;
    server?: string;
  };
};

export type CommandMarketItem = {
  id: string;
  fileName: string;
  title: string;
  description: string;
  localized: Partial<Record<Locale, LocalizedCommandText>>;
  downloadUrl: string;
  kind: "script" | "plugin";
  files?: readonly CommandMarketFile[];
};

type SiteState = {
  locale: Locale;
  activeFeatureId: number;
  release: LatestRelease | null;
  releaseVersion: string;
  route: SiteRoute;
  commandMarketItems: CommandMarketItem[];
  commandMarketHasLoaded: boolean;
  commandMarketLoading: boolean;
  commandMarketError: string;
  commandMarketDownloadingId: string | null;
  developerDocCopyingId: DeveloperDocId | null;
  developerDocCopiedId: DeveloperDocId | null;
  developerDocCopyErrorId: DeveloperDocId | null;
  picaptainRelease: LatestRelease | null;
  picaptainReleaseVersion: string;
  picaptainReleasePage: string;
  picaptainDownloadUrl: string;
};

export const siteState = proxy<SiteState>({
  locale: "zh",
  activeFeatureId: 0,
  release: null,
  releaseVersion: "",
  route: "/",
  commandMarketItems: [],
  commandMarketHasLoaded: false,
  commandMarketLoading: false,
  commandMarketError: "",
  commandMarketDownloadingId: null,
  developerDocCopyingId: null,
  developerDocCopiedId: null,
  developerDocCopyErrorId: null,
  picaptainRelease: null,
  picaptainReleaseVersion: "1.0.0",
  picaptainReleasePage: "https://github.com/moayuisuda/OnlyRef/releases/tag/v1.0.0",
  picaptainDownloadUrl: "https://xget.xi-xu.me/gh/moayuisuda/OnlyRef/releases/download/v1.0.0/PiCaptain.Setup.1.0.0.exe",
});

function normalizeVersion(tagName: string) {
  return tagName.replace(/^v/i, "");
}

function resolveMirrorDownloadUrl(downloadUrl: string) {
  // 统一将 GitHub release 直链替换为镜像加速链路。
  const githubPrefix = "https://github.com/";
  const mirrorPrefix = "https://xget.xi-xu.me/gh/";
  if (downloadUrl.startsWith(githubPrefix)) {
    return downloadUrl.replace(githubPrefix, mirrorPrefix);
  }
  return downloadUrl;
}

import { DEFAULT_COMMAND_FILES } from "../../../app/shared/constants";

const COMMAND_PENDING_PREFIX = "app/src/commands-pending/";

function getPendingCommandPath(path: string) {
  if (!path.startsWith(COMMAND_PENDING_PREFIX)) return "";
  return path.slice(COMMAND_PENDING_PREFIX.length);
}

function isScriptExtension(path: string) {
  return /\.(mjs|jsx?|tsx?)$/i.test(path);
}

function isRootCommandScript(path: string) {
  const relativePath = getPendingCommandPath(path);
  return Boolean(relativePath && !relativePath.includes("/") && isScriptExtension(relativePath));
}

function isCommandPluginFile(path: string) {
  const relativePath = getPendingCommandPath(path);
  if (!relativePath.includes("/")) return false;
  return !/(^|\/)(node_modules|\.lookback-esm)(\/|$)/.test(relativePath);
}

function getFileName(path: string) {
  const chunks = path.split("/");
  return chunks[chunks.length - 1] ?? path;
}

function toBaseName(fileName: string) {
  return fileName.replace(/\.[^/.]+$/, "");
}

function getPluginDir(path: string) {
  const relativePath = getPendingCommandPath(path);
  return relativePath.split("/")[0] || "";
}

function toLocalRoute(hash: string): SiteRoute {
  const normalized = hash.replace(/^#/, "").replace(/\/+$/, "");
  if (normalized === "/market") return "/market";
  if (normalized === "/developer") return "/developer";
  if (normalized === "/picaptain") return "/picaptain";
  return "/";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeJsonParse(value: string, fallback: unknown) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizePluginRelativePath(value: string) {
  return value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "");
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
    kind: "script",
  };
}

async function loadDeveloperDoc(id: DeveloperDocId) {
  const response = await fetch(DEVELOPER_DOC_URLS[id], { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.text();
}

async function writeTextToClipboard(text: string) {
  if (!navigator.clipboard?.writeText) {
    throw new Error("Clipboard API unavailable");
  }
  await navigator.clipboard.writeText(text);
}

function parsePluginManifest(packageJson: string) {
  const manifest = safeJsonParse(packageJson, {}) as CommandPluginManifest;
  const pluginId = manifest.lookback?.id?.trim() || "";
  const uiEntry = manifest.lookback?.ui?.trim() || "";
  return { pluginId, uiEntry };
}

function pickPluginEntry(files: CommandMarketFile[], uiEntry: string) {
  if (!uiEntry) return "";
  const entry = normalizePluginRelativePath(uiEntry);
  if (!isScriptExtension(entry)) return "";
  const available = new Set(files.map((file) => file.relativePath));
  return available.has(entry) ? entry : "";
}

async function parseCommandPlugin(
  pluginDir: string,
  files: CommandMarketFile[],
): Promise<CommandMarketItem | null> {
  const packagePath = `${COMMAND_PENDING_PREFIX}${pluginDir}/package.json`;
  const packageJson = await loadCommandScript(packagePath);
  const { pluginId, uiEntry } = parsePluginManifest(packageJson);
  if (!pluginId) return null;
  const entry = pickPluginEntry(files, uiEntry);
  if (!entry) return null;

  const entryPath = `${COMMAND_PENDING_PREFIX}${pluginDir}/${entry}`;
  const item = await parseCommandScript(entryPath);
  if (!item) return null;

  return {
    ...item,
    fileName: `${pluginDir}.zip`,
    downloadUrl: `${COMMAND_MARKET_CONTENTS_PREFIX}${COMMAND_PENDING_PREFIX}${pluginDir}?ref=main`,
    kind: "plugin",
    files,
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

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pushUint16(target: number[], value: number) {
  target.push(value & 0xff, (value >>> 8) & 0xff);
}

function pushUint32(target: number[], value: number) {
  target.push(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

function concatUint8Arrays(parts: Uint8Array[]) {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function toArrayBuffer(bytes: Uint8Array) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function buildZip(files: Array<{ name: string; data: Uint8Array }>) {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const localHeader: number[] = [];
    pushUint32(localHeader, 0x04034b50);
    pushUint16(localHeader, 20);
    pushUint16(localHeader, 0);
    pushUint16(localHeader, 0);
    pushUint16(localHeader, 0);
    pushUint16(localHeader, 0);
    pushUint32(localHeader, crc);
    pushUint32(localHeader, file.data.length);
    pushUint32(localHeader, file.data.length);
    pushUint16(localHeader, name.length);
    pushUint16(localHeader, 0);
    parts.push(new Uint8Array(localHeader), name, file.data);

    const centralHeader: number[] = [];
    pushUint32(centralHeader, 0x02014b50);
    pushUint16(centralHeader, 20);
    pushUint16(centralHeader, 20);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, 0);
    pushUint32(centralHeader, crc);
    pushUint32(centralHeader, file.data.length);
    pushUint32(centralHeader, file.data.length);
    pushUint16(centralHeader, name.length);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, 0);
    pushUint32(centralHeader, 0);
    pushUint32(centralHeader, offset);
    centralParts.push(new Uint8Array(centralHeader), name);

    offset += localHeader.length + name.length + file.data.length;
  }

  const centralDirectory = concatUint8Arrays(centralParts);
  const endRecord: number[] = [];
  pushUint32(endRecord, 0x06054b50);
  pushUint16(endRecord, 0);
  pushUint16(endRecord, 0);
  pushUint16(endRecord, files.length);
  pushUint16(endRecord, files.length);
  pushUint32(endRecord, centralDirectory.length);
  pushUint32(endRecord, offset);
  pushUint16(endRecord, 0);

  const zipBytes = concatUint8Arrays([
    ...parts,
    centralDirectory,
    new Uint8Array(endRecord),
  ]);
  return new Blob([toArrayBuffer(zipBytes)], {
    type: "application/zip",
  });
}

async function downloadPluginZip(item: CommandMarketItem) {
  if (!item.files?.length) {
    throw new Error("Plugin files are empty");
  }
  const pluginRoot = toBaseName(item.fileName);
  const files = await Promise.all(
    item.files.map(async (file) => {
      const resp = await fetch(`${COMMAND_MARKET_RAW_PREFIX}${file.path}`);
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      return {
        name: `${pluginRoot}/${file.relativePath}`,
        data: new Uint8Array(await resp.arrayBuffer()),
      };
    }),
  );
  return buildZip(files);
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
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
  async loadPiCaptainRelease() {
    try {
      const resp = await fetch(PICAPTAIN_RELEASE_API);
      if (!resp.ok) return null;
      const raw = (await resp.json()) as LatestReleaseApi;
      const release: LatestRelease = {
        tagName: raw.tag_name,
        htmlUrl: raw.html_url,
        assets: raw.assets,
      };
      const version = normalizeVersion(release.tagName);
      const asset = siteActions.pickWindowsAsset(release.assets);
      const downloadPage = release.htmlUrl;
      siteState.picaptainRelease = release;
      siteState.picaptainReleaseVersion = version;
      siteState.picaptainReleasePage = downloadPage;
      if (asset) {
        siteState.picaptainDownloadUrl = resolveMirrorDownloadUrl(
          asset.browser_download_url,
        );
      } else {
        siteState.picaptainDownloadUrl = downloadPage;
      }
      return release;
    } catch {
      return null;
    }
  },
  async copyDeveloperDoc(id: DeveloperDocId) {
    if (siteState.developerDocCopyingId !== null) return;
    siteState.developerDocCopyingId = id;
    siteState.developerDocCopiedId = null;
    siteState.developerDocCopyErrorId = null;
    try {
      const content = await loadDeveloperDoc(id);
      await writeTextToClipboard(content);
      siteState.developerDocCopiedId = id;
      window.setTimeout(() => {
        if (siteState.developerDocCopiedId === id) {
          siteState.developerDocCopiedId = null;
        }
      }, DEVELOPER_DOC_COPIED_VISIBLE_MS);
    } catch {
      siteState.developerDocCopyErrorId = id;
    } finally {
      siteState.developerDocCopyingId = null;
    }
  },
  pickWindowsAsset(assets: ReleaseAsset[]) {
    // 判断当前系统架构，优先选择匹配架构的安装包
    const ua = navigator.userAgent.toLowerCase();
    let arch: "arm64" | "x64" | "" = "";
    const uaData = (navigator as Navigator & { userAgentData?: { architecture?: string } }).userAgentData;
    if (uaData?.architecture) {
      const archRaw = uaData.architecture;
      if (archRaw === "arm64") arch = "arm64";
      else if (archRaw === "x86_64" || archRaw === "x64") arch = "x64";
    } else {
      if (ua.includes("arm64")) arch = "arm64";
      else if (ua.includes("win64") || ua.includes("x64")) arch = "x64";
    }
    if (arch === "arm64") {
      const arm = assets.find(
        (a) => /arm64/i.test(a.name) && a.name.toLowerCase().endsWith(".exe"),
      );
      if (arm) return arm;
    }
    // 默认优先 x64
    const x64 = assets.find(
      (a) =>
        /x64|win64|amd64/i.test(a.name) && a.name.toLowerCase().endsWith(".exe"),
    );
    if (x64) return x64;
    // 兜底找第一个 exe
    return assets.find((a) => a.name.toLowerCase().endsWith(".exe")) ?? null;
  },
  async resolveDownloadUrl() {
    const release =
      siteState.release ?? (await siteActions.loadLatestRelease());
    if (!release) return LATEST_RELEASE_PAGE;
    const asset = siteActions.pickWindowsAsset(release.assets);
    if (!asset) return release.htmlUrl;
    return resolveMirrorDownloadUrl(asset.browser_download_url);
  },
  async loadCommandMarket() {
    siteState.commandMarketLoading = true;
    siteState.commandMarketError = "";
    try {
      const resp = await fetch(COMMAND_MARKET_TREE_API);
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      const raw = (await resp.json()) as GitTreeApi;
      const scriptPaths = raw.tree
        .filter((item) => item.type === "blob" && isRootCommandScript(item.path))
        .map((item) => item.path)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      const pluginFilesByDir = new Map<string, CommandMarketFile[]>();
      raw.tree
        .filter((item) => item.type === "blob" && isCommandPluginFile(item.path))
        .forEach((item) => {
          const pluginDir = getPluginDir(item.path);
          if (!pluginDir) return;
          const files = pluginFilesByDir.get(pluginDir) ?? [];
          files.push({
            path: item.path,
            relativePath: getPendingCommandPath(item.path).slice(pluginDir.length + 1),
          });
          pluginFilesByDir.set(pluginDir, files);
        });

      const items: Array<CommandMarketItem | null> = await Promise.all(
        [
          ...scriptPaths.map(async (scriptPath) => {
            try {
              return await parseCommandScript(scriptPath);
            } catch {
              return null;
            }
          }),
          ...Array.from(pluginFilesByDir.entries()).map(async ([pluginDir, files]) => {
            try {
              files.sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true }));
              return await parseCommandPlugin(pluginDir, files);
            } catch {
              return null;
            }
          }),
        ],
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
        if (item.kind === "plugin") {
          triggerBlobDownload(await downloadPluginZip(item), item.fileName);
          return;
        }
        const resp = await fetch(item.downloadUrl);
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }
        triggerBlobDownload(await resp.blob(), item.fileName);
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
