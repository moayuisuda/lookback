import os from "node:os";
import path from "node:path";

const getDefaultShell = () => {
  if (process.platform === "win32") return "powershell";
  return process.env.SHELL || "sh";
};

export const createSystemInfo = (context) => {
  const cwd = process.cwd();
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
    cwd,
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
    `- cwd: ${systemInfo.cwd}`,
    `- storageDir: ${systemInfo.storageDir}`,
    `- commandDir: ${systemInfo.commandDir}`,
    `- pluginDir: ${systemInfo.pluginDir}`,
    "- shell 默认工作目录使用 cwd；涉及 LookBack 外部命令写入、验证、查找时使用 commandDir / pluginDir，不要猜路径。",
    "- Windows 环境优先使用 powershell -NoProfile -Command 承载多步脚本；跨平台脚本优先使用 node -e。",
  ].join("\n");

export const formatSystemInfoForToolDescription = (systemInfo) =>
  [
    `platform=${systemInfo.platform}`,
    `node=${systemInfo.nodeVersion}`,
    `defaultShell=${systemInfo.defaultShell}`,
    `cwd=${systemInfo.cwd}`,
    `commandDir=${systemInfo.commandDir}`,
    `pluginDir=${systemInfo.pluginDir}`,
  ].join("; ");
