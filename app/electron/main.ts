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
import { autoUpdater } from "electron-updater";
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

import {
  startServer as startApiServer,
  getStorageDir,
  setStorageRoot,
  readSettings,
} from "../backend/server";
import { t as translate } from "../shared/i18n/t";
import type { Locale } from "../shared/i18n/types";
import { debounce } from "radash";

let mainWindow: BrowserWindow | null = null;
let isAppHidden = false;
let lastGalleryDockDelta = 0;
const DEFAULT_TOGGLE_WINDOW_SHORTCUT =
  process.platform === "darwin" ? "Command+L" : "Ctrl+L";
const DEFAULT_TOGGLE_MOUSE_THROUGH_SHORTCUT =
  process.platform === "darwin" ? "Command+T" : "Ctrl+T";

let toggleWindowShortcut = DEFAULT_TOGGLE_WINDOW_SHORTCUT;
let toggleMouseThroughShortcut = DEFAULT_TOGGLE_MOUSE_THROUGH_SHORTCUT;

let isSettingsOpen = false;
let isPinMode: boolean;
let isPinTransparent: boolean;

function syncWindowShadow() {
  if (!mainWindow) return;
  if (process.platform !== "darwin") return;
  const shouldHaveShadow = !(isPinMode && isPinTransparent);
  mainWindow.setHasShadow(shouldHaveShadow);
}

function applyPinStateToWindow() {
  if (!mainWindow) return;
  if (isPinMode) {
    mainWindow.setAlwaysOnTop(true, "floating");
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setVisibleOnAllWorkspaces(false);
  }
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
    localeCache = locale;
    return locale;
  } catch {
    return "en";
  }
}

async function loadShortcuts(): Promise<void> {
  try {
    const settingsPath = path.join(getStorageDir(), "settings.json");
    const settings = await lockedFs.readJson(settingsPath).catch(() => null);
    if (!settings || typeof settings !== "object") return;

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
  } catch {
    // ignore
  }
}

async function loadWindowPinState(): Promise<void> {
  try {
    const settingsPath = path.join(getStorageDir(), "settings.json");
    const settings = await lockedFs.readJson(settingsPath).catch(() => null);
    if (!settings || typeof settings !== "object") return;
    const raw = settings as { pinMode?: unknown; pinTransparent?: unknown };
    if (typeof raw.pinMode === "boolean") {
      isPinMode = raw.pinMode;
    }
    if (typeof raw.pinTransparent === "boolean") {
      isPinTransparent = raw.pinTransparent;
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

function setupAutoUpdater() {
  autoUpdater.logger = log;
  // autoUpdater.logger.transports.file.level = 'info';

  // 自动下载更新
  autoUpdater.autoDownload = true;

  autoUpdater.on("checking-for-update", () => {
    log.info("Checking for update...");
  });

  autoUpdater.on("update-available", (info) => {
    log.info("Update available.", info);
    // 可以在这里通知渲染进程显示更新提示
    if (mainWindow) {
      mainWindow.webContents.send("update-available", info);
    }
  });

  autoUpdater.on("update-not-available", (info) => {
    log.info("Update not available.", info);
  });

  autoUpdater.on("error", (err) => {
    log.error("Error in auto-updater.", err);
  });

  autoUpdater.on("download-progress", (progressObj) => {
    let log_message = "Download speed: " + progressObj.bytesPerSecond;
    log_message = log_message + " - Downloaded " + progressObj.percent + "%";
    log_message =
      log_message +
      " (" +
      progressObj.transferred +
      "/" +
      progressObj.total +
      ")";
    log.info(log_message);
    if (mainWindow) {
      mainWindow.webContents.send("download-progress", progressObj);
    }
  });

  autoUpdater.on("update-downloaded", (info) => {
    log.info("Update downloaded", info);
    // 可以在这里通知渲染进程提示用户重启
    if (mainWindow) {
      mainWindow.webContents.send("update-downloaded", info);
    }
    // 自动安装（可选，或者等待用户触发）
    // autoUpdater.quitAndInstall();
  });

  // 在打包环境下才检查更新
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify();
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
    icon: path.join(__dirname, "../resources/icon.svg"),
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
  });

  mainWindow.on("resize", debouncedSaveWindowBounds);
  mainWindow.on("move", debouncedSaveWindowBounds);

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

  // 初始化自动更新
  setupAutoUpdater();

  ipcMain.on("window-min", () => mainWindow?.minimize());
  ipcMain.on("window-max", () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.on("window-close", () => mainWindow?.close());
  ipcMain.on("window-focus", () => mainWindow?.focus());

  ipcMain.on("toggle-always-on-top", (_event, flag) => {
    if (flag) {
      mainWindow?.setAlwaysOnTop(true, "screen-saver");
      mainWindow?.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
      });
    } else {
      mainWindow?.setAlwaysOnTop(false);
      mainWindow?.setVisibleOnAllWorkspaces(false);
    }
  });

  ipcMain.on(
    "set-pin-mode",
    (
      _event,
      { enabled, widthDelta }: { enabled: boolean; widthDelta: number },
    ) => {
      if (!mainWindow) return;

      const requested = Math.round(widthDelta);
      const shouldResize = Number.isFinite(requested) && requested > 0;

      if (shouldResize) {
        const [w, h] = mainWindow.getSize();
        const [x, y] = mainWindow.getPosition();
        const right = x + w;

        if (enabled) {
          const [minW] = mainWindow.getMinimumSize();
          const nextWidth = Math.max(minW, w - requested);
          const applied = Math.max(0, w - nextWidth);
          lastGalleryDockDelta = applied;

          mainWindow.setBounds({
            x: right - nextWidth,
            y,
            width: nextWidth,
            height: h,
          });
        } else {
          const applied =
            lastGalleryDockDelta > 0 ? lastGalleryDockDelta : requested;
          lastGalleryDockDelta = 0;
          const nextWidth = w + applied;

          mainWindow.setBounds({
            x: right - nextWidth,
            y,
            width: nextWidth,
            height: h,
          });
        }
      }

      isPinMode = enabled;
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
        globalShortcut.register(prev, handler); // Note: we re-register prev with SAME handler
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

async function startServer() {
  return startApiServer();
}

ipcMain.handle("get-storage-dir", async () => {
  return getStorageDir();
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

app.whenReady().then(async () => {
  log.info("App starting...");
  log.info("Log file location:", log.transports.file.getFile().path);
  log.info("App path:", app.getAppPath());
  log.info("User data:", app.getPath("userData"));

  const taskLoadPin = loadWindowPinState();
  const taskLoadShortcuts = loadShortcuts();
  const taskCreateWindow = createWindow();
  // Start server early, but handle errors later
  const taskStartServer = startServer();

  await Promise.all([taskLoadPin, taskLoadShortcuts, taskCreateWindow]);

  applyPinStateToWindow();

  registerToggleWindowShortcut(toggleWindowShortcut);
  registerToggleMouseThroughShortcut(toggleMouseThroughShortcut);
  registerAnchorShortcuts();

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
      createWindow();
      applyPinStateToWindow();
    }
  });
});

ipcMain.handle(
  "set-toggle-window-shortcut",
  async (_event, accelerator: string) => {
    return registerToggleWindowShortcut(accelerator);
  },
);

ipcMain.handle(
  "set-toggle-mouse-through-shortcut",
  async (_event, accelerator: string) => {
    return registerToggleMouseThroughShortcut(accelerator);
  },
);

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
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
// restart trigger 3
