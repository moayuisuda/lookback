import { proxy, snapshot } from "valtio";
import {
  settingStorage,
  getSettingsSnapshot,
  readSetting,
  loadCanvasImages,
  getCanvasViewport,
  saveCanvasViewport,
  localApi,
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
  rotation: number;
  width: number;
  height: number;
  grayscale?: boolean; // Deprecated
  filters?: string[];
  isSelected?: boolean;
}

const GROUP_GAP = 40;

export type CanvasItem = CanvasImage | CanvasText;

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

interface CanvasStoreState {
  canvasItems: CanvasItem[];
  canvasHistory: CanvasItem[][];
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
  currentCanvasName: string;
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
  currentCanvasName: "Default",
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

      const [itemsRaw, viewportRaw] = await Promise.all([
        loadCanvasImages<CanvasPersistedItem[]>(lastActive).catch(
          () => [] as CanvasPersistedItem[],
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
            rotation: ref.rotation,
            width: ref.width!,
            height: ref.height!,
            grayscale: ref.grayscale,
            isSelected: false,
          };
          reconstructed.push(img);
        }
      });

      canvasState.canvasItems = reconstructed;
      canvasState.canvasHistory = [
        snapshot(canvasState).canvasItems as CanvasItem[],
      ];
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
      canvasState.canvasItems = [];
      canvasState.canvasHistory = [[]];
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
    canvasState.canvasItems = [];
    canvasState.canvasHistory = [[]];
    canvasState.canvasHistoryIndex = 0;

    // Init (which will read lastActiveCanvas and load)
    await canvasActions.initCanvas();
  },

  commitCanvasChange: () => {
    const snap = snapshot(canvasState);
    const nextSnapshot = snap.canvasItems as CanvasItem[];
    const nextIndex = canvasState.canvasHistoryIndex + 1;

    const current =
      canvasState.canvasHistoryIndex >= 0
        ? snap.canvasHistory[canvasState.canvasHistoryIndex]
        : null;

    if (current && current === nextSnapshot) {
      return;
    }

    canvasState.canvasHistory = canvasState.canvasHistory.slice(0, nextIndex);
    canvasState.canvasHistory.push(nextSnapshot);
    canvasState.canvasHistoryIndex = nextIndex;

    if (canvasState.canvasHistory.length > 50) {
      canvasState.canvasHistory.shift();
      canvasState.canvasHistoryIndex--;
    }

    void persistCanvasItems(canvasState.canvasItems);
  },

  undoCanvas: () => {
    if (canvasState.canvasHistoryIndex > 0) {
      canvasState.canvasHistoryIndex--;
      const snap = snapshot(canvasState);
      canvasState.canvasItems = JSON.parse(
        JSON.stringify(snap.canvasHistory[canvasState.canvasHistoryIndex]),
      ) as CanvasItem[];
      console.log('undo', canvasState.canvasItems)
      canvasActions.clearSelectionState();
      void persistCanvasItems(canvasState.canvasItems);
    }
  },

  redoCanvas: () => {
    if (canvasState.canvasHistoryIndex < canvasState.canvasHistory.length - 1) {
      canvasState.canvasHistoryIndex++;
      const snap = snapshot(canvasState);
      canvasState.canvasItems = JSON.parse(
        JSON.stringify(snap.canvasHistory[canvasState.canvasHistoryIndex]),
      ) as CanvasItem[];
      canvasActions.clearSelectionState();
      void persistCanvasItems(canvasState.canvasItems);
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

  addTextToCanvas: (x: number, y: number, fontSize?: number) => {
    const id = `text_${Date.now()}`;
    canvasState.canvasItems.push({
      type: "text",
      itemId: id,
      x,
      y,
      rotation: 0,
      scale: 1,
      text: "Double click to edit",
      fontSize: fontSize || 96,
      fill: "#ffffff",
      isSelected: false,
      isAutoEdit: false,
    });
    canvasActions.commitCanvasChange();
    return id;
  },

  addTextAtViewportCenter: () => {
    const { width, height } = canvasState.dimensions;
    const viewport = canvasState.canvasViewport;
    const scale = viewport.scale || 1;
    const centerX = width / 2;
    const centerY = height / 2;
    // 命令从当前视口中心创建文字，需要先换算到画布世界坐标。
    const worldX = (centerX - viewport.x) / scale;
    const worldY = (centerY - viewport.y) / scale;
    const fontSize = 24 / scale;

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
    canvasState.canvasItems.push({
      type: "image",
      ...image,
      itemId,
      x: targetX,
      y: targetY,
      scale: 1,
      rotation: 0,
      isSelected: false,
    });
    canvasActions.commitCanvasChange();
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
    const ids: string[] = [];
    images.forEach((image, index) => {
      const r = rects[index];
      const x = (r.x ?? 0) - r.offsetX + dx;
      const y = (r.y ?? 0) - r.offsetY + dy;
      const itemId = `img_${now}_${Math.random().toString(16).slice(2)}_${index}`;
      canvasState.canvasItems.push({
        type: "image",
        ...image,
        itemId,
        x,
        y,
        scale: 1,
        rotation: 0,
        isSelected: false,
      });
      ids.push(itemId);
    });

    canvasActions.commitCanvasChange();
    return ids;
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
      canvasActions.commitCanvasChange();
    }
  },

  removeManyFromCanvas: (canvasIds: string[]) => {
    if (!canvasIds.length) return;
    const idSet = new Set(canvasIds);
    canvasState.canvasItems = canvasState.canvasItems.filter(
      (img) => !idSet.has(img.itemId),
    );
    canvasActions.commitCanvasChange();
  },

  removeImageFromCanvas: (imageId: string) => {
    const prevLen = canvasState.canvasItems.length;
    canvasState.canvasItems = canvasState.canvasItems.filter((img) => {
      if (img.type === "text") return true;
      return img.id !== imageId;
    });
    if (canvasState.canvasItems.length !== prevLen) {
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

    const imageEntries = canvasState.canvasItems
      .map((item, index) => ({ item, index }))
      .filter(
        (entry): entry is { item: CanvasImage; index: number } =>
          entry.item.type === "image" &&
          (!targetIds ||
            targetIds.length === 0 ||
            targetIds.includes(entry.item.itemId)),
      );

    const rects = imageEntries.map(({ item }) => {
      const scale = item.scale || 1;
      const rawW = item.width * scale;
      const rawH = item.height * scale;
      const bbox = getRenderBbox(rawW, rawH, item.rotation || 0);
      return {
        id: item.itemId,
        w: bbox.width,
        h: bbox.height,
        offsetX: bbox.offsetX,
        offsetY: bbox.offsetY,
        x: 0,
        y: 0,
      };
    });
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
    if (canvasState.canvasItems.length === 0) return;

    canvasState.canvasItems = [];
    canvasActions.commitCanvasChange();
  },

  bringToFront: (itemId: string) => {
    const index = canvasState.canvasItems.findIndex(
      (img) => img.itemId === itemId,
    );
    if (index !== -1 && index !== canvasState.canvasItems.length - 1) {
      const [img] = canvasState.canvasItems.splice(index, 1);
      canvasState.canvasItems.push(img);
      void persistCanvasItems(canvasState.canvasItems);
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
    const item = canvasState.canvasItems.find((i) => i.itemId === id);
    if (!item) return;

    const scale = item.scale || 1;
    const rawW = (item.width || 0) * scale;
    const rawH = (item.height || 0) * scale;
    const bbox = getRenderBbox(rawW, rawH, item.rotation || 0);

    const width = bbox.width;
    const height = bbox.height;
    const padding = 0;

    const { width: containerWidth, height: containerHeight } =
      canvasState.dimensions;

    if (containerWidth <= 0 || containerHeight <= 0) return;

    const scaleByWidth = (containerWidth - padding * 2) / width;
    const scaleByHeight = (containerHeight - padding * 2) / height;
    const newScale = Math.min(scaleByWidth, scaleByHeight);

    const centerX = item.x + bbox.offsetX + width / 2;
    const centerY = item.y + bbox.offsetY + height / 2;

    const newX = containerWidth / 2 - centerX * newScale;
    const newY = containerHeight / 2 - centerY * newScale;

    canvasActions.setCanvasViewport({
      x: newX,
      y: newY,
      width: containerWidth,
      height: containerHeight,
      scale: newScale,
    });

    canvasState.primaryId = null;
    canvasState.multiSelectUnion = null;
    const currItem = canvasState.canvasItems.find(
      (i) => i.itemId === id,
    ) as CanvasItem;
    currItem.isSelected = false;
  },
  panToCanvasItem: (id: string) => {
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
};
