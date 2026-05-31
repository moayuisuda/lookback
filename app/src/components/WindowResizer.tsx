import React, { useEffect, useRef } from "react";
import { globalActions, globalState } from "../store/globalStore";

type Direction = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export const WindowResizer: React.FC = () => {
  const [isResizing, setIsResizing] = React.useState(false);
  const resizingRef = useRef<{
    active: boolean;
    pointerId: number;
  }>({
    active: false,
    pointerId: -1,
  });

  const isHoveringRef = useRef(false);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const state = resizingRef.current;
      if (!state.active || e.pointerId !== state.pointerId) return;

      window.electron?.moveWindowAction();
    };

    const handlePointerUp = (e: PointerEvent) => {
      const state = resizingRef.current;
      if (!state.active || e.pointerId !== state.pointerId) return;

      state.active = false;
      state.pointerId = -1;
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      globalActions.setWindowResizing(false);

      window.electron?.endWindowAction();

      // 鼠标穿透模式下，拖拽结束后若鼠标已离开 resizer 区域则恢复穿透
      if (!isHoveringRef.current && globalState.mouseThrough) {
        window.electron?.setIgnoreMouseEvents?.(true, { forward: true });
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, []);

  const handlePointerDown =
    (direction: Direction) => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // 捕获 pointer，确保拖拽期间即使指针移出元素也能持续接收事件
      (e.target as Element).setPointerCapture(e.pointerId);

      resizingRef.current = {
        active: true,
        pointerId: e.pointerId,
      };
      setIsResizing(true);
      globalActions.setWindowResizing(true);
      if (globalState.mouseThrough) {
        window.electron?.setIgnoreMouseEvents?.(false);
      }

      window.electron?.startWindowAction({ type: "resize", direction });

      let cursor = "default";
      if (direction === "nw" || direction === "se") cursor = "nwse-resize";
      else if (direction === "ne" || direction === "sw") cursor = "nesw-resize";
      else if (direction === "n" || direction === "s") cursor = "ns-resize";
      else if (direction === "w" || direction === "e") cursor = "ew-resize";

      document.body.style.cursor = cursor;
      document.body.style.userSelect = "none";
    };

  const handlePointerEnter = () => {
    isHoveringRef.current = true;
    window.electron?.setIgnoreMouseEvents?.(false);
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
      {/* Corners - Larger hit area */}
      <div
        className={`${classes} cursor-nwse-resize`}
        style={{ top: 0, left: 0, width: size * 2, height: size * 2 }}
        onPointerDown={handlePointerDown("nw")}
        title="Resize"
        {...commonProps}
      />
      <div
        className={`${classes} cursor-nesw-resize`}
        style={{ top: 0, right: 0, width: size * 2, height: size * 2 }}
        onPointerDown={handlePointerDown("ne")}
        title="Resize"
        {...commonProps}
      />
      <div
        className={`${classes} cursor-nesw-resize`}
        style={{ bottom: 0, left: 0, width: size * 2, height: size * 2 }}
        onPointerDown={handlePointerDown("sw")}
        title="Resize"
        {...commonProps}
      />
      <div
        className={`${classes} cursor-nwse-resize`}
        style={{ bottom: 0, right: 0, width: size * 2, height: size * 2 }}
        onPointerDown={handlePointerDown("se")}
        title="Resize"
        {...commonProps}
      />

      {/* Edges */}
      <div
        className={`${classes} cursor-ns-resize`}
        style={{ top: 0, left: size * 2, right: size * 2, height: size }}
        onPointerDown={handlePointerDown("n")}
        {...commonProps}
      />
      <div
        className={`${classes} cursor-ns-resize`}
        style={{ bottom: 0, left: size * 2, right: size * 2, height: size }}
        onPointerDown={handlePointerDown("s")}
        {...commonProps}
      />
      <div
        className={`${classes} cursor-ew-resize`}
        style={{ top: size * 2, bottom: size * 2, left: 0, width: size }}
        onPointerDown={handlePointerDown("w")}
        {...commonProps}
      />
      <div
        className={`${classes} cursor-ew-resize`}
        style={{ top: size * 2, bottom: size * 2, right: 0, width: size }}
        onPointerDown={handlePointerDown("e")}
        {...commonProps}
      />
    </>
  );
};
