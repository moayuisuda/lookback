import React, { useEffect } from "react";
import { Settings2, X } from "lucide-react";
import { useSnapshot } from "valtio";
import { globalState, globalActions } from "../../store/globalStore";
import { anchorState, anchorActions } from "../../store/anchorStore";
import { CanvasButton } from "./CanvasButton";
import { useT } from "../../i18n/useT";
import { FilterSelector } from "./FilterSelector";
import clsx from "clsx";

interface CanvasToolbarProps {
  canvasFilters: readonly string[];
  showMinimap: boolean;
  isExpanded: boolean;
  onFiltersChange: (filters: string[]) => void;
  onToggleMinimap: () => void;
  onAutoLayout: () => void;
  onRequestClear: () => void;
  onToggleExpanded: () => void;
}

const AnchorControls: React.FC = () => {
  const { t } = useT();
  const anchorSnap = useSnapshot(anchorState);
  const [animatingSlot, setAnimatingSlot] = React.useState<string | null>(null);
  const lastTimestampRef = React.useRef(0);

  useEffect(() => {
    if (anchorSnap.lastTriggered && anchorSnap.lastTriggered.timestamp > lastTimestampRef.current) {
      lastTimestampRef.current = anchorSnap.lastTriggered.timestamp;
      
      // Delay state update to avoid synchronous setState in effect warning
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
    <div className="flex items-center gap-1">
      {['1', '2', '3'].map((slot) => {
        const hasAnchor = !!anchorSnap.anchors[slot];
        const isAnimating = animatingSlot === slot;
        
        return (
          <div key={slot} className="relative group flex items-center">
            <button
              className={clsx(
                "glass-btn w-5 h-8 !p-0",
                hasAnchor && "glass-btn--inactive",
                !hasAnchor && "border-dashed hover:border-solid",
                isAnimating && "glass-btn--active ring-2 ring-primary ring-offset-1 ring-offset-neutral-900"
              )}
              onClick={() => {
                  if (hasAnchor) {
                    anchorActions.restoreAnchor(slot);
                  } else {
                    anchorActions.saveAnchor(slot);
                    globalActions.pushToast({ key: "canvas.anchor.saved" }, "success");
                  }
              }}
              title={hasAnchor ? t('canvas.anchor.restore') : t('canvas.anchor.save')}
            >
              {slot}
            </button>
            {hasAnchor && (
              <button
                className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-neutral-800 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 border border-neutral-600 hover:bg-red-900/80 hover:border-red-700 shadow-md z-10"
                onClick={(e) => {
                  e.stopPropagation();
                  anchorActions.deleteAnchor(slot);
                }}
                title={t('canvas.anchor.delete')}
              >
                <X size={10} className="text-neutral-400 hover:text-red-300" />
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
  isExpanded,
  onFiltersChange,
  onToggleMinimap,
  onAutoLayout,
  onRequestClear,
  onToggleExpanded,
}) => {
  const { t } = useT();
  const appSnap = useSnapshot(globalState);
  const hideCanvasButtons = appSnap.pinMode && appSnap.mouseThrough;

  useEffect(() => {
    anchorActions.loadAnchors();
  }, []);

  if (hideCanvasButtons) return null;

  return (
    <div className="absolute top-4 left-4 z-10 flex items-start gap-2">
      {/* Settings Toggle Button */}
      <button
        onClick={onToggleExpanded}
        className={clsx(
          "glass-btn w-8 h-8 !p-0 z-20",
          isExpanded && "glass-btn--active"
        )}
        title={isExpanded ? t("canvas.toolbar.collapse") : t("canvas.toolbar.expand")}
      >
        <Settings2 
          className={clsx("transition-transform duration-300", isExpanded && "rotate-180")} 
          color={isExpanded ? "white" : "currentColor"} 
          size={18} 
        />
      </button>

      {/* Expanded Toolbar Content */}
      <div
        className={clsx(
          "flex items-center gap-2 transition-all duration-300 ease-out origin-left",
          isExpanded 
            ? "opacity-100 translate-x-0 scale-100" 
            : "opacity-0 -translate-x-4 scale-95 pointer-events-none hidden"
        )}
      >
        {/* Main Controls Group */}
        <div className="flex items-center gap-2">
          <FilterSelector
            activeFilters={canvasFilters}
            onChange={onFiltersChange}
          />
          
          <div className="w-px h-5 bg-neutral-700/50 mx-0.5" />
          
          <CanvasButton onClick={onAutoLayout}>
            {t("canvas.toolbar.smartLayout")}
          </CanvasButton>
          
          <CanvasButton
            isActive={showMinimap}
            onClick={onToggleMinimap}
            title={t("canvas.toolbar.toggleMinimap")}
          >
            {t("canvas.toolbar.minimap")}
          </CanvasButton>
        </div>

        {/* Anchor Controls Group */}
        <div className="flex items-center gap-2 border-l border-neutral-700/50 pl-2">
           <AnchorControls />
        </div>

        {/* Danger/Action Group */}
        <div className="flex items-center border-l border-neutral-700/50 pl-2">
          <CanvasButton variant="danger" onClick={onRequestClear}>
            {t("common.clear")}
          </CanvasButton>
        </div>
      </div>
    </div>
  );
};
