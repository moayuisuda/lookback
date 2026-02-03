import React, { useMemo, useCallback } from "react";
import { useSnapshot } from "valtio";
import { type CanvasImage as CanvasImageState } from "../../store/canvasStore";
import { canvasActions, canvasState } from "../../store/canvasStore";
import { globalState } from "../../store/globalStore";
import { THEME } from "../../theme";
import { CanvasControlButton } from "./CanvasButton";
import { CANVAS_ICONS } from "./CanvasIcons";
import { CanvasNode } from "./CanvasNode";
import { API_BASE_URL } from "../../config";

const getImageUrl = (imagePath: string, canvasName?: string) => {
  let normalized = imagePath.replace(/\\/g, "/");
  if (normalized.startsWith("/")) {
    normalized = normalized.slice(1);
  }
  if (normalized.startsWith("assets/")) {
    const filename = normalized.split("/").pop() || normalized;
    const safeCanvasName = encodeURIComponent(canvasName || "Default");
    const safeFilename = encodeURIComponent(filename);
    return `${API_BASE_URL}/api/assets/${safeCanvasName}/${safeFilename}`;
  }
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return normalized;
  }
  return `${API_BASE_URL}/${normalized}`;
};

interface CanvasImageProps {
  image: CanvasImageState;
  isSelected: boolean;
  showControls: boolean;
  isPanModifierActive: boolean;
  stageScale: number;
  onDragStart: (pos: { x: number; y: number }) => void;
  onDragMove: (pos: { x: number; y: number }) => void;
  onDragEnd: (pos: { x: number; y: number }) => void;
  onSelect: (
    e: React.MouseEvent<SVGGElement> | React.PointerEvent<SVGGElement>,
  ) => void;
  onCommit: (next: Partial<CanvasImageState>) => void;
  onDelete: () => void;
  onScaleStart: (client: { x: number; y: number }) => void;
  onContain: () => void;
  globalFilters: readonly string[];
  canvasOpacity: number;
}

export const CanvasImage: React.FC<CanvasImageProps> = ({
  image,
  isSelected,
  showControls,
  isPanModifierActive,
  stageScale,
  onDragStart,
  onDragMove,
  onDragEnd,
  onSelect,
  onCommit,
  onDelete,
  onScaleStart,
  onContain,
  globalFilters = [],
  canvasOpacity,
}) => {
  const imageSnap = useSnapshot(image);
  const globalSnap = useSnapshot(globalState);
  const canvasSnap = useSnapshot(canvasState);
  const imageUrl = getImageUrl(
    imageSnap.imagePath,
    canvasSnap.currentCanvasName,
  );

  const activeFilters = useMemo(() => {
    const filters = new Set<string>();

    if (imageSnap.grayscale) filters.add("grayscale");

    globalFilters.forEach((f) => filters.add(f));
    (imageSnap.filters || []).forEach((f) => filters.add(f));

    return Array.from(filters);
  }, [imageSnap.grayscale, globalFilters, imageSnap.filters]);

  const cssFilter = useMemo(() => {
    if (activeFilters.length === 0) return undefined;
    const parts: string[] = [];
    if (activeFilters.includes("grayscale")) {
      parts.push("grayscale(1)");
    }
    if (activeFilters.includes("trianglePixelate")) {
      parts.push("contrast(1.1) saturate(0.9)");
    }
    return parts.join(" ");
  }, [activeFilters]);

  const handleFlip = () => {
    const sign = (imageSnap.scaleX ?? 1) < 0 ? -1 : 1;
    onCommit({ scaleX: sign * -1 });
  };

  const scale = imageSnap.scale || 1;
  const flipX = (imageSnap.scaleX ?? 1) < 0;

  const btnScale = 1 / (scale * stageScale);

  const handleSelect = (
    e: React.MouseEvent<SVGGElement> | React.PointerEvent<SVGGElement>,
  ) => {
    e.stopPropagation();
    if ("button" in e && e.button === 2) return;
    if (isPanModifierActive) return;
    onSelect(e);
    canvasActions.bringToFront(imageSnap.canvasId);
  };

  const baseWidth = imageSnap.width!;
  const baseHeight = imageSnap.height!;

  const sx = scale;
  const sy = scale * (imageSnap.scaleY ?? 1);

  const renderOpacity = canvasOpacity;
  const selectionRect =
    isSelected && !globalSnap.mouseThrough
      ? {
          x: -baseWidth / 2,
          y: -baseHeight / 2,
          width: baseWidth,
          height: baseHeight,
          strokeWidth: 3,
        }
      : null;

  const handleRotateStart = (e: React.MouseEvent<SVGGElement>) => {
    e.stopPropagation();
    e.preventDefault();

    const viewport = canvasState.canvasViewport;
    const centerX = imageSnap.x * viewport.scale + viewport.x;
    const centerY = imageSnap.y * viewport.scale + viewport.y;

    const onPointerMove = (ev: PointerEvent) => {
      const dx = ev.clientX - centerX;
      const dy = ev.clientY - centerY;
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      const rotation = angle + 90;
      canvasActions.updateCanvasImageSilent(imageSnap.canvasId, { rotation });
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      canvasActions.commitCanvasChange();
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<SVGGElement>) => {
      if (isPanModifierActive) return;
      const target = e.target as Element | null;
      if (target && target.closest("[data-control]")) return;
      e.stopPropagation();
      onContain();
    },
    [isPanModifierActive, onContain],
  );

  return (
    <CanvasNode
      id={imageSnap.canvasId}
      x={imageSnap.x}
      y={imageSnap.y}
      rotation={imageSnap.rotation}
      scaleX={sx}
      scaleY={sy}
      draggable={true}
      isSelected={isSelected}
      isPanModifierActive={isPanModifierActive}
      stageScale={stageScale}
      showControls={showControls}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onSelect={handleSelect}
      onDoubleClick={handleDoubleClick}
      selectionRect={selectionRect}
      controls={
        <>
          <CanvasControlButton
            x={0}
            y={-baseHeight / 2 - 40 * btnScale}
            scale={btnScale}
            size={24}
            fill={THEME.primary}
            stroke="white"
            strokeWidth={2}
            iconPath={CANVAS_ICONS.ROTATE.PATH}
            iconScale={CANVAS_ICONS.ROTATE.SCALE}
            iconOffsetX={CANVAS_ICONS.ROTATE.OFFSET_X}
            iconOffsetY={CANVAS_ICONS.ROTATE.OFFSET_Y}
            onMouseDown={handleRotateStart}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onCommit({ rotation: 0 });
            }}
          />
          <CanvasControlButton
            x={-baseWidth / 2}
            y={-baseHeight / 2}
            scale={btnScale}
            size={24}
            fill={THEME.primary}
            stroke="white"
            strokeWidth={2}
            iconPath={CANVAS_ICONS.FLIP.PATH}
            iconScale={CANVAS_ICONS.FLIP.SCALE}
            iconOffsetX={CANVAS_ICONS.FLIP.OFFSET_X}
            iconOffsetY={CANVAS_ICONS.FLIP.OFFSET_Y}
            onClick={() => {
              handleFlip();
            }}
          />
          <CanvasControlButton
            x={baseWidth / 2}
            y={-baseHeight / 2}
            scale={btnScale}
            size={24}
            fill={THEME.danger}
            stroke="white"
            strokeWidth={2}
            iconPath={CANVAS_ICONS.TRASH.PATH}
            iconScale={CANVAS_ICONS.TRASH.SCALE}
            iconOffsetX={CANVAS_ICONS.TRASH.OFFSET_X}
            iconOffsetY={CANVAS_ICONS.TRASH.OFFSET_Y}
            onClick={() => {
              onDelete();
            }}
          />
          <CanvasControlButton
            x={baseWidth / 2}
            y={baseHeight / 2}
            scale={btnScale}
            size={10}
            className="cursor-nwse-resize"
            fill="white"
            stroke={THEME.primary}
            strokeWidth={2}
            cursor="nwse-resize"
            shadowBlur={4}
            onMouseDown={(e) => {
              onScaleStart({ x: e.clientX, y: e.clientY });
            }}
          />
        </>
      }
    >
      <image
        href={imageUrl}
        x={-baseWidth / 2}
        y={-baseHeight / 2}
        width={baseWidth}
        height={baseHeight}
        style={{
          filter: cssFilter,
          opacity: renderOpacity,
        }}
        transform={flipX ? "scale(-1 1)" : undefined}
      />
    </CanvasNode>
  );
};
