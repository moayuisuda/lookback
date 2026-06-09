import React, { useRef } from "react";
import { canvasState } from "../../store/canvasStore";

const POINTER_DOUBLE_CLICK_MAX_DELAY = 300;
const POINTER_DOUBLE_CLICK_MAX_DISTANCE = 12;

type CanvasNodeActivationEvent =
  | React.MouseEvent<SVGGElement>
  | React.PointerEvent<SVGGElement>;

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
  onDragCancel?: () => void;
  onDragOut?: (
    pos: { clientX: number; clientY: number },
  ) => (() => void) | null;
  onSelect?: (e: CanvasNodeActivationEvent) => void;
  onTransform?: (matrix: DOMMatrix) => void;
  onTransformEnd?: (matrix: DOMMatrix) => void;
  onMouseDown?: (e: CanvasNodeActivationEvent) => void;
  onClick?: (e: React.MouseEvent<SVGGElement>) => void;
  onTap?: (e: React.MouseEvent<SVGGElement>) => void;
  onDoubleClick?: (e: CanvasNodeActivationEvent) => void;
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
  onDragCancel,
  onDragOut,
  onSelect,
  onMouseDown,
  onClick,
  onDoubleClick,
  children,
}) => {
  const dragStateRef = useRef<{
    pointerId: number;
    originClientX: number;
    originClientY: number;
    lastClientX: number;
    lastClientY: number;
  } | null>(null);
  const lastPointerTapRef = useRef<{
    clientX: number;
    clientY: number;
    pointerType: string;
    timeStamp: number;
  } | null>(null);

  const isOutsideWindow = (clientX: number, clientY: number) => {
    return (
      clientX < 0 ||
      clientY < 0 ||
      clientX > window.innerWidth ||
      clientY > window.innerHeight
    );
  };

  const isPointerDoubleClick = (e: React.PointerEvent<SVGGElement>) => {
    if (canvasState.isPenMode || e.button !== 0 || !onDoubleClick) {
      lastPointerTapRef.current = null;
      return false;
    }

    const previousTap = lastPointerTapRef.current;
    // 硬件数位板的笔输入不总是合成 dblclick，节点层统一用 pointer 识别双击。
    lastPointerTapRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      pointerType: e.pointerType,
      timeStamp: e.timeStamp,
    };

    if (!previousTap || previousTap.pointerType !== e.pointerType) {
      return false;
    }

    const delay = e.timeStamp - previousTap.timeStamp;
    const distance = Math.hypot(
      e.clientX - previousTap.clientX,
      e.clientY - previousTap.clientY,
    );

    const isDoubleClick =
      delay > 0 &&
      delay <= POINTER_DOUBLE_CLICK_MAX_DELAY &&
      distance <= POINTER_DOUBLE_CLICK_MAX_DISTANCE;

    if (isDoubleClick) {
      lastPointerTapRef.current = null;
    }

    return isDoubleClick;
  };

  const handlePointerDown = (e: React.PointerEvent<SVGGElement>) => {
    if (isPointerDoubleClick(e)) {
      e.preventDefault();
      e.stopPropagation();
      onDoubleClick?.(e);
      return;
    }

    if (canvasState.isPenMode) return;

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

    // Windows 数位笔可能在移动阈值后触发原生拖拽；捕获 pointer 流避免节点拖拽中断。
    e.preventDefault();
    const captureTarget = e.currentTarget;
    captureTarget.setPointerCapture(e.pointerId);

    dragStateRef.current = {
      pointerId: e.pointerId,
      originClientX: e.clientX,
      originClientY: e.clientY,
      lastClientX: e.clientX,
      lastClientY: e.clientY,
    };

    onDragStart({ clientX: e.clientX, clientY: e.clientY });

    let cleanupDragListeners = () => undefined;

    const finishDrag = (clientX: number, clientY: number) => {
      const state = dragStateRef.current;
      if (!state) return;

      const dx = clientX - state.originClientX;
      const dy = clientY - state.originClientY;

      onDragEnd({ dx, dy });
      dragStateRef.current = null;
      cleanupDragListeners();
      if (captureTarget.hasPointerCapture(state.pointerId)) {
        captureTarget.releasePointerCapture(state.pointerId);
      }
    };

    const cancelDrag = () => {
      const state = dragStateRef.current;
      if (!state) return;

      onDragCancel?.();
      dragStateRef.current = null;
      cleanupDragListeners();
      if (captureTarget.hasPointerCapture(state.pointerId)) {
        captureTarget.releasePointerCapture(state.pointerId);
      }
    };

    const handleWindowPointerMove = (ev: PointerEvent) => {
      const state = dragStateRef.current;
      if (!state) return;
      if (ev.pointerId !== state.pointerId) return;

      ev.preventDefault();
      state.lastClientX = ev.clientX;
      state.lastClientY = ev.clientY;

      if (onDragOut && isOutsideWindow(ev.clientX, ev.clientY)) {
        const startDragOut = onDragOut({
          clientX: ev.clientX,
          clientY: ev.clientY,
        });
        if (startDragOut) {
          cancelDrag();
          startDragOut();
          return;
        }
      }

      const dx = ev.clientX - state.originClientX;
      const dy = ev.clientY - state.originClientY;
      onDragMove({ dx, dy });
    };

    const handleWindowPointerUp = (ev: PointerEvent) => {
      const state = dragStateRef.current;
      if (!state) return;
      if (ev.pointerId !== state.pointerId) return;

      ev.preventDefault();
      finishDrag(ev.clientX, ev.clientY);
    };

    const handleWindowPointerCancel = (ev: PointerEvent) => {
      const state = dragStateRef.current;
      if (!state) return;
      if (ev.pointerId !== state.pointerId) return;

      finishDrag(state.lastClientX, state.lastClientY);
    };

    cleanupDragListeners = () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerCancel);
    };

    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("pointercancel", handleWindowPointerCancel);
  };

  return (
    <g
      id={id}
      transform={`translate(${x} ${y}) rotate(${rotation}) scale(${scale})`}
      onPointerDown={handlePointerDown}
      onDragStart={(e) => e.preventDefault()}
      onClick={onClick}
      className="select-none"
      style={{ touchAction: "none" }}
    >
      {children}
    </g>
  );
};
