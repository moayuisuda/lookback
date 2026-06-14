import { spawn } from "node:child_process";
import { Type } from "@earendil-works/pi-ai";
import { formatSystemInfoForToolDescription } from "../systemInfo.js";

const MAX_OUTPUT_CHARS = 24000;
const DEFAULT_TIMEOUT_MS = 60000;

const truncate = (value) => {
  const text = String(value || "");
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  return `${text.slice(0, MAX_OUTPUT_CHARS)}\n...[输出已截断]`;
};

const runShell = ({ command, args = [], cwd, timeoutMs = DEFAULT_TIMEOUT_MS }, runtime) => {
  const commandName = String(command || "").trim();
  const defaultCwd = runtime?.systemInfo?.cwd || "";
  if (!commandName) throw new Error("缺少命令");
  if (!Array.isArray(args) || args.some((item) => typeof item !== "string")) {
    throw new Error("args 必须是字符串数组");
  }

  return new Promise((resolve) => {
    const child = spawn(commandName, args, {
      cwd: String(cwd || defaultCwd || "").trim() || undefined,
      shell: false,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      child.kill();
      resolve({
        success: false,
        code: null,
        signal: "timeout",
        timedOut: true,
        stdout: truncate(stdout),
        stderr: truncate(stderr),
      });
    }, Number(timeoutMs) || DEFAULT_TIMEOUT_MS);

    child.stdout?.on("data", (chunk) => {
      stdout = truncate(`${stdout}${chunk.toString("utf8")}`);
    });
    child.stderr?.on("data", (chunk) => {
      stderr = truncate(`${stderr}${chunk.toString("utf8")}`);
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        success: false,
        code: null,
        signal: null,
        timedOut: false,
        stdout: truncate(stdout),
        stderr: truncate(stderr || error.message),
      });
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        success: code === 0,
        code,
        signal,
        timedOut: false,
        stdout: truncate(stdout),
        stderr: truncate(stderr),
      });
    });
  });
};

export const createShellTool = (runtime = {}) => ({
  name: "shell",
  label: "Shell",
  description: [
    "通用系统工具，可用于搜索、联网请求、文件处理、脚本执行和其他开放任务。",
    "直接执行程序时把参数放进 args 数组；需要管道、重定向或多步逻辑时，用 powershell -NoProfile -Command 或 node -e 承载脚本。",
    `系统信息：${formatSystemInfoForToolDescription(runtime.systemInfo || {})}`,
  ].join(" "),
  parameters: Type.Object({
    command: Type.String({ description: "可执行命令名，例如 rg、npm、node、powershell" }),
    args: Type.Optional(Type.Array(Type.String(), { description: "命令参数数组" })),
    cwd: Type.Optional(Type.String({ description: "工作目录" })),
    timeoutMs: Type.Optional(Type.Number({ description: "超时时间，毫秒" })),
  }),
  execute: async (_toolCallId, params) => {
    const result = await runShell(params, runtime);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      details: result,
    };
  },
});
