import { app } from "electron";
import express from "express";
import path from "path";
import fs from "fs-extra";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { compileInWorker } from "../compileInWorker";
import { lockedFs, withFileLock } from "../fileLock";

type CommandsRouteDeps = {
  getStorageDir: () => string;
};

type PackageManifest = {
  dependencies?: Record<string, string>;
  lookback?: {
    id?: string;
    ui?: string;
    server?: string;
  };
};

type ExternalCommandManifest = {
  id: string;
  title: string;
  titleKey?: string;
  description?: string;
  descriptionKey?: string;
  i18n?: Partial<Record<"zh" | "en", Record<string, string>>>;
  keywords?: string[];
  entry?: string;
  serverEntry?: string;
  mode?: string;
  ui?: {
    fields?: unknown;
  };
};

const ROOT_FOLDER = "__root__";
const COMPILED_PLUGIN_DIR = ".lookback-esm";
const COMPILED_PLUGIN_VERSION = "2";
const NPM_REGISTRY = "https://registry.npmmirror.com";
const INSTALL_TIMEOUT_MS = 10 * 60 * 1000;
const SCRIPT_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const COMPILE_EXTENSIONS = new Set([".jsx", ".mjs", ".ts", ".tsx"]);
const SKIPPED_PLUGIN_DIRS = new Set([
  "node_modules",
  COMPILED_PLUGIN_DIR,
  ".lookback-cjs",
  ".git",
]);
const preparedPluginDirs = new Set<string>();

const COMMAND_ID_PATTERN =
  /export\s+const\s+config\s*=\s*{[\s\S]*?\bid\s*:\s*['"`]([^'"`]+)['"`]/;

const isSafeSegment = (value: string) =>
  value.length > 0 &&
  value !== "." &&
  value !== ".." &&
  !value.includes("..") &&
  !value.includes("/") &&
  !value.includes("\\");

const isScriptFile = (value: string) =>
  SCRIPT_EXTENSIONS.has(path.extname(value).toLowerCase());

const isPackageName = (value: string) =>
  /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(value);

const normalizeRelativePath = (value: string) => {
  const normalized = path.posix.normalize(value.replace(/\\/g, "/"));
  if (
    !normalized ||
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    path.isAbsolute(normalized)
  ) {
    throw new Error("Invalid path");
  }
  return normalized;
};

const assertInside = (root: string, target: string) => {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return resolvedTarget;
  }
  throw new Error("Invalid path");
};

const toFilePath = (root: string, relativePath: string) =>
  assertInside(root, path.join(root, ...normalizeRelativePath(relativePath).split("/")));

const toOutputRelativePath = (relativePath: string) => {
  const normalized = normalizeRelativePath(relativePath);
  const ext = path.extname(normalized).toLowerCase();
  if (!COMPILE_EXTENSIONS.has(ext)) return normalized;
  const parsed = path.posix.parse(normalized);
  return path.posix.join(parsed.dir, `${parsed.name}.js`);
};

const toEsmFileUrl = (folder: string, relativePath: string) =>
  `/api/commands/${encodeURIComponent(folder)}/esm-file/${normalizeRelativePath(relativePath)
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;

const sanitizeFileBaseName = (value: string) =>
  value.trim().replace(/[<>:"/\\|?*\s]+/g, "_");

const extractCommandId = (script: string) => {
  const match = COMMAND_ID_PATTERN.exec(script);
  if (!match) return "";
  return match[1]?.trim() || "";
};

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const extractObjectBlock = (source: string, startPattern: RegExp) => {
  const match = startPattern.exec(source);
  if (!match) return "";
  const braceStart = source.indexOf("{", match.index);
  if (braceStart < 0) return "";

  let depth = 0;
  let quote: string | null = null;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (inLineComment) {
      if (char === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === "/" && next === "/") {
      inLineComment = true;
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      inBlockComment = true;
      index += 1;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(braceStart, index + 1);
    }
  }
  return "";
};

const extractObjectFieldValue = (block: string, key: string) => {
  const pattern = new RegExp(
    `\\b${escapeRegExp(key)}\\s*:\\s*(['"\`])([\\s\\S]*?)\\1`,
  );
  return pattern.exec(block)?.[2]?.trim() || "";
};

const extractStringArrayField = (block: string, key: string) => {
  const arrayMatch = new RegExp(
    `\\b${escapeRegExp(key)}\\s*:\\s*\\[([\\s\\S]*?)\\]`,
  ).exec(block);
  if (!arrayMatch) return undefined;
  const items = Array.from(
    arrayMatch[1].matchAll(/(['"`])([\s\S]*?)\1/g),
    (item) => item[2].trim(),
  ).filter(Boolean);
  return items.length ? items : undefined;
};

const extractLocaleBlock = (block: string, locale: "zh" | "en") =>
  extractObjectBlock(block, new RegExp(`\\b${locale}\\s*:`)).replace(/^\{|\}$/g, "");

const extractI18nField = (localeBlock: string, key: string) => {
  const pattern = new RegExp(
    `['"\`]${escapeRegExp(key)}['"\`]\\s*:\\s*(['"\`])([\\s\\S]*?)\\1`,
  );
  return pattern.exec(localeBlock)?.[2]?.trim() || "";
};

const extractCommandMetadata = (script: string) => {
  const configBlock = extractObjectBlock(
    script,
    /export\s+const\s+config\s*=/,
  );
  if (!configBlock) return {};

  const title = extractObjectFieldValue(configBlock, "title");
  const description = extractObjectFieldValue(configBlock, "description");
  const titleKey = extractObjectFieldValue(configBlock, "titleKey");
  const descriptionKey = extractObjectFieldValue(configBlock, "descriptionKey");
  const i18n: Partial<Record<"zh" | "en", Record<string, string>>> = {};

  (["zh", "en"] as const).forEach((locale) => {
    const localeBlock = extractLocaleBlock(configBlock, locale);
    if (!localeBlock) return;
    const localeMessages: Record<string, string> = {};
    if (titleKey) {
      const localeTitle = extractI18nField(localeBlock, titleKey);
      if (localeTitle) localeMessages[titleKey] = localeTitle;
    }
    if (descriptionKey) {
      const localeDescription = extractI18nField(localeBlock, descriptionKey);
      if (localeDescription) localeMessages[descriptionKey] = localeDescription;
    }
    if (Object.keys(localeMessages).length > 0) {
      i18n[locale] = localeMessages;
    }
  });

  return {
    id: extractCommandId(script),
    title,
    titleKey,
    description,
    descriptionKey,
    keywords: extractStringArrayField(configBlock, "keywords"),
    i18n: Object.keys(i18n).length > 0 ? i18n : undefined,
  };
};

const readCommandMetadata = async (scriptPath: string) => {
  const script = await lockedFs.readFile(scriptPath, "utf-8").catch(() => "");
  return typeof script === "string" ? extractCommandMetadata(script) : {};
};

const readPackageManifest = async (pluginDir: string) => {
  const packagePath = path.join(pluginDir, "package.json");
  if (!(await lockedFs.pathExists(packagePath))) return null;
  const raw = await lockedFs.readJson<PackageManifest>(packagePath).catch(() => null);
  return raw && typeof raw === "object" ? raw : null;
};

const resolveDirectoryEntry = async (
  pluginDir: string,
  manifest: PackageManifest | null,
) => {
  const rawEntry = manifest?.lookback?.ui?.trim();
  if (!rawEntry) throw new Error("Missing plugin ui entry");
  const entry = normalizeRelativePath(rawEntry);
  if (!isScriptFile(entry)) throw new Error("Invalid plugin ui entry");
  const filePath = toFilePath(pluginDir, entry);
  const stat = await lockedFs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) throw new Error("Missing plugin ui entry");
  return entry;
};

const resolveDirectoryServerEntry = async (
  pluginDir: string,
  manifest: PackageManifest | null,
) => {
  const rawEntry = manifest?.lookback?.server?.trim();
  if (!rawEntry) return "";
  const entry = normalizeRelativePath(rawEntry);
  if (!isScriptFile(entry)) throw new Error("Invalid plugin server entry");
  const filePath = toFilePath(pluginDir, entry);
  const stat = await lockedFs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) throw new Error("Missing plugin server entry");
  return entry;
};

const getDependencyPackagePath = (pluginDir: string, packageName: string) => {
  const chunks = packageName.split("/");
  return path.join(pluginDir, "node_modules", ...chunks, "package.json");
};

const runNpmInstall = async (pluginDir: string) => {
  const npmCliPath = path.join(
    app.getAppPath(),
    "node_modules",
    "npm",
    "bin",
    "npm-cli.js",
  );

  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        npmCliPath,
        "install",
        "--omit=dev",
        "--no-audit",
        "--no-fund",
        "--ignore-scripts",
        `--registry=${NPM_REGISTRY}`,
      ],
      {
        cwd: pluginDir,
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: "1",
          NPM_CONFIG_REGISTRY: NPM_REGISTRY,
          npm_config_registry: NPM_REGISTRY,
          PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1",
          NPM_CONFIG_PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1",
          npm_config_playwright_skip_browser_download: "1",
        },
        windowsHide: true,
      },
    );
    let output = "";
    const appendOutput = (chunk: Buffer) => {
      output = `${output}${chunk.toString("utf-8")}`.slice(-8000);
    };
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("npm install timed out"));
    }, INSTALL_TIMEOUT_MS);

    child.stdout?.on("data", appendOutput);
    child.stderr?.on("data", appendOutput);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(output.trim() || `npm install failed with code ${code}`));
    });
  });
};

const writeCompiledPackageManifest = async (outputDir: string) => {
  await lockedFs.writeJson(path.join(outputDir, "package.json"), { type: "module" });
};

const readPluginEntries = async (pluginDir: string, sourceDir: string): Promise<Dirent[]> => {
  // prepare 已持有插件根目录锁，根目录不可再通过 lockedFs 重入加锁。
  return sourceDir === pluginDir
    ? fs.readdir(sourceDir, { withFileTypes: true })
    : lockedFs.readdir(sourceDir, { withFileTypes: true }) as Promise<Dirent[]>;
};

const getPluginSourceHash = async (pluginDir: string): Promise<string> => {
  const hash = createHash("sha256").update(COMPILED_PLUGIN_VERSION);
  const visit = async (sourceDir: string): Promise<void> => {
    const entries = await readPluginEntries(pluginDir, sourceDir);
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const sourcePath = path.join(sourceDir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_PLUGIN_DIRS.has(entry.name)) await visit(sourcePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const relativePath = path.relative(pluginDir, sourcePath).replace(/\\/g, "/");
      hash.update(relativePath).update("\0");
      if (SCRIPT_EXTENSIONS.has(path.extname(sourcePath).toLowerCase()) || entry.name === "package.json") {
        hash.update(await lockedFs.readFile(sourcePath) as Buffer);
      } else {
        const stat = await lockedFs.stat(sourcePath);
        hash.update(`${stat.size}:${stat.mtimeMs}`);
      }
      hash.update("\0");
    }
  };
  await visit(pluginDir);
  return hash.digest("hex");
};

const copyPluginAsEsm = async (
  pluginDir: string,
  sourceDir: string,
  outputDir: string,
) => {
  const entries = await readPluginEntries(pluginDir, sourceDir);
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const relativePath = path.relative(pluginDir, sourcePath).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      if (SKIPPED_PLUGIN_DIRS.has(entry.name)) continue;
      await copyPluginAsEsm(pluginDir, sourcePath, outputDir);
      continue;
    }
    if (!entry.isFile()) continue;

    const outputRelativePath = toOutputRelativePath(relativePath);
    const outputPath = toFilePath(outputDir, outputRelativePath);
    await lockedFs.ensureDir(path.dirname(outputPath));

    const ext = path.extname(sourcePath).toLowerCase();
    if (SCRIPT_EXTENSIONS.has(ext)) {
      const source = await lockedFs.readFile(sourcePath, "utf-8") as string;
      await lockedFs.writeFile(outputPath, await compileInWorker(source, sourcePath), "utf-8");
      continue;
    }

    await lockedFs.copy(sourcePath, outputPath);
  }
};

export const createCommandsRouter = (deps: CommandsRouteDeps) => {
  const router = express.Router();

  const getCommandsDir = () => path.join(deps.getStorageDir(), "commands");
  const getPluginDir = (folder: string) => {
    if (!isSafeSegment(folder) || folder === ROOT_FOLDER) {
      throw new Error("Invalid folder");
    }
    return assertInside(getCommandsDir(), path.join(getCommandsDir(), folder));
  };

  router.get("/api/commands", async (_req, res) => {
    try {
      const commandsDir = getCommandsDir();
      await lockedFs.ensureDir(commandsDir);
      const entries = await lockedFs.readdir(commandsDir).catch(() => []);
      const result: Array<
        ExternalCommandManifest & { folder: string; entry: string }
      > = [];

      for (const entry of entries) {
        if (!isSafeSegment(entry)) continue;
        const entryPath = path.join(commandsDir, entry);
        const stat = await lockedFs.stat(entryPath).catch(() => null);
        if (!stat) continue;

        if (stat.isFile() && isScriptFile(entry)) {
          const parsed = path.parse(entry);
          const metadata = await readCommandMetadata(entryPath);
          const id = metadata.id || parsed.name.trim();
          if (!id) continue;
          result.push({
            id,
            title: metadata.title || id,
            titleKey: metadata.titleKey,
            description: metadata.description,
            descriptionKey: metadata.descriptionKey,
            keywords: metadata.keywords,
            i18n: metadata.i18n,
            entry,
            folder: ROOT_FOLDER,
          });
          continue;
        }

        if (!stat.isDirectory()) continue;
        const manifest = await readPackageManifest(entryPath);
        const pluginId = manifest?.lookback?.id?.trim();
        if (!pluginId) continue;
        const commandEntry = await resolveDirectoryEntry(entryPath, manifest).catch(() => "");
        if (!commandEntry) continue;
        const serverEntry = await resolveDirectoryServerEntry(entryPath, manifest).catch(() => "");
        const metadata = await readCommandMetadata(toFilePath(entryPath, commandEntry));
        const id = metadata.id || pluginId;
        result.push({
          id,
          title: metadata.title || id,
          titleKey: metadata.titleKey,
          description: metadata.description,
          descriptionKey: metadata.descriptionKey,
          keywords: metadata.keywords,
          i18n: metadata.i18n,
          entry: commandEntry,
          serverEntry: serverEntry || undefined,
          folder: entry,
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
      if (!isSafeSegment(folder)) {
        res.status(400).send("Invalid path");
        return;
      }

      const commandsDir = getCommandsDir();
      const dirPath = folder === ROOT_FOLDER ? commandsDir : getPluginDir(folder);
      if (!entry) {
        res.status(400).send("Missing script entry");
        return;
      }
      const entryName = normalizeRelativePath(entry);
      const scriptPath = toFilePath(dirPath, entryName);
      if (!isScriptFile(scriptPath)) {
        res.status(400).send("Invalid script");
        return;
      }

      if (!(await lockedFs.pathExists(scriptPath))) {
        res.status(404).send("Not found");
        return;
      }
      const content = await lockedFs.readFile(scriptPath, "utf-8");
      res.type("application/javascript").send(content);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.post("/api/commands/:folder/dependencies/ensure", async (req, res) => {
    try {
      const { folder } = req.params;
      const pluginDir = getPluginDir(folder);
      await withFileLock(pluginDir, async () => {
        const manifest = await readPackageManifest(pluginDir);
        const dependencies = manifest?.dependencies ?? {};
        const dependencyNames = Object.keys(dependencies);
        if (!dependencyNames.every(isPackageName)) {
          res.status(400).json({ error: "Invalid dependency name" });
          return;
        }

        const missing = [];
        for (const name of dependencyNames) {
          const packagePath = getDependencyPackagePath(pluginDir, name);
          if (!(await lockedFs.pathExists(packagePath))) {
            missing.push(name);
          }
        }

        if (missing.length > 0) {
          await runNpmInstall(pluginDir);
        }

        res.json({ success: true, installed: missing });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.get(/^\/api\/commands\/([^/]+)\/esm-file\/(.+)$/, async (req, res) => {
    try {
      const folder = decodeURIComponent(String(req.params[0] || ""));
      const relativePath = decodeURIComponent(String(req.params[1] || ""));
      const pluginDir = getPluginDir(folder);
      const outputDir = path.join(pluginDir, COMPILED_PLUGIN_DIR);
      const filePath = toFilePath(outputDir, relativePath);
      if (!(await lockedFs.pathExists(filePath))) {
        res.status(404).send("Not found");
        return;
      }
      if (isScriptFile(filePath)) {
        res.type("application/javascript");
      }
      res.send(await lockedFs.readFile(filePath));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.post("/api/commands/:folder/esm/prepare", async (req, res) => {
    try {
      const { folder } = req.params;
      const pluginDir = getPluginDir(folder);
      await withFileLock(pluginDir, async () => {
        const manifest = await readPackageManifest(pluginDir);
        const rawEntry = await resolveDirectoryEntry(pluginDir, manifest);
        const entry = normalizeRelativePath(rawEntry);
        const entryPath = toFilePath(pluginDir, entry);
        if (!isScriptFile(entryPath) || !(await lockedFs.pathExists(entryPath))) {
          res.status(404).json({ error: "Entry not found" });
          return;
        }

        const outputRoot = path.join(pluginDir, COMPILED_PLUGIN_DIR);
        const buildId = await getPluginSourceHash(pluginDir);
        const outputDir = path.join(outputRoot, buildId);
        const compiledEntry = path.posix.join(buildId, toOutputRelativePath(entry));
        const compiledEntryPath = toFilePath(outputRoot, compiledEntry);
        const serverEntry = await resolveDirectoryServerEntry(pluginDir, manifest).catch(() => "");
        const compiledServerEntry = serverEntry
          ? path.posix.join(buildId, toOutputRelativePath(serverEntry))
          : "";
        const compiledServerEntryPath = compiledServerEntry
          ? toFilePath(outputRoot, compiledServerEntry)
          : "";

        await lockedFs.ensureDir(outputRoot);
        if (!preparedPluginDirs.has(pluginDir)) {
          // 进程启动后的首次准备可以清理上次运行留下的旧版本；当前进程使用的版本保留。
          const oldBuilds = await lockedFs.readdir(outputRoot) as string[];
          for (const oldBuild of oldBuilds) {
            if (oldBuild !== buildId) {
              await lockedFs.remove(toFilePath(outputRoot, oldBuild));
            }
          }
          preparedPluginDirs.add(pluginDir);
        }

        const completePath = path.join(outputDir, ".complete");
        const cacheReady = await lockedFs.pathExists(completePath) &&
          await lockedFs.pathExists(compiledEntryPath) &&
          (!compiledServerEntryPath || await lockedFs.pathExists(compiledServerEntryPath));
        if (!cacheReady) {
          await lockedFs.remove(outputDir);
          await lockedFs.ensureDir(outputDir);
          await copyPluginAsEsm(pluginDir, pluginDir, outputDir);
          await writeCompiledPackageManifest(outputDir);
          await lockedFs.writeFile(completePath, buildId, "utf-8");
        }

        res.json({
          success: true,
          entryUrl: toEsmFileUrl(folder, compiledEntry),
          entryPath: compiledEntryPath,
          serverEntry,
          serverEntryPath: compiledServerEntryPath || undefined,
        });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.post("/api/commands/text-import", async (req, res) => {
    try {
      const script =
        typeof req.body?.script === "string" ? req.body.script.trim() : "";
      if (!script) {
        res.status(400).json({ error: "Missing script" });
        return;
      }

      const commandId = extractCommandId(script);
      if (!commandId) {
        res.status(400).json({ error: "Missing config.id" });
        return;
      }

      const fileBaseName = sanitizeFileBaseName(commandId);
      if (!fileBaseName) {
        res.status(400).json({ error: "Invalid config.id" });
        return;
      }

      const commandsDir = getCommandsDir();
      await lockedFs.ensureDir(commandsDir);
      const fileName = `${fileBaseName}.jsx`;
      const scriptPath = path.join(commandsDir, fileName);
      if (await lockedFs.pathExists(scriptPath)) {
        res.status(409).json({ error: "Command already exists. Delete it first." });
        return;
      }

      await lockedFs.writeFile(scriptPath, script, "utf-8");

      res.json({
        success: true,
        id: commandId,
        folder: ROOT_FOLDER,
        entry: fileName,
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
      if (!isSafeSegment(folder)) {
        res.status(400).json({ error: "Invalid path" });
        return;
      }

      if (folder !== ROOT_FOLDER) {
        const pluginDir = getPluginDir(folder);
        await lockedFs.remove(pluginDir);
        res.json({ success: true });
        return;
      }

      if (!entry) {
        res.status(400).json({ error: "Missing entry" });
        return;
      }
      const entryName = normalizeRelativePath(entry);
      if (!isScriptFile(entryName)) {
        res.status(400).json({ error: "Invalid path" });
        return;
      }

      const scriptPath = toFilePath(getCommandsDir(), entryName);
      await lockedFs.remove(scriptPath);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  return router;
};
