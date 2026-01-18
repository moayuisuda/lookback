import { app, shell } from "electron";
import path from "path";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fs from "fs-extra";
import https from "https";
import http from "http";
import crypto from "crypto";
import { spawn, ChildProcess } from "child_process";
import readline from "readline";
import type { I18nKey, I18nParams } from "../shared/i18n/types";

type DiskImageMeta = {
  image: string;
  pageUrl?: string;
  tags?: unknown;
  createdAt: number;
  vector?: number[] | null;
  dominantColor?: string | null;
  tone?: string | null;
};

type StoredImageMeta = {
  image: string;
  pageUrl?: string;
  tags: string[];
  createdAt: number;
  vector?: number[] | null;
  dominantColor?: string | null;
  tone?: string | null;
};

type SearchResult = StoredImageMeta & {
  score: number;
  matchedType: string;
};

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

const loadStorageRoot = (): string => {
  try {
    if (fs.pathExistsSync(CONFIG_FILE)) {
      const raw = fs.readJsonSync(CONFIG_FILE) as { storageDir?: string };
      if (raw && typeof raw.storageDir === "string" && raw.storageDir.trim()) {
        return raw.storageDir;
      }
    }
  } catch {
    // ignore and fallback
  }
  return path.join(app.getPath("userData"), "lookback_storage");
};

let STORAGE_DIR = loadStorageRoot();
let META_DIR = path.join(STORAGE_DIR, "meta");
let IMAGE_DIR = path.join(STORAGE_DIR, "images");
let CANVAS_TEMP_DIR = path.join(STORAGE_DIR, "canvas_temp");
let CANVASES_DIR = path.join(STORAGE_DIR, "canvases");
let GALLERY_ORDER_FILE = path.join(STORAGE_DIR, "gallery_order.json");
let SETTINGS_FILE = path.join(STORAGE_DIR, "settings.json");

const ensureStorageDirs = (root: string) => {
  fs.ensureDirSync(root);
  fs.ensureDirSync(path.join(root, "meta"));
  fs.ensureDirSync(path.join(root, "images"));
  fs.ensureDirSync(path.join(root, "model"));
  fs.ensureDirSync(path.join(root, "canvas_temp"));
  fs.ensureDirSync(path.join(root, "canvases"));
};

export const getStorageDir = (): string => STORAGE_DIR;

export const setStorageRoot = async (root: string) => {
  const trimmed = root.trim();
  if (!trimmed) return;

  STORAGE_DIR = trimmed;
  META_DIR = path.join(STORAGE_DIR, "meta");
  IMAGE_DIR = path.join(STORAGE_DIR, "images");
  CANVAS_TEMP_DIR = path.join(STORAGE_DIR, "canvas_temp");
  CANVASES_DIR = path.join(STORAGE_DIR, "canvases");
  GALLERY_ORDER_FILE = path.join(STORAGE_DIR, "gallery_order.json");
  SETTINGS_FILE = path.join(STORAGE_DIR, "settings.json");

  ensureStorageDirs(STORAGE_DIR);
  await fs.writeJson(CONFIG_FILE, { storageDir: STORAGE_DIR });
};

const readSettings = async (): Promise<Record<string, unknown>> => {
  if (!(await fs.pathExists(SETTINGS_FILE))) {
    return {};
  }
  try {
    const raw = await fs.readJson(SETTINGS_FILE);
    if (raw && typeof raw === "object") {
      return raw as Record<string, unknown>;
    }
  } catch (error) {
    console.error("Failed to read settings file", error);
  }
  return {};
};

const writeSettings = async (settings: Record<string, unknown>): Promise<void> => {
  try {
    await fs.writeJson(SETTINGS_FILE, settings);
  } catch (error) {
    console.error("Failed to write settings file", error);
  }
};

ensureStorageDirs(STORAGE_DIR);

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

    const trySpawn = (index: number) => {
      if (index >= uvCandidates.length) {
        console.error("Failed to spawn python vector service: uv not found");
        this.process = null;
        return;
      }

      const command = uvCandidates[index];
      if (path.isAbsolute(command) && !fs.pathExistsSync(command)) {
        trySpawn(index + 1);
        return;
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

    trySpawn(0);
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

      const trySpawn = (index: number) => {
        if (index >= uvCandidates.length) {
          reject(new Error("Failed to spawn python service: uv not found"));
          return;
        }

        const command = uvCandidates[index];
      if (path.isAbsolute(command) && !fs.pathExistsSync(command)) {
        trySpawn(index + 1);
        return;
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
             trySpawn(index + 1);
             return;
           }
           reject(err);
        });
      };

      trySpawn(0);
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

    if (!raw || typeof raw !== "object") return null;
    const res = raw as { vector?: unknown; error?: unknown };
    if (res.error) return null;
    if (Array.isArray(res.vector)) return res.vector as number[];
    return null;
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

class KeyedMutex {
  private chains = new Map<string, Promise<void>>();

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const currentChain = this.chains.get(key) || Promise.resolve();

    const nextPromise = currentChain.then(
      () => fn(),
      () => fn()
    );

    const storedPromise = nextPromise.then(
      () => {},
      () => {}
    );
    this.chains.set(key, storedPromise);

    // Cleanup
    storedPromise.then(() => {
      if (this.chains.get(key) === storedPromise) {
        this.chains.delete(key);
      }
    });

    return nextPromise;
  }
}

function downloadImage(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
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
  });
}

const YOUDAO_API_ENDPOINT = "https://openapi.youdao.com/api";
const YOUDAO_APP_KEY = "6cd66a17b06e2f25";
const YOUDAO_APP_SECRET = "JFkAkZrB9UtVXfx2qmcThkkQHEV9CO3U";

function buildYoudaoSignInput(q: string): string {
  if (q.length <= 20) return q;
  const head = q.slice(0, 10);
  const tail = q.slice(-10);
  return `${head}${q.length}${tail}`;
}

function buildYoudaoSign(
  q: string,
  salt: string,
  curtime: string,
  appKey: string,
  appSecret: string
): string {
  const input = buildYoudaoSignInput(q);
  const raw = `${appKey}${input}${salt}${curtime}${appSecret}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

async function translateToEnglish(
  text: string
): Promise<{ text: string; warning?: string }> {
  const trimmed = text.trim();
  if (!trimmed) return { text };

  const appKey = YOUDAO_APP_KEY;
  const appSecret = YOUDAO_APP_SECRET;

  if (!appKey || !appSecret) {
    console.warn("Youdao translation credentials are not configured");
    return { text };
  }

  try {
    const salt = crypto.randomUUID();
    const curtime = Math.floor(Date.now() / 1000).toString();
    const sign = buildYoudaoSign(trimmed, salt, curtime, appKey, appSecret);

    const params = new URLSearchParams();
    params.set("q", trimmed);
    params.set("from", "auto");
    params.set("to", "en");
    params.set("appKey", appKey);
    params.set("salt", salt);
    params.set("sign", sign);
    params.set("signType", "v3");
    params.set("curtime", curtime);

    const res = await fetch(YOUDAO_API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!res.ok) {
      console.error(
        "Youdao translation HTTP error",
        res.status,
        res.statusText
      );
      return { text };
    }

    const data = (await res.json()) as unknown;
    if (
      data &&
      typeof data === "object" &&
      "errorCode" in data
    ) {
      const errorCode = (data as { errorCode?: unknown }).errorCode;
      if (errorCode === "0") {
        const translations = (data as { translation?: unknown }).translation;
        if (Array.isArray(translations) && typeof translations[0] === "string") {
          const translated = (translations[0] as string).trim();
          if (translated) {
            console.log("query translated via Youdao", translated);
            return { text: translated };
          }
        }
      } else if (errorCode === "411") {
        console.warn("Youdao translation rate limited (411), falling back to original text");
        return {
          text,
          warning: "Translation rate limited (411), using original text",
        };
      } else {
        console.error("Youdao translation unexpected response", data);
        return {
          text,
          warning: `Translation failed (Code: ${errorCode || "unknown"}), using original text`,
        };
      }
    } else {
      console.error("Youdao translation unexpected response", data);
      return {
        text,
        warning: "Translation unexpected response, using original text",
      };
    }

    return { text };
  } catch (e) {
    console.error("Youdao translation failed", e);
    return {
      text,
      warning: "Translation failed (Network/Error), using original text",
    };
  }
}

export async function startServer(sendToRenderer?: SendToRenderer) {
  const server = express();
  server.use(cors());
  server.use(bodyParser.json({ limit: "25mb" }));

  const metaMutex = new KeyedMutex();

  class StorageIncompatibleError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "StorageIncompatibleError";
    }
  }

  const getCanvasPaths = (name: string) => {
    const safeName = name.replace(/[/\\:*?"<>|]/g, "_") || "Default";
    const dir = path.join(CANVASES_DIR, safeName);
    return {
      dir,
      dataFile: path.join(dir, "canvas.json"),
      viewportFile: path.join(dir, "canvas_viewport.json"),
    };
  };

  const ensureDefaultCanvas = async () => {
    const defaultCanvasPath = path.join(CANVASES_DIR, "Default");
    const canvases = await fs.readdir(CANVASES_DIR).catch(() => []);
    if (canvases.length === 0) {
      await fs.ensureDir(defaultCanvasPath);
    }
  };
  await ensureDefaultCanvas();

  server.get("/api/canvases", async (_req, res) => {
    try {
      const dirs = await fs.readdir(CANVASES_DIR);
      const canvases: { name: string; lastModified: number }[] = [];
      for (const dir of dirs) {
        const fullPath = path.join(CANVASES_DIR, dir);
        try {
          const stat = await fs.stat(fullPath);
          if (stat.isDirectory()) {
            canvases.push({ name: dir, lastModified: stat.mtimeMs });
          }
        } catch {
          // ignore
        }
      }
      res.json(canvases.sort((a, b) => b.lastModified - a.lastModified));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  server.post("/api/canvases", async (req, res) => {
    try {
      const { name } = req.body as { name?: string };
      if (!name || !name.trim()) {
        res.status(400).json({ error: "Canvas name is required" });
        return;
      }
      const paths = getCanvasPaths(name);
      if (await fs.pathExists(paths.dir)) {
        res.status(409).json({ error: "Canvas already exists" });
        return;
      }
      await fs.ensureDir(paths.dir);
      res.json({ success: true, name: path.basename(paths.dir) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  server.post("/api/canvases/rename", async (req, res) => {
    try {
      const { oldName, newName } = req.body as { oldName?: string; newName?: string };
      if (!oldName || !newName) {
        res.status(400).json({ error: "Both oldName and newName are required" });
        return;
      }
      const oldPaths = getCanvasPaths(oldName);
      const newPaths = getCanvasPaths(newName);
      
      if (!(await fs.pathExists(oldPaths.dir))) {
        res.status(404).json({ error: "Canvas not found" });
        return;
      }
      if (await fs.pathExists(newPaths.dir)) {
        res.status(409).json({ error: "Target canvas name already exists" });
        return;
      }
      
      await fs.rename(oldPaths.dir, newPaths.dir);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  server.post("/api/canvases/delete", async (req, res) => {
    try {
      const { name } = req.body as { name?: string };
      if (!name) {
        res.status(400).json({ error: "Canvas name is required" });
        return;
      }
      // Prevent deleting the last canvas or Default if it's the only one? 
      // User requirement says "Default have one", so maybe we ensure at least one exists.
      
      const paths = getCanvasPaths(name);
      if (await fs.pathExists(paths.dir)) {
        await fs.remove(paths.dir);
      }
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  const normalizeTags = (tags: unknown): string[] => {
    if (!Array.isArray(tags)) return [];
    return tags.filter((t): t is string => typeof t === "string");
  };

  const toStoredMeta = (
    data: DiskImageMeta,
    relativePath: string
  ): StoredImageMeta => {
    return {
      image: relativePath,
      pageUrl: data.pageUrl,
      tags: normalizeTags(data.tags),
      createdAt: data.createdAt,
      vector: Array.isArray(data.vector) ? data.vector : null,
      dominantColor:
        typeof data.dominantColor === "string" ? data.dominantColor : null,
      tone: typeof data.tone === "string" ? data.tone : null,
    };
  };

  const readAllDiskMeta = async (): Promise<
    { meta: DiskImageMeta; relativePath: string }[]
  > => {
    const result: { meta: DiskImageMeta; relativePath: string }[] = [];
    if (!(await fs.pathExists(META_DIR))) return result;
    const files = await fs.readdir(META_DIR);
    const metaFiles = files.filter((f) => f.endsWith(".json"));

    for (const file of metaFiles) {
      try {
        const fullPath = path.join(META_DIR, file);
        const raw = (await fs.readJson(fullPath)) as DiskImageMeta;

        let relativePath = raw.image;
        if (!relativePath) {
            const imageName = file.slice(0, -5);
            relativePath = path.join("images", imageName);
        }
        
        const localPath = path.join(STORAGE_DIR, relativePath);

        if (!(await fs.pathExists(localPath))) {
          await fs.remove(fullPath);
          continue;
        }

        result.push({ meta: raw, relativePath });
      } catch (e) {
        console.error("Error reading meta file", file, e);
      }
    }

    return result;
  };

  const vectorService = new PythonMetaService();
  vectorService.start();

  async function runPythonVector(
    mode: "encode-image" | "encode-text",
    arg: string
  ): Promise<number[] | null> {
    return vectorService.run(mode, arg);
  }

  async function runPythonDominantColor(arg: string): Promise<string | null> {
    return vectorService.runDominantColor(arg);
  }

  async function runPythonTone(arg: string): Promise<string | null> {
    return vectorService.runTone(arg);
  }

  async function processImageImport(
    source: { type: "url" | "path" | "buffer"; data: string | Buffer },
    metadata: {
      name?: string;
      filename?: string;
      pageUrl?: string;
      tags?: string[];
    }
  ): Promise<StoredImageMeta> {
    const timestamp = Date.now();

    const sanitizeBase = (raw: string): string => {
      const trimmed = raw.trim();
      if (!trimmed) return "image";
      let withoutControls = "";
      for (const ch of trimmed) {
        const code = ch.charCodeAt(0);
        withoutControls += code < 32 || code === 127 ? "_" : ch;
      }
      const withoutReserved = withoutControls.replace(/[\\/:*?"<>|]/g, "_");
      const collapsedWs = withoutReserved.replace(/\s+/g, " ").trim();
      const noTrailing = collapsedWs.replace(/[ .]+$/g, "");
      const normalized = noTrailing || "image";
      const maxLen = 80;
      return normalized.length > maxLen ? normalized.slice(0, maxLen) : normalized;
    };

    const normalizeExt = (raw: string | null | undefined): string | null => {
      if (!raw) return null;
      const trimmed = raw.trim();
      if (!trimmed) return null;
      const withDot = trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
      if (!/^\.[a-zA-Z0-9]{1,10}$/.test(withDot)) return null;
      return withDot.toLowerCase();
    };

    const sourceFilename =
      source.type === "path"
        ? (path.basename(source.data as string).split("?")[0] as string)
        : "";

    const metaFilename = typeof metadata.filename === "string" ? metadata.filename.trim() : "";
    const metaName = typeof metadata.name === "string" ? metadata.name.trim() : "";

    const extFromMetaFilename = normalizeExt(path.extname(metaFilename));
    const extFromSource = normalizeExt(path.extname(sourceFilename));
    const extFromMetaName = normalizeExt(path.extname(metaName));
    const ext = extFromMetaFilename || extFromSource || extFromMetaName || (source.type === "buffer" ? ".png" : ".jpg");

    const baseNameFromMetaFilename = metaFilename ? path.basename(metaFilename, path.extname(metaFilename)) : "";
    const baseNameFromMetaName = metaName ? path.basename(metaName, path.extname(metaName)) : "";
    const baseNameFromSource = sourceFilename ? path.basename(sourceFilename, path.extname(sourceFilename)) : "";

    const rawBase =
      baseNameFromMetaFilename ||
      baseNameFromMetaName ||
      baseNameFromSource ||
      `EMPTY_NAME_${timestamp}`;

    const safeName = sanitizeBase(rawBase);

    let filename = `${safeName}${ext}`;
    let counter = 1;
    while (await fs.pathExists(path.join(IMAGE_DIR, filename))) {
      filename = `${safeName}_${counter}${ext}`;
      counter++;
    }

    const relativePath = path.join("images", filename);
    const localPath = path.join(STORAGE_DIR, relativePath);

    if (source.type === "buffer") {
      await fs.writeFile(localPath, source.data as Buffer);
    } else if (source.type === "path") {
      // Local file path
      let srcPath = source.data as string;
      if (srcPath.startsWith("file://")) {
        srcPath = new URL(srcPath).pathname;
        if (
          process.platform === "win32" &&
          srcPath.startsWith("/") &&
          srcPath.includes(":")
        ) {
          srcPath = srcPath.substring(1);
        }
      }
      srcPath = decodeURIComponent(srcPath);
      await fs.copy(srcPath, localPath);
    } else {
      // URL
      await downloadImage(source.data as string, localPath);
    }

    const tags: string[] = Array.isArray(metadata.tags) ? metadata.tags : [];

    // Use filename as ID for meta file naming
    const id = filename;

    const diskMeta: DiskImageMeta = {
      image: relativePath,
      pageUrl: metadata.pageUrl,
      tags,
      createdAt: timestamp,
      vector: null,
      dominantColor: null,
      tone: null,
    };

    // Use id (filename) for meta file naming
    await fs.writeJson(path.join(META_DIR, `${id}.json`), diskMeta);

    const meta = toStoredMeta(diskMeta, relativePath);
    
      // Async tasks
    void (async () => {
      const settings = await readSettings();
      const enableVectorSearch = Boolean(settings.enableVectorSearch);

      if (enableVectorSearch) {
        const vector = await runPythonVector("encode-image", localPath);
        if (!vector) {
          console.error("Vector generation failed for", localPath);
          return;
        }
        // Use id (filename) for meta file path
        const metaPath = path.join(META_DIR, `${id}.json`);
        await metaMutex.run(metaPath, async () => {
          try {
            if (await fs.pathExists(metaPath)) {
              const currentRaw = (await fs.readJson(metaPath)) as DiskImageMeta;
              const updated: DiskImageMeta = {
                ...currentRaw,
                vector,
              };
              await fs.writeJson(metaPath, updated);
              sendToRenderer?.("image-updated", toStoredMeta(updated, updated.image));
            }
          } catch (e) {
            console.error("Failed to update meta with vector", e);
          }
        });
      }
    })();

    void (async () => {
      const dominantColor = await runPythonDominantColor(localPath);
      if (!dominantColor) {
        return;
      }
      // Use id (filename) for meta file path
      const metaPath = path.join(META_DIR, `${id}.json`);
      await metaMutex.run(metaPath, async () => {
        try {
          if (await fs.pathExists(metaPath)) {
            const currentRaw = (await fs.readJson(metaPath)) as DiskImageMeta;
            const updated: DiskImageMeta = {
              ...currentRaw,
              dominantColor,
            };
            await fs.writeJson(metaPath, updated);
            sendToRenderer?.("image-updated", toStoredMeta(updated, updated.image));
          }
        } catch (e) {
          console.error("Failed to update meta with dominant color", e);
        }
      });
    })();

    void (async () => {
      const tone = await runPythonTone(localPath);
      if (!tone) {
        return;
      }
      // Use id (filename) for meta file path
      const metaPath = path.join(META_DIR, `${id}.json`);
      await metaMutex.run(metaPath, async () => {
        try {
          if (await fs.pathExists(metaPath)) {
            const currentRaw = (await fs.readJson(metaPath)) as DiskImageMeta;
            const updated: DiskImageMeta = {
              ...currentRaw,
              tone,
            };
            await fs.writeJson(metaPath, updated);
            sendToRenderer?.("image-updated", toStoredMeta(updated, updated.image));
          }
        } catch (e) {
          console.error("Failed to update meta with tone", e);
        }
      });
    })();

    sendToRenderer?.("new-collection", meta);
    return meta;
  }

  server.post("/api/import-blob", async (req, res) => {
    try {
      const { imageBase64, filename } = req.body as {
        imageBase64?: string;
        filename?: string;
      };
      if (!imageBase64) {
        res.status(400).json({ error: "No image data" });
        return;
      }

      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");

      const meta = await processImageImport(
        { type: "buffer", data: buffer },
        { filename: filename || "pasted-image.png" }
      );

      res.json({ success: true, meta });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Import blob error:", error);
      res
        .status(500)
        .json({ error: "Failed to import blob", details: message });
    }
  });

  server.post("/api/collect", async (req, res) => {
    try {
      const { imageUrl, pageUrl, filename, tags, name } = req.body as {
        imageUrl: string;
        pageUrl?: string;
        filename?: string;
        tags?: string[];
        name?: string;
      };
      console.log("Received collection request:", imageUrl);

      let type: "url" | "path" = "url";
      if (imageUrl.startsWith("file://") || imageUrl.startsWith("/")) {
        type = "path";
      }

      const meta = await processImageImport(
        { type, data: imageUrl },
        { filename, pageUrl, tags, name }
      );

      res.json({ success: true, meta });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Collection error:", error);
      res
        .status(500)
        .json({ error: "Failed to collect image", details: message });
    }
  });

  server.get("/api/images", async (_req, res) => {
    try {
      const diskItems = await readAllDiskMeta();
      const items: StoredImageMeta[] = diskItems.map((m) => toStoredMeta(m.meta, m.relativePath));

      let order: string[] = [];
      if (await fs.pathExists(GALLERY_ORDER_FILE)) {
        try {
          order = await fs.readJson(GALLERY_ORDER_FILE);
        } catch (e) {
          console.error("Failed to read gallery order:", e);
        }
      }

      if (order.length > 0) {
        const orderMap = new Map(order.map((id, index) => [id, index]));

        items.sort((a, b) => {
          const indexA = orderMap.get(a.image);
          const indexB = orderMap.get(b.image);

          if (indexA !== undefined && indexB !== undefined) {
            return indexA - indexB;
          }

          if (indexA === undefined && indexB !== undefined) {
            return -1;
          }
          if (indexA !== undefined && indexB === undefined) {
            return 1;
          }

          return b.createdAt - a.createdAt;
        });
      } else {
        items.sort((a, b) => b.createdAt - a.createdAt);
      }

      res.json(items);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof Error && error.name === "StorageIncompatibleError") {
        res.status(409).json({ error: message, code: "STORAGE_INCOMPATIBLE" });
        return;
      }
      res.status(500).json({ error: message });
    }
  });

  server.get("/api/tags", async (_req, res) => {
    try {
      const diskItems = await readAllDiskMeta();
      const allTags = new Set<string>();
      for (const item of diskItems) {
        if (Array.isArray(item.meta.tags)) {
          for (const t of item.meta.tags) {
            if (typeof t === "string" && t.trim()) {
              allTags.add(t.trim());
            }
          }
        }
      }
      
      const settings = await readSettings();
      const tagColors = (settings.tagColors || {}) as Record<string, string>;
      
      const result = Array.from(allTags).sort().map(tag => ({
        name: tag,
        color: tagColors[tag] || null
      }));

      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  server.post("/api/save-gallery-order", async (req, res) => {
    try {
      const { order } = req.body as { order?: unknown };
      if (!Array.isArray(order)) {
        res.status(400).json({ error: "Order must be an array of IDs" });
        return;
      }
      await fs.writeJson(GALLERY_ORDER_FILE, order);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Save gallery order error:", error);
      res
        .status(500)
        .json({ error: "Failed to save gallery order", details: message });
    }
  });

  server.post("/api/download-model", async (req, res) => {
    try {
      // Don't await this, run in background
      vectorService.downloadModel((data) => {
        sendToRenderer?.("model-download-progress", mapModelDownloadProgress(data));
      }).catch(err => {
        console.error("Model download failed", err);
        sendToRenderer?.("model-download-progress", { type: "error", reason: String(err) });
      });
      
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  server.get("/api/settings", async (_req, res) => {
    try {
      const settings = await readSettings();
      res.json(settings);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  server.get("/api/settings/:key", async (req, res) => {
    try {
      const key = req.params.key;
      if (!key) {
        res.status(400).json({ error: "Key is required" });
        return;
      }
      const settings = await readSettings();
      const value = Object.prototype.hasOwnProperty.call(settings, key)
        ? settings[key]
        : null;
      res.json({ value });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  server.post("/api/settings/:key", async (req, res) => {
    try {
      const key = req.params.key;
      if (!key) {
        res.status(400).json({ error: "Key is required" });
        return;
      }
      const { value } = req.body as { value?: unknown };
      const settings = await readSettings();
      const next: Record<string, unknown> = { ...settings, [key]: value };
      await writeSettings(next);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  server.post("/api/delete", async (req, res) => {
    try {
      const { image } = req.body as { image?: string };
      if (!image) {
        res.status(400).json({ error: "Image path is required" });
        return;
      }

      try {
        if (await fs.pathExists(GALLERY_ORDER_FILE)) {
          const order = await fs.readJson(GALLERY_ORDER_FILE);
          if (Array.isArray(order)) {
            const newOrder = order.filter((itemImage: string) => itemImage !== image);
            if (newOrder.length !== order.length) {
              await fs.writeJson(GALLERY_ORDER_FILE, newOrder);
            }
          }
        }
      } catch (e) {
        console.error("Failed to update gallery order on delete", e);
      }

      const filename = path.basename(image);
      const metaPath = path.join(META_DIR, `${filename}.json`);
      await metaMutex.run(metaPath, async () => {
        if (await fs.pathExists(metaPath)) {
          const meta = (await fs.readJson(metaPath)) as DiskImageMeta;
          const relativePath = meta.image;
          const localPath = path.join(STORAGE_DIR, relativePath);
          if (await fs.pathExists(localPath)) {
            await fs.remove(localPath);
          }
          await fs.remove(metaPath);
          res.json({ success: true });
          return;
        }

        res.status(404).json({ error: "Image not found" });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  server.post("/api/rename-tag", async (req, res) => {
    try {
      const { oldTag, newTag } = req.body as {
        oldTag?: string;
        newTag?: string;
      };
      if (!oldTag || !newTag) {
        res.status(400).json({ error: "oldTag and newTag are required" });
        return;
      }
      const trimmedOld = oldTag.trim();
      const trimmedNew = newTag.trim();
      if (!trimmedOld || !trimmedNew) {
        res.status(400).json({ error: "Tags cannot be empty" });
        return;
      }

      if (trimmedOld === trimmedNew) {
        res.json({ success: true });
        return;
      }

      // 1. Update all images
      if (await fs.pathExists(META_DIR)) {
        const files = await fs.readdir(META_DIR);
        const metaFiles = files.filter((f) => f.endsWith(".json"));

        for (const file of metaFiles) {
          const metaPath = path.join(META_DIR, file);
          await metaMutex.run(metaPath, async () => {
            if (await fs.pathExists(metaPath)) {
              const current = (await fs.readJson(metaPath)) as DiskImageMeta;
              if (Array.isArray(current.tags) && current.tags.includes(trimmedOld)) {
                const nextTags = current.tags.map((t) =>
                  t === trimmedOld ? trimmedNew : t
                );
                // Remove duplicates if any
                const uniqueTags = Array.from(new Set(nextTags));
                const updated: DiskImageMeta = {
                  ...current,
                  tags: uniqueTags,
                };
                await fs.writeJson(metaPath, updated);
              }
            }
          });
        }
      }

      // 2. Update settings (colors)
      const settings = await readSettings();
      const tagColors = (settings.tagColors || {}) as Record<string, string>;
      if (Object.prototype.hasOwnProperty.call(tagColors, trimmedOld)) {
        const color = tagColors[trimmedOld];
        const nextTagColors = { ...tagColors };
        delete nextTagColors[trimmedOld];
        nextTagColors[trimmedNew] = color;
        await writeSettings({ ...settings, tagColors: nextTagColors });
      }

      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Rename tag error:", error);
      res.status(500).json({ error: "Failed to rename tag", details: message });
    }
  });

  server.post("/api/update-tags", async (req, res) => {
    try {
      const { image, tags } = req.body as { image?: string; tags?: unknown };
      if (!image) {
        res.status(400).json({ error: "Image path is required" });
        return;
      }
      const filename = path.basename(image);
      const metaPath = path.join(META_DIR, `${filename}.json`);

      await metaMutex.run(metaPath, async () => {
        if (await fs.pathExists(metaPath)) {
          const current = (await fs.readJson(metaPath)) as DiskImageMeta;
          const nextTags = normalizeTags(tags);
          const updated: DiskImageMeta = {
            ...current,
            tags: nextTags,
          };
          await fs.writeJson(metaPath, updated);
          res.json({ success: true, meta: toStoredMeta(updated, current.image) });
          return;
        }

        res.status(404).json({ error: "Image not found" });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  server.post("/api/update-dominant-color", async (req, res) => {
    try {
      const { image, dominantColor } = req.body as {
        image?: string;
        dominantColor?: unknown;
      };
      if (!image) {
        res.status(400).json({ error: "Image path is required" });
        return;
      }

      let next: string | null = null;
      if (dominantColor === null || dominantColor === undefined) {
        next = null;
      } else if (typeof dominantColor === "string") {
        const trimmed = dominantColor.trim();
        if (!trimmed) {
          next = null;
        } else if (
          /^#[0-9a-fA-F]{6}$/.test(trimmed) ||
          /^#[0-9a-fA-F]{3}$/.test(trimmed)
        ) {
          next = trimmed;
        } else {
          res
            .status(400)
            .json({ error: "dominantColor must be a hex color like #RRGGBB" });
          return;
        }
      } else {
        res
          .status(400)
          .json({ error: "dominantColor must be a string or null" });
        return;
      }

      const filename = path.basename(image);
      const metaPath = path.join(META_DIR, `${filename}.json`);
      if (await fs.pathExists(metaPath)) {
        const current = (await fs.readJson(metaPath)) as DiskImageMeta;
        const updated: DiskImageMeta = {
          ...current,
          dominantColor: next,
        };
        await fs.writeJson(metaPath, updated);
        res.json({ success: true, meta: toStoredMeta(updated, current.image) });
        return;
      }

      res.status(404).json({ error: "Image not found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  server.post("/api/update-name", async (req, res) => {
    try {
      const { image, name } = req.body as { image?: string; name?: unknown };
      if (!image) {
        res.status(400).json({ error: "Image path is required" });
        return;
      }
      if (typeof name !== "string" || !name.trim()) {
        res.status(400).json({ error: "name is required" });
        return;
      }

      const rawName = name.trim();
      // Extract filename from image path
      const oldFilename = path.basename(image);
      const metaPath = path.join(META_DIR, `${oldFilename}.json`);

      await metaMutex.run(metaPath, async () => {
        if (!(await fs.pathExists(metaPath))) {
          res.status(404).json({ error: "Image meta not found" });
          return;
        }

        const current = (await fs.readJson(metaPath)) as DiskImageMeta;
        const oldRelPath = current.image;
        const oldLocalPath = path.join(STORAGE_DIR, oldRelPath);

        if (!(await fs.pathExists(oldLocalPath))) {
          res.status(404).json({ error: "Image file not found" });
          return;
        }

        const ext = path.extname(oldRelPath);
        const base = rawName.replace(/[/\\:*?"<>|]+/g, "_").trim() || "image";
        let newFilename = `${base}${ext}`;

        let counter = 1;
        // Avoid clobbering other files; allow renaming to same file name
        while (await fs.pathExists(path.join(IMAGE_DIR, newFilename))) {
          const existingFull = path.join(IMAGE_DIR, newFilename);
          const currentFull = path.join(
            IMAGE_DIR,
            path.basename(oldRelPath).split("?")[0] || path.basename(oldRelPath)
          );
          if (existingFull === currentFull) {
            break;
          }
          newFilename = `${base}_${counter}${ext}`;
          counter += 1;
        }

        const newRelPath = path.join("images", newFilename);
        const newLocalPath = path.join(STORAGE_DIR, newRelPath);

        // Rename physical file if needed
        if (oldLocalPath !== newLocalPath) {
          await fs.rename(oldLocalPath, newLocalPath);
        }

        const newMetaPath = path.join(META_DIR, `${newFilename}.json`);

        const updated: DiskImageMeta = {
          ...current,
          image: newRelPath,
        };

        // If filename changed, we need to rename meta file and update gallery order
        if (oldFilename !== newFilename) {
            await fs.writeJson(newMetaPath, updated);
            await fs.remove(metaPath);
            
            // Update gallery order
            if (await fs.pathExists(GALLERY_ORDER_FILE)) {
                try {
                    const order = await fs.readJson(GALLERY_ORDER_FILE);
                    if (Array.isArray(order)) {
                        const nextOrder = order.map((oid) => oid === oldRelPath ? newRelPath : oid);
                        await fs.writeJson(GALLERY_ORDER_FILE, nextOrder);
                    }
                } catch (e) {
                    console.error("Failed to update gallery order on rename", e);
                }
            }
            
            // Update canvas data
            try {
                const canvasDirs = await fs.readdir(CANVASES_DIR);
                for (const dir of canvasDirs) {
                    const canvasFile = path.join(CANVASES_DIR, dir, "canvas.json");
                    if (await fs.pathExists(canvasFile)) {
                        try {
                            const canvasData = await fs.readJson(canvasFile);
                            if (Array.isArray(canvasData)) {
                                let hasChanges = false;
                                const nextCanvasData = canvasData.map((item: { image?: string; type?: string }) => {
                                    if (item.type === 'image' && item.image === oldRelPath) {
                                        hasChanges = true;
                                        return { ...item, image: newRelPath };
                                    }
                                    return item;
                                });
                                
                                if (hasChanges) {
                                    await fs.writeJson(canvasFile, nextCanvasData);
                                }
                            }
                        } catch {
                             // ignore
                        }
                    }
                }
            } catch (e) {
                console.error("Failed to update canvas data on rename", e);
            }
        } else {
            // Filename didn't change, just update meta content
            await fs.writeJson(metaPath, updated);
        }

        res.json({ success: true, meta: toStoredMeta(updated, newRelPath) });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  server.post("/api/reindex", async (req, res) => {
    try {
      const { image } = req.body as { image?: string };
      if (!image) {
        res.status(400).json({ error: "Image path is required" });
        return;
      }
      const filename = path.basename(image);
      const metaPath = path.join(META_DIR, `${filename}.json`);

      if (await fs.pathExists(metaPath)) {
        const current = (await fs.readJson(metaPath)) as DiskImageMeta;
        const relativePath = current.image;
        const localPath = path.join(STORAGE_DIR, relativePath);
        const vector = await runPythonVector("encode-image", localPath);
        if (vector) {
          const updated: DiskImageMeta = {
            ...current,
            vector,
          };
          await fs.writeJson(metaPath, updated);
          res.json({ success: true, meta: toStoredMeta(updated, relativePath) });
          return;
        }

        res.json({ success: true, meta: toStoredMeta(current, relativePath) });
        return;
      }

      res.status(404).json({ error: "Image not found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  server.post("/api/index-missing", async (_req, res) => {
    try {
      await fs.ensureDir(IMAGE_DIR);
      await fs.ensureDir(META_DIR);

      const imageFiles = await fs.readdir(IMAGE_DIR);
      // Sort files to ensure deterministic order
      imageFiles.sort();
      const imageSet = new Set<string>();
      for (const file of imageFiles) {
        const full = path.join(IMAGE_DIR, file);
        const stat = await fs.stat(full);
        if (stat.isFile()) {
          imageSet.add(file);
        }
      }

      const metaFiles = await fs.readdir(META_DIR);
      const metaByImage = new Map<
        string,
        { meta: DiskImageMeta; metaPath: string }
      >();

      for (const file of metaFiles) {
        if (!file.endsWith(".json")) continue;
        const fullPath = path.join(META_DIR, file);
        try {
          const raw = (await fs.readJson(fullPath)) as {
            image?: unknown;
            pageUrl?: unknown;
            tags?: unknown;
            createdAt?: unknown;
            vector?: unknown;
            dominantColor?: unknown;
            tone?: unknown;
          };

          const imageVal =
            typeof raw.image === "string" ? raw.image.trim() : "";
          if (!imageVal) {
            throw new StorageIncompatibleError(
              `Storage format is incompatible: missing image. Please reset the data folder. (meta: ${fullPath})`
            );
          }

          const normalizedImage = imageVal.replace(/\\/g, "/");
          if (!normalizedImage.startsWith("images/")) {
            throw new StorageIncompatibleError(
              `Storage format is incompatible: invalid image path "${imageVal}". Please reset the data folder. (meta: ${fullPath})`
            );
          }

          const createdAtRaw = raw.createdAt;
          if (
            typeof createdAtRaw !== "number" ||
            !Number.isFinite(createdAtRaw)
          ) {
            throw new StorageIncompatibleError(
              `Storage format is incompatible: missing createdAt. Please reset the data folder. (meta: ${fullPath})`
            );
          }
          const createdAt = createdAtRaw as number;

          const imageName = path.basename(normalizedImage);
          if (!imageName) continue;
          const expectedRel = path
            .join("images", imageName)
            .replace(/\\/g, "/");
          if (normalizedImage !== expectedRel) {
            throw new StorageIncompatibleError(
              `Storage format is incompatible: invalid image path "${imageVal}". Please reset the data folder. (meta: ${fullPath})`
            );
          }

          const normalized: DiskImageMeta = {
            image: expectedRel,
            pageUrl: typeof raw.pageUrl === "string" ? raw.pageUrl : undefined,
            tags: normalizeTags(raw.tags),
            createdAt,
            vector: Array.isArray(raw.vector) ? (raw.vector as number[]) : null,
            dominantColor:
              typeof raw.dominantColor === "string" ? raw.dominantColor : null,
            tone: typeof raw.tone === "string" ? raw.tone : null,
          };

          metaByImage.set(imageName, { meta: normalized, metaPath: fullPath });
        } catch (e) {
          if (e instanceof StorageIncompatibleError) {
            throw e;
          }
          console.error("Failed to read meta for batch index", fullPath, e);
        }
      }

      let created = 0;
      let updated = 0;

      const settings = await readSettings();
      const enableVectorSearch = Boolean(settings.enableVectorSearch);

      const now = Date.now();
      let current = 0;
      const total = imageSet.size;

      // Initial progress
      sendToRenderer?.("indexing-progress", {
        current: 0,
        total,
        statusKey: "indexing.starting" as I18nKey,
      });

      for (const imageName of imageSet) {
        current++;
        if (current % 2 === 0 || current === total || current === 1) {
          sendToRenderer?.("indexing-progress", {
            current,
            total,
            statusKey: "indexing.progress" as I18nKey,
            statusParams: { current, total } satisfies I18nParams,
          });
        }

        const imageRel = path.join("images", imageName);
        const imagePath = path.join(STORAGE_DIR, imageRel);

        // Get file stats to recover creation time if needed
        let fileStat: fs.Stats | null = null;
        try {
          fileStat = await fs.stat(imagePath);
        } catch (e) {
          console.error("Failed to stat image file", imagePath, e);
        }

        const existing = metaByImage.get(imageName);
        if (existing) {
          const { meta, metaPath } = existing;
          const currentMeta: DiskImageMeta = {
            ...meta,
            image: imageRel,
          };

          const hasVector =
            Array.isArray(currentMeta.vector) && currentMeta.vector.length > 0;
          const hasDominantColor =
            typeof currentMeta.dominantColor === "string" &&
            currentMeta.dominantColor.trim().length > 0;
          const hasTone =
            typeof currentMeta.tone === "string" &&
            currentMeta.tone.trim().length > 0;

          if (
            (hasVector || !enableVectorSearch) &&
            hasDominantColor &&
            hasTone
          ) {
            continue;
          }

          const [vector, dominantColor, tone] = await Promise.all([
            hasVector || !enableVectorSearch
              ? Promise.resolve(currentMeta.vector as number[])
              : runPythonVector("encode-image", imagePath),
            hasDominantColor
              ? Promise.resolve(currentMeta.dominantColor as string)
              : runPythonDominantColor(imagePath),
            hasTone
              ? Promise.resolve(currentMeta.tone as string)
              : runPythonTone(imagePath),
          ]);

          const updatedMeta: DiskImageMeta = {
            ...currentMeta,
            vector:
              vector && Array.isArray(vector)
                ? vector
                : currentMeta.vector ?? null,
            dominantColor:
              typeof dominantColor === "string"
                ? dominantColor
                : currentMeta.dominantColor ?? null,
            tone: typeof tone === "string" ? tone : currentMeta.tone ?? null,
          };

          const hasChanges =
            updatedMeta.vector !== (currentMeta.vector ?? null) ||
            updatedMeta.dominantColor !== (currentMeta.dominantColor ?? null) ||
            updatedMeta.tone !== (currentMeta.tone ?? null);

          if (hasChanges) {
            await fs.writeJson(metaPath, updatedMeta);
            updated += 1;
            sendToRenderer?.("image-updated", toStoredMeta(updatedMeta, imageRel));
          }
          continue;
        }

        // Use filename as ID logic for meta file naming
        const id = imageName;
        
        const baseMeta: DiskImageMeta = {
          image: imageRel,
          pageUrl: undefined,
          tags: [],
          createdAt: fileStat?.birthtimeMs || fileStat?.mtimeMs || now,
          vector: null,
          dominantColor: null,
          tone: null,
        };

        const [vector, dominantColor, tone] = await Promise.all([
          enableVectorSearch
            ? runPythonVector("encode-image", imagePath)
            : Promise.resolve(null),
          runPythonDominantColor(imagePath),
          runPythonTone(imagePath),
        ]);
        const finalMeta: DiskImageMeta = {
          ...baseMeta,
          vector: vector && Array.isArray(vector) ? vector : null,
          dominantColor:
            typeof dominantColor === "string" ? dominantColor : null,
          tone: typeof tone === "string" ? tone : null,
        };

        // Use id (filename) for meta file path
        const metaPath = path.join(META_DIR, `${id}.json`);
        await fs.writeJson(metaPath, finalMeta);
        created += 1;
        sendToRenderer?.("new-collection", toStoredMeta(finalMeta, imageRel));
      }

      for (const [imageName, { metaPath }] of metaByImage.entries()) {
        if (!imageSet.has(imageName)) {
          try {
            await fs.remove(metaPath);
          } catch (e) {
            console.error("Failed to remove stale meta", metaPath, e);
          }
        }
      }

      sendToRenderer?.("indexing-progress", {
        current: total,
        total,
        statusKey: "indexing.completed" as I18nKey,
      });
      res.json({ success: true, created, updated, images: imageSet.size });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Batch index error:", error);
      if (error instanceof Error && error.name === "StorageIncompatibleError") {
        res.status(409).json({
          error: "Storage is incompatible",
          details: message,
          code: "STORAGE_INCOMPATIBLE",
        });
        return;
      }
      res
        .status(500)
        .json({ error: "Failed to index images", details: message });
    }
  });

  server.post("/api/open-in-folder", async (req, res) => {
    try {
      const { path: filePath, image } = req.body as { path?: string; image?: string };
      let targetPath = filePath;
      if (image && !targetPath) {
          targetPath = path.join(STORAGE_DIR, image);
      }
      
      if (!targetPath) {
        res.status(400).json({ error: "Path or image is required" });
        return;
      }

      try {
        const stat = await fs.stat(targetPath);
        if (stat.isDirectory()) {
          await shell.openPath(targetPath);
          res.json({ success: true });
          return;
        }
        shell.showItemInFolder(targetPath);
        res.json({ success: true });
        return;
      } catch {
        // Try resolving relative to storage dir if not found
        if (!path.isAbsolute(targetPath)) {
            const abs = path.join(STORAGE_DIR, targetPath);
            try {
                shell.showItemInFolder(abs);
                res.json({ success: true });
                return;
            } catch {
                 // ignore
             }
         }
        
        const dir = path.dirname(targetPath);
        await shell.openPath(dir);
        res.json({ success: true });
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  server.post("/api/open-with-default", async (req, res) => {
    try {
      const { path: filePath, image } = req.body as { path?: string; image?: string };
      let targetPath = filePath;
      if (image && !targetPath) {
          targetPath = path.join(STORAGE_DIR, image);
      }

      if (!targetPath) {
        res.status(400).json({ error: "Path or image is required" });
        return;
      }

      await shell.openPath(targetPath);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  server.post("/api/search", async (req, res) => {
    console.log('searching...')
    try {
      const { query, vector, limit, tags, color, tone, searchId, threshold } = req.body as {
        query?: string;
        vector?: number[];
        limit?: number;
        tags?: unknown;
        color?: unknown;
        tone?: unknown;
        searchId?: unknown;
        threshold?: number;
      };

      const settings = await readSettings();
      const enableVectorSearch = Boolean(settings.enableVectorSearch);

      const trimmed = (query || "").trim();
      const resolvedSearchId =
        typeof searchId === "string" && searchId.trim()
          ? searchId.trim()
          : `search_${Date.now()}_${Math.random().toString(16).slice(2)}`;

      const normalizeTag = (t: string) => t.trim().toLowerCase();
      const queryTags = Array.isArray(tags)
        ? tags.filter((t): t is string => typeof t === "string")
        : [];
      const normalizedQueryTags = queryTags
        .map((t) => normalizeTag(t))
        .filter((t) => t.length > 0);
      const hasTagFilter = normalizedQueryTags.length > 0;

      const normalizeHexColor = (raw: unknown): string | null => {
        if (typeof raw !== "string") return null;
        const val = raw.trim();
        if (!val) return null;
        const withHash = val.startsWith("#") ? val : `#${val}`;
        if (!/^#[0-9a-fA-F]{6}$/.test(withHash)) return null;
        return withHash.toLowerCase();
      };

      const hexToRgb = (
        hex: string
      ): { r: number; g: number; b: number } | null => {
        if (!/^#[0-9a-f]{6}$/i.test(hex)) return null;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        if ([r, g, b].some((n) => Number.isNaN(n))) return null;
        return { r, g, b };
      };

      const requestedColor = normalizeHexColor(color);
      const hasColorFilter = Boolean(requestedColor);

      const requestedTone =
        typeof tone === "string" && tone.trim() ? tone.trim() : null;
      const hasToneFilter = Boolean(requestedTone);

      if (process.env.PROREF_DEBUG_SEARCH === "1") {
        console.log("Search request:", {
          query: trimmed,
          tags: normalizedQueryTags,
          color: requestedColor,
          tone: requestedTone,
          hasTagFilter,
          hasColorFilter,
          hasToneFilter
        });
      }

      const srgbToLinear = (x: number): number => {
        const v = x / 255;
        return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };

      const rgbToOklab = (rgb: {
        r: number;
        g: number;
        b: number;
      }): { L: number; a: number; b: number } => {
        const r = srgbToLinear(rgb.r);
        const g = srgbToLinear(rgb.g);
        const b = srgbToLinear(rgb.b);

        const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
        const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
        const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

        const l_ = Math.cbrt(l);
        const m_ = Math.cbrt(m);
        const s_ = Math.cbrt(s);

        return {
          L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
          a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
          b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
        };
      };

      const isSimilarColor = (
        a: string | null | undefined,
        b: string
      ): boolean => {
        if (!a) return false;
        const aNorm = normalizeHexColor(a);
        if (!aNorm) return false;
        const rgbA = hexToRgb(aNorm);
        const rgbB = hexToRgb(b);
        if (!rgbA || !rgbB) return false;
        const labA = rgbToOklab(rgbA);
        const labB = rgbToOklab(rgbB);
        const dL = labA.L - labB.L;
        const da = labA.a - labB.a;
        const db = labA.b - labB.b;
        const dist = Math.sqrt(dL * dL + da * da + db * db);
        return dist <= 0.12;
      };

      if (
        !trimmed &&
        (!vector || vector.length === 0) &&
        !hasTagFilter &&
        !hasColorFilter &&
        !hasToneFilter
      ) {
        res.json([]);
        return;
      }

      const diskItems = await readAllDiskMeta();
      if (diskItems.length === 0) {
        res.json([]);
        return;
      }

      const items: StoredImageMeta[] = diskItems.map((m) => toStoredMeta(m.meta, m.relativePath));

      const filterByTags = (
        source: StoredImageMeta[]
      ): StoredImageMeta[] => {
        if (!hasTagFilter) return source;
        return source.filter((item) => {
          const itemTags = Array.isArray(item.tags) ? item.tags : [];
          const normalizedItem = new Set(
            itemTags.map((t) => normalizeTag(String(t)))
          );
          return normalizedQueryTags.every((t) => normalizedItem.has(t));
        });
      };

      const filterByColor = (
        source: StoredImageMeta[]
      ): StoredImageMeta[] => {
        if (!requestedColor) return source;
        return source.filter((item) =>
          isSimilarColor(item.dominantColor, requestedColor)
        );
      };

      const filterByTone = (source: StoredImageMeta[]): StoredImageMeta[] => {
        if (!requestedTone) return source;
        const result = source.filter((item) => item.tone === requestedTone);
        if (process.env.PROREF_DEBUG_SEARCH === "1") {
          console.log(`Tone filter: ${requestedTone}, Input: ${source.length}, Output: ${result.length}`);
        }
        return result;
      };

      const buildNameMatches = (
        source: StoredImageMeta[]
      ): {
        nameMatches: StoredImageMeta[];
        hasNameQuery: boolean;
        queryTokens: string[];
      } => {
        const queryTokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
        const hasNameQuery = queryTokens.length > 0;
        const isNameMatch = (item: StoredImageMeta): boolean => {
          if (!hasNameQuery) return false;
          // item.image is "images/foo.jpg"
          const filename = path.basename(item.image); 
          const nameWithoutExt = path.basename(filename, path.extname(filename));
          const hay = `${nameWithoutExt} ${item.image}`.toLowerCase();
          return queryTokens.every((t) => hay.includes(t));
        };
        const nameMatches = hasNameQuery ? source.filter(isNameMatch) : [];
        return { nameMatches, hasNameQuery, queryTokens };
      };

      const buildFastResult = (params: {
        candidates: StoredImageMeta[];
        nameMatches: StoredImageMeta[];
        hasNameQuery: boolean;
        topN: number;
      }): SearchResult[] => {
        const { candidates, nameMatches, hasNameQuery, topN } = params;
        if (hasNameQuery) {
          return nameMatches
            .slice()
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, topN)
            .map((item) => ({
              ...item,
              score: 1,
              matchedType: "exact",
            }));
        }
        if (!hasTagFilter && !hasColorFilter && !hasToneFilter) {
          return [];
        }
        return candidates
          .slice()
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, topN)
          .map((item) => ({
            ...item,
            score: 1,
            matchedType: "exact",
          }));
      };

      const runVectorFlow = async (params: {
        candidates: StoredImageMeta[];
        nameMatches: StoredImageMeta[];
        topN: number;
        threshold?: number;
      }) => {
        const { candidates, nameMatches, topN, threshold } = params;

        // Skip vector search if disabled
        if (!enableVectorSearch) {
          return;
        }

        const dotSimilarity = (a: number[], b: number[]): number => {
          const length = Math.min(a.length, b.length);
          if (length === 0) return -1;
          let dot = 0;
          for (let i = 0; i < length; i += 1) {
            dot += a[i] * b[i];
          }
          return dot;
        };

        try {
          const actualQueryVector =
            vector && vector.length > 0
              ? vector
              : trimmed
              ? await (async () => {
                  const translation = await translateToEnglish(trimmed);
                  if (translation.warning) {
                    sendToRenderer?.("toast", {
                      key: "toast.translationWarning" as I18nKey,
                      params: { warning: translation.warning } satisfies I18nParams,
                      type: "warning",
                    });
                  }
                  return runPythonVector("encode-text", translation.text);
                })()
              : null;
          if (!actualQueryVector) {
            return;
          }

          const results = candidates.map((item) => {
            if (Array.isArray(item.vector)) {
              const score = dotSimilarity(item.vector, actualQueryVector);
              return { item, score, matchedType: "vector" as const };
            }
            return { item, score: -1, matchedType: "vector" as const };
          });

          let baseMinScore: number;
          if (typeof threshold === "number") {
            baseMinScore = threshold;
          } else if (hasTagFilter) {
            baseMinScore = -1;
          } 
          // else if (isSingleTokenQuery) {
          //   baseMinScore = 0.23;
          // } 
          else {
            baseMinScore = 0.1;
          }
          const bestScore = results.reduce(
            (max, r) => (r.score > max ? r.score : max),
            -1
          );
          const dynamicMinScore = Math.max(baseMinScore, bestScore - 0.08);

          const filtered = results.filter((r) => r.score >= dynamicMinScore);
          filtered.sort(
            (a, b) => b.score - a.score || b.item.createdAt - a.item.createdAt
          );

          const map = new Map<string, SearchResult>();
          for (const { item, score, matchedType } of filtered.slice(0, topN)) {
            map.set(item.image, { ...item, score, matchedType });
          }
          for (const item of nameMatches) {
            const existing = map.get(item.image);
            if (!existing) {
              map.set(item.image, { ...item, score: 1, matchedType: "exact" });
              continue;
            }
            if (existing.matchedType === "vector") {
              map.set(item.image, {
                ...existing,
                score: Math.max(existing.score, 1),
                matchedType: "all",
              });
              continue;
            }
            map.set(item.image, {
              ...existing,
              score: Math.max(existing.score, 1),
              matchedType: "exact",
            });
          }

          const finalResult: SearchResult[] = Array.from(map.values())
            .sort((a, b) => b.score - a.score || b.createdAt - a.createdAt)
            .slice(0, topN);

          if (process.env.PROREF_DEBUG_SEARCH === "1") {
            console.log("Search scores:", {
              searchId: resolvedSearchId,
              query: trimmed,
              tags: hasTagFilter ? normalizedQueryTags : [],
              candidates: candidates.length,
              bestScore,
              baseMinScore,
              dynamicMinScore,
              returned: finalResult.length,
              top: finalResult.slice(0, 20).map((r) => ({
                id: r.image,
                score: r.score,
                matchedType: r.matchedType,
              })),
            });
          }

          sendToRenderer?.("search-updated", {
            searchId: resolvedSearchId,
            results: finalResult,
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          console.error("Async search error:", message);
        }
      };

      const candidatesAfterTag = filterByTags(items);
      const candidatesAfterColor = filterByColor(candidatesAfterTag);
      const candidatesAfterTone = filterByTone(candidatesAfterColor);
      const { nameMatches, hasNameQuery } = buildNameMatches(
        candidatesAfterTone
      );
      const topN = typeof limit === "number" && limit > 0 ? limit : 100;

      const fastResult = buildFastResult({
        candidates: candidatesAfterTone,
        nameMatches,
        hasNameQuery,
        topN,
      });

      res.json(fastResult);

      if (!vector?.length && !trimmed) {
        return;
      }

      void runVectorFlow({
        candidates: candidatesAfterTone,
        nameMatches,
        topN,
        threshold,
      });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Search error:", error);
      if (error instanceof Error && error.name === "StorageIncompatibleError") {
        res.status(409).json({
          error: "Storage is incompatible",
          details: message,
          code: "STORAGE_INCOMPATIBLE",
        });
        return;
      }
      res
        .status(500)
        .json({ error: "Failed to search images", details: message });
    }
  });

  server.use("/images", (req, res, next) => {
    return express.static(STORAGE_DIR)(req, res, next);
  });
  server.use("/temp-images", (req, res, next) => {
    return express.static(CANVAS_TEMP_DIR)(req, res, next);
  });

  server.post("/api/download-url", async (req, res) => {
    try {
      const { url } = req.body as { url?: string };
      if (!url || typeof url !== "string") {
        res.status(400).json({ error: "URL is required" });
        return;
      }

      const trimmedUrl = url.trim();
      if (!trimmedUrl.startsWith("http://") && !trimmedUrl.startsWith("https://")) {
        res.status(400).json({ error: "Invalid URL" });
        return;
      }

      // Extract filename from URL
      let urlFilename = "image.jpg";
      try {
        const urlObj = new URL(trimmedUrl);
        const pathname = urlObj.pathname;
        const baseName = path.basename(pathname).split("?")[0];
        if (baseName && /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(baseName)) {
          urlFilename = baseName;
        }
      } catch {
        // ignore URL parse errors
      }

      const ext = path.extname(urlFilename) || ".jpg";
      const nameWithoutExt = path.basename(urlFilename, ext);
      const safeName = nameWithoutExt.replace(/[^a-zA-Z0-9.\-_]/g, "_") || "image";
      const timestamp = Date.now();
      const filename = `${safeName}_${timestamp}${ext}`;
      const filepath = path.join(CANVAS_TEMP_DIR, filename);

      await downloadImage(trimmedUrl, filepath);

      res.json({
        success: true,
        filename,
        path: filepath,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Download URL error:", error);
      res.status(500).json({ error: "Failed to download image", details: message });
    }
  });

  server.post("/api/upload-temp", async (req, res) => {
    try {
      const { imageBase64, filename: providedFilename } = req.body as {
        imageBase64?: string;
        filename?: string;
      };
      if (!imageBase64) {
        res.status(400).json({ error: "No image data" });
        return;
      }

      let filename = "temp.png";

      if (providedFilename) {
        const ext = path.extname(providedFilename) || ".png";
        const name = path.basename(providedFilename, ext);
        const safeName = name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
        filename = `${safeName}${ext}`;
      }

      const filepath = path.join(CANVAS_TEMP_DIR, filename);
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

      await fs.writeFile(filepath, base64Data, "base64");

      res.json({
        success: true,
        filename,
        path: filepath,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Temp upload error:", error);
      res
        .status(500)
        .json({ error: "Failed to upload temp image", details: message });
    }
  });

  server.post("/api/delete-temp-file", async (req, res) => {
    try {
      const { filePath } = req.body as { filePath?: string };
      if (!filePath) {
        res.status(400).json({ error: "File path is required" });
        return;
      }

      const normalizedPath = path.normalize(filePath);
      if (!normalizedPath.startsWith(CANVAS_TEMP_DIR)) {
        const inTemp = path.join(CANVAS_TEMP_DIR, path.basename(filePath));
        if (await fs.pathExists(inTemp)) {
          await fs.unlink(inTemp);
          res.json({ success: true });
          return;
        }

        res
          .status(403)
          .json({ error: "Invalid file path: Must be in temp directory" });
        return;
      }

      if (await fs.pathExists(normalizedPath)) {
        await fs.unlink(normalizedPath);
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "File not found" });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Delete temp file error:", error);
      res
        .status(500)
        .json({ error: "Failed to delete temp file", details: message });
    }
  });

  server.post("/api/temp-dominant-color", async (req, res) => {
    try {
      const { filePath } = req.body as { filePath?: string };
      if (!filePath) {
        res.status(400).json({ error: "File path is required" });
        return;
      }

      const normalizedPath = path.normalize(filePath);
      let targetPath = normalizedPath;

      if (!normalizedPath.startsWith(CANVAS_TEMP_DIR)) {
        const inTemp = path.join(CANVAS_TEMP_DIR, path.basename(filePath));
        if (!(await fs.pathExists(inTemp))) {
          res
            .status(403)
            .json({ error: "Invalid file path: Must be in temp directory" });
          return;
        }
        targetPath = inTemp;
      } else if (!(await fs.pathExists(normalizedPath))) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      const dominantColor = await runPythonDominantColor(targetPath);
      res.json({ success: true, dominantColor });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Temp dominant color error:", error);
      res
        .status(500)
        .json({ error: "Failed to compute dominant color", details: message });
    }
  });

  server.post("/api/save-canvas", async (req, res) => {
    try {
      const { images, canvasName } = req.body as { images?: unknown; canvasName?: string };
      const paths = getCanvasPaths(canvasName || "Default");
      await fs.ensureDir(paths.dir);
      await fs.writeJson(paths.dataFile, images);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  server.post("/api/canvas-viewport", async (req, res) => {
    try {
      const { viewport, canvasName } = req.body as { viewport?: unknown; canvasName?: string };
      const paths = getCanvasPaths(canvasName || "Default");
      await fs.ensureDir(paths.dir);
      await fs.writeJson(paths.viewportFile, viewport);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  server.get("/api/canvas-viewport", async (req, res) => {
    try {
      const canvasName = req.query.canvasName as string;
      const paths = getCanvasPaths(canvasName || "Default");
      if (await fs.pathExists(paths.viewportFile)) {
        const viewport = await fs.readJson(paths.viewportFile);
        res.json(viewport);
      } else {
        res.json(null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  server.get("/api/load-canvas", async (req, res) => {
    try {
      const canvasName = req.query.canvasName as string;
      const paths = getCanvasPaths(canvasName || "Default");

      let images: unknown = [];
      if (await fs.pathExists(paths.dataFile)) {
        images = await fs.readJson(paths.dataFile);
      }

      try {
        if (await fs.pathExists(CANVAS_TEMP_DIR)) {
          const usedTempFiles = new Set<string>();
          if (Array.isArray(images)) {
            images.forEach((img: { localPath?: string }) => {
              if (img.localPath) {
                const basename = path.basename(img.localPath);
                usedTempFiles.add(basename);
              }
            });
          }

          const files = await fs.readdir(CANVAS_TEMP_DIR);
          for (const file of files) {
            if (!usedTempFiles.has(file)) {
              await fs.unlink(path.join(CANVAS_TEMP_DIR, file));
            }
          }
        }
      } catch (cleanupErr) {
        console.error("Canvas temp cleanup failed on load", cleanupErr);
      }

      res.json(images);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  server.listen(SERVER_PORT, () => {
    console.log(`Local server running on port ${SERVER_PORT}`);
  });
}
