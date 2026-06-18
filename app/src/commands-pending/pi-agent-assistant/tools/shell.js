import { spawn } from "node:child_process";
import { Type } from "@earendil-works/pi-ai";
import { formatSystemInfoForToolDescription } from "../systemInfo.js";

const MAX_OUTPUT_CHARS = 24000;
const MAX_OUTPUT_BYTES = MAX_OUTPUT_CHARS * 4;
const DEFAULT_TIMEOUT_MS = 60000;

const truncate = (value) => {
  const text = String(value || "");
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  return `${text.slice(0, MAX_OUTPUT_CHARS)}\n...[输出已截断]`;
};

const decodeOutput = (output) => {
  const text = new TextDecoder("utf-8").decode(Buffer.concat(output.chunks));
  return truncate(text);
};

const createBufferedOutput = () => ({
  chunks: [],
  totalBytes: 0,
});

const appendChunk = (output, chunk) => {
  output.chunks.push(chunk);
  output.totalBytes += chunk.length;
  while (output.totalBytes > MAX_OUTPUT_BYTES && output.chunks.length > 1) {
    output.totalBytes -= output.chunks.shift().length;
  }
};

const createShellProcess = (script) => {
  if (process.platform !== "win32") {
    return {
      command: "sh",
      args: ["-lc", script],
    };
  }

  const utf8Bootstrap = [
    "[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)",
    "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
    "$OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
    "$PSDefaultParameterValues['Get-Content:Encoding'] = 'UTF8'",
    "$PSDefaultParameterValues['Set-Content:Encoding'] = 'UTF8'",
    "$PSDefaultParameterValues['Add-Content:Encoding'] = 'UTF8'",
    "$PSDefaultParameterValues['Out-File:Encoding'] = 'UTF8'",
    "$PSDefaultParameterValues['Export-Csv:Encoding'] = 'UTF8'",
    "chcp.com 65001 > $null",
  ].join("; ");

  return {
    command: "powershell.exe",
    args: [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `${utf8Bootstrap}; ${script}`,
    ],
  };
};

const getShellDescriptionRules = () => {
  if (process.platform === "win32") {
    return [
      "当前环境固定使用 Windows PowerShell 5.1 并设置 UTF-8 输出。",
      "Windows 命令必须是 PowerShell 5.1 语法：不要使用 &&、||、bash/cmd 语法；用分号分隔语句，用 $LASTEXITCODE 显式处理失败。",
    ];
  }

  return [
  ];
};

const runShell = ({ command, workingDirectory, timeoutMs = DEFAULT_TIMEOUT_MS }, runtime) => {
  const script = String(command || "").trim();
  const defaultCwd = runtime?.systemInfo?.currentWorkingDirectory || "";
  if (!script) throw new Error("缺少命令");

  return new Promise((resolve) => {
    const shellProcess = createShellProcess(script);
    const child = spawn(shellProcess.command, shellProcess.args, {
      cwd: String(workingDirectory || defaultCwd || "").trim() || undefined,
      shell: false,
      windowsHide: true,
    });
    const stdout = createBufferedOutput();
    const stderr = createBufferedOutput();
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      child.kill();
      resolve({
        success: false,
        code: null,
        signal: "timeout",
        timedOut: true,
        stdout: decodeOutput(stdout),
        stderr: decodeOutput(stderr),
      });
    }, Number(timeoutMs) || DEFAULT_TIMEOUT_MS);

    child.stdout?.on("data", (chunk) => {
      appendChunk(stdout, chunk);
    });
    child.stderr?.on("data", (chunk) => {
      appendChunk(stderr, chunk);
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
        stdout: decodeOutput(stdout),
        stderr: decodeOutput(stderr) || error.message,
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
        stdout: decodeOutput(stdout),
        stderr: decodeOutput(stderr),
      });
    });
  });
};

export const createShellTool = (runtime = {}) => ({
  name: "shell",
  label: "Shell",
  description: [
    "直接执行一整段 shell 命令字符串，可用于搜索、联网请求、文件处理、脚本执行和其他开放任务。",
    ...getShellDescriptionRules(),
    "需要写入命令时，直接生成 shell 脚本把单个 .jsx 文件写到临时路径，再把该文件路径交给 import_plugin。",
    `系统信息：${formatSystemInfoForToolDescription(runtime.systemInfo || {})}`,
  ].join(" "),
  parameters: Type.Object({
    command: Type.String({ description: "完整 shell 命令字符串" }),
    workingDirectory: Type.Optional(Type.String({ description: "可选工作目录；不传时使用环境信息里的 currentWorkingDirectory" })),
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
