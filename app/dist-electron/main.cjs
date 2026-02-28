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
var import_path8 = __toESM(require("path"), 1);
var import_fs_extra7 = __toESM(require("fs-extra"), 1);
var import_electron_log = __toESM(require("electron-log"), 1);
var import_node_child_process2 = require("child_process");
var readline = __toESM(require("readline"), 1);

// backend/fileLock.ts
var import_fs_extra = __toESM(require("fs-extra"), 1);
var import_path = __toESM(require("path"), 1);
var KeyedMutex = class {
  locks = /* @__PURE__ */ new Map();
  async run(key, task) {
    const previous = this.locks.get(key) ?? Promise.resolve();
    let release = () => {
    };
    const current = new Promise((resolve) => {
      release = resolve;
    });
    const chain = previous.then(() => current);
    this.locks.set(key, chain);
    await previous;
    try {
      return await task();
    } finally {
      release();
      if (this.locks.get(key) === chain) {
        this.locks.delete(key);
      }
    }
  }
};
var mutex = new KeyedMutex();
var normalizeKey = (target) => {
  if (!target) return "unknown";
  try {
    return import_path.default.resolve(target);
  } catch {
    return target;
  }
};
var withFileLock = async (target, task) => {
  return mutex.run(normalizeKey(target), task);
};
var withFileLocks = async (targets, task) => {
  const keys = Array.from(new Set(targets.map(normalizeKey))).sort();
  const run = async (index) => {
    if (index >= keys.length) return task();
    return mutex.run(keys[index], () => run(index + 1));
  };
  return run(0);
};
var lockedFs = {
  pathExists: (target) => withFileLock(target, () => import_fs_extra.default.pathExists(target)),
  ensureDir: (target) => withFileLock(target, () => import_fs_extra.default.ensureDir(target)),
  ensureFile: (target) => withFileLock(target, () => import_fs_extra.default.ensureFile(target)),
  readJson: (target) => withFileLock(target, () => import_fs_extra.default.readJson(target)),
  writeJson: (target, data) => withFileLock(target, () => import_fs_extra.default.writeJson(target, data)),
  readFile: (target, options) => withFileLock(target, () => import_fs_extra.default.readFile(target, options)),
  writeFile: (target, data, options) => withFileLock(
    target,
    () => import_fs_extra.default.writeFile(target, data, options)
  ),
  appendFile: (target, data) => withFileLock(target, () => import_fs_extra.default.appendFile(target, data)),
  readdir: (target, options) => withFileLock(target, () => import_fs_extra.default.readdir(target, options)),
  stat: (target) => withFileLock(target, () => import_fs_extra.default.stat(target)),
  rename: (src, dest) => withFileLocks([src, dest], () => import_fs_extra.default.rename(src, dest)),
  copy: (src, dest) => withFileLocks([src, dest], () => import_fs_extra.default.copy(src, dest)),
  remove: (target) => withFileLock(target, () => import_fs_extra.default.remove(target)),
  unlink: (target) => withFileLock(target, () => import_fs_extra.default.unlink(target))
};

// backend/server.ts
var import_electron = require("electron");
var import_path7 = __toESM(require("path"), 1);
var import_express7 = __toESM(require("express"), 1);
var import_cors = __toESM(require("cors"), 1);
var import_body_parser = __toESM(require("body-parser"), 1);
var import_fs_extra6 = __toESM(require("fs-extra"), 1);
var import_node_crypto2 = require("crypto");
var import_radash = require("radash");

// backend/routes/settings.ts
var import_express = __toESM(require("express"), 1);
var createSettingsRouter = (deps) => {
  const router = import_express.default.Router();
  router.get("/api/settings", async (_req, res) => {
    try {
      const settings = await deps.readSettings();
      res.json(settings);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  router.get("/api/settings/:key", async (req, res) => {
    try {
      const key = req.params.key;
      if (!key) {
        res.status(400).json({ error: "Key is required" });
        return;
      }
      const settings = await deps.readSettings();
      const value = Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : null;
      res.json({ value });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  router.post("/api/settings/:key", async (req, res) => {
    try {
      const key = req.params.key;
      if (!key) {
        res.status(400).json({ error: "Key is required" });
        return;
      }
      const { value } = req.body;
      const settings = await deps.readSettings();
      const next = { ...settings, [key]: value };
      await deps.writeSettings(next);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  return router;
};

// backend/routes/canvas.ts
var import_path2 = __toESM(require("path"), 1);
var import_express2 = __toESM(require("express"), 1);
var import_fs_extra2 = __toESM(require("fs-extra"), 1);
var getCanvasPaths = (dir, name) => {
  const safeName = name.replace(/[/\\:*?"<>|]/g, "_") || "Default";
  const canvasDir = import_path2.default.join(dir, safeName);
  return {
    dir: canvasDir,
    dataFile: import_path2.default.join(canvasDir, "canvas.json"),
    viewportFile: import_path2.default.join(canvasDir, "canvas_viewport.json")
  };
};
var ensureDefaultCanvas = async (dir) => {
  const defaultCanvasPath = import_path2.default.join(dir, "Default");
  const canvases = await lockedFs.readdir(dir).catch(() => []);
  if (canvases.length === 0) {
    await lockedFs.ensureDir(defaultCanvasPath);
  }
};
var createCanvasRouter = (deps) => {
  const router = import_express2.default.Router();
  router.get("/api/canvases", async (_req, res) => {
    try {
      const canvasesDir = deps.getCanvasesDir();
      await ensureDefaultCanvas(canvasesDir);
      const dirs = await lockedFs.readdir(canvasesDir);
      const canvases = [];
      for (const dir of dirs) {
        const fullPath = import_path2.default.join(canvasesDir, dir);
        try {
          const stat = await lockedFs.stat(fullPath);
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
  router.post("/api/canvases", async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) {
        res.status(400).json({ error: "Canvas name is required" });
        return;
      }
      const paths = getCanvasPaths(deps.getCanvasesDir(), name);
      await withFileLock(paths.dir, async () => {
        if (await import_fs_extra2.default.pathExists(paths.dir)) {
          res.status(409).json({ error: "Canvas already exists" });
          return;
        }
        await import_fs_extra2.default.ensureDir(paths.dir);
      });
      if (res.headersSent) return;
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  router.post("/api/canvases/rename", async (req, res) => {
    try {
      const { oldName, newName } = req.body;
      if (!oldName || !newName) {
        res.status(400).json({ error: "Both oldName and newName are required" });
        return;
      }
      const canvasesDir = deps.getCanvasesDir();
      const oldPaths = getCanvasPaths(canvasesDir, oldName);
      const newPaths = getCanvasPaths(canvasesDir, newName);
      await withFileLocks([oldPaths.dir, newPaths.dir], async () => {
        if (!await import_fs_extra2.default.pathExists(oldPaths.dir)) {
          res.status(404).json({ error: "Canvas not found" });
          return;
        }
        if (await import_fs_extra2.default.pathExists(newPaths.dir)) {
          res.status(409).json({ error: "Target canvas name already exists" });
          return;
        }
        await import_fs_extra2.default.rename(oldPaths.dir, newPaths.dir);
      });
      if (res.headersSent) return;
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  router.post("/api/canvases/delete", async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) {
        res.status(400).json({ error: "Canvas name is required" });
        return;
      }
      const paths = getCanvasPaths(deps.getCanvasesDir(), name);
      await withFileLock(paths.dir, async () => {
        if (await import_fs_extra2.default.pathExists(paths.dir)) {
          await import_fs_extra2.default.remove(paths.dir);
        }
      });
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  router.post("/api/save-canvas", async (req, res) => {
    try {
      const { images, canvasName } = req.body;
      const paths = getCanvasPaths(deps.getCanvasesDir(), canvasName || "Default");
      await withFileLocks([paths.dir, paths.dataFile], async () => {
        await import_fs_extra2.default.ensureDir(paths.dir);
        await import_fs_extra2.default.writeJson(paths.dataFile, images);
      });
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  router.post("/api/canvas-viewport", async (req, res) => {
    try {
      const { viewport, canvasName } = req.body;
      const paths = getCanvasPaths(deps.getCanvasesDir(), canvasName || "Default");
      await withFileLocks([paths.dir, paths.viewportFile], async () => {
        await import_fs_extra2.default.ensureDir(paths.dir);
        await import_fs_extra2.default.writeJson(paths.viewportFile, viewport);
      });
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  router.get("/api/canvas-viewport", async (req, res) => {
    try {
      const canvasName = req.query.canvasName;
      const paths = getCanvasPaths(deps.getCanvasesDir(), canvasName || "Default");
      await withFileLock(paths.viewportFile, async () => {
        if (await import_fs_extra2.default.pathExists(paths.viewportFile)) {
          const viewport = await import_fs_extra2.default.readJson(paths.viewportFile);
          res.json(viewport);
          return;
        }
        res.json(null);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  router.get("/api/load-canvas", async (req, res) => {
    try {
      const canvasName = req.query.canvasName;
      const paths = getCanvasPaths(deps.getCanvasesDir(), canvasName || "Default");
      let images = [];
      await withFileLock(paths.dataFile, async () => {
        if (await import_fs_extra2.default.pathExists(paths.dataFile)) {
          images = await import_fs_extra2.default.readJson(paths.dataFile);
        }
      });
      res.json(images);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  return router;
};

// backend/routes/anchors.ts
var import_express3 = __toESM(require("express"), 1);
var import_path3 = __toESM(require("path"), 1);
var import_fs_extra3 = __toESM(require("fs-extra"), 1);
var createAnchorsRouter = (deps) => {
  const router = import_express3.default.Router();
  const getAnchorsPath = () => import_path3.default.join(deps.getStorageDir(), "anchors.json");
  router.get("/api/anchors", async (_req, res) => {
    try {
      const anchorsPath = getAnchorsPath();
      await withFileLock(anchorsPath, async () => {
        if (await import_fs_extra3.default.pathExists(anchorsPath)) {
          const anchors = await import_fs_extra3.default.readJson(anchorsPath);
          res.json(anchors);
          return;
        }
        res.json({});
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  router.post("/api/anchors", async (req, res) => {
    try {
      const anchors = req.body;
      const anchorsPath = getAnchorsPath();
      await withFileLock(anchorsPath, async () => {
        await import_fs_extra3.default.ensureFile(anchorsPath);
        await import_fs_extra3.default.writeJson(anchorsPath, anchors);
      });
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  return router;
};

// backend/routes/commands.ts
var import_express4 = __toESM(require("express"), 1);
var import_path4 = __toESM(require("path"), 1);
var import_fs_extra4 = __toESM(require("fs-extra"), 1);
var isSafeSegment = (value) => value.length > 0 && !value.includes("..") && !value.includes("/") && !value.includes("\\");
var ROOT_FOLDER = "__root__";
var isScriptFile = (value) => {
  const ext = import_path4.default.extname(value).toLowerCase();
  return ext === ".js" || ext === ".jsx" || ext === ".mjs";
};
var createCommandsRouter = (deps) => {
  const router = import_express4.default.Router();
  const getCommandsDir = () => import_path4.default.join(deps.getStorageDir(), "commands");
  router.get("/api/commands", async (_req, res) => {
    try {
      const commandsDir = getCommandsDir();
      await import_fs_extra4.default.ensureDir(commandsDir);
      const entries = await import_fs_extra4.default.readdir(commandsDir).catch(() => []);
      const result = [];
      for (const entry of entries) {
        const dirPath = import_path4.default.join(commandsDir, entry);
        const stat = await import_fs_extra4.default.stat(dirPath).catch(() => null);
        if (!stat) continue;
        if (!stat.isFile()) continue;
        if (!isSafeSegment(entry)) continue;
        if (!isScriptFile(entry)) continue;
        const parsed = import_path4.default.parse(entry);
        const id = parsed.name.trim();
        if (!id) continue;
        result.push({
          id,
          title: id,
          entry,
          folder: ROOT_FOLDER
        });
      }
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  router.get("/api/commands/:folder/script", async (req, res) => {
    try {
      const { folder } = req.params;
      const entry = typeof req.query.entry === "string" ? req.query.entry : "";
      if (!isSafeSegment(folder) || entry && !isSafeSegment(entry)) {
        res.status(400).send("Invalid path");
        return;
      }
      const commandsDir = getCommandsDir();
      const dirPath = folder === ROOT_FOLDER ? commandsDir : import_path4.default.join(commandsDir, folder);
      const entryName = entry || "script.js";
      const scriptPath = import_path4.default.join(dirPath, entryName);
      await withFileLock(scriptPath, async () => {
        if (!await import_fs_extra4.default.pathExists(scriptPath)) {
          res.status(404).send("Not found");
          return;
        }
        const content = await import_fs_extra4.default.readFile(scriptPath, "utf-8");
        res.type("application/javascript").send(content);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  router.delete("/api/commands/:folder", async (req, res) => {
    try {
      const { folder } = req.params;
      const entry = typeof req.query.entry === "string" ? req.query.entry : "";
      if (!entry) {
        res.status(400).json({ error: "Missing entry" });
        return;
      }
      if (!isSafeSegment(folder) || !isSafeSegment(entry) || !isScriptFile(entry)) {
        res.status(400).json({ error: "Invalid path" });
        return;
      }
      const commandsDir = getCommandsDir();
      const dirPath = folder === ROOT_FOLDER ? commandsDir : import_path4.default.join(commandsDir, folder);
      const scriptPath = import_path4.default.join(dirPath, entry);
      await withFileLock(scriptPath, async () => {
        if (!await import_fs_extra4.default.pathExists(scriptPath)) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        await import_fs_extra4.default.remove(scriptPath);
        res.json({ success: true });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  return router;
};

// backend/routes/temp.ts
var import_path5 = __toESM(require("path"), 1);
var import_express5 = __toESM(require("express"), 1);
var import_fs_extra5 = __toESM(require("fs-extra"), 1);
var import_sharp = __toESM(require("sharp"), 1);
var createTempRouter = (deps) => {
  const router = import_express5.default.Router();
  const getAssetsDir = (canvasName) => deps.getCanvasAssetsDir(canvasName || "Default");
  const createRequestId = () => `durl_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`;
  const normalizeLogUrl = (rawUrl) => {
    try {
      const parsed = new URL(rawUrl);
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      return rawUrl;
    }
  };
  const resolveUniqueFilename = async (assetsDir, desired) => {
    return withFileLock(assetsDir, async () => {
      const parsed = import_path5.default.parse(desired);
      let candidate = desired;
      let index = 1;
      while (await import_fs_extra5.default.pathExists(import_path5.default.join(assetsDir, candidate))) {
        candidate = `${parsed.name}_${index}${parsed.ext}`;
        index += 1;
      }
      return candidate;
    });
  };
  router.post("/api/download-url", async (req, res) => {
    const requestId = createRequestId();
    const startedAt = Date.now();
    let stage = "validate-input";
    let lockWaitMs = 0;
    let downloadMs = 0;
    let metadataMs = 0;
    let dominantColorMs = 0;
    let toneMs = 0;
    try {
      const { url, canvasName } = req.body;
      if (!url || typeof url !== "string") {
        res.status(400).json({ error: "URL is required" });
        return;
      }
      const trimmedUrl = url.trim();
      if (!trimmedUrl.startsWith("http://") && !trimmedUrl.startsWith("https://")) {
        res.status(400).json({ error: "Invalid URL" });
        return;
      }
      console.info(`[temp][download-url][${requestId}] start`, {
        canvasName: canvasName || "Default",
        url: normalizeLogUrl(trimmedUrl)
      });
      let urlFilename = "image.jpg";
      try {
        const urlObj = new URL(trimmedUrl);
        const pathname = urlObj.pathname;
        const baseName = import_path5.default.basename(pathname).split("?")[0];
        if (baseName && /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(baseName)) {
          urlFilename = baseName;
        }
      } catch {
      }
      const ext = import_path5.default.extname(urlFilename) || ".jpg";
      const nameWithoutExt = import_path5.default.basename(urlFilename, ext);
      const safeName = nameWithoutExt.replace(/[^a-zA-Z0-9.\-_]/g, "_") || "image";
      const timestamp = Date.now();
      const filename = `${safeName}_${timestamp}${ext}`;
      const assetsDir = getAssetsDir(canvasName);
      stage = "ensure-assets-dir";
      await import_fs_extra5.default.ensureDir(assetsDir);
      stage = "resolve-unique-filename";
      const uniqueFilename = await resolveUniqueFilename(assetsDir, filename);
      const filepath = import_path5.default.join(assetsDir, uniqueFilename);
      let width = 0;
      let height = 0;
      let dominantColor = null;
      let tone = null;
      stage = "wait-file-locks";
      const lockRequestedAt = Date.now();
      await withFileLocks([assetsDir, filepath], async () => {
        lockWaitMs = Date.now() - lockRequestedAt;
        console.info(`[temp][download-url][${requestId}] lock-acquired`, {
          lockWaitMs,
          file: uniqueFilename
        });
        stage = "download-image";
        const downloadStartedAt = Date.now();
        await deps.downloadImage(trimmedUrl, filepath);
        downloadMs = Date.now() - downloadStartedAt;
        try {
          stage = "read-metadata";
          const metadataStartedAt = Date.now();
          const metadata = await (0, import_sharp.default)(filepath).metadata();
          metadataMs = Date.now() - metadataStartedAt;
          width = metadata.width || 0;
          height = metadata.height || 0;
        } catch (e) {
          console.error("Failed to read image metadata", e);
        }
        stage = "analyze-dominant-color";
        const dominantStartedAt = Date.now();
        dominantColor = await deps.getDominantColor(filepath);
        dominantColorMs = Date.now() - dominantStartedAt;
        stage = "analyze-tone";
        const toneStartedAt = Date.now();
        tone = await deps.getTone(filepath);
        toneMs = Date.now() - toneStartedAt;
      });
      stage = "complete";
      console.info(`[temp][download-url][${requestId}] success`, {
        elapsedMs: Date.now() - startedAt,
        lockWaitMs,
        downloadMs,
        metadataMs,
        dominantColorMs,
        toneMs,
        width,
        height,
        file: uniqueFilename
      });
      res.json({
        success: true,
        filename: uniqueFilename,
        path: `assets/${uniqueFilename}`,
        width,
        height,
        dominantColor,
        tone
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[temp][download-url][${requestId}] failed`, {
        stage,
        elapsedMs: Date.now() - startedAt,
        lockWaitMs,
        downloadMs,
        metadataMs,
        dominantColorMs,
        toneMs,
        error: message
      });
      res.status(500).json({ error: message });
    }
  });
  router.post("/api/upload-temp", async (req, res) => {
    try {
      const { imageBase64, filename: providedFilename, canvasName } = req.body;
      if (!imageBase64) {
        res.status(400).json({ error: "No image data" });
        return;
      }
      let filename = "temp.png";
      if (providedFilename) {
        const ext = import_path5.default.extname(providedFilename) || ".png";
        const name = import_path5.default.basename(providedFilename, ext);
        const safeName = name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
        filename = `${safeName}${ext}`;
      }
      const assetsDir = getAssetsDir(canvasName);
      await import_fs_extra5.default.ensureDir(assetsDir);
      const uniqueFilename = await resolveUniqueFilename(assetsDir, filename);
      const filepath = import_path5.default.join(assetsDir, uniqueFilename);
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      let width = 0;
      let height = 0;
      let dominantColor = null;
      let tone = null;
      await withFileLocks([assetsDir, filepath], async () => {
        await import_fs_extra5.default.writeFile(filepath, base64Data, "base64");
        try {
          const metadata = await (0, import_sharp.default)(filepath).metadata();
          width = metadata.width || 0;
          height = metadata.height || 0;
        } catch (e) {
          console.error("Failed to read image metadata", e);
        }
        dominantColor = await deps.getDominantColor(filepath);
        tone = await deps.getTone(filepath);
      });
      res.json({
        success: true,
        filename: uniqueFilename,
        path: `assets/${uniqueFilename}`,
        width,
        height,
        dominantColor,
        tone
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  router.post("/api/delete-temp-file", async (req, res) => {
    try {
      const { filePath, canvasName } = req.body;
      if (!filePath) {
        res.status(400).json({ error: "File path is required" });
        return;
      }
      if (!filePath.startsWith("assets/")) {
        res.status(400).json({ error: "Invalid file path format" });
        return;
      }
      const filename = import_path5.default.basename(filePath);
      const targetPath = import_path5.default.join(getAssetsDir(canvasName), filename);
      await withFileLock(targetPath, async () => {
        if (await import_fs_extra5.default.pathExists(targetPath)) {
          await import_fs_extra5.default.unlink(targetPath);
          res.json({ success: true });
          return;
        }
        res.status(404).json({ error: "File not found" });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  router.post("/api/temp-dominant-color", async (req, res) => {
    try {
      const { filePath, canvasName } = req.body;
      if (!filePath) {
        res.status(400).json({ error: "File path is required" });
        return;
      }
      if (!filePath.startsWith("assets/")) {
        res.status(400).json({ error: "Invalid file path format" });
        return;
      }
      const filename = import_path5.default.basename(filePath);
      const targetPath = import_path5.default.join(getAssetsDir(canvasName), filename);
      const exists = await withFileLock(
        targetPath,
        () => import_fs_extra5.default.pathExists(targetPath)
      );
      if (!exists) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      const dominantColor = await deps.getDominantColor(targetPath);
      res.json({ success: true, dominantColor });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  return router;
};

// backend/routes/shell.ts
var import_path6 = __toESM(require("path"), 1);
var import_express6 = __toESM(require("express"), 1);
var import_node_child_process = require("child_process");
var import_node_crypto = require("crypto");
var DEFAULT_TIMEOUT_MS = 15e3;
var MAX_TIMEOUT_MS = 12e4;
var MAX_OUTPUT_LENGTH = 1024 * 1024;
var SHELL_AUTH_HEADER = "x-lookback-token";
var sanitizeCommand = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes("\0")) return null;
  return trimmed;
};
var sanitizeArgs = (value) => {
  if (value === void 0) return [];
  if (!Array.isArray(value)) return null;
  const args = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    if (item.includes("\0")) return null;
    args.push(item);
  }
  return args;
};
var sanitizeCwd = (value) => {
  if (value === void 0) return process.cwd();
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return process.cwd();
  if (trimmed.includes("\0")) return null;
  return import_path6.default.resolve(trimmed);
};
var sanitizeTimeoutMs = (value) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_TIMEOUT_MS;
  }
  if (value <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.floor(value));
};
var appendChunk = (current, chunk) => {
  if (current.length >= MAX_OUTPUT_LENGTH) return current;
  const remain = MAX_OUTPUT_LENGTH - current.length;
  return current + chunk.toString("utf8", 0, remain);
};
var isAuthorized = (actual, expected) => {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return (0, import_node_crypto.timingSafeEqual)(a, b);
};
var runShellCommand = (command, args, cwd, timeoutMs) => new Promise((resolve, reject) => {
  var _a2, _b;
  const child = (0, import_node_child_process.spawn)(command, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    shell: false
  });
  let stdout = "";
  let stderr = "";
  let timedOut = false;
  let settled = false;
  const settle = (result) => {
    if (settled) return;
    settled = true;
    resolve(result);
  };
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
    setTimeout(() => {
      if (!settled) {
        child.kill("SIGKILL");
      }
    }, 1e3);
  }, timeoutMs);
  (_a2 = child.stdout) == null ? void 0 : _a2.on("data", (chunk) => {
    stdout = appendChunk(stdout, chunk);
  });
  (_b = child.stderr) == null ? void 0 : _b.on("data", (chunk) => {
    stderr = appendChunk(stderr, chunk);
  });
  child.once("error", (error) => {
    clearTimeout(timer);
    if (settled) return;
    settled = true;
    reject(error);
  });
  child.once("close", (code, signal) => {
    clearTimeout(timer);
    settle({ code, signal, stdout, stderr, timedOut });
  });
});
var createShellRouter = (deps) => {
  const router = import_express6.default.Router();
  router.post("/api/shell", async (req, res) => {
    const authHeader = req.get(SHELL_AUTH_HEADER) || "";
    const expectedToken = deps.getApiAuthToken();
    if (!isAuthorized(authHeader, expectedToken)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const body = req.body ?? {};
    const command = sanitizeCommand(body.command);
    const args = sanitizeArgs(body.args);
    const cwd = sanitizeCwd(body.cwd);
    const timeoutMs = sanitizeTimeoutMs(body.timeoutMs);
    if (!command) {
      res.status(400).json({ error: "Invalid command" });
      return;
    }
    if (!args) {
      res.status(400).json({ error: "Invalid args" });
      return;
    }
    if (!cwd) {
      res.status(400).json({ error: "Invalid cwd" });
      return;
    }
    try {
      const result = await runShellCommand(command, args, cwd, timeoutMs);
      const success = result.code === 0 && !result.timedOut;
      const error = result.timedOut ? "Command timed out" : success ? null : result.stderr.trim() || `Command exited with code ${result.code ?? "null"}`;
      res.json({
        success,
        code: result.code,
        signal: result.signal,
        stdout: result.stdout,
        stderr: result.stderr,
        timedOut: result.timedOut,
        error
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        success: false,
        code: null,
        signal: null,
        stdout: "",
        stderr: "",
        timedOut: false,
        error: message
      });
    }
  });
  return router;
};

// backend/imageAnalysis.ts
var import_sharp2 = __toESM(require("sharp"), 1);
function rgbToHsv(r, g, b) {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (max !== min) {
    switch (max) {
      case rNorm:
        h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0);
        break;
      case gNorm:
        h = (bNorm - rNorm) / d + 2;
        break;
      case bNorm:
        h = (rNorm - gNorm) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h, s, v };
}
function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("");
}
async function getDominantColor(filePath) {
  try {
    const { data, info } = await (0, import_sharp2.default)(filePath).resize(150, 150, { fit: "cover" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const channels = info.channels || 4;
    let pixelCount = 0;
    const colorCounts = /* @__PURE__ */ new Map();
    const QUANTIZATION_BITS = 5;
    const SHIFT = 8 - QUANTIZATION_BITS;
    const BIN_SIZE = 1 << SHIFT;
    const OFFSET = BIN_SIZE / 2;
    for (let i = 0; i < data.length; i += channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = channels > 3 ? data[i + 3] : 255;
      if (a === 0) continue;
      pixelCount += 1;
      const rQ = r >> SHIFT << SHIFT;
      const gQ = g >> SHIFT << SHIFT;
      const bQ = b >> SHIFT << SHIFT;
      const key = `${rQ},${gQ},${bQ}`;
      colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
    }
    const sortedColors = Array.from(colorCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([key, count]) => {
      const [r, g, b] = key.split(",").map(Number);
      return {
        r: Math.min(255, r + OFFSET),
        g: Math.min(255, g + OFFSET),
        b: Math.min(255, b + OFFSET),
        count
      };
    });
    let bestScore = -1;
    let bestHex = "#808080";
    const totalPixels = pixelCount;
    if (totalPixels === 0) return "#808080";
    for (const color of sortedColors) {
      const { r, g, b, count } = color;
      const { s, v } = rgbToHsv(r, g, b);
      const dominance = count / totalPixels;
      let score = dominance;
      score *= 1 + s * 1.5;
      score *= 1 + v * 1.2;
      if (v < 0.2) {
        score *= 0.1;
      }
      if (s < 0.1 && v > 0.8) {
        score *= 0.5;
      }
      if (score > bestScore) {
        bestScore = score;
        bestHex = rgbToHex(r, g, b);
      }
    }
    return bestHex;
  } catch (error) {
    console.error(`Error calculating dominant color for ${filePath}:`, error);
    return "#808080";
  }
}
async function calculateTone(filePath) {
  try {
    const { data, info } = await (0, import_sharp2.default)(filePath).resize(150, 150, { fit: "cover" }).grayscale().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const hist = new Array(256).fill(0);
    const channels = info.channels || 2;
    for (let i = 0; i < data.length; i += channels) {
      const v = data[i];
      const a = channels > 1 ? data[i + 1] : 255;
      if (a === 0) continue;
      hist[v]++;
    }
    const totalPixels = hist.reduce((sum, count) => sum + count, 0);
    if (totalPixels === 0) return "mid-mid";
    let shadowPixels = 0;
    let highlightPixels = 0;
    let weightedSum = 0;
    for (let i = 0; i < 256; i++) {
      const count = hist[i];
      if (i <= 85) shadowPixels += count;
      if (i >= 171) highlightPixels += count;
      weightedSum += i * count;
    }
    const pShadow = shadowPixels / totalPixels;
    const pHigh = highlightPixels / totalPixels;
    const meanLum = weightedSum / totalPixels;
    let key = "mid";
    if (pHigh > 0.6 || meanLum > 180) {
      key = "high";
    } else if (pShadow > 0.6 || meanLum < 75) {
      key = "low";
    }
    let cumulative = 0;
    let p5Idx = -1;
    let p95Idx = 255;
    for (let i = 0; i < 256; i++) {
      cumulative += hist[i];
      const frac = cumulative / totalPixels;
      if (frac >= 0.05 && p5Idx === -1) {
        p5Idx = i;
      }
      if (frac >= 0.95) {
        p95Idx = i;
        break;
      }
    }
    if (p5Idx === -1) p5Idx = 0;
    const dynamicRange = p95Idx - p5Idx;
    let toneRange = "mid";
    if (dynamicRange < 100) {
      toneRange = "short";
    } else if (dynamicRange > 190) {
      toneRange = "long";
    }
    return `${key}-${toneRange}`;
  } catch (error) {
    console.error(`Error calculating tone for ${filePath}:`, error);
    return "mid-mid";
  }
}

// backend/server.ts
var import_adm_zip = __toESM(require("adm-zip"), 1);

// shared/constants.ts
var DEFAULT_COMMAND_FILES = [
  "addText.jsx",
  "canvasImportExport.jsx",
  "imageSearch.jsx",
  "stitchExport.jsx"
  // "clip.jsx",
  // "imageGene.jsx",
  // "multiSearch.jsx",
  // "copySelectedImageToClipboard.jsx",
  // "packageCanvasAssetsZip.jsx",
  // "openSelectedImageInFolder.jsx",
];

// backend/server.ts
var DEFAULT_SERVER_PORT = 30001;
var MAX_SERVER_PORT = 65535;
var CONFIG_FILE = import_path7.default.join(import_electron.app.getPath("userData"), "lookback_config.json");
var API_AUTH_TOKEN = (0, import_node_crypto2.randomBytes)(32).toString("hex");
var DEFAULT_STORAGE_DIR = import_path7.default.join(import_electron.app.getPath("userData"), "lookback_storage");
var loadStorageRoot = async () => {
  try {
    if (await lockedFs.pathExists(CONFIG_FILE)) {
      const raw = await lockedFs.readJson(CONFIG_FILE).catch(() => null);
      if (raw && typeof raw.storageDir === "string" && raw.storageDir.trim()) {
        return raw.storageDir;
      }
    }
  } catch {
  }
  if (import_electron.app.isPackaged && process.platform !== "darwin") {
    try {
      const exeDir = import_path7.default.dirname(import_electron.app.getPath("exe"));
      const portableDataDir = import_path7.default.join(exeDir, "data");
      if (await lockedFs.pathExists(portableDataDir)) {
        return portableDataDir;
      }
      const testFile = import_path7.default.join(exeDir, ".write_test");
      const writable = await withFileLock(testFile, async () => {
        try {
          await import_fs_extra6.default.writeFile(testFile, "test");
          await import_fs_extra6.default.remove(testFile);
          return true;
        } catch {
          return false;
        }
      });
      if (writable) {
        return portableDataDir;
      }
    } catch {
    }
  }
  return DEFAULT_STORAGE_DIR;
};
var STORAGE_DIR = DEFAULT_STORAGE_DIR;
var CANVASES_DIR = import_path7.default.join(STORAGE_DIR, "canvases");
var SETTINGS_FILE = import_path7.default.join(STORAGE_DIR, "settings.json");
var settingsCache = null;
var storageInitTask = null;
var updateStoragePaths = (root) => {
  STORAGE_DIR = root;
  CANVASES_DIR = import_path7.default.join(STORAGE_DIR, "canvases");
  SETTINGS_FILE = import_path7.default.join(STORAGE_DIR, "settings.json");
};
var ensureStorageDirs = async (root) => {
  await Promise.all([
    lockedFs.ensureDir(root),
    lockedFs.ensureDir(import_path7.default.join(root, "canvases"))
  ]);
};
var ensureDefaultCommands = async () => {
  const commandsDir = import_path7.default.join(STORAGE_DIR, "commands");
  await lockedFs.ensureDir(commandsDir);
  const sourceDir = import_path7.default.join(import_electron.app.getAppPath(), "src", "commands-pending");
  await Promise.all(
    DEFAULT_COMMAND_FILES.map(async (fileName) => {
      const destPath = import_path7.default.join(commandsDir, fileName);
      const srcPath = import_path7.default.join(sourceDir, fileName);
      try {
        const content = await lockedFs.readFile(srcPath, "utf-8");
        await lockedFs.writeFile(destPath, content);
      } catch (error) {
        console.error("Failed to sync default command", fileName, error);
      }
    })
  );
};
var getStorageDir = () => STORAGE_DIR;
var getApiAuthToken = () => API_AUTH_TOKEN;
var setStorageRoot = async (root) => {
  const trimmed = root.trim();
  if (!trimmed) return;
  updateStoragePaths(trimmed);
  settingsCache = null;
  await ensureStorageDirs(STORAGE_DIR);
  await withFileLock(CONFIG_FILE, async () => {
    await import_fs_extra6.default.writeJson(CONFIG_FILE, { storageDir: STORAGE_DIR });
  });
};
var readSettings = async () => {
  if (settingsCache) return settingsCache;
  return withFileLock(SETTINGS_FILE, async () => {
    if (!await import_fs_extra6.default.pathExists(SETTINGS_FILE)) {
      settingsCache = {};
      return settingsCache;
    }
    try {
      const raw = await import_fs_extra6.default.readJson(SETTINGS_FILE);
      if (raw && typeof raw === "object") {
        settingsCache = raw;
        return settingsCache;
      }
    } catch (error) {
      console.error("Failed to read settings file", error);
    }
    settingsCache = {};
    return settingsCache;
  });
};
var persistSettings = (0, import_radash.debounce)({ delay: 500 }, async (settings) => {
  await withFileLock(SETTINGS_FILE, async () => {
    try {
      await import_fs_extra6.default.writeJson(SETTINGS_FILE, settings);
    } catch (error) {
      console.error("Failed to write settings file", error);
    }
  });
});
var writeSettings = async (settings) => {
  settingsCache = settings;
  persistSettings(settings);
};
var ensureStorageInitialized = async () => {
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
var getCanvasAssetsDir = (canvasName) => {
  const safeName = canvasName.replace(/[/\\:*?"<>|]/g, "_") || "Default";
  return import_path7.default.join(CANVASES_DIR, safeName, "assets");
};
var cleanupCanvasAssets = async () => {
  const canvasesDir = CANVASES_DIR;
  if (!await lockedFs.pathExists(canvasesDir)) return;
  const dirs = await lockedFs.readdir(canvasesDir).catch(() => []);
  for (const dir of dirs) {
    const canvasDir = import_path7.default.join(canvasesDir, dir);
    const stat = await lockedFs.stat(canvasDir).catch(() => null);
    if (!stat || !stat.isDirectory()) continue;
    const canvasJsonPath = import_path7.default.join(canvasDir, "canvas.json");
    const assetsDir = import_path7.default.join(canvasDir, "assets");
    const hasCanvas = await lockedFs.pathExists(canvasJsonPath);
    if (!hasCanvas) continue;
    await withFileLocks([canvasJsonPath, assetsDir], async () => {
      let canvasData = [];
      try {
        canvasData = await import_fs_extra6.default.readJson(canvasJsonPath);
      } catch {
        return;
      }
      const items = Array.isArray(canvasData) ? canvasData : [];
      const referenced = /* @__PURE__ */ new Set();
      let changed = false;
      const checks = await Promise.all(items.map(async (item) => {
        if (!item || typeof item !== "object") return false;
        if ("type" in item && item.type === "image") {
          const imagePath = typeof item.imagePath === "string" ? item.imagePath : "";
          if (imagePath.startsWith("assets/")) {
            const filename = import_path7.default.basename(imagePath);
            const fullPath = import_path7.default.join(assetsDir, filename);
            if (await import_fs_extra6.default.pathExists(fullPath)) {
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
        await import_fs_extra6.default.writeJson(canvasJsonPath, nextItems);
      }
      if (await import_fs_extra6.default.pathExists(assetsDir)) {
        const files = await import_fs_extra6.default.readdir(assetsDir).catch(() => []);
        for (const file of files) {
          if (!referenced.has(file)) {
            await import_fs_extra6.default.unlink(import_path7.default.join(assetsDir, file)).catch(() => void 0);
          }
        }
      }
    });
  }
};
function downloadImage(url, dest) {
  const REQUEST_TIMEOUT_MS = 15e3;
  const MAX_RETRY_ATTEMPTS = 3;
  const copyFromLocalPath = async (targetUrl) => {
    let srcPath = targetUrl;
    if (targetUrl.startsWith("file://")) {
      srcPath = new URL(targetUrl).pathname;
      if (process.platform === "win32" && srcPath.startsWith("/") && srcPath.includes(":")) {
        srcPath = srcPath.substring(1);
      }
    }
    await import_fs_extra6.default.copy(decodeURIComponent(srcPath), dest);
  };
  const isRetryableDownloadError = (error) => {
    const code = error.code;
    if (code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ECONNABORTED" || code === "EAI_AGAIN" || code === "EPIPE" || code === "ENETUNREACH") {
      return true;
    }
    return /socket hang up|timeout|network/i.test(error.message);
  };
  const normalizeRemoteUrl = (rawUrl) => {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.hostname === "pbs.twimg.com" && parsed.pathname.startsWith("/media/")) {
        if (!parsed.searchParams.has("name")) {
          parsed.searchParams.set("name", "orig");
        }
        if (!parsed.searchParams.has("format")) {
          const ext = import_path7.default.extname(parsed.pathname).replace(".", "");
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
  const requestRemoteOnce = async (targetUrl) => {
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
      const response = await import_electron.net.fetch(targetUrl, {
        method: "GET",
        redirect: "follow",
        signal: abortController.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 LookBack/1.0",
          Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          ...referer ? { Referer: `${referer}/` } : {},
          Connection: "close"
        }
      });
      if (!response.ok) {
        throw new Error(
          `Server responded with ${response.status}: ${response.statusText}`
        );
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      await import_fs_extra6.default.writeFile(dest, buffer);
    } catch (error) {
      void import_fs_extra6.default.remove(dest).catch(() => void 0);
      if (error instanceof Error && (error.name === "AbortError" || /aborted/i.test(error.message))) {
        throw new Error("Download timeout");
      }
      throw error instanceof Error ? error : new Error(String(error));
    } finally {
      clearTimeout(timeoutId);
    }
  };
  const requestRemote = async (targetUrl) => {
    const normalizedUrl = normalizeRemoteUrl(targetUrl);
    let lastError = null;
    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt += 1) {
      try {
        console.info("[temp][download] attempt", {
          attempt,
          targetUrl: normalizedUrl
        });
        await requestRemoteOnce(normalizedUrl);
        return;
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error));
        lastError = normalized;
        const shouldRetry = attempt < MAX_RETRY_ATTEMPTS && isRetryableDownloadError(normalized);
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
var listenOnAvailablePort = (appServer, startPort) => new Promise((resolve, reject) => {
  const tryListen = (port) => {
    if (port > MAX_SERVER_PORT) {
      reject(new Error("No available localhost port for local server"));
      return;
    }
    const httpServer = appServer.listen(port, () => {
      resolve(port);
    });
    httpServer.once("error", (error) => {
      if (error.code === "EADDRINUSE") {
        tryListen(port + 1);
        return;
      }
      reject(error);
    });
  };
  tryListen(startPort);
});
async function startServer() {
  await ensureStorageInitialized();
  await cleanupCanvasAssets();
  const server = (0, import_express7.default)();
  server.use(
    (0, import_cors.default)({
      origin: (origin, callback) => {
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
          const isDevRenderer = (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") && parsed.port === "5173";
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
      allowedHeaders: ["Content-Type", "x-lookback-token"]
    })
  );
  server.use(import_body_parser.default.json({ limit: "25mb" }));
  const logErrorToFile = async (error, req) => {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : void 0;
    const payload = {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message,
      stack,
      method: req == null ? void 0 : req.method,
      url: req == null ? void 0 : req.originalUrl
    };
    const logFile = import_path7.default.join(STORAGE_DIR, "server.log");
    await withFileLock(logFile, async () => {
      await import_fs_extra6.default.ensureFile(logFile);
      await import_fs_extra6.default.appendFile(logFile, `${JSON.stringify(payload)}
`);
    });
  };
  server.use(createSettingsRouter({ readSettings, writeSettings }));
  server.use(
    createCanvasRouter({
      getCanvasesDir: () => CANVASES_DIR
    })
  );
  server.use(
    createAnchorsRouter({
      getStorageDir: () => STORAGE_DIR
    })
  );
  server.use(
    createCommandsRouter({
      getStorageDir: () => STORAGE_DIR
    })
  );
  server.use(
    createTempRouter({
      getCanvasAssetsDir,
      downloadImage,
      getDominantColor,
      getTone: calculateTone
    })
  );
  server.use(
    createShellRouter({
      getApiAuthToken
    })
  );
  server.get("/api/canvas-export", async (req, res) => {
    try {
      const canvasNameRaw = req.query.canvasName || "Default";
      const safeName = canvasNameRaw.replace(/[/\\:*?"<>|]/g, "_") || "Default";
      const canvasDir = import_path7.default.join(CANVASES_DIR, safeName);
      const dataFile = import_path7.default.join(canvasDir, "canvas.json");
      const viewportFile = import_path7.default.join(canvasDir, "canvas_viewport.json");
      const assetsDir = import_path7.default.join(canvasDir, "assets");
      const items = await withFileLock(dataFile, async () => {
        if (await import_fs_extra6.default.pathExists(dataFile)) return import_fs_extra6.default.readJson(dataFile);
        return [];
      });
      const viewport = await withFileLock(viewportFile, async () => {
        if (await import_fs_extra6.default.pathExists(viewportFile)) return import_fs_extra6.default.readJson(viewportFile);
        return null;
      });
      const imageItems = Array.isArray(items) ? items.filter((it) => it && typeof it === "object" && it.type === "image") : [];
      const referencedFiles = /* @__PURE__ */ new Set();
      for (const it of imageItems) {
        const p = typeof it.imagePath === "string" ? it.imagePath : "";
        if (p.startsWith("assets/")) {
          const filename = import_path7.default.basename(p);
          referencedFiles.add(filename);
        }
      }
      const zip = new import_adm_zip.default();
      const manifest = {
        version: 1,
        name: safeName,
        timestamp: Date.now(),
        items,
        viewport
      };
      zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf-8"));
      for (const filename of referencedFiles) {
        const filePath = import_path7.default.join(assetsDir, filename);
        const exists = await withFileLock(filePath, () => import_fs_extra6.default.pathExists(filePath));
        if (!exists) continue;
        const data = await import_fs_extra6.default.readFile(filePath);
        zip.addFile(import_path7.default.posix.join("assets", filename), data);
      }
      const buf = zip.toBuffer();
      res.setHeader("Content-Type", "application/zip");
      const fullName = `${safeName}.lb`;
      const isAscii = /^[\x20-\x7E]+$/.test(fullName);
      const encodedName = encodeURIComponent(fullName).replace(/'/g, "%27");
      const disposition = isAscii ? `attachment; filename="${fullName}"` : `attachment; filename="export.lb"; filename*=UTF-8''${encodedName}`;
      res.setHeader("Content-Disposition", disposition);
      res.send(buf);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  server.post(
    "/api/canvas-import",
    import_express7.default.raw({ type: "application/octet-stream", limit: "500mb" }),
    async (req, res) => {
      try {
        const body = req.body;
        if (!Buffer.isBuffer(body) || body.length === 0) {
          res.status(400).json({ error: "Invalid file body" });
          return;
        }
        const zip = new import_adm_zip.default(body);
        const entry = zip.getEntry("manifest.json");
        if (!entry) {
          res.status(400).json({ error: "manifest.json missing" });
          return;
        }
        const manifestRaw = entry.getData().toString("utf-8");
        const manifest = JSON.parse(manifestRaw);
        const desiredName = (manifest.name || "Imported").toString();
        const baseName = desiredName.replace(/[/\\:*?"<>|]/g, "_").trim() || "Imported";
        const resolveUniqueCanvasName = async (name) => {
          const canvasesDir = CANVASES_DIR;
          await lockedFs.ensureDir(canvasesDir);
          let candidate = name;
          let idx = 1;
          while (await lockedFs.pathExists(import_path7.default.join(canvasesDir, candidate))) {
            candidate = `${name}_${idx}`;
            idx += 1;
          }
          return candidate;
        };
        const finalName = await resolveUniqueCanvasName(baseName);
        const canvasDir = import_path7.default.join(CANVASES_DIR, finalName);
        const dataFile = import_path7.default.join(canvasDir, "canvas.json");
        const viewportFile = import_path7.default.join(canvasDir, "canvas_viewport.json");
        const assetsDir = import_path7.default.join(canvasDir, "assets");
        await withFileLocks([canvasDir, assetsDir], async () => {
          await import_fs_extra6.default.ensureDir(canvasDir);
          await import_fs_extra6.default.ensureDir(assetsDir);
        });
        const entries = zip.getEntries();
        for (const e of entries) {
          const name = e.entryName;
          if (name.startsWith("assets/") && !e.isDirectory) {
            const filename = import_path7.default.basename(name);
            const target = import_path7.default.join(assetsDir, filename);
            await withFileLock(target, async () => {
              let candidate = target;
              let idx = 1;
              const parsed = import_path7.default.parse(target);
              while (await import_fs_extra6.default.pathExists(candidate)) {
                candidate = import_path7.default.join(parsed.dir, `${parsed.name}_${idx}${parsed.ext}`);
                idx += 1;
              }
              await import_fs_extra6.default.writeFile(candidate, e.getData());
            });
          }
        }
        await withFileLocks([dataFile, viewportFile], async () => {
          const items = Array.isArray(manifest.items) ? manifest.items : [];
          await import_fs_extra6.default.writeJson(dataFile, items);
          if (manifest.viewport) {
            await import_fs_extra6.default.writeJson(viewportFile, manifest.viewport);
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
    const filePath = import_path7.default.join(
      CANVASES_DIR,
      safeCanvasDirName,
      "assets",
      filename
    );
    if (await import_fs_extra6.default.pathExists(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).send("Not found");
    }
  });
  server.use(
    (err, req, res, _next) => {
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
  "common.search": "Search",
  "common.back": "Back",
  "upload.progress.title": "Uploading...",
  "upload.progress.counter": "{{completed}} / {{total}}",
  "upload.progress.percent": "{{percent}}%",
  "upload.progress.failed": "{{failed}} failed",
  "commandPalette.placeholder": "Search commands or text",
  "commandPalette.imageSearchPlaceholder": "Search images by tone and color",
  "commandPalette.commandLabel": "Command",
  "commandPalette.textLabel": "Text",
  "commandPalette.imageLabel": "Image",
  "commandPalette.empty": "No results",
  "commandPalette.imageSearchEmpty": "No images matched",
  "commandPalette.exportBackground": "Background",
  "commandPalette.exportHint": "Press Enter to export",
  "commandPalette.tone": "Tone",
  "commandPalette.color": "Color",
  "commandPalette.clearColor": "Clear",
  "commandPalette.back": "Back",
  "commandPalette.import": "Import Command",
  "commandPalette.importUnavailable": "Import is unavailable",
  "commandPalette.delete": "Delete",
  "commandPalette.shortcut": "Shortcut",
  "commandPalette.shortcutClear": "Clear shortcut",
  "commandPalette.deleteTitle": "Delete Command",
  "commandPalette.deleteMessage": 'Delete "{{name}}"? This cannot be undone.',
  "commandPalette.toggleContextMenu": "Toggle in Context Menu",
  "commandPalette.toneAny": "Any",
  "command.imageHistogram.title": "Image Histogram",
  "command.imageHistogram.description": "Inspect saturation and luminance histograms of selected images",
  "command.imageHistogram.empty": "Select one or more images first",
  "command.imageHistogram.loading": "Computing histograms...",
  "command.imageHistogram.failed": "Failed to compute histograms. Check image accessibility.",
  "command.imageHistogram.sourceCount": "Images: {{count}}",
  "command.imageHistogram.samples": "Sampled pixels: {{count}}",
  "command.imageHistogram.failedCount": "{{count}} images failed to load and were skipped",
  "command.imageHistogram.saturation": "Saturation",
  "command.imageHistogram.luminance": "Luminance",
  "command.imageHistogram.average": "Avg {{value}}%",
  "titleBar.settings": "Setting",
  "titleBar.alwaysOnTop": "Always on Top",
  "titleBar.pinOff": "Unpin",
  "titleBar.pinToApp": "Pin to App",
  "titleBar.pinLoadingApps": "Loading apps...",
  "titleBar.pinNoApps": "No available apps",
  "titleBar.dataFolder": "Data Folder",
  "titleBar.dataFolder.default": "Not configured, using default directory",
  "titleBar.change": "Change",
  "titleBar.version": "Version",
  "titleBar.version.current": "Current",
  "titleBar.version.latest": "Latest",
  "titleBar.version.row": "Current {{current}} \xB7 Latest {{latest}}",
  "titleBar.version.updateNow": "Update now",
  "titleBar.version.fetchFailed": "Failed to fetch latest version",
  "titleBar.version.upToDate": "You are on the latest version",
  "titleBar.version.updateAvailable": "Update available: v{{version}}",
  "titleBar.window": "Window",
  "titleBar.pinTransparent": "Pin transparent",
  "titleBar.canvasOpacity": "Image Opacity",
  "titleBar.mouseThrough": "Paper Mode",
  "titleBar.shortcuts": "Shortcuts",
  "titleBar.shortcuts.hint": "Try to use key combinations (e.g. Ctrl+K) to avoid conflicts with normal typing.",
  "titleBar.toggleWindowVisibility": "Hide Window",
  "titleBar.commandPalette": "Command Palette",
  "titleBar.canvasOpacityUp": "Increase Image Opacity",
  "titleBar.canvasOpacityDown": "Decrease Image Opacity",
  "titleBar.toggleMouseThrough": "Toggle Paper Mode",
  "titleBar.toggleGallery": "Toggle Gallery",
  "titleBar.canvasGroup": "Smart Layout (Canvas)",
  "titleBar.zoomToFit": "Zoom to Fit",
  "titleBar.shortcutClickToRecord": "Click to record",
  "titleBar.shortcutRecording": "Press a shortcut\u2026",
  "titleBar.index": "Index",
  "titleBar.enableAiSearchVector": "Enable AI Search (Vector)",
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
  "toast.updateTagsFailed": "Failed to update tags",
  "toast.updateDominantColorFailed": "Failed to update dominant color",
  "toast.updateNameFailed": "Failed to update name",
  "toast.imageDeleted": "Image deleted",
  "toast.deleteImageFailed": "Failed to delete image",
  "toast.canvasDeleted": "Canvas deleted",
  "toast.deleteCanvasFailed": "Failed to delete canvas",
  "toast.vectorIndexed": "Vector indexed",
  "toast.vectorIndexFailed": "Failed to index vector",
  "toast.openFileFailed": "Failed to open file",
  "toast.shortcutInvalid": "Invalid shortcut",
  "toast.shortcutUpdateFailed": "Failed to update shortcut: {{error}}",
  "toast.command.exportNoSelection": "Select images to export",
  "toast.command.exportFailed": "Failed to export stitched image",
  "toast.command.exported": "Stitched image exported",
  "toast.command.scriptFailed": "Command script failed",
  "toast.command.externalMessage": "{{message}}",
  "toast.importSuccess": "Command imported",
  "toast.importFailed": "Failed to import command: {{error}}",
  "toast.commandDeleted": "Command deleted",
  "toast.commandDeleteFailed": "Failed to delete command: {{error}}",
  "toast.loadRunningAppsFailed": "Failed to load app list: {{error}}",
  "toast.canvasUrlImportFailed": "Failed to import web image: {{error}}",
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
  "gallery.vectorResult": "AI Search Result",
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
  "canvas.toolbar.filters": "Filters",
  "canvas.filters.grayscale": "Grayscale",
  "canvas.filters.posterize": "Posterize",
  "canvas.filters.trianglePixelate": "Triangle Pixelate",
  "canvas.toolbar.toggleGrayscale": "Toggle Grayscale Mode",
  "canvas.toolbar.grayscale": "Grayscale",
  "canvas.toolbar.smartLayout": "Auto Layout",
  "canvas.toolbar.toggleMinimap": "Toggle Minimap",
  "canvas.toolbar.minimap": "Minimap",
  "canvas.toolbar.anchors": "Anchors",
  "canvas.anchor.slot": "Slot {{slot}}",
  "canvas.anchor.save": "Save Anchor",
  "canvas.anchor.restore": "Restore Anchor",
  "canvas.anchor.delete": "Delete Anchor",
  "canvas.anchor.empty": "Empty",
  "canvas.anchor.saved": "Anchor Saved",
  "canvas.clearCanvasTitle": "Clear Canvas",
  "canvas.clearCanvasMessage": "Are you sure you want to clear the canvas? This action cannot be undone.",
  "canvas.clearCanvasConfirm": "Clear",
  "canvas.empty.title": "Start Your Canvas",
  "canvas.empty.dragHint": "Drag images or folders here to begin",
  "canvas.empty.panHint": "Middle Click or Space + Drag to Pan",
  "canvas.empty.zoomHint": "Wheel to Zoom",
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
  "dialog.chooseStorageFolderTitle": "Choose LookBack storage folder",
  "dialog.saveImageTitle": "Save stitched image",
  "toast.globalError": "Error: {{message}}",
  "toast.unhandledRejection": "Unhandled Promise Rejection: {{reason}}",
  "toast.storageIncompatible": "Storage is incompatible. Please reset the data folder.",
  "toast.command.exportSaved": "Stitched image saved",
  "settings.canvas": "Canvas",
  "settings.canvas.create": "Create New",
  "settings.canvas.placeholder": "Canvas Name",
  "settings.canvas.deleteConfirm": "Are you sure you want to delete this canvas?",
  "settings.canvas.deleteTitle": "Delete Canvas",
  "settings.canvas.rename": "Rename",
  "settings.canvas.renamePlaceholder": "New Name",
  "toast.createCanvasFailed": "Failed to create canvas",
  "toast.llmTranslationFailed": "LLM translation failed: {{error}}",
  "settings.llm.title": "LLM Settings",
  "settings.llm.provider": "Model Provider",
  "settings.llm.services": "Services",
  "settings.llm.service.translation": "Translation Helper",
  "settings.llm.service.translation.desc": "Translate search queries to English for better vector search results",
  "settings.llm.enable": "Enable LLM Translation",
  "settings.llm.baseUrl": "Base URL",
  "settings.llm.key": "API Key",
  "settings.llm.model": "Model"
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
  "common.search": "\u641C\u7D22",
  "common.back": "\u8FD4\u56DE",
  "upload.progress.title": "\u4E0A\u4F20\u4E2D...",
  "upload.progress.counter": "{{completed}} / {{total}}",
  "upload.progress.percent": "{{percent}}%",
  "upload.progress.failed": "\u5931\u8D25 {{failed}}",
  "commandPalette.placeholder": "\u641C\u7D22\u547D\u4EE4\u6216\u6587\u672C",
  "commandPalette.imageSearchPlaceholder": "\u6309\u8272\u8C03\u548C\u989C\u8272\u641C\u7D22\u56FE\u7247",
  "commandPalette.commandLabel": "\u547D\u4EE4",
  "commandPalette.textLabel": "\u6587\u672C",
  "commandPalette.imageLabel": "\u56FE\u7247",
  "commandPalette.empty": "\u65E0\u7ED3\u679C",
  "commandPalette.imageSearchEmpty": "\u672A\u627E\u5230\u5339\u914D\u7684\u56FE\u7247",
  "commandPalette.exportBackground": "\u80CC\u666F",
  "commandPalette.exportHint": "\u6309\u56DE\u8F66\u5BFC\u51FA",
  "commandPalette.tone": "\u8272\u8C03",
  "commandPalette.color": "\u989C\u8272",
  "commandPalette.clearColor": "\u6E05\u9664",
  "commandPalette.back": "\u8FD4\u56DE",
  "commandPalette.import": "\u5BFC\u5165\u547D\u4EE4",
  "commandPalette.importUnavailable": "\u5BFC\u5165\u4E0D\u53EF\u7528",
  "commandPalette.delete": "\u5220\u9664",
  "commandPalette.shortcut": "\u5FEB\u6377\u952E",
  "commandPalette.shortcutClear": "\u6E05\u7A7A\u5FEB\u6377\u952E",
  "commandPalette.deleteTitle": "\u5220\u9664\u547D\u4EE4",
  "commandPalette.deleteMessage": '\u786E\u5B9A\u5220\u9664 "{{name}}"\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\u3002',
  "commandPalette.toggleContextMenu": "\u5207\u6362\u5728\u53F3\u952E\u83DC\u5355\u4E2D\u663E\u793A",
  "commandPalette.toneAny": "\u4EFB\u610F",
  "command.imageHistogram.title": "\u56FE\u50CF\u76F4\u65B9\u56FE",
  "command.imageHistogram.description": "\u67E5\u770B\u9009\u4E2D\u56FE\u7247\u7684\u9971\u548C\u5EA6\u4E0E\u660E\u5EA6\u76F4\u65B9\u56FE",
  "command.imageHistogram.empty": "\u8BF7\u5148\u9009\u4E2D\u4E00\u5F20\u6216\u591A\u5F20\u56FE\u7247",
  "command.imageHistogram.loading": "\u6B63\u5728\u8BA1\u7B97\u76F4\u65B9\u56FE\u2026",
  "command.imageHistogram.failed": "\u76F4\u65B9\u56FE\u8BA1\u7B97\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u56FE\u7247\u662F\u5426\u53EF\u8BBF\u95EE",
  "command.imageHistogram.sourceCount": "\u56FE\u7247\u6570\uFF1A{{count}}",
  "command.imageHistogram.samples": "\u91C7\u6837\u50CF\u7D20\uFF1A{{count}}",
  "command.imageHistogram.failedCount": "{{count}} \u5F20\u56FE\u7247\u8BFB\u53D6\u5931\u8D25\uFF0C\u5DF2\u8DF3\u8FC7",
  "command.imageHistogram.saturation": "\u9971\u548C\u5EA6",
  "command.imageHistogram.luminance": "\u660E\u5EA6",
  "command.imageHistogram.average": "\u5E73\u5747 {{value}}%",
  "titleBar.settings": "\u8BBE\u7F6E",
  "titleBar.alwaysOnTop": "\u7F6E\u9876",
  "titleBar.pinOff": "\u53D6\u6D88\u7F6E\u9876",
  "titleBar.pinToApp": "\u7F6E\u9876\u5230\u5E94\u7528",
  "titleBar.pinLoadingApps": "\u6B63\u5728\u52A0\u8F7D\u5E94\u7528\u2026",
  "titleBar.pinNoApps": "\u6682\u65E0\u53EF\u9009\u5E94\u7528",
  "titleBar.dataFolder": "\u6570\u636E\u6587\u4EF6\u5939",
  "titleBar.dataFolder.default": "\u672A\u914D\u7F6E\uFF0C\u5C06\u4F7F\u7528\u9ED8\u8BA4\u76EE\u5F55",
  "titleBar.change": "\u66F4\u6539",
  "titleBar.version": "\u7248\u672C",
  "titleBar.version.current": "\u5F53\u524D\u7248\u672C",
  "titleBar.version.latest": "\u6700\u65B0\u7248\u672C",
  "titleBar.version.row": "\u5F53\u524D {{current}} \xB7 \u6700\u65B0 {{latest}}",
  "titleBar.version.updateNow": "\u7ACB\u5373\u66F4\u65B0",
  "titleBar.version.fetchFailed": "\u6700\u65B0\u7248\u672C\u83B7\u53D6\u5931\u8D25",
  "titleBar.version.upToDate": "\u5DF2\u662F\u6700\u65B0\u7248\u672C",
  "titleBar.version.updateAvailable": "\u53EF\u66F4\u65B0\u81F3 v{{version}}",
  "titleBar.window": "\u7A97\u53E3",
  "titleBar.pinTransparent": "\u7F6E\u9876\u900F\u660E",
  "titleBar.canvasOpacity": "\u56FE\u7247\u900F\u660E\u5EA6",
  "titleBar.mouseThrough": "\u9F20\u6807\u7A7F\u900F",
  "titleBar.shortcuts": "\u5FEB\u6377\u952E",
  "titleBar.shortcuts.hint": "\u5C3D\u91CF\u4E0D\u8981\u7ED1\u5B9A\u5355\u6309\u952E\uFF0C\u6613\u548C\u6B63\u5E38\u8F93\u5165\u51B2\u7A81",
  "titleBar.toggleWindowVisibility": "\u9690\u85CF\u7A97\u53E3",
  "titleBar.commandPalette": "\u547D\u4EE4\u9762\u677F",
  "titleBar.canvasOpacityUp": "\u589E\u52A0\u56FE\u7247\u900F\u660E\u5EA6",
  "titleBar.canvasOpacityDown": "\u964D\u4F4E\u56FE\u7247\u900F\u660E\u5EA6",
  "titleBar.toggleMouseThrough": "\u5207\u6362\u9F20\u6807\u7A7F\u900F",
  "titleBar.toggleGallery": "\u5207\u6362\u56FE\u5E93\u62BD\u5C49",
  "titleBar.canvasGroup": "\u753B\u5E03\u667A\u80FD\u5E03\u5C40",
  "titleBar.zoomToFit": "\u9002\u5E94\u753B\u5E03",
  "titleBar.shortcutClickToRecord": "\u70B9\u51FB\u5F55\u5236",
  "titleBar.shortcutRecording": "\u8BF7\u6309\u952E...",
  "titleBar.index": "\u7D22\u5F15",
  "titleBar.enableAiSearchVector": "\u542F\u7528 AI \u641C\u7D22",
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
  "toast.updateTagsFailed": "\u66F4\u65B0\u6807\u7B7E\u5931\u8D25",
  "toast.updateDominantColorFailed": "\u66F4\u65B0\u4E3B\u8272\u5931\u8D25",
  "toast.updateNameFailed": "\u66F4\u65B0\u540D\u79F0\u5931\u8D25",
  "toast.imageDeleted": "\u56FE\u7247\u5DF2\u5220\u9664",
  "toast.deleteImageFailed": "\u5220\u9664\u56FE\u7247\u5931\u8D25",
  "toast.canvasDeleted": "\u753B\u5E03\u5DF2\u5220\u9664",
  "toast.deleteCanvasFailed": "\u5220\u9664\u753B\u5E03\u5931\u8D25",
  "toast.vectorIndexed": "\u5411\u91CF\u5DF2\u5165\u5E93",
  "toast.vectorIndexFailed": "\u5411\u91CF\u5165\u5E93\u5931\u8D25",
  "toast.openFileFailed": "\u6253\u5F00\u6587\u4EF6\u5931\u8D25",
  "toast.shortcutInvalid": "\u5FEB\u6377\u952E\u65E0\u6548",
  "toast.shortcutUpdateFailed": "\u66F4\u65B0\u5FEB\u6377\u952E\u5931\u8D25\uFF1A{{error}}",
  "toast.command.exportNoSelection": "\u8BF7\u9009\u62E9\u8981\u5BFC\u51FA\u7684\u56FE\u7247",
  "toast.command.exportFailed": "\u62FC\u56FE\u5BFC\u51FA\u5931\u8D25",
  "toast.command.exported": "\u62FC\u56FE\u5DF2\u5BFC\u51FA",
  "toast.command.scriptFailed": "Command \u811A\u672C\u6267\u884C\u5931\u8D25",
  "toast.command.externalMessage": "{{message}}",
  "toast.importSuccess": "\u547D\u4EE4\u5BFC\u5165\u6210\u529F",
  "toast.importFailed": "\u547D\u4EE4\u5BFC\u5165\u5931\u8D25: {{error}}",
  "toast.commandDeleted": "\u547D\u4EE4\u5DF2\u5220\u9664",
  "toast.commandDeleteFailed": "\u5220\u9664\u547D\u4EE4\u5931\u8D25: {{error}}",
  "toast.loadRunningAppsFailed": "\u52A0\u8F7D\u5E94\u7528\u5217\u8868\u5931\u8D25\uFF1A{{error}}",
  "toast.canvasUrlImportFailed": "\u7F51\u9875\u56FE\u7247\u5BFC\u5165\u5931\u8D25\uFF1A{{error}}",
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
  "gallery.vectorResult": "AI \u641C\u7D22\u7ED3\u679C",
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
  "canvas.toolbar.filters": "\u6EE4\u955C",
  "canvas.filters.grayscale": "\u7070\u5EA6",
  "canvas.filters.posterize": "\u8272\u8C03\u5206\u79BB",
  "canvas.filters.trianglePixelate": "\u4E09\u89D2\u5F62\u50CF\u7D20\u5316",
  "canvas.toolbar.toggleGrayscale": "\u5207\u6362\u7070\u5EA6\u6A21\u5F0F",
  "canvas.toolbar.grayscale": "\u7070\u5EA6",
  "canvas.toolbar.smartLayout": "\u81EA\u52A8\u5E03\u5C40",
  "canvas.toolbar.toggleMinimap": "\u5207\u6362\u5C0F\u5730\u56FE",
  "canvas.toolbar.minimap": "\u5C0F\u5730\u56FE",
  "canvas.toolbar.anchors": "\u951A\u70B9",
  "canvas.anchor.slot": "\u63D2\u69FD {{slot}}",
  "canvas.anchor.save": "\u4FDD\u5B58\u951A\u70B9",
  "canvas.anchor.restore": "\u6062\u590D\u951A\u70B9",
  "canvas.anchor.delete": "\u5220\u9664\u951A\u70B9",
  "canvas.anchor.empty": "\u7A7A",
  "canvas.anchor.saved": "\u951A\u70B9\u5DF2\u4FDD\u5B58",
  "canvas.clearCanvasTitle": "\u6E05\u7A7A\u753B\u5E03",
  "canvas.clearCanvasMessage": "\u786E\u5B9A\u8981\u6E05\u7A7A\u753B\u5E03\u5417\uFF1F\u6B64\u64CD\u4F5C\u65E0\u6CD5\u64A4\u9500\u3002",
  "canvas.clearCanvasConfirm": "\u6E05\u7A7A",
  "canvas.empty.title": "\u5F00\u59CB\u4F60\u7684\u753B\u5E03",
  "canvas.empty.dragHint": "\u62D6\u62FD\u56FE\u7247\u6216\u6587\u4EF6\u5939\u5230\u6B64\u5904\u5F00\u59CB",
  "canvas.empty.panHint": "\u4E2D\u952E\u6216\u7A7A\u683C\u62D6\u62FD\u5E73\u79FB",
  "canvas.empty.zoomHint": "\u6EDA\u8F6E\u7F29\u653E",
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
  "dialog.chooseStorageFolderTitle": "\u9009\u62E9 LookBack \u5B58\u50A8\u6587\u4EF6\u5939",
  "dialog.saveImageTitle": "\u4FDD\u5B58\u62FC\u63A5\u56FE\u7247",
  "toast.globalError": "\u9519\u8BEF\uFF1A{{message}}",
  "toast.unhandledRejection": "\u672A\u5904\u7406\u7684 Promise \u62D2\u7EDD\uFF1A{{reason}}",
  "toast.storageIncompatible": "\u5B58\u50A8\u76EE\u5F55\u4E0D\u517C\u5BB9\uFF0C\u8BF7\u91CD\u7F6E\u6570\u636E\u6587\u4EF6\u5939\u3002",
  "toast.command.exportSaved": "\u62FC\u63A5\u56FE\u7247\u5DF2\u4FDD\u5B58",
  "settings.canvas": "\u5F53\u524D\u753B\u5E03",
  "settings.canvas.create": "\u65B0\u5EFA\u753B\u5E03",
  "settings.canvas.placeholder": "\u753B\u5E03\u540D\u79F0",
  "settings.canvas.deleteConfirm": "\u786E\u8BA4\u5220\u9664\u8BE5\u753B\u5E03\uFF1F",
  "settings.canvas.deleteTitle": "\u5220\u9664\u753B\u5E03",
  "settings.canvas.rename": "\u91CD\u547D\u540D",
  "settings.canvas.renamePlaceholder": "\u65B0\u540D\u79F0",
  "toast.createCanvasFailed": "\u521B\u5EFA\u753B\u5E03\u5931\u8D25",
  "toast.llmTranslationFailed": "LLM \u7FFB\u8BD1\u5931\u8D25\uFF1A{{error}}",
  "settings.llm.title": "LLM \u8BBE\u7F6E",
  "settings.llm.provider": "\u6A21\u578B\u670D\u52A1",
  "settings.llm.services": "\u5E94\u7528\u529F\u80FD",
  "settings.llm.service.translation": "\u7FFB\u8BD1\u8F85\u52A9",
  "settings.llm.service.translation.desc": "\u5C06\u641C\u7D22\u8BCD\u7FFB\u8BD1\u4E3A\u82F1\u6587\u4EE5\u4F18\u5316\u5411\u91CF\u68C0\u7D22\u7ED3\u679C",
  "settings.llm.enable": "\u542F\u7528 LLM \u7FFB\u8BD1",
  "settings.llm.baseUrl": "\u57FA\u7840\u5730\u5740 (Base URL)",
  "settings.llm.key": "API \u5BC6\u94A5",
  "settings.llm.model": "\u6A21\u578B\u540D\u79F0"
};

// shared/i18n/t.ts
var dictionaries = {
  en,
  zh
};
function t(locale, key, params) {
  const template = dictionaries[locale][key];
  if (typeof template !== "string" || !template) {
    return key;
  }
  if (!params) return template;
  return template.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (match, name) => {
    const value = params[name];
    if (value === void 0 || value === null) return match;
    return String(value);
  });
}

// electron/main.ts
var import_radash2 = require("radash");
if (!import_electron2.app.isPackaged) {
  import_electron2.app.setName("LookBack");
}
function syncReadIsPinMode() {
  if (process.platform !== "darwin") return false;
  try {
    const settingsPath = import_path8.default.join(
      import_electron2.app.getPath("userData"),
      "lookback_storage",
      "settings.json"
    );
    const raw = JSON.parse(import_fs_extra7.default.readFileSync(settingsPath, "utf-8"));
    return raw && typeof raw === "object" && raw.pinMode === true;
  } catch {
    return false;
  }
}
var _a;
if (syncReadIsPinMode()) {
  (_a = import_electron2.app.dock) == null ? void 0 : _a.hide();
}
Object.assign(console, import_electron_log.default.functions);
import_electron_log.default.transports.file.level = "info";
import_electron_log.default.transports.file.maxSize = 5 * 1024 * 1024;
import_electron_log.default.transports.file.archiveLog = (file) => {
  const filePath = file.toString();
  const info = import_path8.default.parse(filePath);
  const dest = import_path8.default.join(info.dir, info.name + ".old" + info.ext);
  lockedFs.rename(filePath, dest).catch((e) => {
    console.warn("Could not rotate log", e);
  });
};
var logPinDebug = (...args) => {
  import_electron_log.default.info("[pin-debug]", ...args);
};
var mainWindow = null;
var isAppHidden = false;
var DEFAULT_TOGGLE_WINDOW_SHORTCUT = process.platform === "darwin" ? "Command+L" : "Ctrl+L";
var DEFAULT_CANVAS_OPACITY_UP_SHORTCUT = process.platform === "darwin" ? "Command+Up" : "Ctrl+Up";
var DEFAULT_CANVAS_OPACITY_DOWN_SHORTCUT = process.platform === "darwin" ? "Command+Down" : "Ctrl+Down";
var DEFAULT_TOGGLE_MOUSE_THROUGH_SHORTCUT = process.platform === "darwin" ? "Command+T" : "Ctrl+T";
var toggleWindowShortcut = DEFAULT_TOGGLE_WINDOW_SHORTCUT;
var canvasOpacityUpShortcut = DEFAULT_CANVAS_OPACITY_UP_SHORTCUT;
var canvasOpacityDownShortcut = DEFAULT_CANVAS_OPACITY_DOWN_SHORTCUT;
var toggleMouseThroughShortcut = DEFAULT_TOGGLE_MOUSE_THROUGH_SHORTCUT;
var isSettingsOpen = false;
var isPinMode = false;
var pinTargetApp = "";
var isPinTransparent = true;
var activeAppWatcherProcess = null;
var winZOrderHelperProcess = null;
var winZOrderHelperReadline = null;
var winZOrderHelperOurHwnd = "";
var winZOrderPending = /* @__PURE__ */ new Map();
var isPinByAppActive = false;
var localServerPort = DEFAULT_SERVER_PORT;
var localServerStartTask = null;
var isQuitting = false;
var isWindowIpcBound = false;
var hasPendingSecondInstanceRestore = false;
var LOOKBACK_PROTOCOL_SCHEME = "lookback";
var LOOKBACK_IMPORT_HOST = "import-command";
var LOOKBACK_IMPORT_QUERY_KEY = "url";
var SUPPORTED_COMMAND_EXTENSIONS = /* @__PURE__ */ new Set([".js", ".jsx", ".ts", ".tsx"]);
var DEEP_LINK_DOWNLOAD_TIMEOUT_MS = 15e3;
var pendingDeepLinkUrls = [];
var hasSingleInstanceLock = import_electron2.app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  import_electron2.app.quit();
}
import_electron2.app.on("second-instance", (_event, argv) => {
  if (!hasSingleInstanceLock) return;
  const deepLinkUrls = argv.filter(
    (arg) => typeof arg === "string" && arg.toLowerCase().startsWith(`${LOOKBACK_PROTOCOL_SCHEME}://`)
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
  if (!import_electron2.app.isReady()) {
    if (hasPendingSecondInstanceRestore) return;
    hasPendingSecondInstanceRestore = true;
    import_electron2.app.once("ready", () => {
      hasPendingSecondInstanceRestore = false;
      restoreOrCreateWindow();
    });
    return;
  }
  restoreOrCreateWindow();
});
import_electron2.app.on("open-url", (event, url) => {
  event.preventDefault();
  if (typeof url !== "string") return;
  pendingDeepLinkUrls.push(url);
  if (import_electron2.app.isReady()) {
    void flushPendingDeepLinks();
  }
});
pendingDeepLinkUrls.push(
  ...process.argv.filter(
    (arg) => typeof arg === "string" && arg.toLowerCase().startsWith(`${LOOKBACK_PROTOCOL_SCHEME}://`)
  )
);
function requestAppQuit() {
  if (isQuitting) return;
  isQuitting = true;
  import_electron2.app.quit();
}
function registerLookBackProtocol() {
  if (!import_electron2.app.isPackaged) return;
  import_electron2.app.setAsDefaultProtocolClient(LOOKBACK_PROTOCOL_SCHEME);
}
function toCommandFileName(targetUrl) {
  const baseName = import_path8.default.basename(targetUrl.pathname || "");
  const decodedBaseName = decodeURIComponent(baseName || "").trim();
  const fallback = `command_${Date.now()}.jsx`;
  const rawName = decodedBaseName || fallback;
  const sanitized = rawName.replace(/[<>:"/\\|?*]/g, "_");
  const ext = import_path8.default.extname(sanitized).toLowerCase();
  if (!SUPPORTED_COMMAND_EXTENSIONS.has(ext)) {
    throw new Error("Unsupported command file extension");
  }
  return sanitized;
}
async function importCommandFromRemoteUrl(remoteUrl) {
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
      signal: controller.signal
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
    const commandsDir = import_path8.default.join(getStorageDir(), "commands");
    await lockedFs.ensureDir(commandsDir);
    const destPath = import_path8.default.join(commandsDir, fileName);
    await lockedFs.writeFile(destPath, content, "utf-8");
    return destPath;
  } finally {
    clearTimeout(timeout);
  }
}
function emitImportToastSuccess() {
  mainWindow == null ? void 0 : mainWindow.webContents.send("toast", {
    key: "toast.importSuccess",
    type: "success"
  });
}
function emitImportToastFailed(errorMessage) {
  mainWindow == null ? void 0 : mainWindow.webContents.send("toast", {
    key: "toast.importFailed",
    type: "error",
    params: { error: errorMessage }
  });
}
function resolveDeepLinkImportUrl(rawUrl) {
  var _a2;
  const deepLink = new URL(rawUrl);
  if (deepLink.protocol !== `${LOOKBACK_PROTOCOL_SCHEME}:`) return "";
  if (deepLink.hostname !== LOOKBACK_IMPORT_HOST) return "";
  return ((_a2 = deepLink.searchParams.get(LOOKBACK_IMPORT_QUERY_KEY)) == null ? void 0 : _a2.trim()) || "";
}
async function handleDeepLink(rawUrl) {
  const importUrl = resolveDeepLinkImportUrl(rawUrl);
  if (!importUrl) return;
  try {
    await importCommandFromRemoteUrl(importUrl);
    restoreMainWindowVisibility();
    emitImportToastSuccess();
    mainWindow == null ? void 0 : mainWindow.webContents.send("renderer-event", "command-imported");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    restoreMainWindowVisibility();
    emitImportToastFailed(message);
  }
}
async function flushPendingDeepLinks() {
  if (!import_electron2.app.isReady()) return;
  if (pendingDeepLinkUrls.length === 0) return;
  const queue = [...pendingDeepLinkUrls];
  pendingDeepLinkUrls.length = 0;
  for (const rawUrl of queue) {
    await handleDeepLink(rawUrl);
  }
}
function normalizeAppIdentifier(name) {
  return name.trim().toLowerCase();
}
function getPinAlwaysOnTopLevel() {
  return "floating";
}
function setWindowAlwaysOnTop(enabled) {
  if (!mainWindow) return;
  if (enabled) {
    mainWindow.setAlwaysOnTop(true, getPinAlwaysOnTopLevel());
    return;
  }
  mainWindow.setAlwaysOnTop(false);
}
function getOurHwndForPowerShell() {
  if (!mainWindow) return "";
  const buf = mainWindow.getNativeWindowHandle();
  if (buf.length >= 8) return buf.readBigUInt64LE(0).toString();
  if (buf.length >= 4) return buf.readUInt32LE(0).toString();
  return "";
}
function setWindowPinnedToDesktop(enabled) {
  if (!mainWindow) return;
  if (enabled) {
    setWindowAlwaysOnTop(true);
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    return;
  }
  setWindowAlwaysOnTop(false);
  mainWindow.setVisibleOnAllWorkspaces(false);
}
function setWindowPinnedToTargetApp(active) {
  if (!mainWindow) return;
  logPinDebug("setWindowPinnedToTargetApp", { active });
  setWindowAlwaysOnTop(active);
  mainWindow.setVisibleOnAllWorkspaces(false);
}
function runAppleScript(script, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    (0, import_node_child_process2.execFile)(
      "osascript",
      ["-e", script],
      { timeout: timeoutMs },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error((stderr == null ? void 0 : stderr.trim()) || error.message));
          return;
        }
        resolve(stdout.trim());
      }
    );
  });
}
function runPowerShell(script, timeoutMs = 8e3) {
  return new Promise((resolve, reject) => {
    (0, import_node_child_process2.execFile)(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script
      ],
      { timeout: timeoutMs, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error((stderr == null ? void 0 : stderr.trim()) || error.message));
          return;
        }
        resolve(stdout.trim());
      }
    );
  });
}
async function getRunningAppNames() {
  if (process.platform !== "darwin" && process.platform !== "win32") return [];
  let output = "";
  try {
    if (process.platform === "darwin") {
      output = await runAppleScript(
        'tell application "System Events" to get name of every process whose background only is false',
        15e3
      );
      logPinDebug("running apps raw (darwin)", output);
    } else {
      output = await runPowerShell(
        [
          `Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.Id -ne ${process.pid} }`,
          "| Select-Object -ExpandProperty ProcessName",
          "| Sort-Object -Unique"
        ].join(" "),
        8e3
      );
      logPinDebug("running apps raw (win32)", output);
    }
  } catch (error) {
    logPinDebug("getRunningAppNames failed", error);
    throw error;
  }
  const selfName = normalizeAppIdentifier(import_electron2.app.getName());
  const names = output.split(/,|\n/).map((name) => name.trim()).filter((name) => name && normalizeAppIdentifier(name) !== selfName);
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
    "}"
  ].join("\n");
  winZOrderHelperProcess = (0, import_node_child_process2.spawn)(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script
    ],
    { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }
  );
  if (winZOrderHelperProcess.stderr) {
    winZOrderHelperProcess.stderr.on("data", (chunk) => {
      const message = String(chunk ?? "").trim();
      if (message) logPinDebug("WinZOrder helper stderr", message);
    });
  }
  winZOrderHelperReadline = readline.createInterface({
    input: winZOrderHelperProcess.stdout,
    terminal: false
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
  const rejectAll = (reason) => {
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
function sendWinZOrderCommand(command, timeoutMs = 800) {
  if (process.platform !== "win32") return Promise.resolve();
  ensureWinZOrderHelper();
  const proc = winZOrderHelperProcess;
  if (!proc || !proc.stdin) return Promise.resolve();
  const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      winZOrderPending.delete(id);
      reject(new Error("Z-order helper timeout"));
    }, timeoutMs);
    winZOrderPending.set(id, { resolve, reject, timeout });
    proc.stdin.write(`${command}:${id}
`);
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
var isWinPreIsTarget = false;
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
    "}"
  ].join("\n");
  activeAppWatcherProcess = (0, import_node_child_process2.spawn)(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script
    ],
    { windowsHide: true }
  );
  const rl = readline.createInterface({
    input: activeAppWatcherProcess.stdout,
    terminal: false
  });
  rl.on("line", (line) => {
    const activeAppName = line.trim();
    if (!activeAppName || !mainWindow) return;
    const isTarget = normalizeAppIdentifier(activeAppName) === normalizeAppIdentifier(pinTargetApp);
    if (isTarget !== isPinByAppActive) {
      isPinByAppActive = isTarget;
      syncWindowShadow();
    }
    const isOurApp = normalizeAppIdentifier(activeAppName) === normalizeAppIdentifier(import_electron2.app.getName());
    console.log(
      normalizeAppIdentifier(activeAppName),
      normalizeAppIdentifier(import_electron2.app.getName())
    );
    if (isTarget) {
      console.log("set to top");
      mainWindow.setAlwaysOnTop(true, getPinAlwaysOnTopLevel());
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
    "end repeat"
  ].join("\n");
  activeAppWatcherProcess = (0, import_node_child_process2.spawn)("osascript", ["-e", script]);
  const rl = readline.createInterface({
    input: activeAppWatcherProcess.stderr,
    terminal: false
  });
  rl.on("line", (line) => {
    const activeAppName = line.trim();
    if (!activeAppName || !mainWindow) return;
    const shouldPin = normalizeAppIdentifier(activeAppName) === normalizeAppIdentifier(pinTargetApp);
    if (shouldPin === isPinByAppActive) return;
    isPinByAppActive = shouldPin;
    syncWindowShadow();
    if (shouldPin) {
      mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      mainWindow.setAlwaysOnTop(true, getPinAlwaysOnTopLevel());
    } else {
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
function syncDockVisibility() {
  var _a2, _b;
  if (process.platform !== "darwin") return;
  if (isPinMode) {
    (_a2 = import_electron2.app.dock) == null ? void 0 : _a2.hide();
  } else {
    (_b = import_electron2.app.dock) == null ? void 0 : _b.show();
  }
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
    platform: process.platform
  });
  syncDockVisibility();
  if (!isPinMode) {
    setWindowPinnedToDesktop(false);
    syncWindowShadow();
    return;
  }
  if (pinTargetApp && (process.platform === "darwin" || process.platform === "win32")) {
    logPinDebug("applyPinStateToWindow start watcher", {
      pinTargetApp
    });
    startPinByAppWatcher();
    return;
  }
  logPinDebug("applyPinStateToWindow desktop mode");
  setWindowPinnedToDesktop(true);
  syncWindowShadow();
}
var isLocale = (value) => value === "en" || value === "zh";
async function getLocale() {
  try {
    const settings = await readSettings();
    const raw = settings && typeof settings === "object" ? settings.language : void 0;
    const locale = isLocale(raw) ? raw : "en";
    return locale;
  } catch {
    return "en";
  }
}
async function loadShortcuts() {
  try {
    const settings = await readSettings();
    const rawToggle = settings.toggleWindowShortcut;
    if (typeof rawToggle === "string" && rawToggle.trim()) {
      toggleWindowShortcut = rawToggle.trim();
    }
    const rawMouseThrough = settings.toggleMouseThroughShortcut;
    if (typeof rawMouseThrough === "string" && rawMouseThrough.trim()) {
      toggleMouseThroughShortcut = rawMouseThrough.trim();
    }
    const rawOpacityUp = settings.canvasOpacityUpShortcut;
    if (typeof rawOpacityUp === "string" && rawOpacityUp.trim()) {
      canvasOpacityUpShortcut = rawOpacityUp.trim();
    }
    const rawOpacityDown = settings.canvasOpacityDownShortcut;
    if (typeof rawOpacityDown === "string" && rawOpacityDown.trim()) {
      canvasOpacityDownShortcut = rawOpacityDown.trim();
    }
  } catch {
  }
}
async function loadWindowPinState() {
  try {
    const raw = await readSettings();
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
  }
}
function loadMainWindow() {
  if (!mainWindow) return;
  if (!import_electron2.app.isPackaged) {
    import_electron_log.default.info("Loading renderer from localhost");
    void mainWindow.loadURL("http://localhost:5173");
  } else {
    const filePath = import_path8.default.join(__dirname, "../dist-renderer/index.html");
    import_electron_log.default.info("Loading renderer from file:", filePath);
    void mainWindow.loadFile(filePath);
  }
}
async function saveWindowBounds() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized() || mainWindow.isMaximized()) return;
  try {
    const bounds = mainWindow.getBounds();
    const settingsPath = import_path8.default.join(getStorageDir(), "settings.json");
    const settings = await lockedFs.readJson(settingsPath).catch(() => ({}));
    await lockedFs.writeJson(settingsPath, {
      ...settings,
      windowBounds: bounds
    });
  } catch (e) {
    import_electron_log.default.error("Failed to save window bounds", e);
  }
}
var debouncedSaveWindowBounds = (0, import_radash2.debounce)({ delay: 1e3 }, saveWindowBounds);
async function createWindow(options) {
  import_electron_log.default.info("Creating main window...");
  import_electron_log.default.info("Storage dir for window state:", getStorageDir());
  isAppHidden = false;
  const { width, height } = import_electron2.screen.getPrimaryDisplay().workAreaSize;
  let windowState = {};
  try {
    const settingsPath = import_path8.default.join(getStorageDir(), "settings.json");
    if (await lockedFs.pathExists(settingsPath)) {
      const settingsRaw = await lockedFs.readJson(settingsPath);
      if (settingsRaw && typeof settingsRaw === "object") {
        const settings = settingsRaw;
        if (settings.windowBounds) {
          windowState = settings.windowBounds;
        }
      }
    }
  } catch (e) {
    import_electron_log.default.error("Failed to load window bounds", e);
  }
  mainWindow = new import_electron2.BrowserWindow({
    width: windowState.width || Math.floor(width * 0.6),
    height: windowState.height || Math.floor(height * 0.8),
    x: windowState.x,
    y: windowState.y,
    icon: import_path8.default.join(__dirname, "../resources/icon.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: import_path8.default.join(__dirname, "preload.cjs")
    },
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: false,
    hasShadow: true,
    // 延迟显示：等置顶属性设置完毕后再决定 show/showInactive，
    // 避免 macOS 在置顶模式下创建窗口时激活 app 导致退出全屏 Space。
    show: false
  });
  mainWindow.on("resize", debouncedSaveWindowBounds);
  mainWindow.on("move", debouncedSaveWindowBounds);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.webContents.on("did-finish-load", () => {
    import_electron_log.default.info("Renderer process finished loading");
  });
  if (!import_electron2.app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
  mainWindow.webContents.on(
    "did-fail-load",
    (event, errorCode, errorDescription, validatedURL) => {
      import_electron_log.default.error(
        "Renderer process failed to load:",
        errorCode,
        errorDescription,
        validatedURL
      );
    }
  );
  mainWindow.webContents.on("render-process-gone", (event, details) => {
    import_electron_log.default.error("Renderer process gone:", details.reason, details.exitCode);
  });
  if ((options == null ? void 0 : options.load) !== false) {
    loadMainWindow();
  }
  if (!isWindowIpcBound) {
    isWindowIpcBound = true;
    import_electron2.ipcMain.on("window-min", () => mainWindow == null ? void 0 : mainWindow.minimize());
    import_electron2.ipcMain.on("window-max", () => {
      if (mainWindow == null ? void 0 : mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow == null ? void 0 : mainWindow.maximize();
      }
    });
    import_electron2.ipcMain.on("window-close", () => requestAppQuit());
    import_electron2.ipcMain.on("window-focus", () => mainWindow == null ? void 0 : mainWindow.focus());
    import_electron2.ipcMain.on("toggle-always-on-top", (_event, flag) => {
      if (flag) {
        setWindowAlwaysOnTop(true);
        mainWindow == null ? void 0 : mainWindow.setVisibleOnAllWorkspaces(true, {
          visibleOnFullScreen: true
        });
      } else {
        setWindowAlwaysOnTop(false);
        mainWindow == null ? void 0 : mainWindow.setVisibleOnAllWorkspaces(false);
      }
    });
    import_electron2.ipcMain.on(
      "set-pin-mode",
      (_event, payload) => {
        logPinDebug("ipc set-pin-mode", payload);
        const enabled = (payload == null ? void 0 : payload.enabled) === true;
        const targetApp = typeof (payload == null ? void 0 : payload.targetApp) === "string" ? payload.targetApp.trim() : "";
        isPinMode = enabled;
        pinTargetApp = enabled ? targetApp : "";
        logPinDebug("ipc set-pin-mode resolved", {
          isPinMode,
          pinTargetApp,
          platform: process.platform
        });
        applyPinStateToWindow();
      }
    );
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
    import_electron2.ipcMain.on(
      "set-window-bounds",
      (_event, bounds) => {
        if (!mainWindow) return;
        const current = mainWindow.getBounds();
        mainWindow.setBounds({
          x: bounds.x ?? current.x,
          y: bounds.y ?? current.y,
          width: bounds.width ?? current.width,
          height: bounds.height ?? current.height
        });
      }
    );
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
        if (await lockedFs.pathExists(logPath)) {
          const stats = await lockedFs.stat(logPath);
          const size = stats.size;
          const READ_SIZE = 50 * 1024;
          const start = Math.max(0, size - READ_SIZE);
          return await withFileLock(logPath, () => {
            return new Promise((resolve, reject) => {
              const stream = import_fs_extra7.default.createReadStream(logPath, {
                start,
                encoding: "utf8"
              });
              const chunks = [];
              stream.on("data", (chunk) => chunks.push(chunk.toString()));
              stream.on("end", () => resolve(chunks.join("")));
              stream.on("error", reject);
            });
          });
        }
        return "No log file found.";
      } catch (error) {
        import_electron_log.default.error("Failed to read log file:", error);
        return `Failed to read log file: ${error instanceof Error ? error.message : String(error)}`;
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
    import_electron2.ipcMain.handle("list-running-apps", async () => {
      try {
        if (process.platform !== "darwin" && process.platform !== "win32") {
          return { success: true, apps: [] };
        }
        const apps = await getRunningAppNames();
        return { success: true, apps };
      } catch (error) {
        return {
          success: false,
          apps: [],
          error: error instanceof Error ? error.message : String(error)
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
  if (isPinMode) {
    mainWindow.showInactive();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
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
      return {
        success: false,
        error: "Shortcut registration failed",
        accelerator: prev
      };
    }
    updateVar(next);
    return { success: true, accelerator: next };
  } catch (e) {
    if (prev !== next) {
      import_electron2.globalShortcut.unregister(next);
      import_electron2.globalShortcut.register(prev, handler);
    }
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
      accelerator: prev
    };
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
function registerCanvasOpacityUpShortcut(accelerator) {
  return registerShortcut(
    accelerator,
    canvasOpacityUpShortcut,
    (v) => {
      canvasOpacityUpShortcut = v;
    },
    () => {
      mainWindow == null ? void 0 : mainWindow.webContents.send(
        "renderer-event",
        "adjust-canvas-opacity",
        0.05
      );
    },
    true
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
      mainWindow == null ? void 0 : mainWindow.webContents.send(
        "renderer-event",
        "adjust-canvas-opacity",
        -0.05
      );
    },
    true
  );
}
function registerAnchorShortcuts() {
  const anchors = ["1", "2", "3"];
  anchors.forEach((key) => {
    const restoreAccel = process.platform === "darwin" ? `Command+${key}` : `Ctrl+${key}`;
    import_electron2.globalShortcut.register(restoreAccel, () => {
      mainWindow == null ? void 0 : mainWindow.webContents.send("renderer-event", "restore-anchor", key);
    });
    const saveAccel = process.platform === "darwin" ? `Command+Shift+${key}` : `Ctrl+Shift+${key}`;
    import_electron2.globalShortcut.register(saveAccel, () => {
      mainWindow == null ? void 0 : mainWindow.webContents.send("renderer-event", "save-anchor", key);
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
  import_electron2.globalShortcut.unregisterAll();
}
async function startServer2() {
  if (!localServerStartTask) {
    localServerStartTask = startServer().then((port) => {
      localServerPort = port;
      return port;
    });
  }
  return localServerStartTask;
}
import_electron2.ipcMain.handle("get-storage-dir", async () => {
  return getStorageDir();
});
import_electron2.ipcMain.handle("get-server-port", async () => {
  if (localServerStartTask) {
    return localServerStartTask;
  }
  return localServerPort;
});
import_electron2.ipcMain.handle("get-api-auth-token", async () => {
  return getApiAuthToken();
});
import_electron2.ipcMain.handle("get-app-version", async () => {
  return import_electron2.app.getVersion();
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
import_electron2.ipcMain.handle(
  "save-image-file",
  async (_event, { dataUrl, defaultName }) => {
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
      const safeName = typeof defaultName === "string" && defaultName.trim() ? defaultName.trim() : fallbackName;
      const result = await import_electron2.dialog.showSaveDialog({
        title: t(locale, "dialog.saveImageTitle"),
        defaultPath: import_path8.default.join(getStorageDir(), safeName),
        filters: [{ name: "PNG", extensions: ["png"] }]
      });
      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true };
      }
      let filePath = result.filePath;
      if (!filePath.toLowerCase().endsWith(".png")) {
        filePath += ".png";
      }
      const buffer = Buffer.from(match[1], "base64");
      await import_fs_extra7.default.outputFile(filePath, buffer);
      return { success: true, path: filePath };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e)
      };
    }
  }
);
import_electron2.app.whenReady().then(async () => {
  import_electron_log.default.info("App starting...");
  import_electron_log.default.info("Log file location:", import_electron_log.default.transports.file.getFile().path);
  import_electron_log.default.info("App path:", import_electron2.app.getAppPath());
  import_electron_log.default.info("User data:", import_electron2.app.getPath("userData"));
  registerLookBackProtocol();
  const taskInitStorage = ensureStorageInitialized();
  try {
    await taskInitStorage;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    import_electron_log.default.error("Failed to initialize storage before loading settings:", message);
  }
  const taskCreateWindow = createWindow();
  const taskStartServer = startServer2();
  const taskLoadPin = loadWindowPinState();
  const taskLoadShortcuts = loadShortcuts();
  await Promise.all([taskLoadPin, taskLoadShortcuts, taskCreateWindow]);
  applyPinStateToWindow();
  if (isPinMode) {
    mainWindow == null ? void 0 : mainWindow.showInactive();
  } else {
    mainWindow == null ? void 0 : mainWindow.show();
  }
  await flushPendingDeepLinks();
  registerGlobalShortcuts();
  if (mainWindow) {
    try {
      await taskStartServer;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[model] ensure failed:", message);
      import_electron_log.default.error("[model] ensure failed:", message);
    }
  }
  import_electron2.app.on("activate", () => {
    if (import_electron2.BrowserWindow.getAllWindows().length === 0) {
      createWindow().then(() => {
        applyPinStateToWindow();
        registerGlobalShortcuts();
      });
      return;
    }
    restoreMainWindowVisibility();
  });
});
import_electron2.ipcMain.handle(
  "set-toggle-window-shortcut",
  async (_event, accelerator) => {
    return registerToggleWindowShortcut(accelerator);
  }
);
import_electron2.ipcMain.handle(
  "set-canvas-opacity-up-shortcut",
  async (_event, accelerator) => {
    return registerCanvasOpacityUpShortcut(accelerator);
  }
);
import_electron2.ipcMain.handle(
  "set-canvas-opacity-down-shortcut",
  async (_event, accelerator) => {
    return registerCanvasOpacityDownShortcut(accelerator);
  }
);
import_electron2.ipcMain.handle(
  "set-toggle-mouse-through-shortcut",
  async (_event, accelerator) => {
    return registerToggleMouseThroughShortcut(accelerator);
  }
);
import_electron2.ipcMain.handle("import-command", async () => {
  const locale = await getLocale();
  const result = await import_electron2.dialog.showOpenDialog({
    title: t(locale, "dialog.importCommandTitle"),
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "JavaScript/TypeScript", extensions: ["js", "jsx", "ts", "tsx"] }
    ]
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, canceled: true };
  }
  const destDir = import_path8.default.join(getStorageDir(), "commands");
  await import_fs_extra7.default.ensureDir(destDir);
  const results = [];
  for (const srcPath of result.filePaths) {
    const fileName = import_path8.default.basename(srcPath);
    const destPath = import_path8.default.join(destDir, fileName);
    try {
      await import_fs_extra7.default.copy(srcPath, destPath);
      results.push({ success: true, path: destPath });
    } catch (e) {
      results.push({
        success: false,
        error: e instanceof Error ? e.message : String(e),
        path: srcPath
      });
    }
  }
  const failures = results.filter((r) => !r.success);
  if (failures.length > 0) {
    return {
      success: false,
      error: `Failed to import ${failures.length} files. First error: ${failures[0].error}`,
      partialSuccess: results.length - failures.length > 0
    };
  }
  return { success: true, count: results.length };
});
import_electron2.ipcMain.on(
  "set-ignore-mouse-events",
  (_event, ignore, options) => {
    if (mainWindow) {
      mainWindow.setIgnoreMouseEvents(ignore, options);
    }
  }
);
import_electron2.ipcMain.on("settings-open-changed", (_event, open) => {
  isSettingsOpen = Boolean(open);
});
import_electron2.app.on("will-quit", () => {
  stopPinByAppWatcher();
  stopWinZOrderHelper();
  unregisterGlobalShortcuts();
});
import_electron2.app.on("window-all-closed", () => {
  stopPinByAppWatcher();
  stopWinZOrderHelper();
  unregisterGlobalShortcuts();
  requestAppQuit();
});
