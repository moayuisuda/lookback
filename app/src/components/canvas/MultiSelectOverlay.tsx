import React from "react";
import { Rect } from "react-konva";
import { THEME } from "../../theme";
import { CanvasControlButton } from "./CanvasButton";
import { CANVAS_ICONS } from "./CanvasIcons";

interface MultiSelectOverlayProps {
  union: { x: number; y: number; width: number; height: number } | null;
  stageScale: number;
  onDeleteSelection: () => void;
  onFlipSelection: () => void;
  onScaleStart: () => void;
}

export const MultiSelectOverlay: React.FC<MultiSelectOverlayProps> = ({
  union,
  stageScale,
  onDeleteSelection,
  onFlipSelection,
  onScaleStart,
}) => {
  if (!union) return null;

  return (
    <>
      <Rect
        x={union.x}
        y={union.y}
        width={union.width}
        height={union.height}
        stroke={THEME.primary}
        strokeWidth={1 / stageScale}
        dash={[6 / stageScale, 4 / stageScale]}
        listening={false}
      />
      <CanvasControlButton
        x={union.x}
        y={union.y}
        scale={1 / stageScale}
        size={24}
        fill={THEME.primary}
        stroke="white"
        strokeWidth={2}
        iconPath={CANVAS_ICONS.FLIP.PATH}
        iconScale={CANVAS_ICONS.FLIP.SCALE}
        iconOffsetX={CANVAS_ICONS.FLIP.OFFSET_X}
        iconOffsetY={CANVAS_ICONS.FLIP.OFFSET_Y}
        onClick={(e) => {
          e.cancelBubble = true;
          onFlipSelection();
        }}
      />
      <CanvasControlButton
        x={union.x + union.width}
        y={union.y}
        scale={1 / stageScale}
        size={24}
        fill={THEME.danger}
        stroke="white"
        strokeWidth={2}
        iconPath={CANVAS_ICONS.TRASH.PATH}
        iconScale={CANVAS_ICONS.TRASH.SCALE}
        iconOffsetX={CANVAS_ICONS.TRASH.OFFSET_X}
        iconOffsetY={CANVAS_ICONS.TRASH.OFFSET_Y}
        onClick={(e) => {
          e.cancelBubble = true;
          onDeleteSelection();
        }}
      />
      <CanvasControlButton
        x={union.x + union.width}
        y={union.y + union.height}
        scale={1 / stageScale}
        size={10}
        fill="white"
        stroke={THEME.primary}
        strokeWidth={2}
        cursor="nwse-resize"
        shadowBlur={4}
        shadowOpacity={0.2}
        onMouseDown={(e) => {
          e.cancelBubble = true;
          onScaleStart();
        }}
        onTouchStart={(e) => {
          e.cancelBubble = true;
          onScaleStart();
        }}
      />
    </>
  );
};
