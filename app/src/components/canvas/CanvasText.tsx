import {
  type CanvasText as CanvasTextState,
  canvasActions,
  canvasState,
} from "../../store/canvasStore";
import { useEffect, useRef, useState } from "react";
import { useSnapshot } from "valtio";
import { CanvasNode } from "./CanvasNode";
import { useMemoizedFn } from "ahooks";
import { useT } from "../../i18n/useT";
import { THEME } from "../../theme";

interface CanvasTextProps {
  item: CanvasTextState;

  onDragStart: (pos: { clientX: number; clientY: number }) => void;
  onDragMove: (delta: { dx: number; dy: number }) => void;
  onDragEnd: (delta: { dx: number; dy: number }) => void;
  onSelect: (
    e: React.MouseEvent<SVGGElement> | React.PointerEvent<SVGGElement>,
  ) => void;
  onCommit: (next: Partial<CanvasTextState>) => void;
  onCommitEnter?: () => void;
}

import { useVisualRenderCheck } from "../../hooks/useVisualRenderCheck";

const getTextUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed) || !/^https?:\/\//i.test(trimmed)) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
};

const isModClick = (
  event:
    | React.MouseEvent<SVGGElement>
    | React.PointerEvent<SVGGElement>
    | React.MouseEvent<SVGTextElement>,
) => event.metaKey || event.ctrlKey;

export const CanvasText = ({
  item,
  onDragStart,
  onDragMove,
  onDragEnd,
  onSelect,
  onCommit,
  onCommitEnter,
}: CanvasTextProps) => {
  useVisualRenderCheck(`CanvasText:${item.itemId}`);
  const { t } = useT();
  const itemSnap = useSnapshot(item);
  const textRef = useRef<SVGTextElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const textUrl = getTextUrl(itemSnap.text);
  const linkTitle = textUrl
    ? t("canvas.text.openLinkHint", { url: textUrl })
    : undefined;
  const textFill = textUrl ? THEME.primary : itemSnap.fill;

  const openTextUrl = useMemoizedFn(async () => {
    if (!textUrl) return;
    if (window.electron?.openExternal) {
      await window.electron.openExternal(textUrl);
      return;
    }
    window.open(textUrl, "_blank", "noopener,noreferrer");
  });

  useEffect(() => {
    const node = textRef.current;
    if (!node) return;
    const bbox = node.getBBox();
    const nextWidth = Math.max(0, bbox.width);
    const nextHeight = Math.max(0, bbox.height);
    if (
      !isEditing &&
      (itemSnap.width !== nextWidth || itemSnap.height !== nextHeight)
    ) {
      canvasActions.updateCanvasImageSilent(itemSnap.itemId, {
        width: nextWidth,
        height: nextHeight,
      });
    }
  }, [
    itemSnap.text,
    itemSnap.fontSize,
    itemSnap.align,
    itemSnap.width,
    itemSnap.height,
    itemSnap.itemId,
    isEditing,
  ]);

  const startEditing = useMemoizedFn((initialSelection: "all" | "end") => {
    const textNode = textRef.current;
    if (!textNode) return false;
    if (isEditing) return false;

    setIsEditing(true);
    textNode.style.visibility = "hidden";

    const bbox = textNode.getBoundingClientRect();
    const centerX = bbox.left + bbox.width / 2;
    const centerY = bbox.top + bbox.height / 2;
    const host = document.body;

    const input = document.createElement("input");
    input.type = "text";
    host.appendChild(input);

    input.value = itemSnap.text;
    input.style.position = "absolute";
    input.style.border = "none";
    input.style.padding = "0px";
    input.style.margin = "0px";
    input.style.overflow = "hidden";
    input.style.background = "none";
    input.style.outline = "none";
    input.style.lineHeight = "1.2";
    input.style.fontFamily = "inherit";
    input.style.textAlign = "center";
    input.style.zIndex = "50";

    input.style.color = getTextUrl(input.value) ? THEME.primary : itemSnap.fill;

    const visualScale = canvasState.canvasViewport.scale || 1;
    const screenFontSize = itemSnap.fontSize * visualScale;
    input.style.fontSize = `${screenFontSize}px`;

    const baseWidth = bbox.width * visualScale;
    const baseHeight = Math.max(screenFontSize * 1.2, bbox.height);
    let currentWidth = baseWidth;
    const currentHeight = baseHeight;

    const updatePosition = () => {
      const left = centerX - currentWidth / 2 + window.scrollX;
      const top = centerY - currentHeight / 2 + window.scrollY;
      input.style.left = `${left}px`;
      input.style.top = `${top}px`;
    };

    input.style.width = `${baseWidth}px`;
    input.style.height = `${baseHeight}px`;
    updatePosition();

    const syncSize = () => {
      input.style.width = "auto";

      const measuredWidth = input.scrollWidth || baseWidth;
      input.style.width = `${measuredWidth}px`;
      currentWidth = measuredWidth;
      updatePosition();
      input.style.color = getTextUrl(input.value)
        ? THEME.primary
        : itemSnap.fill;

      onCommit({
        text: input.value,
      });
    };

    syncSize();
    setTimeout(() => {
      input.focus();
      if (initialSelection === "all") {
        input.setSelectionRange(0, input.value.length);
      } else {
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }, 100);

    const removeInput = (commit: boolean) => {
      if (input.parentNode) {
        input.parentNode.removeChild(input);
      }
      window.removeEventListener("click", handleOutsideClick);
      setIsEditing(false);
      textNode.style.visibility = "visible";
      cleanupRef.current = null;
      if (commit) {
        onCommit({
          text: input.value,
        });
      }
    };

    const handleOutsideClick = (e: MouseEvent) => {
      if (e.target !== input) {
        removeInput(true);
      }
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        removeInput(true);
        onCommitEnter?.();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        removeInput(false);
      }
    });

    input.addEventListener("input", () => {
      syncSize();
    });

    setTimeout(() => {
      window.addEventListener("click", handleOutsideClick);
    });

    cleanupRef.current = () => removeInput(false);

    return true;
  });

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  useEffect(() => {
    if (!itemSnap.isAutoEdit) return;
    if (isEditing) return;
    const timer = window.setTimeout(() => {
      const started = startEditing("all");
      if (started) {
        canvasActions.updateCanvasImageSilent(itemSnap.itemId, {
          isAutoEdit: false,
        });
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [itemSnap.isAutoEdit, isEditing, startEditing, itemSnap.itemId]);

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

  const handleDoubleClick = (e: React.MouseEvent<SVGGElement>) => {
    if (isEditing) return;
    const target = e.target as Element | null;
    if (target && target.closest("[data-control]")) return;
    startEditing("end");
  };

  const handleClick = (e: React.MouseEvent<SVGGElement>) => {
    if (!textUrl || !isModClick(e)) return;
    e.preventDefault();
    e.stopPropagation();
    void openTextUrl();
  };

  return (
    <CanvasNode
      id={itemSnap.itemId}
      x={itemSnap.x}
      y={itemSnap.y}
      rotation={itemSnap.rotation}
      scale={itemSnap.scale || 1}
      draggable={!isEditing}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onSelect={handleSelect}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      <g
        ref={
          useVisualRenderCheck(
            `CanvasTextContent:${itemSnap.itemId}`,
          ) as React.Ref<SVGGElement>
        }
      >
        <text
          className="text-node"
          ref={textRef}
          x={0}
          y={0}
          fontSize={itemSnap.fontSize}
          fill={textFill}
          textAnchor="middle"
          dominantBaseline="central"
          style={textUrl ? { cursor: "alias" } : undefined}
        >
          {linkTitle ? <title>{linkTitle}</title> : null}
          {itemSnap.text}
        </text>
      </g>
    </CanvasNode>
  );
};
