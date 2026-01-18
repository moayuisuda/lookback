import React from "react";
import { Settings2 } from "lucide-react";
import { THEME } from "../../theme";
import { CanvasButton } from "./CanvasButton";
import { useT } from "../../i18n/useT";

interface CanvasToolbarProps {
  canvasGrayscale: boolean;
  showMinimap: boolean;
  isExpanded: boolean;
  onToggleGrayscale: () => void;
  onToggleMinimap: () => void;
  onAutoLayout: () => void;
  onRequestClear: () => void;
  onToggleExpanded: () => void;
}

export const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
  canvasGrayscale,
  showMinimap,
  isExpanded,
  onToggleGrayscale,
  onToggleMinimap,
  onAutoLayout,
  onRequestClear,
  onToggleExpanded,
}) => {
  const { t } = useT();
  return (
    <div className="absolute top-4 left-4 z-10 flex items-center">
      <button
        onClick={onToggleExpanded}
        className="flex px-1 py-1 items-center justify-center rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors border border-neutral-700 shadow-sm z-20"
        title={isExpanded ? t("canvas.toolbar.collapse") : t("canvas.toolbar.expand")}
      >
        <Settings2 color={isExpanded ? THEME.primary : "#666"} size={16} />
      </button>
      <div
        className={`gap-2 ml-2 overflow-hidden transition-all duration-300 ease-in-out ${
          isExpanded ? "flex" : "hidden"
        }`}
      >
        <CanvasButton
          isActive={canvasGrayscale}
          onClick={onToggleGrayscale}
          title={t("canvas.toolbar.toggleGrayscale")}
        >
          {t("canvas.toolbar.grayscale")}
        </CanvasButton>
        <CanvasButton onClick={onAutoLayout}>{t("canvas.toolbar.smartLayout")}</CanvasButton>
        <CanvasButton
          isActive={showMinimap}
          onClick={onToggleMinimap}
          title={t("canvas.toolbar.toggleMinimap")}
        >
          {t("canvas.toolbar.minimap")}
        </CanvasButton>
        <CanvasButton variant="danger" onClick={onRequestClear}>
          {t("common.clear")}
        </CanvasButton>
      </div>
    </div>
  );
};
