import React, { useRef, useEffect, useMemo } from "react";
import { useMemoizedFn } from "ahooks";
import { useHotkeys } from "react-hotkeys-hook";
import {
  canvasState,
  canvasActions,
  getCanvasGroupBounds,
  getRenderBbox,
  getLiveStroke,
  type CanvasItem,
  type CanvasImage as CanvasImageState,
  type CanvasPath as CanvasPathState,
  type CanvasText as CanvasTextState,
  type ImageMeta,
} from "../store/canvasStore";
import { buildSamples, type BrushSample } from "../utils/canvasBrush";
import { anchorActions } from "../store/anchorStore";
import { commandActions, commandState } from "../store/commandStore";
import { globalActions, globalState } from "../store/globalStore";
import { useSnapshot, type Snapshot } from "valtio";
import { ConfirmModal } from "./ConfirmModal";
import { Minimap } from "./canvas/Minimap";
import { CanvasText } from "./canvas/CanvasText";
import { CanvasImage } from "./canvas/CanvasImage";
import { CanvasPath } from "./canvas/CanvasPath";
import { CanvasToolbar } from "./canvas/CanvasToolbar";
import { CanvasGroupsLayer } from "./canvas/CanvasGroupsLayer";
import { SelectOverlay } from "./canvas/SelectOverlay";
import {
  createPointerDoubleClickTap,
  isPointerDoubleClickTap,
  type PointerDoubleClickTap,
} from "./canvas/pointerDoubleClick";
import {
  SelectionRect,
  type SelectionBoxState,
  MIN_ZOOM_AREA,
} from "./canvas/SelectionRect";
import { useT } from "../i18n/useT";
import {
  createTempMetaFromImageUrls,
  createTempMetasFromFiles,
  getNativeFilePath,
  logImageImport,
  resolveDroppedFiles,
} from "../utils/import";
import { normalizeImagePath } from "../../shared/canvasImagePath";
import { extractDroppedImageUrls } from "../utils/droppedImageUrl";
import { CANVAS_AUTO_LAYOUT, CANVAS_ZOOM_TO_FIT } from "../events/uiEvents";
import { getCssFilters } from "../utils/imageFilters";
import { ImagePlus, Upload, MousePointer2 } from "lucide-react";
import { getCommandContext, getCommands } from "../commands";
import { getCommandDescription, getCommandTitle } from "../commands/display";
import type { CommandDefinition } from "../commands/types";

type PointerPointSource = {
  clientX: number;
  clientY: number;
  pressure?: number;
  timeStamp?: number;
  pointerType?: string;
  nativeEvent?: PointerEvent;
};

const OUTGOING_IMAGE_DRAG_TTL_MS = 30000;

type OutgoingImageFileDrag = {
  normalizedFilePaths: Set<string>;
  fileIdentityKeys: Set<string>;
  startedAt: number;
};

type CanvasViewportSnapshot = {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
};

type ViewportRestoreSession = {
  before: CanvasViewportSnapshot;
  after: CanvasViewportSnapshot;
};

const VIEWPORT_RESTORE_EPSILON = 0.001;
const normalizeLocalFilePathForCompare = (value: string) => {
  const normalized = normalizeImagePath(value).replace(/\/+$/, "");
  const platform = navigator.platform.toLowerCase();
  return platform.includes("win") ? normalized.toLowerCase() : normalized;
};

const normalizeFileNameForCompare = (value: string) => {
  const normalized = value.trim();
  const platform = navigator.platform.toLowerCase();
  return platform.includes("win") ? normalized.toLowerCase() : normalized;
};

const getComparableFileTimes = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return [];
  return Array.from(
    new Set([Math.floor(value), Math.round(value), Math.ceil(value)]),
  );
};

const getFileIdentityKeys = ({
  name,
  size,
  lastModified,
}: {
  name: string;
  size: number;
  lastModified: number;
}) => {
  const normalizedName = normalizeFileNameForCompare(name);
  if (!normalizedName || !Number.isFinite(size) || size <= 0) return [];

  return getComparableFileTimes(lastModified).map(
    (time) => `file:${normalizedName}:${size}:${time}`,
  );
};

const getImportUrlHost = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
};

const cloneCanvasViewport = (
  viewport: CanvasViewportSnapshot,
): CanvasViewportSnapshot => ({
  x: viewport.x,
  y: viewport.y,
  width: viewport.width,
  height: viewport.height,
  scale: viewport.scale,
});

const areCanvasViewportsEqual = (
  left: CanvasViewportSnapshot,
  right: CanvasViewportSnapshot,
) =>
  Math.abs(left.x - right.x) <= VIEWPORT_RESTORE_EPSILON &&
  Math.abs(left.y - right.y) <= VIEWPORT_RESTORE_EPSILON &&
  Math.abs(left.scale - right.scale) <= VIEWPORT_RESTORE_EPSILON;

type CanvasItemsLayerProps = {
  items: readonly Snapshot<CanvasItem>[];
  onDragStart: (
    id: string,
    client: { clientX: number; clientY: number },
  ) => void;
  onDragMove: (id: string, delta: { dx: number; dy: number }) => void;
  onDragEnd: (id: string, delta: { dx: number; dy: number }) => void;
  onDragCancel: (id: string) => void;
  onImageDragOut: (
    id: string,
    pos: { clientX: number; clientY: number },
  ) => (() => void) | null;
  onItemSelect: (
    id: string,
    e: React.MouseEvent<SVGGElement> | React.PointerEvent<SVGGElement>,
  ) => void;
  onContainItem: (id: string) => void;
  onCommitItem: (id: string, next: Partial<CanvasItem>) => void;
  onCommitEnter: (id: string) => void;
};

const CanvasItemRenderer = React.memo(
  ({
    item,
    onDragStart,
    onDragMove,
    onDragEnd,
    onDragCancel,
    onImageDragOut,
    onSelect,
    onContainItem,
    onCommitItem,
    onCommitEnter,
  }: {
    item: Snapshot<CanvasItem>;
    onDragStart: (
      id: string,
      pos: { clientX: number; clientY: number },
    ) => void;
    onDragMove: (id: string, delta: { dx: number; dy: number }) => void;
    onDragEnd: (id: string, delta: { dx: number; dy: number }) => void;
    onDragCancel: (id: string) => void;
    onImageDragOut: (
      id: string,
      pos: { clientX: number; clientY: number },
    ) => (() => void) | null;
    onSelect: (
      id: string,
      e: React.MouseEvent<SVGGElement> | React.PointerEvent<SVGGElement>,
    ) => void;
    onContainItem: (id: string) => void;
    onCommitItem: (id: string, next: Partial<CanvasItem>) => void;
    onCommitEnter: (id: string) => void;
  }) => {
    // We need to access the proxy state directly to pass it down
    // Finding it by ID is safe because we are inside a map that iterates over current items
    const itemId = item.itemId;
    const itemState = canvasState.canvasItems.find(
      (it) => it.itemId === itemId,
    ) as CanvasItem;
    const itemSnap = useSnapshot(itemState);
    if (!itemState) return null;

    if (itemSnap.type === "text") {
      return (
        <CanvasText
          item={itemState as CanvasTextState}
          onDragStart={(pos) => onDragStart(itemId, pos)}
          onDragMove={(delta) => onDragMove(itemId, delta)}
          onDragEnd={(delta) => onDragEnd(itemId, delta)}
          onSelect={(e) => onSelect(itemId, e)}
          onCommitEnter={() => onCommitEnter(itemId)}
          onCommit={(newAttrs) => onCommitItem(itemId, newAttrs)}
        />
      );
    }

    if (itemSnap.type === "path") {
      return (
        <CanvasPath
          item={itemState as CanvasPathState}
          onDragStart={(pos) => onDragStart(itemId, pos)}
          onDragMove={(delta) => onDragMove(itemId, delta)}
          onDragEnd={(delta) => onDragEnd(itemId, delta)}
          onSelect={(e) => onSelect(itemId, e)}
          onContain={() => onContainItem(itemId)}
        />
      );
    }

    const image = itemState as CanvasImageState;

    return (
      <CanvasImage
        image={image}
        onDragStart={(pos) => onDragStart(itemId, pos)}
        onDragMove={(delta) => onDragMove(itemId, delta)}
        onDragEnd={(delta) => onDragEnd(itemId, delta)}
        onDragCancel={() => onDragCancel(itemId)}
        onDragOut={(pos) => onImageDragOut(itemId, pos)}
        onSelect={(e) => onSelect(itemId, e)}
        onContain={() => onContainItem(itemId)}
      />
    );
  },
);

const CanvasItemsLayer = React.memo(
  ({
    items,
    onDragStart,
    onDragMove,
    onDragEnd,
    onDragCancel,
    onImageDragOut,
    onItemSelect,
    onContainItem,
    onCommitItem,
    onCommitEnter,
  }: CanvasItemsLayerProps) => {
    // console.log('itemsLayer', items)

    return (
      <g>
        {items.map((item) => (
          <CanvasItemRenderer
            key={item.itemId}
            item={item}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            onDragCancel={onDragCancel}
            onImageDragOut={onImageDragOut}
            onSelect={onItemSelect}
            onContainItem={onContainItem}
            onCommitItem={onCommitItem}
            onCommitEnter={onCommitEnter}
          />
        ))}
      </g>
    );
  },
);

export const Canvas: React.FC = () => {
  const appSnap = useSnapshot(globalState);
  const canvasSnap = useSnapshot(canvasState);
  const commandSnap = useSnapshot(commandState);
  const {
    primaryId,
    isClearModalOpen,
    dimensions,
    canvasViewport,
    selectionBox,
    selectionMode,
    canvasItems,
    canvasGroups,
    canvasFilters,
    showMinimap,
    isPenMode,
    penTool,
    penStrokeColor,
    penStrokeWidth,
    penColorSlots,
    contextMenu,
    activeCanvasGroupId,
    activeCanvasGroupColorPickerId,
  } = canvasSnap;

  const { t } = useT();
  const shouldEnableMouseThrough = appSnap.mouseThrough;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // overlay canvas 用于绘制中实时笔画渲染，完全绕过 React/valtio
  const liveStrokeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const liveStrokeRafRef = useRef<number | null>(null);

  const stageScale = canvasViewport.scale || 1;
  const penCursor = isPenMode
    ? penTool === "erase"
      ? "cell"
      : "crosshair"
    : undefined;

  const isPanningRef = useRef(false);
  const isErasingPathRef = useRef(false);
  const pathEraseChangedRef = useRef(false);
  const lastErasePointRef = useRef<{ x: number; y: number } | null>(null);
  const lastPanPointRef = useRef<{ x: number; y: number } | null>(null);
  const canvasInteractionPointerIdRef = useRef<number | null>(null);
  const selectionAppendRef = useRef(false);
  const multiDragRef = useRef<{
    active: boolean;
    draggedId: string | null;
    anchor: { x: number; y: number } | null;
    snapshots: Map<string, { x: number; y: number }>;
  }>({ active: false, draggedId: null, anchor: null, snapshots: new Map() });
  const multiScaleRef = useRef<{
    active: boolean;
    anchor: { x: number; y: number } | null;
    startUnion: { x: number; y: number; width: number; height: number } | null;
    startDistance: number;
    scale: number;
    pointerId: number | null;
    snapshots: Map<
      string,
      {
        type: CanvasItem["type"];
        x: number;
        y: number;
        scale: number;
        fontSize?: number;
      }
    >;
  }>({
    active: false,
    anchor: null,
    startUnion: null,
    startDistance: 1,
    scale: 1,
    pointerId: null,
    snapshots: new Map(),
  });
  const groupDragRef = useRef<{
    active: boolean;
    groupId: string | null;
    snapshots: Map<string, { x: number; y: number }>;
  }>({
    active: false,
    groupId: null,
    snapshots: new Map(),
  });
  const outgoingImageFileDragRef = useRef<OutgoingImageFileDrag | null>(null);
  const outgoingImageFileDragTimerRef = useRef<number | null>(null);
  const viewportRestoreSessionRef = useRef<ViewportRestoreSession | null>(null);
  const lastCanvasPointerTapRef = useRef<PointerDoubleClickTap | null>(null);

  const getCanvasIdleCursor = useMemoizedFn(() => {
    if (!canvasState.isPenMode) return "default";
    return canvasState.penTool === "erase" ? "cell" : "crosshair";
  });

  useEffect(() => {
    if (
      canvasState.isSpaceDown ||
      isPanningRef.current ||
      isErasingPathRef.current
    ) {
      return;
    }
    const svg = svgRef.current;
    if (svg) {
      svg.style.cursor = getCanvasIdleCursor();
    }
  }, [getCanvasIdleCursor, isPenMode, penTool]);

  const setPrimaryId = useMemoizedFn((id: string | null) => {
    canvasState.primaryId = id;
  });

  const setMultiSelectUnion = useMemoizedFn(
    (rect: typeof canvasState.multiSelectUnion) => {
      canvasState.multiSelectUnion = rect;
    },
  );

  const setSelectionBox = useMemoizedFn((box: SelectionBoxState) => {
    canvasState.selectionBox = box;
  });

  const setIsClearModalOpen = useMemoizedFn((open: boolean) => {
    canvasState.isClearModalOpen = open;
  });

  const closeContextMenu = useMemoizedFn(() => {
    canvasState.contextMenu.visible = false;
  });

  const openContextMenu = useMemoizedFn((x: number, y: number) => {
    canvasState.contextMenu = {
      visible: true,
      x,
      y,
    };
  });

  const clearOutgoingImageFileDrag = useMemoizedFn(() => {
    outgoingImageFileDragRef.current = null;
    if (outgoingImageFileDragTimerRef.current !== null) {
      window.clearTimeout(outgoingImageFileDragTimerRef.current);
      outgoingImageFileDragTimerRef.current = null;
    }
  });

  const markOutgoingImageFileDrag = useMemoizedFn(
    ({ sources }: { sources: ImageFileDragSource[] }) => {
      const normalizedFilePaths = new Set(
        sources
          .map((source) => normalizeLocalFilePathForCompare(source.filePath))
          .filter(Boolean),
      );
      const fileIdentityKeys = new Set(
        sources.flatMap((source) => getFileIdentityKeys(source)),
      );
      if (normalizedFilePaths.size === 0 && fileIdentityKeys.size === 0) {
        return;
      }

      clearOutgoingImageFileDrag();
      outgoingImageFileDragRef.current = {
        normalizedFilePaths,
        fileIdentityKeys,
        startedAt: Date.now(),
      };
      outgoingImageFileDragTimerRef.current = window.setTimeout(() => {
        clearOutgoingImageFileDrag();
      }, OUTGOING_IMAGE_DRAG_TTL_MS);
    },
  );

  const isOutgoingImageFileDrop = useMemoizedFn((file: File) => {
    const outgoing = outgoingImageFileDragRef.current;
    if (!outgoing) return false;
    if (Date.now() - outgoing.startedAt > OUTGOING_IMAGE_DRAG_TTL_MS) {
      clearOutgoingImageFileDrag();
      return false;
    }

    const nativePath = getNativeFilePath(file);
    if (
      nativePath &&
      outgoing.normalizedFilePaths.has(
        normalizeLocalFilePathForCompare(nativePath),
      )
    ) {
      return true;
    }

    const fileIdentityKeys = getFileIdentityKeys({
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
    });
    return fileIdentityKeys.some((key) => outgoing.fileIdentityKeys.has(key));
  });

  useEffect(() => {
    return () => clearOutgoingImageFileDrag();
  }, [clearOutgoingImageFileDrag]);

  void commandSnap.externalCommands;
  const commands = getCommands();
  const visibleCommands = useMemo(() => {
    return commands.filter((command) => {
      if (command.external) {
        return commandSnap.externalCommandContextMenus[command.id] !== false;
      }
      return true;
    });
  }, [commands, commandSnap.externalCommandContextMenus]);

  const commandContext = useMemo(() => getCommandContext(), []);

  const setIsSpaceDown = useMemoizedFn((value: boolean) => {
    canvasState.isSpaceDown = value;
  });

  const getSelectedIds = useMemoizedFn(() => {
    const ids = new Set<string>();
    canvasState.canvasItems.forEach((item) => {
      if (item.isSelected) {
        ids.add(item.itemId);
      }
    });
    return ids;
  });

  const getSelectedItems = useMemoizedFn(() =>
    canvasState.canvasItems.filter((item) => item.isSelected),
  );

  const getLocalImageDragPaths = useMemoizedFn((id: string) => {
    const target = canvasState.canvasItems.find((item) => item.itemId === id);
    if (!target || target.type !== "image") return [];

    const candidates: CanvasImageState[] = target.isSelected
      ? canvasState.canvasItems.filter(
          (item): item is CanvasImageState =>
            item.type === "image" && item.isSelected === true,
        )
      : [target];
    const imagePaths: string[] = [];
    const seen = new Set<string>();

    candidates.forEach((image) => {
      const imagePath = image.imagePath.trim();
      if (!imagePath || canvasActions.isRemoteImagePath(imagePath)) return;

      const identity = normalizeImagePath(imagePath);
      if (seen.has(identity)) return;

      seen.add(identity);
      imagePaths.push(imagePath);
    });

    return imagePaths;
  });

  const getActiveCanvasGroupItems = useMemoizedFn(() => {
    const activeGroupId = canvasState.activeCanvasGroupId;
    if (!activeGroupId) return [];
    const group = canvasState.canvasGroups.find(
      (item) => item.groupId === activeGroupId,
    );
    if (!group) return [];
    const itemIds = new Set(group.items);
    return canvasState.canvasItems.filter((item) => itemIds.has(item.itemId));
  });

  const getContainLayoutTargetItems = useMemoizedFn(() => {
    const selectedItems = getSelectedItems();
    const activeGroupItems = getActiveCanvasGroupItems();
    if (activeGroupItems.length === 0) return selectedItems;
    if (selectedItems.length === 0) return activeGroupItems;

    // active group 作为“虚拟多选”，仅在当前选择仍落在该组内时接管 contain/layout。
    const activeGroupItemIds = new Set(
      activeGroupItems.map((item) => item.itemId),
    );
    const selectionIsInsideActiveGroup = selectedItems.every((item) =>
      activeGroupItemIds.has(item.itemId),
    );
    return selectionIsInsideActiveGroup ? activeGroupItems : selectedItems;
  });

  const collapsedGroupItemIds = useMemo(() => {
    const ids = new Set<string>();
    canvasGroups.forEach((group) => {
      if (!group.collapse) return;
      group.items.forEach((itemId) => ids.add(itemId));
    });
    return ids;
  }, [canvasGroups]);

  const visibleCanvasItems = useMemo(() => {
    return canvasItems.filter(
      (item) => !collapsedGroupItemIds.has(item.itemId),
    );
  }, [canvasItems, collapsedGroupItemIds]);

  useEffect(() => {
    let didChange = false;
    canvasState.canvasItems.forEach((item) => {
      if (!item.isSelected) return;
      if (!collapsedGroupItemIds.has(item.itemId)) return;
      item.isSelected = false;
      didChange = true;
    });
    if (!didChange) return;

    if (
      canvasState.primaryId &&
      collapsedGroupItemIds.has(canvasState.primaryId)
    ) {
      canvasState.primaryId = null;
    }
    canvasState.multiSelectUnion = null;
  }, [collapsedGroupItemIds]);

  const setSelectionByIds = useMemoizedFn((ids: Set<string>) => {
    canvasState.canvasItems.forEach((item) => {
      item.isSelected = ids.has(item.itemId);
    });
  });

  useEffect(() => {
    canvasActions.initCanvas();
  }, [setIsSpaceDown]);

  useEffect(() => {
    void commandActions.loadExternalCommands();
  }, []);

  const computeMultiSelectUnion = useMemoizedFn((ids: Set<string>) => {
    if (ids.size <= 1) return null;

    const items = canvasState.canvasItems || [];

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    items.forEach((item) => {
      if (!ids.has(item.itemId)) return;

      const scale = item.scale || 1;
      const rawW = (item.width || 0) * scale;
      const rawH = (item.height || 0) * scale;
      const bbox = getRenderBbox(rawW, rawH, item.rotation || 0);

      const itemMinX = item.x + bbox.offsetX;
      const itemMinY = item.y + bbox.offsetY;
      const itemMaxX = itemMinX + bbox.width;
      const itemMaxY = itemMinY + bbox.height;

      minX = Math.min(minX, itemMinX);
      minY = Math.min(minY, itemMinY);
      maxX = Math.max(maxX, itemMaxX);
      maxY = Math.max(maxY, itemMaxY);
    });

    if (
      !Number.isFinite(minX) ||
      !Number.isFinite(minY) ||
      !Number.isFinite(maxX) ||
      !Number.isFinite(maxY)
    ) {
      return null;
    }

    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  });

  const getLocalPointFromClient = useMemoizedFn(
    (clientX: number, clientY: number) => {
      const container = containerRef.current;
      if (!container) return null;
      const rect = container.getBoundingClientRect();
      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    },
  );

  const localToWorldPoint = useMemoizedFn((point: { x: number; y: number }) => {
    // 高频交互（滚轮/拖拽）必须读取 proxy 实时视口，避免 snapshot 一帧延迟导致坐标漂移。
    const viewport = canvasState.canvasViewport;
    const scale = viewport.scale || 1;
    return {
      x: (point.x - viewport.x) / scale,
      y: (point.y - viewport.y) / scale,
    };
  });

  const getWorldPointFromClient = useMemoizedFn(
    (client: { x: number; y: number }) => {
      const local = getLocalPointFromClient(client.x, client.y);
      if (!local) return null;
      return localToWorldPoint(local);
    },
  );

  const handleCanvasMouseEnter = useMemoizedFn(() => {
    if (shouldEnableMouseThrough) {
      window.electron?.setIgnoreMouseEvents?.(true, { forward: true });
    }
  });

  useEffect(() => {
    const syncCanvasSize = () => {
      const container = containerRef.current;
      if (!container) return;
      const w = container.offsetWidth;
      const h = container.offsetHeight;
      canvasState.dimensions = { width: w, height: h };
      // overlay canvas 需要跟 DPR 对齐，避免 Retina 下模糊
      const canvas = liveStrokeCanvasRef.current;
      if (canvas) {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
    };
    window.addEventListener("resize", syncCanvasSize);
    syncCanvasSize();
    return () => window.removeEventListener("resize", syncCanvasSize);
  }, [setIsSpaceDown]);

  useEffect(() => {
    if (!containerRef.current) return;
    canvasState.dimensions = {
      width: containerRef.current.offsetWidth,
      height: containerRef.current.offsetHeight,
    };
  }, [appSnap.pinMode]);

  const clearSelection = useMemoizedFn(() => {
    canvasActions.clearSelectionState();
  });

  useEffect(() => {
    const handleWindowBlur = () => {
      // 切换窗口时保留当前选中态，避免回到应用后 focus 丢失。
      closeContextMenu();
    };
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [closeContextMenu]);

  const handleDrop = useMemoizedFn(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const localPoint = getLocalPointFromClient(e.clientX, e.clientY);
      if (!localPoint) {
        return;
      }

      try {
        const basePoint = localToWorldPoint(localPoint);

        const data = e.dataTransfer.getData("application/json");
        if (data) {
          try {
            const image = JSON.parse(data) as ImageMeta;
            if (image && image.id && image.imagePath) {
              canvasActions.addToCanvas(image, basePoint.x, basePoint.y);
              return;
            }
          } catch {
            // ignore
          }
        }

        const imageUrls = extractDroppedImageUrls(e.dataTransfer);
        if (imageUrls.length > 0) {
          const urlHost = getImportUrlHost(imageUrls[0]);
          let importingToastId: string | null = null;
          // 小图通常可以瞬间完成，仅在网页图片导入超过 1 秒时给出持续反馈。
          const importingToastTimer = window.setTimeout(() => {
            importingToastId = globalActions.pushToast(
              { key: "toast.canvasUrlImporting" },
              "info",
              0,
            );
          }, 400);
          try {
            logImageImport("info", "canvas url import started", {
              source: "drop-url",
              canvasName: canvasSnap.currentCanvasName,
              host: urlHost,
            });
            const meta = await createTempMetaFromImageUrls(imageUrls, {
              canvasName: canvasSnap.currentCanvasName,
              source: "drop-url",
            });
            logImageImport("info", "canvas url import succeeded", {
              source: "drop-url",
              canvasName: canvasSnap.currentCanvasName,
              host: urlHost,
              filename: meta.filename,
              imagePath: meta.imagePath,
              width: meta.width || 0,
              height: meta.height || 0,
            });
            canvasActions.addToCanvas(meta, basePoint.x, basePoint.y);
          } catch (err) {
            console.error("URL drop error", err);
            const message = err instanceof Error ? err.message : String(err);
            logImageImport("error", "canvas url import failed", {
              source: "drop-url",
              canvasName: canvasSnap.currentCanvasName,
              host: urlHost,
              error: message,
            });
            globalActions.pushToast(
              {
                key: "toast.canvasUrlImportFailed",
                params: { error: message },
              },
              "error",
            );
          } finally {
            window.clearTimeout(importingToastTimer);
            if (importingToastId) {
              globalActions.removeToast(importingToastId);
            }
          }
          return;
        }

        let files: File[] = [];
        try {
          files = await resolveDroppedFiles(e.dataTransfer);
        } catch (err) {
          console.error("Drop scan error", err);
        }

        const droppedImageFiles = files.filter((file) =>
          file.type.startsWith("image/"),
        );
        const imageFiles = droppedImageFiles.filter(
          (file) => !isOutgoingImageFileDrop(file),
        );
        if (imageFiles.length !== droppedImageFiles.length) {
          clearOutgoingImageFileDrag();
        }
        if (!imageFiles.length) return;

        const metas = await createTempMetasFromFiles(
          imageFiles,
          {
            canvasName: canvasSnap.currentCanvasName,
            source: "drop",
          },
        );
        if (metas.length === 0) return;

        const newIds =
          metas.length > 1
            ? canvasActions.addManyImagesToCanvasCentered(metas, basePoint)
            : (() => {
                const id = canvasActions.addToCanvas(
                  metas[0],
                  basePoint.x,
                  basePoint.y,
                );
                return id ? [id] : [];
              })();

        if (newIds.length > 0) {
          const newSet = new Set(newIds);
          setSelectionByIds(newSet);
          setPrimaryId(newIds[0]);
        }

        setMultiSelectUnion(
          newIds.length > 1 ? computeMultiSelectUnion(new Set(newIds)) : null,
        );
      } catch (err: unknown) {
        console.error("Drop error", err);
      }
    },
  );

  const handleWheel = useMemoizedFn((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    closeContextMenu();
    const pointer = getLocalPointFromClient(e.clientX, e.clientY);
    if (!pointer) return;
    const viewport = canvasState.canvasViewport;
    const scaleBy = 1.1;
    const oldScale = viewport.scale || 1;

    const mousePointTo = {
      x: (pointer.x - viewport.x) / oldScale,
      y: (pointer.y - viewport.y) / oldScale,
    };

    const newScale = e.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };

    canvasActions.setCanvasViewport({
      x: newPos.x,
      y: newPos.y,
      width: canvasState.dimensions.width,
      height: canvasState.dimensions.height,
      scale: newScale,
    });
  });

  useEffect(() => {
    const cleanup = window.electron?.onRendererEvent?.(
      (event: string, ...args: unknown[]) => {
        if (event === "restore-anchor") {
          const slot = args[0] as string;
          if (slot) {
            anchorActions.restoreAnchor(slot);
          }
        } else if (event === "save-anchor") {
          const slot = args[0] as string;
          if (slot) {
            anchorActions.saveAnchor(slot);
            globalActions.pushToast({ key: "canvas.anchor.saved" }, "success");
          }
        }
      },
    );
    return cleanup;
  }, []);

  const getViewportForBounds = useMemoizedFn(
    (
      bounds: { x: number; y: number; width: number; height: number },
      padding = 50,
    ) => {
      const { width, height, x: minX, y: minY } = bounds;

      if (!Number.isFinite(width) || !Number.isFinite(height)) return null;

      const containerWidth = canvasState.dimensions.width;
      const containerHeight = canvasState.dimensions.height;
      if (containerWidth <= 0 || containerHeight <= 0) return null;
      if (width <= 0 || height <= 0) return null;

      const scaleByWidth = (containerWidth - padding * 2) / width;
      const scaleByHeight = (containerHeight - padding * 2) / height;
      const scale = Math.min(scaleByWidth, scaleByHeight);
      if (!Number.isFinite(scale) || scale <= 0) return null;

      const x = (containerWidth - width * scale) / 2 - minX * scale;
      const y = (containerHeight - height * scale) / 2 - minY * scale;

      return {
        x,
        y,
        width: containerWidth,
        height: containerHeight,
        scale,
      };
    },
  );

  const zoomToBounds = useMemoizedFn(
    (
      bounds: { x: number; y: number; width: number; height: number },
      padding = 50,
      options?: { trackRestore?: boolean },
    ) => {
      const currentViewport = cloneCanvasViewport(canvasState.canvasViewport);
      const viewport = getViewportForBounds(bounds, padding);
      if (!viewport) return false;
      canvasActions.setCanvasViewport(viewport);
      if (
        options?.trackRestore &&
        !areCanvasViewportsEqual(currentViewport, viewport)
      ) {
        viewportRestoreSessionRef.current = {
          before: currentViewport,
          after: cloneCanvasViewport(viewport),
        };
      }
      return true;
    },
  );

  const handleZoomToFit = useMemoizedFn(() => {
    if (canvasState.canvasItems.length === 0) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    canvasState.canvasItems.forEach((item) => {
      const scale = item.scale || 1;
      const bbox = getRenderBbox(
        (item.width || 0) * scale,
        (item.height || 0) * scale,
        item.rotation || 0,
      );
      const x1 = item.x + bbox.offsetX;
      const y1 = item.y + bbox.offsetY;
      const x2 = x1 + bbox.width;
      const y2 = y1 + bbox.height;

      if (x1 < minX) minX = x1;
      if (y1 < minY) minY = y1;
      if (x2 > maxX) maxX = x2;
      if (y2 > maxY) maxY = y2;
    });

    if (minX === Infinity) return;

    zoomToBounds(
      {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      },
      0,
    );
  });

  const getItemsBoundingBox = useMemoizedFn((items: typeof canvasItems) => {
    if (!items || items.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    items.forEach((item) => {
      const scale = item.scale || 1;
      const rawW = (item.width || 0) * scale;
      const rawH = (item.height || 0) * scale;
      const bbox = getRenderBbox(rawW, rawH, item.rotation || 0);

      minX = Math.min(minX, item.x + bbox.offsetX);
      minY = Math.min(minY, item.y + bbox.offsetY);
      maxX = Math.max(maxX, item.x + bbox.offsetX + bbox.width);
      maxY = Math.max(maxY, item.y + bbox.offsetY + bbox.height);
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
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  });

  const restoreViewportIfUnchanged = useMemoizedFn(() => {
    const restoreSession = viewportRestoreSessionRef.current;
    if (!restoreSession) return false;

    const currentViewport = cloneCanvasViewport(canvasState.canvasViewport);
    if (!areCanvasViewportsEqual(currentViewport, restoreSession.after)) {
      viewportRestoreSessionRef.current = null;
      return false;
    }

    canvasActions.setCanvasViewport(restoreSession.before);
    viewportRestoreSessionRef.current = null;
    return true;
  });

  const containCanvasBounds = useMemoizedFn(
    (bounds: { x: number; y: number; width: number; height: number }) => {
      const currentViewport = cloneCanvasViewport(canvasState.canvasViewport);
      const nextViewport = getViewportForBounds(bounds, 0);
      if (!nextViewport) return false;

      canvasActions.setCanvasViewport(nextViewport);
      viewportRestoreSessionRef.current = {
        before: currentViewport,
        after: cloneCanvasViewport(nextViewport),
      };
      return true;
    },
  );

  const toggleContainCanvasBounds = useMemoizedFn(
    (bounds: { x: number; y: number; width: number; height: number }) => {
      if (restoreViewportIfUnchanged()) return true;
      return containCanvasBounds(bounds);
    },
  );

  const toggleContainCanvasItems = useMemoizedFn(
    (
      targetItems: readonly Snapshot<CanvasItem>[],
      fallbackItemId?: string | null,
    ) => {
      if (restoreViewportIfUnchanged()) return true;

      const itemIds = targetItems.map((item) => item.itemId);
      if (itemIds.length === 0 && fallbackItemId) {
        itemIds.push(fallbackItemId);
      }
      if (itemIds.length === 0) return false;

      if (itemIds.length === 1) {
        canvasActions.expandCanvasGroupsForItems(itemIds);
      }

      const idSet = new Set(itemIds);
      const resolvedItems = canvasState.canvasItems.filter((item) =>
        idSet.has(item.itemId),
      );
      const bbox = getItemsBoundingBox(resolvedItems);
      if (!bbox) return false;
      if (!containCanvasBounds(bbox)) return false;

      if (resolvedItems.length === 1) {
        canvasState.primaryId = null;
        canvasState.multiSelectUnion = null;
        resolvedItems[0].isSelected = false;
      }

      return true;
    },
  );

  const handleContainItem = useMemoizedFn((id: string) => {
    toggleContainCanvasItems([], id);
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && canvasState.contextMenu.visible) {
        e.preventDefault();
        closeContextMenu();
        return;
      }

      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        if (canvasState.isSpaceDown) return;
        setIsSpaceDown(true);
        const svg = svgRef.current;
        if (svg && !isPanningRef.current) {
          svg.style.cursor = "grab";
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        setIsSpaceDown(false);
        const svg = svgRef.current;
        if (svg && !isPanningRef.current) {
          svg.style.cursor = getCanvasIdleCursor();
        }
      }
    };
    const handleBlur = () => {
      setIsSpaceDown(false);
      isPanningRef.current = false;
      lastPanPointRef.current = null;
      if (canvasState.isDrawingPath) {
        canvasActions.endPathStroke();
      }
      const svg = svgRef.current;
      if (svg) {
        svg.style.cursor = getCanvasIdleCursor();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [
    closeContextMenu,
    getCanvasIdleCursor,
    setIsSpaceDown,
  ]);

  useEffect(() => {
    const handler = (e: Event) => {
      if (e instanceof CustomEvent && e.type === CANVAS_ZOOM_TO_FIT) {
        handleZoomToFit();
      }
    };
    window.addEventListener(CANVAS_ZOOM_TO_FIT, handler);
    return () => window.removeEventListener(CANVAS_ZOOM_TO_FIT, handler);
  }, [handleZoomToFit]);

  const handleRunContextMenuCommand = useMemoizedFn(
    async (command: CommandDefinition) => {
      if (command.ui) {
        closeContextMenu();
        commandActions.open();
        commandActions.setActiveCommand(command.id);
        return;
      }
      if (command.run) {
        const triggerPoint = localToWorldPoint({
          x: canvasState.contextMenu.x,
          y: canvasState.contextMenu.y,
        });
        canvasActions.setCommandTriggerPoint(triggerPoint);
        closeContextMenu();
        try {
          await command.run(commandContext);
        } finally {
          canvasActions.setCommandTriggerPoint(null);
        }
        return;
      }
      closeContextMenu();
    },
  );

  const getCoalescedPointerPoints = useMemoizedFn(
    (client: PointerPointSource) => {
      const points = client.nativeEvent?.getCoalescedEvents?.();
      return points && points.length > 0 ? points : [client];
    },
  );

  const appendPathPointFromClient = useMemoizedFn(
    (client: PointerPointSource, options?: { force?: boolean }) => {
      const points = getCoalescedPointerPoints(client);
      points.forEach((point, index) => {
        const local = getLocalPointFromClient(point.clientX, point.clientY);
        if (!local) return;
        canvasActions.appendPathPoint(
          {
            ...localToWorldPoint(local),
            pressure: point.pressure,
            timestamp: point.timeStamp,
            pointerType: point.pointerType,
          },
          {
            force: options?.force === true && index === points.length - 1,
          },
        );
      });
    },
  );

  // RAF 循环用 pressure+velocity 半径绘制实时笔锋，与最终 dab 路径视觉一致
  const renderLiveStroke = useMemoizedFn(() => {
    const canvas = liveStrokeCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const stroke = getLiveStroke();
    if (stroke && stroke.points.length >= 1) {
      const { scale, x: vx, y: vy } = canvasState.canvasViewport;
      ctx.save();
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, vx * dpr, vy * dpr);
      ctx.fillStyle = stroke.color;
      // 复用 buildSamples 计算每点 pressure+velocity 半径
      const samples = buildSamples(
        stroke.points as BrushSample[],
        stroke.strokeWidth,
      );
      // 胶囊体连接相邻采样点
      for (let i = 1; i < samples.length; i++) {
        const prev = samples[i - 1];
        const curr = samples[i];
        const dx = curr.x - prev.x;
        const dy = curr.y - prev.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.001) continue;
        const nx = -dy / len;
        const ny = dx / len;
        ctx.beginPath();
        ctx.moveTo(prev.x + nx * prev.radius, prev.y + ny * prev.radius);
        ctx.lineTo(curr.x + nx * curr.radius, curr.y + ny * curr.radius);
        ctx.lineTo(curr.x - nx * curr.radius, curr.y - ny * curr.radius);
        ctx.lineTo(prev.x - nx * prev.radius, prev.y - ny * prev.radius);
        ctx.closePath();
        ctx.fill();
      }
      // 圆形 dab 覆盖接缝
      for (const sample of samples) {
        ctx.beginPath();
        ctx.arc(sample.x, sample.y, Math.max(0.5, sample.radius), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    liveStrokeRafRef.current = requestAnimationFrame(renderLiveStroke);
  });

  const startLiveStrokeRender = useMemoizedFn(() => {
    if (liveStrokeRafRef.current !== null) return;
    liveStrokeRafRef.current = requestAnimationFrame(renderLiveStroke);
  });

  const stopLiveStrokeRender = useMemoizedFn(() => {
    if (liveStrokeRafRef.current !== null) {
      cancelAnimationFrame(liveStrokeRafRef.current);
      liveStrokeRafRef.current = null;
    }
    const canvas = liveStrokeCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  });

  const finishPathDrawing = useMemoizedFn(
    (client?: PointerPointSource) => {
      if (!canvasState.isDrawingPath) return;
      if (client) {
        appendPathPointFromClient(client, { force: true });
      }
      stopLiveStrokeRender();
      canvasActions.endPathStroke();
      const svg = svgRef.current;
      if (svg) {
        svg.style.cursor = getCanvasIdleCursor();
      }
    },
  );

  const erasePathStrokeFromClient = useMemoizedFn(
    (client: PointerPointSource) => {
      getCoalescedPointerPoints(client).forEach((point) => {
        const local = getLocalPointFromClient(point.clientX, point.clientY);
        if (!local) return;
        const worldPoint = localToWorldPoint(local);
        const previousPoint = lastErasePointRef.current;
        const didErase = previousPoint
          ? canvasActions.erasePathStrokeAtSegment(previousPoint, worldPoint)
          : canvasActions.erasePathStrokeAtPoint(worldPoint);
        lastErasePointRef.current = worldPoint;
        if (didErase) {
          pathEraseChangedRef.current = true;
        }
      });
    },
  );

  const finishPathErase = useMemoizedFn(() => {
    if (!isErasingPathRef.current) return;
    isErasingPathRef.current = false;
    lastErasePointRef.current = null;
    if (pathEraseChangedRef.current) {
      canvasActions.commitPathErase();
      pathEraseChangedRef.current = false;
      setMultiSelectUnion(computeMultiSelectUnion(getSelectedIds()));
    }
  });

  const updateScaleSessionFromClient = useMemoizedFn(
    (client: { clientX: number; clientY: number }) => {
      const current = multiScaleRef.current;
      if (!current.active) return;
      if (!current.anchor || !current.startUnion) return;
      const local = getLocalPointFromClient(client.clientX, client.clientY);
      if (!local) return;
      const pos = localToWorldPoint(local);
      const base = Math.max(1, current.startDistance || 1);
      const next = Math.hypot(
        pos.x - current.anchor.x,
        pos.y - current.anchor.y,
      );
      const scale = Math.max(0.1, next / base);
      current.scale = scale;
      current.snapshots.forEach((start, selectedId) => {
        const nextX =
          current.anchor!.x + (start.x - current.anchor!.x) * scale;
        const nextY =
          current.anchor!.y + (start.y - current.anchor!.y) * scale;
        if (start.type === "text") {
          const nextFontSize = Math.max(8, (start.fontSize || 0) * scale);
          canvasActions.updateCanvasImageTransient(selectedId, {
            x: nextX,
            y: nextY,
            fontSize: nextFontSize,
          });
          return;
        }
        const nextScale = Math.max(0.05, start.scale * scale);
        canvasActions.updateCanvasImageTransient(selectedId, {
          x: nextX,
          y: nextY,
          scale: nextScale,
        });
      });
      setMultiSelectUnion(computeMultiSelectUnion(getSelectedIds()));
    },
  );

  const resetScaleSession = useMemoizedFn(() => {
    multiScaleRef.current = {
      active: false,
      anchor: null,
      startUnion: null,
      startDistance: 1,
      scale: 1,
      pointerId: null,
      snapshots: new Map(),
    };
    const svg = svgRef.current;
    if (svg) svg.style.cursor = getCanvasIdleCursor();
  });

  const finishScaleSession = useMemoizedFn(() => {
    const current = multiScaleRef.current;
    if (!current.active) return;
    const scale = current.scale || 1;
    if (current.anchor) {
      current.snapshots.forEach((start, selectedId) => {
        const nextX =
          current.anchor!.x + (start.x - current.anchor!.x) * scale;
        const nextY =
          current.anchor!.y + (start.y - current.anchor!.y) * scale;
        if (start.type === "text") {
          const nextFontSize = Math.max(8, (start.fontSize || 0) * scale);
          canvasActions.updateCanvasImageSilent(selectedId, {
            x: nextX,
            y: nextY,
            fontSize: nextFontSize,
          });
          return;
        }
        const nextScale = Math.max(0.05, start.scale * scale);
        canvasActions.updateCanvasImageSilent(selectedId, {
          x: nextX,
          y: nextY,
          scale: nextScale,
        });
      });
      canvasActions.commitCanvasChange();
    }
    resetScaleSession();
    setMultiSelectUnion(computeMultiSelectUnion(getSelectedIds()));
  });

  const captureCanvasInteractionPointer = useMemoizedFn(
    (e: React.PointerEvent<SVGSVGElement>) => {
      canvasInteractionPointerIdRef.current = e.pointerId;
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.setPointerCapture(e.pointerId);
      }
    },
  );

  const releaseCanvasInteractionPointer = useMemoizedFn(
    (target: SVGSVGElement, pointerId: number) => {
      if (canvasInteractionPointerIdRef.current === pointerId) {
        canvasInteractionPointerIdRef.current = null;
      }
      if (target.hasPointerCapture(pointerId)) {
        target.releasePointerCapture(pointerId);
      }
    },
  );

  const isCanvasInteractionPointer = useMemoizedFn((pointerId: number) => {
    const activePointerId = canvasInteractionPointerIdRef.current;
    return activePointerId === pointerId;
  });

  const updateCanvasPanFromClient = useMemoizedFn(
    (client: { clientX: number; clientY: number }) => {
      const last = lastPanPointRef.current;
      if (!last) return;

      const currentPoint = { x: client.clientX, y: client.clientY };
      const dx = currentPoint.x - last.x;
      const dy = currentPoint.y - last.y;
      const viewport = canvasState.canvasViewport;

      canvasActions.setCanvasViewport({
        x: viewport.x + dx,
        y: viewport.y + dy,
        width: canvasState.dimensions.width,
        height: canvasState.dimensions.height,
        scale: viewport.scale,
      });
      lastPanPointRef.current = currentPoint;
    },
  );

  const updateSelectionBoxFromClient = useMemoizedFn(
    (client: { clientX: number; clientY: number }) => {
      const currentSelection = canvasState.selectionBox;
      if (!currentSelection.start) return;
      const local = getLocalPointFromClient(client.clientX, client.clientY);
      if (!local) return;
      const pos = localToWorldPoint(local);
      canvasState.selectionBox = {
        ...currentSelection,
        current: pos,
      };
    },
  );

  const finishCanvasPointerInteraction = useMemoizedFn(
    (client?: { clientX: number; clientY: number }) => {
      const svg = svgRef.current;
      if (svg) svg.style.cursor = getCanvasIdleCursor();

      isPanningRef.current = false;
      lastPanPointRef.current = null;

      const currentSelection = canvasState.selectionBox;
      if (currentSelection.start && currentSelection.current) {
        const x1 = Math.min(
          currentSelection.start.x,
          currentSelection.current.x,
        );
        const x2 = Math.max(
          currentSelection.start.x,
          currentSelection.current.x,
        );
        const y1 = Math.min(
          currentSelection.start.y,
          currentSelection.current.y,
        );
        const y2 = Math.max(
          currentSelection.start.y,
          currentSelection.current.y,
        );
        const width = x2 - x1;
        const height = y2 - y1;

        const isClick = width <= 2 && height <= 2;
        const viewportScale = canvasState.canvasViewport.scale || 1;
        const zoomArea = width * height * viewportScale * viewportScale;
        const shouldZoom = zoomArea >= MIN_ZOOM_AREA;

        if (canvasState.selectionMode === "zoom") {
          if (shouldZoom) {
            // 右键框选缩放完成时再清理选中项，避免按下阶段打断已有节点状态。
            clearSelection();
            zoomToBounds({ x: x1, y: y1, width, height }, 0, {
              trackRestore: true,
            });
          } else if (client && !shouldEnableMouseThrough) {
            const local = getLocalPointFromClient(
              client.clientX,
              client.clientY,
            );
            if (local) {
              openContextMenu(local.x, local.y);
              void commandActions.loadExternalCommands();
            }
          }
          canvasState.selectionBox = { start: null, current: null };
          return;
        }

        if (!isClick) {
          const newSelected = selectionAppendRef.current
            ? getSelectedIds()
            : new Set<string>();
          let lastHitId: string | null = null;
          visibleCanvasItems.forEach((item) => {
            const scale = item.scale || 1;
            const rawW = (item.width || 0) * scale;
            const rawH = (item.height || 0) * scale;
            const bbox = getRenderBbox(rawW, rawH, item.rotation || 0);

            const itemMinX = item.x + bbox.offsetX;
            const itemMinY = item.y + bbox.offsetY;
            const itemMaxX = itemMinX + bbox.width;
            const itemMaxY = itemMinY + bbox.height;

            if (
              itemMinX < x2 &&
              itemMaxX > x1 &&
              itemMinY < y2 &&
              itemMaxY > y1
            ) {
              newSelected.add(item.itemId);
              lastHitId = item.itemId;
            }
          });
          setSelectionByIds(newSelected);
          if (lastHitId) setPrimaryId(lastHitId);
          setMultiSelectUnion(computeMultiSelectUnion(newSelected));
        }
      }
      canvasState.selectionBox = { start: null, current: null };
    },
  );

  const isCanvasBackgroundPointerEvent = useMemoizedFn(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const target = e.target;
      return (
        target instanceof Element &&
        (target === e.currentTarget || target.id === "canvas-content-layer")
      );
    },
  );

  const isCanvasBackgroundPointerDoubleClick = useMemoizedFn(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (canvasState.isPenMode || e.button !== 0) {
        lastCanvasPointerTapRef.current = null;
        return false;
      }
      if (!isCanvasBackgroundPointerEvent(e)) {
        lastCanvasPointerTapRef.current = null;
        return false;
      }

      const previousTap = lastCanvasPointerTapRef.current;
      const currentTap = createPointerDoubleClickTap(e.nativeEvent);
      lastCanvasPointerTapRef.current = currentTap;

      const isDoubleClick = isPointerDoubleClickTap(currentTap, previousTap);
      if (isDoubleClick) {
        lastCanvasPointerTapRef.current = null;
      }

      return isDoubleClick;
    },
  );

  const handlePointerDown = useMemoizedFn(
    (e: React.PointerEvent<SVGSVGElement>) => {
      closeContextMenu();
      const isSpaceDownNow = canvasState.isSpaceDown;

      if (
        !isSpaceDownNow &&
        isCanvasBackgroundPointerDoubleClick(e) &&
        restoreViewportIfUnchanged()
      ) {
        e.preventDefault();
        return;
      }

      const isSpacePan = isSpaceDownNow && e.button === 0;
      const isMiddleButton = e.button === 1;
      if (isSpacePan || isMiddleButton) {
        e.preventDefault();
        captureCanvasInteractionPointer(e);
        isPanningRef.current = true;
        lastPanPointRef.current = { x: e.clientX, y: e.clientY };
        const svg = svgRef.current;
        if (svg) svg.style.cursor = "grabbing";
        return;
      }

      if (canvasState.isPenMode) {
        if (isSpaceDownNow) return;
        if (e.button !== 0) return;

        e.preventDefault();
        const local = getLocalPointFromClient(e.clientX, e.clientY);
        if (!local) return;
        captureCanvasInteractionPointer(e);

        if (canvasState.penTool === "erase") {
          isErasingPathRef.current = true;
          pathEraseChangedRef.current = false;
          lastErasePointRef.current = null;
          erasePathStrokeFromClient(e);
          const svg = svgRef.current;
          if (svg) svg.style.cursor = "cell";
          return;
        }

        canvasActions.beginPathStroke({
          ...localToWorldPoint(local),
          pressure: e.pressure,
          timestamp: e.timeStamp,
          pointerType: e.pointerType,
        });
        startLiveStrokeRender();
        const svg = svgRef.current;
        if (svg) svg.style.cursor = "crosshair";
        return;
      }

      const isRightButton = e.button === 2;
      if (isRightButton) {
        e.preventDefault();
        captureCanvasInteractionPointer(e);
        canvasActions.setActiveCanvasGroup(null);
        const local = getLocalPointFromClient(e.clientX, e.clientY);
        if (!local) return;

        const pos = localToWorldPoint(local);
        canvasState.selectionMode = "zoom";
        setSelectionBox({ start: pos, current: pos });
        return;
      }

      const isLeftButton = e.button === 0;

      if (isLeftButton && isCanvasBackgroundPointerEvent(e)) {
        e.preventDefault();
        captureCanvasInteractionPointer(e);
        canvasActions.setActiveCanvasGroup(null);
        const local = getLocalPointFromClient(e.clientX, e.clientY);
        if (!local) return;
        const pos = localToWorldPoint(local);
        selectionAppendRef.current = !!(e.shiftKey || e.metaKey || e.ctrlKey);
        canvasState.selectionMode = "select";
        if (!selectionAppendRef.current) {
          clearSelection();
        }
        setSelectionBox({ start: pos, current: pos });
      }
    },
  );

  const handlePointerMove = useMemoizedFn(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const local = getLocalPointFromClient(e.clientX, e.clientY);
      const { width, height } = canvasState.dimensions;
      const isInsideCanvas =
        local !== null &&
        local.x >= 0 &&
        local.y >= 0 &&
        local.x <= width &&
        local.y <= height;
      canvasState.cursorLocalPoint = isInsideCanvas ? local : null;

      if (
        multiScaleRef.current.active &&
        multiScaleRef.current.pointerId === e.pointerId
      ) {
        e.preventDefault();
        updateScaleSessionFromClient(e);
        return;
      }
      if (!isCanvasInteractionPointer(e.pointerId)) return;

      if (isErasingPathRef.current) {
        e.preventDefault();
        erasePathStrokeFromClient(e);
        return;
      }
      if (canvasState.isDrawingPath) {
        e.preventDefault();
        appendPathPointFromClient(e);
        return;
      }

      if (isPanningRef.current) {
        e.preventDefault();
        updateCanvasPanFromClient(e);
        return;
      }

      if (canvasState.selectionBox.start) {
        e.preventDefault();
        updateSelectionBoxFromClient(e);
      }
    },
  );

  const handlePointerLeave = () => {
    canvasState.cursorLocalPoint = null;
  };

  const handlePointerUp = useMemoizedFn(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (
        multiScaleRef.current.active &&
        multiScaleRef.current.pointerId === e.pointerId
      ) {
        e.preventDefault();
        updateScaleSessionFromClient(e);
        finishScaleSession();
        return;
      }
      if (!isCanvasInteractionPointer(e.pointerId)) return;

      if (isErasingPathRef.current) {
        e.preventDefault();
        erasePathStrokeFromClient(e);
        finishPathErase();
        releaseCanvasInteractionPointer(e.currentTarget, e.pointerId);
        const svg = svgRef.current;
        if (svg) {
          svg.style.cursor = getCanvasIdleCursor();
        }
        return;
      }
      if (canvasState.isDrawingPath) {
        e.preventDefault();
        finishPathDrawing(e);
        releaseCanvasInteractionPointer(e.currentTarget, e.pointerId);
        return;
      }

      if (
        isPanningRef.current ||
        canvasState.selectionBox.start ||
        canvasState.selectionBox.current
      ) {
        e.preventDefault();
        updateSelectionBoxFromClient(e);
        finishCanvasPointerInteraction(e);
        releaseCanvasInteractionPointer(e.currentTarget, e.pointerId);
      }
    },
  );

  const handlePointerCancel = useMemoizedFn(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (
        multiScaleRef.current.active &&
        multiScaleRef.current.pointerId === e.pointerId
      ) {
        e.preventDefault();
        finishScaleSession();
        return;
      }
      if (!isCanvasInteractionPointer(e.pointerId)) return;

      if (isErasingPathRef.current) {
        e.preventDefault();
        finishPathErase();
        releaseCanvasInteractionPointer(e.currentTarget, e.pointerId);
        return;
      }
      if (canvasState.isDrawingPath) {
        e.preventDefault();
        finishPathDrawing();
        releaseCanvasInteractionPointer(e.currentTarget, e.pointerId);
        return;
      }

      if (
        isPanningRef.current ||
        canvasState.selectionBox.start ||
        canvasState.selectionBox.current
      ) {
        e.preventDefault();
        finishCanvasPointerInteraction();
        releaseCanvasInteractionPointer(e.currentTarget, e.pointerId);
      }
    },
  );

  useEffect(() => {
    const handleWindowInteractionEnd = (event: PointerEvent) => {
      if (multiScaleRef.current.active) {
        if (multiScaleRef.current.pointerId === event.pointerId) {
          finishScaleSession();
        }
      }

      if (canvasInteractionPointerIdRef.current === event.pointerId) {
        if (canvasState.isDrawingPath) {
          if (event.type === "pointerup") {
            finishPathDrawing(event);
          } else {
            finishPathDrawing();
          }
        }
        if (isErasingPathRef.current) {
          finishPathErase();
        }
        if (
          isPanningRef.current ||
          canvasState.selectionBox.start ||
          canvasState.selectionBox.current
        ) {
          finishCanvasPointerInteraction(
            event.type === "pointerup" ? event : undefined,
          );
        }
        canvasInteractionPointerIdRef.current = null;
      }

      const svg = svgRef.current;
      if (svg) {
        svg.style.cursor = getCanvasIdleCursor();
      }
    };
    window.addEventListener("pointerup", handleWindowInteractionEnd);
    window.addEventListener("pointercancel", handleWindowInteractionEnd);
    return () => {
      window.removeEventListener("pointerup", handleWindowInteractionEnd);
      window.removeEventListener("pointercancel", handleWindowInteractionEnd);
    };
  }, [
    computeMultiSelectUnion,
    finishCanvasPointerInteraction,
    finishPathErase,
    finishPathDrawing,
    finishScaleSession,
    getCanvasIdleCursor,
    getSelectedIds,
    setMultiSelectUnion,
  ]);

  const handleAutoLayout = useMemoizedFn(() => {
    const targetItems = getContainLayoutTargetItems();
    if (targetItems.length > 0) {
      if (targetItems.length >= 2) {
        const bbox = getItemsBoundingBox(targetItems);
        const minX = bbox?.x ?? 0;
        const minY = bbox?.y ?? 0;

        canvasActions.autoLayoutCanvas(
          targetItems.map((item) => item.itemId),
          {
            startX: minX,
            startY: minY,
          },
        );

        setTimeout(() => {
          setMultiSelectUnion(computeMultiSelectUnion(getSelectedIds()));
        }, 0);
        return;
      }
    }

    canvasActions.autoLayoutCanvas();
    const items = canvasState.canvasItems || [];
    const bbox = getItemsBoundingBox(items);
    if (!bbox) return;

    zoomToBounds(bbox, 50);
  });

  useEffect(() => {
    const handleLayoutEvent = () => handleAutoLayout();
    window.addEventListener(CANVAS_AUTO_LAYOUT, handleLayoutEvent);
    return () => {
      window.removeEventListener(CANVAS_AUTO_LAYOUT, handleLayoutEvent);
    };
  }, [handleAutoLayout]);

  const handleFlipSelection = useMemoizedFn(() => {
    const selectedItems = getSelectedItems();
    if (selectedItems.length === 0) return;

    let hasChanges = false;
    selectedItems.forEach((item) => {
      if (item.type === "image") {
        const currentFlipX = item.flipX === true;
        canvasActions.updateCanvasImageSilent(item.itemId, {
          flipX: !currentFlipX,
        });
        hasChanges = true;
      }
    });

    if (hasChanges) {
      canvasActions.commitCanvasChange();
    }
    setTimeout(() => {
      setMultiSelectUnion(computeMultiSelectUnion(getSelectedIds()));
    }, 0);
  });

  const handleFlipYSelection = useMemoizedFn(() => {
    const selectedItems = getSelectedItems();
    if (selectedItems.length === 0) return;

    let hasChanges = false;
    selectedItems.forEach((item) => {
      if (item.type === "image") {
        const currentFlipY = item.flipY === true;
        canvasActions.updateCanvasImageSilent(item.itemId, {
          flipY: !currentFlipY,
        });
        hasChanges = true;
      }
    });

    if (hasChanges) {
      canvasActions.commitCanvasChange();
    }
    setTimeout(() => {
      setMultiSelectUnion(computeMultiSelectUnion(getSelectedIds()));
    }, 0);
  });

  useHotkeys(
    "mod+f",
    (e) => {
      e.preventDefault();
      handleFlipSelection();
    },
    { preventDefault: true },
    [handleFlipSelection],
  );

  const handleDeleteSelection = useMemoizedFn(() => {
    const ids = Array.from(getSelectedIds());
    if (ids.length === 0) return;
    canvasActions.removeManyFromCanvas(ids);
    clearSelection();
  });

  // Cleanup: removed manual keydown for undo/redo/delete as they are handled by useHotkeys

  const handleDragStart = useMemoizedFn(
    (id: string, client: { clientX: number; clientY: number }) => {
      const pos = getWorldPointFromClient({
        x: client.clientX,
        y: client.clientY,
      }) || { x: 0, y: 0 };

      const currentSelected = getSelectedIds();
      if (!currentSelected.has(id)) {
        // Should not happen usually as selection is handled before drag
        multiDragRef.current = {
          active: false,
          draggedId: null,
          anchor: null,
          snapshots: new Map(),
        };
        return;
      }

      const snapshots = new Map<string, { x: number; y: number }>();
      currentSelected.forEach((selectedId) => {
        // 从 proxy 读取最新位置，避免 snapshot 未刷新导致第二次拖拽漂移
        const target = canvasState.canvasItems.find(
          (it) => it.itemId === selectedId,
        );
        if (target) snapshots.set(selectedId, { x: target.x, y: target.y });
      });
      multiDragRef.current = {
        active: true,
        draggedId: id,
        anchor: pos,
        snapshots,
      };
    },
  );

  const startScaleSession = useMemoizedFn(
    (
      targetIds: Set<string>,
      union: { x: number; y: number; width: number; height: number },
      startPoint: { x: number; y: number } | null,
      pointerId: number,
    ) => {
      if (targetIds.size === 0) return;
      if (union.width <= 0 || union.height <= 0) return;
      const snapshots = new Map<
        string,
        {
          type: CanvasItem["type"];
          x: number;
          y: number;
          scale: number;
          fontSize?: number;
        }
      >();
      targetIds.forEach((selectedId) => {
        // 缩放会话必须读取 proxy 的最新位置，避免拖拽后立刻缩放时命中旧快照导致回跳。
        const target = canvasState.canvasItems.find(
          (it) => it.itemId === selectedId,
        );
        if (!target) return;
        if (target.type === "text") {
          snapshots.set(selectedId, {
            type: "text",
            x: target.x,
            y: target.y,
            scale: target.scale || 1,
            fontSize: target.fontSize || 24,
          });
          return;
        }
        snapshots.set(selectedId, {
          type: target.type,
          x: target.x,
          y: target.y,
          scale: target.scale || 1,
        });
      });
      if (snapshots.size === 0) return;
      const anchor = { x: union.x, y: union.y };
      const startDistance = Math.max(
        1,
        startPoint
          ? Math.hypot(startPoint.x - anchor.x, startPoint.y - anchor.y)
          : Math.hypot(union.width, union.height),
      );
      multiScaleRef.current = {
        active: true,
        anchor,
        startUnion: { ...union },
        startDistance,
        scale: 1,
        pointerId,
        snapshots,
      };
      const svg = svgRef.current;
      if (svg) svg.style.cursor = "nwse-resize";
    },
  );

  const handleGroupScaleStart = useMemoizedFn(
    (client: { x: number; y: number; pointerId: number }) => {
      const selectedItems = getSelectedItems();
      if (selectedItems.length <= 1) return;
      const union = getItemsBoundingBox(selectedItems);
      if (!union) return;
      const currentSelected = new Set(selectedItems.map((item) => item.itemId));
      const startPoint = getWorldPointFromClient(client);
      startScaleSession(currentSelected, union, startPoint, client.pointerId);
    },
  );

  const handleItemScaleStart = useMemoizedFn(
    (id: string, client: { x: number; y: number; pointerId: number }) => {
      const target = canvasState.canvasItems.find((it) => it.itemId === id);
      if (!target) return;
      const scale = target.scale || 1;
      const width = target.width || 0;
      const height = target.height || 0;
      const rotation = target.rotation || 0;

      const rawW = width * scale;
      const rawH = height * scale;

      if (rawW <= 0 || rawH <= 0) return;

      const bbox = getRenderBbox(rawW, rawH, rotation);

      const union = {
        x: target.x + bbox.offsetX,
        y: target.y + bbox.offsetY,
        width: bbox.width,
        height: bbox.height,
      };
      const startPoint = getWorldPointFromClient(client);
      startScaleSession(new Set([id]), union, startPoint, client.pointerId);
    },
  );

  const handleRotateItemStart = useMemoizedFn(
    (id: string, client: { x: number; y: number; pointerId: number }) => {
      const target = canvasState.canvasItems.find((item) => item.itemId === id);
      if (!target) return;
      const viewport = canvasState.canvasViewport;
      const centerX = target.x * viewport.scale + viewport.x;
      const centerY = target.y * viewport.scale + viewport.y;

      const onPointerMove = (ev: PointerEvent) => {
        if (ev.pointerId !== client.pointerId) {
          return;
        }
        const dx = ev.clientX - centerX;
        const dy = ev.clientY - centerY;
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        let rotation = angle + 90;

        if (ev.shiftKey) {
          rotation = Math.round(rotation / 45) * 45;
        }
        canvasActions.updateCanvasImageSilent(id, { rotation });
      };

      const finishRotate = (ev: PointerEvent) => {
        if (ev.pointerId !== client.pointerId) {
          return;
        }
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", finishRotate);
        window.removeEventListener("pointercancel", finishRotate);
        canvasActions.commitCanvasChange();
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", finishRotate);
      window.addEventListener("pointercancel", finishRotate);
    },
  );

  const handleFlipItem = useMemoizedFn((id: string) => {
    const target = canvasState.canvasItems.find((item) => item.itemId === id);
    if (!target || target.type !== "image") return;
    const currentFlipX = target.flipX === true;
    canvasActions.updateCanvasImage(id, {
      flipX: !currentFlipX,
    });
  });

  const handleFlipYItem = useMemoizedFn((id: string) => {
    const target = canvasState.canvasItems.find((item) => item.itemId === id);
    if (!target || target.type !== "image") return;
    const currentFlipY = target.flipY === true;
    canvasActions.updateCanvasImage(id, {
      flipY: !currentFlipY,
    });
  });

  const handleDragMove = useMemoizedFn(
    (id: string, delta: { dx: number; dy: number }) => {
      const multi = multiDragRef.current;
      if (!multi.active || multi.draggedId !== id) return;
      const scale = canvasState.canvasViewport.scale || 1;
      const dx = delta.dx / scale;
      const dy = delta.dy / scale;
      multi.snapshots.forEach((start, selectedId) => {
        canvasActions.updateCanvasImageTransient(selectedId, {
          x: start.x + dx,
          y: start.y + dy,
        });
      });
      setMultiSelectUnion(computeMultiSelectUnion(getSelectedIds()));
    },
  );

  const handleDragEnd = useMemoizedFn(
    (id: string, delta: { dx: number; dy: number }) => {
      const multi = multiDragRef.current;
      if (!multi.active || multi.draggedId !== id) return;
      const scale = canvasState.canvasViewport.scale || 1;
      const dx = delta.dx / scale;
      const dy = delta.dy / scale;
      multi.snapshots.forEach((start, selectedId) => {
        canvasActions.updateCanvasImageSilent(selectedId, {
          x: start.x + dx,
          y: start.y + dy,
        });
      });
      canvasActions.attachItemsToContainingGroups(
        Array.from(multi.snapshots.keys()),
      );
      canvasActions.commitCanvasChange();
      multiDragRef.current = {
        active: false,
        draggedId: null,
        anchor: null,
        snapshots: new Map(),
      };
      setMultiSelectUnion(computeMultiSelectUnion(getSelectedIds()));
    },
  );

  const handleDragCancel = useMemoizedFn((id: string) => {
    const multi = multiDragRef.current;
    if (!multi.active || multi.draggedId !== id) return;

    multi.snapshots.forEach((start, selectedId) => {
      canvasActions.updateCanvasImageTransient(selectedId, {
        x: start.x,
        y: start.y,
      });
    });
    multiDragRef.current = {
      active: false,
      draggedId: null,
      anchor: null,
      snapshots: new Map(),
    };
    setMultiSelectUnion(computeMultiSelectUnion(getSelectedIds()));
  });

  const handleImageDragOut = useMemoizedFn(
    (id: string, pos: { clientX: number; clientY: number }) => {
      void pos;
      const imagePaths = getLocalImageDragPaths(id);
      if (imagePaths.length === 0) return null;
      const startImageFileDrag = window.electron?.startImageFileDrag;
      const prepareImageFileDrag = window.electron?.prepareImageFileDrag;
      if (!startImageFileDrag || !prepareImageFileDrag) return null;

      const canvasName = canvasState.currentCanvasName;
      return () => {
        void (async () => {
          try {
            const prepared = await prepareImageFileDrag({
              imagePaths,
              canvasName,
            });
            if (!prepared.success || !prepared.sources?.length) {
              console.error("Failed to prepare image file drag", prepared.error);
              return;
            }

            markOutgoingImageFileDrag({ sources: prepared.sources });

            const result = await startImageFileDrag({
              filePaths: prepared.sources.map((source) => source.filePath),
              canvasName,
            });
            if (result.success) return;
            clearOutgoingImageFileDrag();
            console.error("Failed to start image file drag", result.error);
          } catch (error: unknown) {
            clearOutgoingImageFileDrag();
            console.error("Failed to start image file drag", error);
          }
        })();
      };
    },
  );

  const handleGroupSelect = useMemoizedFn((groupId: string) => {
    // 点击编组空白区域时，切换到编组态并清空节点选中，避免 group / node 选中态并存。
    clearSelection();
    canvasActions.setActiveCanvasGroup(groupId);
  });

  const handleGroupDragStart = useMemoizedFn(
    (groupId: string, client: { clientX: number; clientY: number }) => {
      void client;
      const group = canvasState.canvasGroups.find(
        (item) => item.groupId === groupId,
      );
      if (!group) return;
      const snapshots = new Map<string, { x: number; y: number }>();
      group.items.forEach((itemId) => {
        const item = canvasState.canvasItems.find(
          (entry) => entry.itemId === itemId,
        );
        if (!item) return;
        snapshots.set(itemId, { x: item.x, y: item.y });
      });
      if (snapshots.size === 0) return;
      groupDragRef.current = {
        active: true,
        groupId,
        snapshots,
      };
      canvasActions.setActiveCanvasGroup(groupId);
    },
  );

  const handleGroupDragMove = useMemoizedFn(
    (groupId: string, delta: { dx: number; dy: number }) => {
      const drag = groupDragRef.current;
      if (!drag.active || drag.groupId !== groupId) return;
      const scale = canvasState.canvasViewport.scale || 1;
      const dx = delta.dx / scale;
      const dy = delta.dy / scale;
      drag.snapshots.forEach((start, itemId) => {
        canvasActions.updateCanvasImageTransient(itemId, {
          x: start.x + dx,
          y: start.y + dy,
        });
      });
      setMultiSelectUnion(computeMultiSelectUnion(getSelectedIds()));
    },
  );

  const handleGroupDragEnd = useMemoizedFn(
    (groupId: string, delta: { dx: number; dy: number }) => {
      const drag = groupDragRef.current;
      if (!drag.active || drag.groupId !== groupId) return;
      const scale = canvasState.canvasViewport.scale || 1;
      const dx = delta.dx / scale;
      const dy = delta.dy / scale;

      if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
        drag.snapshots.forEach((start, itemId) => {
          canvasActions.updateCanvasImageSilent(itemId, {
            x: start.x + dx,
            y: start.y + dy,
          });
        });
        canvasActions.commitCanvasChange();
      }

      groupDragRef.current = {
        active: false,
        groupId: null,
        snapshots: new Map(),
      };
      setMultiSelectUnion(computeMultiSelectUnion(getSelectedIds()));
    },
  );

  const handleCanvasGroupCollapseToggle = useMemoizedFn((groupId: string) => {
    canvasActions.toggleCanvasGroupCollapse(groupId);
    setMultiSelectUnion(computeMultiSelectUnion(getSelectedIds()));
  });

  const handleCanvasGroupUngroup = useMemoizedFn((groupId: string) => {
    canvasActions.ungroupCanvasGroup(groupId);
    setMultiSelectUnion(computeMultiSelectUnion(getSelectedIds()));
  });

  const handleCanvasGroupColorPickerToggle = useMemoizedFn(
    (groupId: string) => {
      canvasActions.toggleCanvasGroupColorPicker(groupId);
    },
  );

  const handleCanvasGroupColorChange = useMemoizedFn(
    (groupId: string, color: string) => {
      canvasActions.setCanvasGroupColor(groupId, color);
    },
  );

  const handleCanvasGroupContain = useMemoizedFn((groupId: string) => {
    const group = canvasState.canvasGroups.find(
      (item) => item.groupId === groupId,
    );
    if (!group) return;

    if (group.collapse) {
      canvasActions.toggleCanvasGroupCollapse(groupId);
    }

    const bounds = getCanvasGroupBounds(group, canvasState.canvasItems);
    if (!bounds) return;
    toggleContainCanvasBounds(bounds);
  });

  const handleItemSelect = useMemoizedFn(
    (
      id: string,
      e: React.MouseEvent<SVGGElement> | React.PointerEvent<SVGGElement>,
    ) => {
      if (selectionBox.start) return;
      const target = canvasState.canvasItems.find((item) => item.itemId === id);
      if (!target) return;

      if (!e.shiftKey && !e.metaKey && !e.ctrlKey) {
        canvasActions.bringToFront(id);
        if (target.isSelected) {
          setPrimaryId(id);
          const parentGroup = canvasState.canvasGroups.find((group) =>
            group.items.includes(id),
          );
          canvasActions.setActiveCanvasGroup(parentGroup?.groupId ?? null);
          return;
        }
        canvasState.canvasItems.forEach((item) => {
          item.isSelected = item.itemId === id;
        });
        setPrimaryId(id);
        setMultiSelectUnion(null);
        const parentGroup = canvasState.canvasGroups.find((group) =>
          group.items.includes(id),
        );
        canvasActions.setActiveCanvasGroup(parentGroup?.groupId ?? null);
        return;
      }

      target.isSelected = !target.isSelected;
      if (target.isSelected) {
        setPrimaryId(id);
      } else if (primaryId === id) {
        const nextPrimary = Array.from(getSelectedIds())[0] || null;
        setPrimaryId(nextPrimary);
      }
      setMultiSelectUnion(computeMultiSelectUnion(getSelectedIds()));
      const parentGroup = canvasState.canvasGroups.find((group) =>
        group.items.includes(id),
      );
      canvasActions.setActiveCanvasGroup(parentGroup?.groupId ?? null);
    },
  );

  const handleCommitItem = useMemoizedFn(
    (id: string, newAttrs: Partial<CanvasItem>) => {
      canvasActions.updateCanvasImage(id, newAttrs);
      setMultiSelectUnion(computeMultiSelectUnion(getSelectedIds()));
    },
  );

  const handleDeleteItem = useMemoizedFn((id: string) => {
    canvasActions.removeFromCanvas(id);
    const selectedIds = getSelectedIds();
    if (primaryId === id) {
      const nextPrimary = Array.from(selectedIds)[0] || null;
      setPrimaryId(nextPrimary);
    }
    setMultiSelectUnion(computeMultiSelectUnion(selectedIds));
  });

  const handleCommitEnter = useMemoizedFn((id: string) => {
    const selectedIds = getSelectedIds();
    if (!(selectedIds.size === 1 && selectedIds.has(id))) {
      return;
    }
    canvasState.canvasItems.forEach((item) => {
      item.isSelected = false;
    });
    const nextPrimary = primaryId === id ? null : primaryId;
    setPrimaryId(nextPrimary);
    setMultiSelectUnion(null);
  });

  const filterStyle = useMemo(() => {
    return getCssFilters(canvasFilters);
  }, [canvasFilters]);

  const globalSnap = useSnapshot(globalState);
  const contextMenuPosition = useMemo(() => {
    const menuWidth = 320;
    const padding = 8;
    const maxX = Math.max(
      padding,
      (dimensions.width || 0) - menuWidth - padding,
    );

    const style: React.CSSProperties = {
      left: Math.min(contextMenu.x, maxX),
    };

    // 如果点击位置靠近底部（阈值 300px），使用 bottom 定位让菜单向上生长
    const threshold = (dimensions.height || 0) - 300;
    if (contextMenu.y > threshold) {
      style.bottom = Math.max(
        padding,
        (dimensions.height || 0) - contextMenu.y,
      );
    } else {
      style.top = contextMenu.y;
    }

    return style;
  }, [contextMenu.x, contextMenu.y, dimensions.height, dimensions.width]);

  return (
    <div
      ref={containerRef}
      className={`flex-1 h-full overflow-hidden relative transition-colors outline-none focus:outline-none`}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
      onMouseEnter={handleCanvasMouseEnter}
    >
      <CanvasToolbar
        canvasFilters={canvasFilters}
        showMinimap={showMinimap}
        isPenMode={isPenMode}
        penTool={penTool}
        penStrokeColor={penStrokeColor}
        penStrokeWidth={penStrokeWidth}
        penColorSlots={penColorSlots}
        onFiltersChange={(filters) => canvasActions.setCanvasFilters(filters)}
        onTogglePenMode={() => canvasActions.togglePenMode()}
        onTogglePenErase={() => canvasActions.togglePenEraseTool()}
        onPenStrokeColorChange={(color) =>
          canvasActions.setPenStrokeColor(color)
        }
        onPenColorSlotChange={(index, color) =>
          canvasActions.setPenColorSlot(index, color)
        }
        onPenStrokeWidthChange={(width) =>
          canvasActions.setPenStrokeWidth(width)
        }
        onToggleMinimap={() => canvasActions.toggleMinimap()}
        onAutoLayout={handleAutoLayout}
      />

      {contextMenu.visible && !shouldEnableMouseThrough && (
        <>
          <button
            type="button"
            className="absolute inset-0 z-40 cursor-default"
            onMouseDown={closeContextMenu}
            aria-label={t("common.close")}
          />
          <div
            className="absolute z-50 w-80 rounded-lg border border-neutral-700 bg-neutral-900/95 shadow-2xl backdrop-blur-sm no-drag text-xs"
            style={contextMenuPosition}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="max-h-[280px] overflow-y-auto p-2 dark-scrollbar">
              {visibleCommands.length === 0 && (
                <div className="px-2 py-4 text-xs text-neutral-500">
                  {t("commandPalette.empty")}
                </div>
              )}
              {visibleCommands.map((command) => {
                const title = getCommandTitle(command, t);
                const description = getCommandDescription(command, t);
                return (
                  <button
                    key={command.id}
                    type="button"
                    className="w-full px-2 py-2 rounded text-left hover:bg-neutral-800/80 transition-colors"
                    onClick={() => void handleRunContextMenuCommand(command)}
                  >
                    <div className="text-xs text-neutral-100">{title}</div>
                    {description && (
                      <div className="mt-0.5 text-[11px] text-neutral-500">
                        {description}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {canvasItems.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
          <div className="flex flex-col items-center gap-6 p-8">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl transform scale-150" />
              <div className="relative w-24 h-24 rounded-2xl bg-neutral-800/90 border-2 border-dashed border-neutral-600 flex items-center justify-center transform rotate-3 transition-transform duration-500 hover:rotate-6 hover:scale-105">
                <ImagePlus className="w-10 h-10 text-neutral-400" />
              </div>
              <div className="absolute -right-4 -bottom-2 w-16 h-16 rounded-xl bg-neutral-900 border-2 border-dashed border-neutral-600 flex items-center justify-center transform -rotate-6 shadow-lg">
                <Upload className="w-6 h-6 text-primary/60" />
              </div>
            </div>

            <div className="text-center space-y-2 max-w-sm">
              <h3 className="text-xl font-semibold text-neutral-100">
                {t("canvas.empty.title")}
              </h3>
              <p className="text-sm text-neutral-400 leading-relaxed">
                {t("canvas.empty.dragHint")}
              </p>
            </div>

            {/* 装饰性元素：快捷键提示 */}
            <div className="flex items-center gap-4 text-xs text-neutral-400 font-mono mt-4">
              <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-neutral-800/50 border border-neutral-700">
                <MousePointer2 className="w-3 h-3" />
                <span>{t("canvas.empty.panHint")}</span>
              </span>
              <span className="w-1 h-1 rounded-full bg-neutral-700" />
              <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-neutral-800/50 border border-neutral-700">
                <span>{t("canvas.empty.zoomHint")}</span>
              </span>
            </div>
          </div>
        </div>
      )}

      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        style={{
          cursor: penCursor,
          touchAction: "none",
          userSelect: "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onWheel={handleWheel}
      >
        <defs>
          <filter id="posterizeFilter">
            <feComponentTransfer>
              <feFuncR type="discrete" tableValues="0 .2 .4 .6 .8 1" />
              <feFuncG type="discrete" tableValues="0 .2 .4 .6 .8 1" />
              <feFuncB type="discrete" tableValues="0 .2 .4 .6 .8 1" />
            </feComponentTransfer>
          </filter>
        </defs>
        <g
          id="canvas-content-layer"
          transform={`translate(${canvasViewport.x} ${canvasViewport.y}) scale(${canvasViewport.scale})`}
          style={{
            filter: filterStyle,
            willChange: "transform",
            opacity: globalSnap.canvasOpacity,
          }}
        >
          <CanvasGroupsLayer
            groups={canvasGroups}
            items={canvasItems}
            stageScale={stageScale}
            colorSwatches={appSnap.colorSwatches}
            activeGroupId={activeCanvasGroupId}
            activeColorPickerGroupId={activeCanvasGroupColorPickerId}
            isPenMode={isPenMode}
            onGroupSelect={handleGroupSelect}
            onGroupDragStart={handleGroupDragStart}
            onGroupDragMove={handleGroupDragMove}
            onGroupDragEnd={handleGroupDragEnd}
            onGroupCollapseToggle={handleCanvasGroupCollapseToggle}
            onGroupUngroup={handleCanvasGroupUngroup}
            onGroupColorPickerToggle={handleCanvasGroupColorPickerToggle}
            onGroupColorChange={handleCanvasGroupColorChange}
            onGroupContain={handleCanvasGroupContain}
            renderMode="rects"
          />
          <CanvasItemsLayer
            items={visibleCanvasItems}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
            onImageDragOut={handleImageDragOut}
            onItemSelect={handleItemSelect}
            onContainItem={handleContainItem}
            onCommitItem={handleCommitItem}
            onCommitEnter={handleCommitEnter}
          />
          <SelectOverlay
            stageScale={stageScale}
            isSelectionBoxActive={selectionBox.start !== null}
            onDeleteSelection={handleDeleteSelection}
            onFlipSelection={handleFlipSelection}
            onFlipYSelection={handleFlipYSelection}
            onScaleStart={handleGroupScaleStart}
            onDeleteItem={handleDeleteItem}
            onFlipItem={handleFlipItem}
            onFlipYItem={handleFlipYItem}
            onRotateItemStart={handleRotateItemStart}
            onScaleStartItem={handleItemScaleStart}
            onCommitItem={handleCommitItem}
          />
          <CanvasGroupsLayer
            groups={canvasGroups}
            items={canvasItems}
            stageScale={stageScale}
            colorSwatches={appSnap.colorSwatches}
            activeGroupId={activeCanvasGroupId}
            activeColorPickerGroupId={activeCanvasGroupColorPickerId}
            isPenMode={isPenMode}
            onGroupSelect={handleGroupSelect}
            onGroupDragStart={handleGroupDragStart}
            onGroupDragMove={handleGroupDragMove}
            onGroupDragEnd={handleGroupDragEnd}
            onGroupCollapseToggle={handleCanvasGroupCollapseToggle}
            onGroupUngroup={handleCanvasGroupUngroup}
            onGroupColorPickerToggle={handleCanvasGroupColorPickerToggle}
            onGroupColorChange={handleCanvasGroupColorChange}
            onGroupContain={handleCanvasGroupContain}
            renderMode="controls"
          />
          {!shouldEnableMouseThrough && !isPenMode && (
            <SelectionRect
              selectionBox={selectionBox}
              stageScale={stageScale}
              isZoomMode={selectionMode === "zoom"}
            />
          )}
        </g>
      </svg>
      {/* overlay canvas: 绘制中实时笔画预览， pointer-events:none 不拦截交互 */}
      <canvas
        ref={liveStrokeCanvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          display: "block",
        }}
      />
      {showMinimap && !shouldEnableMouseThrough && <Minimap />}
      <ConfirmModal
        isOpen={isClearModalOpen}
        title={t("canvas.clearCanvasTitle")}
        message={t("canvas.clearCanvasMessage")}
        confirmText={t("canvas.clearCanvasConfirm")}
        variant="danger"
        onConfirm={() => {
          canvasActions.clearCanvas();
          setIsClearModalOpen(false);
        }}
        onCancel={() => setIsClearModalOpen(false)}
      />
    </div>
  );
};
