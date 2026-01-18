import React from "react";
import { Group, Rect, Circle, Path } from "react-konva";
import { THEME } from "../../theme";

const TrashIconPath = "M4 7h16M6 7l1 14h10l1-14M9 7V4h6v3";

interface MultiSelectOverlayProps {
  union: { x: number; y: number; width: number; height: number } | null;
  stageScale: number;
  onDeleteSelection: () => void;
}

export const MultiSelectOverlay: React.FC<MultiSelectOverlayProps> = ({
  union,
  stageScale,
  onDeleteSelection,
}) => {
  if (!union) return null;

  return (
    <>
      <Rect
        x={union.x}
        y={union.y}
        width={union.width}
        height={union.height}
        stroke={THEME.primary}
        strokeWidth={1 / stageScale}
        dash={[6 / stageScale, 4 / stageScale]}
        listening={false}
      />
      <Group
        x={union.x + union.width}
        y={union.y}
        scaleX={1 / stageScale}
        scaleY={1 / stageScale}
        onClick={(e) => {
          e.cancelBubble = true;
          onDeleteSelection();
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
        <Circle
          radius={12}
          fill="#ef4444"
          stroke="white"
          strokeWidth={2}
          shadowColor="black"
          shadowBlur={5}
          shadowOpacity={0.3}
        />
        <Path
          data={TrashIconPath}
          stroke="white"
          strokeWidth={2}
          lineCap="round"
          lineJoin="round"
          scale={{ x: 0.8, y: 0.8 }}
          x={-10}
          y={-10}
        />
      </Group>
    </>
  );
};

