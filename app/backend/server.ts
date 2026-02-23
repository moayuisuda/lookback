import { app, net } from "electron";
import path from "path";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fs from "fs-extra";
import { randomBytes } from "node:crypto";
import { debounce } from "radash";
import { createSettingsRouter } from "./routes/settings";
import { createCanvasRouter } from "./routes/canvas";
import { createAnchorsRouter } from "./routes/anchors";
import { createCommandsRouter } from "./routes/commands";
import { createTempRouter } from "./routes/temp";
import { createShellRouter } from "./routes/shell";
import { lockedFs, withFileLock, withFileLocks } from "./fileLock";
import { calculateTone, getDominantColor } from "./imageAnalysis";
import AdmZip from "adm-zip";

export type RendererChannel =
  | "image-updated"
  | "search-updated"
  | "model-download-progress"
  | "indexing-progress"
  | "toast";
export type SendToRenderer = (channel: RendererChannel, data: unknown) => void;

export const DEFAULT_SERVER_PORT = 30001;
const MAX_SERVER_PORT = 65535;
const CONFIG_FILE = path.join(app.getPath("userData"), "lookback_config.json");
const API_AUTH_TOKEN = randomBytes(32).toString("hex");

const DEFAULT_STORAGE_DIR = path.join(app.getPath("userData"), "lookback_storage");

const loadStorageRoot = async (): Promise<string> => {
  // 1. Try reading from config file in userData
  try {
    if (await lockedFs.pathExists(CONFIG_FILE)) {
      const raw = await lockedFs
        .readJson<{ storageDir?: string }>(CONFIG_FILE)
        .catch(() => null);
      if (raw && typeof raw.storageDir === "string" && raw.storageDir.trim()) {
        return raw.storageDir;
      }
    }
  } catch {
    // ignore and fallback
  }

  // 2. Check if we are packaged and if the installation directory is writable
  if (app.isPackaged && process.platform !== "darwin") {
    try {
      const exeDir = path.dirname(app.getPath("exe"));
      const portableDataDir = path.join(exeDir, "data");

      // If it already exists, use it
      if (await lockedFs.pathExists(portableDataDir)) {
        return portableDataDir;
      }

      // If not, check if we can write to the exe directory
      const testFile = path.join(exeDir, ".write_test");
      const writable = await withFileLock(testFile, async () => {
        try {
          await fs.writeFile(testFile, "test");
          await fs.remove(testFile);
          return true;
        } catch {
          return false;
        }
      });
      if (writable) {
        return portableDataDir;
      }
    } catch {
      // Ignore errors during detection
    }
  }

  // 3. Fallback to default userData storage
  return DEFAULT_STORAGE_DIR;
};

let STORAGE_DIR = DEFAULT_STORAGE_DIR;
let CANVASES_DIR = path.join(STORAGE_DIR, "canvases");
let SETTINGS_FILE = path.join(STORAGE_DIR, "settings.json");
let settingsCache: Record<string, unknown> | null = null;
let storageInitTask: Promise<void> | null = null;

const updateStoragePaths = (root: string) => {
  STORAGE_DIR = root;
  CANVASES_DIR = path.join(STORAGE_DIR, "canvases");
  SETTINGS_FILE = path.join(STORAGE_DIR, "settings.json");
};

const ensureStorageDirs = async (root: string) => {
  await Promise.all([
    lockedFs.ensureDir(root),
    lockedFs.ensureDir(path.join(root, "canvases")),
  ]);
};

import { DEFAULT_COMMAND_FILES } from "../shared/constants";

const ensureDefaultCommands = async () => {
  const commandsDir = path.join(STORAGE_DIR, "commands");
  await lockedFs.ensureDir(commandsDir);
  const sourceDir = path.join(app.getAppPath(), "src", "commands-pending");
  await Promise.all(
    DEFAULT_COMMAND_FILES.map(async (fileName) => {
      const destPath = path.join(commandsDir, fileName);
      const srcPath = path.join(sourceDir, fileName);
      try {
        const content = await lockedFs.readFile(srcPath, "utf-8");
        // 内置命令始终以源码为准，每次启动都覆盖同步，避免旧版本残留。
        await lockedFs.writeFile(destPath, content);
      } catch (error) {
        console.error("Failed to sync default command", fileName, error);
      }
    })
  );
};

export const getStorageDir = (): string => STORAGE_DIR;
export const getApiAuthToken = (): string => API_AUTH_TOKEN;

export const setStorageRoot = async (root: string) => {
  const trimmed = root.trim();
  if (!trimmed) return;

  updateStoragePaths(trimmed);
  settingsCache = null;

  await ensureStorageDirs(STORAGE_DIR);
  await withFileLock(CONFIG_FILE, async () => {
    await fs.writeJson(CONFIG_FILE, { storageDir: STORAGE_DIR });
  });
};

export const readSettings = async (): Promise<Record<string, unknown>> => {
  if (settingsCache) return settingsCache;

  return withFileLock(SETTINGS_FILE, async () => {
    if (!(await fs.pathExists(SETTINGS_FILE))) {
      settingsCache = {};
      return settingsCache;
    }
    try {
      const raw = await fs.readJson(SETTINGS_FILE);
      if (raw && typeof raw === "object") {
        settingsCache = raw as Record<string, unknown>;
        return settingsCache;
      }
    } catch (error) {
      console.error("Failed to read settings file", error);
    }
    settingsCache = {};
    return settingsCache;
  });
};

const persistSettings = debounce({ delay: 500 }, async (settings: Record<string, unknown>) => {
  await withFileLock(SETTINGS_FILE, async () => {
    try {
      await fs.writeJson(SETTINGS_FILE, settings);
    } catch (error) {
      console.error("Failed to write settings file", error);
    }
  });
});

const writeSettings = async (settings: Record<string, unknown>): Promise<void> => {
  settingsCache = settings;
  persistSettings(settings);
};

export const ensureStorageInitialized = async (): Promise<void> => {
  if (storageInitTask) {
    return storageInitTask;
  }
  storageInitTask = (async () => {
    const root = await loadStorageRoot();
    updateStoragePaths(root);
    settingsCache = null;
    await ensureStorageDirs(STORAGE_DIR);
    await ensureDefaultCommands();
  })();
  try {
    await storageInitTask;
  } catch (error) {
    storageInitTask = null;
    throw error;
  }
};

const getCanvasAssetsDir = (canvasName: string): string => {
  const safeName = canvasName.replace(/[/\\:*?"<>|]/g, "_") || "Default";
  return path.join(CANVASES_DIR, safeName, "assets");
};

const cleanupCanvasAssets = async () => {
  const canvasesDir = CANVASES_DIR;
  if (!(await lockedFs.pathExists(canvasesDir))) return;
  const dirs = await lockedFs.readdir(canvasesDir).catch(() => []);
  for (const dir of dirs) {
    const canvasDir = path.join(canvasesDir, dir);
    const stat = await lockedFs.stat(canvasDir).catch(() => null);
    if (!stat || !stat.isDirectory()) continue;
    const canvasJsonPath = path.join(canvasDir, "canvas.json");
    const assetsDir = path.join(canvasDir, "assets");
    const hasCanvas = await lockedFs.pathExists(canvasJsonPath);
    if (!hasCanvas) continue;
    await withFileLocks([canvasJsonPath, assetsDir], async () => {
      let canvasData: unknown = [];
      try {
        canvasData = await fs.readJson(canvasJsonPath);
      } catch {
        return;
      }
      const items = Array.isArray(canvasData) ? canvasData : [];
      const referenced = new Set<string>();
      let changed = false;
      const checks = await Promise.all(items.map(async (item) => {
        if (!item || typeof item !== "object") return false;
        if ("type" in item && item.type === "image") {
          const imagePath =
            typeof (item as { imagePath?: unknown }).imagePath === "string"
              ? (item as { imagePath: string }).imagePath
              : "";
          if (imagePath.startsWith("assets/")) {
            const filename = path.basename(imagePath);
            const fullPath = path.join(assetsDir, filename);
            if (await fs.pathExists(fullPath)) {
              referenced.add(filename);
              return true;
            }
            changed = true;
            return false;
          }
        }
        return true;
      }));
      const nextItems = items.filter((_, index) => checks[index]);

      if (changed) {
        await fs.writeJson(canvasJsonPath, nextItems);
      }

      if (await fs.pathExists(assetsDir)) {
        const files = await fs.readdir(assetsDir).catch(() => []);
        for (const file of files) {
          if (!referenced.has(file)) {
            await fs.unlink(path.join(assetsDir, file)).catch(() => void 0);
          }
        }
      }
    });
  }
};

function downloadImage(url: string, dest: string): Promise<void> {
  const REQUEST_TIMEOUT_MS = 15000;
  const MAX_RETRY_ATTEMPTS = 3;

  const copyFromLocalPath = async (targetUrl: string): Promise<void> => {
    let srcPath = targetUrl;
    if (targetUrl.startsWith("file://")) {
      srcPath = new URL(targetUrl).pathname;
      if (
        process.platform === "win32" &&
        srcPath.startsWith("/") &&
        srcPath.includes(":")
      ) {
        srcPath = srcPath.substring(1);
      }
    }
    await fs.copy(decodeURIComponent(srcPath), dest);
  };

  const isRetryableDownloadError = (error: Error): boolean => {
    const code = (error as NodeJS.ErrnoException).code;
    if (
      code === "ECONNRESET" ||
      code === "ETIMEDOUT" ||
      code === "ECONNABORTED" ||
      code === "EAI_AGAIN" ||
      code === "EPIPE" ||
      code === "ENETUNREACH"
    ) {
      return true;
    }
    return /socket hang up|timeout|network/i.test(error.message);
  };

  const normalizeRemoteUrl = (rawUrl: string): string => {
    try {
      const parsed = new URL(rawUrl);
      // X/Twitter 拖拽经常只给 media path，补齐参数后稳定命中原图。
      if (
        parsed.hostname === "pbs.twimg.com" &&
        parsed.pathname.startsWith("/media/")
      ) {
        if (!parsed.searchParams.has("name")) {
          parsed.searchParams.set("name", "orig");
        }
        if (!parsed.searchParams.has("format")) {
          const ext = path.extname(parsed.pathname).replace(".", "");
          if (ext) {
            parsed.searchParams.set("format", ext);
          }
        }
      }
      return parsed.toString();
    } catch {
      return rawUrl;
    }
  };

  const requestRemoteOnce = async (targetUrl: string): Promise<void> => {
    const referer = (() => {
      try {
        return new URL(targetUrl).origin;
      } catch {
        return "";
      }
    })();

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, REQUEST_TIMEOUT_MS);
    try {
      const response = await net.fetch(targetUrl, {
        method: "GET",
        redirect: "follow",
        signal: abortController.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 LookBack/1.0",
          Accept:
            "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          ...(referer ? { Referer: `${referer}/` } : {}),
          Connection: "close",
        },
      });
      if (!response.ok) {
        throw new Error(
          `Server responded with ${response.status}: ${response.statusText}`
        );
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(dest, buffer);
    } catch (error) {
      void fs.remove(dest).catch(() => void 0);
      if (
        error instanceof Error &&
        (error.name === "AbortError" || /aborted/i.test(error.message))
      ) {
        throw new Error("Download timeout");
      }
      throw error instanceof Error ? error : new Error(String(error));
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const requestRemote = async (targetUrl: string): Promise<void> => {
    const normalizedUrl = normalizeRemoteUrl(targetUrl);
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt += 1) {
      try {
        console.info("[temp][download] attempt", {
          attempt,
          targetUrl: normalizedUrl,
        });
        await requestRemoteOnce(normalizedUrl);
        return;
      } catch (error) {
        const normalized =
          error instanceof Error ? error : new Error(String(error));
        lastError = normalized;
        const shouldRetry =
          attempt < MAX_RETRY_ATTEMPTS &&
          isRetryableDownloadError(normalized);
        if (!shouldRetry) break;
        await new Promise((resolve) => {
          setTimeout(resolve, attempt * 250);
        });
      }
    }
    throw lastError ?? new Error("Download failed");
  };

  if (url.startsWith("file://") || url.startsWith("/")) {
    return copyFromLocalPath(url);
  }
  return requestRemote(url);
}

const listenOnAvailablePort = (
  appServer: express.Express,
  startPort: number
): Promise<number> =>
  new Promise((resolve, reject) => {
    const tryListen = (port: number) => {
      if (port > MAX_SERVER_PORT) {
        reject(new Error("No available localhost port for local server"));
        return;
      }

      const httpServer = appServer.listen(port, () => {
        resolve(port);
      });

      httpServer.once("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "EADDRINUSE") {
          tryListen(port + 1);
          return;
        }
        reject(error);
      });
    };

    tryListen(startPort);
  });

export async function startServer(): Promise<number> {
  await ensureStorageInitialized();
  await cleanupCanvasAssets();
  const server = express();
  server.use(
    cors({
      origin: (origin, callback) => {
        // Electron renderer / non-browser requests typically have no Origin.
        if (!origin) {
          callback(null, true);
          return;
        }
        try {
          const parsed = new URL(origin);
          if (parsed.protocol === "file:") {
            callback(null, true);
            return;
          }
          const isDevRenderer =
            (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") &&
            parsed.port === "5173";
          callback(null, isDevRenderer);
        } catch {
          if (origin === "null") {
            callback(null, true);
            return;
          }
          callback(null, false);
        }
      },
      methods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "x-lookback-token"],
    }),
  );
  server.use(bodyParser.json({ limit: "25mb" }));

  const logErrorToFile = async (
    error: unknown,
    req?: express.Request
  ) => {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    const payload = {
      timestamp: new Date().toISOString(),
      message,
      stack,
      method: req?.method,
      url: req?.originalUrl,
    };
    const logFile = path.join(STORAGE_DIR, "server.log");
    await withFileLock(logFile, async () => {
      await fs.ensureFile(logFile);
      await fs.appendFile(logFile, `${JSON.stringify(payload)}\n`);
    });
  };

  server.use(createSettingsRouter({ readSettings, writeSettings }));
  server.use(
    createCanvasRouter({
      getCanvasesDir: () => CANVASES_DIR,
    })
  );
  server.use(
    createAnchorsRouter({
      getStorageDir: () => STORAGE_DIR,
    })
  );
  server.use(
    createCommandsRouter({
      getStorageDir: () => STORAGE_DIR,
    })
  );
  server.use(
    createTempRouter({
      getCanvasAssetsDir,
      downloadImage,
      getDominantColor,
      getTone: calculateTone,
    })
  );
  server.use(
    createShellRouter({
      getApiAuthToken,
    }),
  );
  server.get("/api/canvas-export", async (req, res) => {
    try {
      const canvasNameRaw = (req.query.canvasName as string) || "Default";
      const safeName = canvasNameRaw.replace(/[/\\:*?"<>|]/g, "_") || "Default";
      const canvasDir = path.join(CANVASES_DIR, safeName);
      const dataFile = path.join(canvasDir, "canvas.json");
      const viewportFile = path.join(canvasDir, "canvas_viewport.json");
      const assetsDir = path.join(canvasDir, "assets");

      const items = await withFileLock(dataFile, async () => {
        if (await fs.pathExists(dataFile)) return fs.readJson(dataFile);
        return [];
      });
      const viewport = await withFileLock(viewportFile, async () => {
        if (await fs.pathExists(viewportFile)) return fs.readJson(viewportFile);
        return null;
      });

      const imageItems = Array.isArray(items)
        ? items.filter((it) => it && typeof it === "object" && it.type === "image")
        : [];
      const referencedFiles = new Set<string>();
      for (const it of imageItems) {
        const p = typeof it.imagePath === "string" ? it.imagePath : "";
        if (p.startsWith("assets/")) {
          const filename = path.basename(p);
          referencedFiles.add(filename);
        }
      }

      const zip = new AdmZip();
      const manifest = {
        version: 1,
        name: safeName,
        timestamp: Date.now(),
        items,
        viewport,
      };
      zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf-8"));

      for (const filename of referencedFiles) {
        const filePath = path.join(assetsDir, filename);
        const exists = await withFileLock(filePath, () => fs.pathExists(filePath));
        if (!exists) continue;
        const data = await fs.readFile(filePath);
        zip.addFile(path.posix.join("assets", filename), data);
      }

      const buf = zip.toBuffer();
      res.setHeader("Content-Type", "application/zip");
      // RFC 5987: filename 只能用 ASCII，中文名通过 filename* 编码传递
      const fullName = `${safeName}.lb`;
      const isAscii = /^[\x20-\x7E]+$/.test(fullName);
      const encodedName = encodeURIComponent(fullName).replace(/'/g, "%27");
      const disposition = isAscii
        ? `attachment; filename="${fullName}"`
        : `attachment; filename="export.lb"; filename*=UTF-8''${encodedName}`;
      res.setHeader("Content-Disposition", disposition);
      res.send(buf);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  server.post(
    "/api/canvas-import",
    express.raw({ type: "application/octet-stream", limit: "500mb" }),
    async (req, res) => {
      try {
        const body = req.body as Buffer;
        if (!Buffer.isBuffer(body) || body.length === 0) {
          res.status(400).json({ error: "Invalid file body" });
          return;
        }
        const zip = new AdmZip(body);
        const entry = zip.getEntry("manifest.json");
        if (!entry) {
          res.status(400).json({ error: "manifest.json missing" });
          return;
        }
        const manifestRaw = entry.getData().toString("utf-8");
        const manifest = JSON.parse(manifestRaw) as {
          version?: number;
          name?: string;
          items?: unknown[];
          viewport?: unknown;
        };
        const desiredName = (manifest.name || "Imported").toString();
        const baseName = desiredName.replace(/[/\\:*?"<>|]/g, "_").trim() || "Imported";

        // Resolve unique canvas dir
        const resolveUniqueCanvasName = async (name: string): Promise<string> => {
          const canvasesDir = CANVASES_DIR;
          await lockedFs.ensureDir(canvasesDir);
          let candidate = name;
          let idx = 1;
          while (await lockedFs.pathExists(path.join(canvasesDir, candidate))) {
            candidate = `${name}_${idx}`;
            idx += 1;
          }
          return candidate;
        };
        const finalName = await resolveUniqueCanvasName(baseName);
        const canvasDir = path.join(CANVASES_DIR, finalName);
        const dataFile = path.join(canvasDir, "canvas.json");
        const viewportFile = path.join(canvasDir, "canvas_viewport.json");
        const assetsDir = path.join(canvasDir, "assets");

        await withFileLocks([canvasDir, assetsDir], async () => {
          await fs.ensureDir(canvasDir);
          await fs.ensureDir(assetsDir);
        });

        // Extract assets/
        const entries = zip.getEntries();
        for (const e of entries) {
          const name = e.entryName;
          if (name.startsWith("assets/") && !e.isDirectory) {
            const filename = path.basename(name);
            const target = path.join(assetsDir, filename);
            await withFileLock(target, async () => {
              // Resolve conflict by appending index
              let candidate = target;
              let idx = 1;
              const parsed = path.parse(target);
              while (await fs.pathExists(candidate)) {
                candidate = path.join(parsed.dir, `${parsed.name}_${idx}${parsed.ext}`);
                idx += 1;
              }
              await fs.writeFile(candidate, e.getData());
            });
          }
        }

        // Write items and viewport
        await withFileLocks([dataFile, viewportFile], async () => {
          const items = Array.isArray(manifest.items) ? manifest.items : [];
          await fs.writeJson(dataFile, items);
          if (manifest.viewport) {
            await fs.writeJson(viewportFile, manifest.viewport);
          }
        });

        res.json({ success: true, name: finalName });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
      }
    }
  );
  server.get("/api/assets/:canvasName/:filename", async (req, res) => {
    const { canvasName, filename } = req.params;
    const safeCanvasDirName = canvasName.replace(/[/\\:*?"<>|]/g, "_") || "Default";
    if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
      res.status(400).send("Invalid filename");
      return;
    }
    const filePath = path.join(
      CANVASES_DIR,
      safeCanvasDirName,
      "assets",
      filename
    );
    if (await fs.pathExists(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).send("Not found");
    }
  });

  server.use(
    (
      err: unknown,
      req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      const message = err instanceof Error ? err.message : String(err);
      void _next;
      void logErrorToFile(err, req);
      res.status(500).json({ error: "Unexpected error", details: message });
    }
  );

  const port = await listenOnAvailablePort(server, DEFAULT_SERVER_PORT);
  console.log(`Local server running on port ${port}`);

  return port;
}
