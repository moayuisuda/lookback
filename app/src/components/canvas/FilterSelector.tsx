import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { useT } from "../../i18n/useT";
import { AVAILABLE_FILTERS } from "../../utils/imageFilters";
import { clsx } from "clsx";
import { THEME, hexToRgba } from "../../theme";
import type { I18nKey } from "../../../shared/i18n/types";

interface FilterSelectorProps {
  activeFilters: readonly string[];
  onChange: (filters: string[]) => void;
}

export const FilterSelector: React.FC<FilterSelectorProps> = ({
  activeFilters,
  onChange,
}) => {
  const { t } = useT();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const brandBackground = hexToRgba(THEME.primary, 0.2);
  const brandBackgroundStrong = hexToRgba(THEME.primary, 0.35);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleToggleFilter = (filterId: string) => {
    if (activeFilters.includes(filterId)) {
      onChange(activeFilters.filter((f) => f !== filterId));
    } else {
      onChange([...activeFilters, filterId]);
    }
  };

  return (
    <div
      className="relative"
      ref={containerRef}
      style={
        {
          "--brand-color": THEME.primary,
          "--brand-color-weak": brandBackground ?? THEME.primary,
          "--brand-color-strong": brandBackgroundStrong ?? THEME.primary,
        } as React.CSSProperties
      }
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          "flex items-center gap-1 px-2 py-1.5 rounded-md transition-colors text-xs font-medium border border-neutral-700 shadow-sm",
          activeFilters.length > 0
            ? "bg-(--brand-color-weak) text-(--brand-color) border-(--brand-color)"
            : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
        )}
        title={t("canvas.toolbar.filters")}
      >
        <span>{t("canvas.toolbar.filters")}</span>
        {activeFilters.length > 0 && (
          <span className="bg-(--brand-color-strong) text-(--brand-color) text-[9px] px-1 rounded-full">
            {activeFilters.length}
          </span>
        )}
        <ChevronDown size={12} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-40 bg-neutral-900 border border-neutral-700 rounded-md shadow-lg py-1 z-50">
          {AVAILABLE_FILTERS.map((filter) => (
            <button
              key={filter.id}
              onClick={() => handleToggleFilter(filter.id)}
              className="w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 flex items-center justify-between group"
            >
              <span>{t(filter.name as I18nKey)}</span>
              {activeFilters.includes(filter.id) && (
                <Check size={12} className="text-(--brand-color)" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
