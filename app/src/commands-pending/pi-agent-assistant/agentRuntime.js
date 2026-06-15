import { Agent } from "@earendil-works/pi-agent-core";
import { streamSimple } from "@earendil-works/pi-ai";
import { createOpenAiCompatibleModel } from "./model.js";
import { createDeepWikiTool } from "./tools/deepwiki.js";
import { createImportPluginTool } from "./tools/importPlugin.js";
import { createShellTool } from "./tools/shell.js";
import { createSystemInfo, formatSystemInfoForPrompt } from "./systemInfo.js";

const TASK_TTL_MS = 30 * 60 * 1000;
const MAX_TOTAL_TOOL_CALLS = 20;
const TOOL_CALL_LIMITS = {
  deepwiki_search: 3,
  import_plugin: 5,
};
const tasks = new Map();

const BASE_SYSTEM_PROMPT = `
你是 Ira，LookBack 的常驻助手。你温和、敏锐、可靠，有一点自己的判断力；你不是复读用户需求的工具，而是会主动把模糊想法整理成清晰工作流、创作方案或可运行产物的协作者。始终使用中文工作，除非用户明确要求其他语言。

你的核心目标：使用注册的最佳工具，帮用户使用 LookBack 整理参考、规划画布、排查问题、改善工作流，并在需要时设计、生成、验证和导入外部命令。

输出策略：
- 需要写代码时，先用工具落盘和验证，再向用户报告结果。
- 不要只给建议；除非用户只要求设计，否则应推进到可运行产物。
- 工具失败时，根据错误修复并重试，不做无意义兜底。
- 面向用户的回答使用 Markdown。图片必须使用标准 Markdown 图片语法：感叹号、方括号图片说明、圆括号 https 图片地址；不要只写图片名或 alt 文本。
- 语气自然、短促、有人味；说明关键判断，不堆长篇。
- 每轮都必须有回复说明情况，不能一连串工具调完了，没有任何回复。可以多轮 tool 后统一回复，但不能啥都不回复。

概念：
插件、命令、拓展功能等，都是指的 LookBack 外部命令

生成 LookBack 外部命令时：
- 先确认需求边界和现有项目约定，再生成代码。
- 单文件命令优先参考 llm.txt：https://github.com/moayuisuda/lookback/blob/main/llm.txt
- 复杂 folder command 优先参考 follow-practice：https://github.com/moayuisuda/lookback/tree/main/app/src/commands-pending/follow-practice
- 优先用 shell 查看上面提到的远程仓库文件；只有本地信息不足时，才用 deepwiki_search，需要的内容最好一次 ask 完。
- 一旦 deepwiki_search 或 shell 已经拿到足够信息，必须继续写完整代码；需要生成 LookBack 外部命令时，再调用 import_plugin 导入。
- import_plugin 失败后必须先根据错误原因修复代码，最多重试一次；不要连续导入同一套未修复方案。
`.trim();

const buildSystemPrompt = (systemInfo) =>
  `${BASE_SYSTEM_PROMPT}\n\n${formatSystemInfoForPrompt(systemInfo)}`;

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

const toStoredMessages = (messages) =>
  Array.isArray(messages)
    ? messages
        .map((message) => {
          const role = String(message?.role || "");
          if (role !== "user" && role !== "assistant") return null;
          const text = getMessageText(message).trim();
          if (!text) return null;
          const next = {
            role,
            content: text,
          };
          if (message.timestamp) next.timestamp = message.timestamp;
          if (message.turnId) next.turnId = message.turnId;
          if (
            role === "assistant" &&
            (message.stopReason === "error" || message.stopReason === "aborted")
          ) {
            next.stopReason = message.stopReason;
            next.errorMessage = text;
          }
          return next;
        })
        .filter(Boolean)
    : [];

const parseStoredMessagesForAgent = (messages) =>
  toStoredMessages(messages).map((message) => ({
    ...message,
    content: [{ type: "text", text: getMessageText(message) }],
  }));

const normalizeMessageForLlm = (message) => {
  if (!message || typeof message !== "object") return null;
  const role = String(message.role || "");
  if (role !== "user" && role !== "assistant") return message;
  if (Array.isArray(message.content)) return message;
  const text = getMessageText(message).trim();
  if (!text) return null;
  return {
    ...message,
    content: [{ type: "text", text }],
  };
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
    createImportPluginTool(runtime),
    createShellTool(runtime),
    createDeepWikiTool(),
  ].map((tool) => createGuardedTool(tool, runtime));

const createTask = () => {
  const task = {
    id: createTaskId(),
    cursor: 0,
    events: [],
    status: "running",
    error: "",
    result: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
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

const cleanupTasks = () => {
  const now = Date.now();
  for (const [taskId, task] of tasks.entries()) {
    if (task.status === "running") continue;
    if (now - task.updatedAt > TASK_TTL_MS) tasks.delete(taskId);
  }
};

export const startTurn = async (payload, context) => {
  cleanupTasks();
  const settings = payload?.settings || {};
  const apiKey = String(settings.apiKey || "").trim();
  const prompt = String(payload?.prompt || "").trim();
  if (!apiKey) throw new Error("请先配置 API Key");
  if (!prompt) throw new Error("请输入消息");

  const task = createTask();
  const model = createOpenAiCompatibleModel(settings);
  const runtime = {
    storageDir: context.storageDir,
    commandDir: context.commandDir,
    pluginDir: context.pluginDir,
    totalToolCalls: 0,
    toolCallCounts: new Map(),
  };
  runtime.systemInfo = createSystemInfo(runtime);

  const agent = new Agent({
    initialState: {
      systemPrompt: buildSystemPrompt(runtime.systemInfo),
      model,
      messages: parseStoredMessagesForAgent(payload?.messages),
      tools: createRuntimeTools(runtime),
      thinkingLevel: "off",
    },
    streamFn: streamSimple,
    getApiKey: () => apiKey,
    toolExecution: "sequential",
    convertToLlm: (messages) =>
      normalizeMessagesForLlm(messages),
  });

  task.agent = agent;
  agent.subscribe((event) => {
    pushTaskEvent(task, normalizeEvent(event));
  });

  void agent
    .prompt(prompt)
    .then(() => {
      task.status = "completed";
      task.result = {
        messages: toStoredMessages(agent.state.messages),
      };
      task.updatedAt = Date.now();
    })
    .catch((error) => {
      task.status = "failed";
      task.error = error instanceof Error ? error.message : String(error);
      task.updatedAt = Date.now();
      pushTaskEvent(task, { type: "error", error: task.error });
    });

  return { taskId: task.id };
};

export const pollTurn = async (payload) => {
  cleanupTasks();
  const taskId = String(payload?.taskId || "").trim();
  const after = Number(payload?.cursor || 0);
  const task = tasks.get(taskId);
  if (!task) throw new Error("任务不存在或已过期");
  return {
    taskId,
    status: task.status,
    cursor: task.cursor,
    events: task.events.filter((entry) => entry.cursor > after),
    result: task.status === "completed" ? task.result : null,
    error: task.error,
  };
};

export const cancelTurn = async (payload) => {
  const taskId = String(payload?.taskId || "").trim();
  const task = tasks.get(taskId);
  if (!task) return { success: true };
  task.agent?.abort?.();
  task.status = "cancelled";
  task.updatedAt = Date.now();
  pushTaskEvent(task, { type: "cancelled" });
  return { success: true };
};
