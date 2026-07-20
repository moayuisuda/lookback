import { randomUUID } from "node:crypto";
import path from "path";
import express from "express";
import fs from "fs-extra";
import { withFileLocks } from "../fileLock";
import type { CopiedCanvasAsset } from "../../shared/canvasAssetTransfer";

type CanvasAssetsRouteDeps = {
  getCanvasAssetsDir: (canvasName: string) => string;
};

type StagedCanvasAsset = CopiedCanvasAsset & {
  stagedPath: string;
  finalPath: string;
};

const readCanvasName = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const readAssetFilename = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized.startsWith("assets/")) return null;

  const filename = normalized.slice("assets/".length);
  if (
    !filename ||
    filename.includes("/") ||
    filename.includes("\\") ||
    filename.includes("..") ||
    path.basename(filename) !== filename
  ) {
    return null;
  }
  return filename;
};

const readAssetFilenames = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) return null;
  const filenames: string[] = [];
  for (const item of value) {
    const filename = readAssetFilename(item);
    if (!filename) return null;
    filenames.push(filename);
  }
  return Array.from(new Set(filenames));
};

const resolveUniqueFilename = async (
  assetsDir: string,
  desired: string,
  reserved: Set<string>,
) => {
  const parsed = path.parse(desired);
  let candidate = desired;
  let index = 1;
  while (
    reserved.has(candidate) ||
    await fs.pathExists(path.join(assetsDir, candidate))
  ) {
    candidate = `${parsed.name}_${index}${parsed.ext}`;
    index += 1;
  }
  reserved.add(candidate);
  return candidate;
};

export const createCanvasAssetsRouter = (deps: CanvasAssetsRouteDeps) => {
  const router = express.Router();

  router.post("/api/canvas-assets/copy", async (req, res) => {
    const { imagePaths, sourceCanvasName, targetCanvasName } = req.body as {
      imagePaths?: unknown;
      sourceCanvasName?: unknown;
      targetCanvasName?: unknown;
    };
    const sourceName = readCanvasName(sourceCanvasName);
    const targetName = readCanvasName(targetCanvasName);
    const sourceFilenames = readAssetFilenames(imagePaths);
    if (!sourceName || !targetName || !sourceFilenames) {
      res.status(400).json({ error: "Invalid canvas asset copy request" });
      return;
    }
    if (sourceFilenames.length === 0) {
      res.json({ success: true, assets: [] });
      return;
    }

    const sourceAssetsDir = deps.getCanvasAssetsDir(sourceName);
    const targetAssetsDir = deps.getCanvasAssetsDir(targetName);
    const sourceCanvasDir = path.dirname(sourceAssetsDir);
    const targetCanvasDir = path.dirname(targetAssetsDir);
    const sourcePaths = sourceFilenames.map((filename) =>
      path.join(sourceAssetsDir, filename)
    );
    const stagedPaths: string[] = [];
    const committedPaths: string[] = [];

    try {
      const assets = await withFileLocks(
        [
          sourceCanvasDir,
          targetCanvasDir,
          sourceAssetsDir,
          targetAssetsDir,
          ...sourcePaths,
        ],
        async () => {
          await fs.ensureDir(targetAssetsDir);
          const reservedNames = new Set<string>();
          const stagedAssets: StagedCanvasAsset[] = [];

          try {
            for (const [index, sourceFilename] of sourceFilenames.entries()) {
              const sourcePath = sourcePaths[index];
              if (!(await fs.pathExists(sourcePath))) {
                throw new Error(`Canvas asset not found: ${sourceFilename}`);
              }

              const filename = await resolveUniqueFilename(
                targetAssetsDir,
                sourceFilename,
                reservedNames,
              );
              const stagedPath = path.join(
                targetAssetsDir,
                `.copy-${randomUUID()}-${index}`,
              );
              const finalPath = path.join(targetAssetsDir, filename);
              stagedPaths.push(stagedPath);
              await fs.copy(sourcePath, stagedPath, { overwrite: false });

              stagedAssets.push({
                sourcePath: `assets/${sourceFilename}`,
                filename,
                path: `assets/${filename}`,
                stagedPath,
                finalPath,
              });
            }

            for (const asset of stagedAssets) {
              await fs.rename(asset.stagedPath, asset.finalPath);
              committedPaths.push(asset.finalPath);
            }

            return stagedAssets.map((asset) => ({
              sourcePath: asset.sourcePath,
              filename: asset.filename,
              path: asset.path,
            }));
          } catch (error) {
            await Promise.all(
              [...stagedPaths, ...committedPaths].map((filePath) =>
                fs.remove(filePath)
              ),
            );
            throw error;
          }
        },
      );

      res.json({ success: true, assets });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.post("/api/canvas-assets/delete", async (req, res) => {
    const { imagePaths, canvasName } = req.body as {
      imagePaths?: unknown;
      canvasName?: unknown;
    };
    const targetCanvasName = readCanvasName(canvasName);
    const filenames = readAssetFilenames(imagePaths);
    if (!targetCanvasName || !filenames) {
      res.status(400).json({ error: "Invalid canvas asset delete request" });
      return;
    }

    const assetsDir = deps.getCanvasAssetsDir(targetCanvasName);
    const canvasDir = path.dirname(assetsDir);
    const targetPaths = filenames.map((filename) =>
      path.join(assetsDir, filename)
    );
    try {
      await withFileLocks([canvasDir, assetsDir, ...targetPaths], async () => {
        await Promise.all(targetPaths.map((filePath) => fs.remove(filePath)));
      });
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  return router;
};
