import React, { useRef } from "react";
import { useSnapshot } from "valtio";
import {
  canvasState,
  canvasActions,
  type CanvasImage,
} from "../../store/canvasStore";
import { THEME } from "../../theme";

export const Minimap: React.FC = () => {
  const canvasSnap = useSnapshot(canvasState);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewport = canvasSnap.canvasViewport;

  if (!viewport || viewport.width <= 0 || viewport.height <= 0) return null;

  // Calculate World Bounds
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  (canvasSnap.canvasItems || []).forEach((item) => {
    const scale = item.scale || 1;
    const w = (item.width || 0) * scale;
    const h = (item.height || 0) * scale;
    minX = Math.min(minX, item.x - w / 2);
    minY = Math.min(minY, item.y - h / 2);
    maxX = Math.max(maxX, item.x + w / 2);
    maxY = Math.max(maxY, item.y + h / 2);
  });

  const viewX = -viewport.x / viewport.scale;
  const viewY = -viewport.y / viewport.scale;
  const viewW = viewport.width / viewport.scale;
  const viewH = viewport.height / viewport.scale;

  // If no images, center on view
  if (!isFinite(minX)) {
    minX = viewX;
    minY = viewY;
    maxX = viewX + viewW;
    maxY = viewY + viewH;
  } else {
    // Expand bounds to include current viewport
    minX = Math.min(minX, viewX);
    minY = Math.min(minY, viewY);
    maxX = Math.max(maxX, viewX + viewW);
    maxY = Math.max(maxY, viewY + viewH);
  }

  // Add some padding
  const padding = 100; // World units
  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;

  const worldW = maxX - minX;
  const worldH = maxY - minY;

  // Minimap constraints
  const MAX_SIZE = 100;

  // Determine scale to fit world into MAX_SIZE box
  const mapScale = Math.min(MAX_SIZE / worldW, MAX_SIZE / worldH);

  const mapW = worldW * mapScale;
  const mapH = worldH * mapScale;

  // Helper: World -> Map
  const toMapX = (val: number) => (val - minX) * mapScale;
  const toMapY = (val: number) => (val - minY) * mapScale;

  const handleMapInteraction = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const viewportNow = canvasState.canvasViewport;
    const scale = viewportNow.scale || 1;
    const viewWNow = viewportNow.width / scale;
    const viewHNow = viewportNow.height / scale;

    const targetWorldX = clickX / mapScale + minX;
    const targetWorldY = clickY / mapScale + minY;

    const newX = -(targetWorldX - viewWNow / 2) * scale;
    const newY = -(targetWorldY - viewHNow / 2) * scale;

    canvasActions.setCanvasViewport({
      x: newX,
      y: newY,
      width: viewportNow.width,
      height: viewportNow.height,
      scale,
    });
  };

  return (
    <div
      ref={containerRef}
      className="absolute top-4 right-4 bg-neutral-900/90 border border-neutral-700 rounded-md shadow-xl overflow-hidden z-50 backdrop-blur-sm"
      style={{ width: mapW, height: mapH }}
      onMouseDown={(e) => {
        e.stopPropagation();
        if (e.buttons === 1) handleMapInteraction(e);
      }}
      onMouseMove={(e) => {
        e.stopPropagation();
        if (e.buttons === 1) handleMapInteraction(e);
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {(canvasSnap.canvasItems || [])
        .filter((item): item is CanvasImage => item.type === "image")
        .map((item) => {
          const scale = item.scale || 1;
          const w = (item.width || 0) * scale;
          const h = (item.height || 0) * scale;

          const dominantColor =
            typeof item.dominantColor === "string" &&
            item.dominantColor.trim().length > 0
              ? item.dominantColor
              : "#6b7280";

          return (
            <div
              key={item.itemId}
              className="absolute"
              style={{
                left: toMapX(item.x - w / 2),
                top: toMapY(item.y - h / 2),
                width: Math.max(2, w * mapScale),
                height: Math.max(2, h * mapScale),
                backgroundColor: dominantColor,
                borderRadius: 1,
              }}
            />
          );
        })}

      {/* Viewport Rect */}
      <div
        className="absolute border-2 box-border rounded-sm minimap-viewport"
        style={{
          left: toMapX(viewX),
          top: toMapY(viewY),
          width: Math.max(4, viewW * mapScale),
          height: Math.max(4, viewH * mapScale),
          borderColor: THEME.primary,
          boxShadow: `0 0 10px ${THEME.canvas.selectionFill}`,
        }}
      />
    </div>
  );
};
