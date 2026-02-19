import React, { useRef } from "react";
import { canvasState } from "../../store/canvasStore";

interface CanvasNodeProps {
  id: string;
  x: number;
  y: number;
  rotation: number;
  scale?: number;
  draggable: boolean;
  onDragStart?: (pos: { clientX: number; clientY: number }) => void;
  onDragMove?: (delta: { dx: number; dy: number }) => void;
  onDragEnd?: (delta: { dx: number; dy: number }) => void;
  onSelect?: (
    e: React.MouseEvent<SVGGElement> | React.PointerEvent<SVGGElement>,
  ) => void;
  onTransform?: (matrix: DOMMatrix) => void;
  onTransformEnd?: (matrix: DOMMatrix) => void;
  onMouseDown?: (
    e: React.MouseEvent<SVGGElement> | React.PointerEvent<SVGGElement>,
  ) => void;
  onClick?: (e: React.MouseEvent<SVGGElement>) => void;
  onTap?: (e: React.MouseEvent<SVGGElement>) => void;
  onDoubleClick?: (e: React.MouseEvent<SVGGElement>) => void;
  children: React.ReactNode;

  transformerProps?: Record<string, unknown>;
}

export const CanvasNode: React.FC<CanvasNodeProps> = ({
  id,
  x,
  y,
  rotation,
  scale = 1,
  draggable,
  onDragStart,
  onDragMove,
  onDragEnd,
  onSelect,
  onMouseDown,
  onClick,
  onDoubleClick,
  children,
}) => {
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    originClientX: number;
    originClientY: number;
  } | null>(null);

  const handlePointerDown = (e: React.PointerEvent<SVGGElement>) => {
    if (e.button === 2) {
      if (onSelect) {
        onSelect(e);
      }
      if (onMouseDown) {
        onMouseDown(e);
      }
      return;
    }

    if (e.button !== 0) return;
    if (canvasState.isSpaceDown) return;

    if (onSelect) {
      onSelect(e);
    }

    // Custom onMouseDown handler if provided
    if (onMouseDown) {
      onMouseDown(e);
    }

    if (!draggable || !onDragStart || !onDragMove || !onDragEnd) return;

    dragStateRef.current = {
      startX: x,
      startY: y,
      originClientX: e.clientX,
      originClientY: e.clientY,
    };

    onDragStart({ clientX: e.clientX, clientY: e.clientY });

    const handleWindowPointerMove = (ev: PointerEvent) => {
      const state = dragStateRef.current;
      if (!state) return;

      const dx = ev.clientX - state.originClientX;
      const dy = ev.clientY - state.originClientY;
      onDragMove({ dx, dy });
    };

    const handleWindowPointerUp = (ev: PointerEvent) => {
      const state = dragStateRef.current;
      if (!state) return;

      const dx = ev.clientX - state.originClientX;
      const dy = ev.clientY - state.originClientY;

      onDragEnd({ dx, dy });

      dragStateRef.current = null;
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
    };

    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp);
  };

  return (
    <g
      id={id}
      transform={`translate(${x} ${y}) rotate(${rotation}) scale(${scale})`}
      onPointerDown={handlePointerDown}
      onClick={onClick}
      className="select-none"
      onDoubleClick={onDoubleClick}
    >
      {children}
    </g>
  );
};
