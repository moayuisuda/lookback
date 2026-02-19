import React from "react";
import { useSnapshot } from "valtio";
import {
  canvasActions,
  type CanvasImage as CanvasImageState,
} from "../../store/canvasStore";
import { canvasState } from "../../store/canvasStore";
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
  onDragStart: (pos: { clientX: number; clientY: number }) => void;
  onDragMove: (delta: { dx: number; dy: number }) => void;
  onDragEnd: (delta: { dx: number; dy: number }) => void;
  onSelect: (
    e: React.MouseEvent<SVGGElement> | React.PointerEvent<SVGGElement>,
  ) => void;
  onContain: () => void;
}

import { useVisualRenderCheck } from "../../hooks/useVisualRenderCheck";

export const CanvasImage: React.FC<CanvasImageProps> = ({
  image,
  onDragStart,
  onDragMove,
  onDragEnd,
  onSelect,
  onContain,
}) => {
  useVisualRenderCheck(`CanvasImage:${image.itemId}`);
  const imageSnap = useSnapshot(image);
  const canvasSnap = useSnapshot(canvasState);
  const imageUrl = getImageUrl(
    imageSnap.imagePath,
    canvasSnap.currentCanvasName,
  );

  const scale = imageSnap.scale || 1;
  const flipX = imageSnap.flipX === true;

  const handleSelect = (
    e: React.MouseEvent<SVGGElement> | React.PointerEvent<SVGGElement>,
  ) => {
    const isRightClick = "button" in e && e.button === 2;
    if (!isRightClick) {
      e.stopPropagation();
    }
    onSelect(e);
    canvasActions.bringToFront(imageSnap.itemId);
  };

  const baseWidth = imageSnap.width!;
  const baseHeight = imageSnap.height!;

  const handleDoubleClick = (e: React.MouseEvent<SVGGElement>) => {
    const target = e.target as Element | null;
    if (target && target.closest("[data-control]")) return;
    e.stopPropagation();
    onContain();
  };

  return (
    <CanvasNode
      id={imageSnap.itemId}
      x={imageSnap.x}
      y={imageSnap.y}
      rotation={imageSnap.rotation}
      scale={scale}
      draggable={true}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onSelect={handleSelect}
      onDoubleClick={handleDoubleClick}
    >
      <g
        ref={
          useVisualRenderCheck(
            `CanvasImageContent:${imageSnap.itemId}`,
          ) as React.Ref<SVGGElement>
        }
      >
        <image
          className="image-node"
          href={imageUrl}
          x={-baseWidth / 2}
          y={-baseHeight / 2}
          width={baseWidth}
          height={baseHeight}
          transform={flipX ? "scale(-1 1)" : undefined}
        />
      </g>
    </CanvasNode>
  );
};
