import os from "node:os";
import path from "node:path";

const getDefaultShell = () => {
  if (process.platform === "win32") return "powershell";
  return process.env.SHELL || "sh";
};

const getShellPromptRules = (systemInfo) => {
  if (systemInfo.platform === "win32") {
    return [
      "- 当前 Windows 环境中 shell 固定运行 Windows PowerShell 5.1：直接编写 PowerShell 5.1 语句，不要再包一层 powershell -Command。",
      "- Windows PowerShell 5.1 不支持 && 和 ||；必须用分号分隔语句，用 if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } 显式处理中断。",
      "- Windows 中优先使用 PowerShell 原生命令和 .NET API；需要调用外部程序时使用 curl.exe、node.exe 等明确可执行名。",
      "- 需要运行 node -e 时，外层仍是 PowerShell 5.1 语法，注意引号和语句分隔规则。",
    ];
  }

  return [];
};

export const createSystemInfo = (context) => {
  const currentWorkingDirectory = process.cwd();
  const storageDir = String(context?.storageDir || "");
  const commandDir = String(context?.commandDir || "");
  const pluginDir = String(context?.pluginDir || "");
  return {
    platform: process.platform,
    osType: os.type(),
    osRelease: os.release(),
    arch: process.arch,
    nodeVersion: process.version,
    defaultShell: getDefaultShell(),
    pathSeparator: path.sep,
    currentWorkingDirectory,
    storageDir,
    commandDir,
    pluginDir,
  };
};

export const formatSystemInfoForPrompt = (systemInfo) =>
  [
    "运行系统信息：",
    `- platform: ${systemInfo.platform}`,
    `- os: ${systemInfo.osType} ${systemInfo.osRelease} ${systemInfo.arch}`,
    `- node: ${systemInfo.nodeVersion}`,
    `- defaultShell: ${systemInfo.defaultShell}`,
    `- pathSeparator: ${systemInfo.pathSeparator}`,
    `- currentWorkingDirectory: ${systemInfo.currentWorkingDirectory}`,
    `- storageDir: ${systemInfo.storageDir}`,
    `- commandDir: ${systemInfo.commandDir}`,
    `- pluginDir: ${systemInfo.pluginDir}`,
    "- shell 工具的 command 参数接收完整 shell 命令字符串，默认工作目录由 currentWorkingDirectory 指定。",
    "- 涉及 LookBack 外部命令写入、验证、查找时使用 commandDir / pluginDir，不要猜路径。",
    "- 生成外部命令时先用 shell 写入临时文件或文件夹，再把绝对路径交给 import_plugin；import_plugin 导入成功后会清理临时源路径。",
    ...getShellPromptRules(systemInfo),
  ].join("\n");

export const formatSystemInfoForToolDescription = (systemInfo) =>
  [
    `platform=${systemInfo.platform}`,
    `node=${systemInfo.nodeVersion}`,
    `defaultShell=${systemInfo.defaultShell}`,
    `currentWorkingDirectory=${systemInfo.currentWorkingDirectory}`,
    `commandDir=${systemInfo.commandDir}`,
    `pluginDir=${systemInfo.pluginDir}`,
  ].join("; ");
