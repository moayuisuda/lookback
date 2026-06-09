import React from "react";
import { useSnapshot } from "valtio";
import {
  canvasActions,
  type CanvasPath as CanvasPathState,
} from "../../store/canvasStore";
import { CanvasNode } from "./CanvasNode";
import { useVisualRenderCheck } from "../../hooks/useVisualRenderCheck";

type CanvasPathActivationEvent =
  | React.MouseEvent<SVGGElement>
  | React.PointerEvent<SVGGElement>;

interface CanvasPathProps {
  item: CanvasPathState;
  onDragStart: (pos: { clientX: number; clientY: number }) => void;
  onDragMove: (delta: { dx: number; dy: number }) => void;
  onDragEnd: (delta: { dx: number; dy: number }) => void;
  onSelect: (
    e: React.MouseEvent<SVGGElement> | React.PointerEvent<SVGGElement>,
  ) => void;
  onContain: () => void;
}

const getPathHitRect = (width: number, height: number) => {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;

  return {
    x: -width / 2,
    y: -height / 2,
    width,
    height,
  };
};

export const CanvasPath: React.FC<CanvasPathProps> = ({
  item,
  onDragStart,
  onDragMove,
  onDragEnd,
  onSelect,
  onContain,
}) => {
  useVisualRenderCheck(`CanvasPath:${item.itemId}`);
  const itemSnap = useSnapshot(item);
  const hitRect = getPathHitRect(itemSnap.width, itemSnap.height);

  const handleSelect = (
    e: React.MouseEvent<SVGGElement> | React.PointerEvent<SVGGElement>,
  ) => {
    const isRightClick = "button" in e && e.button === 2;
    if (!isRightClick) {
      e.stopPropagation();
    }
    onSelect(e);
    canvasActions.bringToFront(itemSnap.itemId);
  };

  const handleDoubleClick = (e: CanvasPathActivationEvent) => {
    const target = e.target as Element | null;
    if (target && target.closest("[data-control]")) return;
    e.stopPropagation();
    onContain();
  };

  return (
    <CanvasNode
      id={itemSnap.itemId}
      x={itemSnap.x}
      y={itemSnap.y}
      rotation={itemSnap.rotation}
      scale={itemSnap.scale || 1}
      draggable={true}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onSelect={handleSelect}
      onDoubleClick={handleDoubleClick}
    >
      {hitRect && (
        <rect
          x={hitRect.x}
          y={hitRect.y}
          width={hitRect.width}
          height={hitRect.height}
          fill="transparent"
          pointerEvents="all"
        />
      )}
      <g
        ref={
          useVisualRenderCheck(
            `CanvasPathContent:${itemSnap.itemId}`,
          ) as React.Ref<SVGGElement>
        }
        transform={`translate(${itemSnap.offsetX} ${itemSnap.offsetY})`}
      >
        {itemSnap.strokes.map((stroke, index) => {
          const d = stroke.path;
          if (!d) return null;
          const isDot = stroke.pointCount <= 1 && stroke.lastPoint;
          return (
            <g key={index}>
              {isDot ? (
                <>
                  <circle
                    cx={stroke.lastPoint.x}
                    cy={stroke.lastPoint.y}
                    r={Math.max(stroke.strokeWidth / 2 + 5, 6)}
                    fill="transparent"
                    pointerEvents="fill"
                  />
                  <circle
                    cx={stroke.lastPoint.x}
                    cy={stroke.lastPoint.y}
                    r={stroke.strokeWidth / 2}
                    fill={stroke.stroke}
                    pointerEvents="none"
                  />
                </>
              ) : (
                <path
                  d={d}
                  fill={stroke.stroke}
                  fillRule="nonzero"
                  stroke="none"
                  pointerEvents="fill"
                />
              )}
            </g>
          );
        })}
      </g>
    </CanvasNode>
  );
};
