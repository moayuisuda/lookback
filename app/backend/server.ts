import { app } from "electron";
import path from "path";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fs from "fs-extra";
import https from "https";
import http from "http";
import { spawn, ChildProcess } from "child_process";
import readline from "readline";
import { createDatabase, StorageIncompatibleError, type ImageDb } from "./db";
import { debounce } from "radash";
import { createImagesRouter } from "./routes/images";
import { createTagsRouter } from "./routes/tags";
import { createSettingsRouter } from "./routes/settings";
import { createCanvasRouter } from "./routes/canvas";
import { createAnchorsRouter } from "./routes/anchors";
import { createTempRouter } from "./routes/temp";
import { createModelRouter } from "./routes/model";
import { lockedFs, withFileLock } from "./fileLock";

export type RendererChannel =
  | "new-collection"
  | "image-updated"
  | "search-updated"
  | "model-download-progress"
  | "indexing-progress"
  | "env-init-progress"
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
  // If so, default to using a "data" folder next to the executable
  // Skip on macOS to avoid modifying signed app bundles
  if (app.isPackaged && process.platform !== "darwin") {
    try {
      const exeDir = path.dirname(app.getPath("exe"));
      const portableDataDir = path.join(exeDir, "data");
      
      // If it already exists, use it
      if (await lockedFs.pathExists(portableDataDir)) {
        return portableDataDir;
      }

      // If not, check if we can write to the exe directory
      // We try to write a temporary file
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
let IMAGE_DIR = path.join(STORAGE_DIR, "images");
let CANVAS_TEMP_DIR = path.join(STORAGE_DIR, "canvas_temp");
let CANVASES_DIR = path.join(STORAGE_DIR, "canvases");
let SETTINGS_FILE = path.join(STORAGE_DIR, "settings.json");
let settingsCache: Record<string, unknown> | null = null;

const updateStoragePaths = (root: string) => {
  STORAGE_DIR = root;
  IMAGE_DIR = path.join(STORAGE_DIR, "images");
  CANVAS_TEMP_DIR = path.join(STORAGE_DIR, "canvas_temp");
  CANVASES_DIR = path.join(STORAGE_DIR, "canvases");
  SETTINGS_FILE = path.join(STORAGE_DIR, "settings.json");
};

const ensureStorageDirs = async (root: string) => {
  await Promise.all([
    lockedFs.ensureDir(root),
    lockedFs.ensureDir(path.join(root, "images")),
    lockedFs.ensureDir(path.join(root, "model")),
    lockedFs.ensureDir(path.join(root, "canvas_temp")),
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
  initDatabase();
};

const readSettings = async (): Promise<Record<string, unknown>> => {
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

let imageDb: ImageDb | null = null;
let incompatibleError: StorageIncompatibleError | null = null;
let dbHandle: { close: () => void } | null = null;

const initDatabase = () => {
  const result = createDatabase(STORAGE_DIR);
  incompatibleError = result.incompatibleError;
  imageDb = result.imageDb;
  if (dbHandle && dbHandle !== result.db) {
    dbHandle.close();
  }
  dbHandle = result.db;
};

const initializeStorage = async () => {
  const root = await loadStorageRoot();
  updateStoragePaths(root);
  settingsCache = null;
  await ensureStorageDirs(STORAGE_DIR);
  initDatabase();
};

class PythonMetaService {
  private process: ChildProcess | null = null;
  private queue: {
    resolve: (val: unknown) => void;
    reject: (err: Error) => void;
  }[] = [];

  private getUvCandidates(): string[] {
    const candidates: string[] = [];

    // 1. Try bundled UV (High priority)
    if (app.isPackaged) {
      if (process.platform === "win32") {
        candidates.push(path.join(process.resourcesPath, "bin", "uv.exe"));
      } else if (process.platform === "darwin") {
        candidates.push(
          path.join(
            process.resourcesPath,
            "bin",
            "mac",
            "arm64",
            "uv"
          )
        );
      }
    } else {
      if (process.platform === "win32") {
        candidates.push(path.join(app.getAppPath(), "bin", "win32", "uv.exe"));
      } else if (process.platform === "darwin") {
        candidates.push(
          path.join(
            app.getAppPath(),
            "bin",
            "mac",
            "arm64",
            "uv"
          )
        );
      }
    }

    const env = process.env.PROREF_UV_PATH?.trim();
    if (env) candidates.push(env);

    const home = process.env.HOME?.trim();
    if (home) {
      const versions = ["3.14", "3.13", "3.12", "3.11", "3.10"];
      for (const v of versions) {
        candidates.push(path.join(home, "Library", "Python", v, "bin", "uv"));
      }
      candidates.push(path.join(home, ".local", "bin", "uv"));
    }

    candidates.push("/opt/homebrew/bin/uv", "/usr/local/bin/uv", "uv");

    const uniq: string[] = [];
    const seen = new Set<string>();
    for (const c of candidates) {
      if (!c) continue;
      if (seen.has(c)) continue;
      seen.add(c);
      uniq.push(c);
    }
    return uniq;
  }

  private attachProcess(proc: ChildProcess) {
    if (!proc.stdout) {
      console.error("Failed to spawn python process stdout");
      return;
    }

    const rl = readline.createInterface({ input: proc.stdout });

    rl.on("line", (line: string) => {
      const task = this.queue.shift();
      if (task) {
        try {
          const res = JSON.parse(line) as unknown;
          task.resolve(res);
        } catch (e) {
          console.error("JSON parse error from python:", e);
          task.resolve({ error: "invalid-json" });
        }
      }
    });

    proc.stderr?.on("data", (data: Buffer) => {
      const output = data.toString();
      const lines = output.split(/\r?\n/).filter((l) => l.trim().length > 0);

      for (const line of lines) {
        if (
          line.startsWith("[INFO]") ||
          line.includes("Python vector service started") ||
          line.includes("Model loaded")
        ) {
          console.log("[Python Service]", line.replace("[INFO]", "").trim());
        } else {
          console.error("[Python Error]", line);
        }
      }
    });

    proc.on("exit", (code: number) => {
      console.log("Python process exited with code", code);
      const pending = this.queue.splice(0, this.queue.length);
      for (const task of pending) {
        task.resolve(null);
      }
      if (this.process === proc) {
        this.process = null;
      }
      rl.close();
    });
  }

  private spawnProcess(
    command: string,
    args: string[],
    cwd: string
  ): ChildProcess {
    const env = {
      ...process.env,
      PROREF_MODEL_DIR: path.join(getStorageDir(), "model"),
      // Use Aliyun mirror for PyPI (often more stable/accessible)
      UV_INDEX_URL: "https://mirrors.aliyun.com/pypi/simple/",
      // Also set PIP_INDEX_URL as fallback/standard
      PIP_INDEX_URL: "https://mirrors.aliyun.com/pypi/simple/",
      // Use HF mirror for model downloads
      HF_ENDPOINT: "https://hf-mirror.com",
    };

    const proc = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      cwd,
      env,
    });
    this.attachProcess(proc);
    return proc;
  }

  start() {
    if (this.process) return;
    let scriptPath = path.join(__dirname, "../backend/python/tagger.py");
    if (app.isPackaged) {
      scriptPath = scriptPath.replace("app.asar", "app.asar.unpacked");
    }
    const pythonDir = path.dirname(scriptPath);

    const uvArgs = ["run", "python", scriptPath];
    const uvCandidates = this.getUvCandidates();

    const trySpawn = async (index: number) => {
      if (index >= uvCandidates.length) {
        console.error("Failed to spawn python vector service: uv not found");
        this.process = null;
        return;
      }

      const command = uvCandidates[index];
      if (path.isAbsolute(command)) {
        const exists = await lockedFs.pathExists(command);
        if (!exists) {
          await trySpawn(index + 1);
          return;
        }
      }

      const proc = this.spawnProcess(command, uvArgs, pythonDir);
      this.process = proc;
      proc.once("error", (err) => {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          if (this.process === proc) {
            this.process = null;
          }
          trySpawn(index + 1);
          return;
        }
        console.error("Failed to spawn python vector service", err);
        if (this.process === proc) {
          this.process = null;
        }
      });
    };

    void trySpawn(0);
  }

  downloadModel(onProgress: (data: unknown) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      let scriptPath = path.join(__dirname, "../backend/python/tagger.py");
      if (app.isPackaged) {
        scriptPath = scriptPath.replace("app.asar", "app.asar.unpacked");
      }
      const pythonDir = path.dirname(scriptPath);

      const uvArgs = ["run", "python", scriptPath, "--download-model"];
      const uvCandidates = this.getUvCandidates();

      const trySpawn = async (index: number) => {
        if (index >= uvCandidates.length) {
          reject(new Error("Failed to spawn python service: uv not found"));
          return;
        }

        const command = uvCandidates[index];
        if (path.isAbsolute(command)) {
          const exists = await lockedFs.pathExists(command);
          if (!exists) {
            await trySpawn(index + 1);
            return;
          }
        }

        const env = {
          ...process.env,
          PROREF_MODEL_DIR: path.join(getStorageDir(), "model"),
          UV_INDEX_URL: "https://mirrors.aliyun.com/pypi/simple/",
          PIP_INDEX_URL: "https://mirrors.aliyun.com/pypi/simple/",
          HF_ENDPOINT: "https://hf-mirror.com",
        };

        const proc = spawn(command, uvArgs, {
          stdio: ["pipe", "pipe", "pipe"],
          cwd: pythonDir,
          env,
        });

        if (proc.stdout) {
          const rl = readline.createInterface({ input: proc.stdout });
          rl.on("line", (line: string) => {
            try {
              const res = JSON.parse(line);
              onProgress(res);
            } catch {
              // ignore non-json output
            }
          });
        }
        
        proc.stderr?.on("data", (data: Buffer) => {
          console.log("[Python Download]", data.toString());
        });

        proc.on("exit", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Download process exited with code ${code}`));
          }
        });

        proc.on("error", (err) => {
          const code = (err as NodeJS.ErrnoException).code;
          if (code === "ENOENT") {
            void trySpawn(index + 1);
            return;
          }
          reject(err);
        });
      };

      void trySpawn(0);
    });
  }

  async run(
    mode: "encode-image" | "encode-text",
    arg: string
  ): Promise<number[] | null> {
    if (!this.process) {
      this.start();
    }
    const raw = await new Promise<unknown>((resolve, reject) => {
      this.queue.push({ resolve, reject });
      if (this.process?.stdin) {
        this.process.stdin.write(JSON.stringify({ mode, arg }) + "\n");
      } else {
        resolve({ error: "stdin-unavailable" });
      }
    });

    if (!raw || typeof raw !== "object") {
      throw new Error("Invalid vector response");
    }
    const res = raw as { vector?: unknown; error?: unknown };
    if (res.error) {
      throw new Error(`Python error: ${String(res.error)}`);
    }
    if (Array.isArray(res.vector)) {
      const vector = res.vector as number[];
      return vector;
    }
    throw new Error("Vector missing");
  }

  async runDominantColor(arg: string): Promise<string | null> {
    if (!this.process) {
      this.start();
    }
    const raw = await new Promise<unknown>((resolve, reject) => {
      this.queue.push({ resolve, reject });
      if (this.process?.stdin) {
        console.log(
          "Sending dominant-color request:",
          JSON.stringify({ mode: "dominant-color", arg })
        );
        this.process.stdin.write(
          JSON.stringify({ mode: "dominant-color", arg }) + "\n"
        );
      } else {
        resolve({ error: "stdin-unavailable" });
      }
    });

    if (!raw || typeof raw !== "object") return null;
    const res = raw as { dominantColor?: unknown; error?: unknown };
    if (res.error) return null;
    if (typeof res.dominantColor === "string" && res.dominantColor.trim()) {
      return res.dominantColor.trim();
    }
    return null;
  }

  async runTone(arg: string): Promise<string | null> {
    if (!this.process) {
      this.start();
    }
    const raw = await new Promise<unknown>((resolve, reject) => {
      this.queue.push({ resolve, reject });
      if (this.process?.stdin) {
        // console.log(
        //   "Sending calculate-tone request:",
        //   JSON.stringify({ mode: "calculate-tone", arg })
        // );
        this.process.stdin.write(
          JSON.stringify({ mode: "calculate-tone", arg }) + "\n"
        );
      } else {
        resolve({ error: "stdin-unavailable" });
      }
    });

    if (!raw || typeof raw !== "object") return null;
    const res = raw as { tone?: unknown; error?: unknown };
    if (res.error) return null;
    if (typeof res.tone === "string" && res.tone.trim()) {
      return res.tone.trim();
    }
    return null;
  }
}

const mapModelDownloadProgress = (data: unknown): unknown => {
  if (!data || typeof data !== "object") return data;
  const d = data as Record<string, unknown>;
  const type = d.type;
  if (type === "error") {
    return { type: "error", reason: typeof d.message === "string" ? d.message : String(d.message ?? "") };
  }
  if (type === "weight-failed") {
    return {
      type: "weight-failed",
      filename: typeof d.filename === "string" ? d.filename : undefined,
      reason: typeof d.message === "string" ? d.message : String(d.message ?? ""),
    };
  }
  if (type === "retry") {
    return {
      type: "retry",
      filename: typeof d.filename === "string" ? d.filename : undefined,
      reason: typeof d.message === "string" ? d.message : String(d.message ?? ""),
      attempt: typeof d.attempt === "number" ? d.attempt : undefined,
      nextWaitSeconds: typeof d.nextWaitSeconds === "number" ? d.nextWaitSeconds : undefined,
    };
  }
  return data;
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

export async function startServer(sendToRenderer?: SendToRenderer) {
  await initializeStorage();
  const server = express();
  server.use(cors());
  server.use(bodyParser.json({ limit: "25mb" }));

  const vectorService = new PythonMetaService();
  vectorService.start();

  const runPythonVector = async (
    mode: "encode-image" | "encode-text",
    arg: string
  ) => {
    return vectorService.run(mode, arg);
  };

  const runPythonDominantColor = async (arg: string) => {
    return vectorService.runDominantColor(arg);
  };

  const runPythonTone = async (arg: string) => {
    return vectorService.runTone(arg);
  };

  const sendRenderer = sendToRenderer;

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

  const getImageDb = () => {
    if (!imageDb) {
      initDatabase();
    }
    if (!imageDb) {
      throw new Error("Database is not initialized");
    }
    return imageDb;
  };

  server.use(createSettingsRouter({ readSettings, writeSettings }));
  server.use(
    createCanvasRouter({
      getCanvasesDir: () => CANVASES_DIR,
      getCanvasTempDir: () => CANVAS_TEMP_DIR,
    })
  );
  server.use(
    createAnchorsRouter({
      getStorageDir: () => STORAGE_DIR,
    })
  );
  server.use(
    createTempRouter({
      getCanvasTempDir: () => CANVAS_TEMP_DIR,
      downloadImage,
      runPythonDominantColor,
    })
  );
  server.use(
    createModelRouter({
      downloadModel: (onProgress) =>
        vectorService.downloadModel((data) => {
          onProgress(mapModelDownloadProgress(data));
        }),
      sendToRenderer: sendRenderer,
    })
  );
  server.use(
    createTagsRouter({
      getImageDb,
      getIncompatibleError: () => incompatibleError,
      readSettings,
      writeSettings,
    })
  );
  server.use(
    createImagesRouter({
      getImageDb,
      getIncompatibleError: () => incompatibleError,
      getStorageDir: () => STORAGE_DIR,
      getImageDir: () => IMAGE_DIR,
      readSettings,
      writeSettings,
      runPythonVector,
      runPythonDominantColor,
      runPythonTone,
      downloadImage,
      sendToRenderer: sendRenderer,
    })
  );

  server.use("/images", express.static(STORAGE_DIR));
  server.use("/temp-images", express.static(CANVAS_TEMP_DIR));

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
