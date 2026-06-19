import path from "node:path";
import { Type } from "@earendil-works/pi-ai";
import { transform } from "sucrase";
import {
  assertInside,
  fileLock,
  sanitizeCommandName,
} from "../storage.js";

const MAX_FILE_SIZE = 1024 * 1024;
const COMMAND_FILE_EXTENSION = ".jsx";
const SOURCE_FRAME_RADIUS = 3;
const ROOT_FOLDER = "__root__";
const SCRIPT_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const SKIPPED_PLUGIN_DIRS = new Set(["node_modules", ".lookback-esm", ".lookback-cjs", ".git"]);
const COMMAND_CONFIG_PATTERN = /export\s+const\s+config\s*=\s*{([\s\S]*?)^\s*};/m;
const COMMAND_ID_PROPERTY_PATTERN =
  /\bid\s*:\s*(?:['"`]([^'"`${}]+)['"`]|([A-Za-z_$][\w$]*))/;
const STRING_CONST_PATTERN = (name) =>
  new RegExp(
    "\\bconst\\s+" +
      name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
      "\\s*=\\s*['\"`]([^'\"`${}]+)['\"`]",
  );

const getErrorMessage = (error) =>
  error instanceof Error ? error.message : String(error);

const isSamePath = (first, second) => {
  const left = path.resolve(first);
  const right = path.resolve(second);
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
};

const extractCommandId = (source) => {
  const configBody = COMMAND_CONFIG_PATTERN.exec(source)?.[1] || "";
  const match = COMMAND_ID_PROPERTY_PATTERN.exec(configBody);
  if (!match) return "";
  if (match[1]) return match[1].trim();

  const identifier = match[2];
  if (!identifier) return "";
  return STRING_CONST_PATTERN(identifier).exec(source)?.[1]?.trim() || "";
};

const isScriptFile = (filePath) =>
  SCRIPT_EXTENSIONS.has(path.extname(filePath).toLowerCase());

const readTextOptional = async (filePath) => {
  try {
    return await fileLock.readText(filePath);
  } catch {
    return "";
  }
};

const readJsonOptional = async (filePath) => {
  try {
    return await fileLock.readJson(filePath);
  } catch {
    return null;
  }
};

const readScriptCommandId = async (filePath) => {
  const source = await readTextOptional(filePath);
  return source ? extractCommandId(source) : "";
};

const readDirectoryCommandId = async (dirPath) => {
  const manifest = await readJsonOptional(path.join(dirPath, "package.json"));
  const manifestId = String(manifest?.lookback?.id || "").trim();
  return manifestId;
};

const readExistingCommandIds = async (commandDir) => {
  const entries = await fileLock.readdir(commandDir).catch(() => []);
  const ids = [];

  for (const entry of entries) {
    const entryPath = assertInside(commandDir, path.join(commandDir, entry.name));
    if (entry.isFile() && isScriptFile(entryPath)) {
      const id = await readScriptCommandId(entryPath);
      if (id) ids.push(id);
      continue;
    }

    if (!entry.isDirectory() || SKIPPED_PLUGIN_DIRS.has(entry.name)) continue;
    const id = await readDirectoryCommandId(entryPath);
    if (id) ids.push(id);
  }

  return ids;
};

const assertNoExistingCommandId = async ({ commandDir, configId }) => {
  const existingIds = await readExistingCommandIds(commandDir);
  if (!existingIds.includes(configId)) return;
  throw new Error(`命令 ID 已存在：${configId}`);
};

const assertJsxCommandFile = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== COMMAND_FILE_EXTENSION) {
    throw new Error(`Ira 只支持导入单个 .jsx 命令文件：${filePath}`);
  }
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

const validateScriptSource = ({ source, filePath }) => {
  transformSource({
    source,
    filePath,
    transforms: ["jsx"],
  });

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

const readSingleFileSource = async (sourcePath, stat) => {
  if (!stat.isFile()) throw new Error(`sourcePath 不是文件：${sourcePath}`);
  if (stat.size > MAX_FILE_SIZE) throw new Error(`文件过大：${sourcePath}`);
  assertJsxCommandFile(sourcePath);

  const content = await fileLock.readText(sourcePath);
  if (!content.trim()) throw new Error(`文件内容为空：${sourcePath}`);
  const configId = validateScriptSource({
    source: content,
    filePath: path.basename(sourcePath),
  });

  return {
    content,
    configId,
    fileName: `${sanitizeCommandName(configId)}${COMMAND_FILE_EXTENSION}`,
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

const cleanupImportedSource = async ({ sourcePath, importedPath }) => {
  if (isSamePath(sourcePath, importedPath)) return false;
  await fileLock.remove(sourcePath);
  return true;
};

export const createImportPluginTool = (runtime) => ({
  name: "import_plugin",
  label: "导入 JSX 插件",
  description: [
    "导入已经由 shell 生成到磁盘上的 LookBack 外部命令，只接收单个 .jsx 文件的绝对路径。",
    "不支持文件夹命令、package.json、server 入口或 .js/.mjs/.ts/.tsx 文件。",
    "导入成功后会删除源 .jsx 文件，源路径已经是最终 commands 目标时不会删除。",
  ].join(" "),
  parameters: Type.Object({
    sourcePath: Type.String({ description: "待导入单个 .jsx 命令文件的绝对路径" }),
    overwrite: Type.Optional(Type.Boolean({ description: "是否覆盖已存在命令，默认 false" })),
  }),
  executionMode: "sequential",
  execute: async (_toolCallId, params) => {
    const sourcePath = readSourcePath(params.sourcePath);
    const stat = await fileLock.stat(sourcePath);
    const overwrite = params.overwrite === true;

    if (stat.isDirectory()) throw new Error("Ira 只支持导入单个 .jsx 文件，不支持文件夹命令");

    const source = await readSingleFileSource(sourcePath, stat);
    if (!overwrite) {
      await assertNoExistingCommandId({
        commandDir: runtime.commandDir,
        configId: source.configId,
      });
    }
    const imported = await copySingleFileCommand({
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
              mode: "single-jsx-file",
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
          mode: "single-jsx-file",
          target: imported.target,
          dirtyCommand: imported.dirtyCommand,
          sourceCleaned,
        },
      },
    };
  },
});
