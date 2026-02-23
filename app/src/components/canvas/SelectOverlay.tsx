import React from "react";
import {
  canvasState,
  type CanvasItem,
  getRenderBbox,
} from "../../store/canvasStore";
import { globalState } from "../../store/globalStore";
import { THEME } from "../../theme";
import { CanvasControlButton } from "./CanvasButton";
import { CANVAS_ICONS } from "./CanvasIcons";
import { useSnapshot, type Snapshot } from "valtio";

interface SelectOverlayProps {
  stageScale: number;
  isSelectionBoxActive: boolean;
  onDeleteSelection: () => void;
  onFlipSelection: () => void;
  onFlipYSelection: () => void;
  onScaleStart: (client: { x: number; y: number }) => void;
  onDeleteItem: (id: string) => void;
  onFlipItem: (id: string) => void;
  onFlipYItem: (id: string) => void;
  onRotateItemStart: (id: string, client: { x: number; y: number }) => void;
  onScaleStartItem: (id: string, client: { x: number; y: number }) => void;
  onCommitItem: (id: string, next: Partial<CanvasItem>) => void;
}

const getItemUnion = (item: Snapshot<CanvasItem>) => {
  const scale = item.scale || 1;
  const rawW = (item.width || 0) * scale;
  const rawH = (item.height || 0) * scale;
  if (rawW <= 0 || rawH <= 0) return null;
  const bbox = getRenderBbox(rawW, rawH, item.rotation || 0);
  return {
    x: item.x + bbox.offsetX,
    y: item.y + bbox.offsetY,
    width: bbox.width,
    height: bbox.height,
  };
};

const getItemsUnion = (items: Snapshot<CanvasItem[]>) => {
  if (items.length === 0) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  items.forEach((item) => {
    const union = getItemUnion(item);
    if (!union) return;
    minX = Math.min(minX, union.x);
    minY = Math.min(minY, union.y);
    maxX = Math.max(maxX, union.x + union.width);
    maxY = Math.max(maxY, union.y + union.height);
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
};

export const SelectOverlay: React.FC<SelectOverlayProps> = ({
  stageScale,
  isSelectionBoxActive,
  onDeleteSelection,
  onFlipSelection,
  onFlipYSelection,
  onScaleStart,
  onDeleteItem,
  onFlipItem,
  onFlipYItem,
  onRotateItemStart,
  onScaleStartItem,
  onCommitItem,
}) => {
  const canvasSnap = useSnapshot(canvasState);
  const globalSnap = useSnapshot(globalState);

  // In ghost mode (mouse through), we should not show the selection overlay
  if (globalSnap.mouseThrough) return null;

  if (isSelectionBoxActive) return null;

  const selectedItems = canvasSnap.canvasItems.filter((item) => item.isSelected);
  if (selectedItems.length === 0) return null;

  const btnScale = 1 / stageScale;

  if (selectedItems.length === 1) {
    const item = selectedItems[0];
    const singleUnion = getItemUnion(item);
    if (!singleUnion) return null;

    return (
      <>
        <rect
          x={singleUnion.x}
          y={singleUnion.y}
          width={singleUnion.width}
          height={singleUnion.height}
          stroke={THEME.primary}
          strokeWidth={2}
          fill="none"
          pointerEvents="none"
          vectorEffect="non-scaling-stroke"
        />
        <CanvasControlButton
          x={singleUnion.x + singleUnion.width / 2}
          y={singleUnion.y - 40 * btnScale}
          scale={btnScale}
          size={24}
          fill={THEME.primary}
          stroke="white"
          strokeWidth={2}
          iconPath={CANVAS_ICONS.ROTATE.PATH}
          iconScale={CANVAS_ICONS.ROTATE.SCALE}
          iconOffsetX={CANVAS_ICONS.ROTATE.OFFSET_X}
          iconOffsetY={CANVAS_ICONS.ROTATE.OFFSET_Y}
          onMouseDown={(e) => {
            e.stopPropagation();
            onRotateItemStart(item.itemId, { x: e.clientX, y: e.clientY });
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onCommitItem(item.itemId, { rotation: 0 });
          }}
        />
        {item.type !== "text" && (
          <CanvasControlButton
            x={singleUnion.x}
            y={singleUnion.y}
            scale={btnScale}
            size={24}
            fill={THEME.primary}
            stroke="white"
            strokeWidth={2}
            iconPath={CANVAS_ICONS.FLIP.PATH}
            iconScale={CANVAS_ICONS.FLIP.SCALE}
            iconOffsetX={CANVAS_ICONS.FLIP.OFFSET_X}
            iconOffsetY={CANVAS_ICONS.FLIP.OFFSET_Y}
            onClick={(e) => {
              e.stopPropagation();
              onFlipItem(item.itemId);
            }}
          />
        )}
        {item.type !== "text" && (
          <CanvasControlButton
            x={singleUnion.x}
            y={singleUnion.y + singleUnion.height}
            scale={btnScale}
            size={24}
            fill={THEME.primary}
            stroke="white"
            strokeWidth={2}
            iconPath={CANVAS_ICONS.FLIP_Y.PATH}
            iconScale={CANVAS_ICONS.FLIP_Y.SCALE}
            iconOffsetX={CANVAS_ICONS.FLIP_Y.OFFSET_X}
            iconOffsetY={CANVAS_ICONS.FLIP_Y.OFFSET_Y}
            onClick={(e) => {
              e.stopPropagation();
              onFlipYItem(item.itemId);
            }}
          />
        )}
        <CanvasControlButton
          x={singleUnion.x + singleUnion.width}
          y={singleUnion.y}
          scale={btnScale}
          size={24}
          fill={THEME.danger}
          stroke="white"
          strokeWidth={2}
          iconPath={CANVAS_ICONS.TRASH.PATH}
          iconScale={CANVAS_ICONS.TRASH.SCALE}
          iconOffsetX={CANVAS_ICONS.TRASH.OFFSET_X}
          iconOffsetY={CANVAS_ICONS.TRASH.OFFSET_Y}
          onClick={(e) => {
            e.stopPropagation();
            onDeleteItem(item.itemId);
          }}
        />
        <CanvasControlButton
          x={singleUnion.x + singleUnion.width}
          y={singleUnion.y + singleUnion.height}
          scale={btnScale}
          size={10}
          fill="white"
          stroke={THEME.primary}
          strokeWidth={2}
          cursor="nwse-resize"
          shadowBlur={4}
          onMouseDown={(e) => {
            e.stopPropagation();
            onScaleStartItem(item.itemId, { x: e.clientX, y: e.clientY });
          }}
        />
      </>
    );
  }

  const union = getItemsUnion(selectedItems);
  if (!union) return null;

  return (
    <>
      <rect
        x={union.x}
        y={union.y}
        width={union.width}
        height={union.height}
        stroke={THEME.primary}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        strokeDasharray={`${6} ${4}`}
        fill="none"
        pointerEvents="none"
      />
      <CanvasControlButton
        x={union.x}
        y={union.y}
        scale={btnScale}
        size={24}
        fill={THEME.primary}
        stroke="white"
        strokeWidth={2}
        iconPath={CANVAS_ICONS.FLIP.PATH}
        iconScale={CANVAS_ICONS.FLIP.SCALE}
        iconOffsetX={CANVAS_ICONS.FLIP.OFFSET_X}
        iconOffsetY={CANVAS_ICONS.FLIP.OFFSET_Y}
        onClick={(e) => {
          e.stopPropagation();
          onFlipSelection();
        }}
      />
      <CanvasControlButton
        x={union.x}
        y={union.y + union.height}
        scale={btnScale}
        size={24}
        fill={THEME.primary}
        stroke="white"
        strokeWidth={2}
        iconPath={CANVAS_ICONS.FLIP_Y.PATH}
        iconScale={CANVAS_ICONS.FLIP_Y.SCALE}
        iconOffsetX={CANVAS_ICONS.FLIP_Y.OFFSET_X}
        iconOffsetY={CANVAS_ICONS.FLIP_Y.OFFSET_Y}
        onClick={(e) => {
          e.stopPropagation();
          onFlipYSelection();
        }}
      />
      <CanvasControlButton
        x={union.x + union.width}
        y={union.y}
        scale={btnScale}
        size={24}
        fill={THEME.danger}
        stroke="white"
        strokeWidth={2}
        iconPath={CANVAS_ICONS.TRASH.PATH}
        iconScale={CANVAS_ICONS.TRASH.SCALE}
        iconOffsetX={CANVAS_ICONS.TRASH.OFFSET_X}
        iconOffsetY={CANVAS_ICONS.TRASH.OFFSET_Y}
        onClick={(e) => {
          e.stopPropagation();
          onDeleteSelection();
        }}
      />
      <CanvasControlButton
        x={union.x + union.width}
        y={union.y + union.height}
        scale={btnScale}
        size={10}
        fill="white"
        stroke={THEME.primary}
        strokeWidth={2}
        cursor="nwse-resize"
        shadowBlur={4}
        onMouseDown={(e) => {
          e.stopPropagation();
          onScaleStart({ x: e.clientX, y: e.clientY });
        }}
      />
    </>
  );
};
