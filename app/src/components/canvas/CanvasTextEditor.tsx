import {
  useEffect,
  useLayoutEffect,
  useRef,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { useMemoizedFn } from "ahooks";
import { useSnapshot } from "valtio";
import {
  canvasState,
  type CanvasText as CanvasTextState,
} from "../../store/canvasStore";
import {
  CANVAS_TEXT_LINE_HEIGHT,
  getCanvasTextLines,
  normalizePastedCanvasText,
} from "./canvasTextLayout";

export type CanvasTextEditorInitialSelection = "all" | "end";

interface CanvasTextEditorProps {
  item: CanvasTextState;
  textNode: SVGTextElement;
  color: string;
  initialSelection: CanvasTextEditorInitialSelection;
  onChange: (text: string) => void;
  onClose: (commit: boolean) => void;
  onCommitEnter?: () => void;
}

export const CanvasTextEditor = ({
  item,
  textNode,
  color,
  initialSelection,
  onChange,
  onClose,
  onCommitEnter,
}: CanvasTextEditorProps) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const itemSnap = useSnapshot(item);
  const canvasSnap = useSnapshot(canvasState);
  const viewportX = canvasSnap.canvasViewport.x;
  const viewportY = canvasSnap.canvasViewport.y;
  const viewportScale = canvasSnap.canvasViewport.scale || 1;
  const canvasWidth = canvasSnap.dimensions.width;
  const canvasHeight = canvasSnap.dimensions.height;

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const screenScale = viewportScale * Math.abs(itemSnap.scale || 1);
    const screenFontSize = itemSnap.fontSize * screenScale;
    const screenLineHeight = screenFontSize * CANVAS_TEXT_LINE_HEIGHT;
    const textBounds = textNode.getBBox();
    const screenBounds = textNode.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(textNode);

    textarea.style.left = `${screenBounds.left + screenBounds.width / 2 + window.scrollX}px`;
    textarea.style.top = `${screenBounds.top + screenBounds.height / 2 + window.scrollY}px`;
    textarea.style.width = `${Math.max(screenFontSize, textBounds.width * screenScale + 2)}px`;
    textarea.style.height = `${Math.max(
      screenLineHeight,
      getCanvasTextLines(itemSnap.text).length * screenLineHeight,
    )}px`;
    textarea.style.fontSize = `${screenFontSize}px`;
    textarea.style.fontFamily = computedStyle.fontFamily;
    textarea.style.fontWeight = computedStyle.fontWeight;
    textarea.style.fontStyle = computedStyle.fontStyle;
    textarea.style.letterSpacing = computedStyle.letterSpacing;
    textarea.style.transform = `translate(-50%, -50%) rotate(${itemSnap.rotation}deg)`;
    textarea.style.visibility = "visible";
  }, [
    canvasHeight,
    canvasWidth,
    itemSnap.fontSize,
    itemSnap.rotation,
    itemSnap.scale,
    itemSnap.text,
    textNode,
    viewportScale,
    viewportX,
    viewportY,
  ]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const animationFrame = window.requestAnimationFrame(() => {
      if (!textarea.isConnected) return;
      textarea.focus();
      const selectionStart =
        initialSelection === "all" ? 0 : textarea.value.length;
      textarea.setSelectionRange(selectionStart, textarea.value.length);
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [initialSelection]);

  const closeEditor = useMemoizedFn((commit: boolean) => {
    onClose(commit);
  });

  useEffect(() => {
    let isActive = true;
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const textarea = textareaRef.current;
      const target = event.target;
      if (
        textarea &&
        target instanceof Node &&
        !textarea.contains(target)
      ) {
        closeEditor(true);
      }
    };

    // 当前双击的 pointerdown 完整传播后再启用外部点击关闭。
    queueMicrotask(() => {
      if (!isActive) return;
      window.addEventListener("pointerdown", handleOutsidePointerDown, true);
    });

    return () => {
      isActive = false;
      window.removeEventListener("pointerdown", handleOutsidePointerDown, true);
    };
  }, [closeEditor]);

  const handleChange = useMemoizedFn(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      onChange(event.currentTarget.value);
    },
  );

  const handlePaste = useMemoizedFn(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const pastedText = event.clipboardData.getData("text/plain");
      if (!pastedText) return;

      event.preventDefault();
      const textarea = event.currentTarget;
      textarea.setRangeText(
        normalizePastedCanvasText(pastedText),
        textarea.selectionStart,
        textarea.selectionEnd,
        "end",
      );
      onChange(textarea.value);
    },
  );

  const handleKeyDown = useMemoizedFn(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (
        event.key === "Enter" &&
        !event.shiftKey &&
        !event.nativeEvent.isComposing
      ) {
        event.preventDefault();
        closeEditor(true);
        onCommitEnter?.();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closeEditor(false);
      }
    },
  );

  return createPortal(
    <textarea
      ref={textareaRef}
      rows={1}
      wrap="off"
      value={itemSnap.text}
      onChange={handleChange}
      onPaste={handlePaste}
      onKeyDown={handleKeyDown}
      style={{
        position: "absolute",
        boxSizing: "border-box",
        border: "none",
        padding: 0,
        margin: 0,
        overflow: "hidden",
        resize: "none",
        whiteSpace: "pre",
        background: "none",
        outline: "none",
        lineHeight: CANVAS_TEXT_LINE_HEIGHT,
        textAlign: "center",
        transformOrigin: "center",
        visibility: "hidden",
        zIndex: 50,
        color,
      }}
    />,
    document.body,
  );
};
