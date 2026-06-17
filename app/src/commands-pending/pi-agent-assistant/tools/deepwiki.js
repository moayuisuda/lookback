import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Type } from "@earendil-works/pi-ai";

const DEEPWIKI_MCP_URL = "https://mcp.deepwiki.com/mcp";
const DEFAULT_REPOSITORY = "moayuisuda/lookback";

const normalizeRepository = (value) => {
  const raw = String(value || DEFAULT_REPOSITORY).trim();
  if (!raw) return DEFAULT_REPOSITORY;
  try {
    const parsed = new URL(raw);
    const chunks = parsed.pathname.split("/").filter(Boolean);
    if (parsed.hostname === "deepwiki.com" && chunks.length >= 2) {
      return `${chunks[0]}/${chunks[1]}`;
    }
    if (parsed.hostname === "github.com" && chunks.length >= 2) {
      return `${chunks[0]}/${chunks[1]}`;
    }
  } catch {
    return raw;
  }
  return raw;
};

const pickDeepWikiTool = (tools, preferredName) => {
  if (preferredName) {
    const exact = tools.find((tool) => tool.name === preferredName);
    if (exact) return exact;
  }
  return (
    tools.find((tool) => /ask|question/i.test(tool.name)) ||
    tools.find((tool) => /search|query/i.test(tool.name)) ||
    tools[0]
  );
};

const buildArguments = (toolName, repository, question) => {
  if (/read.*structure|structure/i.test(toolName)) return { repoName: repository };
  if (/read.*content|contents/i.test(toolName)) return { repoName: repository };
  return {
    repoName: repository,
    question,
  };
};

const queryDeepWiki = async ({ repository, question, toolName }) => {
  const repoName = normalizeRepository(repository);
  const query = String(question || "").trim();
  if (!repoName) throw new Error("缺少仓库名");
  if (!query && !toolName) throw new Error("缺少检索问题");

  const client = new Client({ name: "lookback-pi-agent-assistant", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(DEEPWIKI_MCP_URL));
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    const tools = Array.isArray(listed?.tools) ? listed.tools : [];
    if (tools.length === 0) throw new Error("DeepWiki 没有返回可用工具");
    const tool = pickDeepWikiTool(tools, toolName);
    const result = await client.callTool({
      name: tool.name,
      arguments: buildArguments(tool.name, repoName, query),
    });
    return {
      tool: tool.name,
      result,
    };
  } finally {
    await client.close().catch(() => null);
  }
};

export const createDeepWikiTool = () => ({
  name: "deepwiki_search",
  label: "DeepWiki",
  description:
    "通过 DeepWiki MCP 补充检索当前仓库知识。默认仓库是 moayuisuda/lookback，用于确认 LookBack 命令 API、架构约定和实现细节。",
  parameters: Type.Object({
    repository: Type.Optional(Type.String({ description: "GitHub 仓库，例如 moayuisuda/lookback；也可传 DeepWiki/GitHub URL" })),
    question: Type.String({ description: "要检索的问题" }),
    toolName: Type.Optional(Type.String({ description: "指定 DeepWiki MCP 工具名，通常无需填写" })),
  }),
  execute: async (_toolCallId, params) => {
    const result = await queryDeepWiki(params);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      details: result,
    };
  },
});
