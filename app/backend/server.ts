import { app } from "electron";
import path from "path";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fs from "fs-extra";
import https from "https";
import http from "http";
import { debounce } from "radash";
import { createSettingsRouter } from "./routes/settings";
import { createCanvasRouter } from "./routes/canvas";
import { createAnchorsRouter } from "./routes/anchors";
import { createTempRouter } from "./routes/temp";
import { lockedFs, withFileLock, withFileLocks } from "./fileLock";
import { getDominantColor } from "./imageAnalysis";

export type RendererChannel =
  | "image-updated"
  | "search-updated"
  | "model-download-progress"
  | "indexing-progress"
  | "toast";
export type SendToRenderer = (channel: RendererChannel, data: unknown) => void;

export const SERVER_PORT = 30001;
const CONFIG_FILE = path.join(app.getPath("userData"), "lookback_config.json");

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

export const getStorageDir = (): string => STORAGE_DIR;

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

const initializeStorage = async () => {
  const root = await loadStorageRoot();
  updateStoragePaths(root);
  settingsCache = null;
  await ensureStorageDirs(STORAGE_DIR);
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
  return withFileLock(dest, () => new Promise((resolve, reject) => {
    if (url.startsWith("file://") || url.startsWith("/")) {
      let srcPath = url;
      if (url.startsWith("file://")) {
        srcPath = new URL(url).pathname;
        if (
          process.platform === "win32" &&
          srcPath.startsWith("/") &&
          srcPath.includes(":")
        ) {
          srcPath = srcPath.substring(1);
        }
      }

      srcPath = decodeURIComponent(srcPath);

      fs.copy(srcPath, dest)
        .then(() => resolve())
        .catch((err) => {
          fs.unlink(dest, () => {});
          reject(err);
        });
      return;
    }

    const file = fs.createWriteStream(dest);
    const client = url.startsWith("https") ? https : http;

    const request = client.get(url, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      } else {
        file.close();
        fs.unlink(dest, () => {});
        reject(
          new Error(
            `Server responded with ${response.statusCode}: ${response.statusMessage}`
          )
        );
      }
    });

    request.on("error", (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });

    file.on("error", (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  }));
}

export async function startServer() {
  await initializeStorage();
  await cleanupCanvasAssets();
  const server = express();
  server.use(cors());
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
    createTempRouter({
      getCanvasAssetsDir,
      downloadImage,
      getDominantColor,
    })
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

  server.listen(SERVER_PORT, () => {
    console.log(`Local server running on port ${SERVER_PORT}`);
  });

  return;
}
