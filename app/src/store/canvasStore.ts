import { proxy, snapshot } from "valtio";
import {
  settingStorage,
  getSettingsSnapshot,
  readSetting,
  loadCanvasImages,
  loadCanvasGroups,
  getCanvasViewport,
  saveCanvasViewport,
  localApi,
  saveCanvasGroups,
  type CanvasViewport,
} from "../service";
import { debounce } from "radash";
import {
  buildBrushCanvasPath,
  createBrushPoint,
  getFilteredBrushPoint,
} from "../utils/canvasBrush";
import {
  getImagePathDirname,
  isAssetImagePath,
  isRemoteImagePath,
  resolveLocalImagePathFromStorage,
} from "../../shared/canvasImagePath";

// 绘制中的实时笔画数据，存于 plain JS 完全绕过 valtio，零 React re-render
interface LiveStrokeData {
  itemId: string;
  points: CanvasPoint[];
  lastPoint: CanvasPoint;
  color: string;
  strokeWidth: number;
}
let liveStroke: LiveStrokeData | null = null;
export const getLiveStroke = () => liveStroke;

export interface ImageMeta {
  id: string;
  filename: string;
  imagePath: string;
  tags: string[];
  createdAt: number;
  dominantColor?: string | null;
  tone?: string | null;
  hasVector: boolean;
  pageUrl?: string | null;
  width: number;
  height: number;
}

export interface CanvasText {
  type: "text";
  itemId: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  text: string;
  fontSize: number;
  fill: string;
  width?: number;
  height?: number;
  align?: string;
  isSelected?: boolean;
  isAutoEdit?: boolean;
}

export interface CanvasPathPoint {
  x: number;
  y: number;
  pressure?: number;
  timestamp?: number;
  pointerType?: string;
}

export interface CanvasPathStroke {
  path: string;
  pointCount: number;
  lastPoint: CanvasPathPoint;
  points: CanvasPathPoint[];
  stroke: string;
  strokeWidth: number;
}

export interface CanvasPath {
  type: "path";
  itemId: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  strokes: CanvasPathStroke[];
  stroke: string;
  strokeWidth: number;
  isSelected?: boolean;
}

export interface CanvasImage extends ImageMeta {
  type: "image";
  itemId: string;
  x: number;
  y: number;
  scale: number;
  flipX?: boolean;
  flipY?: boolean;
  rotation: number;
  width: number;
  height: number;
  grayscale?: boolean; // Deprecated
  filters?: string[];
  isSelected?: boolean;
}

const GROUP_GAP = 40;
const DEFAULT_CANVAS_PATH_STROKE = "#ffffff";
const DEFAULT_CANVAS_PATH_STROKE_WIDTH = 6;
export const CANVAS_PEN_STROKE_WIDTH_RANGE = {
  min: 6,
  max: 24,
  step: 1,
} as const;
const DEFAULT_CANVAS_PATH_COLOR_SLOTS = [
  "#ffffff",
  "#39c5bb",
  "#ef4444",
] as const;
const DEFAULT_CANVAS_GROUP_COLOR = "#39c5bb";
export const CANVAS_GROUP_PADDING_X = 64;
export const CANVAS_GROUP_PADDING_Y = 64;

export type CanvasItem = CanvasImage | CanvasText | CanvasPath;

export interface CanvasGroup {
  groupId: string;
  items: string[];
  backgroundColor: string;
  collapse: boolean;
}

export interface CanvasPersistedItem {
  type: "image" | "text" | "path";
  kind?: "ref" | "temp";
  itemId: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  width?: number;
  height?: number;
  offsetX?: number;
  offsetY?: number;

  // Image specific
  flipX?: boolean;
  flipY?: boolean;
  imageId?: string;
  imagePath?: string;
  dominantColor?: string | null;
  tone?: string | null;
  grayscale?: boolean; // Deprecated
  filters?: string[];

  // Temp image specific
  // name, localPath removed
  pageUrl?: string;
  tags?: string[];
  createdAt?: number;

  // Text specific
  text?: string;
  fontSize?: number;
  fill?: string;
  align?: string;

  // Path specific
  strokes?: CanvasPathStroke[];
  stroke?: string;
  strokeWidth?: number;
}

interface CanvasPoint {
  x: number;
  y: number;
  pressure?: number;
  timestamp?: number;
  pointerType?: string;
}

type CanvasGeometryItem = {
  itemId: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  scale: number;
  rotation: number;
};

interface CanvasHistoryEntry {
  canvasItems: CanvasItem[];
  canvasGroups: CanvasGroup[];
}

interface CanvasHistoryOptions {
  preservePenMode?: boolean;
}

interface CanvasSelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CanvasSelectionBoxState {
  start: CanvasPoint | null;
  current: CanvasPoint | null;
}

export const getRenderBbox = (
  width: number,
  height: number,
  rotationDeg: number,
) => {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const hw = width / 2;
  const hh = height / 2;

  // Corners relative to center
  // p1: -hw, -hh
  // p2: hw, -hh
  // p3: hw, hh
  // p4: -hw, hh

  const x1 = -hw * cos - -hh * sin;
  const y1 = -hw * sin + -hh * cos;

  const x2 = hw * cos - -hh * sin;
  const y2 = hw * sin + -hh * cos;

  const x3 = hw * cos - hh * sin;
  const y3 = hw * sin + hh * cos;

  const x4 = -hw * cos - hh * sin;
  const y4 = -hw * sin + hh * cos;

  const xs = [x1, x2, x3, x4];
  const ys = [y1, y2, y3, y4];

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    width: maxX - minX,
    height: maxY - minY,
    offsetX: minX,
    offsetY: minY,
  };
};

export const getCanvasItemBounds = (
  item: Pick<
    CanvasGeometryItem,
    "x" | "y" | "width" | "height" | "scale" | "rotation"
  >,
) => {
  const scale = item.scale || 1;
  const rawWidth = (item.width || 0) * scale;
  const rawHeight = (item.height || 0) * scale;
  if (rawWidth <= 0 || rawHeight <= 0) return null;

  const bbox = getRenderBbox(rawWidth, rawHeight, item.rotation || 0);
  return {
    x: item.x + bbox.offsetX,
    y: item.y + bbox.offsetY,
    width: bbox.width,
    height: bbox.height,
  };
};

export const getCanvasGroupBounds = (
  group: { items: readonly string[] },
  items: readonly CanvasGeometryItem[],
) => {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const itemById = new Map(items.map((item) => [item.itemId, item] as const));

  group.items.forEach((itemId) => {
    const item = itemById.get(itemId);
    if (!item) return;
    const bounds = getCanvasItemBounds(item);
    if (!bounds) return;
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.width);
    maxY = Math.max(maxY, bounds.y + bounds.height);
  });

  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY)
  ) {
    return null;
  }

  return {
    x: minX - CANVAS_GROUP_PADDING_X,
    y: minY - CANVAS_GROUP_PADDING_Y,
    width: maxX - minX + CANVAS_GROUP_PADDING_X * 2,
    height: maxY - minY + CANVAS_GROUP_PADDING_Y * 2,
  };
};

const containCanvasBounds = (bounds: {
  x: number;
  y: number;
  width: number;
  height: number;
}) => {
  const { width, height, x, y } = bounds;
  const padding = 0;
  const { width: containerWidth, height: containerHeight } =
    canvasState.dimensions;

  if (containerWidth <= 0 || containerHeight <= 0) return false;
  if (width <= 0 || height <= 0) return false;

  const scaleByWidth = (containerWidth - padding * 2) / width;
  const scaleByHeight = (containerHeight - padding * 2) / height;
  const newScale = Math.min(scaleByWidth, scaleByHeight);

  const centerX = x + width / 2;
  const centerY = y + height / 2;

  canvasActions.setCanvasViewport({
    x: containerWidth / 2 - centerX * newScale,
    y: containerHeight / 2 - centerY * newScale,
    width: containerWidth,
    height: containerHeight,
    scale: newScale,
  });

  return true;
};

const resolveLocalImagePath = async (
  rawPath: string,
  canvasName: string,
): Promise<string> => {
  if (!isAssetImagePath(rawPath)) return rawPath;
  const storageDir = await window.electron?.getStorageDir?.();
  if (!storageDir) return "";
  return resolveLocalImagePathFromStorage(rawPath, canvasName, storageDir);
};

const normalizeGroupColor = (value: unknown) => {
  if (typeof value !== "string") return DEFAULT_CANVAS_GROUP_COLOR;
  const normalized = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(normalized)) return normalized;
  if (/^#[0-9a-f]{3}$/.test(normalized)) {
    const r = normalized[1];
    const g = normalized[2];
    const b = normalized[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return DEFAULT_CANVAS_GROUP_COLOR;
};

const measureCanvasTextSize = (text: string, fontSize: number) => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const textNode = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "text",
  );

  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.position = "absolute";
  svg.style.left = "-99999px";
  svg.style.top = "-99999px";
  svg.style.visibility = "hidden";
  svg.style.pointerEvents = "none";

  textNode.setAttribute("font-size", `${fontSize}`);
  textNode.setAttribute("text-anchor", "middle");
  textNode.setAttribute("dominant-baseline", "central");
  textNode.textContent = text;

  svg.appendChild(textNode);
  document.body.appendChild(svg);

  const bbox = textNode.getBBox();
  document.body.removeChild(svg);

  return {
    width: Math.max(0, bbox.width),
    height: Math.max(0, bbox.height),
  };
};

const clonePlain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const clampCanvasPathStrokeWidth = (value: number) => {
  if (!Number.isFinite(value)) return DEFAULT_CANVAS_PATH_STROKE_WIDTH;
  const { min, max, step } = CANVAS_PEN_STROKE_WIDTH_RANGE;
  const clamped = Math.max(
    min,
    Math.min(max, value),
  );
  const stepped = min + Math.round((clamped - min) / step) * step;
  return Math.max(
    min,
    Math.min(max, stepped),
  );
};

const normalizeCanvasPathColor = (value: unknown) => {
  if (typeof value !== "string") return DEFAULT_CANVAS_PATH_STROKE;
  const normalized = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(normalized)) return normalized;
  if (/^#[0-9a-f]{3}$/.test(normalized)) {
    const r = normalized[1];
    const g = normalized[2];
    const b = normalized[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return DEFAULT_CANVAS_PATH_STROKE;
};

const normalizeCanvasPathColorSlots = (value: unknown) => {
  const source = Array.isArray(value) ? value : DEFAULT_CANVAS_PATH_COLOR_SLOTS;
  return DEFAULT_CANVAS_PATH_COLOR_SLOTS.map((fallback, index) =>
    normalizeCanvasPathColor(source[index] ?? fallback),
  );
};

const getCanvasPathStrokePoints = (stroke: CanvasPathStroke) =>
  Array.isArray(stroke.points) ? stroke.points : [];

const getCanvasPathPointCount = (item: Pick<CanvasPath, "strokes">) =>
  item.strokes.reduce(
    (count, stroke) => count + getCanvasPathStrokePoints(stroke).length,
    0,
  );

const getCanvasPathOrigin = (item: CanvasPath) => ({
  x: item.x + item.offsetX,
  y: item.y + item.offsetY,
});

const getCanvasPathLocalPoint = (item: CanvasPath, point: CanvasPoint) => {
  const origin = getCanvasPathOrigin(item);
  return {
    x: point.x - origin.x,
    y: point.y - origin.y,
    pressure: point.pressure,
    timestamp: point.timestamp,
    pointerType: point.pointerType,
  };
};

const getDistanceToSegment = (
  point: CanvasPathPoint,
  start: CanvasPathPoint,
  end: CanvasPathPoint,
) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq),
  );
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
};

const isPointOnSegment = (
  point: CanvasPathPoint,
  start: CanvasPathPoint,
  end: CanvasPathPoint,
) => {
  const epsilon = 0.000001;
  const cross =
    (point.y - start.y) * (end.x - start.x) -
    (point.x - start.x) * (end.y - start.y);
  if (Math.abs(cross) > epsilon) return false;
  return (
    point.x >= Math.min(start.x, end.x) - epsilon &&
    point.x <= Math.max(start.x, end.x) + epsilon &&
    point.y >= Math.min(start.y, end.y) - epsilon &&
    point.y <= Math.max(start.y, end.y) + epsilon
  );
};

const getSegmentCross = (
  start: CanvasPathPoint,
  end: CanvasPathPoint,
  point: CanvasPathPoint,
) =>
  (end.x - start.x) * (point.y - start.y) -
  (end.y - start.y) * (point.x - start.x);

const doSegmentsIntersect = (
  aStart: CanvasPathPoint,
  aEnd: CanvasPathPoint,
  bStart: CanvasPathPoint,
  bEnd: CanvasPathPoint,
) => {
  const aToBStart = getSegmentCross(aStart, aEnd, bStart);
  const aToBEnd = getSegmentCross(aStart, aEnd, bEnd);
  const bToAStart = getSegmentCross(bStart, bEnd, aStart);
  const bToAEnd = getSegmentCross(bStart, bEnd, aEnd);

  if (
    aToBStart * aToBEnd < 0 &&
    bToAStart * bToAEnd < 0
  ) {
    return true;
  }

  return (
    isPointOnSegment(bStart, aStart, aEnd) ||
    isPointOnSegment(bEnd, aStart, aEnd) ||
    isPointOnSegment(aStart, bStart, bEnd) ||
    isPointOnSegment(aEnd, bStart, bEnd)
  );
};

const getDistanceBetweenSegments = (
  aStart: CanvasPathPoint,
  aEnd: CanvasPathPoint,
  bStart: CanvasPathPoint,
  bEnd: CanvasPathPoint,
) => {
  if (doSegmentsIntersect(aStart, aEnd, bStart, bEnd)) return 0;
  return Math.min(
    getDistanceToSegment(aStart, bStart, bEnd),
    getDistanceToSegment(aEnd, bStart, bEnd),
    getDistanceToSegment(bStart, aStart, aEnd),
    getDistanceToSegment(bEnd, aStart, aEnd),
  );
};

const getPathPointFromWorld = (item: CanvasPath, point: CanvasPoint) => {
  const scale = item.scale || 1;
  const dx = point.x - item.x;
  const dy = point.y - item.y;
  const rotation = (-(item.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: (dx * cos - dy * sin) / scale - item.offsetX,
    y: (dx * sin + dy * cos) / scale - item.offsetY,
  };
};

const isStrokeHitByPoint = (
  stroke: CanvasPathStroke,
  point: CanvasPathPoint,
  tolerance: number,
) => {
  const points = getCanvasPathStrokePoints(stroke);
  if (points.length === 0) return false;
  if (points.length === 1) {
    return Math.hypot(
      point.x - points[0].x,
      point.y - points[0].y,
    ) <= tolerance;
  }

  for (let index = 1; index < points.length; index += 1) {
    if (
      getDistanceToSegment(point, points[index - 1], points[index]) <=
      tolerance
    ) {
      return true;
    }
  }
  return false;
};

const isStrokeHitBySegment = (
  stroke: CanvasPathStroke,
  start: CanvasPathPoint,
  end: CanvasPathPoint,
  tolerance: number,
) => {
  const points = getCanvasPathStrokePoints(stroke);
  if (points.length === 0) return false;
  if (points.length === 1) {
    return getDistanceToSegment(points[0], start, end) <= tolerance;
  }

  for (let index = 1; index < points.length; index += 1) {
    if (
      getDistanceBetweenSegments(
        start,
        end,
        points[index - 1],
        points[index],
      ) <= tolerance
    ) {
      return true;
    }
  }
  return false;
};


const recomputeCanvasPathBounds = (item: CanvasPath) => {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  item.strokes.forEach((stroke) => {
    const padding = Math.max(1, stroke.strokeWidth);
    getCanvasPathStrokePoints(stroke).forEach((point) => {
      const x = point.x + item.offsetX;
      const y = point.y + item.offsetY;
      minX = Math.min(minX, x - padding);
      minY = Math.min(minY, y - padding);
      maxX = Math.max(maxX, x + padding);
      maxY = Math.max(maxY, y + padding);
    });
  });

  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY)
  ) {
    return false;
  }

  const localCenterX = (minX + maxX) / 2;
  const localCenterY = (minY + maxY) / 2;
  const scale = item.scale || 1;
  const rotation = ((item.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const scaledX = localCenterX * scale;
  const scaledY = localCenterY * scale;

  item.x += scaledX * cos - scaledY * sin;
  item.y += scaledX * sin + scaledY * cos;
  item.offsetX -= localCenterX;
  item.offsetY -= localCenterY;
  const maxStrokeWidth = item.strokes.reduce<number>(
    (max, stroke) => Math.max(max, stroke.strokeWidth),
    CANVAS_PEN_STROKE_WIDTH_RANGE.min,
  );
  item.strokeWidth = maxStrokeWidth;
  item.width = Math.max(maxStrokeWidth, maxX - minX);
  item.height = Math.max(maxStrokeWidth, maxY - minY);
  return true;
};

const syncProxyRecord = <T extends object>(target: T, source: T) => {
  const targetRecord = target as Record<string, unknown>;
  const sourceRecord = source as Record<string, unknown>;

  Object.keys(targetRecord).forEach((key) => {
    if (!(key in sourceRecord)) {
      delete targetRecord[key];
    }
  });

  Object.entries(sourceRecord).forEach(([key, value]) => {
    targetRecord[key] = value;
  });
};

const normalizeCanvasGroups = (
  groupsInput: unknown,
  items: CanvasItem[],
): CanvasGroup[] => {
  if (!Array.isArray(groupsInput)) return [];

  const itemIds = new Set(items.map((item) => item.itemId));
  const claimedItemIds = new Set<string>();
  const normalizedGroups: CanvasGroup[] = [];

  groupsInput.forEach((group, index) => {
    if (!group || typeof group !== "object") return;
    const candidate = group as Partial<CanvasGroup>;
    const groupId =
      typeof candidate.groupId === "string" && candidate.groupId.trim()
        ? candidate.groupId
        : `group_${index}`;
    const nextItems: string[] = [];

    if (Array.isArray(candidate.items)) {
      candidate.items.forEach((itemId) => {
        if (typeof itemId !== "string") return;
        if (!itemIds.has(itemId)) return;
        if (claimedItemIds.has(itemId)) return;
        claimedItemIds.add(itemId);
        nextItems.push(itemId);
      });
    }

    if (nextItems.length < 2) return;

    normalizedGroups.push({
      groupId,
      items: nextItems,
      backgroundColor: normalizeGroupColor(candidate.backgroundColor),
      collapse: candidate.collapse === true,
    });
  });

  return normalizedGroups;
};

const createCanvasHistoryEntry = (): CanvasHistoryEntry => {
  const snap = snapshot(canvasState);
  return {
    canvasItems: clonePlain(snap.canvasItems as CanvasItem[]),
    canvasGroups: clonePlain(snap.canvasGroups as CanvasGroup[]),
  };
};

const areCanvasHistoryEntriesEqual = (
  prev: CanvasHistoryEntry | undefined,
  next: CanvasHistoryEntry,
) => {
  if (!prev) return false;
  return JSON.stringify(prev) === JSON.stringify(next);
};

interface CanvasStoreState {
  canvasItems: CanvasItem[];
  canvasGroups: CanvasGroup[];
  canvasHistory: CanvasHistoryEntry[];
  canvasHistoryIndex: number;
  canvasViewport: CanvasViewport;
  canvasFilters: string[];
  showMinimap: boolean;
  isPenMode: boolean;
  isDrawingPath: boolean;
  activePathItemId: string | null;
  penTool: "draw" | "erase";
  penStrokeColor: string;
  penStrokeWidth: number;
  penColorSlots: string[];

  isClearModalOpen: boolean;
  primaryId: string | null;
  dimensions: { width: number; height: number };
  isSpaceDown: boolean;
  multiSelectUnion: CanvasSelectionRect | null;
  selectionBox: CanvasSelectionBoxState;
  selectionMode: "select" | "zoom";
  contextMenu: {
    visible: boolean;
    x: number;
    y: number;
  };
  commandTriggerPoint: CanvasPoint | null;
  currentCanvasName: string;
  activeCanvasGroupId: string | null;
  activeCanvasGroupColorPickerId: string | null;
}

import { packRectangles } from "../utils/packer";

const DEFAULT_CANVAS_VIEWPORT: CanvasViewport = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  scale: 1,
};

export const canvasState = proxy<CanvasStoreState>({
  canvasItems: [],
  canvasGroups: [],
  canvasHistory: [],
  canvasHistoryIndex: -1,
  canvasViewport: DEFAULT_CANVAS_VIEWPORT,
  canvasFilters: [],
  showMinimap: true,
  isPenMode: false,
  isDrawingPath: false,
  activePathItemId: null,
  penTool: "draw",
  penStrokeColor: DEFAULT_CANVAS_PATH_STROKE,
  penStrokeWidth: DEFAULT_CANVAS_PATH_STROKE_WIDTH,
  penColorSlots: [...DEFAULT_CANVAS_PATH_COLOR_SLOTS],
  isClearModalOpen: false,
  primaryId: null,
  dimensions: { width: 0, height: 0 },
  isSpaceDown: false,
  multiSelectUnion: null,
  selectionBox: {
    start: null,
    current: null,
  },
  selectionMode: "select",
  contextMenu: {
    visible: false,
    x: 0,
    y: 0,
  },
  commandTriggerPoint: null,
  currentCanvasName: "Default",
  activeCanvasGroupId: null,
  activeCanvasGroupColorPickerId: null,
});

const persistCanvasItems = async (items: CanvasItem[]) => {
  try {
    const normalized: CanvasPersistedItem[] = items.map((item) => {
      if (item.type === "text") {
        return {
          type: "text",
          itemId: item.itemId,
          x: item.x,
          y: item.y,
          rotation: item.rotation,
          scale: item.scale,
          text: item.text,
          fontSize: item.fontSize,
          fill: item.fill,
          width: item.width,
          height: item.height,
          align: item.align,
        };
      }

      if (item.type === "path") {
        return {
          type: "path",
          itemId: item.itemId,
          x: item.x,
          y: item.y,
          rotation: item.rotation,
          scale: item.scale,
          offsetX: item.offsetX,
          offsetY: item.offsetY,
          width: item.width,
          height: item.height,
          strokes: clonePlain(item.strokes),
          stroke: item.stroke,
          strokeWidth: item.strokeWidth,
        };
      }

      const img = item as CanvasImage;
      const kind: CanvasPersistedItem["kind"] = img.imagePath.startsWith(
        "assets/",
      )
        ? "temp"
        : "ref";

      if (kind === "temp") {
        return {
          type: "image",
          kind: "temp",
          itemId: img.itemId,
          x: img.x,
          y: img.y,
          rotation: img.rotation,
          scale: img.scale,
          flipX: img.flipX,
          flipY: img.flipY,
          width: img.width,
          height: img.height,
          grayscale: img.grayscale,
          imagePath: img.imagePath,
          pageUrl: img.pageUrl ?? undefined,
          tags: [...img.tags],
          createdAt: img.createdAt,
          dominantColor:
            typeof img.dominantColor === "string" ? img.dominantColor : null,
          tone: typeof img.tone === "string" ? img.tone : null,
        };
      }

      return {
        type: "image",
        kind: "ref",
        itemId: img.itemId,
        x: img.x,
        y: img.y,
        rotation: img.rotation,
        scale: img.scale,
        flipX: img.flipX,
        flipY: img.flipY,
        width: img.width,
        height: img.height,
        grayscale: img.grayscale,
        imageId: img.id,
        imagePath: img.imagePath,
        dominantColor:
          typeof img.dominantColor === "string" ? img.dominantColor : null,
        tone: typeof img.tone === "string" ? img.tone : null,
      };
    });

    await localApi<{ success?: boolean }>("/api/save-canvas", {
      images: normalized,
      canvasName: canvasState.currentCanvasName,
    });
  } catch (error) {
    void error;
  }
};

const persistCanvasViewport = async (viewport: CanvasViewport) => {
  try {
    await saveCanvasViewport(viewport, canvasState.currentCanvasName);
  } catch (error) {
    void error;
  }
};

const persistCanvasGroupsForCurrentCanvas = async (groups: CanvasGroup[]) => {
  try {
    await saveCanvasGroups(groups, canvasState.currentCanvasName);
  } catch (error) {
    void error;
  }
};

const cloneCanvasItem = (item: CanvasItem): CanvasItem => clonePlain(item);
const cloneCanvasGroup = (group: CanvasGroup): CanvasGroup => clonePlain(group);

const syncCanvasItem = (target: CanvasItem, source: CanvasItem) => {
  syncProxyRecord(target, source);
};

const syncCanvasGroup = (target: CanvasGroup, source: CanvasGroup) => {
  syncProxyRecord(target, source);
};

const mergeToItems = (nextItemsInput: CanvasItem[]) => {
  const currentById = new Map(
    canvasState.canvasItems.map((item) => [item.itemId, item] as const),
  );

  const nextItems = nextItemsInput.map((nextItem) => {
    const source = cloneCanvasItem(nextItem);
    const current = currentById.get(source.itemId);
    if (!current || current.type !== source.type) {
      return source;
    }
    syncCanvasItem(current, source);
    return current;
  });

  canvasState.canvasItems.splice(
    0,
    canvasState.canvasItems.length,
    ...nextItems,
  );
};

const mergeToGroups = (nextGroupsInput: CanvasGroup[]) => {
  const currentById = new Map(
    canvasState.canvasGroups.map((group) => [group.groupId, group] as const),
  );

  const nextGroups = nextGroupsInput.map((nextGroup) => {
    const source = cloneCanvasGroup(nextGroup);
    const current = currentById.get(source.groupId);
    if (!current) {
      return source;
    }
    syncCanvasGroup(current, source);
    return current;
  });

  canvasState.canvasGroups.splice(
    0,
    canvasState.canvasGroups.length,
    ...nextGroups,
  );
};

const cleanupCanvasGroups = (items: CanvasItem[]) => {
  const normalized = normalizeCanvasGroups(canvasState.canvasGroups, items);
  mergeToGroups(normalized);
  if (
    canvasState.activeCanvasGroupId &&
    !normalized.some(
      (group) => group.groupId === canvasState.activeCanvasGroupId,
    )
  ) {
    canvasState.activeCanvasGroupId = null;
  }
  if (
    canvasState.activeCanvasGroupColorPickerId &&
    !normalized.some(
      (group) => group.groupId === canvasState.activeCanvasGroupColorPickerId,
    )
  ) {
    canvasState.activeCanvasGroupColorPickerId = null;
  }
};

const getGroupedCanvasItemIds = (groups: readonly CanvasGroup[]) => {
  const itemIds = new Set<string>();
  groups.forEach((group) => {
    group.items.forEach((itemId) => itemIds.add(itemId));
  });
  return itemIds;
};

const persistCanvasScene = () => {
  void persistCanvasItems(canvasState.canvasItems);
  void persistCanvasGroupsForCurrentCanvas(canvasState.canvasGroups);
};

const appendCanvasItems = (
  items: CanvasItem[],
  insertionPoint?: { x: number; y: number },
) => {
  if (items.length === 0) return [];
  canvasState.canvasItems.push(...items);
  if (insertionPoint) {
    canvasActions.attachItemsToGroupAtPoint(
      items.map((item) => item.itemId),
      insertionPoint,
    );
  }
  canvasActions.commitCanvasChange();
  return items.map((item) => item.itemId);
};

const debouncedPersistCanvasViewport = debounce(
  { delay: 500 },
  persistCanvasViewport,
);

const resetPathDrawingState = () => {
  canvasState.isPenMode = false;
  canvasState.isDrawingPath = false;
  canvasState.activePathItemId = null;
};

const syncActivePathAfterHistoryRestore = (preservePenMode: boolean) => {
  canvasState.isDrawingPath = false;
  if (!preservePenMode) {
    resetPathDrawingState();
    return;
  }

  canvasState.isPenMode = true;
  canvasState.activePathItemId =
    canvasState.canvasItems.find(
      (item): item is CanvasPath =>
        item.type === "path" && item.isSelected === true,
    )?.itemId ?? null;
};

const eraseCanvasPathStrokes = (
  createHitTest: (item: CanvasPath) => (stroke: CanvasPathStroke) => boolean,
) => {
  let didChange = false;
  const removedItemIds = new Set<string>();

  canvasState.canvasItems.forEach((item) => {
    if (item.type !== "path") return;
    const shouldEraseStroke = createHitTest(item);
    const nextStrokes = item.strokes.filter(
      (stroke) => !shouldEraseStroke(stroke),
    );
    if (nextStrokes.length === item.strokes.length) return;

    didChange = true;
    item.strokes = nextStrokes;
    if (nextStrokes.length === 0) {
      removedItemIds.add(item.itemId);
    } else {
      recomputeCanvasPathBounds(item);
    }
  });

  if (removedItemIds.size > 0) {
    mergeToItems(
      canvasState.canvasItems.filter(
        (item) => !removedItemIds.has(item.itemId),
      ),
    );
    if (canvasState.primaryId && removedItemIds.has(canvasState.primaryId)) {
      canvasState.primaryId = null;
    }
    canvasState.multiSelectUnion = null;
  }

  return didChange;
};

export const canvasActions = {
  hydrateSettings: async () => {
    try {
      const settings = await getSettingsSnapshot();
      const rawCanvasFilters = readSetting<unknown>(
        settings,
        "canvasFilters",
        canvasState.canvasFilters,
      );
      const rawShowMinimap = readSetting<unknown>(
        settings,
        "showMinimap",
        canvasState.showMinimap,
      );
      const rawPenStrokeColor = readSetting<unknown>(
        settings,
        "penStrokeColor",
        canvasState.penStrokeColor,
      );
      const rawPenStrokeWidth = readSetting<unknown>(
        settings,
        "penStrokeWidth",
        canvasState.penStrokeWidth,
      );
      const rawPenColorSlots = readSetting<unknown>(
        settings,
        "penColorSlots",
        canvasState.penColorSlots,
      );

      if (Array.isArray(rawCanvasFilters)) {
        canvasState.canvasFilters = rawCanvasFilters as string[];
      }

      if (typeof rawShowMinimap === "boolean") {
        canvasState.showMinimap = rawShowMinimap;
      }

      canvasState.penColorSlots = normalizeCanvasPathColorSlots(rawPenColorSlots);
      const nextStrokeColor = normalizeCanvasPathColor(rawPenStrokeColor);
      canvasState.penStrokeColor = canvasState.penColorSlots.includes(
        nextStrokeColor,
      )
        ? nextStrokeColor
        : canvasState.penColorSlots[0];
      if (typeof rawPenStrokeWidth === "number") {
        canvasState.penStrokeWidth =
          clampCanvasPathStrokeWidth(rawPenStrokeWidth);
      }
    } catch (error) {
      void error;
    }
  },

  setCanvasViewport: (viewport: CanvasViewport) => {
    canvasState.canvasViewport = { ...viewport };
    debouncedPersistCanvasViewport(canvasState.canvasViewport);
  },

  initCanvas: async (): Promise<void> => {
    try {
      resetPathDrawingState();
      const lastActive = await settingStorage.get<string>({
        key: "lastActiveCanvas",
        fallback: "Default",
      });
      canvasState.currentCanvasName = lastActive;

      const [itemsRaw, groupsRaw, viewportRaw] = await Promise.all([
        loadCanvasImages<CanvasPersistedItem[]>(lastActive).catch(
          () => [] as CanvasPersistedItem[],
        ),
        loadCanvasGroups<CanvasGroup[]>(lastActive).catch(
          () => [] as CanvasGroup[],
        ),
        getCanvasViewport<CanvasViewport | null>(lastActive).catch(() => null),
      ]);

      const persisted = Array.isArray(itemsRaw) ? itemsRaw : [];
      const reconstructed: CanvasItem[] = [];

      persisted.forEach((item) => {
        if (!item || typeof item !== "object") return;

        if (item.type === "text") {
          reconstructed.push({
            type: "text",
            itemId: item.itemId,
            x: item.x,
            y: item.y,
            rotation: item.rotation,
            scale: item.scale,
            text: item.text || "",
            fontSize: item.fontSize || 24,
            fill: item.fill || "#000000",
            width: item.width || 0,
            height: item.height,
            align: item.align,
            isSelected: false,
            isAutoEdit: false,
          });
          return;
        }

        if (item.type === "path") {
          reconstructed.push({
            type: "path",
            itemId: item.itemId,
            x: item.x,
            y: item.y,
            rotation: item.rotation,
            scale: item.scale,
            offsetX: item.offsetX || 0,
            offsetY: item.offsetY || 0,
            width: item.width || 0,
            height: item.height || 0,
            strokes: Array.isArray(item.strokes)
              ? clonePlain(item.strokes)
              : [],
            stroke: item.stroke || DEFAULT_CANVAS_PATH_STROKE,
            strokeWidth: item.strokeWidth || DEFAULT_CANVAS_PATH_STROKE_WIDTH,
            isSelected: false,
          });
          return;
        }

        if (item.kind === "temp") {
          const temp = item;
          if (!temp.imagePath) return;
          const rawName = temp.imagePath.split(/[\\/]/).pop() || temp.imagePath;
          const dot = rawName.lastIndexOf(".");
          const filename = dot > 0 ? rawName.slice(0, dot) : rawName;

          const img: CanvasImage = {
            type: "image",
            id: `temp_${temp.itemId}`,
            filename,
            imagePath: temp.imagePath,
            pageUrl: temp.pageUrl,
            tags: Array.isArray(temp.tags) ? [...temp.tags] : [],
            createdAt: temp.createdAt || Date.now(),
            dominantColor: temp.dominantColor ?? null,
            tone: temp.tone ?? null,
            hasVector: false,
            itemId: temp.itemId,
            x: temp.x,
            y: temp.y,
            scale: temp.scale,
            flipX: temp.flipX,
            flipY: temp.flipY,
            rotation: temp.rotation,
            width: temp.width!,
            height: temp.height!,
            grayscale: temp.grayscale,
            isSelected: false,
          };
          reconstructed.push(img);
          return;
        }

        if (item.kind === "ref" || (!item.kind && item.type === "image")) {
          const ref = item;
          if (!ref.imageId) return;

          // For ref images, we construct metadata from persisted info
          // This decouples canvas restoration from gallery state
          let filename = "image";
          if (ref.imagePath) {
            const rawName = ref.imagePath.split(/[\\/]/).pop() || ref.imagePath;
            const dot = rawName.lastIndexOf(".");
            filename = dot > 0 ? rawName.slice(0, dot) : rawName;
          }

          const img: CanvasImage = {
            id: ref.imageId,
            filename,
            imagePath: ref.imagePath || "", // Should ideally have imagePath
            tags: [], // Tags not persisted for ref images currently
            createdAt: 0, // CreatedAt not persisted for ref images currently
            dominantColor: ref.dominantColor,
            tone: ref.tone,
            hasVector: false,
            type: "image",
            itemId: ref.itemId,
            x: ref.x,
            y: ref.y,
            scale: ref.scale,
            flipX: ref.flipX,
            flipY: ref.flipY,
            rotation: ref.rotation,
            width: ref.width!,
            height: ref.height!,
            grayscale: ref.grayscale,
            isSelected: false,
          };
          reconstructed.push(img);
        }
      });

      mergeToItems(reconstructed);
      mergeToGroups(normalizeCanvasGroups(groupsRaw, reconstructed));
      canvasState.activeCanvasGroupId = null;
      canvasState.activeCanvasGroupColorPickerId = null;
      canvasState.canvasHistory = [createCanvasHistoryEntry()];
      canvasState.canvasHistoryIndex = 0;

      if (
        viewportRaw &&
        typeof viewportRaw.x === "number" &&
        typeof viewportRaw.y === "number" &&
        typeof viewportRaw.width === "number" &&
        typeof viewportRaw.height === "number" &&
        typeof viewportRaw.scale === "number"
      ) {
        canvasState.canvasViewport = { ...viewportRaw };
      }
    } catch (error) {
      void error;
      resetPathDrawingState();
      mergeToItems([]);
      mergeToGroups([]);
      canvasState.activeCanvasGroupId = null;
      canvasState.activeCanvasGroupColorPickerId = null;
      canvasState.canvasHistory = [createCanvasHistoryEntry()];
      canvasState.canvasHistoryIndex = 0;
    }
  },

  switchCanvas: async (name: string, skipSave = false) => {
    if (name === canvasState.currentCanvasName) return;
    canvasActions.setPenMode(false);

    if (!skipSave) {
      // Save current viewport
      await saveCanvasViewport(
        canvasState.canvasViewport,
        canvasState.currentCanvasName,
      );
    }

    // Update storage
    await settingStorage.set("lastActiveCanvas", name);

    // Clear state
    mergeToItems([]);
    mergeToGroups([]);
    canvasState.activeCanvasGroupId = null;
    canvasState.activeCanvasGroupColorPickerId = null;
    canvasState.canvasHistory = [createCanvasHistoryEntry()];
    canvasState.canvasHistoryIndex = 0;

    // Init (which will read lastActiveCanvas and load)
    await canvasActions.initCanvas();
  },

  commitCanvasChange: () => {
    cleanupCanvasGroups(canvasState.canvasItems);
    const nextEntry = createCanvasHistoryEntry();
    const currentEntry = canvasState.canvasHistory[canvasState.canvasHistoryIndex];
    if (areCanvasHistoryEntriesEqual(currentEntry, nextEntry)) {
      persistCanvasScene();
      return;
    }

    const nextIndex = canvasState.canvasHistoryIndex + 1;
    canvasState.canvasHistory = canvasState.canvasHistory.slice(0, nextIndex);
    canvasState.canvasHistory.push(nextEntry);
    canvasState.canvasHistoryIndex = nextIndex;

    if (canvasState.canvasHistory.length > 50) {
      canvasState.canvasHistory.shift();
      canvasState.canvasHistoryIndex--;
    }

    persistCanvasScene();
  },

  undoCanvas: (options: CanvasHistoryOptions = {}) => {
    if (canvasState.isDrawingPath) {
      canvasActions.endPathStroke();
    }
    if (canvasState.canvasHistoryIndex > 0) {
      const preservePenMode = options.preservePenMode === true;
      canvasState.canvasHistoryIndex--;
      const historyEntry =
        canvasState.canvasHistory[canvasState.canvasHistoryIndex];
      mergeToItems(historyEntry.canvasItems);
      mergeToGroups(historyEntry.canvasGroups);
      canvasState.activeCanvasGroupId = null;
      canvasState.activeCanvasGroupColorPickerId = null;
      syncActivePathAfterHistoryRestore(preservePenMode);
      if (!preservePenMode) {
        canvasActions.clearSelectionState();
      }
      persistCanvasScene();
    }
  },

  redoCanvas: (options: CanvasHistoryOptions = {}) => {
    if (canvasState.isDrawingPath) {
      canvasActions.endPathStroke();
    }
    if (canvasState.canvasHistoryIndex < canvasState.canvasHistory.length - 1) {
      const preservePenMode = options.preservePenMode === true;
      canvasState.canvasHistoryIndex++;
      const historyEntry =
        canvasState.canvasHistory[canvasState.canvasHistoryIndex];
      mergeToItems(historyEntry.canvasItems);
      mergeToGroups(historyEntry.canvasGroups);
      canvasState.activeCanvasGroupId = null;
      canvasState.activeCanvasGroupColorPickerId = null;
      syncActivePathAfterHistoryRestore(preservePenMode);
      if (!preservePenMode) {
        canvasActions.clearSelectionState();
      }
      persistCanvasScene();
    }
  },

  clearSelectionState: () => {
    canvasState.canvasItems.forEach((item) => {
      item.isSelected = false;
    });
    canvasState.primaryId = null;
    canvasState.multiSelectUnion = null;
    canvasState.selectionBox = {
      start: null,
      current: null,
    };
  },

  setPenMode: (enabled: boolean) => {
    if (enabled) {
      if (canvasState.isPenMode) return;
      canvasActions.clearSelectionState();
      canvasState.activeCanvasGroupId = null;
      canvasState.activeCanvasGroupColorPickerId = null;
      canvasState.isPenMode = true;
      canvasState.isDrawingPath = false;
      canvasState.activePathItemId = null;
      canvasState.penTool = "draw";
      return;
    }

    const activeId = canvasState.activePathItemId;
    canvasState.isPenMode = false;
    canvasState.isDrawingPath = false;
    canvasState.activePathItemId = null;

    if (!activeId) return;
    const item = canvasState.canvasItems.find(
      (entry): entry is CanvasPath =>
        entry.itemId === activeId && entry.type === "path",
    );

    if (!item || getCanvasPathPointCount(item) === 0) {
      mergeToItems(
        canvasState.canvasItems.filter((entry) => entry.itemId !== activeId),
      );
      return;
    }

    canvasState.canvasItems.forEach((entry) => {
      entry.isSelected = entry.itemId === activeId;
    });
    canvasState.primaryId = activeId;
    canvasState.multiSelectUnion = null;
    canvasActions.attachItemsToGroupAtPoint([activeId], { x: item.x, y: item.y });
    canvasActions.commitCanvasChange();
  },

  togglePenMode: () => {
    canvasActions.setPenMode(!canvasState.isPenMode);
  },

  setPenTool: (tool: "draw" | "erase") => {
    canvasState.penTool = tool;
    if (tool === "erase") {
      canvasActions.endPathStroke();
    }
  },

  togglePenEraseTool: () => {
    if (!canvasState.isPenMode) return;
    canvasActions.setPenTool(
      canvasState.penTool === "erase" ? "draw" : "erase",
    );
  },

  setPenStrokeColor: (color: string) => {
    const next = normalizeCanvasPathColor(color);
    canvasState.penStrokeColor = next;
    canvasState.penTool = "draw";
    void settingStorage.set("penStrokeColor", next);
  },

  setPenColorSlot: (index: number, color: string) => {
    if (!Number.isInteger(index)) return;
    if (index < 0 || index >= DEFAULT_CANVAS_PATH_COLOR_SLOTS.length) return;
    const nextColor = normalizeCanvasPathColor(color);
    const nextSlots = [...canvasState.penColorSlots];
    nextSlots[index] = nextColor;
    canvasState.penColorSlots = nextSlots;
    canvasState.penStrokeColor = nextColor;
    canvasState.penTool = "draw";
    void settingStorage.set("penColorSlots", nextSlots);
    void settingStorage.set("penStrokeColor", nextColor);
  },

  setPenStrokeWidth: (width: number) => {
    const next = clampCanvasPathStrokeWidth(width);
    canvasState.penStrokeWidth = next;
    canvasState.penTool = "draw";
    void settingStorage.set("penStrokeWidth", next);
  },

  beginPathStroke: (point: CanvasPoint) => {
    if (!canvasState.isPenMode) return null;
    canvasState.isDrawingPath = true;

    let item = canvasState.canvasItems.find(
      (entry): entry is CanvasPath =>
        entry.itemId === canvasState.activePathItemId &&
        entry.type === "path",
    );

    if (!item) {
      const strokeWidth = canvasState.penStrokeWidth;
      item = {
        type: "path",
        itemId: `path_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        x: point.x,
        y: point.y,
        rotation: 0,
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        width: strokeWidth,
        height: strokeWidth,
        strokes: [],
        stroke: canvasState.penStrokeColor,
        strokeWidth,
        isSelected: true,
      };
      canvasState.canvasItems.push(item);
      canvasState.activePathItemId = item.itemId;
    }

    // 实时笔画数据写入 plain JS，完全绕过 valtio 响应系统
    liveStroke = {
      itemId: item.itemId,
      points: [point],
      lastPoint: point,
      color: canvasState.penStrokeColor,
      strokeWidth: canvasState.penStrokeWidth,
    };

    canvasState.canvasItems.forEach((entry) => {
      entry.isSelected = entry.itemId === item!.itemId;
    });
    canvasState.primaryId = item.itemId;
    canvasState.multiSelectUnion = null;
    return item.itemId;
  },

  appendPathPoint: (point: CanvasPoint, options?: { force?: boolean }) => {
    // 只写 plain JS，零 valtio mutation → 零 React re-render
    if (!canvasState.isDrawingPath || !liveStroke) return;

    const scale = canvasState.canvasViewport.scale || 1;
    const strokeWidth = liveStroke.strokeWidth;
    const minDistance = Math.max(0.35 / scale, strokeWidth * 0.08);
    const distance = Math.hypot(
      point.x - liveStroke.lastPoint.x,
      point.y - liveStroke.lastPoint.y,
    );
    const shouldForceEndpoint = options?.force === true;
    if (!shouldForceEndpoint && distance < minDistance) return;
    if (shouldForceEndpoint && distance < 0.01 / scale) return;

    const nextPoint = shouldForceEndpoint
      ? point
      : getFilteredBrushPoint(
          liveStroke.lastPoint,
          point,
          strokeWidth,
          scale,
        );

    liveStroke.lastPoint = nextPoint;
    liveStroke.points.push(nextPoint);
  },

  endPathStroke: () => {
    if (canvasState.isDrawingPath && liveStroke) {
      const item = canvasState.canvasItems.find(
        (entry): entry is CanvasPath =>
          entry.itemId === liveStroke!.itemId &&
          entry.type === "path",
      );
      if (item && liveStroke.points.length >= 1) {
        // 世界坐标转路径本地坐标，一次性生成高质量 dab 路径
        const localPoints = liveStroke.points.map((p) =>
          createBrushPoint(getCanvasPathLocalPoint(item, p)),
        );
        const path = buildBrushCanvasPath(localPoints, liveStroke.strokeWidth);
        item.stroke = liveStroke.color;
        item.strokeWidth = Math.max(item.strokeWidth, liveStroke.strokeWidth);
        item.strokes.push({
          path,
          pointCount: localPoints.length,
          lastPoint: localPoints[localPoints.length - 1],
          points: localPoints,
          stroke: liveStroke.color,
          strokeWidth: liveStroke.strokeWidth,
        });
        recomputeCanvasPathBounds(item);
      }
      liveStroke = null;
      canvasActions.commitCanvasChange();
    }
    canvasState.isDrawingPath = false;
  },

  erasePathStrokeAtPoint: (point: CanvasPoint) => {
    return eraseCanvasPathStrokes((item) => {
      const localPoint = getPathPointFromWorld(item, point);
      const itemScale = Math.max(0.01, Math.abs(item.scale || 1));
      return (stroke) =>
        isStrokeHitByPoint(
          stroke,
          localPoint,
          stroke.strokeWidth / 2 + canvasState.penStrokeWidth / (2 * itemScale),
        );
    });
  },

  erasePathStrokeAtSegment: (start: CanvasPoint, end: CanvasPoint) => {
    return eraseCanvasPathStrokes((item) => {
      const localStart = getPathPointFromWorld(item, start);
      const localEnd = getPathPointFromWorld(item, end);
      const itemScale = Math.max(0.01, Math.abs(item.scale || 1));
      return (stroke) => {
        const tolerance =
          stroke.strokeWidth / 2 + canvasState.penStrokeWidth / (2 * itemScale);
        return isStrokeHitBySegment(stroke, localStart, localEnd, tolerance);
      };
    });
  },

  commitPathErase: () => {
    cleanupCanvasGroups(canvasState.canvasItems);
    canvasActions.commitCanvasChange();
  },

  setActiveCanvasGroup: (groupId: string | null) => {
    canvasState.activeCanvasGroupId = groupId;
    if (canvasState.activeCanvasGroupColorPickerId !== groupId) {
      canvasState.activeCanvasGroupColorPickerId = null;
    }
  },

  toggleCanvasGroupColorPicker: (groupId: string) => {
    canvasState.activeCanvasGroupId = groupId;
    canvasState.activeCanvasGroupColorPickerId =
      canvasState.activeCanvasGroupColorPickerId === groupId ? null : groupId;
  },

  addTextToCanvas: (x: number, y: number, fontSize?: number) => {
    const id = `text_${Date.now()}`;
    const nextFontSize = fontSize || 96;
    const defaultText = "Double click to edit";
    const textSize = measureCanvasTextSize(defaultText, nextFontSize);
    appendCanvasItems(
      [
        {
          type: "text",
          itemId: id,
          x,
          y,
          rotation: 0,
          scale: 1,
          text: defaultText,
          fontSize: nextFontSize,
          fill: "#ffffff",
          width: textSize.width,
          height: textSize.height,
          isSelected: false,
          isAutoEdit: false,
        },
      ],
      { x, y },
    );
    return id;
  },

  addTextAtViewportCenter: () => {
    const viewport = canvasState.canvasViewport;
    const scale = viewport.scale || 1;
    const trigger = canvasState.commandTriggerPoint;
    const { width, height } = canvasState.dimensions;
    const centerX = width / 2;
    const centerY = height / 2;
    // 命令优先使用触发时的鼠标世界坐标，缺失时回退到视口中心。
    const worldX = trigger ? trigger.x : (centerX - viewport.x) / scale;
    const worldY = trigger ? trigger.y : (centerY - viewport.y) / scale;
    const fontSize = 24 / scale;
    canvasState.commandTriggerPoint = null;

    const id = canvasActions.addTextToCanvas(worldX, worldY, fontSize);
    canvasState.canvasItems.forEach((item) => {
      item.isSelected = item.itemId === id;
      if (item.itemId === id && item.type === "text") {
        item.isAutoEdit = true;
      }
    });
    canvasState.primaryId = id;
    canvasState.multiSelectUnion = null;
    return id;
  },

  setCommandTriggerPoint: (point: CanvasPoint | null) => {
    canvasState.commandTriggerPoint = point;
  },

  groupSelectedItems: () => {
    const selectedItemIds = Array.from(
      new Set(
        canvasState.canvasItems
          .filter((item) => item.isSelected)
          .map((item) => item.itemId),
      ),
    );
    if (selectedItemIds.length < 2) return false;

    const selectedSet = new Set(selectedItemIds);
    const retainedGroups = canvasState.canvasGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((itemId) => !selectedSet.has(itemId)),
      }))
      .filter((group) => group.items.length >= 2);

    const groupId = `group_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    mergeToGroups([
      ...retainedGroups,
      {
        groupId,
        items: selectedItemIds,
        backgroundColor: DEFAULT_CANVAS_GROUP_COLOR,
        collapse: false,
      },
    ]);
    canvasState.canvasItems.forEach((item) => {
      item.isSelected = false;
    });
    canvasState.primaryId = null;
    canvasState.multiSelectUnion = null;
    canvasState.activeCanvasGroupId = groupId;
    canvasState.activeCanvasGroupColorPickerId = null;
    canvasActions.commitCanvasChange();
    return true;
  },

  setCanvasGroupColor: (groupId: string, color: string) => {
    const group = canvasState.canvasGroups.find(
      (item) => item.groupId === groupId,
    );
    if (!group) return;
    const nextColor = normalizeGroupColor(color);
    if (group.backgroundColor === nextColor) return;
    group.backgroundColor = nextColor;
    canvasState.activeCanvasGroupId = groupId;
    canvasState.activeCanvasGroupColorPickerId = groupId;
    canvasActions.commitCanvasChange();
  },

  toggleCanvasGroupCollapse: (groupId: string) => {
    const group = canvasState.canvasGroups.find(
      (item) => item.groupId === groupId,
    );
    if (!group) return;
    group.collapse = !group.collapse;
    canvasState.activeCanvasGroupId = groupId;
    canvasState.activeCanvasGroupColorPickerId = null;

    if (group.collapse) {
      const itemIds = new Set(group.items);
      canvasState.canvasItems.forEach((item) => {
        if (itemIds.has(item.itemId)) {
          item.isSelected = false;
        }
      });
      if (canvasState.primaryId && itemIds.has(canvasState.primaryId)) {
        canvasState.primaryId = null;
      }
      canvasState.multiSelectUnion = null;
    }

    canvasActions.commitCanvasChange();
  },

  ungroupCanvasGroup: (groupId: string) => {
    const nextGroups = canvasState.canvasGroups.filter(
      (group) => group.groupId !== groupId,
    );
    if (nextGroups.length === canvasState.canvasGroups.length) return;
    mergeToGroups(nextGroups);
    if (canvasState.activeCanvasGroupId === groupId) {
      canvasState.activeCanvasGroupId = null;
    }
    if (canvasState.activeCanvasGroupColorPickerId === groupId) {
      canvasState.activeCanvasGroupColorPickerId = null;
    }
    canvasActions.commitCanvasChange();
  },

  expandCanvasGroupsForItems: (itemIds: string[]) => {
    if (itemIds.length === 0) return;
    const targetIds = new Set(itemIds);
    let didChange = false;
    let firstExpandedGroupId: string | null = null;

    canvasState.canvasGroups.forEach((group) => {
      if (!group.collapse) return;
      if (!group.items.some((itemId) => targetIds.has(itemId))) return;
      group.collapse = false;
      didChange = true;
      if (!firstExpandedGroupId) {
        firstExpandedGroupId = group.groupId;
      }
    });

    if (!didChange) return;
    canvasState.activeCanvasGroupId = firstExpandedGroupId;
    canvasState.activeCanvasGroupColorPickerId = null;
    void persistCanvasGroupsForCurrentCanvas(canvasState.canvasGroups);
  },

  attachItemsToContainingGroups: (itemIds: string[]) => {
    if (itemIds.length === 0) return false;

    const targetItemIds = Array.from(
      new Set(
        itemIds.filter((itemId) =>
          canvasState.canvasItems.some((item) => item.itemId === itemId),
        ),
      ),
    );
    if (targetItemIds.length === 0) return false;

    const currentGroups = canvasState.canvasGroups.map((group) => ({
      ...group,
      items: [...group.items],
    }));
    let didChange = false;

    targetItemIds.forEach((itemId) => {
      const item = canvasState.canvasItems.find(
        (entry) => entry.itemId === itemId,
      );
      if (!item) return;

      const itemBounds = getCanvasItemBounds(item);
      if (!itemBounds) return;

      const containingGroups = currentGroups
        .filter((group) => !group.collapse && !group.items.includes(itemId))
        .map((group) => ({
          group,
          bounds: getCanvasGroupBounds(group, canvasState.canvasItems),
        }))
        .filter(
          (
            candidate,
          ): candidate is {
            group: CanvasGroup;
            bounds: NonNullable<ReturnType<typeof getCanvasGroupBounds>>;
          } =>
            candidate.bounds !== null &&
            itemBounds.x >= candidate.bounds.x &&
            itemBounds.y >= candidate.bounds.y &&
            itemBounds.x + itemBounds.width <=
              candidate.bounds.x + candidate.bounds.width &&
            itemBounds.y + itemBounds.height <=
              candidate.bounds.y + candidate.bounds.height,
        )
        .sort(
          (a, b) =>
            a.bounds.width * a.bounds.height - b.bounds.width * b.bounds.height,
        );

      const targetGroup = containingGroups[0]?.group;
      if (!targetGroup) return;

      currentGroups.forEach((group) => {
        if (!group.items.includes(itemId)) return;
        group.items = group.items.filter(
          (groupItemId) => groupItemId !== itemId,
        );
      });
      targetGroup.items.push(itemId);
      didChange = true;
    });

    if (!didChange) return false;

    mergeToGroups(
      normalizeCanvasGroups(currentGroups, canvasState.canvasItems),
    );
    canvasState.activeCanvasGroupColorPickerId = null;
    return true;
  },

  attachItemsToGroupAtPoint: (
    itemIds: string[],
    point: { x: number; y: number } | null,
  ) => {
    if (!point || itemIds.length === 0) return false;

    const targetItemIds = Array.from(
      new Set(
        itemIds.filter((itemId) =>
          canvasState.canvasItems.some((item) => item.itemId === itemId),
        ),
      ),
    );
    if (targetItemIds.length === 0) return false;

    const currentGroups = canvasState.canvasGroups.map((group) => ({
      ...group,
      items: [...group.items],
    }));

    const targetGroup = currentGroups
      .map((group) => ({
        group,
        bounds: getCanvasGroupBounds(group, canvasState.canvasItems),
      }))
      .filter(
        (
          candidate,
        ): candidate is {
          group: CanvasGroup;
          bounds: NonNullable<ReturnType<typeof getCanvasGroupBounds>>;
        } =>
          candidate.bounds !== null &&
          !candidate.group.collapse &&
          point.x >= candidate.bounds.x &&
          point.x <= candidate.bounds.x + candidate.bounds.width &&
          point.y >= candidate.bounds.y &&
          point.y <= candidate.bounds.y + candidate.bounds.height,
      )
      .sort(
        (a, b) =>
          a.bounds.width * a.bounds.height - b.bounds.width * b.bounds.height,
      )[0]?.group;

    if (!targetGroup) return false;

    currentGroups.forEach((group) => {
      group.items = group.items.filter(
        (itemId) => !targetItemIds.includes(itemId),
      );
    });
    targetGroup.items.push(...targetItemIds);

    mergeToGroups(
      normalizeCanvasGroups(currentGroups, canvasState.canvasItems),
    );
    canvasState.activeCanvasGroupColorPickerId = null;
    return true;
  },

  removeSelectedItemsFromCurrentGroup: () => {
    const selectedItemIds = canvasState.canvasItems
      .filter((item) => item.isSelected)
      .map((item) => item.itemId);
    if (selectedItemIds.length === 0) return "no-selection" as const;

    const selectedSet = new Set(selectedItemIds);
    const activeGroup = canvasState.activeCanvasGroupId
      ? canvasState.canvasGroups.find(
          (group) =>
            group.groupId === canvasState.activeCanvasGroupId &&
            group.items.some((itemId) => selectedSet.has(itemId)),
        )
      : null;

    const targetGroup =
      activeGroup ||
      canvasState.canvasGroups.find((group) =>
        group.items.some((itemId) => selectedSet.has(itemId)),
      );

    if (!targetGroup) return "no-group" as const;

    const nextGroups = canvasState.canvasGroups.map((group) => {
      if (group.groupId !== targetGroup.groupId) return group;
      return {
        ...group,
        items: group.items.filter((itemId) => !selectedSet.has(itemId)),
      };
    });

    mergeToGroups(nextGroups);
    canvasState.activeCanvasGroupColorPickerId = null;
    canvasActions.commitCanvasChange();
    return "removed" as const;
  },

  addToCanvas: (image: ImageMeta, x?: number, y?: number) => {
    let targetX = x;
    let targetY = y;

    if (typeof targetX !== "number" || typeof targetY !== "number") {
      const index = canvasState.canvasItems.length;
      const columns = 4;
      const spacingX = 260;
      const spacingY = 260;
      const baseX = 120;
      const baseY = 80;
      const col = index % columns;
      const row = Math.floor(index / columns);

      targetX = baseX + col * spacingX;
      targetY = baseY + row * spacingY;
    }

    const itemId = `img_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    appendCanvasItems(
      [
        {
          type: "image",
          ...image,
          itemId,
          x: targetX,
          y: targetY,
          scale: 1,
          rotation: 0,
          isSelected: false,
        },
      ],
      typeof x === "number" && typeof y === "number"
        ? { x: targetX, y: targetY }
        : undefined,
    );
    return itemId;
  },

  addManyImagesToCanvasCentered: (
    images: ImageMeta[],
    center: { x: number; y: number },
  ) => {
    if (images.length === 0) return [];

    const gap = GROUP_GAP;
    const rects = images.map((image, index) => {
      const rawW = image.width || 0;
      const rawH = image.height || 0;
      const bbox = getRenderBbox(rawW, rawH, 0);
      return {
        id: String(index),
        w: bbox.width,
        h: bbox.height,
        offsetX: bbox.offsetX,
        offsetY: bbox.offsetY,
        x: 0,
        y: 0,
      };
    });

    packRectangles(rects, gap);

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    rects.forEach((r) => {
      const x = r.x ?? 0;
      const y = r.y ?? 0;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + r.w);
      maxY = Math.max(maxY, y + r.h);
    });

    const layoutCenterX =
      Number.isFinite(minX) && Number.isFinite(maxX) ? (minX + maxX) / 2 : 0;
    const layoutCenterY =
      Number.isFinite(minY) && Number.isFinite(maxY) ? (minY + maxY) / 2 : 0;

    const dx = center.x - layoutCenterX;
    const dy = center.y - layoutCenterY;

    const now = Date.now();
    const items = images.map((image, index) => {
      const r = rects[index];
      const x = (r.x ?? 0) - r.offsetX + dx;
      const y = (r.y ?? 0) - r.offsetY + dy;
      const itemId = `img_${now}_${Math.random().toString(16).slice(2)}_${index}`;
      return {
        type: "image",
        ...image,
        itemId,
        x,
        y,
        scale: 1,
        rotation: 0,
        isSelected: false,
      } satisfies CanvasImage;
    });
    return appendCanvasItems(items, center);
  },

  updateCanvasImageTransient: (itemId: string, props: Partial<CanvasItem>) => {
    const index = canvasState.canvasItems.findIndex(
      (img) => img.itemId === itemId,
    );
    if (index !== -1) {
      Object.assign(canvasState.canvasItems[index], props);
    }
  },

  updateCanvasImageSilent: (itemId: string, props: Partial<CanvasItem>) => {
    const index = canvasState.canvasItems.findIndex(
      (img) => img.itemId === itemId,
    );
    if (index !== -1) {
      Object.assign(canvasState.canvasItems[index], props);
    }
  },

  updateCanvasImage: (itemId: string, props: Partial<CanvasItem>) => {
    const index = canvasState.canvasItems.findIndex(
      (img) => img.itemId === itemId,
    );
    if (index !== -1) {
      Object.assign(canvasState.canvasItems[index], props);
      canvasActions.commitCanvasChange();
    }
  },

  removeFromCanvas: (itemId: string) => {
    const index = canvasState.canvasItems.findIndex(
      (img) => img.itemId === itemId,
    );
    if (index !== -1) {
      canvasState.canvasItems.splice(index, 1);
      cleanupCanvasGroups(canvasState.canvasItems);
      canvasActions.commitCanvasChange();
    }
  },

  removeManyFromCanvas: (canvasIds: string[]) => {
    if (!canvasIds.length) return;
    const idSet = new Set(canvasIds);
    const nextItems = canvasState.canvasItems.filter(
      (img) => !idSet.has(img.itemId),
    );
    mergeToItems(nextItems);
    cleanupCanvasGroups(canvasState.canvasItems);
    canvasActions.commitCanvasChange();
  },

  removeImageFromCanvas: (imageId: string) => {
    const prevLen = canvasState.canvasItems.length;
    const nextItems = canvasState.canvasItems.filter((img) => {
      if (img.type !== "image") return true;
      return img.id !== imageId;
    });
    mergeToItems(nextItems);
    if (canvasState.canvasItems.length !== prevLen) {
      cleanupCanvasGroups(canvasState.canvasItems);
      canvasActions.commitCanvasChange();
    }
  },

  autoLayoutCanvas: (
    targetIds?: string[],
    options?: { startX: number; startY: number },
  ) => {
    if (canvasState.canvasItems.length === 0) return;

    const gap = GROUP_GAP;
    const startX = options?.startX ?? 100;
    const startY = options?.startY ?? 100;

    const targetSet =
      targetIds && targetIds.length > 0 ? new Set(targetIds) : null;
    const groupedItemIds = targetSet
      ? new Set<string>()
      : getGroupedCanvasItemIds(canvasState.canvasGroups);

    const layoutItems = canvasState.canvasItems.filter((item) => {
      if (targetSet) return targetSet.has(item.itemId);
      return !groupedItemIds.has(item.itemId);
    });

    const rects = layoutItems
      .map((item) => {
        const bbox = getCanvasItemBounds(item);
        if (!bbox) return null;
        return {
          id: item.itemId,
          w: bbox.width,
          h: bbox.height,
          offsetX: bbox.x - item.x,
          offsetY: bbox.y - item.y,
          x: 0,
          y: 0,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    if (rects.length === 0) return;

    // Use bin packing algorithm for compact layout
    packRectangles(rects, gap);

    const rectMap = new Map(rects.map((r) => [r.id, r]));

    canvasState.canvasItems.forEach((item) => {
      const r = rectMap.get(item.itemId);
      if (r && typeof r.x === "number" && typeof r.y === "number") {
        item.x = r.x + startX - r.offsetX;
        item.y = r.y + startY - r.offsetY;
      }
    });

    canvasActions.commitCanvasChange();
  },

  clearCanvas: () => {
    if (
      canvasState.canvasItems.length === 0 &&
      canvasState.canvasGroups.length === 0
    ) {
      return;
    }

    resetPathDrawingState();
    mergeToItems([]);
    mergeToGroups([]);
    canvasState.activeCanvasGroupId = null;
    canvasState.activeCanvasGroupColorPickerId = null;
    canvasActions.commitCanvasChange();
  },

  bringToFront: (itemId: string) => {
    const index = canvasState.canvasItems.findIndex(
      (img) => img.itemId === itemId,
    );
    if (index !== -1 && index !== canvasState.canvasItems.length - 1) {
      const [img] = canvasState.canvasItems.splice(index, 1);
      canvasState.canvasItems.push(img);
      persistCanvasScene();
    }
  },

  setCanvasFilters: (filters: string[]) => {
    canvasState.canvasFilters = filters;
    void settingStorage.set("canvasFilters", filters);
  },

  toggleMinimap: () => {
    canvasState.showMinimap = !canvasState.showMinimap;
    void settingStorage.set("showMinimap", canvasState.showMinimap);
  },

  cancelPendingSave: () => {
    debouncedPersistCanvasViewport.cancel();
  },

  containCanvasItem: (id: string) => {
    canvasActions.expandCanvasGroupsForItems([id]);
    const item = canvasState.canvasItems.find((i) => i.itemId === id);
    if (!item) return;

    const scale = item.scale || 1;
    const rawW = (item.width || 0) * scale;
    const rawH = (item.height || 0) * scale;
    const bbox = getRenderBbox(rawW, rawH, item.rotation || 0);

    const contained = containCanvasBounds({
      x: item.x + bbox.offsetX,
      y: item.y + bbox.offsetY,
      width: bbox.width,
      height: bbox.height,
    });
    if (!contained) return;

    canvasState.primaryId = null;
    canvasState.multiSelectUnion = null;
    const currItem = canvasState.canvasItems.find(
      (i) => i.itemId === id,
    ) as CanvasItem;
    currItem.isSelected = false;
  },
  panToCanvasItem: (id: string) => {
    canvasActions.expandCanvasGroupsForItems([id]);
    const item = canvasState.canvasItems.find((i) => i.itemId === id);
    if (!item) return;

    const scale = item.scale || 1;
    const rawW = (item.width || 0) * scale;
    const rawH = (item.height || 0) * scale;
    const bbox = getRenderBbox(rawW, rawH, item.rotation || 0);

    const width = bbox.width;
    const height = bbox.height;

    const { width: containerWidth, height: containerHeight } =
      canvasState.dimensions;

    if (containerWidth <= 0 || containerHeight <= 0) return;

    const currentScale = canvasState.canvasViewport.scale || 1;
    const centerX = item.x + bbox.offsetX + width / 2;
    const centerY = item.y + bbox.offsetY + height / 2;

    const newX = containerWidth / 2 - centerX * currentScale;
    const newY = containerHeight / 2 - centerY * currentScale;

    canvasActions.setCanvasViewport({
      x: newX,
      y: newY,
      width: containerWidth,
      height: containerHeight,
      scale: currentScale,
    });

    canvasState.primaryId = null;
    canvasState.multiSelectUnion = null;
  },
  isRemoteImagePath: (value: string) => {
    return isRemoteImagePath(value);
  },
  isAssetImagePath: (value: string) => {
    return isAssetImagePath(value);
  },
  resolveLocalImagePath: async (rawPath: string, canvasName?: string) => {
    const targetCanvasName =
      (canvasName || canvasState.currentCanvasName).trim() || "Default";
    return resolveLocalImagePath(rawPath, targetCanvasName);
  },
  getPathDirname: (value: string) => {
    return getImagePathDirname(value);
  },
};
