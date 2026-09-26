import { Type } from "@earendil-works/pi-ai";

const isValidPort = (value) =>
  Number.isInteger(value) && value > 0 && value <= 65535;

export const createRuntimeInfoTool = (runtime = {}) => ({
  name: "lookback_runtime_info",
  label: "LookBack 运行时信息",
  description:
    "返回当前 LookBack 实例真实的本地服务端口和基础地址。需要调用后端接口时使用；接口契约由 deepwiki_search 查询。",
  parameters: Type.Object({}),
  execute: async () => {
    const apiPort = Number(runtime.apiPort);
    if (!isValidPort(apiPort)) throw new Error("LookBack 本地服务端口不可用");
    const result = {
      apiPort,
      apiBaseUrl: `http://localhost:${apiPort}`,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      details: result,
    };
  },
});
