import { EnvHttpProxyAgent, fetch as undiciFetch } from "undici";
import {
  IRA_ACCOUNT_MODEL,
  IRA_ACCOUNT_MODEL_BASE_URL,
} from "./serviceConfig.js";

const DEFAULT_CONTEXT_WINDOW = 128000;
const DEFAULT_MAX_TOKENS = 8192;
const proxyDispatcher = new EnvHttpProxyAgent();
export const ACCOUNT_AUTH_EXPIRED_MARKER = "IRA_ACCOUNT_AUTH_EXPIRED";

// Node fetch 不会自动读取系统注入的 HTTP(S)_PROXY，Ira 的模型请求统一走环境代理。
globalThis.fetch = async (input, init = {}) => {
  const response = await undiciFetch(input, { ...init, dispatcher: proxyDispatcher });
  const targetUrl = String(
    typeof input === "string" || input instanceof URL ? input : input?.url || "",
  );
  if (response.status === 401 && targetUrl.startsWith(IRA_ACCOUNT_MODEL_BASE_URL)) {
    await response.body?.cancel();
    throw new Error(ACCOUNT_AUTH_EXPIRED_MARKER);
  }
  return response;
};

const normalizeBaseUrl = (value) => String(value || "").trim().replace(/\/+$/, "");

export const createOpenAiCompatibleModel = (settings) => {
  const useAccount = settings?.modelSource === "account";
  const modelId = useAccount
    ? IRA_ACCOUNT_MODEL
    : String(settings?.model || "").trim();
  const baseUrl = useAccount
    ? IRA_ACCOUNT_MODEL_BASE_URL
    : normalizeBaseUrl(settings?.baseUrl);
  if (!baseUrl) throw new Error("请先配置 Base URL");
  if (!modelId) throw new Error("请先配置模型");

  return {
    id: modelId,
    name: modelId,
    api: "openai-completions",
    provider: "openai-compatible",
    baseUrl,
    reasoning: false,
    input: ["text", "image"],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: DEFAULT_MAX_TOKENS,
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
      supportsUsageInStreaming: true,
      supportsStrictMode: false,
    },
  };
};
