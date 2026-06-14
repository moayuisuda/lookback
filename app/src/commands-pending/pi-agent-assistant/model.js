const DEFAULT_CONTEXT_WINDOW = 128000;
const DEFAULT_MAX_TOKENS = 8192;

const normalizeBaseUrl = (value) => String(value || "").trim().replace(/\/+$/, "");

export const createOpenAiCompatibleModel = (settings) => {
  const modelId = String(settings?.model || "").trim();
  const baseUrl = normalizeBaseUrl(settings?.baseUrl);
  if (!baseUrl) throw new Error("请先配置 Base URL");
  if (!modelId) throw new Error("请先配置模型");

  return {
    id: modelId,
    name: modelId,
    api: "openai-completions",
    provider: "openai-compatible",
    baseUrl,
    reasoning: false,
    input: ["text"],
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
