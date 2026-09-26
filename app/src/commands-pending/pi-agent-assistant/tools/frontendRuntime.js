import { Type } from "@earendil-works/pi-ai";

export const createFrontendRuntimeTool = (runtime = {}) => ({
  name: "frontend_runtime",
  label: "LookBack 前端运行时",
  description:
    "实时访问当前 LookBack 渲染进程。先用 list 获取允许读取的 store 字段以及 action 的签名和用途；只在任务确实需要状态时用 read 读取最小字段；用 execute 直接调用 action。execute 的 action 必须逐字复制自本轮 list.actions，禁止发明别名或组合方法。canvas.canvasItems 仅用于任务确实需要画布项目详情时，不能用于发现操作能力。所有操作都在工具调用时执行。",
  parameters: Type.Object({
    operation: Type.String({ description: "操作类型：list、read 或 execute" }),
    path: Type.Optional(Type.String({
      description:
        "read 时必填，例如 canvas.currentCanvasName。只读取完成任务所需的最小字段；不要用 canvas.canvasItems 查找可用 action。",
    })),
    action: Type.Optional(Type.String({
      description: "execute 时必填，必须逐字复制自本轮 list.actions，例如 canvas.autoLayoutCanvas",
    })),
    arguments: Type.Optional(Type.Array(Type.Any(), { description: "按方法参数顺序传入的参数数组" })),
  }),
  execute: async (_toolCallId, params) => {
    if (typeof runtime.requestFrontendAction !== "function") {
      throw new Error("前端运行时当前不可用");
    }
    const result = await runtime.requestFrontendAction({
      operation: String(params?.operation || "").trim(),
      path: String(params?.path || "").trim(),
      action: String(params?.action || "").trim(),
      arguments: Array.isArray(params?.arguments) ? params.arguments : [],
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      details: result,
    };
  },
});
