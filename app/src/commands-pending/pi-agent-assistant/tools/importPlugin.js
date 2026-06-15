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
const COMMAND_ID_PATTERN =
  /export\s+const\s+config\s*=\s*{[\s\S]*?\bid\s*:\s*['"`]([^'"`]+)['"`]/;

const getScriptTransforms = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (!SCRIPT_EXTENSIONS.has(ext)) throw new Error(`命令入口必须是脚本文件：${filePath}`);
  const transforms = [];
  if (ext === ".jsx" || ext === ".tsx") transforms.push("jsx");
  if (ext === ".ts" || ext === ".tsx") transforms.push("typescript");
  return transforms;
};

const getErrorMessage = (error) =>
  error instanceof Error ? error.message : String(error);

const extractCommandId = (source) => COMMAND_ID_PATTERN.exec(source)?.[1]?.trim() || "";

const validateFolderScriptSource = ({ source, filePath, requireConfig }) => {
  transform(source, {
    transforms: getScriptTransforms(filePath),
    production: true,
  });

  if (!requireConfig) return null;
  const configId = extractCommandId(source);
  if (!configId) throw new Error(`缺少 export const config.id：${filePath}`);
  return configId;
};

const validateSingleFileSource = ({ source, filePath }) => {
  const ext = path.extname(filePath).toLowerCase();
  if (!SINGLE_FILE_EXTENSIONS.has(ext)) {
    throw new Error(`单文件命令只支持 .js、.jsx 或 .mjs：${filePath}`);
  }
  transform(source, {
    transforms: ["jsx"],
    production: true,
  });

  const configId = extractCommandId(source);
  if (!configId) throw new Error(`缺少 export const config.id：${filePath}`);
  return configId;
};

const validateSingleFileCommand = ({ target, pluginId, files }) => {
  if (files.length !== 1) throw new Error("单文件命令只能写入一个文件");
  const [file] = files;
  const configId = validateSingleFileSource({
    source: file.content,
    filePath: file.relativePath,
  });
  if (configId !== pluginId) {
    throw new Error(`config.id 与命令 ID 不一致：${configId} !== ${pluginId}`);
  }
  return {
    valid: true,
    target,
    entry: target,
    configId,
  };
};

const createFileMap = (files) => {
  const fileMap = new Map();
  for (const file of files) {
    assertNoDangerousPath(file.relativePath);
    if (fileMap.has(file.relativePath)) throw new Error(`文件重复：${file.relativePath}`);
    fileMap.set(file.relativePath, file);
  }
  return fileMap;
};

const readFolderManifest = (fileMap) => {
  const packageFile = fileMap.get("package.json");
  if (!packageFile) throw new Error("缺少 package.json");
  let manifest;
  try {
    manifest = JSON.parse(packageFile.content);
  } catch (error) {
    throw new Error(`package.json 解析失败：${getErrorMessage(error)}`);
  }
  if (!manifest?.lookback?.id) throw new Error("package.json 缺少 lookback.id");
  if (!manifest?.lookback?.ui) throw new Error("package.json 缺少 lookback.ui");
  return manifest;
};

const validateFolderEntry = ({ fileMap, entry, requireConfig }) => {
  const relativePath = normalizeRelativePath(entry);
  const file = fileMap.get(relativePath);
  if (!file) throw new Error(`入口文件不存在：${relativePath}`);
  const configId = validateFolderScriptSource({
    source: file.content,
    filePath: relativePath,
    requireConfig,
  });
  return { relativePath, configId };
};

const validateFolderCommand = ({ target, pluginId, files }) => {
  const fileMap = createFileMap(files);
  const manifest = readFolderManifest(fileMap);
  const manifestId = String(manifest.lookback.id).trim();
  if (manifestId !== pluginId) {
    throw new Error(`lookback.id 与命令 ID 不一致：${manifestId} !== ${pluginId}`);
  }

  const ui = validateFolderEntry({
    fileMap,
    entry: manifest.lookback.ui,
    requireConfig: true,
  });
  if (ui.configId !== pluginId) {
    throw new Error(`config.id 与命令 ID 不一致：${ui.configId} !== ${pluginId}`);
  }

  const serverEntry = String(manifest.lookback.server || "").trim();
  const server = serverEntry
    ? validateFolderEntry({ fileMap, entry: serverEntry, requireConfig: false })
    : null;

  return {
    valid: true,
    target,
    entry: ui.relativePath,
    serverEntry: server?.relativePath,
    configId: ui.configId,
  };
};

const validateGeneratedCommand = ({ target, mode, pluginId, files }) => {
  try {
    return mode === "folder"
      ? validateFolderCommand({ target, pluginId, files })
      : validateSingleFileCommand({ target, pluginId, files });
  } catch (error) {
    throw new Error(`插件验证失败：${getErrorMessage(error)}`);
  }
};

const normalizeFile = (file) => {
  const relativePath = normalizeRelativePath(file?.relativePath);
  const content = String(file?.content ?? "");
  if (!content.trim()) throw new Error(`文件内容为空：${relativePath}`);
  if (content.length > MAX_FILE_SIZE) throw new Error(`文件过大：${relativePath}`);
  return { relativePath, content };
};

const assertNoDangerousPath = (relativePath) => {
  if (
    relativePath === "node_modules" ||
    relativePath.startsWith("node_modules/") ||
    relativePath.startsWith(".git/")
  ) {
    throw new Error(`禁止写入该路径：${relativePath}`);
  }
};

const writeSingleFileCommand = async ({ commandDir, pluginId, files, overwrite }) => {
  if (files.length !== 1) throw new Error("单文件命令只能写入一个文件");
  const [file] = files;
  const fileName = `${sanitizeCommandName(pluginId)}${path.extname(file.relativePath) || ".jsx"}`;
  const destPath = assertInside(commandDir, path.join(commandDir, fileName));
  if (!overwrite && (await fileLock.pathExists(destPath))) {
    throw new Error(`命令已存在：${fileName}`);
  }
  await fileLock.writeText(destPath, file.content);
  return { target: fileName, path: destPath };
};

const ensureFolderManifest = (pluginId, files) => {
  if (files.some((file) => file.relativePath === "package.json")) return files;
  return [
    {
      relativePath: "package.json",
      content: `${JSON.stringify(
        {
          name: sanitizeCommandName(pluginId),
          version: "1.0.0",
          private: true,
          type: "module",
          lookback: {
            id: pluginId,
            ui: "index.jsx",
          },
        },
        null,
        2,
      )}\n`,
    },
    ...files,
  ];
};

const writeFolderCommand = async ({ commandDir, pluginId, files, overwrite }) => {
  const folderName = sanitizeCommandName(pluginId);
  const folderPath = assertInside(commandDir, path.join(commandDir, folderName));
  if (!overwrite && (await fileLock.pathExists(folderPath))) {
    throw new Error(`命令目录已存在：${folderName}`);
  }
  await fileLock.ensureDir(folderPath);
  const nextFiles = ensureFolderManifest(pluginId, files);
  for (const file of nextFiles) {
    assertNoDangerousPath(file.relativePath);
    const destPath = toCommandPath(folderPath, file.relativePath);
    await fileLock.writeText(destPath, file.content);
  }
  return { target: folderName, path: folderPath };
};

export const createImportPluginTool = (runtime) => ({
  name: "import_plugin",
  label: "导入插件",
  description: [
    "导入已经生成好的 LookBack 外部命令文件，并在写入后立即验证入口、manifest 和源码语法。",
    "默认导入单文件；只有需要 Node 依赖、server 能力或多文件维护价值明确时才导入 folder，并提供 package.json、index.jsx、server.js 等完整文件。",
    "写入目标必须以 commandDir 为准，不要猜测或硬编码 commands 目录。",
  ].join(" "),
  parameters: Type.Object({
    pluginId: Type.String({ description: "命令 ID，使用驼峰或短横线命名" }),
    mode: Type.String({ description: "single-file 或 folder。默认选择 single-file；仅在需要依赖、server 或多文件结构时选择 folder" }),
    overwrite: Type.Optional(Type.Boolean({ description: "是否覆盖已存在命令，默认 false" })),
    files: Type.Array(
      Type.Object({
        relativePath: Type.String({ description: "相对路径，例如 index.jsx 或 tools/search.js" }),
        content: Type.String({ description: "完整源码内容" }),
      }),
      { minItems: 1 },
    ),
  }),
  executionMode: "sequential",
  execute: async (_toolCallId, params) => {
    const pluginId = sanitizeCommandName(params.pluginId);
    const mode = params.mode === "folder" ? "folder" : "single-file";
    const rawFiles = params.files.map(normalizeFile);
    const files = mode === "folder" ? ensureFolderManifest(pluginId, rawFiles) : rawFiles;
    const target =
      mode === "folder"
        ? sanitizeCommandName(pluginId)
        : `${sanitizeCommandName(pluginId)}${path.extname(files[0]?.relativePath || "") || ".jsx"}`;
    const validation = validateGeneratedCommand({
      target,
      mode,
      pluginId,
      files,
    });
    const imported =
      mode === "folder"
        ? await writeFolderCommand({
            commandDir: runtime.commandDir,
            pluginId,
            files,
            overwrite: params.overwrite === true,
          })
        : await writeSingleFileCommand({
            commandDir: runtime.commandDir,
            pluginId,
            files,
            overwrite: params.overwrite === true,
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
              validation,
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
        },
      },
    };
  },
});
