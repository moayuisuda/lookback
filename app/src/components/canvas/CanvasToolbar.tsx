import React, { useEffect, useRef } from "react";
import {
  X,
  LayoutTemplate,
  PictureInPicture2,
  Eraser,
  Filter,
  Pencil,
} from "lucide-react";
import { useSnapshot } from "valtio";
import { globalState, globalActions } from "../../store/globalStore";
import { anchorState, anchorActions } from "../../store/anchorStore";
import { useT } from "../../i18n/useT";
import { FilterSelector } from "./FilterSelector";
import clsx from "clsx";
import { CANVAS_PEN_STROKE_WIDTH_RANGE } from "../../store/canvasStore";

interface CanvasToolbarProps {
  canvasFilters: readonly string[];
  showMinimap: boolean;
  isPenMode: boolean;
  penTool: "draw" | "erase";
  penStrokeColor: string;
  penStrokeWidth: number;
  penColorSlots: readonly string[];
  onFiltersChange: (filters: string[]) => void;
  onTogglePenMode: () => void;
  onTogglePenErase: () => void;
  onPenStrokeColorChange: (color: string) => void;
  onPenColorSlotChange: (index: number, color: string) => void;
  onPenStrokeWidthChange: (width: number) => void;
  onToggleMinimap: () => void;
  onAutoLayout: () => void;
}

const ToolbarButton: React.FC<{
  onClick?: () => void;
  isActive?: boolean;
  variant?: "default" | "danger" | "ghost";
  title?: string;
  children: React.ReactNode;
  className?: string;
}> = ({ onClick, isActive, variant = "ghost", title, children, className }) => {
  return (
    <button
      onClick={onClick}
      title={title}
      className={clsx(
        "h-5 w-5 flex items-center justify-center rounded transition-all duration-200",
        // Default ghost style
        variant === "ghost" &&
          !isActive &&
          "text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800",
        // Active style
        isActive && "bg-primary text-white shadow-sm",
        // Danger style
        variant === "danger" &&
          "text-neutral-400 hover:text-red-400 hover:bg-red-950/30",
        className,
      )}
    >
      {children}
    </button>
  );
};

const ToolbarDivider = () => <div className="h-px w-4 bg-neutral-600" />;

const PEN_STROKE_SLIDER_HEIGHT = 54;

const PenStrokeWidthSlider: React.FC<{
  penStrokeColor: string;
  penStrokeWidth: number;
  onPenStrokeWidthChange: (width: number) => void;
}> = ({ penStrokeColor, penStrokeWidth, onPenStrokeWidthChange }) => {
  const { t } = useT();
  const { min, max, step } = CANVAS_PEN_STROKE_WIDTH_RANGE;
  const value = Math.max(min, Math.min(max, penStrokeWidth));
  const percent = (value - min) / (max - min);
  const thumbTop = `${(1 - percent) * 100}%`;

  return (
    <div
      className="flex w-8 flex-col items-center gap-1"
      title={t("canvas.toolbar.penStrokeWidth")}
    >
      <div
        className="relative w-8"
        style={{ height: PEN_STROKE_SLIDER_HEIGHT }}
      >
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 rounded-full bg-neutral-700" />
        <div
          className="absolute left-1/2 rounded-full border border-white/50 shadow-[0_0_0_2px_rgba(23,23,23,0.9)]"
          style={{
            top: thumbTop,
            width: value,
            height: value,
            backgroundColor: penStrokeColor,
            transform: "translate(-50%, -50%)",
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={t("canvas.toolbar.penStrokeWidth")}
          className="absolute left-1/2 top-1/2 cursor-ns-resize opacity-0"
          style={{
            width: PEN_STROKE_SLIDER_HEIGHT,
            height: 32,
            transform: "translate(-50%, -50%) rotate(-90deg)",
          }}
          onChange={(event) =>
            onPenStrokeWidthChange(Number(event.target.value))
          }
        />
      </div>
    </div>
  );
};

const PenControls: React.FC<{
  penTool: "draw" | "erase";
  penStrokeColor: string;
  penStrokeWidth: number;
  penColorSlots: readonly string[];
  onTogglePenErase: () => void;
  onPenStrokeColorChange: (color: string) => void;
  onPenColorSlotChange: (index: number, color: string) => void;
  onPenStrokeWidthChange: (width: number) => void;
}> = ({
  penTool,
  penStrokeColor,
  penStrokeWidth,
  penColorSlots,
  onTogglePenErase,
  onPenStrokeColorChange,
  onPenColorSlotChange,
  onPenStrokeWidthChange,
}) => {
  const { t } = useT();
  const colorInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  return (
    <div className="flex flex-col items-center gap-2">
      <PenStrokeWidthSlider
        penStrokeColor={penStrokeColor}
        penStrokeWidth={penStrokeWidth}
        onPenStrokeWidthChange={onPenStrokeWidthChange}
      />

      <div className="flex flex-col items-center gap-1">
        {penColorSlots.map((color, index) => {
          const isSelected = penStrokeColor === color.toLowerCase();
          return (
            <div
              key={`${index}_${color}`}
              className="relative flex h-5 w-5 items-center justify-center"
            >
              <button
                type="button"
                className={clsx(
                  "flex h-5 w-5 items-center justify-center rounded-sm border p-[1px] transition-colors",
                  isSelected ? "border-primary" : "border-transparent",
                )}
                title={t("canvas.toolbar.penColor")}
                onClick={() => {
                  if (isSelected) {
                    colorInputRefs.current[index]?.click();
                    return;
                  }
                  onPenStrokeColorChange(color);
                }}
              >
                <span
                  className={clsx(
                    "h-full w-full rounded-[2px] border",
                    isSelected ? "border-white" : "border-white/20",
                  )}
                  style={{ backgroundColor: color }}
                />
              </button>
              <input
                ref={(node) => {
                  colorInputRefs.current[index] = node;
                }}
                type="color"
                value={color}
                aria-label={t("canvas.toolbar.penColor")}
                onChange={(event) =>
                  onPenColorSlotChange(index, event.target.value)
                }
                className="absolute inset-0 h-5 w-5 opacity-0 pointer-events-none"
                tabIndex={-1}
              />
            </div>
          );
        })}
      </div>

      <ToolbarButton
        isActive={penTool === "erase"}
        onClick={onTogglePenErase}
        title={t("canvas.toolbar.penErase")}
      >
        <Eraser size={14} />
      </ToolbarButton>
    </div>
  );
};

const AnchorControls: React.FC = () => {
  const { t } = useT();
  const anchorSnap = useSnapshot(anchorState);
  const [animatingSlot, setAnimatingSlot] = React.useState<string | null>(null);
  const lastTimestampRef = React.useRef(0);

  useEffect(() => {
    if (
      anchorSnap.lastTriggered &&
      anchorSnap.lastTriggered.timestamp > lastTimestampRef.current
    ) {
      lastTimestampRef.current = anchorSnap.lastTriggered.timestamp;

      const startTimer = setTimeout(() => {
        setAnimatingSlot(anchorSnap.lastTriggered?.slot ?? null);
      }, 0);

      const endTimer = setTimeout(() => {
        setAnimatingSlot(null);
      }, 400);

      return () => {
        clearTimeout(startTimer);
        clearTimeout(endTimer);
      };
    }
  }, [anchorSnap.lastTriggered]);

  return (
    <div className="flex flex-col items-center gap-1">
      {["1", "2", "3"].map((slot) => {
        const hasAnchor = !!anchorSnap.anchors[slot];
        const isAnimating = animatingSlot === slot;

        return (
          <div key={slot} className="relative group/anchor-slot flex items-center">
            <button
              className={clsx(
                "h-4 w-5 flex items-center justify-center rounded text-xs font-medium transition-all duration-200",
                !hasAnchor &&
                  "text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 border border-transparent border-dashed hover:border-neutral-700",
                hasAnchor &&
                  "bg-neutral-800 text-primary border border-neutral-700 shadow-sm",
                isAnimating &&
                  "bg-primary text-white ring-2 ring-primary ring-offset-1 ring-offset-neutral-900",
              )}
              onClick={() => {
                if (hasAnchor) {
                  anchorActions.restoreAnchor(slot);
                } else {
                  anchorActions.saveAnchor(slot);
                  globalActions.pushToast(
                    { key: "canvas.anchor.saved" },
                    "success",
                  );
                }
              }}
              title={
                hasAnchor ? t("canvas.anchor.restore") : t("canvas.anchor.save")
              }
            >
              {slot}
            </button>
            {hasAnchor && (
              <button
                className="pointer-events-none absolute -top-1 -right-1 z-10 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-neutral-600 bg-neutral-800 opacity-0 shadow-md transition-all duration-200 group-hover/anchor-slot:pointer-events-auto group-hover/anchor-slot:opacity-100 hover:border-red-700 hover:bg-red-900/80"
                onClick={(e) => {
                  e.stopPropagation();
                  anchorActions.deleteAnchor(slot);
                }}
                title={t("canvas.anchor.delete")}
              >
                <X size={8} className="text-neutral-400 hover:text-red-300" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

export const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
  canvasFilters,
  showMinimap,
  isPenMode,
  penTool,
  penStrokeColor,
  penStrokeWidth,
  penColorSlots,
  onFiltersChange,
  onTogglePenMode,
  onTogglePenErase,
  onPenStrokeColorChange,
  onPenColorSlotChange,
  onPenStrokeWidthChange,
  onToggleMinimap,
  onAutoLayout,
}) => {
  const { t } = useT();
  const appSnap = useSnapshot(globalState);
  const hideCanvasButtons = appSnap.mouseThrough;

  useEffect(() => {
    anchorActions.loadAnchors();
  }, []);

  if (hideCanvasButtons) return null;

  return (
    <div className="group/toolbar absolute left-0 top-0 z-10 h-full w-16 pointer-events-none">
      <div className="absolute left-0 top-0 h-full w-6 pointer-events-auto" />
      <div
        className={clsx(
          "absolute left-2 top-1/2 flex -translate-y-1/2 flex-col items-center p-2 gap-2 origin-left",
          "pointer-events-none opacity-0 -translate-x-4 scale-95 invisible transition-all duration-200 ease-out",
          "group-hover/toolbar:pointer-events-auto group-hover/toolbar:visible group-hover/toolbar:opacity-100 group-hover/toolbar:translate-x-0 group-hover/toolbar:scale-100",
          "bg-neutral-900/90 backdrop-blur-md border border-neutral-800/80 rounded-lg shadow-xl",
        )}
      >
        <FilterSelector
          activeFilters={canvasFilters}
          onChange={onFiltersChange}
          customTrigger={(isOpen) => (
            <ToolbarButton
              isActive={canvasFilters.length > 0 || isOpen}
              title={t("canvas.toolbar.filters")}
            >
              <Filter size={14} />
            </ToolbarButton>
          )}
        />

        <ToolbarDivider />

        <ToolbarButton
          isActive={isPenMode}
          onClick={onTogglePenMode}
          title={t("canvas.toolbar.pen")}
        >
          <Pencil size={14} />
        </ToolbarButton>

        {isPenMode && (
          <>
            <ToolbarDivider />
            <PenControls
              penTool={penTool}
              penStrokeColor={penStrokeColor}
              penStrokeWidth={penStrokeWidth}
              penColorSlots={penColorSlots}
              onTogglePenErase={onTogglePenErase}
              onPenStrokeColorChange={onPenStrokeColorChange}
              onPenColorSlotChange={onPenColorSlotChange}
              onPenStrokeWidthChange={onPenStrokeWidthChange}
            />
          </>
        )}

        <ToolbarDivider />

        <ToolbarButton
          onClick={onAutoLayout}
          title={t("canvas.toolbar.smartLayout")}
        >
          <LayoutTemplate size={14} />
        </ToolbarButton>

        <ToolbarButton
          isActive={showMinimap}
          onClick={onToggleMinimap}
          title={t("canvas.toolbar.toggleMinimap")}
        >
          <PictureInPicture2 size={14} />
        </ToolbarButton>

        <ToolbarDivider />

        <AnchorControls />
      </div>
    </div>
  );
};
