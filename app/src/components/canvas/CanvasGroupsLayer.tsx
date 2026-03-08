import React, { useMemo, useRef } from "react";
import type { Snapshot } from "valtio";
import {
  type CanvasGroup,
  type CanvasItem,
  canvasState,
  getCanvasGroupBounds,
  getCanvasItemBounds,
} from "../../store/canvasStore";
import { CanvasControlButton } from "./CanvasButton";
import { hexToRgba, THEME } from "../../theme";

const TOOLBAR_OFFSET_Y = 16;
const TOOLBAR_GAP_PX = 22;
const COLLAPSED_LABEL_GAP_PX = 0;
const COLLAPSED_PILL_PADDING_X_PX = 8;
const COLLAPSED_PILL_PADDING_Y_PX = 4;
const CONTROL_BUTTON_SIZE_PX = 18;
const COLLAPSED_LABEL_MAX_WIDTH_PX = 220;
const COLLAPSED_LABEL_PADDING_LEFT_PX = 6;
const COLLAPSED_LABEL_PADDING_RIGHT_PX = 3;
const SWATCH_GAP_PX = 22;
const SWATCH_PANEL_PADDING_PX = 4;
const SWATCH_RADIUS_PX = 5;
const SWATCH_ACTIVE_RING_RADIUS_PX = 6.5;
const SWATCH_HIT_RADIUS_PX = 8;

const GROUP_ICONS = {
  collapse: {
    path: "M5 8l7 7 7-7",
    offsetX: -6,
    offsetY: -5.75,
  },
  expand: {
    path: "M5 15l7-7 7 7",
    offsetX: -6,
    offsetY: -5.75,
  },
  ungroup: {
    path: "M4 4h7v7H4zM13 13h7v7h-7z",
    offsetX: -6,
    offsetY: -6,
  },
};

type CanvasGroupLayout = {
  group: Snapshot<CanvasGroup>;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  toolbar: {
    x: number;
    y: number;
  };
  collapsedLabel: string | null;
};

type CanvasGroupsLayerProps = {
  groups: readonly Snapshot<CanvasGroup>[];
  items: readonly Snapshot<CanvasItem>[];
  stageScale: number;
  colorSwatches: readonly string[];
  activeGroupId: string | null;
  activeColorPickerGroupId: string | null;
  onGroupSelect: (groupId: string) => void;
  onGroupDragStart: (
    groupId: string,
    client: { clientX: number; clientY: number },
  ) => void;
  onGroupDragMove: (groupId: string, delta: { dx: number; dy: number }) => void;
  onGroupDragEnd: (groupId: string, delta: { dx: number; dy: number }) => void;
  onGroupCollapseToggle: (groupId: string) => void;
  onGroupUngroup: (groupId: string) => void;
  onGroupColorPickerToggle: (groupId: string) => void;
  onGroupColorChange: (groupId: string, color: string) => void;
  onGroupContain: (groupId: string) => void;
  renderMode: "rects" | "controls";
};

let textMeasureContext: CanvasRenderingContext2D | null = null;

const getTextMeasureContext = () => {
  if (textMeasureContext) return textMeasureContext;
  if (typeof document === "undefined") return null;
  textMeasureContext = document.createElement("canvas").getContext("2d");
  return textMeasureContext;
};

const getMeasureFont = (fontSize: number) => {
  const fontFamily =
    typeof window === "undefined"
      ? "sans-serif"
      : window.getComputedStyle(document.body).fontFamily || "sans-serif";
  return `${fontSize}px ${fontFamily}`;
};

const measureTextWidth = (text: string, fontSize: number) => {
  if (!text) return 0;
  const context = getTextMeasureContext();
  if (!context) return text.length * fontSize * 0.6;
  context.font = getMeasureFont(fontSize);
  return context.measureText(text).width;
};

const getCollapsedLabelMetrics = (
  text: string | null,
  fontSize: number,
  maxWidth: number,
) => {
  if (!text) {
    return { text: "", width: 0 };
  }

  const trimmedText = text.trim();
  if (!trimmedText) {
    return { text: "", width: 0 };
  }

  const fullWidth = measureTextWidth(trimmedText, fontSize);
  if (fullWidth <= maxWidth) {
    return { text: trimmedText, width: fullWidth };
  }

  const ellipsis = "...";
  const ellipsisWidth = measureTextWidth(ellipsis, fontSize);
  if (ellipsisWidth >= maxWidth) {
    return { text: ellipsis, width: Math.min(ellipsisWidth, maxWidth) };
  }

  let end = trimmedText.length;
  while (end > 0) {
    const nextText = `${trimmedText.slice(0, end)}${ellipsis}`;
    const nextWidth = measureTextWidth(nextText, fontSize);
    if (nextWidth <= maxWidth) {
      return { text: nextText, width: nextWidth };
    }
    end -= 1;
  }

  return { text: ellipsis, width: ellipsisWidth };
};

const getGroupLayout = (
  group: Snapshot<CanvasGroup>,
  items: readonly Snapshot<CanvasItem>[],
): CanvasGroupLayout | null => {
  const bounds = getCanvasGroupBounds(group, items);
  if (!bounds) return null;
  const itemById = new Map(items.map((item) => [item.itemId, item] as const));

  let collapsedLabel: string | null = null;
  let largestFontSize = Number.NEGATIVE_INFINITY;
  let nearestDistance = Number.POSITIVE_INFINITY;
  group.items.forEach((itemId) => {
    const item = itemById.get(itemId);
    if (!item || item.type !== "text") return;
    const text = item.text.trim();
    if (!text) return;
    const itemBounds = getCanvasItemBounds(item);
    if (!itemBounds) return;
    const fontSize = item.fontSize || 0;
    const distance = Math.hypot(
      itemBounds.x - bounds.x,
      itemBounds.y - bounds.y,
    );
    if (fontSize < largestFontSize) return;
    if (fontSize === largestFontSize && distance >= nearestDistance) return;
    largestFontSize = fontSize;
    nearestDistance = distance;
    collapsedLabel = text;
  });

  return {
    group,
    bounds,
    toolbar: {
      x: bounds.x + 10,
      y: bounds.y - TOOLBAR_OFFSET_Y,
    },
    collapsedLabel,
  };
};

export const CanvasGroupsLayer: React.FC<CanvasGroupsLayerProps> = ({
  groups,
  items,
  stageScale,
  colorSwatches,
  activeGroupId,
  activeColorPickerGroupId,
  onGroupSelect,
  onGroupDragStart,
  onGroupDragMove,
  onGroupDragEnd,
  onGroupCollapseToggle,
  onGroupUngroup,
  onGroupColorPickerToggle,
  onGroupColorChange,
  onGroupContain,
  renderMode,
}) => {
  const dragRef = useRef<{
    groupId: string;
    startX: number;
    startY: number;
  } | null>(null);

  const layouts = useMemo(() => {
    return groups
      .map((group) => getGroupLayout(group, items))
      .filter((layout): layout is CanvasGroupLayout => layout !== null);
  }, [groups, items]);

  const controlScale = 1 / stageScale;
  const toolbarGap = TOOLBAR_GAP_PX * controlScale;
  const swatchGap = SWATCH_GAP_PX * controlScale;

  const bindGroupPointerDown = (groupId: string) => {
    return (e: React.PointerEvent<SVGRectElement>) => {
      if (canvasState.isSpaceDown) return;
      if (e.button !== 0) return;
      e.stopPropagation();
      onGroupSelect(groupId);
      dragRef.current = {
        groupId,
        startX: e.clientX,
        startY: e.clientY,
      };
      onGroupDragStart(groupId, {
        clientX: e.clientX,
        clientY: e.clientY,
      });

      const handlePointerMove = (event: PointerEvent) => {
        const state = dragRef.current;
        if (!state || state.groupId !== groupId) return;
        onGroupDragMove(groupId, {
          dx: event.clientX - state.startX,
          dy: event.clientY - state.startY,
        });
      };

      const handlePointerUp = (event: PointerEvent) => {
        const state = dragRef.current;
        if (!state || state.groupId !== groupId) return;
        onGroupDragEnd(groupId, {
          dx: event.clientX - state.startX,
          dy: event.clientY - state.startY,
        });
        dragRef.current = null;
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    };
  };

  return (
    <g>
      {layouts.map((layout) => {
        const { group, bounds, toolbar, collapsedLabel } = layout;
        const isActive = activeGroupId === group.groupId;
        const isColorPickerOpen = activeColorPickerGroupId === group.groupId;
        const strokeColor =
          hexToRgba(group.backgroundColor, 0.9) || THEME.primary;
        const fillColor =
          hexToRgba(group.backgroundColor, group.collapse ? 0.24 : 0.14) ||
          THEME.canvas.selectionFill;
        const toolbarY = group.collapse
          ? bounds.y - TOOLBAR_OFFSET_Y
          : toolbar.y;
        const buttonSize = CONTROL_BUTTON_SIZE_PX * controlScale;
        const collapsedLabelFontSize = 14 * controlScale;
        const collapsedLabelMaxWidth =
          COLLAPSED_LABEL_MAX_WIDTH_PX * controlScale;
        const collapsedLabelMetrics = getCollapsedLabelMetrics(
          collapsedLabel,
          collapsedLabelFontSize,
          collapsedLabelMaxWidth,
        );
        const collapsedLabelText = collapsedLabelMetrics.text;
        const collapsedLabelPaddingLeft =
          COLLAPSED_LABEL_PADDING_LEFT_PX * controlScale;
        const collapsedLabelPaddingRight =
          COLLAPSED_LABEL_PADDING_RIGHT_PX * controlScale;
        const collapsedLabelGap = COLLAPSED_LABEL_GAP_PX * controlScale;
        const collapsedLabelWidth = collapsedLabelText
          ? collapsedLabelMetrics.width +
            collapsedLabelPaddingLeft +
            collapsedLabelPaddingRight
          : 0;
        const collapsedPillPaddingX =
          COLLAPSED_PILL_PADDING_X_PX * controlScale;
        const collapsedPillPaddingY =
          COLLAPSED_PILL_PADDING_Y_PX * controlScale;
        const collapsedButtonCenters = [toolbar.x, toolbar.x + toolbarGap];
        const collapsedButtonsLeft = collapsedButtonCenters[0] - buttonSize / 2;
        const collapsedButtonsRight =
          collapsedButtonCenters[collapsedButtonCenters.length - 1] +
          buttonSize / 2;
        const buttonsWidth = collapsedButtonsRight - collapsedButtonsLeft;
        const collapsedWrapperWidth =
          buttonsWidth +
          collapsedPillPaddingX * 2 +
          (collapsedLabelWidth > 0
            ? collapsedLabelGap + collapsedLabelWidth
            : 0);
        const collapsedWrapperHeight = buttonSize + collapsedPillPaddingY * 2;
        const collapsedWrapperX = collapsedButtonsLeft - collapsedPillPaddingX;
        const collapsedWrapperY =
          toolbarY - buttonSize / 2 - collapsedPillPaddingY;
        const collapsedColorX = collapsedButtonCenters[0];
        const collapsedCollapseX =
          collapsedButtonCenters[collapsedButtonCenters.length - 1];
        const collapsedLabelX =
          collapsedButtonsRight + collapsedLabelGap + collapsedLabelPaddingLeft;
        const swatchPanelPadding = SWATCH_PANEL_PADDING_PX * controlScale;
        const swatchRadius = SWATCH_RADIUS_PX * controlScale;
        const swatchActiveRingRadius =
          SWATCH_ACTIVE_RING_RADIUS_PX * controlScale;
        const swatchHitRadius = SWATCH_HIT_RADIUS_PX * controlScale;
        const swatchPanelX = toolbar.x - swatchRadius - swatchPanelPadding;
        const swatchPanelY =
          toolbarY + 24 * controlScale - swatchRadius - swatchPanelPadding;
        const swatchPanelWidth =
          colorSwatches.length > 0
            ? swatchRadius * 2 +
              (colorSwatches.length - 1) * swatchGap +
              swatchPanelPadding * 2
            : 0;
        const swatchPanelHeight = swatchRadius * 2 + swatchPanelPadding * 2;

        return (
          <g key={group.groupId}>
            {renderMode === "rects" && group.collapse ? (
              <rect
                x={collapsedWrapperX}
                y={collapsedWrapperY}
                width={collapsedWrapperWidth}
                height={collapsedWrapperHeight}
                rx={10 * controlScale}
                ry={10 * controlScale}
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth={isActive ? 2 : 1}
                vectorEffect="non-scaling-stroke"
                onPointerDown={bindGroupPointerDown(group.groupId)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onGroupContain(group.groupId);
                }}
              />
            ) : null}

            {renderMode === "rects" && !group.collapse ? (
              <>
                <rect
                  x={bounds.x}
                  y={bounds.y}
                  width={bounds.width}
                  height={bounds.height}
                  rx={16}
                  ry={16}
                  fill={fillColor}
                  stroke={strokeColor}
                  strokeWidth={isActive ? 2 : 1}
                  vectorEffect="non-scaling-stroke"
                  onPointerDown={bindGroupPointerDown(group.groupId)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    onGroupContain(group.groupId);
                  }}
                />
              </>
            ) : null}

            {renderMode === "controls" && (group.collapse || isActive) && (
              <>
                {isActive && !group.collapse ? (
                  <CanvasControlButton
                    x={toolbar.x - toolbarGap}
                    y={toolbarY}
                    scale={controlScale}
                    size={18}
                    fill="#0f172a"
                    stroke={strokeColor}
                    strokeWidth={1.5}
                    iconPath={GROUP_ICONS.ungroup.path}
                    iconScale={0.5}
                    iconOffsetX={GROUP_ICONS.ungroup.offsetX}
                    iconOffsetY={GROUP_ICONS.ungroup.offsetY}
                    onClick={() => onGroupUngroup(group.groupId)}
                  />
                ) : null}
                <CanvasControlButton
                  x={group.collapse ? collapsedColorX : toolbar.x}
                  y={toolbarY}
                  scale={controlScale}
                  size={18}
                  fill="#0f172a"
                  stroke={strokeColor}
                  strokeWidth={1.5}
                  onClick={() => onGroupColorPickerToggle(group.groupId)}
                />
                <circle
                  cx={group.collapse ? collapsedColorX : toolbar.x}
                  cy={toolbarY}
                  r={5 * controlScale}
                  fill={group.backgroundColor}
                  pointerEvents="none"
                />
                <CanvasControlButton
                  x={
                    group.collapse ? collapsedCollapseX : toolbar.x + toolbarGap
                  }
                  y={toolbarY}
                  scale={controlScale}
                  size={18}
                  fill="#0f172a"
                  stroke={strokeColor}
                  strokeWidth={1.5}
                  iconPath={
                    group.collapse
                      ? GROUP_ICONS.expand.path
                      : GROUP_ICONS.collapse.path
                  }
                  iconScale={0.5}
                  iconOffsetX={
                    group.collapse
                      ? GROUP_ICONS.expand.offsetX
                      : GROUP_ICONS.collapse.offsetX
                  }
                  iconOffsetY={
                    group.collapse
                      ? GROUP_ICONS.expand.offsetY
                      : GROUP_ICONS.collapse.offsetY
                  }
                  onClick={() => onGroupCollapseToggle(group.groupId)}
                />
              </>
            )}

            {renderMode === "controls" &&
            group.collapse &&
            collapsedLabelText ? (
              <g style={{ cursor: "pointer" }}>
                <text
                  x={collapsedLabelX}
                  y={collapsedWrapperY + collapsedWrapperHeight / 2}
                  fontSize={collapsedLabelFontSize}
                  fill="rgba(255,255,255,0.92)"
                  dominantBaseline="central"
                  textAnchor="start"
                  pointerEvents="none"
                >
                  {collapsedLabelText}
                </text>
              </g>
            ) : null}

            {renderMode === "controls" && isColorPickerOpen && (
              <g>
                <rect
                  x={swatchPanelX}
                  y={swatchPanelY}
                  width={swatchPanelWidth}
                  height={swatchPanelHeight}
                  rx={10 * controlScale}
                  ry={10 * controlScale}
                  fill="#111827"
                  fillOpacity={0.95}
                  stroke={strokeColor}
                  strokeWidth={isActive ? 2 : 1}
                  vectorEffect="non-scaling-stroke"
                />
                {colorSwatches.map((color, index) => (
                  <g
                    key={`${group.groupId}_${color}`}
                    transform={`translate(${toolbar.x + index * swatchGap} ${toolbarY + 24 * controlScale})`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onGroupColorChange(group.groupId, color);
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <circle
                      cx={0}
                      cy={0}
                      r={swatchHitRadius}
                      fill="rgba(15,23,42,0.001)"
                    />
                    {color === group.backgroundColor ? (
                      <circle
                        cx={0}
                        cy={0}
                        r={swatchActiveRingRadius}
                        fill="none"
                        stroke={THEME.primary}
                        strokeWidth={1.5}
                      />
                    ) : null}
                    <circle cx={0} cy={0} r={swatchRadius} fill={color} />
                  </g>
                ))}
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
};
