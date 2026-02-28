import {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  dialog,
  shell,
  globalShortcut,
} from "electron";
import path from "path";
import fs from "fs-extra";
import log from "electron-log";
import { execFile, spawn, ChildProcess } from "node:child_process";
import * as readline from "node:readline";
import { lockedFs, withFileLock } from "../backend/fileLock";

// Ensure app name is correct for log paths
if (!app.isPackaged) {
  // In development, electron might use 'Electron' or 'app' as name
  app.setName("LookBack");
}

Object.assign(console, log.functions);
log.transports.file.level = "info";
// Set max log size to 5MB
log.transports.file.maxSize = 5 * 1024 * 1024;
// Explicitly define archive strategy: keep only one backup file
log.transports.file.archiveLog = (file) => {
  const filePath = file.toString();
  const info = path.parse(filePath);
  const dest = path.join(info.dir, info.name + ".old" + info.ext);

  // Use async lock even though callback is void
  lockedFs.rename(filePath, dest).catch((e) => {
    console.warn("Could not rotate log", e);
  });
};

const logPinDebug = (...args: unknown[]) => {
  log.info("[pin-debug]", ...args);
};

import {
  startServer as startApiServer,
  DEFAULT_SERVER_PORT,
  getApiAuthToken,
  getStorageDir,
  setStorageRoot,
  readSettings,
  ensureStorageInitialized,
} from "../backend/server";
import { t as translate } from "../shared/i18n/t";
import type { Locale } from "../shared/i18n/types";
import { debounce } from "radash";

let mainWindow: BrowserWindow | null = null;
let isAppHidden = false;
const DEFAULT_TOGGLE_WINDOW_SHORTCUT =
  process.platform === "darwin" ? "Command+L" : "Ctrl+L";
const DEFAULT_CANVAS_OPACITY_UP_SHORTCUT =
  process.platform === "darwin" ? "Command+Up" : "Ctrl+Up";
const DEFAULT_CANVAS_OPACITY_DOWN_SHORTCUT =
  process.platform === "darwin" ? "Command+Down" : "Ctrl+Down";
const DEFAULT_TOGGLE_MOUSE_THROUGH_SHORTCUT =
  process.platform === "darwin" ? "Command+T" : "Ctrl+T";

let toggleWindowShortcut = DEFAULT_TOGGLE_WINDOW_SHORTCUT;
let canvasOpacityUpShortcut = DEFAULT_CANVAS_OPACITY_UP_SHORTCUT;
let canvasOpacityDownShortcut = DEFAULT_CANVAS_OPACITY_DOWN_SHORTCUT;
let toggleMouseThroughShortcut = DEFAULT_TOGGLE_MOUSE_THROUGH_SHORTCUT;

let isSettingsOpen = false;
let isPinMode = false;
let pinTargetApp = "";
let isPinTransparent = true;
let activeAppWatcherProcess: ChildProcess | null = null;
let winZOrderHelperProcess: ChildProcess | null = null;
let winZOrderHelperReadline: readline.Interface | null = null;
let winZOrderHelperOurHwnd = "";
const winZOrderPending = new Map<
  string,
  {
    resolve: () => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }
>();
let isPinByAppActive = false;
let localServerPort = DEFAULT_SERVER_PORT;
let localServerStartTask: Promise<number> | null = null;
let isQuitting = false;
let isWindowIpcBound = false;
let hasPendingSecondInstanceRestore = false;
const LOOKBACK_PROTOCOL_SCHEME = "lookback";
const LOOKBACK_IMPORT_HOST = "import-command";
const LOOKBACK_IMPORT_QUERY_KEY = "url";
const SUPPORTED_COMMAND_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);
const DEEP_LINK_DOWNLOAD_TIMEOUT_MS = 15000;
const pendingDeepLinkUrls: string[] = [];

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

app.on("second-instance", (_event, argv) => {
  if (!hasSingleInstanceLock) return;
  const deepLinkUrls = argv.filter(
    (arg) =>
      typeof arg === "string" &&
      arg.toLowerCase().startsWith(`${LOOKBACK_PROTOCOL_SCHEME}://`),
  );
  if (deepLinkUrls.length > 0) {
    pendingDeepLinkUrls.push(...deepLinkUrls);
  }
  const restoreOrCreateWindow = () => {
    if (!mainWindow) {
      void createWindow().then(() => {
        applyPinStateToWindow();
        registerGlobalShortcuts();
        void flushPendingDeepLinks();
      });
      return;
    }
    restoreMainWindowVisibility();
    void flushPendingDeepLinks();
  };
  if (!app.isReady()) {
    if (hasPendingSecondInstanceRestore) return;
    hasPendingSecondInstanceRestore = true;
    app.once("ready", () => {
      hasPendingSecondInstanceRestore = false;
      restoreOrCreateWindow();
    });
    return;
  }
  restoreOrCreateWindow();
});

app.on("open-url", (event, url) => {
  event.preventDefault();
  if (typeof url !== "string") return;
  pendingDeepLinkUrls.push(url);
  if (app.isReady()) {
    void flushPendingDeepLinks();
  }
});

pendingDeepLinkUrls.push(
  ...process.argv.filter(
    (arg) =>
      typeof arg === "string" &&
      arg.toLowerCase().startsWith(`${LOOKBACK_PROTOCOL_SCHEME}://`),
  ),
);

function requestAppQuit() {
  // 统一退出入口，避免重复触发 app.quit 导致生命周期逻辑重复执行。
  if (isQuitting) return;
  isQuitting = true;
  app.quit();
}

function registerLookBackProtocol() {
  // 开发态避免把协议错误绑定到裸 Electron，可执行导向会触发 Electron 欢迎页。
  // 协议注册交给打包应用处理（build.protocols + 运行时 setAsDefaultProtocolClient）。
  if (!app.isPackaged) return;
  app.setAsDefaultProtocolClient(LOOKBACK_PROTOCOL_SCHEME);
}

function toCommandFileName(targetUrl: URL) {
  const baseName = path.basename(targetUrl.pathname || "");
  const decodedBaseName = decodeURIComponent(baseName || "").trim();
  const fallback = `command_${Date.now()}.jsx`;
  const rawName = decodedBaseName || fallback;
  const sanitized = rawName.replace(/[<>:"/\\|?*]/g, "_");
  const ext = path.extname(sanitized).toLowerCase();
  if (!SUPPORTED_COMMAND_EXTENSIONS.has(ext)) {
    throw new Error("Unsupported command file extension");
  }
  return sanitized;
}

async function importCommandFromRemoteUrl(remoteUrl: string) {
  const parsed = new URL(remoteUrl);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Unsupported URL protocol");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, DEEP_LINK_DOWNLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(parsed.toString(), {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const content = await response.text();
    if (!content.includes("export const config")) {
      throw new Error("Invalid command script");
    }

    await ensureStorageInitialized();
    const fileName = toCommandFileName(parsed);
    const commandsDir = path.join(getStorageDir(), "commands");
    await lockedFs.ensureDir(commandsDir);
    const destPath = path.join(commandsDir, fileName);
    await lockedFs.writeFile(destPath, content, "utf-8");
    return destPath;
  } finally {
    clearTimeout(timeout);
  }
}

function emitImportToastSuccess() {
  mainWindow?.webContents.send("toast", {
    key: "toast.importSuccess",
    type: "success",
  });
}

function emitImportToastFailed(errorMessage: string) {
  mainWindow?.webContents.send("toast", {
    key: "toast.importFailed",
    type: "error",
    params: { error: errorMessage },
  });
}

function resolveDeepLinkImportUrl(rawUrl: string) {
  const deepLink = new URL(rawUrl);
  if (deepLink.protocol !== `${LOOKBACK_PROTOCOL_SCHEME}:`) return "";
  if (deepLink.hostname !== LOOKBACK_IMPORT_HOST) return "";
  return deepLink.searchParams.get(LOOKBACK_IMPORT_QUERY_KEY)?.trim() || "";
}

async function handleDeepLink(rawUrl: string) {
  const importUrl = resolveDeepLinkImportUrl(rawUrl);
  if (!importUrl) return;
  try {
    await importCommandFromRemoteUrl(importUrl);
    restoreMainWindowVisibility();
    emitImportToastSuccess();
    mainWindow?.webContents.send("renderer-event", "command-imported");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    restoreMainWindowVisibility();
    emitImportToastFailed(message);
  }
}

async function flushPendingDeepLinks() {
  if (!app.isReady()) return;
  if (pendingDeepLinkUrls.length === 0) return;
  const queue = [...pendingDeepLinkUrls];
  pendingDeepLinkUrls.length = 0;
  for (const rawUrl of queue) {
    await handleDeepLink(rawUrl);
  }
}

function normalizeAppIdentifier(name: string): string {
  return name.trim().toLowerCase();
}

type AlwaysOnTopLevel = Parameters<BrowserWindow["setAlwaysOnTop"]>[1];

function getPinAlwaysOnTopLevel(): AlwaysOnTopLevel {
  // Windows / macOS 统一使用 floating，对应 Win32 的 HWND_TOPMOST。
  // 之前使用 screen-saver 导致取消置顶后 Z-order 无法及时刷新。
  return "floating";
}

function setWindowAlwaysOnTop(enabled: boolean) {
  if (!mainWindow) return;
  if (enabled) {
    mainWindow.setAlwaysOnTop(true, getPinAlwaysOnTopLevel());
    return;
  }
  mainWindow.setAlwaysOnTop(false);
}

function getOurHwndForPowerShell(): string {
  if (!mainWindow) return "";
  const buf = mainWindow.getNativeWindowHandle();
  if (buf.length >= 8) return buf.readBigUInt64LE(0).toString();
  if (buf.length >= 4) return buf.readUInt32LE(0).toString();
  return "";
}

function setWindowPinnedToDesktop(enabled: boolean) {
  if (!mainWindow) return;
  if (enabled) {
    setWindowAlwaysOnTop(true);
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    return;
  }
  setWindowAlwaysOnTop(false);
  mainWindow.setVisibleOnAllWorkspaces(false);
}

function setWindowPinnedToTargetApp(active: boolean) {
  if (!mainWindow) return;
  logPinDebug("setWindowPinnedToTargetApp", { active });
  setWindowAlwaysOnTop(active);
  mainWindow.setVisibleOnAllWorkspaces(false);
}

function runAppleScript(script: string, timeoutMs = 1500): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "osascript",
      ["-e", script],
      { timeout: timeoutMs },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr?.trim() || error.message));
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
}

function runPowerShell(script: string, timeoutMs = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
      ],
      { timeout: timeoutMs, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr?.trim() || error.message));
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
}

async function getRunningAppNames(): Promise<string[]> {
  if (process.platform !== "darwin" && process.platform !== "win32") return [];
  let output = "";
  try {
    if (process.platform === "darwin") {
      output = await runAppleScript(
        'tell application "System Events" to get name of every process whose background only is false',
        15000,
      );
      logPinDebug("running apps raw (darwin)", output);
    } else {
      output = await runPowerShell(
        [
          `Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.Id -ne ${process.pid} }`,
          "| Select-Object -ExpandProperty ProcessName",
          "| Sort-Object -Unique",
        ].join(" "),
        8000,
      );
      logPinDebug("running apps raw (win32)", output);
    }
  } catch (error) {
    logPinDebug("getRunningAppNames failed", error);
    throw error;
  }
  const selfName = normalizeAppIdentifier(app.getName());
  const names = output
    .split(/,|\n/)
    .map((name) => name.trim())
    .filter((name) => name && normalizeAppIdentifier(name) !== selfName);
  const unique = [...new Set(names)].sort((a, b) => a.localeCompare(b));
  logPinDebug("running apps parsed", unique);
  return unique;
}

function stopPinByAppWatcher() {
  if (activeAppWatcherProcess) {
    activeAppWatcherProcess.kill();
    activeAppWatcherProcess = null;
  }
  isPinByAppActive = false;
}

function stopWinZOrderHelper() {
  if (winZOrderHelperReadline) {
    winZOrderHelperReadline.removeAllListeners();
    winZOrderHelperReadline.close();
    winZOrderHelperReadline = null;
  }

  if (winZOrderHelperProcess) {
    winZOrderHelperProcess.kill();
    winZOrderHelperProcess = null;
  }

  winZOrderHelperOurHwnd = "";
  for (const [, pending] of winZOrderPending) {
    clearTimeout(pending.timeout);
    pending.reject(new Error("Z-order helper stopped"));
  }
  winZOrderPending.clear();
}

function ensureWinZOrderHelper() {
  if (process.platform !== "win32") return;
  const ourHwnd = getOurHwndForPowerShell();
  if (!ourHwnd) return;

  if (winZOrderHelperProcess && winZOrderHelperOurHwnd === ourHwnd) return;
  stopWinZOrderHelper();

  winZOrderHelperOurHwnd = ourHwnd;

  const script = [
    '$sig = @"',
    "using System;",
    "using System.Runtime.InteropServices;",
    "public static class WinTools {",
    '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
    '  [DllImport("user32.dll", SetLastError=true)] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);',
    "}",
    '"@; Add-Type -TypeDefinition $sig -ErrorAction SilentlyContinue | Out-Null;',
    `$ourHwnd = [IntPtr]${ourHwnd};`,
    "$SWP_NOSIZE = 0x0001;",
    "$SWP_NOMOVE = 0x0002;",
    "$SWP_NOACTIVATE = 0x0010;",
    "$SWP_ASYNCWINDOWPOS = 0x4000;",
    "$flags = $SWP_NOSIZE -bor $SWP_NOMOVE -bor $SWP_NOACTIVATE -bor $SWP_ASYNCWINDOWPOS;",
    "$HWND_NOTOPMOST = [IntPtr](-2);",
    "while ($true) {",
    "  $line = [Console]::ReadLine();",
    "  if ($null -eq $line) { break }",
    "  $line = $line.Trim();",
    "  if ($line -eq '') { continue }",
    "  $parts = $line.Split(':', 2);",
    "  $cmd = $parts[0];",
    "  $id = if ($parts.Length -gt 1) { $parts[1] } else { '' };",
    "  if ($cmd -eq 'set-below-foreground') {",
    "    $fg = [WinTools]::GetForegroundWindow();",
    "    if ($fg -ne [IntPtr]::Zero -and $fg -ne $ourHwnd) {",
    "      [WinTools]::SetWindowPos($ourHwnd, $HWND_NOTOPMOST, 0, 0, 0, 0, $flags) | Out-Null;",
    "      [WinTools]::SetWindowPos($ourHwnd, $fg, 0, 0, 0, 0, $flags) | Out-Null;",
    "    }",
    "    if ($id -ne '') { [Console]::WriteLine('ack:' + $id) }",
    "    continue",
    "  }",
    "  if ($id -ne '') { [Console]::WriteLine('ack:' + $id) }",
    "}",
  ].join("\n");

  winZOrderHelperProcess = spawn(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script,
    ],
    { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
  );

  if (winZOrderHelperProcess.stderr) {
    winZOrderHelperProcess.stderr.on("data", (chunk) => {
      const message = String(chunk ?? "").trim();
      if (message) logPinDebug("WinZOrder helper stderr", message);
    });
  }

  winZOrderHelperReadline = readline.createInterface({
    input: winZOrderHelperProcess.stdout!,
    terminal: false,
  });

  winZOrderHelperReadline.on("line", (line) => {
    const text = line.trim();
    if (!text.startsWith("ack:")) return;
    const id = text.slice("ack:".length).trim();
    const pending = winZOrderPending.get(id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    winZOrderPending.delete(id);
    pending.resolve();
  });

  const rejectAll = (reason: string) => {
    for (const [, pending] of winZOrderPending) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(reason));
    }
    winZOrderPending.clear();
  };

  winZOrderHelperProcess.on("error", (error) => {
    logPinDebug("WinZOrder helper error", error);
    rejectAll("Z-order helper error");
    stopWinZOrderHelper();
  });

  winZOrderHelperProcess.on("exit", (code) => {
    logPinDebug("WinZOrder helper exited", code);
    rejectAll("Z-order helper exited");
    stopWinZOrderHelper();
  });
}

function sendWinZOrderCommand(
  command: "set-below-foreground",
  timeoutMs = 800,
) {
  if (process.platform !== "win32") return Promise.resolve();
  ensureWinZOrderHelper();
  const proc = winZOrderHelperProcess;
  if (!proc || !proc.stdin) return Promise.resolve();

  const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      winZOrderPending.delete(id);
      reject(new Error("Z-order helper timeout"));
    }, timeoutMs);
    winZOrderPending.set(id, { resolve, reject, timeout });
    proc.stdin.write(`${command}:${id}\n`);
  });
}

async function setToCurrentActiveBottom() {
  if (process.platform !== "win32") return;
  if (!mainWindow) return;
  try {
    await sendWinZOrderCommand("set-below-foreground", 800);
  } catch (error) {
    logPinDebug("setToCurrentActiveBottom failed", error);
  }
}

let isWinPreIsTarget = false;
function startPinByAppWatcherWin32() {
  const ourHwnd = getOurHwndForPowerShell();
  if (!ourHwnd) return;

  logPinDebug("startPinByAppWatcherWin32 start", { pinTargetApp });

  const script = [
    '$sig = @"',
    "using System;",
    "using System.Runtime.InteropServices;",
    "public static class WinTools {",
    '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
    '  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);',
    "}",
    '"@; Add-Type -TypeDefinition $sig -ErrorAction SilentlyContinue | Out-Null;',
    `$ourHwnd = [IntPtr]${ourHwnd};`,
    "$lastName = '';",
    "while ($true) {",
    "  $fgHwnd = [WinTools]::GetForegroundWindow();",
    "  if ($fgHwnd -ne [IntPtr]::Zero) {",
    "    [uint32]$procId = 0;",
    "    [WinTools]::GetWindowThreadProcessId($fgHwnd, [ref]$procId) | Out-Null;",
    "    $name = '';",
    "    if ($procId -ne 0) {",
    "      $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue;",
    "      if ($null -ne $proc) {",
    "        $name = $proc.ProcessName;",
    "      }",
    "    }",
    "    if ($name -ne '' -and $name -ne $lastName) {",
    "      $lastName = $name;",
    "      [Console]::WriteLine($name);",
    "    }",
    "  }",
    "  Start-Sleep -Milliseconds 100",
    "}",
  ].join("\n");

  activeAppWatcherProcess = spawn(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script,
    ],
    { windowsHide: true },
  );

  const rl = readline.createInterface({
    input: activeAppWatcherProcess.stdout!,
    terminal: false,
  });

  rl.on("line", (line) => {
    const activeAppName = line.trim();
    if (!activeAppName || !mainWindow) return;

    const isTarget =
      normalizeAppIdentifier(activeAppName) ===
      normalizeAppIdentifier(pinTargetApp);

    if (isTarget !== isPinByAppActive) {
      isPinByAppActive = isTarget;
      syncWindowShadow();
    }

    const isOurApp =
      normalizeAppIdentifier(activeAppName) ===
      normalizeAppIdentifier(app.getName());

    console.log(
      normalizeAppIdentifier(activeAppName),
      normalizeAppIdentifier(app.getName()),
    );

    if (isTarget) {
      console.log("set to top");
      mainWindow.setAlwaysOnTop(true, getPinAlwaysOnTopLevel());
      // 这里直接设置 false，在 win 上多次点击会有 bug
    } else {
      if (!isOurApp) {
        console.log("set setAlwaysOnTop to false");
        mainWindow.setAlwaysOnTop(false);
      }
    }

    if (isWinPreIsTarget === true && isTarget === false && !isOurApp) {
      console.log("set to current active bottom");
      void setToCurrentActiveBottom();
    }

    isWinPreIsTarget = isTarget;
  });

  const resetState = () => {
    if (isPinByAppActive) {
      isPinByAppActive = false;
      if (mainWindow) {
        mainWindow.setAlwaysOnTop(false);
        mainWindow.setVisibleOnAllWorkspaces(false);
      }
      syncWindowShadow();
    }
  };

  activeAppWatcherProcess.on("error", (error) => {
    logPinDebug("Win32 watcher error", error);
    resetState();
  });

  activeAppWatcherProcess.on("exit", (code) => {
    logPinDebug("Win32 watcher exited", code);
    resetState();
  });
}

function startPinByAppWatcherDarwin() {
  logPinDebug("startPinByAppWatcherDarwin start", { pinTargetApp });

  const script = [
    "repeat",
    "  try",
    '    tell application "System Events" to set frontApp to name of first process whose frontmost is true',
    "    log frontApp",
    "  end try",
    "  delay 0.08",
    "end repeat",
  ].join("\n");

  activeAppWatcherProcess = spawn("osascript", ["-e", script]);

  const rl = readline.createInterface({
    input: activeAppWatcherProcess.stderr!,
    terminal: false,
  });

  rl.on("line", (line) => {
    const activeAppName = line.trim();
    if (!activeAppName || !mainWindow) return;

    const shouldPin =
      normalizeAppIdentifier(activeAppName) ===
      normalizeAppIdentifier(pinTargetApp);

    if (shouldPin === isPinByAppActive) return;

    isPinByAppActive = shouldPin;
    syncWindowShadow();

    if (shouldPin) {
      // 目标 app 进入前台：持续置顶并在所有工作区可见（含全屏）
      mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      mainWindow.setAlwaysOnTop(true, getPinAlwaysOnTopLevel());
    } else {
      // 目标 app 离开前台：取消置顶
      mainWindow.setAlwaysOnTop(false);
      mainWindow.setVisibleOnAllWorkspaces(false);
    }
  });

  const resetState = () => {
    if (isPinByAppActive) {
      isPinByAppActive = false;
      if (mainWindow) {
        mainWindow.setAlwaysOnTop(false);
        mainWindow.setVisibleOnAllWorkspaces(false);
      }
      syncWindowShadow();
    }
  };

  activeAppWatcherProcess.on("error", (error) => {
    logPinDebug("Darwin watcher error", error);
    resetState();
  });

  activeAppWatcherProcess.on("exit", (code) => {
    logPinDebug("Darwin watcher exited", code);
    resetState();
  });
}

function startPinByAppWatcher() {
  stopPinByAppWatcher();
  if (!pinTargetApp) return;
  if (process.platform !== "darwin" && process.platform !== "win32") return;
  setWindowPinnedToTargetApp(false);
  syncWindowShadow();

  if (process.platform === "win32") {
    startPinByAppWatcherWin32();
  } else if (process.platform === "darwin") {
    startPinByAppWatcherDarwin();
  }
}

function syncWindowShadow() {
  if (!mainWindow) return;
  if (process.platform !== "darwin") return;
  const shouldHaveShadow = !(isPinMode && isPinTransparent);
  mainWindow.setHasShadow(shouldHaveShadow);
}

function applyPinStateToWindow() {
  if (!mainWindow) {
    logPinDebug("applyPinStateToWindow skipped: no mainWindow");
    return;
  }
  stopPinByAppWatcher();
  logPinDebug("applyPinStateToWindow state", {
    isPinMode,
    pinTargetApp,
    platform: process.platform,
  });

  if (!isPinMode) {
    setWindowPinnedToDesktop(false);
    syncWindowShadow();
    return;
  }

  if (
    pinTargetApp &&
    (process.platform === "darwin" || process.platform === "win32")
  ) {
    logPinDebug("applyPinStateToWindow start watcher", {
      pinTargetApp,
    });
    startPinByAppWatcher();
    return;
  }

  logPinDebug("applyPinStateToWindow desktop mode");
  setWindowPinnedToDesktop(true);
  syncWindowShadow();
}

const isLocale = (value: unknown): value is Locale =>
  value === "en" || value === "zh";

async function getLocale(): Promise<Locale> {
  try {
    const settings = await readSettings();
    const raw =
      settings && typeof settings === "object"
        ? (settings as { language?: unknown }).language
        : undefined;
    const locale = isLocale(raw) ? raw : "en";
    return locale;
  } catch {
    return "en";
  }
}

async function loadShortcuts(): Promise<void> {
  try {
    const settings = await readSettings();

    const rawToggle = (settings as Record<string, unknown>)
      .toggleWindowShortcut;
    if (typeof rawToggle === "string" && rawToggle.trim()) {
      toggleWindowShortcut = rawToggle.trim();
    }

    const rawMouseThrough = (settings as Record<string, unknown>)
      .toggleMouseThroughShortcut;
    if (typeof rawMouseThrough === "string" && rawMouseThrough.trim()) {
      toggleMouseThroughShortcut = rawMouseThrough.trim();
    }

    const rawOpacityUp = (settings as Record<string, unknown>)
      .canvasOpacityUpShortcut;
    if (typeof rawOpacityUp === "string" && rawOpacityUp.trim()) {
      canvasOpacityUpShortcut = rawOpacityUp.trim();
    }

    const rawOpacityDown = (settings as Record<string, unknown>)
      .canvasOpacityDownShortcut;
    if (typeof rawOpacityDown === "string" && rawOpacityDown.trim()) {
      canvasOpacityDownShortcut = rawOpacityDown.trim();
    }
  } catch {
    // ignore
  }
}

async function loadWindowPinState(): Promise<void> {
  try {
    const raw = (await readSettings()) as {
      pinMode?: unknown;
      pinTransparent?: unknown;
      pinTargetApp?: unknown;
    };
    if (typeof raw.pinMode === "boolean") {
      isPinMode = raw.pinMode;
    }
    if (typeof raw.pinTargetApp === "string") {
      pinTargetApp = raw.pinTargetApp.trim();
    }
    if (typeof raw.pinTransparent === "boolean") {
      isPinTransparent = raw.pinTransparent;
    }
    if (!isPinMode) {
      pinTargetApp = "";
    }
  } catch {
    // ignore
  }
}

function loadMainWindow() {
  if (!mainWindow) return;
  if (!app.isPackaged) {
    log.info("Loading renderer from localhost");
    void mainWindow.loadURL("http://localhost:5173");
  } else {
    const filePath = path.join(__dirname, "../dist-renderer/index.html");
    log.info("Loading renderer from file:", filePath);
    void mainWindow.loadFile(filePath);
  }
}

async function saveWindowBounds() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized() || mainWindow.isMaximized()) return;
  try {
    const bounds = mainWindow.getBounds();
    const settingsPath = path.join(getStorageDir(), "settings.json");
    const settings = (await lockedFs
      .readJson(settingsPath)
      .catch(() => ({}))) as object;

    await lockedFs.writeJson(settingsPath, {
      ...settings,
      windowBounds: bounds,
    });
  } catch (e) {
    log.error("Failed to save window bounds", e);
  }
}

const debouncedSaveWindowBounds = debounce({ delay: 1000 }, saveWindowBounds);

async function createWindow(options?: { load?: boolean }) {
  log.info("Creating main window...");
  log.info("Storage dir for window state:", getStorageDir());
  isAppHidden = false;
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  let windowState: Partial<Electron.Rectangle> = {};
  try {
    const settingsPath = path.join(getStorageDir(), "settings.json");
    if (await lockedFs.pathExists(settingsPath)) {
      const settingsRaw = await lockedFs.readJson(settingsPath);
      if (settingsRaw && typeof settingsRaw === "object") {
        const settings = settingsRaw as {
          windowBounds?: Electron.Rectangle;
        };
        if (settings.windowBounds) {
          windowState = settings.windowBounds;
        }
      }
    }
  } catch (e) {
    log.error("Failed to load window bounds", e);
  }

  mainWindow = new BrowserWindow({
    width: windowState.width || Math.floor(width * 0.6),
    height: windowState.height || Math.floor(height * 0.8),
    x: windowState.x,
    y: windowState.y,
    icon: path.join(__dirname, "../resources/icon.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: false,
    hasShadow: true,
    // 延迟显示：等置顶属性设置完毕后再决定 show/showInactive，
    // 避免 macOS 在置顶模式下创建窗口时激活 app 导致退出全屏 Space。
    show: false,
  });

  mainWindow.on("resize", debouncedSaveWindowBounds);
  mainWindow.on("move", debouncedSaveWindowBounds);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.on("did-finish-load", () => {
    log.info("Renderer process finished loading");
  });

  // Open DevTools in development
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.webContents.on(
    "did-fail-load",
    (event, errorCode, errorDescription, validatedURL) => {
      log.error(
        "Renderer process failed to load:",
        errorCode,
        errorDescription,
        validatedURL,
      );
    },
  );

  mainWindow.webContents.on("render-process-gone", (event, details) => {
    log.error("Renderer process gone:", details.reason, details.exitCode);
  });

  if (options?.load !== false) {
    loadMainWindow();
  }

  if (!isWindowIpcBound) {
    isWindowIpcBound = true;

    ipcMain.on("window-min", () => mainWindow?.minimize());
    ipcMain.on("window-max", () => {
      if (mainWindow?.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow?.maximize();
      }
    });
    ipcMain.on("window-close", () => requestAppQuit());
    ipcMain.on("window-focus", () => mainWindow?.focus());

    ipcMain.on("toggle-always-on-top", (_event, flag) => {
      if (flag) {
        setWindowAlwaysOnTop(true);
        mainWindow?.setVisibleOnAllWorkspaces(true, {
          visibleOnFullScreen: true,
        });
      } else {
        setWindowAlwaysOnTop(false);
        mainWindow?.setVisibleOnAllWorkspaces(false);
      }
    });

    ipcMain.on(
      "set-pin-mode",
      (_event, payload: { enabled: boolean; targetApp?: string }) => {
        logPinDebug("ipc set-pin-mode", payload);
        const enabled = payload?.enabled === true;
        const targetApp =
          typeof payload?.targetApp === "string"
            ? payload.targetApp.trim()
            : "";
        isPinMode = enabled;
        pinTargetApp = enabled ? targetApp : "";
        logPinDebug("ipc set-pin-mode resolved", {
          isPinMode,
          pinTargetApp,
          platform: process.platform,
        });
        applyPinStateToWindow();
      },
    );

    ipcMain.on("set-pin-transparent", (_event, enabled: boolean) => {
      if (!mainWindow) return;
      isPinTransparent = enabled;
      syncWindowShadow();
    });

    ipcMain.on("resize-window-by", (_event, deltaWidth) => {
      if (!mainWindow) return;
      const [w, h] = mainWindow.getSize();
      const [x, y] = mainWindow.getPosition();
      mainWindow.setBounds({
        x: x - Math.round(deltaWidth),
        y: y,
        width: w + Math.round(deltaWidth),
        height: h,
      });
    });

    ipcMain.on(
      "set-window-bounds",
      (_event, bounds: Partial<Electron.Rectangle>) => {
        if (!mainWindow) return;
        const current = mainWindow.getBounds();
        mainWindow.setBounds({
          x: bounds.x ?? current.x,
          y: bounds.y ?? current.y,
          width: bounds.width ?? current.width,
          height: bounds.height ?? current.height,
        });
      },
    );

    ipcMain.on("log-message", (_event, level: string, ...args: unknown[]) => {
      if (typeof log[level as keyof typeof log] === "function") {
        // @ts-expect-error dynamic log level access
        log[level](...args);
      } else {
        log.info(...args);
      }
    });

    ipcMain.handle("get-log-content", async () => {
      try {
        const logPath = log.transports.file.getFile().path;
        if (await lockedFs.pathExists(logPath)) {
          // Read last 50KB or so to avoid reading huge files
          const stats = await lockedFs.stat(logPath);
          const size = stats.size;
          const READ_SIZE = 50 * 1024; // 50KB
          const start = Math.max(0, size - READ_SIZE);

          return await withFileLock(logPath, () => {
            return new Promise<string>((resolve, reject) => {
              const stream = fs.createReadStream(logPath, {
                start,
                encoding: "utf8",
              });
              const chunks: string[] = [];
              stream.on("data", (chunk) => chunks.push(chunk.toString()));
              stream.on("end", () => resolve(chunks.join("")));
              stream.on("error", reject);
            });
          });
        }
        return "No log file found.";
      } catch (error) {
        log.error("Failed to read log file:", error);
        return `Failed to read log file: ${error instanceof Error ? error.message : String(error)}`;
      }
    });

    ipcMain.handle("open-external", async (_event, rawUrl: string) => {
      try {
        if (typeof rawUrl !== "string") {
          return { success: false, error: "Invalid URL" };
        }
        const url = new URL(rawUrl);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          return { success: false, error: "Unsupported URL protocol" };
        }
        await shell.openExternal(url.toString());
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    ipcMain.handle("list-running-apps", async () => {
      try {
        if (process.platform !== "darwin" && process.platform !== "win32") {
          return { success: true, apps: [] as string[] };
        }
        const apps = await getRunningAppNames();
        return { success: true, apps };
      } catch (error) {
        return {
          success: false,
          apps: [] as string[],
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
  }
}

function toggleMainWindowVisibility() {
  if (!mainWindow) return;

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
    isAppHidden = false;
    mainWindow.setIgnoreMouseEvents(false);
    mainWindow.webContents.send("renderer-event", "app-visibility", true);
    mainWindow.focus();
    return;
  }

  if (isAppHidden) {
    isAppHidden = false;
    mainWindow.setIgnoreMouseEvents(false);
    mainWindow.webContents.send("renderer-event", "app-visibility", true);
    mainWindow.show();
    mainWindow.focus();
  } else {
    isAppHidden = true;
    mainWindow.setIgnoreMouseEvents(true, { forward: false });
    mainWindow.webContents.send("renderer-event", "app-visibility", false);
  }
}

function restoreMainWindowVisibility() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  if (isAppHidden) {
    isAppHidden = false;
    mainWindow.setIgnoreMouseEvents(false);
    mainWindow.webContents.send("renderer-event", "app-visibility", true);
  }
  // 置顶模式下用 showInactive，不激活 app，避免 macOS 退出全屏 Space。
  if (isPinMode) {
    mainWindow.showInactive();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

function registerShortcut(
  accelerator: string,
  currentVar: string,
  updateVar: (val: string) => void,
  action: () => void,
  checkSettingsOpen: boolean = false,
): { success: boolean; error?: string; accelerator: string } {
  const next = typeof accelerator === "string" ? accelerator.trim() : "";
  if (!next) {
    return { success: false, error: "Empty shortcut", accelerator: currentVar };
  }

  const prev = currentVar;

  // Create a handler wrapper to check for settings open
  const handler = () => {
    if (checkSettingsOpen && isSettingsOpen && mainWindow?.isFocused()) {
      return;
    }
    action();
  };

  try {
    // If the new shortcut is different from old one, unregister old one
    if (prev !== next) {
      globalShortcut.unregister(prev);
    } else {
      // If same, we still might need to re-register to update handler if logic changed (unlikely here but safe)
      globalShortcut.unregister(prev);
    }

    const ok = globalShortcut.register(next, handler);
    if (!ok) {
      // If failed, try to restore old one
      if (prev !== next) {
        globalShortcut.unregister(next);
        globalShortcut.register(prev, handler);
      }
      return {
        success: false,
        error: "Shortcut registration failed",
        accelerator: prev,
      };
    }
    updateVar(next);
    return { success: true, accelerator: next };
  } catch (e) {
    if (prev !== next) {
      globalShortcut.unregister(next);
      globalShortcut.register(prev, handler);
    }
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
      accelerator: prev,
    };
  }
}

function registerToggleWindowShortcut(accelerator: string) {
  return registerShortcut(
    accelerator,
    toggleWindowShortcut,
    (v) => {
      toggleWindowShortcut = v;
    },
    toggleMainWindowVisibility,
    true,
  );
}

function registerToggleMouseThroughShortcut(accelerator: string) {
  return registerShortcut(
    accelerator,
    toggleMouseThroughShortcut,
    (v) => {
      toggleMouseThroughShortcut = v;
    },
    () => {
      mainWindow?.webContents.send("renderer-event", "toggle-mouse-through");
    },
  );
}

function registerCanvasOpacityUpShortcut(accelerator: string) {
  return registerShortcut(
    accelerator,
    canvasOpacityUpShortcut,
    (v) => {
      canvasOpacityUpShortcut = v;
    },
    () => {
      mainWindow?.webContents.send(
        "renderer-event",
        "adjust-canvas-opacity",
        0.05,
      );
    },
    true,
  );
}

function registerCanvasOpacityDownShortcut(accelerator: string) {
  return registerShortcut(
    accelerator,
    canvasOpacityDownShortcut,
    (v) => {
      canvasOpacityDownShortcut = v;
    },
    () => {
      mainWindow?.webContents.send(
        "renderer-event",
        "adjust-canvas-opacity",
        -0.05,
      );
    },
    true,
  );
}

function registerAnchorShortcuts() {
  const anchors = ["1", "2", "3"];
  anchors.forEach((key) => {
    // Restore: Cmd+Key / Ctrl+Key
    const restoreAccel =
      process.platform === "darwin" ? `Command+${key}` : `Ctrl+${key}`;
    globalShortcut.register(restoreAccel, () => {
      mainWindow?.webContents.send("renderer-event", "restore-anchor", key);
    });

    // Save: Cmd+Shift+Key / Ctrl+Shift+Key
    // Note: Cmd+Shift+3 is a system screenshot shortcut on macOS, it might be intercepted by system.
    const saveAccel =
      process.platform === "darwin"
        ? `Command+Shift+${key}`
        : `Ctrl+Shift+${key}`;
    globalShortcut.register(saveAccel, () => {
      mainWindow?.webContents.send("renderer-event", "save-anchor", key);
    });
  });
}

function registerGlobalShortcuts() {
  registerToggleWindowShortcut(toggleWindowShortcut);
  registerCanvasOpacityUpShortcut(canvasOpacityUpShortcut);
  registerCanvasOpacityDownShortcut(canvasOpacityDownShortcut);
  registerToggleMouseThroughShortcut(toggleMouseThroughShortcut);
  registerAnchorShortcuts();
}

function unregisterGlobalShortcuts() {
  globalShortcut.unregisterAll();
}

async function startServer() {
  if (!localServerStartTask) {
    localServerStartTask = startApiServer().then((port) => {
      localServerPort = port;
      return port;
    });
  }
  return localServerStartTask;
}

ipcMain.handle("get-storage-dir", async () => {
  return getStorageDir();
});

ipcMain.handle("get-server-port", async () => {
  if (localServerStartTask) {
    return localServerStartTask;
  }
  return localServerPort;
});

ipcMain.handle("get-api-auth-token", async () => {
  return getApiAuthToken();
});

ipcMain.handle("get-app-version", async () => {
  return app.getVersion();
});

ipcMain.handle("choose-storage-dir", async () => {
  const locale = await getLocale();
  const result = await dialog.showOpenDialog({
    title: translate(locale, "dialog.chooseStorageFolderTitle"),
    properties: ["openDirectory", "createDirectory"],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const dir = result.filePaths[0];
  await setStorageRoot(dir);
  app.relaunch();
  app.exit(0);
});

ipcMain.handle(
  "save-image-file",
  async (
    _event,
    { dataUrl, defaultName }: { dataUrl: string; defaultName?: string },
  ) => {
    try {
      if (typeof dataUrl !== "string") {
        return { success: false, error: "Invalid data" };
      }
      const match = dataUrl.match(/^data:image\/png;base64,(.+)$/);
      if (!match) {
        return { success: false, error: "Invalid data" };
      }
      const locale = await getLocale();
      const fallbackName = `stitched_${Date.now()}.png`;
      const safeName =
        typeof defaultName === "string" && defaultName.trim()
          ? defaultName.trim()
          : fallbackName;
      const result = await dialog.showSaveDialog({
        title: translate(locale, "dialog.saveImageTitle"),
        defaultPath: path.join(getStorageDir(), safeName),
        filters: [{ name: "PNG", extensions: ["png"] }],
      });
      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true };
      }
      let filePath = result.filePath;
      if (!filePath.toLowerCase().endsWith(".png")) {
        filePath += ".png";
      }
      const buffer = Buffer.from(match[1], "base64");
      await fs.outputFile(filePath, buffer);
      return { success: true, path: filePath };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
);

app.whenReady().then(async () => {
  log.info("App starting...");
  log.info("Log file location:", log.transports.file.getFile().path);
  log.info("App path:", app.getAppPath());
  log.info("User data:", app.getPath("userData"));
  registerLookBackProtocol();

  const taskInitStorage = ensureStorageInitialized();

  // Wait for storage to be initialized before creating window or starting server
  try {
    await taskInitStorage;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error("Failed to initialize storage before loading settings:", message);
  }

  const taskCreateWindow = createWindow();
  // Start server early, but handle errors later
  const taskStartServer = startServer();

  const taskLoadPin = loadWindowPinState();
  const taskLoadShortcuts = loadShortcuts();
  await Promise.all([taskLoadPin, taskLoadShortcuts, taskCreateWindow]);

  applyPinStateToWindow();
  // 置顶模式下用 showInactive 显示窗口，不激活 app，避免 macOS 退出全屏 Space。
  // 非置顶模式正常 show() 激活窗口。
  if (isPinMode) {
    mainWindow?.showInactive();
  } else {
    mainWindow?.show();
  }
  await flushPendingDeepLinks();

  registerGlobalShortcuts();

  if (mainWindow) {
    try {
      await taskStartServer;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[model] ensure failed:", message);
      log.error("[model] ensure failed:", message);
      // app.quit();
      // return;
    }
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().then(() => {
        applyPinStateToWindow();
        registerGlobalShortcuts();
      });
      return;
    }
    restoreMainWindowVisibility();
  });
});

ipcMain.handle(
  "set-toggle-window-shortcut",
  async (_event, accelerator: string) => {
    return registerToggleWindowShortcut(accelerator);
  },
);

ipcMain.handle(
  "set-canvas-opacity-up-shortcut",
  async (_event, accelerator: string) => {
    return registerCanvasOpacityUpShortcut(accelerator);
  },
);

ipcMain.handle(
  "set-canvas-opacity-down-shortcut",
  async (_event, accelerator: string) => {
    return registerCanvasOpacityDownShortcut(accelerator);
  },
);

ipcMain.handle(
  "set-toggle-mouse-through-shortcut",
  async (_event, accelerator: string) => {
    return registerToggleMouseThroughShortcut(accelerator);
  },
);

ipcMain.handle("import-command", async () => {
  const locale = await getLocale();
  const result = await dialog.showOpenDialog({
    title: translate(locale, "dialog.importCommandTitle"),
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "JavaScript/TypeScript", extensions: ["js", "jsx", "ts", "tsx"] },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, canceled: true };
  }

  const destDir = path.join(getStorageDir(), "commands");
  await fs.ensureDir(destDir);

  const results = [];
  for (const srcPath of result.filePaths) {
    const fileName = path.basename(srcPath);
    const destPath = path.join(destDir, fileName);
    try {
      await fs.copy(srcPath, destPath);
      results.push({ success: true, path: destPath });
    } catch (e) {
      results.push({
        success: false,
        error: e instanceof Error ? e.message : String(e),
        path: srcPath,
      });
    }
  }

  const failures = results.filter((r) => !r.success);
  if (failures.length > 0) {
    return {
      success: false,
      error: `Failed to import ${failures.length} files. First error: ${failures[0].error}`,
      partialSuccess: results.length - failures.length > 0,
    };
  }

  return { success: true, count: results.length };
});

ipcMain.on(
  "set-ignore-mouse-events",
  (_event, ignore: boolean, options?: { forward: boolean }) => {
    if (mainWindow) {
      mainWindow.setIgnoreMouseEvents(ignore, options);
    }
  },
);

ipcMain.on("settings-open-changed", (_event, open: boolean) => {
  isSettingsOpen = Boolean(open);
});

app.on("will-quit", () => {
  stopPinByAppWatcher();
  stopWinZOrderHelper();
  unregisterGlobalShortcuts();
});

app.on("window-all-closed", () => {
  stopPinByAppWatcher();
  stopWinZOrderHelper();
  unregisterGlobalShortcuts();
  requestAppQuit();
});
// restart trigger 3
