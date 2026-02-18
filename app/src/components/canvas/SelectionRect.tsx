import React from "react";
import { THEME } from "../../theme";

export interface SelectionBoxState {
  start: { x: number; y: number } | null;
  current: { x: number; y: number } | null;
}

interface SelectionRectProps {
  selectionBox: SelectionBoxState;
  stageScale: number;
  isZoomMode: boolean;
}

export const MIN_ZOOM_AREA = 600;

export const SelectionRect: React.FC<SelectionRectProps> = ({
  selectionBox,
  stageScale,
  isZoomMode,
}) => {
  if (!selectionBox.start || !selectionBox.current) return null;

  const x = Math.min(selectionBox.start.x, selectionBox.current.x);
  const y = Math.min(selectionBox.start.y, selectionBox.current.y);
  const width = Math.abs(selectionBox.current.x - selectionBox.start.x);
  const height = Math.abs(selectionBox.current.y - selectionBox.start.y);

  const zoomArea = width * height * stageScale * stageScale;
  const isBelowZoomThreshold = isZoomMode && zoomArea < MIN_ZOOM_AREA;

  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      fill={isBelowZoomThreshold ? "none" : THEME.canvas.selectionFill}
      stroke={THEME.primary}
      strokeWidth={1}
      strokeDasharray={
        isBelowZoomThreshold ? `${6} ${4}` : undefined
      }
      vectorEffect="non-scaling-stroke"
      pointerEvents="none"
    />
  );
};
