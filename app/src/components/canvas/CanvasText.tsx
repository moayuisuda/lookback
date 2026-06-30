import {
  type CanvasText as CanvasTextState,
  canvasActions,
} from "../../store/canvasStore";
import { useEffect, useState } from "react";
import { useSnapshot } from "valtio";
import { CanvasNode } from "./CanvasNode";
import { useMemoizedFn } from "ahooks";
import { useT } from "../../i18n/useT";
import { THEME } from "../../theme";
import {
  CanvasTextEditor,
  type CanvasTextEditorInitialSelection,
} from "./CanvasTextEditor";
import {
  CANVAS_TEXT_LINE_HEIGHT,
  getCanvasTextLines,
} from "./canvasTextLayout";

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

interface CanvasTextEditorSession {
  initialSelection: CanvasTextEditorInitialSelection;
  initialText: string;
}

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
  const [textNode, setTextNode] = useState<SVGTextElement | null>(null);
  const [editorSession, setEditorSession] =
    useState<CanvasTextEditorSession | null>(null);
  const isEditing = editorSession !== null;
  const textLines = getCanvasTextLines(itemSnap.text);
  const lineHeight = itemSnap.fontSize * CANVAS_TEXT_LINE_HEIGHT;
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
    if (!textNode) return;
    const bbox = textNode.getBBox();
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
    textNode,
    textLines.length,
  ]);

  const startEditing = useMemoizedFn(
    (initialSelection: CanvasTextEditorInitialSelection) => {
      if (!textNode || editorSession) return false;
      setEditorSession({
        initialSelection,
        initialText: item.text,
      });
      return true;
    },
  );

  const handleEditorChange = useMemoizedFn((text: string) => {
    canvasActions.updateCanvasImageTransient(item.itemId, { text });
  });

  const handleEditorClose = useMemoizedFn((commit: boolean) => {
    if (!editorSession) return;
    const finalText = item.text;
    setEditorSession(null);
    if (commit) {
      onCommit({ text: finalText });
      return;
    }
    canvasActions.updateCanvasImageTransient(item.itemId, {
      text: editorSession.initialText,
    });
  });

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
    <>
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
            ref={setTextNode}
            x={0}
            y={0}
            fontSize={itemSnap.fontSize}
            fill={textFill}
            textAnchor="middle"
            dominantBaseline="central"
            style={{
              cursor: textUrl ? "alias" : undefined,
              visibility: isEditing ? "hidden" : "visible",
            }}
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
      {editorSession && textNode ? (
        <CanvasTextEditor
          item={item}
          textNode={textNode}
          color={textFill}
          initialSelection={editorSession.initialSelection}
          onChange={handleEditorChange}
          onClose={handleEditorClose}
          onCommitEnter={onCommitEnter}
        />
      ) : null}
    </>
  );
};
