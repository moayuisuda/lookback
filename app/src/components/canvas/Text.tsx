import type Konva from "konva";
import { type CanvasText as CanvasTextState } from "../../store/galleryStore";
import { canvasActions } from "../../store/canvasStore";
import { useCallback, useEffect, useRef, useState } from "react";
import React from "react";
import {
  Transformer,
  Path,
  Text as KonvaText,
  Circle,
  Group,
} from "react-konva";

import { THEME } from "../../theme";
const TrashIconPath = "M4 7h16M6 7l1 14h10l1-14M9 7V4h6v3";

interface CanvasTextProps {
  item: CanvasTextState;
  isSelected: boolean;
  showControls: boolean;
  isPanModifierActive: boolean;
  stageScale: number;
  onDragStart: (pos: { x: number; y: number }) => void;
  onDragMove: (pos: { x: number; y: number }) => void;
  onDragEnd: (pos: { x: number; y: number }) => void;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onCommit: (next: Partial<CanvasTextState>) => void;
  onDelete: () => void;
  autoEdit?: boolean;
  onAutoEditComplete?: () => void;
   onCommitEnter?: () => void;
}

export const CanvasText = ({
  item,
  isSelected,
  showControls,
  isPanModifierActive,
  stageScale,
  onDragStart,
  onDragMove,
  onDragEnd,
  onSelect,
  onCommit,
  onDelete,
  autoEdit,
  onAutoEditComplete,
  onCommitEnter,
}: CanvasTextProps) => {
  const groupRef = useRef<Konva.Group>(null);
  const textRef = useRef<Konva.Text>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const controlsRef = useRef<Konva.Group>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [textRect, setTextRect] = useState<{ width: number; height: number }>({
    width: item.width || 200,
    height: item.height || 0,
  });

  useEffect(() => {
    const node = textRef.current;
    if (!node) return;
    const rect = node.getClientRect({ skipTransform: true });
    setTextRect({
      width: Math.max(0, rect.width),
      height: Math.max(0, rect.height),
    });
    trRef.current?.forceUpdate();
    trRef.current?.getLayer()?.batchDraw();
  }, [item.text, item.fontSize, item.align]);

  useEffect(() => {
    if (isSelected && trRef.current && groupRef.current) {
      trRef.current.nodes([groupRef.current]);
      trRef.current.forceUpdate();
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  const startEditing = useCallback((initialSelection: "all" | "end") => {
    const textNode = textRef.current;
    const stage = textNode?.getStage();
    if (!textNode || !stage) return false;
    if (isEditing) return false;

    setIsEditing(true);
    textNode.hide();
    trRef.current?.hide();

    const textPosition = textNode.getAbsolutePosition();
    const stageBox = stage.container().getBoundingClientRect();
    const host = stage.container().parentElement || document.body;
    const hostBox = host.getBoundingClientRect();
    const areaPosition = {
      x: stageBox.left - hostBox.left + textPosition.x,
      y: stageBox.top - hostBox.top + textPosition.y,
    };

    const textarea = document.createElement("textarea");
    host.appendChild(textarea);

    textarea.value = textNode.text();
    textarea.style.position = "absolute";
    textarea.style.top = `${areaPosition.y}px`;
    textarea.style.left = `${areaPosition.x}px`;
    textarea.style.border = "none";
    textarea.style.padding = "0px";
    textarea.style.margin = "0px";
    textarea.style.overflow = "hidden";
    textarea.style.background = "none";
    textarea.style.outline = "none";
    textarea.style.resize = "none";
    textarea.style.whiteSpace = "pre";
    textarea.style.lineHeight = textNode.lineHeight().toString();
    textarea.style.fontFamily = textNode.fontFamily();
    textarea.style.textAlign = textNode.align();
    textarea.style.zIndex = "50";

    const fill = textNode.fill();
    if (typeof fill === "string") {
      textarea.style.color = fill;
    }

    const visualScale = stage.scaleX() || 1;
    const screenFontSize = textNode.fontSize() * visualScale;
    textarea.style.fontSize = `${screenFontSize}px`;

    const rect = textNode.getClientRect({ skipTransform: true });
    const baseWidth = Math.max(80, rect.width) * visualScale;
    const baseHeight = Math.max(
      screenFontSize * 1.2,
      (rect.height || screenFontSize * 1.4) * visualScale
    );
    textarea.style.width = `${baseWidth}px`;
    textarea.style.height = `${baseHeight}px`;

    const syncSize = () => {
      textarea.style.height = "auto";
      textarea.style.width = "auto";

      const nextHeight = Math.max(baseHeight, textarea.scrollHeight + 2);
      const nextWidth = Math.max(baseWidth, textarea.scrollWidth + 2);
      textarea.style.height = `${nextHeight}px`;
      textarea.style.width = `${nextWidth}px`;

      canvasActions.updateCanvasImageSilent(item.canvasId, {
        text: textarea.value,
        width: nextWidth / visualScale,
        height: nextHeight / visualScale,
      });
    };

    syncSize();
    setTimeout(() => {
      textarea.focus();
      if (initialSelection === "all") {
        textarea.setSelectionRange(0, textarea.value.length);
      } else {
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      }
    }, 100);

    const removeTextarea = (commit: boolean) => {
      if (textarea.parentNode) {
        textarea.parentNode.removeChild(textarea);
      }
      window.removeEventListener("click", handleOutsideClick);
      setIsEditing(false);
      textNode.show();
      trRef.current?.show();
      trRef.current?.forceUpdate();
      trRef.current?.getLayer()?.batchDraw();
      if (commit) {
        textNode.text(textarea.value);
        const nextRect = textNode.getClientRect({ skipTransform: true });
        onCommit({
          text: textarea.value,
          width: Math.max(0, nextRect.width),
          height: Math.max(0, nextRect.height),
        });
      }
    };

    const handleOutsideClick = (e: MouseEvent) => {
      if (e.target !== textarea) {
        removeTextarea(true);
      }
    };

    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        removeTextarea(true);
        onCommitEnter?.();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        removeTextarea(false);
      }
    });

    textarea.addEventListener("input", () => {
      syncSize();
    });

    setTimeout(() => {
      window.addEventListener("click", handleOutsideClick);
    });

    return true;
  }, [isEditing, item.canvasId, onCommit, onCommitEnter]);

  useEffect(() => {
    if (!autoEdit) return;
    if (isEditing) return;
    const timer = window.setTimeout(() => {
      const started = startEditing("all");
      if (started) {
        onAutoEditComplete?.();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [autoEdit, isEditing, startEditing, onAutoEditComplete]);

  const btnScale = 1 / stageScale;
  const deleteOffsetX = textRect.width + 4 * btnScale;
  const deleteOffsetY = 0 - 4 * btnScale;

  return (
    <React.Fragment>
      <Group
        ref={groupRef}
        name={`text-${item.canvasId}`}
        x={item.x}
        y={item.y}
        rotation={item.rotation}
        draggable={!isPanModifierActive && !isEditing}
        onMouseDown={(e) => {
          if ((e.evt as MouseEvent).button === 2) return;
          if (isPanModifierActive) return;
          onSelect(e);
          canvasActions.bringToFront(item.canvasId);
        }}
        onDragStart={(e) => {
          if (isPanModifierActive) return;
          canvasActions.bringToFront(item.canvasId);
          controlsRef.current?.position({ x: e.target.x(), y: e.target.y() });
          controlsRef.current?.rotation(e.target.rotation());
          trRef.current?.forceUpdate();
          trRef.current?.getLayer()?.batchDraw();
          onDragStart({ x: e.target.x(), y: e.target.y() });
        }}
        onDragMove={(e) => {
          controlsRef.current?.position({ x: e.target.x(), y: e.target.y() });
          controlsRef.current?.rotation(e.target.rotation());
          trRef.current?.forceUpdate();
          trRef.current?.getLayer()?.batchDraw();
          onDragMove({ x: e.target.x(), y: e.target.y() });
        }}
        onDragEnd={(e) => {
          controlsRef.current?.position({ x: e.target.x(), y: e.target.y() });
          controlsRef.current?.rotation(e.target.rotation());
          trRef.current?.forceUpdate();
          trRef.current?.getLayer()?.batchDraw();
          onDragEnd({ x: e.target.x(), y: e.target.y() });
        }}
      >
        <KonvaText
          ref={textRef}
          text={item.text}
          fontSize={item.fontSize}
          fill={item.fill}
          align={item.align}
          onDblClick={() => startEditing("end")}
        />
      </Group>
      {showControls && !isEditing && (
        <Transformer
          ref={trRef}
          enabledAnchors={["bottom-right"]}
          rotateEnabled={false}
          padding={5}
          //   boundBoxFunc={(oldBox, newBox) => {
          //     const minSize = 10;
          //     const width = Math.max(minSize, newBox.width);
          //     const height = Math.max(minSize, newBox.height);
          //     return {
          //       ...newBox,
          //       width,
          //       height,
          //       x: oldBox.x,
          //       y: oldBox.y,
          //     };
          //   }}
          anchorSize={10}
          borderStroke={THEME.primary}
          anchorStroke={THEME.primary}
          anchorFill="white"
          onTransform={() => {
            const node = groupRef.current;
            if (!node) return;
            const scaleX = node.scaleX();
            const scaleY = node.scaleY();
            const factor = Math.max(scaleX, scaleY);
            const nextFontSize = Math.max(8, item.fontSize * factor);
            node.scaleX(1);
            node.scaleY(1);
            onCommit({ fontSize: nextFontSize });
          }}
        />
      )}
      {showControls && !isEditing && (
        <Group
          ref={controlsRef}
          x={item.x}
          y={item.y}
          rotation={item.rotation}
          scaleX={1}
          scaleY={1}
          onMouseDown={(e) => {
            e.cancelBubble = true;
          }}
        >
          <Group
            x={deleteOffsetX}
            y={deleteOffsetY}
            scaleX={btnScale}
            scaleY={btnScale}
            onClick={(e) => {
              e.cancelBubble = true;
              onDelete();
            }}
            onMouseEnter={(e) => {
              const container = e.target.getStage()?.container();
              if (container) container.style.cursor = "pointer";
            }}
            onMouseLeave={(e) => {
              const container = e.target.getStage()?.container();
              if (container) container.style.cursor = "default";
            }}
          >
            <Circle radius={12} fill={THEME.danger} />
            <Path
              data={TrashIconPath}
              stroke="white"
              strokeWidth={2}
              lineCap="round"
              lineJoin="round"
              scale={{ x: 0.65, y: 0.65 }}
              x={-8}
              y={-9}
            />
          </Group>
        </Group>
      )}
    </React.Fragment>
  );
};
