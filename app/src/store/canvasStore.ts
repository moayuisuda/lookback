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
const DEFAULT_CANVAS_GROUP_COLOR = "#39c5bb";
export const CANVAS_GROUP_PADDING_X = 64;
export const CANVAS_GROUP_PADDING_Y = 64;

export type CanvasItem = CanvasImage | CanvasText;

export interface CanvasGroup {
  groupId: string;
  items: string[];
  backgroundColor: string;
  collapse: boolean;
}

export interface CanvasPersistedItem {
  type: "image" | "text";
  kind?: "ref" | "temp";
  itemId: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  width?: number;
  height?: number;

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
}

interface CanvasPoint {
  x: number;
  y: number;
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

const normalizePath = (value: string) => value.replace(/\\/g, "/");

const isRemoteImagePath = (value: string) => {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith("http://") || normalized.startsWith("https://");
};

const isAssetImagePath = (value: string) => {
  const normalized = normalizePath(value).replace(/^\/+/, "");
  return normalized.startsWith("assets/");
};

const sanitizeCanvasNameForPath = (value: string) => {
  const safe = value.replace(/[/\\:*?"<>|]/g, "_").trim();
  return safe || "Default";
};

const resolveLocalImagePath = async (
  rawPath: string,
  canvasName: string,
): Promise<string> => {
  if (!isAssetImagePath(rawPath)) return rawPath;
  const normalized = normalizePath(rawPath).replace(/^\/+/, "");
  const filename = normalized.split("/").pop() || "";
  if (!filename) return "";
  const storageDir = await window.electron?.getStorageDir?.();
  if (!storageDir) return "";
  const safeStorageDir = storageDir.replace(/[\\/]$/, "");
  const safeCanvasName = sanitizeCanvasNameForPath(canvasName);
  // assets/ 相对路径统一映射为当前画布 assets 目录下的绝对路径。
  return `${safeStorageDir}/canvases/${safeCanvasName}/assets/${filename}`;
};

const getPathDirname = (value: string) => {
  const normalized = normalizePath(value);
  const index = normalized.lastIndexOf("/");
  if (index <= 0) return normalized;
  return normalized.slice(0, index);
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

interface CanvasStoreState {
  canvasItems: CanvasItem[];
  canvasGroups: CanvasGroup[];
  canvasHistory: CanvasHistoryEntry[];
  canvasHistoryIndex: number;
  canvasViewport: CanvasViewport;
  canvasFilters: string[];
  showMinimap: boolean;
  isCanvasToolbarExpanded: boolean;

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
  isCanvasToolbarExpanded: true,
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
      const rawIsCanvasToolbarExpanded = readSetting<unknown>(
        settings,
        "isCanvasToolbarExpanded",
        canvasState.isCanvasToolbarExpanded,
      );

      if (Array.isArray(rawCanvasFilters)) {
        canvasState.canvasFilters = rawCanvasFilters as string[];
      }

      if (typeof rawShowMinimap === "boolean") {
        canvasState.showMinimap = rawShowMinimap;
      }

      if (typeof rawIsCanvasToolbarExpanded === "boolean") {
        canvasState.isCanvasToolbarExpanded = rawIsCanvasToolbarExpanded;
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
    const nextIndex = canvasState.canvasHistoryIndex + 1;
    canvasState.canvasHistory = canvasState.canvasHistory.slice(0, nextIndex);
    canvasState.canvasHistory.push(createCanvasHistoryEntry());
    canvasState.canvasHistoryIndex = nextIndex;

    if (canvasState.canvasHistory.length > 50) {
      canvasState.canvasHistory.shift();
      canvasState.canvasHistoryIndex--;
    }

    persistCanvasScene();
  },

  undoCanvas: () => {
    if (canvasState.canvasHistoryIndex > 0) {
      canvasState.canvasHistoryIndex--;
      const historyEntry =
        canvasState.canvasHistory[canvasState.canvasHistoryIndex];
      mergeToItems(historyEntry.canvasItems);
      mergeToGroups(historyEntry.canvasGroups);
      canvasState.activeCanvasGroupId = null;
      canvasState.activeCanvasGroupColorPickerId = null;
      canvasActions.clearSelectionState();
      persistCanvasScene();
    }
  },

  redoCanvas: () => {
    if (canvasState.canvasHistoryIndex < canvasState.canvasHistory.length - 1) {
      canvasState.canvasHistoryIndex++;
      const historyEntry =
        canvasState.canvasHistory[canvasState.canvasHistoryIndex];
      mergeToItems(historyEntry.canvasItems);
      mergeToGroups(historyEntry.canvasGroups);
      canvasState.activeCanvasGroupId = null;
      canvasState.activeCanvasGroupColorPickerId = null;
      canvasActions.clearSelectionState();
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
      if (img.type === "text") return true;
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

    const layoutItems = canvasState.canvasItems.filter(
      (item) => !targetSet || targetSet.has(item.itemId),
    );

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

  toggleCanvasToolbarExpanded: () => {
    canvasState.isCanvasToolbarExpanded = !canvasState.isCanvasToolbarExpanded;
    void settingStorage.set(
      "isCanvasToolbarExpanded",
      canvasState.isCanvasToolbarExpanded,
    );
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
    return getPathDirname(value);
  },
};
