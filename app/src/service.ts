import { API_BASE_URL } from "./config";
import type { Locale } from "../shared/i18n/types";

export interface FileStorageGetOptions<T> {
  key: string;
  fallback: T;
}

export const fileStorage = {
  async get<T>({ key, fallback }: FileStorageGetOptions<T>): Promise<T> {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/settings/${encodeURIComponent(key)}`
      );
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
      await fetch(`${API_BASE_URL}/api/settings/${encodeURIComponent(key)}`, {
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
  const raw = await fileStorage.get<unknown>({ key: "language", fallback: "en" });
  return isLocale(raw) ? raw : "en";
}

export async function setLanguage(locale: Locale): Promise<void> {
  await fileStorage.set("language", locale);
}

export interface CanvasViewport {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

export async function loadCanvasImages<T = unknown[]>(canvasName?: string): Promise<T> {
  const url = canvasName 
    ? `${API_BASE_URL}/api/load-canvas?canvasName=${encodeURIComponent(canvasName)}` 
    : `${API_BASE_URL}/api/load-canvas`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load canvas: ${res.status}`);
  }
  const data = (await res.json()) as unknown;
  return data as T;
}

export async function getCanvasViewport<T = unknown>(canvasName?: string): Promise<T | null> {
  const url = canvasName 
    ? `${API_BASE_URL}/api/canvas-viewport?canvasName=${encodeURIComponent(canvasName)}` 
    : `${API_BASE_URL}/api/canvas-viewport`;
  const res = await fetch(url);
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
  const res = await fetch(`${API_BASE_URL}/api/canvases`);
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

export async function getTempDominantColor(
  filePath: string
): Promise<string | null> {
  try {
    const data = await localApi<{
      success?: boolean;
      dominantColor?: string | null;
    }>("/api/temp-dominant-color", {
      filePath,
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

export async function deleteTempFile(filePath: string): Promise<void> {
  try {
    await localApi<{ success?: boolean }>("/api/delete-temp-file", {
      filePath,
    });
  } catch (error) {
    void error;
  }
}

export async function saveGalleryOrder(order: string[]): Promise<void> {
  try {
    await localApi<{ success?: boolean }>("/api/save-gallery-order", { order });
  } catch (error) {
    void error;
  }
}

export async function localApi<TResponse>(
  endpoint: string,
  payload: unknown
): Promise<TResponse> {
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}`);
  }

  try {
    return (await res.json()) as TResponse;
  } catch {
    return null as unknown as TResponse;
  }
}
