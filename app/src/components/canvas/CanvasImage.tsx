import React, { useEffect, useRef, useMemo } from "react";
import {
  Group,
  Image as KonvaImage,
  Transformer,
} from "react-konva";
import useImage from "use-image";
import Konva from "konva";
import { type CanvasImage as CanvasImageState } from "../../store/canvasStore";
import { getImageUrl } from "../../store/galleryStore";
import { canvasActions } from "../../store/canvasStore";
import { THEME } from "../../theme";
import { CanvasControlButton } from "./CanvasButton";
import { CANVAS_ICONS } from "./CanvasIcons";
import { getKonvaFilters, applyFilterConfigs } from "../../utils/imageFilters";

interface CanvasImageProps {
  image: CanvasImageState;
  isSelected: boolean;
  showControls: boolean;
  isPanModifierActive: boolean;
  stageScale: number;
  onDragStart: (pos: { x: number; y: number }) => void;
  onDragMove: (pos: { x: number; y: number }) => void;
  onDragEnd: (pos: { x: number; y: number }) => void;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onChange: (next: Partial<CanvasImageState>) => void;
  onCommit: (next: Partial<CanvasImageState>) => void;
  onDelete: () => void;
  globalGrayscale: boolean;
  globalFilters: readonly string[];
}

export const CanvasImage: React.FC<CanvasImageProps> = ({
  image,
  isSelected,
  showControls,
  isPanModifierActive,
  stageScale,
  onDragStart,
  onDragMove,
  onDragEnd,
  onSelect,
  onChange,
  onCommit,
  onDelete,
  globalGrayscale,
  globalFilters = [],
}) => {
  const [img] = useImage(getImageUrl(image.imagePath), "anonymous");
  const groupRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const imgRef = useRef<Konva.Image>(null);

  // Compute final filter list
  const activeFilters = useMemo(() => {
    const filters = new Set<string>();
    
    // Legacy support
    if (globalGrayscale) filters.add('grayscale');
    if (image.grayscale) filters.add('grayscale');

    // New filter system
    globalFilters.forEach(f => filters.add(f));
    (image.filters || []).forEach(f => filters.add(f));

    return Array.from(filters);
  }, [globalGrayscale, image.grayscale, globalFilters, image.filters]);

  const konvaFilters = useMemo(() => getKonvaFilters(activeFilters), [activeFilters]);

  useEffect(() => {
    const node = imgRef.current;
    if (!node || !img) return;

    // Always clear cache first to ensure we don't have stale cache
    node.clearCache();

    if (activeFilters.length > 0) {
      // Apply configs (like posterize levels)
      applyFilterConfigs(node, activeFilters);

      // Cache is required for filters to work
      // Limit pixelRatio to 1 to avoid huge textures on retina screens which cause lag during drag
      node.cache({ pixelRatio: 1 });
    }
  }, [activeFilters, img, image.width, image.height]);

  useEffect(() => {
    if (img && (image.width !== img.width || image.height !== img.height)) {
      canvasActions.updateCanvasImageSilent(image.canvasId, {
        width: img.width,
        height: img.height,
      });
    }
  }, [img, image.width, image.height, image.canvasId]);

  useEffect(() => {
    if (typeof image.scaleX !== "number" && typeof image.scaleY !== "number")
      return;

    const legacyScaleX =
      typeof image.scaleX === "number" ? image.scaleX : undefined;
    const legacyScaleY =
      typeof image.scaleY === "number" ? image.scaleY : undefined;

    const hasLegacyMagnitude =
      (typeof legacyScaleX === "number" && Math.abs(legacyScaleX) !== 1) ||
      (typeof legacyScaleY === "number" && Math.abs(legacyScaleY) !== 1);

    if (!hasLegacyMagnitude) return;

    const magnitude =
      typeof legacyScaleX === "number"
        ? Math.abs(legacyScaleX)
        : typeof legacyScaleY === "number"
        ? Math.abs(legacyScaleY)
        : 1;

    const flipSign =
      typeof legacyScaleX === "number" ? (legacyScaleX < 0 ? -1 : 1) : 1;

    canvasActions.updateCanvasImageSilent(image.canvasId, {
      scale: magnitude,
      scaleX: flipSign,
      scaleY: 1,
    });
  }, [image.scaleX, image.scaleY, image.canvasId]);

  useEffect(() => {
    if (isSelected && trRef.current && groupRef.current) {
      trRef.current.nodes([groupRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  const handleFlip = () => {
    const sign = (image.scaleX ?? 1) < 0 ? -1 : 1;
    onCommit({ scaleX: sign * -1 });
  };

  const scale = image.scale || 1;
  const flipX = (image.scaleX ?? 1) < 0;

  const btnScale = 1 / (scale * stageScale);

  return (
    <>
      <Group
        ref={groupRef}
        name={`image-${image.canvasId}`}
        x={image.x}
        y={image.y}
        rotation={image.rotation}
        scaleX={scale}
        scaleY={scale}
        draggable={!isPanModifierActive}
        onMouseDown={(e) => {
          if ((e.evt as MouseEvent).button === 2) return;
          if (isPanModifierActive) return;
          onSelect(e);
          canvasActions.bringToFront(image.canvasId);
        }}
        onDragStart={(e) => {
          if (isPanModifierActive) return;
          canvasActions.bringToFront(image.canvasId);
          onDragStart({ x: e.target.x(), y: e.target.y() });
        }}
        onDragMove={(e) => {
          onDragMove({ x: e.target.x(), y: e.target.y() });
        }}
        onDragEnd={(e) => {
          onDragEnd({ x: e.target.x(), y: e.target.y() });
        }}
        onTransform={() => {
          const node = groupRef.current;
          if (!node) return;
          onChange({
            x: node.x(),
            y: node.y(),
            scale: node.scaleX(),
            rotation: node.rotation(),
          });
        }}
        onTransformEnd={() => {
          const node = groupRef.current;
          if (!node) return;
          onCommit({
            x: node.x(),
            y: node.y(),
            scale: node.scaleX(),
            rotation: node.rotation(),
          });
        }}
      >
        <KonvaImage
          ref={imgRef}
          filters={konvaFilters.length > 0 ? konvaFilters : undefined}
          image={img}
          width={image.width}
          height={image.height}
          scaleX={flipX ? -1 : 1}
          offsetX={flipX ? image.width || 0 : 0}
        />
      </Group>
      {showControls && (
        <Transformer
          ref={trRef}
          enabledAnchors={["bottom-right"]}
          rotateEnabled
          padding={0}
          keepRatio
          anchorSize={10}
          borderStroke={THEME.primary}
          anchorStroke={THEME.primary}
          anchorFill="white"
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 5 || newBox.height < 5) {
              return oldBox;
            }
            return newBox;
          }}
        />
      )}
      {showControls && (
        <Group
          x={image.x}
          y={image.y}
          rotation={image.rotation}
          scaleX={scale}
          scaleY={scale}
          zIndex={999}
          onMouseDown={(e) => {
            e.cancelBubble = true;
          }}
        >
          <CanvasControlButton
            x={0}
            y={0}
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
              e.cancelBubble = true;
              handleFlip();
            }}
          />
          <CanvasControlButton
            x={image.width || 100}
            y={0}
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
              e.cancelBubble = true;
              onDelete();
            }}
          />
        </Group>
      )}
    </>
  );
};
