import fs from "node:fs/promises";
import path from "node:path";
import { Type } from "@earendil-works/pi-ai";
import { transform } from "sucrase";
import {
  assertInside,
  fileLock,
  normalizeRelativePath,
  sanitizeCommandName,
  toCommandPath,
} from "../storage.js";

const MAX_FILE_SIZE = 1024 * 1024;
const SCRIPT_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const SINGLE_FILE_EXTENSIONS = new Set([".js", ".jsx", ".mjs"]);
const SOURCE_FRAME_RADIUS = 3;
const COMPILED_PLUGIN_DIR = ".lookback-plugin";
const ROOT_FOLDER = "__root__";
const COMMAND_ID_PATTERN =
  /export\s+const\s+config\s*=\s*{[\s\S]*?\bid\s*:\s*['"`]([^'"`]+)['"`]/;

const getErrorMessage = (error) =>
  error instanceof Error ? error.message : String(error);

const isSamePath = (first, second) => {
  const left = path.resolve(first);
  const right = path.resolve(second);
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
};

const isPathInside = (parent, target) => {
  const relative = path.relative(path.resolve(parent), path.resolve(target));
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
};

const extractCommandId = (source) => COMMAND_ID_PATTERN.exec(source)?.[1]?.trim() || "";

const assertNoDangerousPath = (relativePath) => {
  if (
    relativePath === "node_modules" ||
    relativePath.startsWith("node_modules/") ||
    relativePath === COMPILED_PLUGIN_DIR ||
    relativePath.startsWith(`${COMPILED_PLUGIN_DIR}/`) ||
    relativePath.startsWith(".git/")
  ) {
    throw new Error(`禁止导入该路径：${relativePath}`);
  }
};

const getScriptTransforms = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (!SCRIPT_EXTENSIONS.has(ext)) throw new Error(`命令入口必须是脚本文件：${filePath}`);
  const transforms = [];
  if (ext === ".jsx" || ext === ".tsx") transforms.push("jsx");
  if (ext === ".ts" || ext === ".tsx") transforms.push("typescript");
  return transforms;
};

const getErrorLocation = (error) => {
  if (Number.isInteger(error?.loc?.line) && Number.isInteger(error?.loc?.column)) {
    return {
      line: error.loc.line,
      column: error.loc.column,
    };
  }
  const match = /\((\d+):(\d+)\)\s*$/.exec(getErrorMessage(error));
  if (!match) return null;
  return {
    line: Number(match[1]),
    column: Number(match[2]),
  };
};

const createSourceFrame = (source, location) => {
  if (!location?.line) return "";
  const lines = String(source || "").split(/\r?\n/);
  const lineNumber = Math.max(1, Math.min(location.line, lines.length || 1));
  const start = Math.max(1, lineNumber - SOURCE_FRAME_RADIUS);
  const end = Math.min(lines.length, lineNumber + SOURCE_FRAME_RADIUS);
  const labelWidth = String(end).length;
  const output = [];

  for (let current = start; current <= end; current += 1) {
    const marker = current === lineNumber ? ">" : " ";
    const label = String(current).padStart(labelWidth, " ");
    const text = lines[current - 1] ?? "";
    output.push(`${marker} ${label} | ${text}`);
    if (current === lineNumber) {
      output.push(`  ${" ".repeat(labelWidth)} | ${" ".repeat(Math.max(0, location.column))}^`);
    }
  }

  return output.join("\n");
};

const formatSourceError = ({ error, filePath, source }) => {
  const location = getErrorLocation(error);
  const message = getErrorMessage(error);
  if (!location) return `${filePath}: ${message}`;

  return [
    `${filePath}:${location.line}:${location.column} ${message}`,
    "附近源码：",
    createSourceFrame(source, location),
  ]
    .filter(Boolean)
    .join("\n");
};

const transformSource = ({ source, filePath, transforms }) => {
  try {
    transform(source, {
      transforms,
      production: true,
    });
  } catch (error) {
    throw new Error(formatSourceError({ error, filePath, source }));
  }
};

const validateScriptSource = ({ source, filePath, requireConfig }) => {
  transformSource({
    source,
    filePath,
    transforms: getScriptTransforms(filePath),
  });

  if (!requireConfig) return "";
  const configId = extractCommandId(source);
  if (!configId) throw new Error(`缺少 export const config.id：${filePath}`);
  return configId;
};

const readSourcePath = (sourcePath) => {
  const value = String(sourcePath || "").trim();
  if (!value) throw new Error("缺少 sourcePath");
  if (!path.isAbsolute(value)) throw new Error("sourcePath 必须是绝对路径");
  return path.resolve(value);
};

const readSingleFileSource = async (sourcePath) => {
  const stat = await fileLock.stat(sourcePath);
  if (!stat.isFile()) throw new Error(`sourcePath 不是文件：${sourcePath}`);
  if (stat.size > MAX_FILE_SIZE) throw new Error(`文件过大：${sourcePath}`);

  const ext = path.extname(sourcePath).toLowerCase();
  if (!SINGLE_FILE_EXTENSIONS.has(ext)) {
    throw new Error(`单文件命令只支持 .js、.jsx 或 .mjs：${sourcePath}`);
  }

  const content = await fileLock.readText(sourcePath);
  if (!content.trim()) throw new Error(`文件内容为空：${sourcePath}`);
  const configId = validateScriptSource({
    source: content,
    filePath: path.basename(sourcePath),
    requireConfig: true,
  });

  return {
    content,
    configId,
    fileName: `${sanitizeCommandName(configId)}${ext || ".jsx"}`,
  };
};

const readFolderFiles = async (sourceDir, currentDir = sourceDir) => {
  const entries = await fileLock.readdir(currentDir);
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = normalizeRelativePath(
      path.relative(sourceDir, absolutePath).replace(/\\/g, "/"),
    );
    assertNoDangerousPath(relativePath);

    if (entry.isDirectory()) {
      files.push(...(await readFolderFiles(sourceDir, absolutePath)));
      continue;
    }
    if (!entry.isFile()) continue;

    const stat = await fileLock.stat(absolutePath);
    if (stat.size > MAX_FILE_SIZE) throw new Error(`文件过大：${relativePath}`);
    const content = await fileLock.readText(absolutePath);
    if (!content.trim()) throw new Error(`文件内容为空：${relativePath}`);
    files.push({ relativePath, content });
  }

  return files;
};

const createFileMap = (files) => {
  const fileMap = new Map();
  for (const file of files) {
    if (fileMap.has(file.relativePath)) throw new Error(`文件重复：${file.relativePath}`);
    fileMap.set(file.relativePath, file);
  }
  return fileMap;
};

const readFolderManifest = (fileMap) => {
  const packageFile = fileMap.get("package.json");
  if (!packageFile) throw new Error("缺少 package.json");
  try {
    const manifest = JSON.parse(packageFile.content);
    if (!manifest?.lookback?.id) throw new Error("package.json 缺少 lookback.id");
    if (!manifest?.lookback?.ui) throw new Error("package.json 缺少 lookback.ui");
    return manifest;
  } catch (error) {
    throw new Error(`package.json 解析失败：${getErrorMessage(error)}`);
  }
};

const validateFolderEntry = ({ fileMap, entry, requireConfig }) => {
  const relativePath = normalizeRelativePath(entry);
  const file = fileMap.get(relativePath);
  if (!file) throw new Error(`入口文件不存在：${relativePath}`);
  const configId = validateScriptSource({
    source: file.content,
    filePath: relativePath,
    requireConfig,
  });
  return { relativePath, configId };
};

const readFolderSource = async (sourcePath) => {
  const stat = await fileLock.stat(sourcePath);
  if (!stat.isDirectory()) throw new Error(`sourcePath 不是文件夹：${sourcePath}`);

  const files = await readFolderFiles(sourcePath);
  if (files.length === 0) throw new Error("命令文件夹为空");
  const fileMap = createFileMap(files);
  const manifest = readFolderManifest(fileMap);
  const pluginId = sanitizeCommandName(String(manifest.lookback.id).trim());
  if (String(manifest.lookback.id).trim() !== pluginId) {
    throw new Error(`lookback.id 不合法：${manifest.lookback.id}`);
  }

  const ui = validateFolderEntry({
    fileMap,
    entry: manifest.lookback.ui,
    requireConfig: true,
  });
  if (ui.configId !== pluginId) {
    throw new Error(`config.id 与 lookback.id 不一致：${ui.configId} !== ${pluginId}`);
  }

  const serverEntry = String(manifest.lookback.server || "").trim();
  const server = serverEntry
    ? validateFolderEntry({ fileMap, entry: serverEntry, requireConfig: false })
    : null;

  return {
    files,
    pluginId,
    folderName: pluginId,
    entry: ui.relativePath,
    serverEntry: server?.relativePath,
  };
};

const copySingleFileCommand = async ({ commandDir, sourcePath, source, overwrite }) => {
  const destPath = assertInside(commandDir, path.join(commandDir, source.fileName));
  const overwritten = await fileLock.pathExists(destPath);
  if (!overwrite && overwritten) {
    throw new Error(`命令已存在：${source.fileName}`);
  }
  if (!isSamePath(sourcePath, destPath)) {
    await fileLock.writeText(destPath, source.content);
  }
  return {
    target: source.fileName,
    path: destPath,
    dirtyCommand: overwritten
      ? {
          folder: ROOT_FOLDER,
          entry: source.fileName,
          id: source.configId,
        }
      : null,
  };
};

const copyFolderCommand = async ({ commandDir, sourcePath, source, overwrite }) => {
  const destDir = assertInside(commandDir, path.join(commandDir, source.folderName));
  const overwritten = await fileLock.pathExists(destDir);
  if (!overwrite && overwritten) {
    throw new Error(`命令目录已存在：${source.folderName}`);
  }
  if (isSamePath(sourcePath, destDir)) {
    return {
      target: source.folderName,
      path: destDir,
      dirtyCommand: overwritten
        ? {
            folder: source.folderName,
            entry: source.entry,
            id: source.pluginId,
          }
        : null,
    };
  }

  const tempDir = assertInside(
    commandDir,
    path.join(commandDir, `.tmp-import-${source.folderName}-${Date.now()}`),
  );
  try {
    await fileLock.ensureDir(tempDir);
    for (const file of source.files) {
      const destPath = toCommandPath(tempDir, file.relativePath);
      await fileLock.writeText(destPath, file.content);
    }
    if (await fileLock.pathExists(destDir)) await fileLock.remove(destDir);
    await fs.rename(tempDir, destDir);
  } catch (error) {
    await fileLock.remove(tempDir).catch(() => undefined);
    throw error;
  }
  return {
    target: source.folderName,
    path: destDir,
    dirtyCommand: overwritten
      ? {
          folder: source.folderName,
          entry: source.entry,
          id: source.pluginId,
        }
      : null,
  };
};

const cleanupImportedSource = async ({ sourcePath, importedPath }) => {
  if (isSamePath(sourcePath, importedPath)) return false;
  if (isPathInside(sourcePath, importedPath)) return false;
  await fileLock.remove(sourcePath);
  return true;
};

export const createImportPluginTool = (runtime) => ({
  name: "import_plugin",
  label: "导入插件",
  description: [
    "导入已经由 shell 生成到磁盘上的 LookBack 外部命令，只接收文件或文件夹的绝对路径。",
    "单文件命令传入 .js、.jsx 或 .mjs 文件；文件夹命令传入包含 package.json 的文件夹。",
    "导入成功后会删除源文件或源文件夹，源路径已经是最终 commands 目标时不会删除。",
  ].join(" "),
  parameters: Type.Object({
    sourcePath: Type.String({ description: "待导入命令文件或命令文件夹的绝对路径" }),
    overwrite: Type.Optional(Type.Boolean({ description: "是否覆盖已存在命令，默认 false" })),
  }),
  executionMode: "sequential",
  execute: async (_toolCallId, params) => {
    const sourcePath = readSourcePath(params.sourcePath);
    const stat = await fileLock.stat(sourcePath);
    const overwrite = params.overwrite === true;

    const mode = stat.isDirectory() ? "folder" : "single-file";
    const source = stat.isDirectory()
      ? await readFolderSource(sourcePath)
      : await readSingleFileSource(sourcePath);
    const imported = stat.isDirectory()
      ? await copyFolderCommand({
          commandDir: runtime.commandDir,
          sourcePath,
          source,
          overwrite,
        })
      : await copySingleFileCommand({
          commandDir: runtime.commandDir,
          sourcePath,
          source,
          overwrite,
        });
    const sourceCleaned = await cleanupImportedSource({
      sourcePath,
      importedPath: imported.path,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              imported: true,
              mode,
              target: imported.target,
              sourceCleaned,
            },
            null,
            2,
          ),
        },
      ],
      details: {
        importedPlugin: {
          mode,
          target: imported.target,
          dirtyCommand: imported.dirtyCommand,
          sourceCleaned,
        },
      },
    };
  },
});
