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
var import_path6 = __toESM(require("path"), 1);
var import_fs_extra6 = __toESM(require("fs-extra"), 1);
var import_electron_log = __toESM(require("electron-log"), 1);
var import_electron_updater = require("electron-updater");

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
var import_path5 = __toESM(require("path"), 1);
var import_express5 = __toESM(require("express"), 1);
var import_cors = __toESM(require("cors"), 1);
var import_body_parser = __toESM(require("body-parser"), 1);
var import_fs_extra5 = __toESM(require("fs-extra"), 1);
var import_https = __toESM(require("https"), 1);
var import_http = __toESM(require("http"), 1);
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

// backend/routes/temp.ts
var import_path4 = __toESM(require("path"), 1);
var import_express4 = __toESM(require("express"), 1);
var import_fs_extra4 = __toESM(require("fs-extra"), 1);
var import_sharp = __toESM(require("sharp"), 1);
var createTempRouter = (deps) => {
  const router = import_express4.default.Router();
  const getAssetsDir = (canvasName) => deps.getCanvasAssetsDir(canvasName || "Default");
  const resolveUniqueFilename = async (assetsDir, desired) => {
    return withFileLock(assetsDir, async () => {
      const parsed = import_path4.default.parse(desired);
      let candidate = desired;
      let index = 1;
      while (await import_fs_extra4.default.pathExists(import_path4.default.join(assetsDir, candidate))) {
        candidate = `${parsed.name}_${index}${parsed.ext}`;
        index += 1;
      }
      return candidate;
    });
  };
  router.post("/api/download-url", async (req, res) => {
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
      let urlFilename = "image.jpg";
      try {
        const urlObj = new URL(trimmedUrl);
        const pathname = urlObj.pathname;
        const baseName = import_path4.default.basename(pathname).split("?")[0];
        if (baseName && /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(baseName)) {
          urlFilename = baseName;
        }
      } catch {
      }
      const ext = import_path4.default.extname(urlFilename) || ".jpg";
      const nameWithoutExt = import_path4.default.basename(urlFilename, ext);
      const safeName = nameWithoutExt.replace(/[^a-zA-Z0-9.\-_]/g, "_") || "image";
      const timestamp = Date.now();
      const filename = `${safeName}_${timestamp}${ext}`;
      const assetsDir = getAssetsDir(canvasName);
      await import_fs_extra4.default.ensureDir(assetsDir);
      const uniqueFilename = await resolveUniqueFilename(assetsDir, filename);
      const filepath = import_path4.default.join(assetsDir, uniqueFilename);
      let width = 0;
      let height = 0;
      await withFileLocks([assetsDir, filepath], async () => {
        await deps.downloadImage(trimmedUrl, filepath);
        try {
          const metadata = await (0, import_sharp.default)(filepath).metadata();
          width = metadata.width || 0;
          height = metadata.height || 0;
        } catch (e) {
          console.error("Failed to read image metadata", e);
        }
      });
      res.json({
        success: true,
        filename: uniqueFilename,
        path: `assets/${uniqueFilename}`,
        width,
        height
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
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
        const ext = import_path4.default.extname(providedFilename) || ".png";
        const name = import_path4.default.basename(providedFilename, ext);
        const safeName = name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
        filename = `${safeName}${ext}`;
      }
      const assetsDir = getAssetsDir(canvasName);
      await import_fs_extra4.default.ensureDir(assetsDir);
      const uniqueFilename = await resolveUniqueFilename(assetsDir, filename);
      const filepath = import_path4.default.join(assetsDir, uniqueFilename);
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      let width = 0;
      let height = 0;
      await withFileLocks([assetsDir, filepath], async () => {
        await import_fs_extra4.default.writeFile(filepath, base64Data, "base64");
        try {
          const metadata = await (0, import_sharp.default)(filepath).metadata();
          width = metadata.width || 0;
          height = metadata.height || 0;
        } catch (e) {
          console.error("Failed to read image metadata", e);
        }
      });
      res.json({
        success: true,
        filename: uniqueFilename,
        path: `assets/${uniqueFilename}`,
        width,
        height
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
      const filename = import_path4.default.basename(filePath);
      const targetPath = import_path4.default.join(getAssetsDir(canvasName), filename);
      await withFileLock(targetPath, async () => {
        if (await import_fs_extra4.default.pathExists(targetPath)) {
          await import_fs_extra4.default.unlink(targetPath);
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
      const filename = import_path4.default.basename(filePath);
      const targetPath = import_path4.default.join(getAssetsDir(canvasName), filename);
      const exists = await withFileLock(
        targetPath,
        () => import_fs_extra4.default.pathExists(targetPath)
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

// backend/server.ts
var SERVER_PORT = 30001;
var CONFIG_FILE = import_path5.default.join(import_electron.app.getPath("userData"), "lookback_config.json");
var DEFAULT_STORAGE_DIR = import_path5.default.join(import_electron.app.getPath("userData"), "lookback_storage");
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
      const exeDir = import_path5.default.dirname(import_electron.app.getPath("exe"));
      const portableDataDir = import_path5.default.join(exeDir, "data");
      if (await lockedFs.pathExists(portableDataDir)) {
        return portableDataDir;
      }
      const testFile = import_path5.default.join(exeDir, ".write_test");
      const writable = await withFileLock(testFile, async () => {
        try {
          await import_fs_extra5.default.writeFile(testFile, "test");
          await import_fs_extra5.default.remove(testFile);
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
var CANVASES_DIR = import_path5.default.join(STORAGE_DIR, "canvases");
var SETTINGS_FILE = import_path5.default.join(STORAGE_DIR, "settings.json");
var settingsCache = null;
var updateStoragePaths = (root) => {
  STORAGE_DIR = root;
  CANVASES_DIR = import_path5.default.join(STORAGE_DIR, "canvases");
  SETTINGS_FILE = import_path5.default.join(STORAGE_DIR, "settings.json");
};
var ensureStorageDirs = async (root) => {
  await Promise.all([
    lockedFs.ensureDir(root),
    lockedFs.ensureDir(import_path5.default.join(root, "canvases"))
  ]);
};
var getStorageDir = () => STORAGE_DIR;
var setStorageRoot = async (root) => {
  const trimmed = root.trim();
  if (!trimmed) return;
  updateStoragePaths(trimmed);
  settingsCache = null;
  await ensureStorageDirs(STORAGE_DIR);
  await withFileLock(CONFIG_FILE, async () => {
    await import_fs_extra5.default.writeJson(CONFIG_FILE, { storageDir: STORAGE_DIR });
  });
};
var readSettings = async () => {
  if (settingsCache) return settingsCache;
  return withFileLock(SETTINGS_FILE, async () => {
    if (!await import_fs_extra5.default.pathExists(SETTINGS_FILE)) {
      settingsCache = {};
      return settingsCache;
    }
    try {
      const raw = await import_fs_extra5.default.readJson(SETTINGS_FILE);
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
      await import_fs_extra5.default.writeJson(SETTINGS_FILE, settings);
    } catch (error) {
      console.error("Failed to write settings file", error);
    }
  });
});
var writeSettings = async (settings) => {
  settingsCache = settings;
  persistSettings(settings);
};
var initializeStorage = async () => {
  const root = await loadStorageRoot();
  updateStoragePaths(root);
  settingsCache = null;
  await ensureStorageDirs(STORAGE_DIR);
};
var getCanvasAssetsDir = (canvasName) => {
  const safeName = canvasName.replace(/[/\\:*?"<>|]/g, "_") || "Default";
  return import_path5.default.join(CANVASES_DIR, safeName, "assets");
};
var cleanupCanvasAssets = async () => {
  const canvasesDir = CANVASES_DIR;
  if (!await lockedFs.pathExists(canvasesDir)) return;
  const dirs = await lockedFs.readdir(canvasesDir).catch(() => []);
  for (const dir of dirs) {
    const canvasDir = import_path5.default.join(canvasesDir, dir);
    const stat = await lockedFs.stat(canvasDir).catch(() => null);
    if (!stat || !stat.isDirectory()) continue;
    const canvasJsonPath = import_path5.default.join(canvasDir, "canvas.json");
    const assetsDir = import_path5.default.join(canvasDir, "assets");
    const hasCanvas = await lockedFs.pathExists(canvasJsonPath);
    if (!hasCanvas) continue;
    await withFileLocks([canvasJsonPath, assetsDir], async () => {
      let canvasData = [];
      try {
        canvasData = await import_fs_extra5.default.readJson(canvasJsonPath);
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
            const filename = import_path5.default.basename(imagePath);
            const fullPath = import_path5.default.join(assetsDir, filename);
            if (await import_fs_extra5.default.pathExists(fullPath)) {
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
        await import_fs_extra5.default.writeJson(canvasJsonPath, nextItems);
      }
      if (await import_fs_extra5.default.pathExists(assetsDir)) {
        const files = await import_fs_extra5.default.readdir(assetsDir).catch(() => []);
        for (const file of files) {
          if (!referenced.has(file)) {
            await import_fs_extra5.default.unlink(import_path5.default.join(assetsDir, file)).catch(() => void 0);
          }
        }
      }
    });
  }
};
function downloadImage(url, dest) {
  return withFileLock(dest, () => new Promise((resolve, reject) => {
    if (url.startsWith("file://") || url.startsWith("/")) {
      let srcPath = url;
      if (url.startsWith("file://")) {
        srcPath = new URL(url).pathname;
        if (process.platform === "win32" && srcPath.startsWith("/") && srcPath.includes(":")) {
          srcPath = srcPath.substring(1);
        }
      }
      srcPath = decodeURIComponent(srcPath);
      import_fs_extra5.default.copy(srcPath, dest).then(() => resolve()).catch((err) => {
        import_fs_extra5.default.unlink(dest, () => {
        });
        reject(err);
      });
      return;
    }
    const file = import_fs_extra5.default.createWriteStream(dest);
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
        import_fs_extra5.default.unlink(dest, () => {
        });
        reject(
          new Error(
            `Server responded with ${response.statusCode}: ${response.statusMessage}`
          )
        );
      }
    });
    request.on("error", (err) => {
      import_fs_extra5.default.unlink(dest, () => {
      });
      reject(err);
    });
    file.on("error", (err) => {
      import_fs_extra5.default.unlink(dest, () => {
      });
      reject(err);
    });
  }));
}
async function startServer() {
  await initializeStorage();
  await cleanupCanvasAssets();
  const server = (0, import_express5.default)();
  server.use((0, import_cors.default)());
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
    const logFile = import_path5.default.join(STORAGE_DIR, "server.log");
    await withFileLock(logFile, async () => {
      await import_fs_extra5.default.ensureFile(logFile);
      await import_fs_extra5.default.appendFile(logFile, `${JSON.stringify(payload)}
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
    createTempRouter({
      getCanvasAssetsDir,
      downloadImage,
      getDominantColor
    })
  );
  server.get("/api/assets/:canvasName/:filename", async (req, res) => {
    const { canvasName, filename } = req.params;
    const safeCanvasDirName = canvasName.replace(/[/\\:*?"<>|]/g, "_") || "Default";
    if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
      res.status(400).send("Invalid filename");
      return;
    }
    const filePath = import_path5.default.join(
      CANVASES_DIR,
      safeCanvasDirName,
      "assets",
      filename
    );
    if (await import_fs_extra5.default.pathExists(filePath)) {
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
  server.listen(SERVER_PORT, () => {
    console.log(`Local server running on port ${SERVER_PORT}`);
  });
  return;
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
  "titleBar.toggleGallery": "Toggle Gallery",
  "titleBar.canvasGroup": "Smart Layout (Canvas)",
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
  "canvas.filters.posterize": "Oil Paint Block",
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
  "toast.globalError": "Error: {{message}}",
  "toast.unhandledRejection": "Unhandled Promise Rejection: {{reason}}",
  "toast.storageIncompatible": "Storage is incompatible. Please reset the data folder.",
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
  "titleBar.settings": "\u8BBE\u7F6E",
  "titleBar.alwaysOnTop": "\u7F6E\u9876",
  "titleBar.dataFolder": "\u6570\u636E\u6587\u4EF6\u5939",
  "titleBar.dataFolder.default": "\u672A\u914D\u7F6E\uFF0C\u5C06\u4F7F\u7528\u9ED8\u8BA4\u76EE\u5F55",
  "titleBar.change": "\u66F4\u6539",
  "titleBar.window": "\u7A97\u53E3",
  "titleBar.pinTransparent": "\u7F6E\u9876\u900F\u660E",
  "titleBar.canvasOpacity": "\u753B\u5E03\u900F\u660E\u5EA6",
  "titleBar.mouseThrough": "\u9F20\u6807\u7A7F\u900F",
  "titleBar.shortcuts": "\u5FEB\u6377\u952E",
  "titleBar.toggleWindowVisibility": "\u5207\u6362\u7A97\u53E3\u663E\u793A",
  "titleBar.canvasOpacityUp": "\u589E\u52A0\u753B\u5E03\u900F\u660E\u5EA6",
  "titleBar.canvasOpacityDown": "\u964D\u4F4E\u753B\u5E03\u4E0D\u900F\u660E\u5EA6",
  "titleBar.toggleMouseThrough": "\u5207\u6362\u9F20\u6807\u7A7F\u900F",
  "titleBar.toggleGallery": "\u5207\u6362\u56FE\u5E93\u62BD\u5C49",
  "titleBar.canvasGroup": "\u753B\u5E03\u667A\u80FD\u5E03\u5C40",
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
  "canvas.filters.posterize": "\u6CB9\u753B\u8272\u5757",
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
  "toast.globalError": "\u9519\u8BEF\uFF1A{{message}}",
  "toast.unhandledRejection": "\u672A\u5904\u7406\u7684 Promise \u62D2\u7EDD\uFF1A{{reason}}",
  "toast.storageIncompatible": "\u5B58\u50A8\u76EE\u5F55\u4E0D\u517C\u5BB9\uFF0C\u8BF7\u91CD\u7F6E\u6570\u636E\u6587\u4EF6\u5939\u3002",
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
Object.assign(console, import_electron_log.default.functions);
import_electron_log.default.transports.file.level = "info";
import_electron_log.default.transports.file.maxSize = 5 * 1024 * 1024;
import_electron_log.default.transports.file.archiveLog = (file) => {
  const filePath = file.toString();
  const info = import_path6.default.parse(filePath);
  const dest = import_path6.default.join(info.dir, info.name + ".old" + info.ext);
  lockedFs.rename(filePath, dest).catch((e) => {
    console.warn("Could not rotate log", e);
  });
};
var mainWindow = null;
var isAppHidden = false;
var lastGalleryDockDelta = 0;
var DEFAULT_TOGGLE_WINDOW_SHORTCUT = process.platform === "darwin" ? "Command+L" : "Ctrl+L";
var DEFAULT_TOGGLE_MOUSE_THROUGH_SHORTCUT = process.platform === "darwin" ? "Command+T" : "Ctrl+T";
var toggleWindowShortcut = DEFAULT_TOGGLE_WINDOW_SHORTCUT;
var toggleMouseThroughShortcut = DEFAULT_TOGGLE_MOUSE_THROUGH_SHORTCUT;
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
    const settings = await readSettings();
    const raw = settings && typeof settings === "object" ? settings.language : void 0;
    const locale = isLocale(raw) ? raw : "en";
    localeCache = locale;
    return locale;
  } catch {
    return "en";
  }
}
async function loadShortcuts() {
  try {
    const settingsPath = import_path6.default.join(getStorageDir(), "settings.json");
    const settings = await lockedFs.readJson(settingsPath).catch(() => null);
    if (!settings || typeof settings !== "object") return;
    const rawToggle = settings.toggleWindowShortcut;
    if (typeof rawToggle === "string" && rawToggle.trim()) {
      toggleWindowShortcut = rawToggle.trim();
    }
    const rawMouseThrough = settings.toggleMouseThroughShortcut;
    if (typeof rawMouseThrough === "string" && rawMouseThrough.trim()) {
      toggleMouseThroughShortcut = rawMouseThrough.trim();
    }
  } catch {
  }
}
async function loadWindowPinState() {
  try {
    const settingsPath = import_path6.default.join(getStorageDir(), "settings.json");
    const settings = await lockedFs.readJson(settingsPath).catch(() => null);
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
    const filePath = import_path6.default.join(__dirname, "../dist-renderer/index.html");
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
async function saveWindowBounds() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized() || mainWindow.isMaximized()) return;
  try {
    const bounds = mainWindow.getBounds();
    const settingsPath = import_path6.default.join(getStorageDir(), "settings.json");
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
  isAppHidden = false;
  const { width, height } = import_electron2.screen.getPrimaryDisplay().workAreaSize;
  let windowState = {};
  try {
    const settingsPath = import_path6.default.join(getStorageDir(), "settings.json");
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
    icon: import_path6.default.join(__dirname, "../resources/icon.svg"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: import_path6.default.join(__dirname, "preload.cjs")
    },
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: false,
    hasShadow: true
  });
  mainWindow.on("resize", debouncedSaveWindowBounds);
  mainWindow.on("move", debouncedSaveWindowBounds);
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
      mainWindow == null ? void 0 : mainWindow.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true
      });
    } else {
      mainWindow == null ? void 0 : mainWindow.setAlwaysOnTop(false);
      mainWindow == null ? void 0 : mainWindow.setVisibleOnAllWorkspaces(false);
    }
  });
  import_electron2.ipcMain.on(
    "set-pin-mode",
    (_event, { enabled, widthDelta }) => {
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
            const stream = import_fs_extra6.default.createReadStream(logPath, {
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
async function startServer2() {
  return startServer();
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
  const taskLoadPin = loadWindowPinState();
  const taskLoadShortcuts = loadShortcuts();
  const taskCreateWindow = createWindow();
  const taskStartServer = startServer2();
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
import_electron2.ipcMain.handle(
  "set-toggle-window-shortcut",
  async (_event, accelerator) => {
    return registerToggleWindowShortcut(accelerator);
  }
);
import_electron2.ipcMain.handle(
  "set-toggle-mouse-through-shortcut",
  async (_event, accelerator) => {
    return registerToggleMouseThroughShortcut(accelerator);
  }
);
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
  import_electron2.globalShortcut.unregisterAll();
});
import_electron2.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") import_electron2.app.quit();
});
