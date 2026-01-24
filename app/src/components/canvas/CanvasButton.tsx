import React from "react";
import type Konva from "konva";
import { Group, Rect, Path } from "react-konva";

interface CanvasButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isActive?: boolean;
  variant?: "default" | "danger";
}

export const CanvasButton: React.FC<CanvasButtonProps> = ({
  isActive = false,
  variant = "default",
  className = "",
  style,
  children,
  ...props
}) => {
  const baseClasses = "text-xs px-2 py-1 rounded border transition-colors font-medium";
  
  // Normal state styles (when not active)
  const normalClasses = variant === "danger" 
    ? "bg-neutral-800 text-white border-neutral-700 hover:bg-red-900/50 hover:border-red-800"
    : "bg-neutral-800 text-white border-neutral-700 hover:bg-neutral-700";

  // When active, we use utility classes instead of inline styles to allow hover overrides
  const activeClasses = isActive 
    ? "bg-primary border-primary text-white hover:border-primary"
    : "";

  return (
    <button
      className={`
        ${baseClasses} 
        ${!isActive ? normalClasses : activeClasses} 
        ${className}
      `}
      style={style}
      {...props}
    >
      {children}
    </button>
  );
};

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
  onClick?: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onMouseDown?: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onTouchStart?: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
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
  shadowOpacity = 0.3,
  iconPath,
  iconStroke = "white",
  iconStrokeWidth = 2,
  iconScale = 0.8,
  iconOffsetX = -10,
  iconOffsetY = -8,
  cursor = "pointer",
  onClick,
  onMouseDown,
  onTouchStart,
}) => {
  return (
    <Group
      x={x}
      y={y}
      scaleX={scale}
      scaleY={scale}
      onClick={onClick}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      onMouseEnter={(e) => {
        const container = e.target.getStage()?.container();
        if (container) container.style.cursor = cursor;
      }}
      onMouseLeave={(e) => {
        const container = e.target.getStage()?.container();
        if (container) container.style.cursor = "default";
      }}
    >
      <Rect
        x={-size / 2}
        y={-size / 2}
        width={size}
        height={size}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        cornerRadius={3}
        shadowColor={shadowColor}
        shadowBlur={shadowBlur}
        shadowOpacity={shadowOpacity}
      />
      {iconPath ? (
        <Path
          data={iconPath}
          stroke={iconStroke}
          strokeWidth={iconStrokeWidth}
          lineCap="round"
          lineJoin="round"
          scale={{ x: iconScale, y: iconScale }}
          x={iconOffsetX}
          y={iconOffsetY}
        />
      ) : null}
    </Group>
  );
};
