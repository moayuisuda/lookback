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

type CanvasTextActivationEvent =
  | React.MouseEvent<SVGGElement>
  | React.PointerEvent<SVGGElement>;

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

const TEXT_LINE_HEIGHT = 1.2;

const getTextLines = (text: string) => text.split("\n");

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
  const editingRef = useRef(false);
  const [isEditing, setIsEditing] = useState(false);
  const textLines = getTextLines(itemSnap.text);
  const lineHeight = itemSnap.fontSize * TEXT_LINE_HEIGHT;
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
    const nextHeight = lineHeight * textLines.length;
    if (itemSnap.width !== nextWidth || itemSnap.height !== nextHeight) {
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
    lineHeight,
    textLines.length,
  ]);

  const startEditing = useMemoizedFn((initialSelection: "all" | "end") => {
    const textNode = textRef.current;
    if (!textNode) return false;
    if (editingRef.current) return false;

    editingRef.current = true;
    setIsEditing(true);
    textNode.style.visibility = "hidden";

    const bbox = textNode.getBoundingClientRect();
    const centerX = bbox.left + bbox.width / 2;
    const centerY = bbox.top + bbox.height / 2;
    const host = document.body;

    const textarea = document.createElement("textarea");
    let focusTimer: number | null = null;
    let isRemoved = false;
    textarea.rows = 1;
    textarea.wrap = "off";
    host.appendChild(textarea);

    textarea.value = itemSnap.text;
    textarea.style.position = "absolute";
    textarea.style.boxSizing = "border-box";
    textarea.style.border = "none";
    textarea.style.padding = "0px";
    textarea.style.margin = "0px";
    textarea.style.overflow = "hidden";
    textarea.style.resize = "none";
    textarea.style.whiteSpace = "pre";
    textarea.style.background = "none";
    textarea.style.outline = "none";
    textarea.style.lineHeight = String(TEXT_LINE_HEIGHT);
    textarea.style.fontFamily = "inherit";
    textarea.style.textAlign = "center";
    textarea.style.zIndex = "50";

    textarea.style.color = getTextUrl(textarea.value)
      ? THEME.primary
      : itemSnap.fill;

    const visualScale =
      (canvasState.canvasViewport.scale || 1) * (itemSnap.scale || 1);
    const screenFontSize = itemSnap.fontSize * visualScale;
    const screenLineHeight = screenFontSize * TEXT_LINE_HEIGHT;
    textarea.style.fontSize = `${screenFontSize}px`;

    let currentWidth = Math.max(screenFontSize, bbox.width);
    let currentHeight = Math.max(screenLineHeight, bbox.height);

    const updatePosition = () => {
      const left = centerX - currentWidth / 2 + window.scrollX;
      const top = centerY - currentHeight / 2 + window.scrollY;
      textarea.style.left = `${left}px`;
      textarea.style.top = `${top}px`;
    };

    textarea.style.width = `${currentWidth}px`;
    textarea.style.height = `${currentHeight}px`;
    updatePosition();

    const syncSize = () => {
      const lines = getTextLines(textarea.value);
      textarea.style.width = "1px";
      currentWidth = Math.max(screenFontSize, textarea.scrollWidth + 2);
      currentHeight = Math.max(screenLineHeight, lines.length * screenLineHeight);
      textarea.style.width = `${currentWidth}px`;
      textarea.style.height = `${currentHeight}px`;
      updatePosition();
      textarea.style.color = getTextUrl(textarea.value)
        ? THEME.primary
        : itemSnap.fill;

      onCommit({
        text: textarea.value,
      });
    };

    const removeTextarea = (commit: boolean) => {
      if (isRemoved) return;
      isRemoved = true;
      if (focusTimer !== null) {
        window.clearTimeout(focusTimer);
        focusTimer = null;
      }
      if (textarea.parentNode) {
        textarea.parentNode.removeChild(textarea);
      }
      window.removeEventListener("pointerdown", handleOutsidePointerDown);
      editingRef.current = false;
      setIsEditing(false);
      textNode.style.visibility = "visible";
      cleanupRef.current = null;
      if (commit) {
        onCommit({
          text: textarea.value,
        });
      }
    };

    const handleOutsidePointerDown = (e: PointerEvent) => {
      if (e.target !== textarea) {
        removeTextarea(true);
      }
    };

    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        removeTextarea(true);
        onCommitEnter?.();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        removeTextarea(false);
      }
    });

    textarea.addEventListener("paste", (e) => {
      const pastedText = e.clipboardData?.getData("text/plain");
      if (!pastedText) return;

      e.preventDefault();
      const normalizedText = pastedText.replace(/\r\n?/g, "\n");
      textarea.setRangeText(
        normalizedText,
        textarea.selectionStart,
        textarea.selectionEnd,
        "end",
      );
      syncSize();
    });

    textarea.addEventListener("input", () => {
      syncSize();
    });

    syncSize();
    focusTimer = window.setTimeout(() => {
      focusTimer = null;
      if (!textarea.isConnected) return;
      textarea.focus();
      if (initialSelection === "all") {
        textarea.setSelectionRange(0, textarea.value.length);
      } else {
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      }
    }, 100);

    // 等当前 pointerdown 完整传播后再监听，避免双击事件关闭刚创建的编辑器。
    queueMicrotask(() => {
      if (isRemoved || !textarea.isConnected) return;
      window.addEventListener("pointerdown", handleOutsidePointerDown);
    });

    cleanupRef.current = () => removeTextarea(false);

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

  const handleDoubleClick = (e: CanvasTextActivationEvent) => {
    if (editingRef.current) return;
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
          {textLines.map((line, index) => (
            <tspan
              key={index}
              x={0}
              y={(index - (textLines.length - 1) / 2) * lineHeight}
            >
              {line || "\u200b"}
            </tspan>
          ))}
        </text>
      </g>
    </CanvasNode>
  );
};
