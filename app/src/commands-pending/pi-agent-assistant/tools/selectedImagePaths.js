import { Type } from "@earendil-works/pi-ai";

const normalizeImagePaths = (paths) => {
  if (!Array.isArray(paths)) return [];
  return Array.from(
    new Set(
      paths
        .map((path) => String(path || "").trim())
        .filter(Boolean),
    ),
  );
};

export const resolveSelectedImagePaths = (candidates = {}) => {
  const directlySelectedPaths = normalizeImagePaths(candidates.directlySelectedPaths);
  if (directlySelectedPaths.length > 0) {
    return {
      paths: directlySelectedPaths,
      source: "direct-selection",
    };
  }

  const activeGroupPaths = normalizeImagePaths(candidates.activeGroupPaths);
  return {
    paths: activeGroupPaths,
    source: activeGroupPaths.length > 0 ? "active-group" : "none",
  };
};

export const createSelectedImagePathsTool = (runtime = {}) => ({
  name: "get_selected_image_paths",
  label: "本轮图片上下文路径",
  description:
    "获取本轮实际传给模型的 LookBack 图片上下文路径。有单独选中图片时只返回这些图片；否则返回当前选中组内的图片。",
  parameters: Type.Object({}),
  execute: async () => {
    const { paths, source } = resolveSelectedImagePaths(runtime.selectedImageCandidates);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              count: paths.length,
              paths,
              source,
            },
            null,
            2,
          ),
        },
      ],
      details: {
        count: paths.length,
        paths,
        source,
      },
    };
  },
});
