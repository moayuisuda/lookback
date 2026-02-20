import React, { useRef, useEffect, useMemo } from "react";
import { useMemoizedFn } from "ahooks";
import { useHotkeys } from "react-hotkeys-hook";
import { debounce } from "radash";
import {
  canvasState,
  canvasActions,
  getRenderBbox,
  type CanvasItem,
  type CanvasImage as CanvasImageState,
  type CanvasText as CanvasTextState,
  type ImageMeta,
} from "../store/canvasStore";
import { anchorActions } from "../store/anchorStore";
import { commandActions, commandState } from "../store/commandStore";
import { globalActions, globalState } from "../store/globalStore";
import { useSnapshot, type Snapshot } from "valtio";
import { API_BASE_URL } from "../config";
import { ConfirmModal } from "./ConfirmModal";
import { Minimap } from "./canvas/Minimap";
import { CanvasText } from "./canvas/CanvasText";
import { CanvasImage } from "./canvas/CanvasImage";
import { CanvasToolbar } from "./canvas/CanvasToolbar";
import { SelectOverlay } from "./canvas/SelectOverlay";
import {
  SelectionRect,
  type SelectionBoxState,
  MIN_ZOOM_AREA,
} from "./canvas/SelectionRect";
import { useT } from "../i18n/useT";
import { createTempMetasFromFiles, scanDroppedItems } from "../utils/import";
import { CANVAS_AUTO_LAYOUT, CANVAS_ZOOM_TO_FIT } from "../events/uiEvents";
import { getCssFilters } from "../utils/imageFilters";
import { ImagePlus, Upload, MousePointer2 } from "lucide-react";
import { getCommandContext, getCommands } from "../commands";
import { getCommandDescription, getCommandTitle } from "../commands/display";
import type { CommandDefinition } from "../commands/types";

const createDroppedImageMeta = (file: {
  path?: string;
  storedFilename: string;
  originalName: string;
  dominantColor?: string | null;
  tone?: string | null;
  width: number;
  height: number;
}): ImageMeta => {
  const name = file.originalName.trim() || "image";
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return {
    id: `temp_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    filename: base,
    imagePath: file.storedFilename,
    pageUrl: undefined,
    tags: [],
    createdAt: Date.now(),
    dominantColor: file.dominantColor ?? null,
    tone: file.tone ?? null,
    hasVector: false,
    width: file.width,
    height: file.height,
  };
};

type CanvasItemsLayerProps = {
  items: readonly Snapshot<CanvasItem>[];
  onDragStart: (
    id: string,
    client: { clientX: number; clientY: number },
  ) => void;
  onDragMove: (id: string, delta: { dx: number; dy: number }) => void;
  onDragEnd: (id: string, delta: { dx: number; dy: number }) => void;
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
    const image = itemState as CanvasImageState;

    return (
      <CanvasImage
        image={image}
        onDragStart={(pos) => onDragStart(itemId, pos)}
        onDragMove={(delta) => onDragMove(itemId, delta)}
        onDragEnd={(delta) => onDragEnd(itemId, delta)}
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
    onItemSelect,
    onContainItem,
    onCommitItem,
    onCommitEnter,
  }: CanvasItemsLayerProps) => {
    console.log('itemsLayer', items)

    return (
      <g>
        {items.map((item) => (
          <CanvasItemRenderer
            key={item.itemId}
            item={item}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
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
    isSpaceDown,
    canvasViewport,
    selectionBox,
    selectionMode,
    canvasItems,
    canvasFilters,
    showMinimap,
    isCanvasToolbarExpanded,
    contextMenu,
  } = canvasSnap;

  const { t } = useT();
  const shouldEnableMouseThrough = appSnap.mouseThrough;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const stageScale = canvasViewport.scale || 1;

  const isPanningRef = useRef(false);
  const lastPanPointRef = useRef<{ x: number; y: number } | null>(null);
  const debouncedCommit = useMemo(
    () =>
      debounce({ delay: 500 }, () => {
        canvasActions.commitCanvasChange();
      }),
    [],
  );
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
    snapshots: Map<
      string,
      {
        type: "image" | "text";
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
    snapshots: new Map(),
  });

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

  void commandSnap.externalCommands;
  const commands = getCommands();
  const commandContext = useMemo(() => getCommandContext(), []);

  const setIsSpaceDown = useMemoizedFn((value: boolean) => {
    canvasState.isSpaceDown = value;
  });

  const isSpaceContainBlockedRef = useRef(false);

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

  const getSelectedCount = useMemoizedFn(() => {
    let count = 0;
    canvasState.canvasItems.forEach((item) => {
      if (item.isSelected) {
        count += 1;
      }
    });
    return count;
  });

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
    const scale = stageScale || 1;
    return {
      x: (point.x - canvasViewport.x) / scale,
      y: (point.y - canvasViewport.y) / scale,
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
    const updateSize = () => {
      if (containerRef.current) {
        canvasState.dimensions = {
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        };
      }
    };
    window.addEventListener("resize", updateSize);
    updateSize();
    return () => window.removeEventListener("resize", updateSize);
  }, [setIsSpaceDown]);

  useEffect(() => {
    if (!containerRef.current) return;
    canvasState.dimensions = {
      width: containerRef.current.offsetWidth,
      height: containerRef.current.offsetHeight,
    };
  }, [appSnap.pinMode]);

  const handleContainItem = useMemoizedFn((id: string) => {
    canvasActions.containCanvasItem(id);
  });

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

        let files: File[] = [];
        try {
          files = await scanDroppedItems(e.dataTransfer);
        } catch (err) {
          console.error("Drop scan error", err);
        }
        if (files.length === 0) {
          files = Array.from(e.dataTransfer.files || []);
        }
        if (!files.length) {
          // Try to extract image URL from HTML first (handles Twitter/X etc.)
          const html = e.dataTransfer.getData("text/html");
          let url = "";
          if (html) {
            const img = new DOMParser()
              .parseFromString(html, "text/html")
              .querySelector("img");
            if (img?.src) {
              url = img.src;
            }
          }
          // Fallback to uri-list or plain text
          if (!url) {
            const urlData =
              e.dataTransfer.getData("text/uri-list") ||
              e.dataTransfer.getData("text/plain");
            if (urlData) {
              url = urlData.split("\n")[0].trim();
            }
          }
          if (
            url &&
            (url.startsWith("http://") || url.startsWith("https://"))
          ) {
            try {
              const resp = await fetch(`${API_BASE_URL}/api/download-url`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  url,
                  canvasName: canvasSnap.currentCanvasName,
                }),
              });
              if (resp.ok) {
                const result = (await resp.json()) as {
                  success?: boolean;
                  filename?: string;
                  path?: string;
                  width?: number;
                  height?: number;
                  dominantColor?: string | null;
                  tone?: string | null;
                };
                if (result.success && result.filename && result.path) {
                  const meta = createDroppedImageMeta({
                    path: result.path,
                    storedFilename: result.path,
                    originalName: result.filename,
                    dominantColor: result.dominantColor ?? null,
                    tone: result.tone ?? null,
                    width: result.width || 0,
                    height: result.height || 0,
                  });
                  canvasActions.addToCanvas(meta, basePoint.x, basePoint.y);
                }
              }
            } catch (err) {
              console.error("URL drop error", err);
            }
          }
          return;
        }

        const imageFiles = files.filter((f) => f.type.startsWith("image/"));
        if (!imageFiles.length) return;

        const metas = await createTempMetasFromFiles(
          imageFiles,
          canvasSnap.currentCanvasName,
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
    const svg = svgRef.current;
    if (!svg) return;

    if (getSelectedCount() > 0) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let hasValidSelection = false;
      const validItems: {
        item: (typeof items)[0];
      }[] = [];

      const items = canvasItems || [];
      items.forEach((item) => {
        if (item.isSelected) {
          const scale = item.scale || 1;
          const rawW = (item.width || 0) * scale;
          const rawH = (item.height || 0) * scale;
          const bbox = getRenderBbox(rawW, rawH, item.rotation || 0);

          const itemMinX = item.x + bbox.offsetX;
          const itemMinY = item.y + bbox.offsetY;
          const itemMaxX = itemMinX + bbox.width;
          const itemMaxY = itemMinY + bbox.height;

          if (itemMinX < minX) minX = itemMinX;
          if (itemMinY < minY) minY = itemMinY;
          if (itemMaxX > maxX) maxX = itemMaxX;
          if (itemMaxY > maxY) maxY = itemMaxY;

          hasValidSelection = true;
          validItems.push({ item });
        }
      });

      if (hasValidSelection && minX !== Infinity) {
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        const scaleBy = 1.1;
        const factor = e.deltaY > 0 ? 1 / scaleBy : scaleBy;

        validItems.forEach(({ item }) => {
          const dx = item.x - centerX;
          const dy = item.y - centerY;

          const newX = centerX + dx * factor;
          const newY = centerY + dy * factor;

          if (item.type === "text") {
            const fontSize = item.fontSize || 24;
            canvasActions.updateCanvasImageSilent(item.itemId, {
              x: newX,
              y: newY,
              fontSize: fontSize * factor,
            });
          } else {
            const scale = item.scale || 1;
            canvasActions.updateCanvasImageSilent(item.itemId, {
              x: newX,
              y: newY,
              scale: scale * factor,
            });
          }
        });

        // Try to update selection box immediately for better visual feedback
        setTimeout(() => {
          setMultiSelectUnion(computeMultiSelectUnion(getSelectedIds()));
        }, 0);

        debouncedCommit();
      }
      return;
    }

    const scaleBy = 1.1;
    const oldScale = canvasViewport.scale;
    const rect = svg.getBoundingClientRect();
    const pointer = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    const mousePointTo = {
      x: (pointer.x - canvasViewport.x) / oldScale,
      y: (pointer.y - canvasViewport.y) / oldScale,
    };

    const newScale = e.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };

    canvasActions.setCanvasViewport({
      x: newPos.x,
      y: newPos.y,
      width: rect.width,
      height: rect.height,
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

  const zoomToBounds = useMemoizedFn(
    (
      bounds: { x: number; y: number; width: number; height: number },
      padding = 50,
    ) => {
      const { width, height, x: minX, y: minY } = bounds;

      if (!Number.isFinite(width) || !Number.isFinite(height)) return;

      const containerWidth = canvasState.dimensions.width;
      const containerHeight = canvasState.dimensions.height;

      const scaleByWidth = (containerWidth - padding * 2) / width;
      const scaleByHeight = (containerHeight - padding * 2) / height;
      const scale = Math.min(scaleByWidth, scaleByHeight);

      const x = (containerWidth - width * scale) / 2 - minX * scale;
      const y = (containerHeight - height * scale) / 2 - minY * scale;

      canvasActions.setCanvasViewport({
        x,
        y,
        width: containerWidth,
        height: containerHeight,
        scale,
      });
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
        isSpaceContainBlockedRef.current = false;
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
        const wasActive = canvasState.isSpaceDown;
        const shouldContain = wasActive && !isSpaceContainBlockedRef.current;
        setIsSpaceDown(false);
        isSpaceContainBlockedRef.current = false;
        if (shouldContain) {
          const selectedItems = getSelectedItems();
          if (selectedItems.length > 1) {
            const bbox = getItemsBoundingBox(selectedItems);
            if (bbox) zoomToBounds(bbox, 0);
          } else if (primaryId) {
            handleContainItem(primaryId);
          } else {
            handleZoomToFit();
          }
        }
        const svg = svgRef.current;
        if (svg && !isPanningRef.current) {
          svg.style.cursor = "default";
        }
      }
    };
    const handleBlur = () => {
      setIsSpaceDown(false);
      isSpaceContainBlockedRef.current = false;
      isPanningRef.current = false;
      lastPanPointRef.current = null;
      const svg = svgRef.current;
      if (svg) svg.style.cursor = "default";
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
    getItemsBoundingBox,
    getSelectedItems,
    handleContainItem,
    handleZoomToFit,
    primaryId,
    setIsSpaceDown,
    zoomToBounds,
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
      closeContextMenu();
      if (command.ui) {
        commandActions.open();
        commandActions.setActiveCommand(command.id);
        return;
      }
      if (command.run) {
        await command.run(commandContext);
      }
    },
  );

  const handleMouseDown = useMemoizedFn(
    (e: React.MouseEvent<SVGSVGElement>) => {
      closeContextMenu();
      if (isSpaceDown && (e.button === 0 || e.button === 1 || e.button === 2)) {
        isSpaceContainBlockedRef.current = true;
      }
      const isSpacePan = isSpaceDown && e.button === 0;
      const isMiddleButton = e.button === 1;
      if (isSpacePan || isMiddleButton) {
        e.preventDefault();
        isPanningRef.current = true;
        lastPanPointRef.current = { x: e.clientX, y: e.clientY };
        const svg = svgRef.current;
        if (svg) svg.style.cursor = "grabbing";
        return;
      }

      const isRightButton = e.button === 2;
      if (isRightButton) {
        e.preventDefault();
        const local = getLocalPointFromClient(e.clientX, e.clientY);
        if (!local) return;

        const pos = localToWorldPoint(local);
        canvasState.selectionMode = "zoom";
        setSelectionBox({ start: pos, current: pos });
        return;
      }

      const isLeftButton = e.button === 0;
      const target = e.target as Element;
      const isBackground =
        target === e.currentTarget || target.id === "canvas-content-layer";

      if (isLeftButton && isBackground) {
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

  const handleMouseMove = useMemoizedFn(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (multiScaleRef.current.active) {
        const current = multiScaleRef.current;
        if (!current.anchor || !current.startUnion) return;
        const local = getLocalPointFromClient(e.clientX, e.clientY);
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
          } else {
            const nextScale = Math.max(0.05, start.scale * scale);
            canvasActions.updateCanvasImageTransient(selectedId, {
              x: nextX,
              y: nextY,
              scale: nextScale,
            });
          }
        });
        setMultiSelectUnion(computeMultiSelectUnion(getSelectedIds()));
        return;
      }
      // Panning (Space held)
      if (isPanningRef.current) {
        const last = lastPanPointRef.current;
        if (!last) return;

        const currentPoint = { x: e.clientX, y: e.clientY };

        const dx = currentPoint.x - last.x;
        const dy = currentPoint.y - last.y;
        // We need to calculate based on the current viewport state in store
        // because stage.x() might not be updated yet in React render cycle
        // However, for smooth dragging, we usually rely on event deltas.
        // Since we are now controlled, we should base on canvasViewport.

        const nextPos = { x: canvasViewport.x + dx, y: canvasViewport.y + dy };

        canvasActions.setCanvasViewport({
          x: nextPos.x,
          y: nextPos.y,
          width: canvasState.dimensions.width,
          height: canvasState.dimensions.height,
          scale: canvasViewport.scale,
        });
        lastPanPointRef.current = currentPoint;
        return;
      }

      // Box Selection
      if (selectionBox.start) {
        const local = getLocalPointFromClient(e.clientX, e.clientY);
        if (!local) return;
        const pos = localToWorldPoint(local);
        canvasState.selectionBox = {
          ...canvasState.selectionBox,
          current: pos,
        };
      }
    },
  );

  const handleMouseUp = useMemoizedFn((e: React.MouseEvent<SVGSVGElement>) => {
    if (multiScaleRef.current.active) {
      const current = multiScaleRef.current;
      const scale = current.scale || 1;
      if (current.anchor) {
        current.snapshots.forEach((start, selectedId) => {
          const nextX =
            current.anchor!.x + (start.x - current.anchor!.x) * scale;
          const nextY =
            current.anchor!.y + (start.y - current.anchor!.y) * scale;
          if (start.type === "text") {
            const nextFontSize = Math.max(8, (start.fontSize || 0) * scale);
            canvasActions.updateCanvasImage(selectedId, {
              x: nextX,
              y: nextY,
              fontSize: nextFontSize,
            });
          } else {
            const nextScale = Math.max(0.05, start.scale * scale);
            canvasActions.updateCanvasImage(selectedId, {
              x: nextX,
              y: nextY,
              scale: nextScale,
            });
          }
        });
      }
      multiScaleRef.current = {
        active: false,
        anchor: null,
        startUnion: null,
        startDistance: 1,
        scale: 1,
        snapshots: new Map(),
      };
      setMultiSelectUnion(computeMultiSelectUnion(getSelectedIds()));
      const svg = svgRef.current;
      if (svg) svg.style.cursor = "default";
      return;
    }
    const svg = svgRef.current;
    if (svg) svg.style.cursor = "default";

    isPanningRef.current = false;
    lastPanPointRef.current = null;

    if (selectionBox.start && selectionBox.current) {
      const x1 = Math.min(selectionBox.start.x, selectionBox.current.x);
      const x2 = Math.max(selectionBox.start.x, selectionBox.current.x);
      const y1 = Math.min(selectionBox.start.y, selectionBox.current.y);
      const y2 = Math.max(selectionBox.start.y, selectionBox.current.y);
      const width = x2 - x1;
      const height = y2 - y1;

      const isClick = width <= 2 && height <= 2;
      const zoomArea =
        width * height * canvasViewport.scale * canvasViewport.scale;
      const shouldZoom = zoomArea >= MIN_ZOOM_AREA;

      if (canvasState.selectionMode === "zoom") {
        if (shouldZoom) {
          zoomToBounds({ x: x1, y: y1, width, height }, 0);
        } else if (!shouldEnableMouseThrough) {
          const local = getLocalPointFromClient(e.clientX, e.clientY);
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
        (canvasItems || []).forEach((item) => {
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
  });

  useEffect(() => {
    const handleWindowMouseUp = () => {
      if (multiScaleRef.current.active) {
        const current = multiScaleRef.current;
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
            } else {
              const nextScale = Math.max(0.05, start.scale * scale);
              canvasActions.updateCanvasImageSilent(selectedId, {
                x: nextX,
                y: nextY,
                scale: nextScale,
              });
            }
          });
          canvasActions.commitCanvasChange();
        }
        multiScaleRef.current = {
          active: false,
          anchor: null,
          startUnion: null,
          startDistance: 1,
          scale: 1,
          snapshots: new Map(),
        };
        setMultiSelectUnion(computeMultiSelectUnion(getSelectedIds()));
      }
      if (canvasState.selectionBox.start || canvasState.selectionBox.current) {
        canvasState.selectionBox = { start: null, current: null };
      }
      isPanningRef.current = false;
      lastPanPointRef.current = null;
      const svg = svgRef.current;
      if (svg) {
        svg.style.cursor = "default";
      }
    };
    window.addEventListener("mouseup", handleWindowMouseUp);
    window.addEventListener("touchend", handleWindowMouseUp);
    return () => {
      window.removeEventListener("mouseup", handleWindowMouseUp);
      window.removeEventListener("touchend", handleWindowMouseUp);
    };
  }, [computeMultiSelectUnion, getSelectedIds, setMultiSelectUnion]);

  const handleAutoLayout = useMemoizedFn(() => {
    const selectedItems = getSelectedItems();
    if (selectedItems.length > 0) {
      const selectedImages = selectedItems.filter(
        (item) => item.type === "image",
      );

      if (selectedImages.length >= 2) {
        const bbox = getItemsBoundingBox(selectedImages);
        const minX = bbox?.x ?? 0;
        const minY = bbox?.y ?? 0;

        canvasActions.autoLayoutCanvas(
          selectedImages.map((item) => item.itemId),
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
      if (item.type !== "text") {
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Undo: Ctrl+Z / Cmd+Z
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "z") {
        e.preventDefault();
        canvasActions.undoCanvas();
        clearSelection();
        return;
      }

      // Redo: Ctrl+Shift+Z / Cmd+Shift+Z
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "Z") {
        e.preventDefault();
        canvasActions.redoCanvas();
        clearSelection();
        return;
      }

      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        getSelectedCount() > 0
      ) {
        canvasActions.removeManyFromCanvas(Array.from(getSelectedIds()));
        clearSelection();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    clearSelection,
    closeContextMenu,
    getSelectedCount,
    getSelectedIds,
    setMultiSelectUnion,
    setPrimaryId,
  ]);

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
        const target = canvasItems.find((it) => it.itemId === selectedId);
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
      startPoint?: { x: number; y: number } | null,
    ) => {
      if (targetIds.size === 0) return;
      if (union.width <= 0 || union.height <= 0) return;
      const snapshots = new Map<
        string,
        {
          type: "image" | "text";
          x: number;
          y: number;
          scale: number;
          fontSize?: number;
        }
      >();
      targetIds.forEach((selectedId) => {
        const target = canvasItems.find((it) => it.itemId === selectedId);
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
        const img = target as CanvasImageState;
        snapshots.set(selectedId, {
          type: "image",
          x: img.x,
          y: img.y,
          scale: img.scale || 1,
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
        snapshots,
      };
      const svg = svgRef.current;
      if (svg) svg.style.cursor = "nwse-resize";
    },
  );

  const handleGroupScaleStart = useMemoizedFn(
    (client: { x: number; y: number }) => {
      const selectedItems = getSelectedItems();
      if (selectedItems.length <= 1) return;
      const union = getItemsBoundingBox(selectedItems);
      if (!union) return;
      const currentSelected = new Set(selectedItems.map((item) => item.itemId));
      const startPoint = getWorldPointFromClient(client);
      startScaleSession(currentSelected, union, startPoint);
    },
  );

  const handleItemScaleStart = useMemoizedFn(
    (id: string, client: { x: number; y: number }) => {
      const target = canvasItems.find((it) => it.itemId === id);
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
      startScaleSession(new Set([id]), union, startPoint);
    },
  );

  const handleRotateItemStart = useMemoizedFn(
    (id: string, client: { x: number; y: number }) => {
      const target = canvasState.canvasItems.find((item) => item.itemId === id);
      if (!target) return;
      void client;
      const viewport = canvasState.canvasViewport;
      const centerX = target.x * viewport.scale + viewport.x;
      const centerY = target.y * viewport.scale + viewport.y;

      const onPointerMove = (ev: PointerEvent) => {
        const dx = ev.clientX - centerX;
        const dy = ev.clientY - centerY;
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        const rotation = angle + 90;
        canvasActions.updateCanvasImageSilent(id, { rotation });
      };

      const onPointerUp = () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        canvasActions.commitCanvasChange();
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
  );

  const handleFlipItem = useMemoizedFn((id: string) => {
    const target = canvasState.canvasItems.find((item) => item.itemId === id);
    if (!target || target.type === "text") return;
    const currentFlipX = target.flipX === true;
    canvasActions.updateCanvasImage(id, {
      flipX: !currentFlipX,
    });
  });

  const handleDragMove = useMemoizedFn(
    (id: string, delta: { dx: number; dy: number }) => {
      const multi = multiDragRef.current;
      if (!multi.active || multi.draggedId !== id) return;
      const scale = canvasViewport.scale;
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
      const scale = canvasViewport.scale;
      const dx = delta.dx / scale;
      const dy = delta.dy / scale;
      multi.snapshots.forEach((start, selectedId) => {
        canvasActions.updateCanvasImageSilent(selectedId, {
          x: start.x + dx,
          y: start.y + dy,
        });
      });
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
          return;
        }
        canvasState.canvasItems.forEach((item) => {
          item.isSelected = item.itemId === id;
        });
        setPrimaryId(id);
        setMultiSelectUnion(null);
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
    },
  );

  const handleDblClick = useMemoizedFn((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.target !== e.currentTarget) return;
    const local = getLocalPointFromClient(e.clientX, e.clientY);
    if (!local) return;
    const pos = localToWorldPoint(local);

    const scale = canvasState.canvasViewport.scale || 1;
    const fontSize = 24 / scale;

    const id = canvasActions.addTextToCanvas(pos.x, pos.y, fontSize);
    canvasState.canvasItems.forEach((item) => {
      item.isSelected = item.itemId === id;
      if (item.itemId === id && item.type === "text") {
        item.isAutoEdit = true;
      }
    });
    setPrimaryId(id);
    setMultiSelectUnion(null);
  });

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
    const menuHeight = 360;
    const padding = 8;
    const maxX = Math.max(
      padding,
      (dimensions.width || 0) - menuWidth - padding,
    );
    const maxY = Math.max(
      padding,
      (dimensions.height || 0) - menuHeight - padding,
    );
    return {
      left: Math.min(contextMenu.x, maxX),
      top: Math.min(contextMenu.y, maxY),
    };
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
        isExpanded={isCanvasToolbarExpanded}
        onFiltersChange={(filters) => canvasActions.setCanvasFilters(filters)}
        onToggleMinimap={() => canvasActions.toggleMinimap()}
        onAutoLayout={handleAutoLayout}
        onRequestClear={() => setIsClearModalOpen(true)}
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
            <div className="max-h-[280px] overflow-y-auto p-2">
              {commands.length === 0 && (
                <div className="px-2 py-4 text-xs text-neutral-500">
                  {t("commandPalette.empty")}
                </div>
              )}
              {commands.map((command) => {
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
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDblClick}
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
          <CanvasItemsLayer
            items={canvasItems}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
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
            onScaleStart={handleGroupScaleStart}
            onDeleteItem={handleDeleteItem}
            onFlipItem={handleFlipItem}
            onRotateItemStart={handleRotateItemStart}
            onScaleStartItem={handleItemScaleStart}
            onCommitItem={handleCommitItem}
          />
          <SelectionRect
            selectionBox={selectionBox}
            stageScale={stageScale}
            isZoomMode={selectionMode === "zoom"}
          />
        </g>
      </svg>
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
