import path from "path";
import express from "express";
import fs from "fs-extra";
import sharp from "sharp";
import { withFileLock, withFileLocks } from "../fileLock";

type TempRouteDeps = {
  getCanvasAssetsDir: (canvasName: string) => string;
  downloadImage: (url: string, targetPath: string) => Promise<void>;
  getDominantColor: (arg: string) => Promise<string | null>;
  getTone: (arg: string) => Promise<string | null>;
};

export const createTempRouter = (deps: TempRouteDeps) => {
  const router = express.Router();
  const getAssetsDir = (canvasName?: string) =>
    deps.getCanvasAssetsDir(canvasName || "Default");
  const createRequestId = (): string =>
    `durl_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`;
  const normalizeLogUrl = (rawUrl: string): string => {
    try {
      const parsed = new URL(rawUrl);
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      return rawUrl;
    }
  };
  const resolveUniqueFilename = async (
    assetsDir: string,
    desired: string
  ): Promise<string> => {
    return withFileLock(assetsDir, async () => {
      const parsed = path.parse(desired);
      let candidate = desired;
      let index = 1;
      while (await fs.pathExists(path.join(assetsDir, candidate))) {
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
      const { url, canvasName } = req.body as {
        url?: string;
        canvasName?: string;
      };
      if (!url || typeof url !== "string") {
        res.status(400).json({ error: "URL is required" });
        return;
      }

      const trimmedUrl = url.trim();
      if (
        !trimmedUrl.startsWith("http://") &&
        !trimmedUrl.startsWith("https://")
      ) {
        res.status(400).json({ error: "Invalid URL" });
        return;
      }
      console.info(`[temp][download-url][${requestId}] start`, {
        canvasName: canvasName || "Default",
        url: normalizeLogUrl(trimmedUrl),
      });

      let urlFilename = "image.jpg";
      try {
        const urlObj = new URL(trimmedUrl);
        const pathname = urlObj.pathname;
        const baseName = path.basename(pathname).split("?")[0];
        if (baseName && /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(baseName)) {
          urlFilename = baseName;
        }
      } catch {
        void 0;
      }

      const ext = path.extname(urlFilename) || ".jpg";
      const nameWithoutExt = path.basename(urlFilename, ext);
      const safeName =
        nameWithoutExt.replace(/[^a-zA-Z0-9.\-_]/g, "_") || "image";
      const timestamp = Date.now();
      const filename = `${safeName}_${timestamp}${ext}`;
      const assetsDir = getAssetsDir(canvasName);
      stage = "ensure-assets-dir";
      await fs.ensureDir(assetsDir);
      stage = "resolve-unique-filename";
      const uniqueFilename = await resolveUniqueFilename(assetsDir, filename);
      const filepath = path.join(assetsDir, uniqueFilename);

      let width = 0;
      let height = 0;
      let dominantColor: string | null = null;
      let tone: string | null = null;

      stage = "wait-file-locks";
      const lockRequestedAt = Date.now();
      await withFileLocks([assetsDir, filepath], async () => {
        // 记录锁等待时长，用于判断是否由文件锁竞争导致慢请求/异常。
        lockWaitMs = Date.now() - lockRequestedAt;
        console.info(`[temp][download-url][${requestId}] lock-acquired`, {
          lockWaitMs,
          file: uniqueFilename,
        });

        stage = "download-image";
        const downloadStartedAt = Date.now();
        await deps.downloadImage(trimmedUrl, filepath);
        downloadMs = Date.now() - downloadStartedAt;

        try {
          stage = "read-metadata";
          const metadataStartedAt = Date.now();
          const metadata = await sharp(filepath).metadata();
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
        file: uniqueFilename,
      });

      res.json({
        success: true,
        filename: uniqueFilename,
        path: `assets/${uniqueFilename}`,
        width,
        height,
        dominantColor,
        tone,
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
        error: message,
      });
      res.status(500).json({ error: message });
    }
  });

  router.post("/api/upload-temp", async (req, res) => {
    try {
      const { imageBase64, filename: providedFilename, canvasName } =
        req.body as {
          imageBase64?: string;
          filename?: string;
          canvasName?: string;
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

      const assetsDir = getAssetsDir(canvasName);
      await fs.ensureDir(assetsDir);
      const uniqueFilename = await resolveUniqueFilename(assetsDir, filename);
      const filepath = path.join(assetsDir, uniqueFilename);
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

      let width = 0;
      let height = 0;
      let dominantColor: string | null = null;
      let tone: string | null = null;

      await withFileLocks([assetsDir, filepath], async () => {
        await fs.writeFile(filepath, base64Data, "base64");
        try {
          const metadata = await sharp(filepath).metadata();
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
        tone,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.post("/api/delete-temp-file", async (req, res) => {
    try {
      const { filePath, canvasName } = req.body as {
        filePath?: string;
        canvasName?: string;
      };
      if (!filePath) {
        res.status(400).json({ error: "File path is required" });
        return;
      }

      if (!filePath.startsWith("assets/")) {
        res.status(400).json({ error: "Invalid file path format" });
        return;
      }

      const filename = path.basename(filePath);
      const targetPath = path.join(getAssetsDir(canvasName), filename);

      await withFileLock(targetPath, async () => {
        if (await fs.pathExists(targetPath)) {
          await fs.unlink(targetPath);
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
      const { filePath, canvasName } = req.body as {
        filePath?: string;
        canvasName?: string;
      };
      if (!filePath) {
        res.status(400).json({ error: "File path is required" });
        return;
      }

      if (!filePath.startsWith("assets/")) {
        res.status(400).json({ error: "Invalid file path format" });
        return;
      }

      const filename = path.basename(filePath);
      const targetPath = path.join(getAssetsDir(canvasName), filename);
      const exists = await withFileLock(targetPath, () =>
        fs.pathExists(targetPath)
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
