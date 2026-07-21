import type {
  CanvasGroup,
  CanvasImage,
  CanvasItem,
  CanvasPathPoint,
  CanvasPathStroke,
} from "../store/canvasStore";
import { resolveCanvasImageUrl } from "../../shared/canvasImagePath";

export const CANVAS_CLIPBOARD_MIME =
  "application/x-lookback-canvas-selection";
export const CANVAS_CLIPBOARD_WEB_MIME = `web ${CANVAS_CLIPBOARD_MIME}`;

const CANVAS_CLIPBOARD_VERSION = 1 as const;

export interface CanvasClipboardPayload {
  version: typeof CANVAS_CLIPBOARD_VERSION;
  clipboardId: string;
  sourceCanvasName: string;
  items: CanvasItem[];
  groups: CanvasGroup[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isOptionalBoolean = (value: unknown) =>
  value === undefined || typeof value === "boolean";

const isOptionalString = (value: unknown) =>
  value === undefined || typeof value === "string";

const isOptionalFiniteNumber = (value: unknown) =>
  value === undefined || isFiniteNumber(value);

const isCanvasPathPoint = (value: unknown): value is CanvasPathPoint =>
  isRecord(value) &&
  isFiniteNumber(value.x) &&
  isFiniteNumber(value.y) &&
  isOptionalFiniteNumber(value.pressure) &&
  isOptionalFiniteNumber(value.timestamp) &&
  isOptionalString(value.pointerType);

const isCanvasPathStroke = (value: unknown): value is CanvasPathStroke =>
  isRecord(value) &&
  typeof value.path === "string" &&
  isFiniteNumber(value.pointCount) &&
  isCanvasPathPoint(value.lastPoint) &&
  Array.isArray(value.points) &&
  value.points.every(isCanvasPathPoint) &&
  typeof value.stroke === "string" &&
  isFiniteNumber(value.strokeWidth);

const hasCanvasGeometry = (
  value: Record<string, unknown>,
): value is Record<string, unknown> & {
  itemId: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
} =>
  typeof value.itemId === "string" &&
  value.itemId.length > 0 &&
  isFiniteNumber(value.x) &&
  isFiniteNumber(value.y) &&
  isFiniteNumber(value.rotation) &&
  isFiniteNumber(value.scale);

const isCanvasImage = (value: Record<string, unknown>) =>
  value.type === "image" &&
  hasCanvasGeometry(value) &&
  typeof value.id === "string" &&
  typeof value.filename === "string" &&
  typeof value.imagePath === "string" &&
  Array.isArray(value.tags) &&
  value.tags.every((tag) => typeof tag === "string") &&
  isFiniteNumber(value.createdAt) &&
  typeof value.hasVector === "boolean" &&
  isFiniteNumber(value.width) &&
  isFiniteNumber(value.height) &&
  isOptionalBoolean(value.flipX) &&
  isOptionalBoolean(value.flipY) &&
  isOptionalBoolean(value.pixelated) &&
  isOptionalBoolean(value.grayscale) &&
  (value.filters === undefined ||
    (Array.isArray(value.filters) &&
      value.filters.every((filter) => typeof filter === "string"))) &&
  isOptionalBoolean(value.isSelected);

const isCanvasText = (value: Record<string, unknown>) =>
  value.type === "text" &&
  hasCanvasGeometry(value) &&
  typeof value.text === "string" &&
  isFiniteNumber(value.fontSize) &&
  typeof value.fill === "string" &&
  isOptionalFiniteNumber(value.width) &&
  isOptionalFiniteNumber(value.height) &&
  isOptionalString(value.align) &&
  isOptionalBoolean(value.isSelected) &&
  isOptionalBoolean(value.isAutoEdit);

const isCanvasPath = (value: Record<string, unknown>) =>
  value.type === "path" &&
  hasCanvasGeometry(value) &&
  isFiniteNumber(value.offsetX) &&
  isFiniteNumber(value.offsetY) &&
  isFiniteNumber(value.width) &&
  isFiniteNumber(value.height) &&
  Array.isArray(value.strokes) &&
  value.strokes.every(isCanvasPathStroke) &&
  typeof value.stroke === "string" &&
  isFiniteNumber(value.strokeWidth) &&
  isOptionalBoolean(value.isSelected);

const isCanvasItem = (value: unknown): value is CanvasItem => {
  if (!isRecord(value)) return false;
  return (
    isCanvasImage(value) ||
    isCanvasText(value) ||
    isCanvasPath(value)
  );
};

const isCanvasGroup = (value: unknown): value is CanvasGroup =>
  isRecord(value) &&
  typeof value.groupId === "string" &&
  value.groupId.length > 0 &&
  Array.isArray(value.items) &&
  value.items.every((itemId) => typeof itemId === "string") &&
  typeof value.backgroundColor === "string" &&
  typeof value.collapse === "boolean";

const isCanvasClipboardPayload = (
  value: unknown,
): value is CanvasClipboardPayload => {
  if (!isRecord(value)) return false;
  if (
    value.version !== CANVAS_CLIPBOARD_VERSION ||
    typeof value.clipboardId !== "string" ||
    !value.clipboardId ||
    typeof value.sourceCanvasName !== "string" ||
    !Array.isArray(value.items) ||
    !value.items.every(isCanvasItem) ||
    !Array.isArray(value.groups) ||
    !value.groups.every(isCanvasGroup)
  ) {
    return false;
  }

  const itemIds = new Set(value.items.map((item) => item.itemId));
  return value.groups.every(
    (group) =>
      group.items.length >= 2 &&
      group.items.every((itemId) => itemIds.has(itemId)),
  );
};

export const createCanvasClipboardPayload = ({
  sourceCanvasName,
  items,
  groups,
}: Pick<CanvasClipboardPayload, "sourceCanvasName" | "items" | "groups">) => ({
  version: CANVAS_CLIPBOARD_VERSION,
  clipboardId: crypto.randomUUID(),
  sourceCanvasName,
  items,
  groups,
}) satisfies CanvasClipboardPayload;

export const serializeCanvasClipboardPayload = (
  payload: CanvasClipboardPayload,
) => JSON.stringify(payload);

export const parseCanvasClipboardPayload = (
  serialized: string,
): CanvasClipboardPayload | null => {
  if (!serialized) return null;
  try {
    const parsed = JSON.parse(serialized) as unknown;
    return isCanvasClipboardPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const canvasToPngBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Canvas PNG encoding failed"));
        return;
      }
      resolve(blob);
    }, "image/png");
  });

const throwIfClipboardWriteAborted = (signal?: AbortSignal) => {
  signal?.throwIfAborted();
};

const loadCanvasImageAsPng = async (
  image: CanvasImage,
  sourceCanvasName: string,
  apiBaseUrl: string,
  signal?: AbortSignal,
) => {
  throwIfClipboardWriteAborted(signal);
  const imageUrl = resolveCanvasImageUrl(
    image.imagePath,
    sourceCanvasName,
    apiBaseUrl,
  );
  const response = await fetch(imageUrl, { signal });
  if (!response.ok) {
    throw new Error(`Failed to load copied image: ${response.status}`);
  }

  const sourceBlob = await response.blob();
  throwIfClipboardWriteAborted(signal);
  if (sourceBlob.type === "image/png") return sourceBlob;

  const bitmap = await createImageBitmap(sourceBlob);
  try {
    throwIfClipboardWriteAborted(signal);
    if (bitmap.width <= 0 || bitmap.height <= 0) {
      throw new Error("Copied image dimensions are invalid");
    }
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas 2D context is unavailable");
    }
    context.drawImage(bitmap, 0, 0);
    const pngBlob = await canvasToPngBlob(canvas);
    throwIfClipboardWriteAborted(signal);
    return pngBlob;
  } finally {
    bitmap.close();
  }
};

export const writeCanvasClipboard = (
  payload: CanvasClipboardPayload,
  serialized: string,
  apiBaseUrl: string,
  signal?: AbortSignal,
) => {
  throwIfClipboardWriteAborted(signal);
  if (!navigator.clipboard?.write) {
    throw new Error("Clipboard write is unavailable");
  }

  const clipboardData: Record<string, Blob | Promise<Blob>> = {
    [CANVAS_CLIPBOARD_WEB_MIME]: new Blob([serialized], {
      type: CANVAS_CLIPBOARD_MIME,
    }),
  };
  const image = payload.items.find(
    (item): item is CanvasImage => item.type === "image",
  );
  if (image) {
    clipboardData["image/png"] = loadCanvasImageAsPng(
      image,
      payload.sourceCanvasName,
      apiBaseUrl,
      signal,
    );
  } else if (payload.items.length === 1 && payload.items[0].type === "text") {
    clipboardData["text/plain"] = new Blob([payload.items[0].text], {
      type: "text/plain",
    });
  }

  return navigator.clipboard.write([new ClipboardItem(clipboardData)]);
};

export const readCanvasClipboard = async (
  clipboardData: DataTransfer | null,
) => {
  const direct =
    clipboardData?.getData(CANVAS_CLIPBOARD_MIME) ||
    clipboardData?.getData(CANVAS_CLIPBOARD_WEB_MIME) ||
    "";
  if (direct) return direct;
  if (!navigator.clipboard?.read) return "";

  try {
    const clipboardItems = await navigator.clipboard.read();
    for (const item of clipboardItems) {
      if (!item.types.includes(CANVAS_CLIPBOARD_WEB_MIME)) continue;
      const blob = await item.getType(CANVAS_CLIPBOARD_WEB_MIME);
      return blob.text();
    }
  } catch {
    return "";
  }
  return "";
};
