import { Type } from "@earendil-works/pi-ai";

const normalizeSelectedImagePaths = (paths) => {
  if (!Array.isArray(paths)) return [];
  return Array.from(
    new Set(
      paths
        .map((path) => String(path || "").trim())
        .filter(Boolean),
    ),
  );
};

export const createSelectedImagePathsTool = (runtime = {}) => ({
  name: "get_selected_image_paths",
  label: "当前选中图片路径",
  description:
    "获取用户当前在 LookBack 画布中选中的图片路径数组。只读取本轮开始时的选择快照，不读取或修改文件。",
  parameters: Type.Object({}),
  execute: async () => {
    const paths = normalizeSelectedImagePaths(runtime.selectedImagePaths);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              count: paths.length,
              paths,
            },
            null,
            2,
          ),
        },
      ],
      details: {
        count: paths.length,
        paths,
      },
    };
  },
});
