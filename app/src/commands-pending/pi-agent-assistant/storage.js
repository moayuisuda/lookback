import fs from "node:fs/promises";
import path from "node:path";

const LOCK_TIMEOUT_MS = 15000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const normalizeRelativePath = (value) => {
  const normalized = path.posix.normalize(String(value || "").replace(/\\/g, "/"));
  if (
    !normalized ||
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    path.isAbsolute(normalized)
  ) {
    throw new Error("路径不合法");
  }
  return normalized;
};

export const assertInside = (root, target) => {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return resolvedTarget;
  }
  throw new Error("路径越界");
};

export const sanitizeCommandName = (value) => {
  const name = String(value || "")
    .trim()
    .replace(/[<>:"/\\|?*\s]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!name || name === "." || name === ".." || name.includes("..")) {
    throw new Error("命令 ID 不合法");
  }
  return name;
};

export const toCommandPath = (commandDir, relativePath) =>
  assertInside(commandDir, path.join(commandDir, ...normalizeRelativePath(relativePath).split("/")));

export const fileLock = {
  async with(targetPath, callback) {
    const lockPath = `${targetPath}.lock`;
    const startedAt = Date.now();
    while (true) {
      try {
        await fs.mkdir(lockPath);
        break;
      } catch (error) {
        if (Date.now() - startedAt > LOCK_TIMEOUT_MS) throw error;
        await sleep(60 + Math.round(Math.random() * 90));
      }
    }

    try {
      return await callback();
    } finally {
      await fs.rm(lockPath, { recursive: true, force: true });
    }
  },

  async ensureDir(dirPath) {
    return this.with(dirPath, () => fs.mkdir(dirPath, { recursive: true }));
  },

  async pathExists(targetPath) {
    try {
      await fs.access(targetPath);
      return true;
    } catch {
      return false;
    }
  },

  async readText(filePath) {
    return this.with(filePath, () => fs.readFile(filePath, "utf8"));
  },

  async readJson(filePath) {
    return JSON.parse(await this.readText(filePath));
  },

  async writeText(filePath, content) {
    return this.with(filePath, async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const tempPath = `${filePath}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      await fs.writeFile(tempPath, String(content), "utf8");
      await fs.rename(tempPath, filePath);
    });
  },

  async writeJson(filePath, data) {
    await this.writeText(filePath, `${JSON.stringify(data, null, 2)}\n`);
  },

  async remove(targetPath) {
    return this.with(targetPath, () => fs.rm(targetPath, { recursive: true, force: true }));
  },

  async readdir(dirPath) {
    return this.with(dirPath, () => fs.readdir(dirPath, { withFileTypes: true }));
  },

  async stat(targetPath) {
    return this.with(targetPath, () => fs.stat(targetPath));
  },
};
