import { API_BASE_URL } from "./config";
import type { Locale } from "../shared/i18n/types";

const buildApiBaseUrl = (port: number): string => `http://localhost:${port}`;
const isValidPort = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 65535;

const getRuntimeApiBaseUrl = async (): Promise<string> => {
  if (!window.electron?.getServerPort) return API_BASE_URL;
  try {
    const port = await window.electron.getServerPort();
    if (isValidPort(port)) {
      return buildApiBaseUrl(port);
    }
  } catch {
    // Keep fallback when IPC is temporarily unavailable.
  }
  return API_BASE_URL;
};

const apiFetch = async (endpoint: string, init?: RequestInit): Promise<Response> => {
  const baseUrl = await getRuntimeApiBaseUrl();
  return fetch(`${baseUrl}${endpoint}`, init);
};

let apiAuthTokenCache: string | null = null;
const getApiAuthToken = async (): Promise<string> => {
  if (apiAuthTokenCache) return apiAuthTokenCache;
  if (!window.electron?.getApiAuthToken) return "";
  try {
    const token = await window.electron.getApiAuthToken();
    apiAuthTokenCache = typeof token === "string" ? token : "";
    return apiAuthTokenCache;
  } catch {
    return "";
  }
};

export interface settingStorageGetOptions<T> {
  key: string;
  fallback: T;
}

export type SettingsSnapshot = Record<string, unknown>;

export const getSettingsSnapshot = async (): Promise<SettingsSnapshot> => {
  try {
    const res = await apiFetch("/api/settings");
    if (!res.ok) return {};
    const data = (await res.json()) as unknown;
    if (data && typeof data === "object") {
      return data as SettingsSnapshot;
    }
  } catch {
    return {};
  }
  return {};
};

export const readSetting = <T>(
  settings: SettingsSnapshot,
  key: string,
  fallback: T
): T => {
  if (Object.prototype.hasOwnProperty.call(settings, key)) {
    return (settings as Record<string, unknown>)[key] as T;
  }
  return fallback;
};

export const settingStorage = {
  async get<T>({ key, fallback }: settingStorageGetOptions<T>): Promise<T> {
    try {
      const res = await apiFetch(`/api/settings/${encodeURIComponent(key)}`);
      if (!res.ok) return fallback;
      const data = (await res.json()) as unknown;
      if (!data || typeof data !== "object") return fallback;
      if (!("value" in data)) return fallback;
      const value = (data as { value: unknown }).value;
      return (value as T) ?? fallback;
    } catch {
      return fallback;
    }
  },

  async set<T>(key: string, value: T): Promise<void> {
    try {
      await apiFetch(`/api/settings/${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
    } catch (error) {
      void error;
    }
  },
};

const isLocale = (value: unknown): value is Locale => value === "en" || value === "zh";

export async function getLanguage(): Promise<Locale> {
  const settings = await getSettingsSnapshot();
  const raw = readSetting<unknown>(settings, "language", "en");
  return isLocale(raw) ? raw : "en";
}

export async function setLanguage(locale: Locale): Promise<void> {
  await settingStorage.set("language", locale);
}

export interface CanvasViewport {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

export async function loadCanvasImages<T = unknown[]>(canvasName?: string): Promise<T> {
  const endpoint = canvasName
    ? `/api/load-canvas?canvasName=${encodeURIComponent(canvasName)}`
    : "/api/load-canvas";
  const res = await apiFetch(endpoint);
  if (!res.ok) {
    throw new Error(`Failed to load canvas: ${res.status}`);
  }
  const data = (await res.json()) as unknown;
  return data as T;
}

export async function getCanvasViewport<T = unknown>(canvasName?: string): Promise<T | null> {
  const endpoint = canvasName
    ? `/api/canvas-viewport?canvasName=${encodeURIComponent(canvasName)}`
    : "/api/canvas-viewport";
  const res = await apiFetch(endpoint);
  if (!res.ok) {
    return null;
  }
  const data = (await res.json()) as unknown;
  if (data === null) return null;
  return data as T;
}

export async function saveCanvasViewport(
  viewport: CanvasViewport,
  canvasName?: string
): Promise<void> {
  try {
    await localApi<{ success?: boolean }>("/api/canvas-viewport", { viewport, canvasName });
  } catch (error) {
    void error;
  }
}

export interface CanvasMeta {
  name: string;
  lastModified: number;
}

export async function listCanvases(): Promise<CanvasMeta[]> {
  const res = await apiFetch("/api/canvases");
  if (!res.ok) throw new Error("Failed to list canvases");
  return res.json() as Promise<CanvasMeta[]>;
}

export async function createCanvas(name: string): Promise<void> {
  await localApi("/api/canvases", { name });
}

export async function renameCanvas(oldName: string, newName: string): Promise<void> {
  await localApi("/api/canvases/rename", { oldName, newName });
}

export async function deleteCanvas(name: string): Promise<void> {
  await localApi("/api/canvases/delete", { name });
}

export type UploadTempImageResponse = {
  success?: boolean;
  filename?: string;
  path?: string;
  width?: number;
  height?: number;
  dominantColor?: string | null;
  tone?: string | null;
};

export async function uploadTempImageBinary(
  file: File,
  canvasName?: string
): Promise<UploadTempImageResponse> {
  const params = new URLSearchParams();
  const fileName = file.name.trim();
  if (fileName) {
    params.set("filename", fileName);
  }
  const safeCanvasName = canvasName?.trim();
  if (safeCanvasName) {
    params.set("canvasName", safeCanvasName);
  }
  const endpoint = params.size > 0
    ? `/api/upload-temp?${params.toString()}`
    : "/api/upload-temp";
  const headers = file.type ? { "Content-Type": file.type } : undefined;
  const res = await apiFetch(endpoint, {
    method: "POST",
    headers,
    body: file,
  });
  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}`);
  }
  return (await res.json()) as UploadTempImageResponse;
}

export async function getTempDominantColor(
  filePath: string,
  canvasName?: string
): Promise<string | null> {
  try {
    const data = await localApi<{
      success?: boolean;
      dominantColor?: string | null;
    }>("/api/temp-dominant-color", {
      filePath,
      canvasName,
    });
    if (!data || data.success !== true) return null;
    if (typeof data.dominantColor !== "string") return null;
    const trimmed = data.dominantColor.trim();
    if (!trimmed) return null;
    return trimmed;
  } catch (error) {
    void error;
    return null;
  }
}

export async function deleteTempFile(
  filePath: string,
  canvasName?: string
): Promise<void> {
  try {
    await localApi<{ success?: boolean }>("/api/delete-temp-file", {
      filePath,
      canvasName,
    });
  } catch (error) {
    void error;
  }
}

export type ExternalCommandRecord = {
  folder: string;
  entry: string;
  id: string;
};

export async function loadExternalCommands(): Promise<ExternalCommandRecord[]> {
  try {
    const res = await apiFetch("/api/commands");
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return [];
    return data as ExternalCommandRecord[];
  } catch {
    return [];
  }
}

export async function loadCommandScript(
  folder: string,
  entry?: string
): Promise<string> {
  const params = entry ? `?entry=${encodeURIComponent(entry)}` : "";
  const res = await apiFetch(
    `/api/commands/${encodeURIComponent(folder)}/script${params}`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`Failed to load script: ${res.status}`);
  }
  return res.text();
}

export async function deleteExternalCommand(
  folder: string,
  entry: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await localApi<{ success?: boolean; error?: string }>(
      `/api/commands/${encodeURIComponent(folder)}?entry=${encodeURIComponent(entry)}`,
      undefined,
      { method: "DELETE" },
    );
    if (result && result.success) {
      return { success: true };
    }
    return { success: false, error: result?.error || "Delete failed" };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export type ShellRequest = {
  command: string;
  args?: string[];
  cwd?: string;
  timeoutMs?: number;
};

export type ShellResponse = {
  success: boolean;
  code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  error: string | null;
};

export async function shellApi(payload: ShellRequest): Promise<ShellResponse> {
  const token = await getApiAuthToken();
  if (!token) {
    throw new Error("API auth token unavailable");
  }
  return localApi<ShellResponse>("/api/shell", payload, {
    headers: {
      "x-lookback-token": token,
    },
  });
}

export type RequestOptions = {
  signal?: AbortSignal;
  headers?: Record<string, string>;
};

export async function localApi<TResponse>(
  endpoint: string,
  payload?: unknown,
  options: RequestOptions & { method?: string } = {}
): Promise<TResponse> {
  const method = options.method || (payload ? "POST" : "GET");
  const fetchOptions: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    signal: options.signal,
  };

  if (payload && method !== "GET" && method !== "HEAD") {
    fetchOptions.body = JSON.stringify(payload);
  }

  const res = await apiFetch(endpoint, fetchOptions);

  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}`);
  }

  try {
    return (await res.json()) as TResponse;
  } catch {
    return null as unknown as TResponse;
  }
}
