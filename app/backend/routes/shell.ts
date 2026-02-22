import path from "path";
import express from "express";
import { spawn } from "node:child_process";
import { timingSafeEqual } from "node:crypto";

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_TIMEOUT_MS = 120000;
const MAX_OUTPUT_LENGTH = 1024 * 1024;
const SHELL_AUTH_HEADER = "x-lookback-token";

type ShellRequestBody = {
  command?: unknown;
  args?: unknown;
  cwd?: unknown;
  timeoutMs?: unknown;
};

type ShellRouteDeps = {
  getApiAuthToken: () => string;
};

type ShellRunResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

const sanitizeCommand = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes("\0")) return null;
  return trimmed;
};

const sanitizeArgs = (value: unknown): string[] | null => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const args: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    if (item.includes("\0")) return null;
    args.push(item);
  }
  return args;
};

const sanitizeCwd = (value: unknown): string | null => {
  if (value === undefined) return process.cwd();
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return process.cwd();
  if (trimmed.includes("\0")) return null;
  return path.resolve(trimmed);
};

const sanitizeTimeoutMs = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_TIMEOUT_MS;
  }
  if (value <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.floor(value));
};

const appendChunk = (current: string, chunk: Buffer): string => {
  if (current.length >= MAX_OUTPUT_LENGTH) return current;
  const remain = MAX_OUTPUT_LENGTH - current.length;
  return current + chunk.toString("utf8", 0, remain);
};

const isAuthorized = (actual: string, expected: string): boolean => {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
};

const runShellCommand = (
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<ShellRunResult> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      shell: false,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const settle = (result: ShellRunResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!settled) {
          child.kill("SIGKILL");
        }
      }, 1000);
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = appendChunk(stdout, chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = appendChunk(stderr, chunk);
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      settle({ code, signal, stdout, stderr, timedOut });
    });
  });

export const createShellRouter = (deps: ShellRouteDeps) => {
  const router = express.Router();

  router.post("/api/shell", async (req, res) => {
    const authHeader = req.get(SHELL_AUTH_HEADER) || "";
    const expectedToken = deps.getApiAuthToken();
    if (!isAuthorized(authHeader, expectedToken)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const body = (req.body ?? {}) as ShellRequestBody;
    const command = sanitizeCommand(body.command);
    const args = sanitizeArgs(body.args);
    const cwd = sanitizeCwd(body.cwd);
    const timeoutMs = sanitizeTimeoutMs(body.timeoutMs);

    if (!command) {
      res.status(400).json({ error: "Invalid command" });
      return;
    }
    if (!args) {
      res.status(400).json({ error: "Invalid args" });
      return;
    }
    if (!cwd) {
      res.status(400).json({ error: "Invalid cwd" });
      return;
    }

    try {
      const result = await runShellCommand(command, args, cwd, timeoutMs);
      const success = result.code === 0 && !result.timedOut;
      const error = result.timedOut
        ? "Command timed out"
        : success
          ? null
          : result.stderr.trim() || `Command exited with code ${result.code ?? "null"}`;

      res.json({
        success,
        code: result.code,
        signal: result.signal,
        stdout: result.stdout,
        stderr: result.stderr,
        timedOut: result.timedOut,
        error,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        success: false,
        code: null,
        signal: null,
        stdout: "",
        stderr: "",
        timedOut: false,
        error: message,
      });
    }
  });

  return router;
};
