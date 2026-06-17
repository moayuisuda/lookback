import React, { useRef } from "react";
import {
  createPointerDoubleClickTap,
  isPointerDoubleClickTap,
  type PointerDoubleClickTap,
} from "./pointerDoubleClick";

interface CanvasControlButtonProps {
  x: number;
  y: number;
  scale?: number;
  size?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOpacity?: number;
  iconPath?: string;
  iconStroke?: string;
  iconStrokeWidth?: number;
  iconScale?: number;
  iconOffsetX?: number;
  iconOffsetY?: number;
  cursor?: string;
  onClick?: (
    e: React.MouseEvent<SVGGElement> | React.TouchEvent<SVGGElement>,
  ) => void;
  onMouseDown?: (e: React.MouseEvent<SVGGElement>) => void;
  onPointerDown?: (e: React.PointerEvent<SVGGElement>) => void;
  onDoubleClick?: (e: React.PointerEvent<SVGGElement>) => void;
  className?: string;
}

export const CanvasControlButton: React.FC<CanvasControlButtonProps> = ({
  x,
  y,
  scale = 1,
  size = 24,
  fill = "white",
  stroke = "white",
  strokeWidth = 0,
  shadowColor = "black",
  shadowBlur = 5,
  shadowOpacity = 0.9,
  iconPath,
  iconStroke = "white",
  iconStrokeWidth = 2,
  iconScale = 0.8,
  iconOffsetX = -10,
  iconOffsetY = -8,
  cursor = "pointer",
  onClick,
  onMouseDown,
  onPointerDown,
  onDoubleClick,
  className,
  ...others
}) => {
  const lastPointerTapRef = useRef<PointerDoubleClickTap | null>(null);

  const consumePointerDoubleClick = (e: React.PointerEvent<SVGGElement>) => {
    if (e.button !== 0 || !onDoubleClick) {
      lastPointerTapRef.current = null;
      return false;
    }

    const previousTap = lastPointerTapRef.current;
    const currentTap = createPointerDoubleClickTap(e.nativeEvent);
    lastPointerTapRef.current = currentTap;

    const isDoubleClick = isPointerDoubleClickTap(currentTap, previousTap);
    if (isDoubleClick) {
      lastPointerTapRef.current = null;
    }

    return isDoubleClick;
  };

  return (
    <g
      className={className}
      transform={`translate(${x} ${y}) scale(${scale})`}
      data-control="true"
      style={{ cursor }}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        onMouseDown?.(e);
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (consumePointerDoubleClick(e)) {
          e.preventDefault();
          onDoubleClick?.(e);
          return;
        }
        onPointerDown?.(e);
      }}
    >
      <rect
        x={-size / 2}
        y={-size / 2}
        width={size}
        height={size}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        rx={3}
        ry={3}
        style={
          shadowBlur && shadowOpacity
            ? {
                filter: `drop-shadow(0 0 ${shadowBlur}px ${shadowColor})`,
                opacity: shadowOpacity,
              }
            : undefined
        }
        {...others}
      />
      {iconPath ? (
        <path
          d={iconPath}
          stroke={iconStroke}
          strokeWidth={iconStrokeWidth}
          strokeLinecap="round"
          fill="transparent"
          strokeLinejoin="round"
          transform={`translate(${iconOffsetX} ${iconOffsetY}) scale(${iconScale})`}
        />
      ) : null}
    </g>
  );
};
