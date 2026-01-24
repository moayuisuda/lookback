import React, { useRef, useEffect, useCallback, useMemo } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { debounce } from "radash";
import { Stage, Layer } from "react-konva";
import {
  actions as galleryActions,
  type ImageMeta,
} from "../store/galleryStore";
import {
  canvasState,
  canvasActions,
  getRenderBbox,
  type CanvasImage as CanvasImageState,
} from "../store/canvasStore";
import { anchorActions } from "../store/anchorStore";
import { globalActions, globalState } from "../store/globalStore";
import { useSnapshot } from "valtio";
import Konva from "konva";
import { getTempDominantColor } from "../service";
import { API_BASE_URL } from "../config";
import { ConfirmModal } from "./ConfirmModal";
import { Minimap } from "./canvas/Minimap";
import { CanvasText } from "./canvas/Text";
import { CanvasImage } from "./canvas/CanvasImage";
import { CanvasToolbar } from "./canvas/CanvasToolbar";
import { MultiSelectOverlay } from "./canvas/MultiSelectOverlay";
import { SelectionRect, type SelectionBoxState } from "./canvas/SelectionRect";
import { useT } from "../i18n/useT";
import { createTempMetasFromFiles } from "../utils/import";
import { THEME } from "../theme";
import { CANVAS_AUTO_LAYOUT } from "../events/uiEvents";

export const Canvas: React.FC = () => {
  const appSnap = useSnapshot(globalState);
  const canvasSnap = useSnapshot(canvasState);
  const {
    selectedIds,
    primaryId,
    autoEditId,
    isClearModalOpen,
    dimensions,
    isSpaceDown,
    canvasViewport,
    multiSelectUnion,
    selectionBox,
    canvasItems,
    canvasFilters,
    showMinimap,
    isCanvasToolbarExpanded,
    canvasGrayscale,
  } = canvasSnap;

  const { t } = useT();
  const shouldEnableMouseThrough = appSnap.pinMode && appSnap.mouseThrough;

  const selectedIdsRef = useRef<Set<string>>(new Set());
  const stageRef = useRef<Konva.Stage>(null);
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
    scale: number;
    snapshots: Map<
      string,
      {
        type: "image" | "text";
        x: number;
        y: number;
        scale: number;
        scaleX?: number;
        scaleY?: number;
        fontSize?: number;
      }
    >;
  }>({
    active: false,
    anchor: null,
    startUnion: null,
    scale: 1,
    snapshots: new Map(),
  });

  const isMouseOverCanvasRef = useRef(false);
  const isIgnoringMouseRef = useRef(false);

  const setSelectedIds = (ids: Set<string>) => {
    canvasState.selectedIds = ids;
  };

  const setPrimaryId = (id: string | null) => {
    canvasState.primaryId = id;
  };

  const setMultiSelectUnion = (rect: typeof canvasState.multiSelectUnion) => {
    canvasState.multiSelectUnion = rect;
  };

  const setSelectionBox = (box: SelectionBoxState) => {
    canvasState.selectionBox = box;
  };

  const setAutoEditId = (id: string | null) => {
    canvasState.autoEditId = id;
  };

  const setIsClearModalOpen = (open: boolean) => {
    canvasState.isClearModalOpen = open;
  };

  const setIsSpaceDown = (value: boolean) => {
    canvasState.isSpaceDown = value;
  };

  useEffect(() => {
    canvasActions.initCanvas();
  }, []);

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  const computeMultiSelectUnion = (ids: Set<string>) => {
    if (ids.size <= 1) return null;
    const stage = stageRef.current;
    if (!stage) return null;

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    ids.forEach((id) => {
      let node = stage.findOne(`.image-${id}`);
      if (!node) {
        node = stage.findOne(`.text-${id}`);
      }
      if (!node) return;
      const rect = node.getClientRect({ relativeTo: stage });

      minX = Math.min(minX, rect.x);
      minY = Math.min(minY, rect.y);
      maxX = Math.max(maxX, rect.x + rect.width);
      maxY = Math.max(maxY, rect.y + rect.height);
    });

    if (
      !Number.isFinite(minX) ||
      !Number.isFinite(minY) ||
      !Number.isFinite(maxX) ||
      !Number.isFinite(maxY)
    )
      return null;
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  };

  const handleCanvasMouseEnter = () => {
    isMouseOverCanvasRef.current = true;
    if (shouldEnableMouseThrough && !isIgnoringMouseRef.current) {
      window.electron?.setIgnoreMouseEvents?.(true, { forward: true });
      isIgnoringMouseRef.current = true;
    }
  };

  const handleCanvasMouseLeave = () => {
    isMouseOverCanvasRef.current = false;
    if (isIgnoringMouseRef.current) {
      window.electron?.setIgnoreMouseEvents?.(false);
      isIgnoringMouseRef.current = false;
    }
  };

  useEffect(() => {
    if (!shouldEnableMouseThrough && isIgnoringMouseRef.current) {
      window.electron?.setIgnoreMouseEvents?.(false);
      isIgnoringMouseRef.current = false;
    }
    if (
      shouldEnableMouseThrough &&
      isMouseOverCanvasRef.current &&
      !isIgnoringMouseRef.current
    ) {
      window.electron?.setIgnoreMouseEvents?.(true, { forward: true });
      isIgnoringMouseRef.current = true;
    }
    return () => {
      if (isIgnoringMouseRef.current) {
        window.electron?.setIgnoreMouseEvents?.(false);
        isIgnoringMouseRef.current = false;
      }
    };
  }, [shouldEnableMouseThrough]);

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
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    canvasState.dimensions = {
      width: containerRef.current.offsetWidth,
      height: containerRef.current.offsetHeight,
    };
  }, [appSnap.pinMode, appSnap.sidebarWidth]);



  useEffect(() => {
    const handleDropRequest = (e: Event) => {
      const customEvent = e as CustomEvent<{
        image: ImageMeta;
        x: number;
        y: number;
      }>;
      const { image, x, y } = customEvent.detail;

      const stage = stageRef.current;
      if (!stage) return;

      const stageRect = stage.container().getBoundingClientRect();

      const pointerPosition = {
        x: x - stageRect.left,
        y: y - stageRect.top,
      };

      const transform = stage.getAbsoluteTransform().copy();
      transform.invert();
      const basePoint = transform.point(pointerPosition);

      canvasActions.addToCanvas(image, basePoint.x, basePoint.y);
    };

    window.addEventListener("canvas-drop-request", handleDropRequest);
    return () =>
      window.removeEventListener("canvas-drop-request", handleDropRequest);
  }, []);

  const clearSelection = useCallback(() => {
    canvasState.selectedIds = new Set();
    canvasState.primaryId = null;
    canvasState.multiSelectUnion = null;
  }, []);

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    console.log("[Canvas] handleDrop triggered", {
      files: e.dataTransfer.files.length,
      types: e.dataTransfer.types,
      items: e.dataTransfer.items.length,
    });
    const stage = stageRef.current;
    if (!stage) {
      console.log("[Canvas] handleDrop: no stage ref");
      return;
    }

    stage.setPointersPositions(e);
    const pointerPosition = stage.getPointerPosition();

    try {
      const transform = stage.getAbsoluteTransform().copy();
      transform.invert();
      const basePoint = transform.point(pointerPosition || { x: 0, y: 0 });

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

      const files = Array.from(e.dataTransfer.files || []);
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
            console.log("[Canvas] extracted img src from html:", url);
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
        if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
          try {
            const resp = await fetch(`${API_BASE_URL}/api/download-url`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url }),
            });
            if (resp.ok) {
              const result = (await resp.json()) as {
                success?: boolean;
                filename?: string;
                path?: string;
              };
              if (result.success && result.filename && result.path) {
                const dominantColor = await getTempDominantColor(result.path);
                const meta = galleryActions.createDroppedImageMeta({
                  path: result.path,
                  storedFilename: `temp-images/${result.filename}`,
                  originalName: result.filename,
                  dominantColor,
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

      const metas = await createTempMetasFromFiles(imageFiles);
      metas.forEach((meta, index) => {
        const offset = index * 24;
        canvasActions.addToCanvas(
          meta,
          basePoint.x + offset,
          basePoint.y + offset,
        );
      });
    } catch (err: unknown) {
      console.error("Drop error", err);
    }
  };

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    if (selectedIds.size > 0) {
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
        if (selectedIds.has(item.canvasId)) {
          const scale = item.scale || 1;
          const rawW = (item.width || 0) * scale * Math.abs(item.scaleX || 1);
          const rawH =
            (item.height || 0) *
            scale *
            Math.abs(item.type === "text" ? 1 : item.scaleY || 1);
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

        const scaleBy = 1.05;
        const factor = e.evt.deltaY > 0 ? 1 / scaleBy : scaleBy;

        validItems.forEach(({ item }) => {
          const dx = item.x - centerX;
          const dy = item.y - centerY;

          const newX = centerX + dx * factor;
          const newY = centerY + dy * factor;

          if (item.type === "text") {
            const fontSize = item.fontSize || 24;
            canvasActions.updateCanvasImageSilent(item.canvasId, {
              x: newX,
              y: newY,
              fontSize: fontSize * factor,
            });
          } else {
            const scale = item.scale || 1;
            canvasActions.updateCanvasImageSilent(item.canvasId, {
              x: newX,
              y: newY,
              scale: scale * factor,
            });
          }
        });

        // Try to update selection box immediately for better visual feedback
        setTimeout(() => {
          setMultiSelectUnion(computeMultiSelectUnion(selectedIdsRef.current));
        }, 0);

        debouncedCommit();
      }
      return;
    }

    const scaleBy = 1.05;
    const oldScale = canvasViewport.scale;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - canvasViewport.x) / oldScale,
      y: (pointer.y - canvasViewport.y) / oldScale,
    };

    const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };
    
    canvasActions.setCanvasViewport({
      x: newPos.x,
      y: newPos.y,
      width: stage.width(),
      height: stage.height(),
      scale: newScale,
    });
  };

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
      if (e.code === "Space") {
        e.preventDefault();
        setIsSpaceDown(true);
        const stage = stageRef.current;
        if (stage) stage.container().style.cursor = "grab";
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setIsSpaceDown(false);
        isPanningRef.current = false;
        lastPanPointRef.current = null;
        const stage = stageRef.current;
        if (stage) stage.container().style.cursor = "default";
      }
    };
    const handleBlur = () => {
      setIsSpaceDown(false);
      isPanningRef.current = false;
      lastPanPointRef.current = null;
      const stage = stageRef.current;
      if (stage) stage.container().style.cursor = "default";
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

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

  const handleMouseDown = (
    e: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    const stage = e.target.getStage();
    if (!stage) return;

    // 空格 + 左键拖拽 或 右键拖拽：平移画布
    const evt = e.evt as MouseEvent & { button?: number };
    const isRightButton = evt.button === 2;
    if (isSpaceDown || isRightButton) {
      e.evt.preventDefault();
      stage.container().style.cursor = "grabbing";
      isPanningRef.current = true;

      if ("touches" in e.evt) {
        const t = e.evt.touches[0];
        if (t) lastPanPointRef.current = { x: t.clientX, y: t.clientY };
      } else {
        lastPanPointRef.current = { x: e.evt.clientX, y: e.evt.clientY };
      }
      return;
    }

    // Left Click -> Box Selection (if empty space)
    const isLeftButton = "button" in e.evt ? e.evt.button === 0 : true;
    if (isLeftButton) {
      const clickedOnEmpty =
        e.target === stage || e.target.getParent() === stage;
      if (clickedOnEmpty) {
        const pos = stage.getRelativePointerPosition();
        if (pos) {
          selectionAppendRef.current = !!(
            e.evt.shiftKey ||
            e.evt.metaKey ||
            e.evt.ctrlKey
          );
          setSelectionBox({ start: pos, current: pos });
          if (!selectionAppendRef.current) {
            setSelectedIds(new Set());
            setPrimaryId(null);
            setMultiSelectUnion(null);
          }
        }
      }
    }
  };

  const handleMouseMove = (
    e: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    if (multiScaleRef.current.active) {
      const stage = stageRef.current;
      const current = multiScaleRef.current;
      if (!stage || !current.anchor || !current.startUnion) return;
      const pos = stage.getRelativePointerPosition();
      if (!pos) return;
      const base = Math.max(
        1,
        Math.hypot(current.startUnion.width, current.startUnion.height),
      );
      const next = Math.hypot(
        pos.x - current.anchor.x,
        pos.y - current.anchor.y,
      );
      const scale = Math.max(0.1, next / base);
      current.scale = scale;
      current.snapshots.forEach((start, selectedId) => {
        const nextX = current.anchor!.x + (start.x - current.anchor!.x) * scale;
        const nextY = current.anchor!.y + (start.y - current.anchor!.y) * scale;
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
      setMultiSelectUnion(computeMultiSelectUnion(selectedIdsRef.current));
      return;
    }
    // Panning (Space held)
    if (isPanningRef.current) {
      const stage = stageRef.current;
      const last = lastPanPointRef.current;
      if (!stage || !last) return;

      let currentPoint: { x: number; y: number } | null = null;
      if ("touches" in e.evt) {
        const t = e.evt.touches[0];
        if (t) currentPoint = { x: t.clientX, y: t.clientY };
      } else {
        currentPoint = { x: e.evt.clientX, y: e.evt.clientY };
      }
      if (!currentPoint) return;

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
        width: stage.width(),
        height: stage.height(),
        scale: canvasViewport.scale,
      });
      lastPanPointRef.current = currentPoint;
      return;
    }

    // Box Selection
    if (selectionBox.start) {
      const stage = stageRef.current;
      const pos = stage?.getRelativePointerPosition();
      if (pos) {
        canvasState.selectionBox = {
          ...canvasState.selectionBox,
          current: pos,
        };
      }
    }
  };

  const handleMouseUp = () => {
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
        scale: 1,
        snapshots: new Map(),
      };
      setMultiSelectUnion(computeMultiSelectUnion(selectedIdsRef.current));
      const stage = stageRef.current;
      if (stage) stage.container().style.cursor = "default";
      return;
    }
    const stage = stageRef.current;
    if (stage) stage.container().style.cursor = "default";

    isPanningRef.current = false;
    lastPanPointRef.current = null;
    if (!stage) {
      canvasState.selectionBox = { start: null, current: null };
      return;
    }

    if (selectionBox.start && selectionBox.current) {
      const x1 = Math.min(selectionBox.start.x, selectionBox.current.x);
      const x2 = Math.max(selectionBox.start.x, selectionBox.current.x);
      const y1 = Math.min(selectionBox.start.y, selectionBox.current.y);
      const y2 = Math.max(selectionBox.start.y, selectionBox.current.y);

      if (Math.abs(x2 - x1) > 2 || Math.abs(y2 - y1) > 2) {
        const newSelected = selectionAppendRef.current
          ? new Set(selectedIds)
          : new Set<string>();
        let lastHitId: string | null = null;
        (canvasItems || []).forEach((item) => {
          let node = stage.findOne(`.image-${item.canvasId}`);
          if (!node) {
            node = stage.findOne(`.text-${item.canvasId}`);
          }
          if (node) {
            const rect = node.getClientRect({ relativeTo: stage });
            if (
              rect.x < x2 &&
              rect.x + rect.width > x1 &&
              rect.y < y2 &&
              rect.y + rect.height > y1
            ) {
              newSelected.add(item.canvasId);
              lastHitId = item.canvasId;
            }
          }
        });
        setSelectedIds(newSelected);
        if (lastHitId) setPrimaryId(lastHitId);
        setMultiSelectUnion(computeMultiSelectUnion(newSelected));
      }
    }
    canvasState.selectionBox = { start: null, current: null };
  };

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
          scale: 1,
          snapshots: new Map(),
        };
        setMultiSelectUnion(computeMultiSelectUnion(selectedIdsRef.current));
      }
      if (canvasState.selectionBox.start || canvasState.selectionBox.current) {
        canvasState.selectionBox = { start: null, current: null };
      }
      isPanningRef.current = false;
      lastPanPointRef.current = null;
      const stage = stageRef.current;
      if (stage) {
        stage.container().style.cursor = "default";
      }
    };
    window.addEventListener("mouseup", handleWindowMouseUp);
    window.addEventListener("touchend", handleWindowMouseUp);
    return () => {
      window.removeEventListener("mouseup", handleWindowMouseUp);
      window.removeEventListener("touchend", handleWindowMouseUp);
    };
  }, []);

  const handleAutoLayout = useCallback(() => {
    if (selectedIds.size > 0) {
      const items = canvasItems || [];
      const selectedItems = items.filter((item) =>
        selectedIds.has(item.canvasId),
      );
      const selectedImages = selectedItems.filter(
        (item) => item.type === "image",
      );

      if (selectedImages.length >= 2) {
        let minX = Infinity;
        let minY = Infinity;

        selectedImages.forEach((item) => {
          const scale = item.scale || 1;
          const rawW = (item.width || 0) * scale * Math.abs(item.scaleX || 1);
          const rawH = (item.height || 0) * scale * Math.abs(item.scaleY || 1);
          const bbox = getRenderBbox(rawW, rawH, item.rotation || 0);

          minX = Math.min(minX, item.x + bbox.offsetX);
          minY = Math.min(minY, item.y + bbox.offsetY);
        });

        if (minX === Infinity) minX = 0;
        if (minY === Infinity) minY = 0;

        canvasActions.autoLayoutCanvas(
          selectedImages.map((item) => item.canvasId),
          {
            startX: minX,
            startY: minY,
          },
        );

        setTimeout(() => {
          setMultiSelectUnion(computeMultiSelectUnion(selectedIdsRef.current));
        }, 0);
        return;
      }
    }

    canvasActions.autoLayoutCanvas();
    const stage = stageRef.current;
    if (!stage) return;
    // Use the proxy state here to ensure we read the latest positions after autoLayoutCanvas mutates items.
    const items = canvasState.canvasItems || [];
    if (items.length === 0) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    items.forEach((item) => {
      const scale = item.scale || 1;
      const rawW = (item.width || 0) * scale * Math.abs(item.scaleX || 1);
      const rawH =
        (item.height || 0) *
        scale *
        Math.abs(item.type === "text" ? 1 : item.scaleY || 1);
      const bbox = getRenderBbox(rawW, rawH, item.rotation || 0);

      minX = Math.min(minX, item.x + bbox.offsetX);
      minY = Math.min(minY, item.y + bbox.offsetY);
      maxX = Math.max(maxX, item.x + bbox.offsetX + bbox.width);
      maxY = Math.max(maxY, item.y + bbox.offsetY + bbox.height);
    });

    const padding = 50;
    const width = maxX - minX;
    const height = maxY - minY;

    if (!isFinite(width) || !isFinite(height)) return;

    const containerWidth = stage.width();
    const containerHeight = stage.height();

    const scaleX = (containerWidth - padding * 2) / width;
    const scaleY = (containerHeight - padding * 2) / height;
    const scale = Math.min(scaleX, scaleY);

    const x = (containerWidth - width * scale) / 2 - minX * scale;
    const y = (containerHeight - height * scale) / 2 - minY * scale;

    canvasActions.setCanvasViewport({
      x,
      y,
      width: stage.width(),
      height: stage.height(),
      scale,
    });
  }, [canvasItems, selectedIds]);

  useEffect(() => {
    const handleLayoutEvent = () => handleAutoLayout();
    window.addEventListener(CANVAS_AUTO_LAYOUT, handleLayoutEvent);
    return () => {
      window.removeEventListener(CANVAS_AUTO_LAYOUT, handleLayoutEvent);
    };
  }, [handleAutoLayout]);

  const handleFlipSelection = useCallback(() => {
    if (selectedIds.size === 0) return;

    selectedIds.forEach((id) => {
      const item = canvasItems.find((i) => i.canvasId === id);
      if (item && item.type !== "text") {
        const currentScaleX = item.scaleX || 1;
        canvasActions.updateCanvasImage(id, {
          scaleX: currentScaleX * -1,
        });
      }
    });
    setTimeout(() => {
      setMultiSelectUnion(computeMultiSelectUnion(selectedIds));
    }, 0);
  }, [selectedIds, canvasItems]);

  useHotkeys(
    "mod+f",
    (e) => {
      e.preventDefault();
      handleFlipSelection();
    },
    { preventDefault: true },
    [handleFlipSelection],
  );

  const handleDeleteSelection = () => {
    const ids = Array.from(selectedIdsRef.current);
    if (ids.length === 0) return;
    canvasActions.removeManyFromCanvas(ids);
    clearSelection();
  };

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
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        e.key.toLowerCase() === "z"
      ) {
        e.preventDefault();
        canvasActions.undoCanvas();
        setSelectedIds(new Set());
        setPrimaryId(null);
        setMultiSelectUnion(null);
        return;
      }

      // Redo: Ctrl+Shift+Z / Cmd+Shift+Z
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "z"
      ) {
        e.preventDefault();
        canvasActions.redoCanvas();
        setSelectedIds(new Set());
        setPrimaryId(null);
        setMultiSelectUnion(null);
        return;
      }

      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedIds.size > 0
      ) {
        canvasActions.removeManyFromCanvas(Array.from(selectedIds));
        clearSelection();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIds, clearSelection]);

  const handleDragStart = (id: string, pos: { x: number; y: number }) => {
    const currentSelected = selectedIdsRef.current;
    if (!currentSelected.has(id)) {
      multiDragRef.current = {
        active: false,
        draggedId: null,
        anchor: null,
        snapshots: new Map(),
      };
      return;
    }
    if (currentSelected.size <= 1) {
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
      const target = canvasItems.find(
        (it) => it.canvasId === selectedId,
      );
      if (target) snapshots.set(selectedId, { x: target.x, y: target.y });
    });
    multiDragRef.current = {
      active: true,
      draggedId: id,
      anchor: pos,
      snapshots,
    };
  };

  const handleGroupScaleStart = () => {
    const union = multiSelectUnion;
    const stage = stageRef.current;
    const currentSelected = selectedIdsRef.current;
    if (!union || !stage) return;
    if (currentSelected.size <= 1) return;
    if (union.width <= 0 || union.height <= 0) return;
    const snapshots = new Map<
      string,
      {
        type: "image" | "text";
        x: number;
        y: number;
        scale: number;
        scaleX?: number;
        scaleY?: number;
        fontSize?: number;
      }
    >();
    currentSelected.forEach((selectedId) => {
      const target = canvasItems.find(
        (it) => it.canvasId === selectedId,
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
      const img = target as CanvasImageState;
      snapshots.set(selectedId, {
        type: "image",
        x: img.x,
        y: img.y,
        scale: img.scale || 1,
        scaleX: img.scaleX,
        scaleY: img.scaleY,
      });
    });
    multiScaleRef.current = {
      active: true,
      anchor: { x: union.x, y: union.y },
      startUnion: { ...union },
      scale: 1,
      snapshots,
    };
    stage.container().style.cursor = "nwse-resize";
  };

  const handleDragMove = (id: string, pos: { x: number; y: number }) => {
    const multi = multiDragRef.current;
    if (multi.active && multi.anchor) {
      const dx = pos.x - multi.anchor.x;
      const dy = pos.y - multi.anchor.y;
      multi.snapshots.forEach((start, selectedId) => {
        canvasActions.updateCanvasImageTransient(selectedId, {
          x: start.x + dx,
          y: start.y + dy,
        });
      });
      setMultiSelectUnion(computeMultiSelectUnion(selectedIdsRef.current));
      return;
    }
    canvasActions.updateCanvasImageTransient(id, {
      x: pos.x,
      y: pos.y,
    });
    setMultiSelectUnion(computeMultiSelectUnion(selectedIdsRef.current));
  };

  const handleDragEnd = (id: string, pos: { x: number; y: number }) => {
    const multi = multiDragRef.current;
    if (multi.active && multi.anchor) {
      const dx = pos.x - multi.anchor.x;
      const dy = pos.y - multi.anchor.y;
      multi.snapshots.forEach((start, selectedId) => {
        canvasActions.updateCanvasImage(selectedId, {
          x: start.x + dx,
          y: start.y + dy,
        });
      });
    } else {
      canvasActions.updateCanvasImage(id, {
        x: pos.x,
        y: pos.y,
      });
    }
    multiDragRef.current = {
      active: false,
      draggedId: null,
      anchor: null,
      snapshots: new Map(),
    };
    setMultiSelectUnion(computeMultiSelectUnion(selectedIdsRef.current));
  };

  const handleItemSelect = (
    id: string,
    e: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    if (selectionBox.start) return;

    if (!e.evt.shiftKey && !e.evt.metaKey && !e.evt.ctrlKey) {
      canvasActions.bringToFront(id);
      if (selectedIds.has(id)) {
        setPrimaryId(id);
      } else {
        const next = new Set([id]);
        setSelectedIds(next);
        setPrimaryId(id);
        setMultiSelectUnion(null);
      }
    } else {
      // Toggle
      const newSet = new Set(selectedIds);
      if (newSet.has(id)) {
        newSet.delete(id);
        if (primaryId === id) {
          const nextPrimary = Array.from(newSet)[0] || null;
          setPrimaryId(nextPrimary);
        }
      } else {
        newSet.add(id);
        setPrimaryId(id);
      }
      setSelectedIds(newSet);
      setMultiSelectUnion(computeMultiSelectUnion(newSet));
    }
  };

  const handleDblClick = (
    e: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    const stage = e.target.getStage();
    if (!stage) return;

    const clickedOnEmpty = e.target === stage || e.target.getParent() === stage;
    if (clickedOnEmpty) {
      const pointer = stage.getRelativePointerPosition();
      if (pointer) {
        const id = canvasActions.addTextToCanvas(pointer.x, pointer.y);
        setSelectedIds(new Set([id]));
        setPrimaryId(id);
        setMultiSelectUnion(null);
        setAutoEditId(id);
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className={`flex-1 h-full overflow-hidden relative transition-colors outline-none focus:outline-none`}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => globalActions.setActiveArea("canvas")}
      onMouseDown={() => globalActions.setActiveArea("canvas")}
      onMouseEnter={handleCanvasMouseEnter}
      onMouseLeave={handleCanvasMouseLeave}
    >
      <CanvasToolbar
        canvasFilters={canvasFilters}
        showMinimap={showMinimap}
        isExpanded={isCanvasToolbarExpanded}
        onFiltersChange={(filters) => canvasActions.setCanvasFilters(filters)}
        onToggleMinimap={() => canvasActions.toggleMinimap()}
        onAutoLayout={handleAutoLayout}
        onRequestClear={() => setIsClearModalOpen(true)}
        onToggleExpanded={() => canvasActions.toggleCanvasToolbarExpanded()}
      />
      {appSnap.mouseThrough && (
        <div className="absolute inset-0 pointer-events-none z-50">
          {[
            { position: "top-1 right-1", path: "M2 2H22V22" },
            { position: "bottom-1 right-1", path: "M2 22H22V2" },
            { position: "bottom-1 left-1", path: "M22 22H2V2" },
          ].map((corner) => (
            <svg
              key={corner.position}
              className={`absolute pointer-events-auto draggable ${corner.position}`}
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d={corner.path}
                stroke={THEME.primary}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ))}
        </div>
      )}
      <Stage
        width={dimensions.width}
        height={dimensions.height}
        x={canvasViewport.x}
        y={canvasViewport.y}
        scaleX={canvasViewport.scale}
        scaleY={canvasViewport.scale}
        style={{ opacity: appSnap.canvasOpacity }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDblClick={handleDblClick}
        onTouchStart={handleMouseDown} // Basic touch support mapping
        onTouchMove={handleMouseMove}
        onTouchEnd={handleMouseUp}
        onWheel={handleWheel}
        draggable={false} // Custom panning logic
        ref={stageRef}
      >
        <Layer>
          {(canvasItems || []).map((item) => {
            if (item.type === "text") {
              return (
                <CanvasText
                  key={item.canvasId}
                  item={item}
                  isSelected={selectedIds.has(item.canvasId)}
                  showControls={
                    selectedIds.size === 1 && selectedIds.has(item.canvasId) && !appSnap.mouseThrough
                  }
                  isPanModifierActive={isSpaceDown}
                  stageScale={stageScale}
                  onDragStart={(pos) => handleDragStart(item.canvasId, pos)}
                  onDragMove={(pos) => handleDragMove(item.canvasId, pos)}
                  onDragEnd={(pos) => handleDragEnd(item.canvasId, pos)}
                  onSelect={(e) => handleItemSelect(item.canvasId, e)}
                  autoEdit={autoEditId === item.canvasId}
                  onAutoEditComplete={() => {
                    if (autoEditId === item.canvasId) {
                      setAutoEditId(null);
                    }
                  }}
                  onCommitEnter={() => {
                    const current = selectedIdsRef.current;
                    if (!(current.size === 1 && current.has(item.canvasId))) {
                      return;
                    }
                    setSelectedIds(new Set());
                    const nextPrimary =
                      primaryId === item.canvasId ? null : primaryId;
                    setPrimaryId(nextPrimary);
                    setMultiSelectUnion(null);
                  }}
                  onCommit={(newAttrs) => {
                    canvasActions.updateCanvasImage(item.canvasId, newAttrs);
                    setMultiSelectUnion(
                      computeMultiSelectUnion(selectedIdsRef.current),
                    );
                  }}
                  onDelete={() => {
                    canvasActions.removeFromCanvas(item.canvasId);
                    const newSet = new Set(selectedIds);
                    newSet.delete(item.canvasId);
                    setSelectedIds(newSet);
                    if (primaryId === item.canvasId) {
                      setPrimaryId(Array.from(newSet)[0] || null);
                    }
                    setMultiSelectUnion(computeMultiSelectUnion(newSet));
                  }}
                />
              );
            }
            return (
              <CanvasImage
                key={item.canvasId}
                image={item as CanvasImageState}
                isSelected={selectedIds.has(item.canvasId)}
                showControls={
                  selectedIds.size === 1 && selectedIds.has(item.canvasId) && !appSnap.mouseThrough
                }
                isPanModifierActive={isSpaceDown}
                stageScale={stageScale}
                onDragStart={(pos) => handleDragStart(item.canvasId, pos)}
                onDragMove={(pos) => handleDragMove(item.canvasId, pos)}
                onDragEnd={(pos) => handleDragEnd(item.canvasId, pos)}
                onSelect={(e) => handleItemSelect(item.canvasId, e)}
                onChange={(newAttrs) => {
                  canvasActions.updateCanvasImageSilent(
                    item.canvasId,
                    newAttrs,
                  );
                }}
                onCommit={(newAttrs) => {
                  canvasActions.updateCanvasImage(item.canvasId, newAttrs);
                  setMultiSelectUnion(
                    computeMultiSelectUnion(selectedIdsRef.current),
                  );
                }}
                onDelete={() => {
                  canvasActions.removeFromCanvas(item.canvasId);
                  const newSet = new Set(selectedIds);
                  newSet.delete(item.canvasId);
                  setSelectedIds(newSet);
                  if (primaryId === item.canvasId) {
                    setPrimaryId(Array.from(newSet)[0] || null);
                  }
                  setMultiSelectUnion(computeMultiSelectUnion(newSet));
                }}
                globalGrayscale={canvasGrayscale}
                globalFilters={canvasFilters}
              />
            );
          })}
          <MultiSelectOverlay
            union={selectionBox.start === null ? multiSelectUnion : null}
            stageScale={stageScale}
            onDeleteSelection={handleDeleteSelection}
            onFlipSelection={handleFlipSelection}
            onScaleStart={handleGroupScaleStart}
          />
          <SelectionRect selectionBox={selectionBox} />
        </Layer>
      </Stage>
      {showMinimap && !shouldEnableMouseThrough && (
        <Minimap stageRef={stageRef} />
      )}
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
