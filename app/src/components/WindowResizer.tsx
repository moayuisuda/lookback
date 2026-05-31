import React, { useEffect, useRef } from "react";
import { useMemoizedFn } from "ahooks";
import { globalActions, globalState } from "../store/globalStore";

type Direction = "e" | "se" | "s";

type WindowBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ResizeSession = {
  active: boolean;
  pointerId: number;
  direction: Direction | null;
  startPoint: { x: number; y: number } | null;
  startBounds: WindowBounds | null;
};

const MIN_WINDOW_WIDTH = 400;
const MIN_WINDOW_HEIGHT = 300;

const getPointerScreenPoint = (
  event: Pick<PointerEvent | React.PointerEvent, "screenX" | "screenY">,
) => ({
  x: event.screenX,
  y: event.screenY,
});

const getResizeBounds = (
  session: ResizeSession,
  currentPoint: { x: number; y: number },
): WindowBounds | null => {
  if (!session.startPoint || !session.startBounds || !session.direction) {
    return null;
  }

  const dx = currentPoint.x - session.startPoint.x;
  const dy = currentPoint.y - session.startPoint.y;
  const start = session.startBounds;
  const next = { ...start };

  if (session.direction.includes("e")) {
    next.width = Math.max(MIN_WINDOW_WIDTH, start.width + dx);
  }
  if (session.direction.includes("s")) {
    next.height = Math.max(MIN_WINDOW_HEIGHT, start.height + dy);
  }

  return {
    x: Math.round(next.x),
    y: Math.round(next.y),
    width: Math.round(next.width),
    height: Math.round(next.height),
  };
};

export const WindowResizer: React.FC = () => {
  const [isResizing, setIsResizing] = React.useState(false);
  const resizingRef = useRef<ResizeSession>({
    active: false,
    pointerId: -1,
    direction: null,
    startPoint: null,
    startBounds: null,
  });

  const isHoveringRef = useRef(false);

  const finishResize = useMemoizedFn(() => {
    resizingRef.current = {
      active: false,
      pointerId: -1,
      direction: null,
      startPoint: null,
      startBounds: null,
    };
    setIsResizing(false);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    globalActions.setWindowResizing(false);

    // 鼠标穿透模式下，拖拽结束后若鼠标已离开 resizer 区域则恢复穿透
    if (!isHoveringRef.current && globalState.mouseThrough) {
      window.electron?.setIgnoreMouseEvents?.(true, { forward: true });
    }
  });

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const state = resizingRef.current;
      if (!state.active || e.pointerId !== state.pointerId) return;

      const nextBounds = getResizeBounds(state, getPointerScreenPoint(e));
      if (!nextBounds) return;
      window.electron?.setWindowBounds(nextBounds);
    };

    const handlePointerUp = (e: PointerEvent) => {
      const state = resizingRef.current;
      if (!state.active || e.pointerId !== state.pointerId) return;

      finishResize();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [finishResize]);

  const handlePointerDown =
    (direction: Direction) => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const pointerId = e.pointerId;

      // 捕获 pointer，确保拖拽期间即使指针移出元素也能持续接收事件
      e.currentTarget.setPointerCapture(pointerId);

      resizingRef.current = {
        active: true,
        pointerId,
        direction,
        startPoint: getPointerScreenPoint(e),
        startBounds: null,
      };
      setIsResizing(true);
      globalActions.setWindowResizing(true);
      if (globalState.mouseThrough) {
        window.electron?.setIgnoreMouseEvents?.(false);
      }

      void window.electron?.getWindowBounds().then((bounds) => {
        const state = resizingRef.current;
        if (!state.active || state.pointerId !== pointerId) return;
        if (!bounds) {
          finishResize();
          return;
        }
        state.startBounds = bounds;
      });

      const cursor = direction === "se"
        ? "nwse-resize"
        : direction === "s"
          ? "ns-resize"
          : "ew-resize";

      document.body.style.cursor = cursor;
      document.body.style.userSelect = "none";
    };

  const handlePointerEnter = () => {
    isHoveringRef.current = true;
  };

  const handlePointerLeave = () => {
    isHoveringRef.current = false;
  };

  const size = 8; // px
  const classes =
    "absolute z-[9999] bg-transparent pointer-events-auto no-drag touch-none";
  const commonProps = {
    onPointerEnter: handlePointerEnter,
    onPointerLeave: handlePointerLeave,
  };

  return (
    <>
      {isResizing && (
        <div
          className="fixed inset-0 z-[10000]"
          style={{ cursor: document.body.style.cursor }}
        />
      )}
      <div
        className={`${classes} group cursor-nwse-resize`}
        style={{ bottom: 0, right: 0, width: size * 2, height: size * 2 }}
        onPointerDown={handlePointerDown("se")}
        {...commonProps}
      >
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className="pointer-events-none absolute bottom-2 right-2 h-4 w-4 text-primary opacity-0 drop-shadow-[0_0_4px_rgba(57,197,187,0.55)] transition-opacity duration-150 group-hover:opacity-95"
        >
          <path
            d="M15 3V15H3"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        </svg>
      </div>

      <div
        className={`${classes} cursor-ns-resize`}
        style={{ bottom: 0, left: 0, right: size * 2, height: size }}
        onPointerDown={handlePointerDown("s")}
        {...commonProps}
      />
      <div
        className={`${classes} cursor-ew-resize`}
        style={{ top: 0, bottom: size * 2, right: 0, width: size }}
        onPointerDown={handlePointerDown("e")}
        {...commonProps}
      />
    </>
  );
};
