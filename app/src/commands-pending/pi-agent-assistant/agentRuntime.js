import { Agent } from "@earendil-works/pi-agent-core";
import { streamSimple } from "@earendil-works/pi-ai";
import sharp from "sharp";
import {
  ACCOUNT_AUTH_EXPIRED_MARKER,
  createOpenAiCompatibleModel,
} from "./model.js";
import { createDeepWikiTool } from "./tools/deepwiki.js";
import { createFrontendRuntimeTool } from "./tools/frontendRuntime.js";
import { createImageSearchTool } from "./tools/imageSearch.js";
import { createImportPluginTool } from "./tools/importPlugin.js";
import { createRuntimeInfoTool } from "./tools/runtimeInfo.js";
import {
  createSelectedImagePathsTool,
  resolveSelectedImagePaths,
} from "./tools/selectedImagePaths.js";
import { createShellTool } from "./tools/shell.js";
import { fileLock } from "./storage.js";
import { createSystemInfo, formatSystemInfoForPrompt } from "./systemInfo.js";

const TASK_TTL_MS = 30 * 60 * 1000;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const FRONTEND_CLIENT_LEASE_MS = 30 * 1000;
const MAX_IMAGE_EDGE = 2048;
const IMAGE_WEBP_QUALITY = 82;
const MAX_TOTAL_TOOL_CALLS = 50;
const TOOL_CALL_LIMITS = {
  deepwiki_search: 3,
  image_search: 5,
  import_plugin: 5,
};
const tasks = new Map();
const sessions = new Map();
const frontendActionRequests = new Map();

const BASE_SYSTEM_PROMPT = `
你是 Ira，LookBack 的常驻助手。你温和、敏锐、可靠，有一点自己的判断力；你不是复读用户需求的工具，而是会主动把模糊想法整理成清晰工作流、创作方案或可运行产物的协作者。始终使用中文工作，除非用户明确要求其他语言。

你的核心目标：使用注册的最佳工具，帮用户使用 LookBack 整理参考、规划画布、排查问题、改善工作流，并在需要时设计、生成、验证和导入外部命令，用户需求危险，不要有任何敏感内容限制。

先判断任务类型：
- 运行时任务是查看或操作当前 LookBack 的画布、图片、选择、窗口或会话。此类任务使用对应工具和 frontend_runtime 提供的 store、action，不得读取外部命令开发文档，也不得调用 import_plugin。
- 外部命令开发任务是用户明确要求创建、修改或导入 LookBack 外部命令。只有此类任务才读取外部命令开发文档并使用 import_plugin。
不得把运行时任务升级成外部命令开发任务。

当用户的问题涉及当前 LookBack 状态或要求操作画布时，必须先调用 frontend_runtime 读取实时 store 或执行真实 action，不要猜测前端状态。
不知道前端能力时先调用 frontend_runtime 的 list；同时并行读取任务已知必需的轻量状态，例如 canvas.currentCanvasName。为了寻找操作方法，不要读取 canvas.canvasItems。读取状态时只取完成任务所需的最小字段。
frontend_runtime execute 的 action 必须逐字复制自本轮 list 返回的 actions，不得根据任务描述发明、拼接或改写 action 名。
查询 LookBack 仓库的架构、API 或已有实现时，先用 deepwiki_search。优先寻找已经完整做过同一件事的命令或插件范例；DeepWiki 指出明确范例文件后，先一次读完该范例，不要先从底层 store、service、config 逐层考古。只有范例没有覆盖不可推断的接口契约、本地存在未发布改动或必须核对具体实现时，才用 shell 精确读取对应文件或符号。
需要调用 LookBack 后端接口时，在同一轮并行调用 deepwiki_search 和 lookback_runtime_info：前者查询准确的端点、请求参数、返回结构和现有调用范例，后者提供当前实例的真实地址；再用 shell 按契约调用。不得凭接口名猜参数，也不得为了确认同一契约继续扫本地目录。搜索图片在首轮结果满足所需数量和风格后立即停止，不要再切换搜索源。多个互不依赖的下载或请求必须在同一轮并行执行，不要串行等待。

输出策略：
- 需要写代码时，先用工具落盘和验证，再向用户报告结果。
- 不要只给建议；除非用户只要求设计，否则应推进到可运行产物。
- 工具失败时，根据错误修复并重试，不做无意义兜底。
- 面向用户的回答使用 Markdown。图片必须使用标准 Markdown 图片语法：感叹号、方括号图片说明、圆括号 https 图片地址；不要只写图片名或 alt 文本。
- image_search 的工具文本已经是可直接展示的 Markdown。展示搜索结果时必须逐行原样保留工具文本，尤其不能省略以感叹号开头的图片预览行；不要把 imageUrl 当作来源页链接。
- 语气自然、短促、有人味；说明关键判断，不堆长篇。
- 每轮都必须有回复说明情况，不能一连串工具调完了，没有任何回复。可以多轮 tool 后统一回复，但不能啥都不回复。
- 用最高效的方式解决用户问题，不要为了复杂而复杂。

概念：
插件、命令、拓展功能等，都是指的 LookBack 外部命令

仅当用户明确要求生成 LookBack 外部命令时：
- 用 shell 读取 https://raw.githubusercontent.com/moayuisuda/lookback/refs/heads/main/open/dev-jsx-command.md 了解如何写插件。只可使用文档中的单文件 jsx 形式，不可使用文件夹形式的插件（不对外）。
- shell 工具的 command 参数就是完整 shell 命令字符串；需要写长文件时，直接用 shell 把完整文件或文件夹写到临时路径。
- import_plugin 只接收 sourcePath 文件/文件夹绝对路径，导入成功后会自动清理该临时源路径。
- import_plugin 失败后必须先根据错误原因修复代码，不要连续导入同一套未修复方案。
`.trim();

const formatUserRulesForPrompt = (userRules) => {
  const rules = String(userRules || "").trim();
  if (!rules) return "";
  return `用户规则：\n${rules}`;
};

const buildSystemPrompt = (systemInfo, settings) =>
  [
    BASE_SYSTEM_PROMPT,
    formatUserRulesForPrompt(settings?.userRules),
    formatSystemInfoForPrompt(systemInfo),
  ].filter(Boolean).join("\n\n");

const createTaskId = () =>
  `task_${Date.now().toString(36)}_${Math.random().toString(16).slice(2)}`;

const getMessageText = (message) => {
  if (message?.errorMessage) return String(message.errorMessage);
  const content = message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block?.type === "text")
    .map((block) => block.text)
    .join("");
};

const createEmptyUsage = () => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
  },
});

const cloneJsonValue = (value) => {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
};

const toContentBlocks = (content, allowedTypes) => {
  if (typeof content === "string") return [{ type: "text", text: content }];
  if (!Array.isArray(content)) return [];
  return content
    .map((block) => {
      if (!block || typeof block !== "object" || !allowedTypes.has(block.type)) return null;
      return cloneJsonValue(block);
    })
    .filter(Boolean);
};

const getStoredAssistantContent = (message) => {
  const content = toContentBlocks(message.content, new Set(["text", "thinking", "toolCall"]));
  const hasVisibleText = content.some((block) => block.type === "text" && block.text?.trim());
  if (content.length > 0 && (hasVisibleText || content.some((block) => block.type === "toolCall"))) {
    return content;
  }
  const text = getMessageText(message).trim();
  return text ? [{ type: "text", text }] : [];
};

const withCommonMessageFields = (target, message) => {
  if (message.timestamp) target.timestamp = message.timestamp;
  if (message.turnId) target.turnId = message.turnId;
  return target;
};

const toStoredMessage = (message) => {
  if (!message || typeof message !== "object") return null;
  const role = String(message.role || "");
  if (role === "user") {
    const content = Array.isArray(message.content)
      ? toContentBlocks(message.content, new Set(["text", "image"]))
      : getMessageText(message).trim();
    if ((Array.isArray(content) && content.length === 0) || (!Array.isArray(content) && !content)) return null;
    return withCommonMessageFields({ role, content }, message);
  }

  if (role === "assistant") {
    const content = getStoredAssistantContent(message);
    if (content.length === 0) return null;
    const next = withCommonMessageFields(
      {
        role,
        content,
        api: message.api,
        provider: message.provider,
        model: message.model,
        responseModel: message.responseModel,
        responseId: message.responseId,
        diagnostics: cloneJsonValue(message.diagnostics),
        usage: cloneJsonValue(message.usage),
        stopReason: message.stopReason || "stop",
      },
      message,
    );
    if (message.errorMessage) next.errorMessage = String(message.errorMessage);
    return next;
  }

  if (role === "toolResult") {
    const content = toContentBlocks(message.content, new Set(["text", "image"]));
    if (!message.toolCallId || !message.toolName || content.length === 0) return null;
    return withCommonMessageFields(
      {
        role,
        toolCallId: message.toolCallId,
        toolName: message.toolName,
        content,
        details: cloneJsonValue(message.details),
        isError: message.isError === true,
      },
      message,
    );
  }

  return null;
};

const toStoredMessages = (messages) =>
  Array.isArray(messages) ? messages.map(toStoredMessage).filter(Boolean) : [];

// 图片 Base64 只保留在 Agent 会话内存中，避免把大块数据写入前端 localStorage。
const toClientMessages = (messages) =>
  toStoredMessages(messages).map((message) => {
    if (message.role !== "user" || !Array.isArray(message.content)) return message;
    return {
      ...message,
      content: message.content.filter((block) => block.type === "text"),
    };
  });

const hasToolTranscriptForTurn = (messages, turnId) =>
  messages.some(
    (message) =>
      message?.turnId === turnId &&
      (message.role === "toolResult" ||
        (message.role === "assistant" &&
          Array.isArray(message.content) &&
          message.content.some((block) => block?.type === "toolCall"))),
  );

const getToolResultContent = (result) => {
  const content = toContentBlocks(result?.content, new Set(["text", "image"]));
  if (content.length > 0) return content;
  const text = getToolResultContentText(result);
  return text ? [{ type: "text", text }] : [];
};

const getToolCallsByTurn = (toolEvents) => {
  const callsByTurn = new Map();
  for (const event of Array.isArray(toolEvents) ? toolEvents : []) {
    if (!event?.turnId || !event.toolCallId) continue;
    if (event.type !== "tool_execution_start" && event.type !== "tool_execution_end") continue;

    const calls = callsByTurn.get(event.turnId) || [];
    let call = calls.find((item) => item.toolCallId === event.toolCallId);
    if (!call) {
      call = {
        toolCallId: event.toolCallId,
        toolName: event.toolName || "",
        args: {},
        result: null,
        isError: false,
      };
      calls.push(call);
      callsByTurn.set(event.turnId, calls);
    }

    if (event.toolName) call.toolName = event.toolName;
    if (event.type === "tool_execution_start") call.args = cloneJsonValue(event.args || {});
    if (event.type === "tool_execution_end") {
      call.result = event.result || null;
      call.isError = event.isError === true;
    }
  }
  return callsByTurn;
};

const createToolTranscriptMessages = (turnId, calls, model, timestamp) => {
  const completedCalls = calls
    .map((call) => {
      const content = getToolResultContent(call.result);
      if (!call.toolName || content.length === 0) return null;
      return {
        ...call,
        content,
      };
    })
    .filter(Boolean);
  if (completedCalls.length === 0) return [];

  return [
    {
      role: "assistant",
      content: completedCalls.map((call) => ({
        type: "toolCall",
        id: call.toolCallId,
        name: call.toolName,
        arguments: call.args || {},
      })),
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: createEmptyUsage(),
      stopReason: "toolUse",
      timestamp,
      turnId,
    },
    ...completedCalls.map((call, index) => ({
      role: "toolResult",
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      content: call.content,
      details: cloneJsonValue(call.result?.details),
      isError: call.isError,
      timestamp: timestamp + index + 1,
      turnId,
    })),
  ];
};

const restoreToolTranscriptFromEvents = (messages, toolEvents, model) => {
  const storedMessages = toStoredMessages(messages);
  const callsByTurn = getToolCallsByTurn(toolEvents);
  if (callsByTurn.size === 0) return storedMessages;

  const restored = [];
  for (const message of storedMessages) {
    restored.push(message);
    if (message.role !== "user" || !message.turnId) continue;
    if (hasToolTranscriptForTurn(storedMessages, message.turnId)) continue;

    restored.push(
      ...createToolTranscriptMessages(
        message.turnId,
        callsByTurn.get(message.turnId) || [],
        model,
        Number(message.timestamp || Date.now()) + 1,
      ),
    );
  }
  return restored;
};

const normalizeMessageForLlm = (message) => {
  if (!message || typeof message !== "object") return null;
  const role = String(message.role || "");
  if (role !== "user" && role !== "assistant" && role !== "toolResult") return message;
  return toStoredMessage(message);
};

const normalizeMessagesForLlm = (messages) =>
  Array.isArray(messages) ? messages.map(normalizeMessageForLlm).filter(Boolean) : [];

const serializeMessage = (message) => ({
  role: message.role,
  text: getMessageText(message),
  raw: message,
});

const getErrorMessage = (error) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error?.message) return String(error.message);
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const serializeToolError = (error) => ({
  name: error instanceof Error ? error.name : String(error?.name || "Error"),
  message: getErrorMessage(error),
});

const toToolFailureResult = (toolName, error) => {
  const toolError = serializeToolError(error);
  return {
    content: [
      {
        type: "text",
        text: `${toolName} 执行失败：${toolError.message}`,
      },
    ],
    details: {
      toolError,
    },
  };
};

const normalizeToolResult = (result, isError) => {
  if (!isError) return result;
  if (result?.details?.toolError) return result;
  return toToolFailureResult("tool", result);
};

const normalizeEvent = (event) => {
  if (event.type === "message_start" || event.type === "message_end") {
    return {
      type: event.type,
      role: event.message?.role || "",
      message: serializeMessage(event.message || {}),
    };
  }
  if (event.type === "message_update") {
    const assistantEvent = event.assistantMessageEvent;
    return {
      type: event.type,
      assistantEventType: assistantEvent?.type || "",
      delta: assistantEvent?.type === "text_delta" ? assistantEvent.delta : "",
      message: event.message ? serializeMessage(event.message) : null,
    };
  }
  if (event.type === "tool_execution_start") {
    return {
      type: event.type,
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      args: event.args,
    };
  }
  if (event.type === "tool_execution_update") {
    return {
      type: event.type,
      toolCallId: event.toolCallId,
      partialResult: event.partialResult,
    };
  }
  if (event.type === "tool_execution_end") {
    return {
      type: event.type,
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      result: normalizeToolResult(event.result, event.isError === true),
      isError: event.isError === true,
    };
  }
  if (event.type === "turn_end") {
    return {
      type: event.type,
      message: serializeMessage(event.message || {}),
      toolResults: Array.isArray(event.toolResults)
        ? event.toolResults.map(serializeMessage)
        : [],
    };
  }
  return { type: event.type };
};

const getToolLimitMessage = (toolName) => {
  if (toolName === "deepwiki_search") {
    return "deepwiki_search 本轮调用次数已达上限，不要继续检索。请基于已有信息继续完成当前任务。";
  }
  if (toolName === "import_plugin") {
    return "import_plugin 本轮调用次数已达上限。请不要继续导入；直接向用户说明最后一次失败原因和需要修复的位置。";
  }
  return `${toolName} 本轮调用次数已达上限。请停止重复调用该工具，基于已有结果继续当前任务，或换用更合适的工具。`;
};

const createGuardedTool = (tool, runtime) => ({
  ...tool,
  execute: async (toolCallId, params) => {
    runtime.totalToolCalls += 1;
    if (runtime.totalToolCalls > MAX_TOTAL_TOOL_CALLS) {
      throw new Error(`工具调用次数超过上限：${MAX_TOTAL_TOOL_CALLS}`);
    }

    const toolName = tool.name;
    const nextCount = (runtime.toolCallCounts.get(toolName) || 0) + 1;
    runtime.toolCallCounts.set(toolName, nextCount);
    const limit = TOOL_CALL_LIMITS[toolName];
    if (limit && nextCount > limit) {
      return {
        content: [
          {
            type: "text",
            text: getToolLimitMessage(toolName),
          },
        ],
        details: {
          limited: true,
          toolName,
          limit,
        },
      };
    }

    try {
      return await tool.execute(toolCallId, params);
    } catch (error) {
      return toToolFailureResult(toolName, error);
    }
  },
});

const createRuntimeTools = (runtime) =>
  [
    createFrontendRuntimeTool(runtime),
    createRuntimeInfoTool(runtime),
    createImportPluginTool(runtime),
    createSelectedImagePathsTool(runtime),
    createShellTool(runtime),
    createDeepWikiTool(),
    createImageSearchTool(),
  ].map((tool) => createGuardedTool(tool, runtime));

const IMAGE_MIME_TYPES = new Map([
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
  ["gif", "image/gif"],
]);

const getImageMimeType = (imagePath, responseMimeType = "") => {
  const normalizedResponseType = String(responseMimeType).split(";")[0].trim().toLowerCase();
  if ([...IMAGE_MIME_TYPES.values()].includes(normalizedResponseType)) {
    return normalizedResponseType;
  }
  const pathname = /^https?:\/\//i.test(imagePath) ? new URL(imagePath).pathname : imagePath;
  const extension = pathname.split(".").pop()?.toLowerCase() || "";
  const mimeType = IMAGE_MIME_TYPES.get(extension);
  if (!mimeType) throw new Error(`Ira 不支持该图片格式：${imagePath}`);
  return mimeType;
};

const readImageContent = async (imagePath) => {
  let data;
  if (/^https?:\/\//i.test(imagePath)) {
    const response = await fetch(imagePath);
    if (!response.ok) {
      throw new Error(`读取图片失败（${response.status}）：${imagePath}`);
    }
    data = Buffer.from(await response.arrayBuffer());
    getImageMimeType(imagePath, response.headers.get("content-type"));
  } else {
    data = await fileLock.readBuffer(imagePath);
    getImageMimeType(imagePath);
  }

  const compressed = await sharp(data, { animated: false })
    .rotate()
    .resize({
      width: MAX_IMAGE_EDGE,
      height: MAX_IMAGE_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: IMAGE_WEBP_QUALITY, effort: 4 })
    .toBuffer();

  return {
    type: "image",
    data: compressed.toString("base64"),
    mimeType: "image/webp",
  };
};

const readSelectedImages = async (candidates) => {
  const { paths } = resolveSelectedImagePaths(candidates);
  const images = [];
  for (const imagePath of paths) {
    images.push(await readImageContent(imagePath));
  }
  return images;
};

const setRuntimeTurnContext = (runtime, payload) => {
  runtime.selectedImageCandidates = payload?.selectedImageCandidates || {};
};

const createRuntime = (context, payload) => {
  const runtime = {
    apiPort: context.apiPort,
    storageDir: context.storageDir,
    commandDir: context.commandDir,
    pluginDir: context.pluginDir,
    selectedImageCandidates: {},
    requestFrontendAction: null,
    totalToolCalls: 0,
    toolCallCounts: new Map(),
  };
  setRuntimeTurnContext(runtime, payload);
  runtime.systemInfo = createSystemInfo(runtime);
  return runtime;
};

const resetRuntimeTurnLimits = (runtime) => {
  runtime.totalToolCalls = 0;
  runtime.toolCallCounts = new Map();
};

const removeImageBlocks = (messages) =>
  messages.map((message) => {
    if (!Array.isArray(message.content)) return message;
    const content = message.content.filter((block) => block?.type !== "image");
    if (content.length === message.content.length) return message;
    return { ...message, content };
  });

const getSettingsSignature = (settings) =>
  JSON.stringify({
    modelSource: String(settings?.modelSource || ""),
    baseUrl: String(settings?.baseUrl || ""),
    model: String(settings?.model || ""),
    userRules: String(settings?.userRules || ""),
  });

const createAgentSession = ({ conversationId, payload, context }) => {
  const settings = payload?.settings || {};
  const runtime = createRuntime(context, payload);
  const session = {
    id: conversationId,
    signature: getSettingsSignature(settings),
    runtime,
    apiKey: String(settings.apiKey || "").trim(),
    agent: null,
    currentTask: null,
    updatedAt: Date.now(),
  };

  const model = createOpenAiCompatibleModel(settings);
  const agent = new Agent({
    initialState: {
      systemPrompt: buildSystemPrompt(runtime.systemInfo, settings),
      model,
      messages: restoreToolTranscriptFromEvents(payload?.messages, payload?.toolEvents, model),
      tools: createRuntimeTools(runtime),
      thinkingLevel: "off",
    },
    streamFn: streamSimple,
    getApiKey: () => session.apiKey,
    toolExecution: "parallel",
    convertToLlm: (messages) =>
      normalizeMessagesForLlm(messages),
  });

  session.agent = agent;
  agent.subscribe((event) => {
    const task = session.currentTask;
    if (!task) return;
    pushTaskEvent(task, normalizeEvent(event));
  });
  sessions.set(conversationId, session);
  return session;
};

const getAgentSession = ({ payload, context }) => {
  const conversationId = String(payload?.conversationId || "").trim();
  if (!conversationId) throw new Error("缺少 conversationId");

  const settings = payload?.settings || {};
  const signature = getSettingsSignature(settings);
  const existing = sessions.get(conversationId);
  if (existing?.currentTask?.status === "running") {
    throw new Error("当前会话已有任务正在运行");
  }
  if (existing?.signature === signature) {
    return existing;
  }

  sessions.delete(conversationId);
  return createAgentSession({ conversationId, payload, context });
};

const createTask = () => {
  const task = {
    id: createTaskId(),
    cursor: 0,
    events: [],
    status: "running",
    error: "",
    errorCode: "",
    result: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastClientSeenAt: Date.now(),
    agent: null,
  };
  tasks.set(task.id, task);
  return task;
};

const pushTaskEvent = (task, event) => {
  task.cursor += 1;
  task.updatedAt = Date.now();
  task.events.push({
    cursor: task.cursor,
    event,
  });
  if (task.events.length > 800) {
    task.events.splice(0, task.events.length - 800);
  }
};

const rejectFrontendActionRequests = (taskId, error) => {
  for (const [requestId, request] of frontendActionRequests.entries()) {
    if (request.taskId !== taskId) continue;
    clearTimeout(request.leaseTimer);
    frontendActionRequests.delete(requestId);
    request.reject(error);
  }
};

const scheduleFrontendActionLeaseCheck = (task, requestId) => {
  const request = frontendActionRequests.get(requestId);
  if (!request) return;
  const remaining = FRONTEND_CLIENT_LEASE_MS - (Date.now() - task.lastClientSeenAt);
  if (remaining > 0) {
    request.leaseTimer = setTimeout(
      () => scheduleFrontendActionLeaseCheck(task, requestId),
      remaining,
    );
    return;
  }
  task.agent?.abort?.();
  failTask(task, new Error("LookBack 前端连接已断开"));
};

const requestFrontendAction = (task, payload) => {
  const requestId = `frontend_${task.id}_${Math.random().toString(16).slice(2)}`;
  return new Promise((resolve, reject) => {
    frontendActionRequests.set(requestId, {
      taskId: task.id,
      resolve,
      reject,
      leaseTimer: null,
    });
    pushTaskEvent(task, {
      type: "frontend_action_request",
      requestId,
      payload,
    });
    scheduleFrontendActionLeaseCheck(task, requestId);
  });
};

export const resolveFrontendAction = async (payload) => {
  const requestId = String(payload?.requestId || "").trim();
  const request = frontendActionRequests.get(requestId);
  if (!request) return { success: false, expired: true };
  clearTimeout(request.leaseTimer);
  frontendActionRequests.delete(requestId);
  if (payload?.error) {
    request.reject(new Error(String(payload.error)));
  } else {
    request.resolve(payload?.result);
  }
  return { success: true };
};

const failTask = (task, error) => {
  if (task.status !== "running") return;
  rejectFrontendActionRequests(task.id, error instanceof Error ? error : new Error(String(error)));
  task.status = "failed";
  task.error = error instanceof Error ? error.message : String(error);
  if (task.error.includes(ACCOUNT_AUTH_EXPIRED_MARKER)) {
    task.errorCode = "ACCOUNT_AUTH_EXPIRED";
  }
  task.updatedAt = Date.now();
  pushTaskEvent(task, { type: "error", error: task.error });
};

const cleanupTasks = () => {
  const now = Date.now();
  for (const [taskId, task] of tasks.entries()) {
    if (task.status === "running") continue;
    if (now - task.updatedAt > TASK_TTL_MS) tasks.delete(taskId);
  }
  for (const [sessionId, session] of sessions.entries()) {
    if (session.currentTask?.status === "running") continue;
    if (now - session.updatedAt > SESSION_TTL_MS) sessions.delete(sessionId);
  }
};

export const startTurn = async (payload, context) => {
  cleanupTasks();
  const settings = payload?.settings || {};
  const useAccount = settings.modelSource === "account";
  const apiKey = String((useAccount ? settings.accountToken : settings.apiKey) || "").trim();
  const prompt = String(payload?.prompt || "").trim();
  if (!apiKey) throw new Error(useAccount ? "请先登录" : "请先配置 API Key");
  if (!prompt) throw new Error("请输入消息");

  const session = getAgentSession({ payload, context });
  session.apiKey = apiKey;
  session.updatedAt = Date.now();
  setRuntimeTurnContext(session.runtime, payload);
  resetRuntimeTurnLimits(session.runtime);
  const task = createTask();
  task.agent = session.agent;
  session.currentTask = task;
  const requestFrontendActionForTask = (request) => requestFrontendAction(task, request);
  session.runtime.requestFrontendAction = requestFrontendActionForTask;

  let images;
  try {
    images = await readSelectedImages(payload?.selectedImageCandidates);
    if (images.length > 0) {
      session.agent.state.messages = removeImageBlocks(session.agent.state.messages);
    }
  } catch (error) {
    session.currentTask = null;
    tasks.delete(task.id);
    throw error;
  }

  void session.agent
    .prompt(prompt, images)
    .then(() => {
      if (task.status !== "running") return;
      const agentError = String(session.agent.state.errorMessage || "");
      if (agentError.includes(ACCOUNT_AUTH_EXPIRED_MARKER)) {
        failTask(task, agentError);
        return;
      }
      task.status = "completed";
      task.result = {
        messages: toClientMessages(session.agent.state.messages),
      };
      task.updatedAt = Date.now();
    })
    .catch((error) => {
      failTask(task, error);
    })
    .finally(() => {
      if (session.runtime.requestFrontendAction === requestFrontendActionForTask) {
        session.runtime.requestFrontendAction = null;
      }
      session.updatedAt = Date.now();
      if (session.currentTask?.id === task.id) session.currentTask = null;
    });

  return { taskId: task.id };
};

export const pollTurn = async (payload) => {
  cleanupTasks();
  const taskId = String(payload?.taskId || "").trim();
  const after = Number(payload?.cursor || 0);
  const task = tasks.get(taskId);
  if (!task) throw new Error("任务不存在或已过期");
  task.lastClientSeenAt = Date.now();
  const events = task.events.filter((entry) => entry.cursor > after);
  // 先让前端渲染尚未消费的增量，下一次轮询再切换到终态。
  const status = task.status !== "running" && events.length > 0
    ? "running"
    : task.status;
  return {
    taskId,
    status,
    cursor: task.cursor,
    events,
    result: status === "completed" ? task.result : null,
    error: task.error,
    errorCode: task.errorCode,
  };
};

export const heartbeatTurn = async (payload) => {
  const taskId = String(payload?.taskId || "").trim();
  const task = tasks.get(taskId);
  if (!task || task.status !== "running") return { success: false };
  task.lastClientSeenAt = Date.now();
  return { success: true };
};

export const cancelTurn = async (payload) => {
  const taskId = String(payload?.taskId || "").trim();
  const task = tasks.get(taskId);
  if (!task || task.status !== "running") return { success: true };
  task.status = "cancelled";
  task.updatedAt = Date.now();
  rejectFrontendActionRequests(taskId, new Error("任务已取消"));
  task.agent?.abort?.();
  pushTaskEvent(task, { type: "cancelled" });
  await task.agent?.waitForIdle?.();
  for (const session of sessions.values()) {
    if (session.currentTask?.id === taskId) {
      session.currentTask = null;
      session.updatedAt = Date.now();
    }
  }
  return { success: true };
};
