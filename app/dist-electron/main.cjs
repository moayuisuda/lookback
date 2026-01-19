var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// electron/main.ts
var import_electron2 = require("electron");
var import_path2 = __toESM(require("path"), 1);
var import_fs_extra2 = __toESM(require("fs-extra"), 1);
var import_electron_log = __toESM(require("electron-log"), 1);
var import_electron_updater = require("electron-updater");
var import_child_process2 = require("child_process");
var import_readline2 = __toESM(require("readline"), 1);
var import_https2 = __toESM(require("https"), 1);
var import_zlib = __toESM(require("zlib"), 1);

// backend/server.ts
var import_electron = require("electron");
var import_path = __toESM(require("path"), 1);
var import_express = __toESM(require("express"), 1);
var import_cors = __toESM(require("cors"), 1);
var import_body_parser = __toESM(require("body-parser"), 1);
var import_fs_extra = __toESM(require("fs-extra"), 1);
var import_https = __toESM(require("https"), 1);
var import_http = __toESM(require("http"), 1);
var import_crypto = __toESM(require("crypto"), 1);
var import_child_process = require("child_process");
var import_readline = __toESM(require("readline"), 1);
var SERVER_PORT = 30001;
var CONFIG_FILE = import_path.default.join(import_electron.app.getPath("userData"), "lookback_config.json");
var loadStorageRoot = () => {
  try {
    if (import_fs_extra.default.pathExistsSync(CONFIG_FILE)) {
      const raw = import_fs_extra.default.readJsonSync(CONFIG_FILE);
      if (raw && typeof raw.storageDir === "string" && raw.storageDir.trim()) {
        return raw.storageDir;
      }
    }
  } catch {
  }
  if (import_electron.app.isPackaged && process.platform !== "darwin") {
    try {
      const exeDir = import_path.default.dirname(import_electron.app.getPath("exe"));
      const portableDataDir = import_path.default.join(exeDir, "data");
      if (import_fs_extra.default.existsSync(portableDataDir)) {
        return portableDataDir;
      }
      const testFile = import_path.default.join(exeDir, ".write_test");
      try {
        import_fs_extra.default.writeFileSync(testFile, "test");
        import_fs_extra.default.removeSync(testFile);
        return portableDataDir;
      } catch {
      }
    } catch {
    }
  }
  return import_path.default.join(import_electron.app.getPath("userData"), "lookback_storage");
};
var STORAGE_DIR = loadStorageRoot();
var META_DIR = import_path.default.join(STORAGE_DIR, "meta");
var IMAGE_DIR = import_path.default.join(STORAGE_DIR, "images");
var CANVAS_TEMP_DIR = import_path.default.join(STORAGE_DIR, "canvas_temp");
var CANVASES_DIR = import_path.default.join(STORAGE_DIR, "canvases");
var GALLERY_ORDER_FILE = import_path.default.join(STORAGE_DIR, "gallery_order.json");
var SETTINGS_FILE = import_path.default.join(STORAGE_DIR, "settings.json");
var ensureStorageDirs = (root) => {
  import_fs_extra.default.ensureDirSync(root);
  import_fs_extra.default.ensureDirSync(import_path.default.join(root, "meta"));
  import_fs_extra.default.ensureDirSync(import_path.default.join(root, "images"));
  import_fs_extra.default.ensureDirSync(import_path.default.join(root, "model"));
  import_fs_extra.default.ensureDirSync(import_path.default.join(root, "canvas_temp"));
  import_fs_extra.default.ensureDirSync(import_path.default.join(root, "canvases"));
};
var getStorageDir = () => STORAGE_DIR;
var setStorageRoot = async (root) => {
  const trimmed = root.trim();
  if (!trimmed) return;
  STORAGE_DIR = trimmed;
  META_DIR = import_path.default.join(STORAGE_DIR, "meta");
  IMAGE_DIR = import_path.default.join(STORAGE_DIR, "images");
  CANVAS_TEMP_DIR = import_path.default.join(STORAGE_DIR, "canvas_temp");
  CANVASES_DIR = import_path.default.join(STORAGE_DIR, "canvases");
  GALLERY_ORDER_FILE = import_path.default.join(STORAGE_DIR, "gallery_order.json");
  SETTINGS_FILE = import_path.default.join(STORAGE_DIR, "settings.json");
  ensureStorageDirs(STORAGE_DIR);
  await import_fs_extra.default.writeJson(CONFIG_FILE, { storageDir: STORAGE_DIR });
};
var readSettings = async () => {
  if (!await import_fs_extra.default.pathExists(SETTINGS_FILE)) {
    return {};
  }
  try {
    const raw = await import_fs_extra.default.readJson(SETTINGS_FILE);
    if (raw && typeof raw === "object") {
      return raw;
    }
  } catch (error) {
    console.error("Failed to read settings file", error);
  }
  return {};
};
var writeSettings = async (settings) => {
  try {
    await import_fs_extra.default.writeJson(SETTINGS_FILE, settings);
  } catch (error) {
    console.error("Failed to write settings file", error);
  }
};
ensureStorageDirs(STORAGE_DIR);
var PythonMetaService = class {
  process = null;
  queue = [];
  getUvCandidates() {
    var _a, _b;
    const candidates = [];
    if (import_electron.app.isPackaged) {
      if (process.platform === "win32") {
        candidates.push(import_path.default.join(process.resourcesPath, "bin", "uv.exe"));
      } else if (process.platform === "darwin") {
        candidates.push(
          import_path.default.join(
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
        candidates.push(import_path.default.join(import_electron.app.getAppPath(), "bin", "win32", "uv.exe"));
      } else if (process.platform === "darwin") {
        candidates.push(
          import_path.default.join(
            import_electron.app.getAppPath(),
            "bin",
            "mac",
            "arm64",
            "uv"
          )
        );
      }
    }
    const env = (_a = process.env.PROREF_UV_PATH) == null ? void 0 : _a.trim();
    if (env) candidates.push(env);
    const home = (_b = process.env.HOME) == null ? void 0 : _b.trim();
    if (home) {
      const versions = ["3.14", "3.13", "3.12", "3.11", "3.10"];
      for (const v of versions) {
        candidates.push(import_path.default.join(home, "Library", "Python", v, "bin", "uv"));
      }
      candidates.push(import_path.default.join(home, ".local", "bin", "uv"));
    }
    candidates.push("/opt/homebrew/bin/uv", "/usr/local/bin/uv", "uv");
    const uniq = [];
    const seen = /* @__PURE__ */ new Set();
    for (const c of candidates) {
      if (!c) continue;
      if (seen.has(c)) continue;
      seen.add(c);
      uniq.push(c);
    }
    return uniq;
  }
  attachProcess(proc) {
    var _a;
    if (!proc.stdout) {
      console.error("Failed to spawn python process stdout");
      return;
    }
    const rl = import_readline.default.createInterface({ input: proc.stdout });
    rl.on("line", (line) => {
      const task = this.queue.shift();
      if (task) {
        try {
          const res = JSON.parse(line);
          task.resolve(res);
        } catch (e) {
          console.error("JSON parse error from python:", e);
          task.resolve({ error: "invalid-json" });
        }
      }
    });
    (_a = proc.stderr) == null ? void 0 : _a.on("data", (data) => {
      const output = data.toString();
      const lines = output.split(/\r?\n/).filter((l) => l.trim().length > 0);
      for (const line of lines) {
        if (line.startsWith("[INFO]") || line.includes("Python vector service started") || line.includes("Model loaded")) {
          console.log("[Python Service]", line.replace("[INFO]", "").trim());
        } else {
          console.error("[Python Error]", line);
        }
      }
    });
    proc.on("exit", (code) => {
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
  spawnProcess(command, args, cwd) {
    const env = {
      ...process.env,
      PROREF_MODEL_DIR: import_path.default.join(getStorageDir(), "model"),
      // Use Aliyun mirror for PyPI (often more stable/accessible)
      UV_INDEX_URL: "https://mirrors.aliyun.com/pypi/simple/",
      // Also set PIP_INDEX_URL as fallback/standard
      PIP_INDEX_URL: "https://mirrors.aliyun.com/pypi/simple/",
      // Use HF mirror for model downloads
      HF_ENDPOINT: "https://hf-mirror.com"
    };
    const proc = (0, import_child_process.spawn)(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      cwd,
      env
    });
    this.attachProcess(proc);
    return proc;
  }
  start() {
    if (this.process) return;
    let scriptPath = import_path.default.join(__dirname, "../backend/python/tagger.py");
    if (import_electron.app.isPackaged) {
      scriptPath = scriptPath.replace("app.asar", "app.asar.unpacked");
    }
    const pythonDir = import_path.default.dirname(scriptPath);
    const uvArgs = ["run", "python", scriptPath];
    const uvCandidates = this.getUvCandidates();
    const trySpawn = (index) => {
      if (index >= uvCandidates.length) {
        console.error("Failed to spawn python vector service: uv not found");
        this.process = null;
        return;
      }
      const command = uvCandidates[index];
      if (import_path.default.isAbsolute(command) && !import_fs_extra.default.pathExistsSync(command)) {
        trySpawn(index + 1);
        return;
      }
      const proc = this.spawnProcess(command, uvArgs, pythonDir);
      this.process = proc;
      proc.once("error", (err) => {
        const code = err.code;
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
  downloadModel(onProgress) {
    return new Promise((resolve, reject) => {
      let scriptPath = import_path.default.join(__dirname, "../backend/python/tagger.py");
      if (import_electron.app.isPackaged) {
        scriptPath = scriptPath.replace("app.asar", "app.asar.unpacked");
      }
      const pythonDir = import_path.default.dirname(scriptPath);
      const uvArgs = ["run", "python", scriptPath, "--download-model"];
      const uvCandidates = this.getUvCandidates();
      const trySpawn = (index) => {
        var _a;
        if (index >= uvCandidates.length) {
          reject(new Error("Failed to spawn python service: uv not found"));
          return;
        }
        const command = uvCandidates[index];
        if (import_path.default.isAbsolute(command) && !import_fs_extra.default.pathExistsSync(command)) {
          trySpawn(index + 1);
          return;
        }
        const env = {
          ...process.env,
          PROREF_MODEL_DIR: import_path.default.join(getStorageDir(), "model"),
          UV_INDEX_URL: "https://mirrors.aliyun.com/pypi/simple/",
          PIP_INDEX_URL: "https://mirrors.aliyun.com/pypi/simple/",
          HF_ENDPOINT: "https://hf-mirror.com"
        };
        const proc = (0, import_child_process.spawn)(command, uvArgs, {
          stdio: ["pipe", "pipe", "pipe"],
          cwd: pythonDir,
          env
        });
        if (proc.stdout) {
          const rl = import_readline.default.createInterface({ input: proc.stdout });
          rl.on("line", (line) => {
            try {
              const res = JSON.parse(line);
              onProgress(res);
            } catch {
            }
          });
        }
        (_a = proc.stderr) == null ? void 0 : _a.on("data", (data) => {
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
          const code = err.code;
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
  async run(mode, arg) {
    if (!this.process) {
      this.start();
    }
    const raw = await new Promise((resolve, reject) => {
      var _a;
      this.queue.push({ resolve, reject });
      if ((_a = this.process) == null ? void 0 : _a.stdin) {
        this.process.stdin.write(JSON.stringify({ mode, arg }) + "\n");
      } else {
        resolve({ error: "stdin-unavailable" });
      }
    });
    if (!raw || typeof raw !== "object") return null;
    const res = raw;
    if (res.error) return null;
    if (Array.isArray(res.vector)) return res.vector;
    return null;
  }
  async runDominantColor(arg) {
    if (!this.process) {
      this.start();
    }
    const raw = await new Promise((resolve, reject) => {
      var _a;
      this.queue.push({ resolve, reject });
      if ((_a = this.process) == null ? void 0 : _a.stdin) {
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
    const res = raw;
    if (res.error) return null;
    if (typeof res.dominantColor === "string" && res.dominantColor.trim()) {
      return res.dominantColor.trim();
    }
    return null;
  }
  async runTone(arg) {
    if (!this.process) {
      this.start();
    }
    const raw = await new Promise((resolve, reject) => {
      var _a;
      this.queue.push({ resolve, reject });
      if ((_a = this.process) == null ? void 0 : _a.stdin) {
        this.process.stdin.write(
          JSON.stringify({ mode: "calculate-tone", arg }) + "\n"
        );
      } else {
        resolve({ error: "stdin-unavailable" });
      }
    });
    if (!raw || typeof raw !== "object") return null;
    const res = raw;
    if (res.error) return null;
    if (typeof res.tone === "string" && res.tone.trim()) {
      return res.tone.trim();
    }
    return null;
  }
};
var mapModelDownloadProgress = (data) => {
  if (!data || typeof data !== "object") return data;
  const d = data;
  const type = d.type;
  if (type === "error") {
    return { type: "error", reason: typeof d.message === "string" ? d.message : String(d.message ?? "") };
  }
  if (type === "weight-failed") {
    return {
      type: "weight-failed",
      filename: typeof d.filename === "string" ? d.filename : void 0,
      reason: typeof d.message === "string" ? d.message : String(d.message ?? "")
    };
  }
  if (type === "retry") {
    return {
      type: "retry",
      filename: typeof d.filename === "string" ? d.filename : void 0,
      reason: typeof d.message === "string" ? d.message : String(d.message ?? ""),
      attempt: typeof d.attempt === "number" ? d.attempt : void 0,
      nextWaitSeconds: typeof d.nextWaitSeconds === "number" ? d.nextWaitSeconds : void 0
    };
  }
  return data;
};
var KeyedMutex = class {
  chains = /* @__PURE__ */ new Map();
  async run(key, fn) {
    const currentChain = this.chains.get(key) || Promise.resolve();
    const nextPromise = currentChain.then(
      () => fn(),
      () => fn()
    );
    const storedPromise = nextPromise.then(
      () => {
      },
      () => {
      }
    );
    this.chains.set(key, storedPromise);
    storedPromise.then(() => {
      if (this.chains.get(key) === storedPromise) {
        this.chains.delete(key);
      }
    });
    return nextPromise;
  }
};
function downloadImage(url, dest) {
  return new Promise((resolve, reject) => {
    if (url.startsWith("file://") || url.startsWith("/")) {
      let srcPath = url;
      if (url.startsWith("file://")) {
        srcPath = new URL(url).pathname;
        if (process.platform === "win32" && srcPath.startsWith("/") && srcPath.includes(":")) {
          srcPath = srcPath.substring(1);
        }
      }
      srcPath = decodeURIComponent(srcPath);
      import_fs_extra.default.copy(srcPath, dest).then(() => resolve()).catch((err) => {
        import_fs_extra.default.unlink(dest, () => {
        });
        reject(err);
      });
      return;
    }
    const file = import_fs_extra.default.createWriteStream(dest);
    const client = url.startsWith("https") ? import_https.default : import_http.default;
    const request = client.get(url, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      } else {
        file.close();
        import_fs_extra.default.unlink(dest, () => {
        });
        reject(
          new Error(
            `Server responded with ${response.statusCode}: ${response.statusMessage}`
          )
        );
      }
    });
    request.on("error", (err) => {
      import_fs_extra.default.unlink(dest, () => {
      });
      reject(err);
    });
    file.on("error", (err) => {
      import_fs_extra.default.unlink(dest, () => {
      });
      reject(err);
    });
  });
}
var YOUDAO_API_ENDPOINT = "https://openapi.youdao.com/api";
var YOUDAO_APP_KEY = "6cd66a17b06e2f25";
var YOUDAO_APP_SECRET = "JFkAkZrB9UtVXfx2qmcThkkQHEV9CO3U";
function buildYoudaoSignInput(q) {
  if (q.length <= 20) return q;
  const head = q.slice(0, 10);
  const tail = q.slice(-10);
  return `${head}${q.length}${tail}`;
}
function buildYoudaoSign(q, salt, curtime, appKey, appSecret) {
  const input = buildYoudaoSignInput(q);
  const raw = `${appKey}${input}${salt}${curtime}${appSecret}`;
  return import_crypto.default.createHash("sha256").update(raw).digest("hex");
}
async function translateToEnglish(text) {
  const trimmed = text.trim();
  if (!trimmed) return { text };
  const appKey = YOUDAO_APP_KEY;
  const appSecret = YOUDAO_APP_SECRET;
  if (!appKey || !appSecret) {
    console.warn("Youdao translation credentials are not configured");
    return { text };
  }
  try {
    const salt = import_crypto.default.randomUUID();
    const curtime = Math.floor(Date.now() / 1e3).toString();
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
      body: params.toString()
    });
    if (!res.ok) {
      console.error(
        "Youdao translation HTTP error",
        res.status,
        res.statusText
      );
      return { text };
    }
    const data = await res.json();
    if (data && typeof data === "object" && "errorCode" in data) {
      const errorCode = data.errorCode;
      if (errorCode === "0") {
        const translations = data.translation;
        if (Array.isArray(translations) && typeof translations[0] === "string") {
          const translated = translations[0].trim();
          if (translated) {
            console.log("query translated via Youdao", translated);
            return { text: translated };
          }
        }
      } else if (errorCode === "411") {
        console.warn("Youdao translation rate limited (411), falling back to original text");
        return {
          text,
          warning: "Translation rate limited (411), using original text"
        };
      } else {
        console.error("Youdao translation unexpected response", data);
        return {
          text,
          warning: `Translation failed (Code: ${errorCode || "unknown"}), using original text`
        };
      }
    } else {
      console.error("Youdao translation unexpected response", data);
      return {
        text,
        warning: "Translation unexpected response, using original text"
      };
    }
    return { text };
  } catch (e) {
    console.error("Youdao translation failed", e);
    return {
      text,
      warning: "Translation failed (Network/Error), using original text"
    };
  }
}
async function startServer(sendToRenderer) {
  const server = (0, import_express.default)();
  server.use((0, import_cors.default)());
  server.use(import_body_parser.default.json({ limit: "25mb" }));
  const metaMutex = new KeyedMutex();
  class StorageIncompatibleError extends Error {
    constructor(message) {
      super(message);
      this.name = "StorageIncompatibleError";
    }
  }
  const getCanvasPaths = (name) => {
    const safeName = name.replace(/[/\\:*?"<>|]/g, "_") || "Default";
    const dir = import_path.default.join(CANVASES_DIR, safeName);
    return {
      dir,
      dataFile: import_path.default.join(dir, "canvas.json"),
      viewportFile: import_path.default.join(dir, "canvas_viewport.json")
    };
  };
  const ensureDefaultCanvas = async () => {
    const defaultCanvasPath = import_path.default.join(CANVASES_DIR, "Default");
    const canvases = await import_fs_extra.default.readdir(CANVASES_DIR).catch(() => []);
    if (canvases.length === 0) {
      await import_fs_extra.default.ensureDir(defaultCanvasPath);
    }
  };
  await ensureDefaultCanvas();
  server.get("/api/canvases", async (_req, res) => {
    try {
      const dirs = await import_fs_extra.default.readdir(CANVASES_DIR);
      const canvases = [];
      for (const dir of dirs) {
        const fullPath = import_path.default.join(CANVASES_DIR, dir);
        try {
          const stat = await import_fs_extra.default.stat(fullPath);
          if (stat.isDirectory()) {
            canvases.push({ name: dir, lastModified: stat.mtimeMs });
          }
        } catch {
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
      const { name } = req.body;
      if (!name || !name.trim()) {
        res.status(400).json({ error: "Canvas name is required" });
        return;
      }
      const paths = getCanvasPaths(name);
      if (await import_fs_extra.default.pathExists(paths.dir)) {
        res.status(409).json({ error: "Canvas already exists" });
        return;
      }
      await import_fs_extra.default.ensureDir(paths.dir);
      res.json({ success: true, name: import_path.default.basename(paths.dir) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  server.post("/api/canvases/rename", async (req, res) => {
    try {
      const { oldName, newName } = req.body;
      if (!oldName || !newName) {
        res.status(400).json({ error: "Both oldName and newName are required" });
        return;
      }
      const oldPaths = getCanvasPaths(oldName);
      const newPaths = getCanvasPaths(newName);
      if (!await import_fs_extra.default.pathExists(oldPaths.dir)) {
        res.status(404).json({ error: "Canvas not found" });
        return;
      }
      if (await import_fs_extra.default.pathExists(newPaths.dir)) {
        res.status(409).json({ error: "Target canvas name already exists" });
        return;
      }
      await import_fs_extra.default.rename(oldPaths.dir, newPaths.dir);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  server.post("/api/canvases/delete", async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) {
        res.status(400).json({ error: "Canvas name is required" });
        return;
      }
      const paths = getCanvasPaths(name);
      if (await import_fs_extra.default.pathExists(paths.dir)) {
        await import_fs_extra.default.remove(paths.dir);
      }
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  const normalizeTags = (tags) => {
    if (!Array.isArray(tags)) return [];
    return tags.filter((t2) => typeof t2 === "string");
  };
  const toStoredMeta = (data, relativePath) => {
    return {
      image: relativePath,
      pageUrl: data.pageUrl,
      tags: normalizeTags(data.tags),
      createdAt: data.createdAt,
      vector: Array.isArray(data.vector) ? data.vector : null,
      dominantColor: typeof data.dominantColor === "string" ? data.dominantColor : null,
      tone: typeof data.tone === "string" ? data.tone : null
    };
  };
  const readAllDiskMeta = async () => {
    const result = [];
    if (!await import_fs_extra.default.pathExists(META_DIR)) return result;
    const files = await import_fs_extra.default.readdir(META_DIR);
    const metaFiles = files.filter((f) => f.endsWith(".json"));
    for (const file of metaFiles) {
      try {
        const fullPath = import_path.default.join(META_DIR, file);
        const raw = await import_fs_extra.default.readJson(fullPath);
        let relativePath = raw.image;
        if (!relativePath) {
          const imageName = file.slice(0, -5);
          relativePath = import_path.default.join("images", imageName);
        }
        const localPath = import_path.default.join(STORAGE_DIR, relativePath);
        if (!await import_fs_extra.default.pathExists(localPath)) {
          await import_fs_extra.default.remove(fullPath);
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
  async function runPythonVector(mode, arg) {
    return vectorService.run(mode, arg);
  }
  async function runPythonDominantColor(arg) {
    return vectorService.runDominantColor(arg);
  }
  async function runPythonTone(arg) {
    return vectorService.runTone(arg);
  }
  async function processImageImport(source, metadata) {
    const timestamp = Date.now();
    const sanitizeBase = (raw) => {
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
    const normalizeExt = (raw) => {
      if (!raw) return null;
      const trimmed = raw.trim();
      if (!trimmed) return null;
      const withDot = trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
      if (!/^\.[a-zA-Z0-9]{1,10}$/.test(withDot)) return null;
      return withDot.toLowerCase();
    };
    const sourceFilename = source.type === "path" ? import_path.default.basename(source.data).split("?")[0] : "";
    const metaFilename = typeof metadata.filename === "string" ? metadata.filename.trim() : "";
    const metaName = typeof metadata.name === "string" ? metadata.name.trim() : "";
    const extFromMetaFilename = normalizeExt(import_path.default.extname(metaFilename));
    const extFromSource = normalizeExt(import_path.default.extname(sourceFilename));
    const extFromMetaName = normalizeExt(import_path.default.extname(metaName));
    const ext = extFromMetaFilename || extFromSource || extFromMetaName || (source.type === "buffer" ? ".png" : ".jpg");
    const baseNameFromMetaFilename = metaFilename ? import_path.default.basename(metaFilename, import_path.default.extname(metaFilename)) : "";
    const baseNameFromMetaName = metaName ? import_path.default.basename(metaName, import_path.default.extname(metaName)) : "";
    const baseNameFromSource = sourceFilename ? import_path.default.basename(sourceFilename, import_path.default.extname(sourceFilename)) : "";
    const rawBase = baseNameFromMetaFilename || baseNameFromMetaName || baseNameFromSource || `EMPTY_NAME_${timestamp}`;
    const safeName = sanitizeBase(rawBase);
    let filename = `${safeName}${ext}`;
    let counter = 1;
    while (await import_fs_extra.default.pathExists(import_path.default.join(IMAGE_DIR, filename))) {
      filename = `${safeName}_${counter}${ext}`;
      counter++;
    }
    const relativePath = import_path.default.join("images", filename);
    const localPath = import_path.default.join(STORAGE_DIR, relativePath);
    if (source.type === "buffer") {
      await import_fs_extra.default.writeFile(localPath, source.data);
    } else if (source.type === "path") {
      let srcPath = source.data;
      if (srcPath.startsWith("file://")) {
        srcPath = new URL(srcPath).pathname;
        if (process.platform === "win32" && srcPath.startsWith("/") && srcPath.includes(":")) {
          srcPath = srcPath.substring(1);
        }
      }
      srcPath = decodeURIComponent(srcPath);
      await import_fs_extra.default.copy(srcPath, localPath);
    } else {
      await downloadImage(source.data, localPath);
    }
    const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
    const id = filename;
    const diskMeta = {
      image: relativePath,
      pageUrl: metadata.pageUrl,
      tags,
      createdAt: timestamp,
      vector: null,
      dominantColor: null,
      tone: null
    };
    await import_fs_extra.default.writeJson(import_path.default.join(META_DIR, `${id}.json`), diskMeta);
    const meta = toStoredMeta(diskMeta, relativePath);
    void (async () => {
      const settings = await readSettings();
      const enableVectorSearch = Boolean(settings.enableVectorSearch);
      if (enableVectorSearch) {
        const vector = await runPythonVector("encode-image", localPath);
        if (!vector) {
          console.error("Vector generation failed for", localPath);
          return;
        }
        const metaPath = import_path.default.join(META_DIR, `${id}.json`);
        await metaMutex.run(metaPath, async () => {
          try {
            if (await import_fs_extra.default.pathExists(metaPath)) {
              const currentRaw = await import_fs_extra.default.readJson(metaPath);
              const updated = {
                ...currentRaw,
                vector
              };
              await import_fs_extra.default.writeJson(metaPath, updated);
              sendToRenderer == null ? void 0 : sendToRenderer("image-updated", toStoredMeta(updated, updated.image));
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
      const metaPath = import_path.default.join(META_DIR, `${id}.json`);
      await metaMutex.run(metaPath, async () => {
        try {
          if (await import_fs_extra.default.pathExists(metaPath)) {
            const currentRaw = await import_fs_extra.default.readJson(metaPath);
            const updated = {
              ...currentRaw,
              dominantColor
            };
            await import_fs_extra.default.writeJson(metaPath, updated);
            sendToRenderer == null ? void 0 : sendToRenderer("image-updated", toStoredMeta(updated, updated.image));
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
      const metaPath = import_path.default.join(META_DIR, `${id}.json`);
      await metaMutex.run(metaPath, async () => {
        try {
          if (await import_fs_extra.default.pathExists(metaPath)) {
            const currentRaw = await import_fs_extra.default.readJson(metaPath);
            const updated = {
              ...currentRaw,
              tone
            };
            await import_fs_extra.default.writeJson(metaPath, updated);
            sendToRenderer == null ? void 0 : sendToRenderer("image-updated", toStoredMeta(updated, updated.image));
          }
        } catch (e) {
          console.error("Failed to update meta with tone", e);
        }
      });
    })();
    sendToRenderer == null ? void 0 : sendToRenderer("new-collection", meta);
    return meta;
  }
  server.post("/api/import-blob", async (req, res) => {
    try {
      const { imageBase64, filename } = req.body;
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
      res.status(500).json({ error: "Failed to import blob", details: message });
    }
  });
  server.post("/api/collect", async (req, res) => {
    try {
      const { imageUrl, pageUrl, filename, tags, name } = req.body;
      console.log("Received collection request:", imageUrl);
      let type = "url";
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
      res.status(500).json({ error: "Failed to collect image", details: message });
    }
  });
  server.get("/api/images", async (_req, res) => {
    try {
      const diskItems = await readAllDiskMeta();
      const items = diskItems.map((m) => toStoredMeta(m.meta, m.relativePath));
      let order = [];
      if (await import_fs_extra.default.pathExists(GALLERY_ORDER_FILE)) {
        try {
          order = await import_fs_extra.default.readJson(GALLERY_ORDER_FILE);
        } catch (e) {
          console.error("Failed to read gallery order:", e);
        }
      }
      if (order.length > 0) {
        const orderMap = new Map(order.map((id, index) => [id, index]));
        items.sort((a, b) => {
          const indexA = orderMap.get(a.image);
          const indexB = orderMap.get(b.image);
          if (indexA !== void 0 && indexB !== void 0) {
            return indexA - indexB;
          }
          if (indexA === void 0 && indexB !== void 0) {
            return -1;
          }
          if (indexA !== void 0 && indexB === void 0) {
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
      const allTags = /* @__PURE__ */ new Set();
      for (const item of diskItems) {
        if (Array.isArray(item.meta.tags)) {
          for (const t2 of item.meta.tags) {
            if (typeof t2 === "string" && t2.trim()) {
              allTags.add(t2.trim());
            }
          }
        }
      }
      const settings = await readSettings();
      const tagColors = settings.tagColors || {};
      const result = Array.from(allTags).sort().map((tag) => ({
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
      const { order } = req.body;
      if (!Array.isArray(order)) {
        res.status(400).json({ error: "Order must be an array of IDs" });
        return;
      }
      await import_fs_extra.default.writeJson(GALLERY_ORDER_FILE, order);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Save gallery order error:", error);
      res.status(500).json({ error: "Failed to save gallery order", details: message });
    }
  });
  server.post("/api/download-model", async (req, res) => {
    try {
      vectorService.downloadModel((data) => {
        sendToRenderer == null ? void 0 : sendToRenderer("model-download-progress", mapModelDownloadProgress(data));
      }).catch((err) => {
        console.error("Model download failed", err);
        sendToRenderer == null ? void 0 : sendToRenderer("model-download-progress", { type: "error", reason: String(err) });
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
      const value = Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : null;
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
      const { value } = req.body;
      const settings = await readSettings();
      const next = { ...settings, [key]: value };
      await writeSettings(next);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  server.post("/api/delete", async (req, res) => {
    try {
      const { image } = req.body;
      if (!image) {
        res.status(400).json({ error: "Image path is required" });
        return;
      }
      try {
        if (await import_fs_extra.default.pathExists(GALLERY_ORDER_FILE)) {
          const order = await import_fs_extra.default.readJson(GALLERY_ORDER_FILE);
          if (Array.isArray(order)) {
            const newOrder = order.filter((itemImage) => itemImage !== image);
            if (newOrder.length !== order.length) {
              await import_fs_extra.default.writeJson(GALLERY_ORDER_FILE, newOrder);
            }
          }
        }
      } catch (e) {
        console.error("Failed to update gallery order on delete", e);
      }
      const filename = import_path.default.basename(image);
      const metaPath = import_path.default.join(META_DIR, `${filename}.json`);
      await metaMutex.run(metaPath, async () => {
        if (await import_fs_extra.default.pathExists(metaPath)) {
          const meta = await import_fs_extra.default.readJson(metaPath);
          const relativePath = meta.image;
          const localPath = import_path.default.join(STORAGE_DIR, relativePath);
          if (await import_fs_extra.default.pathExists(localPath)) {
            await import_fs_extra.default.remove(localPath);
          }
          await import_fs_extra.default.remove(metaPath);
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
      const { oldTag, newTag } = req.body;
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
      if (await import_fs_extra.default.pathExists(META_DIR)) {
        const files = await import_fs_extra.default.readdir(META_DIR);
        const metaFiles = files.filter((f) => f.endsWith(".json"));
        for (const file of metaFiles) {
          const metaPath = import_path.default.join(META_DIR, file);
          await metaMutex.run(metaPath, async () => {
            if (await import_fs_extra.default.pathExists(metaPath)) {
              const current = await import_fs_extra.default.readJson(metaPath);
              if (Array.isArray(current.tags) && current.tags.includes(trimmedOld)) {
                const nextTags = current.tags.map(
                  (t2) => t2 === trimmedOld ? trimmedNew : t2
                );
                const uniqueTags = Array.from(new Set(nextTags));
                const updated = {
                  ...current,
                  tags: uniqueTags
                };
                await import_fs_extra.default.writeJson(metaPath, updated);
              }
            }
          });
        }
      }
      const settings = await readSettings();
      const tagColors = settings.tagColors || {};
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
      const { image, tags } = req.body;
      if (!image) {
        res.status(400).json({ error: "Image path is required" });
        return;
      }
      const filename = import_path.default.basename(image);
      const metaPath = import_path.default.join(META_DIR, `${filename}.json`);
      await metaMutex.run(metaPath, async () => {
        if (await import_fs_extra.default.pathExists(metaPath)) {
          const current = await import_fs_extra.default.readJson(metaPath);
          const nextTags = normalizeTags(tags);
          const updated = {
            ...current,
            tags: nextTags
          };
          await import_fs_extra.default.writeJson(metaPath, updated);
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
      const { image, dominantColor } = req.body;
      if (!image) {
        res.status(400).json({ error: "Image path is required" });
        return;
      }
      let next = null;
      if (dominantColor === null || dominantColor === void 0) {
        next = null;
      } else if (typeof dominantColor === "string") {
        const trimmed = dominantColor.trim();
        if (!trimmed) {
          next = null;
        } else if (/^#[0-9a-fA-F]{6}$/.test(trimmed) || /^#[0-9a-fA-F]{3}$/.test(trimmed)) {
          next = trimmed;
        } else {
          res.status(400).json({ error: "dominantColor must be a hex color like #RRGGBB" });
          return;
        }
      } else {
        res.status(400).json({ error: "dominantColor must be a string or null" });
        return;
      }
      const filename = import_path.default.basename(image);
      const metaPath = import_path.default.join(META_DIR, `${filename}.json`);
      if (await import_fs_extra.default.pathExists(metaPath)) {
        const current = await import_fs_extra.default.readJson(metaPath);
        const updated = {
          ...current,
          dominantColor: next
        };
        await import_fs_extra.default.writeJson(metaPath, updated);
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
      const { image, name } = req.body;
      if (!image) {
        res.status(400).json({ error: "Image path is required" });
        return;
      }
      if (typeof name !== "string" || !name.trim()) {
        res.status(400).json({ error: "name is required" });
        return;
      }
      const rawName = name.trim();
      const oldFilename = import_path.default.basename(image);
      const metaPath = import_path.default.join(META_DIR, `${oldFilename}.json`);
      await metaMutex.run(metaPath, async () => {
        if (!await import_fs_extra.default.pathExists(metaPath)) {
          res.status(404).json({ error: "Image meta not found" });
          return;
        }
        const current = await import_fs_extra.default.readJson(metaPath);
        const oldRelPath = current.image;
        const oldLocalPath = import_path.default.join(STORAGE_DIR, oldRelPath);
        if (!await import_fs_extra.default.pathExists(oldLocalPath)) {
          res.status(404).json({ error: "Image file not found" });
          return;
        }
        const ext = import_path.default.extname(oldRelPath);
        const base = rawName.replace(/[/\\:*?"<>|]+/g, "_").trim() || "image";
        let newFilename = `${base}${ext}`;
        let counter = 1;
        while (await import_fs_extra.default.pathExists(import_path.default.join(IMAGE_DIR, newFilename))) {
          const existingFull = import_path.default.join(IMAGE_DIR, newFilename);
          const currentFull = import_path.default.join(
            IMAGE_DIR,
            import_path.default.basename(oldRelPath).split("?")[0] || import_path.default.basename(oldRelPath)
          );
          if (existingFull === currentFull) {
            break;
          }
          newFilename = `${base}_${counter}${ext}`;
          counter += 1;
        }
        const newRelPath = import_path.default.join("images", newFilename);
        const newLocalPath = import_path.default.join(STORAGE_DIR, newRelPath);
        if (oldLocalPath !== newLocalPath) {
          await import_fs_extra.default.rename(oldLocalPath, newLocalPath);
        }
        const newMetaPath = import_path.default.join(META_DIR, `${newFilename}.json`);
        const updated = {
          ...current,
          image: newRelPath
        };
        if (oldFilename !== newFilename) {
          await import_fs_extra.default.writeJson(newMetaPath, updated);
          await import_fs_extra.default.remove(metaPath);
          if (await import_fs_extra.default.pathExists(GALLERY_ORDER_FILE)) {
            try {
              const order = await import_fs_extra.default.readJson(GALLERY_ORDER_FILE);
              if (Array.isArray(order)) {
                const nextOrder = order.map((oid) => oid === oldRelPath ? newRelPath : oid);
                await import_fs_extra.default.writeJson(GALLERY_ORDER_FILE, nextOrder);
              }
            } catch (e) {
              console.error("Failed to update gallery order on rename", e);
            }
          }
          try {
            const canvasDirs = await import_fs_extra.default.readdir(CANVASES_DIR);
            for (const dir of canvasDirs) {
              const canvasFile = import_path.default.join(CANVASES_DIR, dir, "canvas.json");
              if (await import_fs_extra.default.pathExists(canvasFile)) {
                try {
                  const canvasData = await import_fs_extra.default.readJson(canvasFile);
                  if (Array.isArray(canvasData)) {
                    let hasChanges = false;
                    const nextCanvasData = canvasData.map((item) => {
                      if (item.type === "image" && item.image === oldRelPath) {
                        hasChanges = true;
                        return { ...item, image: newRelPath };
                      }
                      return item;
                    });
                    if (hasChanges) {
                      await import_fs_extra.default.writeJson(canvasFile, nextCanvasData);
                    }
                  }
                } catch {
                }
              }
            }
          } catch (e) {
            console.error("Failed to update canvas data on rename", e);
          }
        } else {
          await import_fs_extra.default.writeJson(metaPath, updated);
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
      const { image } = req.body;
      if (!image) {
        res.status(400).json({ error: "Image path is required" });
        return;
      }
      const filename = import_path.default.basename(image);
      const metaPath = import_path.default.join(META_DIR, `${filename}.json`);
      if (await import_fs_extra.default.pathExists(metaPath)) {
        const current = await import_fs_extra.default.readJson(metaPath);
        const relativePath = current.image;
        const localPath = import_path.default.join(STORAGE_DIR, relativePath);
        const vector = await runPythonVector("encode-image", localPath);
        if (vector) {
          const updated = {
            ...current,
            vector
          };
          await import_fs_extra.default.writeJson(metaPath, updated);
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
      await import_fs_extra.default.ensureDir(IMAGE_DIR);
      await import_fs_extra.default.ensureDir(META_DIR);
      const imageFiles = await import_fs_extra.default.readdir(IMAGE_DIR);
      imageFiles.sort();
      const imageSet = /* @__PURE__ */ new Set();
      for (const file of imageFiles) {
        const full = import_path.default.join(IMAGE_DIR, file);
        const stat = await import_fs_extra.default.stat(full);
        if (stat.isFile()) {
          imageSet.add(file);
        }
      }
      const metaFiles = await import_fs_extra.default.readdir(META_DIR);
      const metaByImage = /* @__PURE__ */ new Map();
      for (const file of metaFiles) {
        if (!file.endsWith(".json")) continue;
        const fullPath = import_path.default.join(META_DIR, file);
        try {
          const raw = await import_fs_extra.default.readJson(fullPath);
          const imageVal = typeof raw.image === "string" ? raw.image.trim() : "";
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
          if (typeof createdAtRaw !== "number" || !Number.isFinite(createdAtRaw)) {
            throw new StorageIncompatibleError(
              `Storage format is incompatible: missing createdAt. Please reset the data folder. (meta: ${fullPath})`
            );
          }
          const createdAt = createdAtRaw;
          const imageName = import_path.default.basename(normalizedImage);
          if (!imageName) continue;
          const expectedRel = import_path.default.join("images", imageName).replace(/\\/g, "/");
          if (normalizedImage !== expectedRel) {
            throw new StorageIncompatibleError(
              `Storage format is incompatible: invalid image path "${imageVal}". Please reset the data folder. (meta: ${fullPath})`
            );
          }
          const normalized = {
            image: expectedRel,
            pageUrl: typeof raw.pageUrl === "string" ? raw.pageUrl : void 0,
            tags: normalizeTags(raw.tags),
            createdAt,
            vector: Array.isArray(raw.vector) ? raw.vector : null,
            dominantColor: typeof raw.dominantColor === "string" ? raw.dominantColor : null,
            tone: typeof raw.tone === "string" ? raw.tone : null
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
      sendToRenderer == null ? void 0 : sendToRenderer("indexing-progress", {
        current: 0,
        total,
        statusKey: "indexing.starting"
      });
      for (const imageName of imageSet) {
        current++;
        if (current % 2 === 0 || current === total || current === 1) {
          sendToRenderer == null ? void 0 : sendToRenderer("indexing-progress", {
            current,
            total,
            statusKey: "indexing.progress",
            statusParams: { current, total }
          });
        }
        const imageRel = import_path.default.join("images", imageName);
        const imagePath = import_path.default.join(STORAGE_DIR, imageRel);
        let fileStat = null;
        try {
          fileStat = await import_fs_extra.default.stat(imagePath);
        } catch (e) {
          console.error("Failed to stat image file", imagePath, e);
        }
        const existing = metaByImage.get(imageName);
        if (existing) {
          const { meta, metaPath: metaPath2 } = existing;
          const currentMeta = {
            ...meta,
            image: imageRel
          };
          const hasVector = Array.isArray(currentMeta.vector) && currentMeta.vector.length > 0;
          const hasDominantColor = typeof currentMeta.dominantColor === "string" && currentMeta.dominantColor.trim().length > 0;
          const hasTone = typeof currentMeta.tone === "string" && currentMeta.tone.trim().length > 0;
          if ((hasVector || !enableVectorSearch) && hasDominantColor && hasTone) {
            continue;
          }
          const [vector2, dominantColor2, tone2] = await Promise.all([
            hasVector || !enableVectorSearch ? Promise.resolve(currentMeta.vector) : runPythonVector("encode-image", imagePath),
            hasDominantColor ? Promise.resolve(currentMeta.dominantColor) : runPythonDominantColor(imagePath),
            hasTone ? Promise.resolve(currentMeta.tone) : runPythonTone(imagePath)
          ]);
          const updatedMeta = {
            ...currentMeta,
            vector: vector2 && Array.isArray(vector2) ? vector2 : currentMeta.vector ?? null,
            dominantColor: typeof dominantColor2 === "string" ? dominantColor2 : currentMeta.dominantColor ?? null,
            tone: typeof tone2 === "string" ? tone2 : currentMeta.tone ?? null
          };
          const hasChanges = updatedMeta.vector !== (currentMeta.vector ?? null) || updatedMeta.dominantColor !== (currentMeta.dominantColor ?? null) || updatedMeta.tone !== (currentMeta.tone ?? null);
          if (hasChanges) {
            await import_fs_extra.default.writeJson(metaPath2, updatedMeta);
            updated += 1;
            sendToRenderer == null ? void 0 : sendToRenderer("image-updated", toStoredMeta(updatedMeta, imageRel));
          }
          continue;
        }
        const id = imageName;
        const baseMeta = {
          image: imageRel,
          pageUrl: void 0,
          tags: [],
          createdAt: (fileStat == null ? void 0 : fileStat.birthtimeMs) || (fileStat == null ? void 0 : fileStat.mtimeMs) || now,
          vector: null,
          dominantColor: null,
          tone: null
        };
        const [vector, dominantColor, tone] = await Promise.all([
          enableVectorSearch ? runPythonVector("encode-image", imagePath) : Promise.resolve(null),
          runPythonDominantColor(imagePath),
          runPythonTone(imagePath)
        ]);
        const finalMeta = {
          ...baseMeta,
          vector: vector && Array.isArray(vector) ? vector : null,
          dominantColor: typeof dominantColor === "string" ? dominantColor : null,
          tone: typeof tone === "string" ? tone : null
        };
        const metaPath = import_path.default.join(META_DIR, `${id}.json`);
        await import_fs_extra.default.writeJson(metaPath, finalMeta);
        created += 1;
        sendToRenderer == null ? void 0 : sendToRenderer("new-collection", toStoredMeta(finalMeta, imageRel));
      }
      for (const [imageName, { metaPath }] of metaByImage.entries()) {
        if (!imageSet.has(imageName)) {
          try {
            await import_fs_extra.default.remove(metaPath);
          } catch (e) {
            console.error("Failed to remove stale meta", metaPath, e);
          }
        }
      }
      sendToRenderer == null ? void 0 : sendToRenderer("indexing-progress", {
        current: total,
        total,
        statusKey: "indexing.completed"
      });
      res.json({ success: true, created, updated, images: imageSet.size });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Batch index error:", error);
      if (error instanceof Error && error.name === "StorageIncompatibleError") {
        res.status(409).json({
          error: "Storage is incompatible",
          details: message,
          code: "STORAGE_INCOMPATIBLE"
        });
        return;
      }
      res.status(500).json({ error: "Failed to index images", details: message });
    }
  });
  server.post("/api/open-in-folder", async (req, res) => {
    try {
      const { path: filePath, image } = req.body;
      let targetPath = filePath;
      if (image && !targetPath) {
        targetPath = import_path.default.join(STORAGE_DIR, image);
      }
      if (!targetPath) {
        res.status(400).json({ error: "Path or image is required" });
        return;
      }
      try {
        const stat = await import_fs_extra.default.stat(targetPath);
        if (stat.isDirectory()) {
          await import_electron.shell.openPath(targetPath);
          res.json({ success: true });
          return;
        }
        import_electron.shell.showItemInFolder(targetPath);
        res.json({ success: true });
        return;
      } catch {
        if (!import_path.default.isAbsolute(targetPath)) {
          const abs = import_path.default.join(STORAGE_DIR, targetPath);
          try {
            import_electron.shell.showItemInFolder(abs);
            res.json({ success: true });
            return;
          } catch {
          }
        }
        const dir = import_path.default.dirname(targetPath);
        await import_electron.shell.openPath(dir);
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
      const { path: filePath, image } = req.body;
      let targetPath = filePath;
      if (image && !targetPath) {
        targetPath = import_path.default.join(STORAGE_DIR, image);
      }
      if (!targetPath) {
        res.status(400).json({ error: "Path or image is required" });
        return;
      }
      await import_electron.shell.openPath(targetPath);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  server.post("/api/search", async (req, res) => {
    console.log("searching...");
    try {
      const { query, vector, limit, tags, color, tone, searchId, threshold } = req.body;
      const settings = await readSettings();
      const enableVectorSearch = Boolean(settings.enableVectorSearch);
      const trimmed = (query || "").trim();
      const resolvedSearchId = typeof searchId === "string" && searchId.trim() ? searchId.trim() : `search_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const normalizeTag = (t2) => t2.trim().toLowerCase();
      const queryTags = Array.isArray(tags) ? tags.filter((t2) => typeof t2 === "string") : [];
      const normalizedQueryTags = queryTags.map((t2) => normalizeTag(t2)).filter((t2) => t2.length > 0);
      const hasTagFilter = normalizedQueryTags.length > 0;
      const normalizeHexColor = (raw) => {
        if (typeof raw !== "string") return null;
        const val = raw.trim();
        if (!val) return null;
        const withHash = val.startsWith("#") ? val : `#${val}`;
        if (!/^#[0-9a-fA-F]{6}$/.test(withHash)) return null;
        return withHash.toLowerCase();
      };
      const hexToRgb = (hex) => {
        if (!/^#[0-9a-f]{6}$/i.test(hex)) return null;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        if ([r, g, b].some((n) => Number.isNaN(n))) return null;
        return { r, g, b };
      };
      const requestedColor = normalizeHexColor(color);
      const hasColorFilter = Boolean(requestedColor);
      const requestedTone = typeof tone === "string" && tone.trim() ? tone.trim() : null;
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
      const srgbToLinear = (x) => {
        const v = x / 255;
        return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      const rgbToOklab = (rgb) => {
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
          b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
        };
      };
      const isSimilarColor = (a, b) => {
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
      if (!trimmed && (!vector || vector.length === 0) && !hasTagFilter && !hasColorFilter && !hasToneFilter) {
        res.json([]);
        return;
      }
      const diskItems = await readAllDiskMeta();
      if (diskItems.length === 0) {
        res.json([]);
        return;
      }
      const items = diskItems.map((m) => toStoredMeta(m.meta, m.relativePath));
      const filterByTags = (source) => {
        if (!hasTagFilter) return source;
        return source.filter((item) => {
          const itemTags = Array.isArray(item.tags) ? item.tags : [];
          const normalizedItem = new Set(
            itemTags.map((t2) => normalizeTag(String(t2)))
          );
          return normalizedQueryTags.every((t2) => normalizedItem.has(t2));
        });
      };
      const filterByColor = (source) => {
        if (!requestedColor) return source;
        return source.filter(
          (item) => isSimilarColor(item.dominantColor, requestedColor)
        );
      };
      const filterByTone = (source) => {
        if (!requestedTone) return source;
        const result = source.filter((item) => item.tone === requestedTone);
        if (process.env.PROREF_DEBUG_SEARCH === "1") {
          console.log(`Tone filter: ${requestedTone}, Input: ${source.length}, Output: ${result.length}`);
        }
        return result;
      };
      const buildNameMatches = (source) => {
        const queryTokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
        const hasNameQuery2 = queryTokens.length > 0;
        const isNameMatch = (item) => {
          if (!hasNameQuery2) return false;
          const filename = import_path.default.basename(item.image);
          const nameWithoutExt = import_path.default.basename(filename, import_path.default.extname(filename));
          const hay = `${nameWithoutExt} ${item.image}`.toLowerCase();
          return queryTokens.every((t2) => hay.includes(t2));
        };
        const nameMatches2 = hasNameQuery2 ? source.filter(isNameMatch) : [];
        return { nameMatches: nameMatches2, hasNameQuery: hasNameQuery2, queryTokens };
      };
      const buildFastResult = (params) => {
        const { candidates, nameMatches: nameMatches2, hasNameQuery: hasNameQuery2, topN: topN2 } = params;
        if (hasNameQuery2) {
          return nameMatches2.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, topN2).map((item) => ({
            ...item,
            score: 1,
            matchedType: "exact"
          }));
        }
        if (!hasTagFilter && !hasColorFilter && !hasToneFilter) {
          return [];
        }
        return candidates.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, topN2).map((item) => ({
          ...item,
          score: 1,
          matchedType: "exact"
        }));
      };
      const runVectorFlow = async (params) => {
        const { candidates, nameMatches: nameMatches2, topN: topN2, threshold: threshold2 } = params;
        if (!enableVectorSearch) {
          return;
        }
        const dotSimilarity = (a, b) => {
          const length = Math.min(a.length, b.length);
          if (length === 0) return -1;
          let dot = 0;
          for (let i = 0; i < length; i += 1) {
            dot += a[i] * b[i];
          }
          return dot;
        };
        try {
          const actualQueryVector = vector && vector.length > 0 ? vector : trimmed ? await (async () => {
            const translation = await translateToEnglish(trimmed);
            if (translation.warning) {
              sendToRenderer == null ? void 0 : sendToRenderer("toast", {
                key: "toast.translationWarning",
                params: { warning: translation.warning },
                type: "warning"
              });
            }
            return runPythonVector("encode-text", translation.text);
          })() : null;
          if (!actualQueryVector) {
            return;
          }
          const results = candidates.map((item) => {
            if (Array.isArray(item.vector)) {
              const score = dotSimilarity(item.vector, actualQueryVector);
              return { item, score, matchedType: "vector" };
            }
            return { item, score: -1, matchedType: "vector" };
          });
          let baseMinScore;
          if (typeof threshold2 === "number") {
            baseMinScore = threshold2;
          } else if (hasTagFilter) {
            baseMinScore = -1;
          } else {
            baseMinScore = 0.1;
          }
          const bestScore = results.reduce(
            (max, r) => r.score > max ? r.score : max,
            -1
          );
          const dynamicMinScore = Math.max(baseMinScore, bestScore - 0.08);
          const filtered = results.filter((r) => r.score >= dynamicMinScore);
          filtered.sort(
            (a, b) => b.score - a.score || b.item.createdAt - a.item.createdAt
          );
          const map = /* @__PURE__ */ new Map();
          for (const { item, score, matchedType } of filtered.slice(0, topN2)) {
            map.set(item.image, { ...item, score, matchedType });
          }
          for (const item of nameMatches2) {
            const existing = map.get(item.image);
            if (!existing) {
              map.set(item.image, { ...item, score: 1, matchedType: "exact" });
              continue;
            }
            if (existing.matchedType === "vector") {
              map.set(item.image, {
                ...existing,
                score: Math.max(existing.score, 1),
                matchedType: "all"
              });
              continue;
            }
            map.set(item.image, {
              ...existing,
              score: Math.max(existing.score, 1),
              matchedType: "exact"
            });
          }
          const finalResult = Array.from(map.values()).sort((a, b) => b.score - a.score || b.createdAt - a.createdAt).slice(0, topN2);
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
                matchedType: r.matchedType
              }))
            });
          }
          sendToRenderer == null ? void 0 : sendToRenderer("search-updated", {
            searchId: resolvedSearchId,
            results: finalResult
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
        topN
      });
      res.json(fastResult);
      if (!(vector == null ? void 0 : vector.length) && !trimmed) {
        return;
      }
      void runVectorFlow({
        candidates: candidatesAfterTone,
        nameMatches,
        topN,
        threshold
      });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Search error:", error);
      if (error instanceof Error && error.name === "StorageIncompatibleError") {
        res.status(409).json({
          error: "Storage is incompatible",
          details: message,
          code: "STORAGE_INCOMPATIBLE"
        });
        return;
      }
      res.status(500).json({ error: "Failed to search images", details: message });
    }
  });
  server.use("/images", (req, res, next) => {
    return import_express.default.static(STORAGE_DIR)(req, res, next);
  });
  server.use("/temp-images", (req, res, next) => {
    return import_express.default.static(CANVAS_TEMP_DIR)(req, res, next);
  });
  server.post("/api/download-url", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url || typeof url !== "string") {
        res.status(400).json({ error: "URL is required" });
        return;
      }
      const trimmedUrl = url.trim();
      if (!trimmedUrl.startsWith("http://") && !trimmedUrl.startsWith("https://")) {
        res.status(400).json({ error: "Invalid URL" });
        return;
      }
      let urlFilename = "image.jpg";
      try {
        const urlObj = new URL(trimmedUrl);
        const pathname = urlObj.pathname;
        const baseName = import_path.default.basename(pathname).split("?")[0];
        if (baseName && /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(baseName)) {
          urlFilename = baseName;
        }
      } catch {
      }
      const ext = import_path.default.extname(urlFilename) || ".jpg";
      const nameWithoutExt = import_path.default.basename(urlFilename, ext);
      const safeName = nameWithoutExt.replace(/[^a-zA-Z0-9.\-_]/g, "_") || "image";
      const timestamp = Date.now();
      const filename = `${safeName}_${timestamp}${ext}`;
      const filepath = import_path.default.join(CANVAS_TEMP_DIR, filename);
      await downloadImage(trimmedUrl, filepath);
      res.json({
        success: true,
        filename,
        path: filepath
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Download URL error:", error);
      res.status(500).json({ error: "Failed to download image", details: message });
    }
  });
  server.post("/api/upload-temp", async (req, res) => {
    try {
      const { imageBase64, filename: providedFilename } = req.body;
      if (!imageBase64) {
        res.status(400).json({ error: "No image data" });
        return;
      }
      let filename = "temp.png";
      if (providedFilename) {
        const ext = import_path.default.extname(providedFilename) || ".png";
        const name = import_path.default.basename(providedFilename, ext);
        const safeName = name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
        filename = `${safeName}${ext}`;
      }
      const filepath = import_path.default.join(CANVAS_TEMP_DIR, filename);
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      await import_fs_extra.default.writeFile(filepath, base64Data, "base64");
      res.json({
        success: true,
        filename,
        path: filepath
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Temp upload error:", error);
      res.status(500).json({ error: "Failed to upload temp image", details: message });
    }
  });
  server.post("/api/delete-temp-file", async (req, res) => {
    try {
      const { filePath } = req.body;
      if (!filePath) {
        res.status(400).json({ error: "File path is required" });
        return;
      }
      const normalizedPath = import_path.default.normalize(filePath);
      if (!normalizedPath.startsWith(CANVAS_TEMP_DIR)) {
        const inTemp = import_path.default.join(CANVAS_TEMP_DIR, import_path.default.basename(filePath));
        if (await import_fs_extra.default.pathExists(inTemp)) {
          await import_fs_extra.default.unlink(inTemp);
          res.json({ success: true });
          return;
        }
        res.status(403).json({ error: "Invalid file path: Must be in temp directory" });
        return;
      }
      if (await import_fs_extra.default.pathExists(normalizedPath)) {
        await import_fs_extra.default.unlink(normalizedPath);
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "File not found" });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Delete temp file error:", error);
      res.status(500).json({ error: "Failed to delete temp file", details: message });
    }
  });
  server.post("/api/temp-dominant-color", async (req, res) => {
    try {
      const { filePath } = req.body;
      if (!filePath) {
        res.status(400).json({ error: "File path is required" });
        return;
      }
      const normalizedPath = import_path.default.normalize(filePath);
      let targetPath = normalizedPath;
      if (!normalizedPath.startsWith(CANVAS_TEMP_DIR)) {
        const inTemp = import_path.default.join(CANVAS_TEMP_DIR, import_path.default.basename(filePath));
        if (!await import_fs_extra.default.pathExists(inTemp)) {
          res.status(403).json({ error: "Invalid file path: Must be in temp directory" });
          return;
        }
        targetPath = inTemp;
      } else if (!await import_fs_extra.default.pathExists(normalizedPath)) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      const dominantColor = await runPythonDominantColor(targetPath);
      res.json({ success: true, dominantColor });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Temp dominant color error:", error);
      res.status(500).json({ error: "Failed to compute dominant color", details: message });
    }
  });
  server.post("/api/save-canvas", async (req, res) => {
    try {
      const { images, canvasName } = req.body;
      const paths = getCanvasPaths(canvasName || "Default");
      await import_fs_extra.default.ensureDir(paths.dir);
      await import_fs_extra.default.writeJson(paths.dataFile, images);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  server.post("/api/canvas-viewport", async (req, res) => {
    try {
      const { viewport, canvasName } = req.body;
      const paths = getCanvasPaths(canvasName || "Default");
      await import_fs_extra.default.ensureDir(paths.dir);
      await import_fs_extra.default.writeJson(paths.viewportFile, viewport);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  server.get("/api/canvas-viewport", async (req, res) => {
    try {
      const canvasName = req.query.canvasName;
      const paths = getCanvasPaths(canvasName || "Default");
      if (await import_fs_extra.default.pathExists(paths.viewportFile)) {
        const viewport = await import_fs_extra.default.readJson(paths.viewportFile);
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
      const canvasName = req.query.canvasName;
      const paths = getCanvasPaths(canvasName || "Default");
      let images = [];
      if (await import_fs_extra.default.pathExists(paths.dataFile)) {
        images = await import_fs_extra.default.readJson(paths.dataFile);
      }
      try {
        if (await import_fs_extra.default.pathExists(CANVAS_TEMP_DIR)) {
          const usedTempFiles = /* @__PURE__ */ new Set();
          if (Array.isArray(images)) {
            images.forEach((img) => {
              if (img.localPath) {
                const basename = import_path.default.basename(img.localPath);
                usedTempFiles.add(basename);
              }
            });
          }
          const files = await import_fs_extra.default.readdir(CANVAS_TEMP_DIR);
          for (const file of files) {
            if (!usedTempFiles.has(file)) {
              await import_fs_extra.default.unlink(import_path.default.join(CANVAS_TEMP_DIR, file));
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

// shared/i18n/locales/en.ts
var en = {
  "common.ok": "OK",
  "common.confirm": "Confirm",
  "common.cancel": "Cancel",
  "common.close": "Close",
  "common.loading": "Loading...",
  "common.clear": "Clear",
  "common.none": "None",
  "common.notSet": "Not set",
  "common.color": "Color",
  "common.language": "Language",
  "common.language.en": "EN",
  "common.language.zh": "\u4E2D\u6587",
  "common.reset": "Reset",
  "titleBar.settings": "Setting",
  "titleBar.alwaysOnTop": "Always on Top",
  "titleBar.dataFolder": "Data Folder",
  "titleBar.dataFolder.default": "Not configured, using default directory",
  "titleBar.change": "Change",
  "titleBar.window": "Window",
  "titleBar.pinTransparent": "Pin transparent",
  "titleBar.canvasOpacity": "Canvas Opacity",
  "titleBar.mouseThrough": "Paper Mode",
  "titleBar.shortcuts": "Shortcuts",
  "titleBar.toggleWindowVisibility": "Toggle window visibility",
  "titleBar.canvasOpacityUp": "Increase Canvas Opacity",
  "titleBar.canvasOpacityDown": "Decrease Canvas Opacity",
  "titleBar.toggleMouseThrough": "Toggle Paper Mode",
  "titleBar.canvasGroup": "Smart Layout (Canvas)",
  "titleBar.shortcutClickToRecord": "Click to record",
  "titleBar.shortcutRecording": "Press a shortcut\u2026",
  "titleBar.index": "Index",
  "titleBar.enableAiSearchVector": "Enable AI Search (Vector)",
  "titleBar.threshold": "Threshold",
  "titleBar.indexing": "Indexing...",
  "titleBar.indexUnindexedImages": "Index unindexed images",
  "titleBar.processing": "Processing...",
  "toast.indexFailed": "Failed to index images",
  "toast.noUnindexedImages": "No unindexed images found",
  "toast.indexCompleted": "Index completed: {{created}} created, {{updated}} updated",
  "toast.modelReady": "AI Model is ready",
  "toast.modelCheckFailed": "Model check failed: {{error}}",
  "toast.settingsUpdateFailed": "Failed to update settings",
  "toast.translationWarning": "Translation warning: {{warning}}",
  "toast.reactError": "Something went wrong: {{message}}",
  "toast.logCopied": "Log copied to clipboard",
  "toast.logCopyFailed": "Failed to copy log",
  "toast.tagRenamed": "Tag renamed",
  "toast.tagRenameFailed": "Failed to rename tag",
  "toast.updateDominantColorFailed": "Failed to update dominant color",
  "toast.updateNameFailed": "Failed to update name",
  "toast.imageDeleted": "Image deleted",
  "toast.deleteImageFailed": "Failed to delete image",
  "toast.vectorIndexed": "Vector indexed",
  "toast.vectorIndexFailed": "Failed to index vector",
  "toast.openFileFailed": "Failed to open file",
  "toast.shortcutInvalid": "Invalid shortcut",
  "toast.shortcutUpdateFailed": "Failed to update shortcut: {{error}}",
  "envInit.brandTitle": "Oh, Captain!",
  "envInit.heading": "Setting up the Python environment...",
  "envInit.subheading": "First run may download tools and install dependencies. This is a one-time step.",
  "envInit.preparing": "Preparing...",
  "envInit.checkingUv": "Checking uv...",
  "envInit.downloadingUv": "Downloading uv...",
  "envInit.initializingPythonEnv": "Initializing Python environment...",
  "envInit.resolvingDependencies": "Resolving dependencies...",
  "envInit.downloadingPackages": "Downloading packages...",
  "envInit.installingPackages": "Installing packages...",
  "envInit.verifyingEnvironment": "Verifying environment...",
  "envInit.pythonEnvReady": "Python environment ready",
  "model.downloading": "Downloading model...",
  "model.preparingDownload": "Preparing model download...",
  "model.downloadingFraction": "Downloading ({{current}}/{{total}})",
  "model.retrying": "Retrying download...",
  "model.ready": "Model is ready",
  "model.downloadFailed": "Model download failed",
  "model.downloadFailedWithReason": "Model download failed: {{reason}}",
  "indexing.starting": "Starting...",
  "indexing.progress": "Indexing {{current}}/{{total}}...",
  "indexing.completed": "Completed",
  "errors.title": "Oh Captain, Something went wrong",
  "errors.unexpected": "An unexpected error occurred.",
  "errors.applicationLogTitle": "Application Log (Last 50KB)",
  "errors.loadingLogs": "Loading logs...",
  "errors.logAccessUnavailable": "Log access not available in this environment.",
  "errors.failedToLoadLogs": "Failed to load logs: {{message}}",
  "errors.copyLog": "Copy Log",
  "errors.reloadApplication": "Reload Application",
  "gallery.searchPlaceholder": "Search",
  "gallery.filter": "Filter",
  "gallery.filterSummary.color": "Color: {{color}}",
  "gallery.filterSummary.tone": "Tone: {{tone}}",
  "gallery.filterSummary.colorTone": "Color: {{color}}, Tone: {{tone}}",
  "gallery.colorFilter.title": "Color Filter",
  "gallery.colorFilter.selected": "Selected",
  "gallery.toneFilter.title": "Tone Filter",
  "gallery.referenceAlt": "Reference",
  "gallery.notIndexed": "Not Indexed",
  "gallery.contextMenu.nameLabel": "Name",
  "gallery.contextMenu.imageNamePlaceholder": "Image name",
  "gallery.contextMenu.linkLabel": "Link",
  "gallery.contextMenu.tagsLabel": "Tags",
  "gallery.contextMenu.addTagPlaceholder": "Add tag...",
  "gallery.contextMenu.dominantColorLabel": "Dominant Color",
  "gallery.contextMenu.toneLabel": "Tone",
  "gallery.contextMenu.showInFolder": "Show in Folder",
  "gallery.contextMenu.indexVector": "Index Vector",
  "gallery.contextMenu.deleteImage": "Delete Image",
  "gallery.dominantColor.title": "Dominant Color",
  "gallery.empty.bodyLine1": "Your journey begins.",
  "gallery.empty.bodyLine2": "Drag & drop to command your fleet.",
  "gallery.empty.dragHint": "Drag images here",
  "tag.setColor": "Set Color",
  "canvas.toolbar.expand": "Expand Toolbar",
  "canvas.toolbar.collapse": "Collapse Toolbar",
  "canvas.toolbar.toggleGrayscale": "Toggle Grayscale Mode",
  "canvas.toolbar.grayscale": "Grayscale",
  "canvas.toolbar.smartLayout": "Smart Layout",
  "canvas.toolbar.toggleMinimap": "Toggle Minimap",
  "canvas.toolbar.minimap": "Minimap",
  "canvas.clearCanvasTitle": "Clear Canvas",
  "canvas.clearCanvasMessage": "Are you sure you want to clear the canvas? This action cannot be undone.",
  "canvas.clearCanvasConfirm": "Clear",
  "swatch.replaceHint": "{{color}} (long press to replace)",
  "tone.key.high": "High",
  "tone.key.mid": "Mid",
  "tone.key.low": "Low",
  "tone.range.short": "Short",
  "tone.range.mid": "Mid",
  "tone.range.long": "Long",
  "tone.label.highShort": "High Key / Short Range",
  "tone.label.highMid": "High Key / Mid Range",
  "tone.label.highLong": "High Key / Long Range",
  "tone.label.midShort": "Mid Key / Short Range",
  "tone.label.midMid": "Mid Key / Mid Range",
  "tone.label.midLong": "Mid Key / Long Range",
  "tone.label.lowShort": "Low Key / Short Range",
  "tone.label.lowMid": "Low Key / Mid Range",
  "tone.label.lowLong": "Low Key / Long Range",
  "tone.unknown": "Tone",
  "dialog.pythonSetupFailedTitle": "Python setup failed",
  "dialog.pythonSetupFailedMessage": "Failed to set up Python environment.",
  "dialog.pythonSetupFailedDetail": "Exit code: {{code}}\nDir: {{dir}}",
  "dialog.modelDownloadFailedTitle": "Model download failed",
  "dialog.modelDownloadFailedMessage": "Failed to download model files.",
  "dialog.modelDownloadFailedDetail": "Exit code: {{code}}\nProgress: {{progress}}%\nModel dir: {{dir}}",
  "dialog.chooseStorageFolderTitle": "Choose LookBack storage folder",
  "toast.globalError": "Error: {{message}}",
  "toast.unhandledRejection": "Unhandled Promise Rejection: {{reason}}",
  "toast.storageIncompatible": "Storage is incompatible. Please reset the data folder.",
  "settings.canvas": "Canvas",
  "settings.canvas.create": "Create New",
  "settings.canvas.placeholder": "Canvas Name",
  "settings.canvas.deleteConfirm": "Delete this canvas?",
  "settings.canvas.rename": "Rename",
  "settings.canvas.renamePlaceholder": "New Name",
  "toast.createCanvasFailed": "Failed to create canvas"
};

// shared/i18n/locales/zh.ts
var zh = {
  "common.ok": "\u786E\u5B9A",
  "common.confirm": "\u786E\u8BA4",
  "common.cancel": "\u53D6\u6D88",
  "common.close": "\u5173\u95ED",
  "common.loading": "\u52A0\u8F7D\u4E2D\u2026",
  "common.clear": "\u6E05\u9664",
  "common.none": "\u65E0",
  "common.notSet": "\u672A\u8BBE\u7F6E",
  "common.color": "\u989C\u8272",
  "common.language": "\u8BED\u8A00",
  "common.language.en": "EN",
  "common.language.zh": "\u4E2D\u6587",
  "common.reset": "\u91CD\u7F6E",
  "titleBar.settings": "\u8BBE\u7F6E",
  "titleBar.alwaysOnTop": "\u7F6E\u9876",
  "titleBar.dataFolder": "\u6570\u636E\u6587\u4EF6\u5939",
  "titleBar.dataFolder.default": "\u672A\u914D\u7F6E\uFF0C\u5C06\u4F7F\u7528\u9ED8\u8BA4\u76EE\u5F55",
  "titleBar.change": "\u66F4\u6539",
  "titleBar.window": "\u7A97\u53E3",
  "titleBar.pinTransparent": "\u7F6E\u9876\u900F\u660E",
  "titleBar.canvasOpacity": "\u753B\u5E03\u900F\u660E\u5EA6",
  "titleBar.mouseThrough": "\u57AB\u7EB8\u6A21\u5F0F",
  "titleBar.shortcuts": "\u5FEB\u6377\u952E",
  "titleBar.toggleWindowVisibility": "\u5207\u6362\u7A97\u53E3\u663E\u793A",
  "titleBar.canvasOpacityUp": "\u589E\u52A0\u753B\u5E03\u900F\u660E\u5EA6",
  "titleBar.canvasOpacityDown": "\u51CF\u5C11\u753B\u5E03\u900F\u660E\u5EA6",
  "titleBar.toggleMouseThrough": "\u5207\u6362\u57AB\u7EB8\u6A21\u5F0F",
  "titleBar.canvasGroup": "\u753B\u5E03\u667A\u80FD\u5E03\u5C40",
  "titleBar.shortcutClickToRecord": "\u70B9\u51FB\u5F55\u5236",
  "titleBar.shortcutRecording": "\u8BF7\u6309\u4E0B\u5FEB\u6377\u952E\u2026",
  "titleBar.index": "\u7D22\u5F15",
  "titleBar.enableAiSearchVector": "\u542F\u7528 AI \u641C\u7D22",
  "titleBar.threshold": "\u9608\u503C",
  "titleBar.indexing": "\u7D22\u5F15\u4E2D\u2026",
  "titleBar.indexUnindexedImages": "\u7D22\u5F15\u672A\u5165\u5E93\u56FE\u7247",
  "titleBar.processing": "\u5904\u7406\u4E2D\u2026",
  "toast.indexFailed": "\u7D22\u5F15\u56FE\u7247\u5931\u8D25",
  "toast.noUnindexedImages": "\u6CA1\u6709\u672A\u5165\u5E93\u7684\u56FE\u7247",
  "toast.indexCompleted": "\u7D22\u5F15\u5B8C\u6210\uFF1A\u65B0\u589E {{created}}\uFF0C\u66F4\u65B0 {{updated}}",
  "toast.modelReady": "\u641C\u7D22\u6A21\u578B\u5DF2\u5C31\u7EEA",
  "toast.modelCheckFailed": "\u6A21\u578B\u68C0\u67E5\u5931\u8D25\uFF1A{{error}}",
  "toast.settingsUpdateFailed": "\u66F4\u65B0\u8BBE\u7F6E\u5931\u8D25",
  "toast.translationWarning": "\u7FFB\u8BD1\u8B66\u544A\uFF1A{{warning}}",
  "toast.reactError": "\u53D1\u751F\u9519\u8BEF\uFF1A{{message}}",
  "toast.logCopied": "\u65E5\u5FD7\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F",
  "toast.logCopyFailed": "\u590D\u5236\u65E5\u5FD7\u5931\u8D25",
  "toast.tagRenamed": "\u6807\u7B7E\u5DF2\u91CD\u547D\u540D",
  "toast.tagRenameFailed": "\u91CD\u547D\u540D\u6807\u7B7E\u5931\u8D25",
  "toast.updateDominantColorFailed": "\u66F4\u65B0\u4E3B\u8272\u5931\u8D25",
  "toast.updateNameFailed": "\u66F4\u65B0\u540D\u79F0\u5931\u8D25",
  "toast.imageDeleted": "\u56FE\u7247\u5DF2\u5220\u9664",
  "toast.deleteImageFailed": "\u5220\u9664\u56FE\u7247\u5931\u8D25",
  "toast.vectorIndexed": "\u5411\u91CF\u5DF2\u5165\u5E93",
  "toast.vectorIndexFailed": "\u5411\u91CF\u5165\u5E93\u5931\u8D25",
  "toast.openFileFailed": "\u6253\u5F00\u6587\u4EF6\u5931\u8D25",
  "toast.shortcutInvalid": "\u5FEB\u6377\u952E\u65E0\u6548",
  "toast.shortcutUpdateFailed": "\u66F4\u65B0\u5FEB\u6377\u952E\u5931\u8D25\uFF1A{{error}}",
  "envInit.brandTitle": "Oh, Captain!",
  "envInit.heading": "\u6B63\u5728\u914D\u7F6E Python \u73AF\u5883\u2026",
  "envInit.subheading": "\u9996\u6B21\u8FD0\u884C\u53EF\u80FD\u4F1A\u4E0B\u8F7D\u5DE5\u5177\u5E76\u5B89\u88C5\u4F9D\u8D56\uFF0C\u8FD9\u662F\u4E00\u6B21\u6027\u6B65\u9AA4\u3002",
  "envInit.preparing": "\u51C6\u5907\u4E2D\u2026",
  "envInit.checkingUv": "\u6B63\u5728\u68C0\u67E5 uv\u2026",
  "envInit.downloadingUv": "\u6B63\u5728\u4E0B\u8F7D uv\u2026",
  "envInit.initializingPythonEnv": "\u6B63\u5728\u521D\u59CB\u5316 Python \u73AF\u5883\u2026",
  "envInit.resolvingDependencies": "\u6B63\u5728\u89E3\u6790\u4F9D\u8D56\u2026",
  "envInit.downloadingPackages": "\u6B63\u5728\u4E0B\u8F7D\u4F9D\u8D56\u5305\u2026",
  "envInit.installingPackages": "\u6B63\u5728\u5B89\u88C5\u4F9D\u8D56\u5305\u2026",
  "envInit.verifyingEnvironment": "\u6B63\u5728\u6821\u9A8C\u73AF\u5883\u2026",
  "envInit.pythonEnvReady": "Python \u73AF\u5883\u5DF2\u5C31\u7EEA",
  "model.downloading": "\u6B63\u5728\u4E0B\u8F7D\u6A21\u578B\u2026",
  "model.preparingDownload": "\u6B63\u5728\u51C6\u5907\u6A21\u578B\u4E0B\u8F7D\u2026",
  "model.downloadingFraction": "\u4E0B\u8F7D\u4E2D\uFF08{{current}}/{{total}}\uFF09",
  "model.retrying": "\u6B63\u5728\u91CD\u8BD5\u4E0B\u8F7D\u2026",
  "model.ready": "\u6A21\u578B\u5DF2\u5C31\u7EEA",
  "model.downloadFailed": "\u6A21\u578B\u4E0B\u8F7D\u5931\u8D25",
  "model.downloadFailedWithReason": "\u6A21\u578B\u4E0B\u8F7D\u5931\u8D25\uFF1A{{reason}}",
  "indexing.starting": "\u5F00\u59CB\u2026",
  "indexing.progress": "\u7D22\u5F15\u4E2D {{current}}/{{total}}\u2026",
  "indexing.completed": "\u5B8C\u6210",
  "errors.title": "Oh Captain\uFF0C\u51FA\u9519\u4E86",
  "errors.unexpected": "\u53D1\u751F\u4E86\u4E00\u4E2A\u610F\u5916\u9519\u8BEF\u3002",
  "errors.applicationLogTitle": "\u5E94\u7528\u65E5\u5FD7\uFF08\u6700\u8FD1 50KB\uFF09",
  "errors.loadingLogs": "\u6B63\u5728\u52A0\u8F7D\u65E5\u5FD7\u2026",
  "errors.logAccessUnavailable": "\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301\u8BFB\u53D6\u65E5\u5FD7\u3002",
  "errors.failedToLoadLogs": "\u52A0\u8F7D\u65E5\u5FD7\u5931\u8D25\uFF1A{{message}}",
  "errors.copyLog": "\u590D\u5236\u65E5\u5FD7",
  "errors.reloadApplication": "\u91CD\u65B0\u52A0\u8F7D\u5E94\u7528",
  "gallery.searchPlaceholder": "\u641C\u7D22",
  "gallery.filter": "\u7B5B\u9009",
  "gallery.filterSummary.color": "\u989C\u8272\uFF1A{{color}}",
  "gallery.filterSummary.tone": "\u8272\u8C03\uFF1A{{tone}}",
  "gallery.filterSummary.colorTone": "\u989C\u8272\uFF1A{{color}}\uFF0C\u8272\u8C03\uFF1A{{tone}}",
  "gallery.colorFilter.title": "\u989C\u8272\u7B5B\u9009",
  "gallery.colorFilter.selected": "\u5DF2\u9009",
  "gallery.toneFilter.title": "\u8272\u8C03\u7B5B\u9009",
  "gallery.referenceAlt": "\u53C2\u8003\u56FE",
  "gallery.notIndexed": "\u672A\u5165\u5E93",
  "gallery.contextMenu.nameLabel": "\u540D\u79F0",
  "gallery.contextMenu.imageNamePlaceholder": "\u56FE\u7247\u540D\u79F0",
  "gallery.contextMenu.linkLabel": "\u94FE\u63A5",
  "gallery.contextMenu.tagsLabel": "\u6807\u7B7E",
  "gallery.contextMenu.addTagPlaceholder": "\u6DFB\u52A0\u6807\u7B7E\u2026",
  "gallery.contextMenu.dominantColorLabel": "\u4E3B\u8272",
  "gallery.contextMenu.toneLabel": "\u8272\u8C03",
  "gallery.contextMenu.showInFolder": "\u5728\u6587\u4EF6\u5939\u4E2D\u663E\u793A",
  "gallery.contextMenu.indexVector": "\u5165\u5E93\u5411\u91CF",
  "gallery.contextMenu.deleteImage": "\u5220\u9664\u56FE\u7247",
  "gallery.dominantColor.title": "\u4E3B\u8272",
  "gallery.empty.bodyLine1": "\u65C5\u7A0B\u4ECE\u8FD9\u91CC\u5F00\u59CB\u3002",
  "gallery.empty.bodyLine2": "\u62D6\u653E\u56FE\u7247\u6765\u6307\u6325\u4F60\u7684\u5185\u5BB9\u3002",
  "gallery.empty.dragHint": "\u5C06\u56FE\u7247\u62D6\u5230\u8FD9\u91CC",
  "tag.setColor": "\u8BBE\u7F6E\u989C\u8272",
  "canvas.toolbar.expand": "\u5C55\u5F00\u5DE5\u5177\u680F",
  "canvas.toolbar.collapse": "\u6536\u8D77\u5DE5\u5177\u680F",
  "canvas.toolbar.toggleGrayscale": "\u5207\u6362\u7070\u5EA6\u6A21\u5F0F",
  "canvas.toolbar.grayscale": "\u7070\u5EA6",
  "canvas.toolbar.smartLayout": "\u667A\u80FD\u5E03\u5C40",
  "canvas.toolbar.toggleMinimap": "\u5207\u6362\u5C0F\u5730\u56FE",
  "canvas.toolbar.minimap": "\u5C0F\u5730\u56FE",
  "canvas.clearCanvasTitle": "\u6E05\u7A7A\u753B\u5E03",
  "canvas.clearCanvasMessage": "\u786E\u5B9A\u8981\u6E05\u7A7A\u753B\u5E03\u5417\uFF1F\u6B64\u64CD\u4F5C\u65E0\u6CD5\u64A4\u9500\u3002",
  "canvas.clearCanvasConfirm": "\u6E05\u7A7A",
  "swatch.replaceHint": "{{color}}\uFF08\u957F\u6309\u66FF\u6362\uFF09",
  "tone.key.high": "\u9AD8",
  "tone.key.mid": "\u4E2D",
  "tone.key.low": "\u4F4E",
  "tone.range.short": "\u77ED",
  "tone.range.mid": "\u4E2D",
  "tone.range.long": "\u957F",
  "tone.label.highShort": "\u9AD8\u8C03 / \u77ED\u8C03",
  "tone.label.highMid": "\u9AD8\u8C03 / \u4E2D\u8C03",
  "tone.label.highLong": "\u9AD8\u8C03 / \u957F\u8C03",
  "tone.label.midShort": "\u4E2D\u8C03 / \u77ED\u8C03",
  "tone.label.midMid": "\u4E2D\u8C03 / \u4E2D\u8C03",
  "tone.label.midLong": "\u4E2D\u8C03 / \u957F\u8C03",
  "tone.label.lowShort": "\u4F4E\u8C03 / \u77ED\u8C03",
  "tone.label.lowMid": "\u4F4E\u8C03 / \u4E2D\u8C03",
  "tone.label.lowLong": "\u4F4E\u8C03 / \u957F\u8C03",
  "tone.unknown": "\u8272\u8C03",
  "dialog.pythonSetupFailedTitle": "Python \u73AF\u5883\u914D\u7F6E\u5931\u8D25",
  "dialog.pythonSetupFailedMessage": "\u65E0\u6CD5\u5B8C\u6210 Python \u73AF\u5883\u914D\u7F6E\u3002",
  "dialog.pythonSetupFailedDetail": "\u9000\u51FA\u7801\uFF1A{{code}}\n\u76EE\u5F55\uFF1A{{dir}}",
  "dialog.modelDownloadFailedTitle": "\u6A21\u578B\u4E0B\u8F7D\u5931\u8D25",
  "dialog.modelDownloadFailedMessage": "\u65E0\u6CD5\u4E0B\u8F7D\u6A21\u578B\u6587\u4EF6\u3002",
  "dialog.modelDownloadFailedDetail": "\u9000\u51FA\u7801\uFF1A{{code}}\n\u8FDB\u5EA6\uFF1A{{progress}}%\n\u6A21\u578B\u76EE\u5F55\uFF1A{{dir}}",
  "dialog.chooseStorageFolderTitle": "\u9009\u62E9 LookBack \u5B58\u50A8\u6587\u4EF6\u5939",
  "toast.globalError": "\u9519\u8BEF\uFF1A{{message}}",
  "toast.unhandledRejection": "\u672A\u5904\u7406\u7684 Promise \u62D2\u7EDD\uFF1A{{reason}}",
  "toast.storageIncompatible": "\u5B58\u50A8\u76EE\u5F55\u4E0D\u517C\u5BB9\uFF0C\u8BF7\u91CD\u7F6E\u6570\u636E\u6587\u4EF6\u5939\u3002",
  "settings.canvas": "\u5F53\u524D\u753B\u5E03",
  "settings.canvas.create": "\u65B0\u5EFA\u753B\u5E03",
  "settings.canvas.placeholder": "\u753B\u5E03\u540D\u79F0",
  "settings.canvas.deleteConfirm": "\u786E\u8BA4\u5220\u9664\u8BE5\u753B\u5E03\uFF1F",
  "settings.canvas.rename": "\u91CD\u547D\u540D",
  "settings.canvas.renamePlaceholder": "\u65B0\u540D\u79F0",
  "toast.createCanvasFailed": "\u521B\u5EFA\u753B\u5E03\u5931\u8D25"
};

// shared/i18n/t.ts
var dictionaries = {
  en,
  zh
};
function t(locale, key, params) {
  const template = dictionaries[locale][key];
  if (!params) return template;
  return template.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (match, name) => {
    const value = params[name];
    if (value === void 0 || value === null) return match;
    return String(value);
  });
}

// electron/main.ts
if (!import_electron2.app.isPackaged) {
  import_electron2.app.setName("LookBack");
}
Object.assign(console, import_electron_log.default.functions);
import_electron_log.default.transports.file.level = "info";
import_electron_log.default.transports.file.maxSize = 5 * 1024 * 1024;
import_electron_log.default.transports.file.archiveLog = (file) => {
  const filePath = file.toString();
  const info = import_path2.default.parse(filePath);
  try {
    import_fs_extra2.default.renameSync(filePath, import_path2.default.join(info.dir, info.name + ".old" + info.ext));
  } catch (e) {
    console.warn("Could not rotate log", e);
  }
};
var mainWindow = null;
var lastGalleryDockDelta = 0;
var localeCache = null;
var DEFAULT_TOGGLE_WINDOW_SHORTCUT = process.platform === "darwin" ? "Command+L" : "Ctrl+L";
var DEFAULT_CANVAS_OPACITY_UP_SHORTCUT = process.platform === "darwin" ? "Command+Up" : "Ctrl+Up";
var DEFAULT_CANVAS_OPACITY_DOWN_SHORTCUT = process.platform === "darwin" ? "Command+Down" : "Ctrl+Down";
var DEFAULT_TOGGLE_MOUSE_THROUGH_SHORTCUT = process.platform === "darwin" ? "Command+T" : "Ctrl+T";
var DEFAULT_CANVAS_GROUP_SHORTCUT = process.platform === "darwin" ? "Command+G" : "Ctrl+G";
var toggleWindowShortcut = DEFAULT_TOGGLE_WINDOW_SHORTCUT;
var canvasOpacityUpShortcut = DEFAULT_CANVAS_OPACITY_UP_SHORTCUT;
var canvasOpacityDownShortcut = DEFAULT_CANVAS_OPACITY_DOWN_SHORTCUT;
var toggleMouseThroughShortcut = DEFAULT_TOGGLE_MOUSE_THROUGH_SHORTCUT;
var canvasGroupShortcut = DEFAULT_CANVAS_GROUP_SHORTCUT;
var isSettingsOpen = false;
var isPinMode;
var isPinTransparent;
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
var isLocale = (value) => value === "en" || value === "zh";
async function getLocale() {
  try {
    const settingsPath = import_path2.default.join(getStorageDir(), "settings.json");
    const stat = await import_fs_extra2.default.stat(settingsPath).catch(() => null);
    if (!stat) return "en";
    if (localeCache && localeCache.mtimeMs === stat.mtimeMs) return localeCache.locale;
    const settings = await import_fs_extra2.default.readJson(settingsPath).catch(() => null);
    const raw = settings && typeof settings === "object" ? settings.language : void 0;
    const locale = isLocale(raw) ? raw : "en";
    localeCache = { locale, mtimeMs: stat.mtimeMs };
    return locale;
  } catch {
    return "en";
  }
}
async function loadShortcuts() {
  try {
    const settingsPath = import_path2.default.join(getStorageDir(), "settings.json");
    const settings = await import_fs_extra2.default.readJson(settingsPath).catch(() => null);
    if (!settings || typeof settings !== "object") return;
    const rawToggle = settings.toggleWindowShortcut;
    if (typeof rawToggle === "string" && rawToggle.trim()) {
      toggleWindowShortcut = rawToggle.trim();
    }
    const rawOpacityUp = settings.canvasOpacityUpShortcut;
    if (typeof rawOpacityUp === "string" && rawOpacityUp.trim()) {
      canvasOpacityUpShortcut = rawOpacityUp.trim();
    }
    const rawOpacityDown = settings.canvasOpacityDownShortcut;
    if (typeof rawOpacityDown === "string" && rawOpacityDown.trim()) {
      canvasOpacityDownShortcut = rawOpacityDown.trim();
    }
    const rawMouseThrough = settings.toggleMouseThroughShortcut;
    if (typeof rawMouseThrough === "string" && rawMouseThrough.trim()) {
      toggleMouseThroughShortcut = rawMouseThrough.trim();
    }
    const rawCanvasGroup = settings.canvasGroupShortcut;
    if (typeof rawCanvasGroup === "string" && rawCanvasGroup.trim()) {
      canvasGroupShortcut = rawCanvasGroup.trim();
    }
  } catch {
  }
}
async function loadWindowPinState() {
  try {
    const settingsPath = import_path2.default.join(getStorageDir(), "settings.json");
    const settings = await import_fs_extra2.default.readJson(settingsPath).catch(() => null);
    if (!settings || typeof settings !== "object") return;
    const raw = settings;
    if (typeof raw.pinMode === "boolean") {
      isPinMode = raw.pinMode;
    }
    if (typeof raw.pinTransparent === "boolean") {
      isPinTransparent = raw.pinTransparent;
    }
  } catch {
  }
}
function loadMainWindow() {
  if (!mainWindow) return;
  if (!import_electron2.app.isPackaged) {
    import_electron_log.default.info("Loading renderer from localhost");
    void mainWindow.loadURL("http://localhost:5173");
  } else {
    const filePath = import_path2.default.join(__dirname, "../dist-renderer/index.html");
    import_electron_log.default.info("Loading renderer from file:", filePath);
    void mainWindow.loadFile(filePath);
  }
}
function setupAutoUpdater() {
  import_electron_updater.autoUpdater.logger = import_electron_log.default;
  import_electron_updater.autoUpdater.autoDownload = true;
  import_electron_updater.autoUpdater.on("checking-for-update", () => {
    import_electron_log.default.info("Checking for update...");
  });
  import_electron_updater.autoUpdater.on("update-available", (info) => {
    import_electron_log.default.info("Update available.", info);
    if (mainWindow) {
      mainWindow.webContents.send("update-available", info);
    }
  });
  import_electron_updater.autoUpdater.on("update-not-available", (info) => {
    import_electron_log.default.info("Update not available.", info);
  });
  import_electron_updater.autoUpdater.on("error", (err) => {
    import_electron_log.default.error("Error in auto-updater.", err);
  });
  import_electron_updater.autoUpdater.on("download-progress", (progressObj) => {
    let log_message = "Download speed: " + progressObj.bytesPerSecond;
    log_message = log_message + " - Downloaded " + progressObj.percent + "%";
    log_message = log_message + " (" + progressObj.transferred + "/" + progressObj.total + ")";
    import_electron_log.default.info(log_message);
    if (mainWindow) {
      mainWindow.webContents.send("download-progress", progressObj);
    }
  });
  import_electron_updater.autoUpdater.on("update-downloaded", (info) => {
    import_electron_log.default.info("Update downloaded", info);
    if (mainWindow) {
      mainWindow.webContents.send("update-downloaded", info);
    }
  });
  if (import_electron2.app.isPackaged) {
    import_electron_updater.autoUpdater.checkForUpdatesAndNotify();
  }
}
function createWindow(options) {
  import_electron_log.default.info("Creating main window...");
  const { width, height } = import_electron2.screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new import_electron2.BrowserWindow({
    width: Math.floor(width * 0.6),
    height: Math.floor(height * 0.8),
    icon: import_path2.default.join(__dirname, "../resources/icon.svg"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: import_path2.default.join(__dirname, "preload.cjs")
    },
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: false,
    hasShadow: true
  });
  mainWindow.webContents.on("did-finish-load", () => {
    import_electron_log.default.info("Renderer process finished loading");
  });
  if (!import_electron2.app.isPackaged) {
  }
  mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription, validatedURL) => {
    import_electron_log.default.error("Renderer process failed to load:", errorCode, errorDescription, validatedURL);
  });
  mainWindow.webContents.on("render-process-gone", (event, details) => {
    import_electron_log.default.error("Renderer process gone:", details.reason, details.exitCode);
  });
  if ((options == null ? void 0 : options.load) !== false) {
    loadMainWindow();
  }
  setupAutoUpdater();
  import_electron2.ipcMain.on("window-min", () => mainWindow == null ? void 0 : mainWindow.minimize());
  import_electron2.ipcMain.on("window-max", () => {
    if (mainWindow == null ? void 0 : mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow == null ? void 0 : mainWindow.maximize();
    }
  });
  import_electron2.ipcMain.on("window-close", () => mainWindow == null ? void 0 : mainWindow.close());
  import_electron2.ipcMain.on("window-focus", () => mainWindow == null ? void 0 : mainWindow.focus());
  import_electron2.ipcMain.on("toggle-always-on-top", (_event, flag) => {
    if (flag) {
      mainWindow == null ? void 0 : mainWindow.setAlwaysOnTop(true, "screen-saver");
      mainWindow == null ? void 0 : mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    } else {
      mainWindow == null ? void 0 : mainWindow.setAlwaysOnTop(false);
      mainWindow == null ? void 0 : mainWindow.setVisibleOnAllWorkspaces(false);
    }
  });
  import_electron2.ipcMain.on("set-pin-mode", (_event, { enabled, widthDelta }) => {
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
          height: h
        });
      } else {
        const applied = lastGalleryDockDelta > 0 ? lastGalleryDockDelta : requested;
        lastGalleryDockDelta = 0;
        const nextWidth = w + applied;
        mainWindow.setBounds({
          x: right - nextWidth,
          y,
          width: nextWidth,
          height: h
        });
      }
    }
    isPinMode = enabled;
    applyPinStateToWindow();
  });
  import_electron2.ipcMain.on("set-pin-transparent", (_event, enabled) => {
    if (!mainWindow) return;
    isPinTransparent = enabled;
    syncWindowShadow();
  });
  import_electron2.ipcMain.on("resize-window-by", (_event, deltaWidth) => {
    if (!mainWindow) return;
    const [w, h] = mainWindow.getSize();
    const [x, y] = mainWindow.getPosition();
    mainWindow.setBounds({
      x: x - Math.round(deltaWidth),
      y,
      width: w + Math.round(deltaWidth),
      height: h
    });
  });
  import_electron2.ipcMain.on("log-message", (_event, level, ...args) => {
    if (typeof import_electron_log.default[level] === "function") {
      import_electron_log.default[level](...args);
    } else {
      import_electron_log.default.info(...args);
    }
  });
  import_electron2.ipcMain.handle("get-log-content", async () => {
    try {
      const logPath = import_electron_log.default.transports.file.getFile().path;
      if (await import_fs_extra2.default.pathExists(logPath)) {
        const stats = await import_fs_extra2.default.stat(logPath);
        const size = stats.size;
        const READ_SIZE = 50 * 1024;
        const start = Math.max(0, size - READ_SIZE);
        const stream = import_fs_extra2.default.createReadStream(logPath, { start, encoding: "utf8" });
        const chunks = [];
        return new Promise((resolve, reject) => {
          stream.on("data", (chunk) => chunks.push(chunk.toString()));
          stream.on("end", () => resolve(chunks.join("")));
          stream.on("error", reject);
        });
      }
      return "No log file found.";
    } catch (error) {
      import_electron_log.default.error("Failed to read log file:", error);
      return `Failed to read log file: ${error instanceof Error ? error.message : String(error)}`;
    }
  });
  import_electron2.ipcMain.handle("ensure-model-ready", async () => {
    if (!mainWindow) return;
    try {
      await ensurePythonRuntime(mainWindow);
      await ensureModelReady(mainWindow);
      return { success: true };
    } catch (e) {
      import_electron_log.default.error("Manual ensure model failed:", e);
      return { success: false, error: String(e) };
    }
  });
  import_electron2.ipcMain.handle("open-external", async (_event, rawUrl) => {
    try {
      if (typeof rawUrl !== "string") {
        return { success: false, error: "Invalid URL" };
      }
      const url = new URL(rawUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return { success: false, error: "Unsupported URL protocol" };
      }
      await import_electron2.shell.openExternal(url.toString());
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
}
function toggleMainWindowVisibility() {
  if (!mainWindow) return;
  if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
    mainWindow.hide();
    return;
  }
  mainWindow.show();
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
}
function registerShortcut(accelerator, currentVar, updateVar, action, checkSettingsOpen = false) {
  const next = typeof accelerator === "string" ? accelerator.trim() : "";
  if (!next) {
    return { success: false, error: "Empty shortcut", accelerator: currentVar };
  }
  const prev = currentVar;
  const handler = () => {
    if (checkSettingsOpen && isSettingsOpen && (mainWindow == null ? void 0 : mainWindow.isFocused())) {
      return;
    }
    action();
  };
  try {
    if (prev !== next) {
      import_electron2.globalShortcut.unregister(prev);
    } else {
      import_electron2.globalShortcut.unregister(prev);
    }
    const ok = import_electron2.globalShortcut.register(next, handler);
    if (!ok) {
      if (prev !== next) {
        import_electron2.globalShortcut.unregister(next);
        import_electron2.globalShortcut.register(prev, handler);
      }
      return { success: false, error: "Shortcut registration failed", accelerator: prev };
    }
    updateVar(next);
    return { success: true, accelerator: next };
  } catch (e) {
    if (prev !== next) {
      import_electron2.globalShortcut.unregister(next);
      import_electron2.globalShortcut.register(prev, handler);
    }
    return { success: false, error: e instanceof Error ? e.message : String(e), accelerator: prev };
  }
}
function registerToggleWindowShortcut(accelerator) {
  return registerShortcut(
    accelerator,
    toggleWindowShortcut,
    (v) => {
      toggleWindowShortcut = v;
    },
    toggleMainWindowVisibility,
    true
  );
}
function registerCanvasOpacityUpShortcut(accelerator) {
  return registerShortcut(
    accelerator,
    canvasOpacityUpShortcut,
    (v) => {
      canvasOpacityUpShortcut = v;
    },
    () => {
      mainWindow == null ? void 0 : mainWindow.webContents.send("renderer-event", "canvas-opacity-up");
    }
  );
}
function registerCanvasOpacityDownShortcut(accelerator) {
  return registerShortcut(
    accelerator,
    canvasOpacityDownShortcut,
    (v) => {
      canvasOpacityDownShortcut = v;
    },
    () => {
      mainWindow == null ? void 0 : mainWindow.webContents.send("renderer-event", "canvas-opacity-down");
    }
  );
}
function registerToggleMouseThroughShortcut(accelerator) {
  return registerShortcut(
    accelerator,
    toggleMouseThroughShortcut,
    (v) => {
      toggleMouseThroughShortcut = v;
    },
    () => {
      mainWindow == null ? void 0 : mainWindow.webContents.send("renderer-event", "toggle-mouse-through");
    }
  );
}
function registerCanvasGroupShortcut(accelerator) {
  return registerShortcut(
    accelerator,
    canvasGroupShortcut,
    (v) => {
      canvasGroupShortcut = v;
    },
    () => {
      mainWindow == null ? void 0 : mainWindow.webContents.send("renderer-event", "canvas-auto-layout");
    }
  );
}
function getModelDir() {
  return import_path2.default.join(getStorageDir(), "model");
}
async function hasRequiredModelFiles(modelDir) {
  const hasConfig = await import_fs_extra2.default.pathExists(import_path2.default.join(modelDir, "config.json"));
  const hasWeights = await import_fs_extra2.default.pathExists(import_path2.default.join(modelDir, "pytorch_model.bin")) || await import_fs_extra2.default.pathExists(import_path2.default.join(modelDir, "model.safetensors"));
  const hasProcessor = await import_fs_extra2.default.pathExists(import_path2.default.join(modelDir, "preprocessor_config.json"));
  const hasTokenizer = await import_fs_extra2.default.pathExists(import_path2.default.join(modelDir, "tokenizer.json")) || await import_fs_extra2.default.pathExists(import_path2.default.join(modelDir, "vocab.json"));
  return hasConfig && hasWeights && hasProcessor && hasTokenizer;
}
function getUvCandidates() {
  var _a;
  const candidates = [];
  if (import_electron2.app.isPackaged) {
    if (process.platform === "win32") {
      candidates.push(import_path2.default.join(process.resourcesPath, "bin", "uv.exe"));
    } else if (process.platform === "darwin") {
      candidates.push(
        import_path2.default.join(
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
      candidates.push(import_path2.default.join(import_electron2.app.getAppPath(), "bin", "win32", "uv.exe"));
    } else if (process.platform === "darwin") {
      candidates.push(
        import_path2.default.join(
          import_electron2.app.getAppPath(),
          "bin",
          "mac",
          "arm64",
          "uv"
        )
      );
    }
  }
  const env = (_a = process.env.PROREF_UV_PATH) == null ? void 0 : _a.trim();
  if (env) candidates.push(env);
  candidates.push(getManagedUvPath());
  const uniq = [];
  const seen = /* @__PURE__ */ new Set();
  for (const c of candidates) {
    if (!c) continue;
    if (seen.has(c)) continue;
    seen.add(c);
    uniq.push(c);
  }
  return uniq;
}
function spawnUvPython(args, cwd, env) {
  const candidates = getUvCandidates();
  return new Promise((resolve, reject) => {
    const trySpawn = (index) => {
      if (index >= candidates.length) {
        reject(new Error("uv not found"));
        return;
      }
      const command = candidates[index];
      if (import_path2.default.isAbsolute(command) && !import_fs_extra2.default.pathExistsSync(command)) {
        trySpawn(index + 1);
        return;
      }
      const proc = (0, import_child_process2.spawn)(command, args, { stdio: ["ignore", "pipe", "pipe"], cwd, env });
      proc.once("error", (err) => {
        if (err.code === "ENOENT") {
          trySpawn(index + 1);
          return;
        }
        reject(err);
      });
      resolve(proc);
    };
    trySpawn(0);
  });
}
function getManagedUvPath() {
  return import_path2.default.join(import_electron2.app.getPath("userData"), "uv", process.platform === "win32" ? "uv.exe" : "uv");
}
var UV_VERSION = "latest";
function resolveUvReleaseAsset() {
  const baseUrl = "https://xget.xi-xu.me/gh/astral-sh/uv/releases";
  const downloadPath = UV_VERSION === "latest" ? "latest/download" : `download/${UV_VERSION}`;
  const base = `${baseUrl}/${downloadPath}`;
  if (process.platform === "darwin") {
    const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
    return { url: `${base}/uv-${arch}-apple-darwin.tar.gz`, kind: "tar.gz" };
  }
  if (process.platform === "linux") {
    const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
    return { url: `${base}/uv-${arch}-unknown-linux-gnu.tar.gz`, kind: "tar.gz" };
  }
  if (process.platform === "win32") {
    const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
    return { url: `${base}/uv-${arch}-pc-windows-msvc.zip`, kind: "zip" };
  }
  throw new Error(`Unsupported platform: ${process.platform}`);
}
function extractTarFile(buffer, predicate) {
  const block = 512;
  let offset = 0;
  while (offset + block <= buffer.length) {
    const header = buffer.subarray(offset, offset + block);
    let allZero = true;
    for (let i = 0; i < block; i++) {
      if (header[i] !== 0) {
        allZero = false;
        break;
      }
    }
    if (allZero) return null;
    const nameRaw = header.subarray(0, 100);
    const name = nameRaw.toString("utf8").replace(/\0.*$/, "");
    const sizeRaw = header.subarray(124, 136).toString("utf8").replace(/\0.*$/, "").trim();
    const size = sizeRaw ? Number.parseInt(sizeRaw, 8) : 0;
    const contentOffset = offset + block;
    const contentEnd = contentOffset + size;
    if (contentEnd > buffer.length) return null;
    if (name && predicate(name)) {
      return buffer.subarray(contentOffset, contentEnd);
    }
    const padded = Math.ceil(size / block) * block;
    offset = contentOffset + padded;
  }
  return null;
}
function extractZipFile(buffer, predicate) {
  const sigEOCD = 101010256;
  const sigCD = 33639248;
  const sigLFH = 67324752;
  const readU16 = (o) => buffer.readUInt16LE(o);
  const readU32 = (o) => buffer.readUInt32LE(o);
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i >= buffer.length - 65557; i--) {
    if (readU32(i) === sigEOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const cdSize = readU32(eocd + 12);
  const cdOffset = readU32(eocd + 16);
  let ptr = cdOffset;
  const cdEnd = cdOffset + cdSize;
  while (ptr + 46 <= buffer.length && ptr < cdEnd) {
    if (readU32(ptr) !== sigCD) return null;
    const compression = readU16(ptr + 10);
    const compSize = readU32(ptr + 20);
    const uncompSize = readU32(ptr + 24);
    const nameLen = readU16(ptr + 28);
    const extraLen = readU16(ptr + 30);
    const commentLen = readU16(ptr + 32);
    const lfhOffset = readU32(ptr + 42);
    const name = buffer.subarray(ptr + 46, ptr + 46 + nameLen).toString("utf8");
    ptr += 46 + nameLen + extraLen + commentLen;
    if (!predicate(name)) continue;
    if (readU32(lfhOffset) !== sigLFH) return null;
    const lfhNameLen = readU16(lfhOffset + 26);
    const lfhExtraLen = readU16(lfhOffset + 28);
    const dataOffset = lfhOffset + 30 + lfhNameLen + lfhExtraLen;
    const dataEnd = dataOffset + compSize;
    if (dataEnd > buffer.length) return null;
    const data = buffer.subarray(dataOffset, dataEnd);
    if (compression === 0) {
      if (uncompSize !== data.length) return data;
      return data;
    }
    if (compression === 8) {
      return import_zlib.default.inflateRawSync(data);
    }
    return null;
  }
  return null;
}
function downloadBuffer(url, onProgress) {
  return new Promise((resolve, reject) => {
    const visited = /* @__PURE__ */ new Set();
    const fetch2 = (u, depth) => {
      if (depth > 8) {
        reject(new Error("Too many redirects"));
        return;
      }
      if (visited.has(u)) {
        reject(new Error("Redirect loop"));
        return;
      }
      visited.add(u);
      const req = import_https2.default.get(u, (res) => {
        const status = res.statusCode || 0;
        const loc = res.headers.location;
        if ([301, 302, 303, 307, 308].includes(status) && loc) {
          const next = loc.startsWith("http") ? loc : new URL(loc, u).toString();
          res.resume();
          fetch2(next, depth + 1);
          return;
        }
        if (status < 200 || status >= 300) {
          res.resume();
          reject(new Error(`HTTP ${status}`));
          return;
        }
        const total = parseInt(res.headers["content-length"] || "0", 10);
        let current = 0;
        const chunks = [];
        res.on("data", (d) => {
          chunks.push(d);
          current += d.length;
          if (total > 0 && onProgress) {
            onProgress(current, total);
          }
        });
        res.on("end", () => resolve(Buffer.concat(chunks)));
      });
      req.on("error", reject);
    };
    fetch2(url, 0);
  });
}
async function ensureUvInstalled(onProgress) {
  const existing = getUvCandidates().find((c) => import_path2.default.isAbsolute(c) && import_fs_extra2.default.pathExistsSync(c));
  if (existing) return existing;
  const uvPath = getManagedUvPath();
  if (await import_fs_extra2.default.pathExists(uvPath)) {
    process.env.PROREF_UV_PATH = uvPath;
    return uvPath;
  }
  await import_fs_extra2.default.ensureDir(import_path2.default.dirname(uvPath));
  const { url, kind } = resolveUvReleaseAsset();
  import_electron_log.default.info(`Downloading uv from: ${url}`);
  const buf = await downloadBuffer(url, (current, total) => {
    if (onProgress && total > 0) {
      onProgress(current / total);
    }
  });
  let binary = null;
  if (kind === "tar.gz") {
    const tar = import_zlib.default.gunzipSync(buf);
    binary = extractTarFile(tar, (name) => name === "uv" || name.endsWith("/uv"));
  } else {
    binary = extractZipFile(buf, (name) => name === "uv.exe" || name.endsWith("/uv.exe"));
  }
  if (!binary) {
    throw new Error("Failed to extract uv binary");
  }
  await import_fs_extra2.default.writeFile(uvPath, binary);
  if (process.platform !== "win32") {
    await import_fs_extra2.default.chmod(uvPath, 493);
  }
  process.env.PROREF_UV_PATH = uvPath;
  return uvPath;
}
function getUnpackedPath(originalPath) {
  if (import_electron2.app.isPackaged) {
    return originalPath.replace("app.asar", "app.asar.unpacked");
  }
  return originalPath;
}
async function ensurePythonRuntime(parent) {
  const modelDir = getModelDir();
  process.env.PROREF_MODEL_DIR = modelDir;
  const scriptPath = getUnpackedPath(import_path2.default.join(__dirname, "../backend/python/tagger.py"));
  const pythonDir = import_path2.default.dirname(scriptPath);
  const sendProgress = (statusKey, percentText, progress, statusParams) => {
    if (parent.isDestroyed()) return;
    parent.webContents.send("env-init-progress", {
      isOpen: true,
      statusKey,
      statusParams,
      percentText,
      progress
    });
  };
  sendProgress("envInit.checkingUv", "0%", 0);
  await ensureUvInstalled((percent) => {
    sendProgress(
      "envInit.downloadingUv",
      `${Math.round(percent * 100)}%`,
      percent * 0.1
    );
  });
  sendProgress("envInit.initializingPythonEnv", "10%", 0.1);
  const syncProc = await spawnUvPython(["sync", "--frozen"], pythonDir, {
    ...process.env,
    PROREF_MODEL_DIR: modelDir,
    UV_NO_COLOR: "1"
  });
  if (syncProc.stderr) {
    syncProc.stderr.on("data", (chunk) => {
      const text = chunk.toString().toLowerCase();
      if (text.includes("resolved")) {
        sendProgress("envInit.resolvingDependencies", "20%", 0.2);
      } else if (text.includes("downloading")) {
        sendProgress("envInit.downloadingPackages", "40%", 0.4);
      } else if (text.includes("installing")) {
        sendProgress("envInit.installingPackages", "60%", 0.6);
      } else if (text.includes("audited")) {
        sendProgress("envInit.verifyingEnvironment", "80%", 0.8);
      }
    });
  }
  const syncExit = await new Promise((resolve) => syncProc.once("exit", resolve));
  if (syncExit !== 0) {
    parent.setProgressBar(-1);
    parent.webContents.send("env-init-progress", { isOpen: false });
    const locale = await getLocale();
    await import_electron2.dialog.showMessageBox(parent, {
      type: "error",
      title: t(locale, "dialog.pythonSetupFailedTitle"),
      message: t(locale, "dialog.pythonSetupFailedMessage"),
      detail: t(locale, "dialog.pythonSetupFailedDetail", {
        code: syncExit,
        dir: pythonDir
      })
    });
    throw new Error("Python setup failed");
  }
  sendProgress("envInit.pythonEnvReady", "100%", 1);
  parent.webContents.send("env-init-progress", { isOpen: false });
}
async function ensureModelReady(parent) {
  const modelDir = getModelDir();
  process.env.PROREF_MODEL_DIR = modelDir;
  const debug = process.env.PROREF_DEBUG_MODEL === "1";
  if (debug) console.log("[model] dir:", modelDir);
  try {
    const settingsPath = import_path2.default.join(getStorageDir(), "settings.json");
    if (await import_fs_extra2.default.pathExists(settingsPath)) {
      const settings = await import_fs_extra2.default.readJson(settingsPath);
      if (!settings.enableVectorSearch) {
        if (debug) console.log("[model] Vector search disabled, skipping model check");
        return;
      }
    } else {
      if (debug) console.log("[model] No settings file, skipping model check");
      return;
    }
  } catch (e) {
    console.error("[model] Failed to read settings:", e);
    return;
  }
  if (await hasRequiredModelFiles(modelDir)) {
    if (debug) console.log("[model] ok");
    return;
  }
  if (debug) console.log("[model] missing, start download");
  const sendProgress = (statusKey, percentText2, progress2, filename, statusParams) => {
    if (parent.isDestroyed()) return;
    parent.webContents.send("model-download-progress", {
      isOpen: true,
      statusKey,
      statusParams,
      percentText: percentText2,
      progress: progress2,
      filename
    });
  };
  sendProgress("model.preparingDownload", "0%", 0);
  parent.setProgressBar(0);
  const scriptPath = getUnpackedPath(import_path2.default.join(__dirname, "../backend/python/tagger.py"));
  const pythonDir = import_path2.default.dirname(scriptPath);
  let percentText = "0%";
  let progress = 0;
  sendProgress("model.downloading", percentText, progress);
  const proc = await spawnUvPython(["run", "python", scriptPath, "--download-model"], pythonDir, {
    ...process.env,
    PROREF_MODEL_DIR: modelDir
  });
  if (proc.stderr) {
    proc.stderr.on("data", (data) => {
      const msg = data.toString().trim();
      if (debug && msg) console.log("[model] py:", msg);
    });
  }
  let lastProgress = 0;
  if (proc.stdout) {
    const rl = import_readline2.default.createInterface({ input: proc.stdout });
    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      if (debug) console.log("[model] evt:", trimmed);
      const evt = (() => {
        try {
          return JSON.parse(trimmed);
        } catch {
          return null;
        }
      })();
      if (!(evt == null ? void 0 : evt.type)) return;
      if (evt.type === "file" && typeof evt.current === "number" && typeof evt.total === "number") {
        const p = Math.max(0, Math.min(1, evt.current / evt.total));
        const mapped = p;
        progress = mapped;
        percentText = `${Math.round(mapped * 100)}%`;
        lastProgress = p;
      }
      if (evt.type === "done" && evt.ok) {
        progress = 1;
        percentText = "100%";
      }
      if (evt.type === "error" && typeof evt.message === "string") {
        progress = Math.max(progress, 0);
      }
      if (evt.type === "file" && typeof evt.current === "number" && typeof evt.total === "number") {
        sendProgress(
          "model.downloadingFraction",
          percentText,
          progress,
          evt.filename,
          { current: evt.current, total: evt.total }
        );
        return;
      }
      if (evt.type === "done" && evt.ok) {
        sendProgress("model.ready", percentText, progress, evt.filename);
        return;
      }
      if (evt.type === "error") {
        const reason = typeof evt.message === "string" ? evt.message : "";
        sendProgress(
          reason ? "model.downloadFailedWithReason" : "model.downloadFailed",
          percentText,
          progress,
          evt.filename,
          reason ? { reason } : void 0
        );
        return;
      }
      if (evt.type === "start") {
        sendProgress("model.preparingDownload", percentText, progress, evt.filename);
        return;
      }
      sendProgress("model.downloading", percentText, progress, evt.filename);
    });
  }
  const exitCode = await new Promise((resolve) => proc.once("exit", resolve));
  parent.setProgressBar(-1);
  parent.webContents.send("model-download-progress", { isOpen: false });
  const ok = await hasRequiredModelFiles(modelDir);
  if (debug) console.log("[model] download exit:", exitCode, "ok:", ok);
  if (exitCode !== 0 || !ok) {
    const locale = await getLocale();
    await import_electron2.dialog.showMessageBox(parent, {
      type: "error",
      title: t(locale, "dialog.modelDownloadFailedTitle"),
      message: t(locale, "dialog.modelDownloadFailedMessage"),
      detail: t(locale, "dialog.modelDownloadFailedDetail", {
        code: exitCode,
        progress: Math.round(lastProgress * 100),
        dir: modelDir
      })
    });
    throw new Error("Model download failed");
  }
}
async function startServer2() {
  return startServer((channel, data) => {
    mainWindow == null ? void 0 : mainWindow.webContents.send(channel, data);
  });
}
import_electron2.ipcMain.handle("get-storage-dir", async () => {
  return getStorageDir();
});
import_electron2.ipcMain.handle("choose-storage-dir", async () => {
  const locale = await getLocale();
  const result = await import_electron2.dialog.showOpenDialog({
    title: t(locale, "dialog.chooseStorageFolderTitle"),
    properties: ["openDirectory", "createDirectory"]
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  const dir = result.filePaths[0];
  await setStorageRoot(dir);
  import_electron2.app.relaunch();
  import_electron2.app.exit(0);
});
import_electron2.app.whenReady().then(async () => {
  import_electron_log.default.info("App starting...");
  import_electron_log.default.info("Log file location:", import_electron_log.default.transports.file.getFile().path);
  import_electron_log.default.info("App path:", import_electron2.app.getAppPath());
  import_electron_log.default.info("User data:", import_electron2.app.getPath("userData"));
  await loadWindowPinState();
  createWindow();
  applyPinStateToWindow();
  await loadShortcuts();
  registerToggleWindowShortcut(toggleWindowShortcut);
  registerCanvasOpacityUpShortcut(canvasOpacityUpShortcut);
  registerCanvasOpacityDownShortcut(canvasOpacityDownShortcut);
  registerToggleMouseThroughShortcut(toggleMouseThroughShortcut);
  registerCanvasGroupShortcut(canvasGroupShortcut);
  if (mainWindow) {
    try {
      await startServer2();
      import_electron_log.default.info("Ensuring Python runtime...");
      await ensurePythonRuntime(mainWindow);
      import_electron_log.default.info("Ensuring model ready...");
      await ensureModelReady(mainWindow);
      import_electron_log.default.info("Model ready.");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[model] ensure failed:", message);
      import_electron_log.default.error("[model] ensure failed:", message);
    }
  }
  import_electron2.app.on("activate", () => {
    if (import_electron2.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      applyPinStateToWindow();
    }
  });
});
import_electron2.ipcMain.handle("set-toggle-window-shortcut", async (_event, accelerator) => {
  return registerToggleWindowShortcut(accelerator);
});
import_electron2.ipcMain.handle("set-canvas-opacity-up-shortcut", async (_event, accelerator) => {
  return registerCanvasOpacityUpShortcut(accelerator);
});
import_electron2.ipcMain.handle("set-canvas-opacity-down-shortcut", async (_event, accelerator) => {
  return registerCanvasOpacityDownShortcut(accelerator);
});
import_electron2.ipcMain.handle("set-toggle-mouse-through-shortcut", async (_event, accelerator) => {
  return registerToggleMouseThroughShortcut(accelerator);
});
import_electron2.ipcMain.handle("set-canvas-group-shortcut", async (_event, accelerator) => {
  return registerCanvasGroupShortcut(accelerator);
});
import_electron2.ipcMain.on("set-mouse-through", (_event, enabled) => {
  if (!enabled && mainWindow) {
    mainWindow.setIgnoreMouseEvents(false);
  }
});
import_electron2.ipcMain.on("set-ignore-mouse-events", (_event, ignore, options) => {
  if (mainWindow) {
    mainWindow.setIgnoreMouseEvents(ignore, options);
  }
});
import_electron2.ipcMain.on("settings-open-changed", (_event, open) => {
  isSettingsOpen = Boolean(open);
});
import_electron2.app.on("will-quit", () => {
  import_electron2.globalShortcut.unregisterAll();
});
import_electron2.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") import_electron2.app.quit();
});
