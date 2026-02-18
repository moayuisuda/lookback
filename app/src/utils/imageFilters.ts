export type FilterType = "grayscale" | "posterize";

export interface FilterConfig {
  id: FilterType;
  name: string; // Display name key for i18n
  cssFilter?: string; // CSS filter string
}

export const AVAILABLE_FILTERS: FilterConfig[] = [
  {
    id: "grayscale",
    name: "canvas.filters.grayscale",
    cssFilter: "grayscale(100%)",
  },
  {
    id: "posterize",
    name: "canvas.filters.posterize",
    cssFilter: "url(#posterizeFilter)",
  },
];

export const getCssFilters = (filterIds: readonly string[]): string => {
  const uniqueIds = Array.from(new Set(filterIds));
  const filters: string[] = [];

  uniqueIds.forEach((id) => {
    const filterConfig = AVAILABLE_FILTERS.find((f) => f.id === id);
    if (filterConfig?.cssFilter) {
      filters.push(filterConfig.cssFilter);
    }
  });

  return filters.length > 0 ? filters.join(" ") : "none";
};
