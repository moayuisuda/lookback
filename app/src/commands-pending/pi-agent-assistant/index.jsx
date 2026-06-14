const COMMAND_ID = "piAgentAssistant";
const SETTINGS_KEY = "lookback.command.piAgentAssistant.settings.v1";
const CONVERSATION_KEY = "lookback.command.piAgentAssistant.conversation.v1";
const DEFAULT_BASE_URL = "https://zenmux.ai/api/v1";
const DEFAULT_MODEL = "moonshotai/kimi-k2.7-code-free";
const POLL_INTERVAL_MS = 500;

export const config = {
  id: COMMAND_ID,
  titleKey: "command.piAgentAssistant.title",
  title: "Ira",
  descriptionKey: "command.piAgentAssistant.description",
  description: "LookBack's assistant for workflows, creation, and extensions",
  keywords: ["pi", "agent", "plugin", "command", "assistant", "插件", "命令助手"],
  i18n: {
    en: {
      "command.piAgentAssistant.title": "Ira",
      "command.piAgentAssistant.description": "LookBack's assistant for workflows, creation, and extensions",
      "command.piAgentAssistant.baseUrl": "Base URL",
      "command.piAgentAssistant.apiKey": "API Key",
      "command.piAgentAssistant.model": "Model",
      "command.piAgentAssistant.debug": "Debug mode",
      "command.piAgentAssistant.save": "Saved",
      "command.piAgentAssistant.clear": "Clear",
      "command.piAgentAssistant.deleteMessage": "Delete",
      "command.piAgentAssistant.cancel": "Stop",
      "command.piAgentAssistant.settings": "Settings",
      "command.piAgentAssistant.hideSettings": "Hide Settings",
      "command.piAgentAssistant.send": "Send",
      "command.piAgentAssistant.placeholder": "Describe the command you want to build...",
      "command.piAgentAssistant.empty": "No messages yet",
      "command.piAgentAssistant.emptyHint": "Ask Ira about LookBack workflows, ideas, debugging, or command extensions.",
      "command.piAgentAssistant.status.ready": "Ready",
      "command.piAgentAssistant.status.running": "Agent is working...",
      "command.piAgentAssistant.status.completed": "Completed",
      "command.piAgentAssistant.status.failed": "Failed: {{error}}",
      "command.piAgentAssistant.status.cancelled": "Stopped",
      "command.piAgentAssistant.tools": "Tool Activity",
      "command.piAgentAssistant.user": "You",
      "command.piAgentAssistant.assistant": "Assistant",
      "command.piAgentAssistant.tool": "Tool",
      "command.piAgentAssistant.thinking": "Ira is working",
      "command.piAgentAssistant.imported": "Plugin imported. Reopen the command to refresh the list.",
      "command.piAgentAssistant.error.agentFailed": "Agent failed",
      "toast.command.piAgentAssistant.failed": "Ira failed: {{error}}",
      "toast.command.piAgentAssistant.imported": "Plugin imported. Reopen the command to refresh the list.",
      "toast.command.piAgentAssistant.cleared": "Conversation cleared",
    },
    zh: {
      "command.piAgentAssistant.title": "Ira",
      "command.piAgentAssistant.description": "LookBack 的工作流、创作与扩展助手",
      "command.piAgentAssistant.baseUrl": "Base URL",
      "command.piAgentAssistant.apiKey": "API Key",
      "command.piAgentAssistant.model": "模型",
      "command.piAgentAssistant.debug": "调试模式",
      "command.piAgentAssistant.save": "已保存",
      "command.piAgentAssistant.clear": "清空",
      "command.piAgentAssistant.deleteMessage": "删除",
      "command.piAgentAssistant.cancel": "停止",
      "command.piAgentAssistant.settings": "配置",
      "command.piAgentAssistant.hideSettings": "收起配置",
      "command.piAgentAssistant.send": "发送",
      "command.piAgentAssistant.placeholder": "描述你想构建的命令...",
      "command.piAgentAssistant.empty": "还没有对话",
      "command.piAgentAssistant.emptyHint": "让 Ira 帮你整理 LookBack 工作流、创作想法、问题排查或命令扩展。",
      "command.piAgentAssistant.status.ready": "就绪",
      "command.piAgentAssistant.status.running": "Agent 正在工作...",
      "command.piAgentAssistant.status.completed": "已完成",
      "command.piAgentAssistant.status.failed": "失败：{{error}}",
      "command.piAgentAssistant.status.cancelled": "已停止",
      "command.piAgentAssistant.tools": "工具活动",
      "command.piAgentAssistant.user": "你",
      "command.piAgentAssistant.assistant": "助手",
      "command.piAgentAssistant.tool": "工具",
      "command.piAgentAssistant.thinking": "Ira 正在处理",
      "command.piAgentAssistant.imported": "插件已导入，重新打开命令后刷新列表。",
      "command.piAgentAssistant.error.agentFailed": "Agent 执行失败",
      "toast.command.piAgentAssistant.failed": "Ira 失败：{{error}}",
      "toast.command.piAgentAssistant.imported": "插件已导入，重新打开命令后刷新列表",
      "toast.command.piAgentAssistant.cleared": "对话已清空",
    },
  },
};

const parseJson = (value, fallback) => {
  if (!value) return fallback;
  return JSON.parse(value);
};

const loadSettings = () => ({
  baseUrl: DEFAULT_BASE_URL,
  apiKey: "",
  model: DEFAULT_MODEL,
  debug: false,
  ...parseJson(localStorage.getItem(SETTINGS_KEY), {}),
});

const saveSettings = (settings) => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

const loadConversation = () => ({
  messages: parseJson(localStorage.getItem(CONVERSATION_KEY), { messages: [] }).messages || [],
});

const saveConversation = (conversation) => {
  localStorage.setItem(CONVERSATION_KEY, JSON.stringify(conversation));
};

const createTurnId = () =>
  `turn_${Date.now().toString(36)}_${Math.random().toString(16).slice(2)}`;

const attachTurnIdToLatestUserMessage = (messages, turnId) => {
  if (!turnId || !Array.isArray(messages)) return messages || [];
  let attached = false;
  return [...messages].reverse().map((message) => {
    if (!attached && message?.role === "user") {
      attached = true;
      return { ...message, turnId: message.turnId || turnId };
    }
    return message;
  }).reverse();
};

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

const getRoleKey = (role) => {
  if (role === "user") return "command.piAgentAssistant.user";
  if (role === "assistant") return "command.piAgentAssistant.assistant";
  return "command.piAgentAssistant.tool";
};

const getIraState = (statusKey) => {
  if (statusKey.endsWith(".running")) return "running";
  if (statusKey.endsWith(".completed")) return "completed";
  if (statusKey.endsWith(".failed")) return "failed";
  if (statusKey.endsWith(".cancelled")) return "cancelled";
  return "ready";
};

const getIraCat = (state) => {
  if (state === "running") return " /\\_/\\\\\n( o.o )\n > ^ <";
  if (state === "completed") return " /\\_/\\\\\n( ^.^ )\n / >*";
  if (state === "failed") return " /\\_/\\\\\n( x.x )\n > ! <";
  if (state === "cancelled") return " /\\_/\\\\\n( -.- ) z\n > ^ <";
  return " /\\_/\\\\\n( . . )\n > ^ <";
};

const getLastAssistantError = (messages) => {
  const lastMessage = Array.isArray(messages) ? messages[messages.length - 1] : null;
  if (lastMessage?.role !== "assistant") return "";
  if (lastMessage.stopReason !== "error" && lastMessage.stopReason !== "aborted") return "";
  return String(lastMessage.errorMessage || lastMessage.stopReason || "").trim();
};

const isImportedPluginEvent = (event) =>
  event?.type === "tool_execution_end" && Boolean(event?.result?.details?.importedPlugin);

const getToolEventText = (event, t) => {
  if (event.type === "tool_execution_start") return t("command.piAgentAssistant.status.running");
  if (!event.isError) return t("command.piAgentAssistant.status.completed");
  return t("command.piAgentAssistant.status.failed", { error: "" });
};

const getToolEventDebugText = (event) => {
  if (event.type !== "tool_execution_end") return "";
  const payload = event.result?.details || event.result;
  if (!payload) return "";
  const text = JSON.stringify(payload, null, 2);
  if (text.length <= 8000) return text;
  return `${text.slice(0, 8000)}\n...[debug output truncated]`;
};

const isSafeResourceUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const renderInlineMarkdown = (React, text, keyPrefix) => {
  const nodes = [];
  const pattern = /(!\[([^\]]*)]\(([^)]+)\)|\[([^\]]+)]\((https?:\/\/[^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*)/g;
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const key = `${keyPrefix}-${match.index}`;
    if (match[1]?.startsWith("![")) {
      const alt = match[2] || "";
      const src = match[3] || "";
      nodes.push(
        isSafeResourceUrl(src)
          ? React.createElement(
              "span",
              { key, className: "pi-agent-markdown-image-wrap" },
              React.createElement("img", {
                className: "pi-agent-markdown-image",
                src,
                alt,
                onError: (event) => {
                  event.currentTarget
                    .closest(".pi-agent-markdown-image-wrap")
                    ?.classList.add("is-error");
                },
              }),
              React.createElement(
                "a",
                {
                  className: "pi-agent-markdown-image-fallback",
                  href: src,
                  target: "_blank",
                  rel: "noreferrer",
                },
                `${alt || "图片"}加载失败，打开原图`,
              ),
            )
          : match[0],
      );
    } else if (match[4]) {
      const href = match[5];
      nodes.push(
        React.createElement(
          "a",
          { key, href, target: "_blank", rel: "noreferrer" },
          match[4],
        ),
      );
    } else if (match[6]) {
      nodes.push(React.createElement("code", { key }, match[6]));
    } else if (match[7]) {
      nodes.push(React.createElement("strong", { key }, match[7]));
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
};

const renderMarkdown = (React, text) => {
  const blocks = [];
  const lines = String(text || "").split(/\r?\n/);
  let codeLines = [];
  let isCode = false;
  let codeIndex = 0;

  const flushCode = () => {
    if (codeLines.length === 0) return;
    blocks.push(
      React.createElement(
        "pre",
        { key: `code-${codeIndex}`, className: "pi-agent-markdown-code" },
        React.createElement("code", null, codeLines.join("\n")),
      ),
    );
    codeIndex += 1;
    codeLines = [];
  };

  lines.forEach((line, index) => {
    if (line.trim().startsWith("```")) {
      if (isCode) flushCode();
      isCode = !isCode;
      return;
    }
    if (isCode) {
      codeLines.push(line);
      return;
    }
    if (!line.trim()) return;

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = Math.min(3, heading[1].length + 2);
      blocks.push(
        React.createElement(
          `h${level}`,
          { key: `line-${index}` },
          renderInlineMarkdown(React, heading[2], `line-${index}`),
        ),
      );
      return;
    }

    const unordered = /^\s*[-*]\s+(.+)$/.exec(line);
    if (unordered) {
      blocks.push(
        React.createElement(
          "div",
          { key: `line-${index}`, className: "pi-agent-markdown-list-item" },
          React.createElement("span", null, "•"),
          React.createElement("span", null, renderInlineMarkdown(React, unordered[1], `line-${index}`)),
        ),
      );
      return;
    }

    const ordered = /^\s*(\d+)\.\s+(.+)$/.exec(line);
    if (ordered) {
      blocks.push(
        React.createElement(
          "div",
          { key: `line-${index}`, className: "pi-agent-markdown-list-item" },
          React.createElement("span", null, `${ordered[1]}.`),
          React.createElement("span", null, renderInlineMarkdown(React, ordered[2], `line-${index}`)),
        ),
      );
      return;
    }

    const quote = /^>\s+(.+)$/.exec(line);
    if (quote) {
      blocks.push(
        React.createElement(
          "blockquote",
          { key: `line-${index}` },
          renderInlineMarkdown(React, quote[1], `line-${index}`),
        ),
      );
      return;
    }

    blocks.push(
      React.createElement(
        "p",
        { key: `line-${index}` },
        renderInlineMarkdown(React, line, `line-${index}`),
      ),
    );
  });

  if (isCode) flushCode();
  return blocks;
};

const ensureStyles = () => {
  const styleId = "pi-agent-assistant-style";
  if (document.getElementById(styleId)) return;
  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    .pi-agent-shell {
      height: 100%;
      min-height: 0;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      background: #0a0a0a;
      color: #f5f5f5;
      overflow: hidden;
    }
    .pi-agent-topbar {
      min-width: 0;
      border-bottom: 1px solid #262626;
      background: rgba(10, 10, 10, 0.96);
    }
    .pi-agent-topbar-row {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      padding: 10px 14px;
    }
    .pi-agent-title {
      display: flex;
      align-items: center;
      gap: 9px;
      min-width: 0;
      flex: 1;
    }
    .ira-cat {
      display: inline-block;
      width: 74px;
      min-width: 74px;
      margin: 0;
      color: #39c5bb;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
      font-size: 10px;
      line-height: 0.95;
      letter-spacing: 0;
      white-space: pre;
      text-shadow: 0 0 10px rgba(57, 197, 187, 0.34);
      transform-origin: center bottom;
    }
    .ira-cat-label {
      min-width: 0;
      color: #d4d4d4;
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ira-cat--ready {
      animation: ira-cat-breathe 2.4s ease-in-out infinite;
    }
    .ira-cat--running {
      animation: ira-cat-work 0.72s steps(2, end) infinite;
      color: #67e8f9;
    }
    .ira-cat--completed {
      animation: ira-cat-pop 0.9s ease-out 1;
      color: #86efac;
    }
    .ira-cat--failed {
      animation: ira-cat-shake 0.46s steps(2, end) infinite;
      color: #fca5a5;
      text-shadow: 0 0 10px rgba(239, 68, 68, 0.34);
    }
    .ira-cat--cancelled {
      animation: ira-cat-sleep 1.8s ease-in-out infinite;
      color: #a3a3a3;
      opacity: 0.78;
    }
    @keyframes ira-cat-breathe {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-1px); }
    }
    @keyframes ira-cat-work {
      0% { transform: translateY(0) rotate(0deg); }
      50% { transform: translateY(-2px) rotate(-1deg); }
      100% { transform: translateY(0) rotate(1deg); }
    }
    @keyframes ira-cat-pop {
      0% { transform: scale(0.96); filter: brightness(1); }
      45% { transform: scale(1.06); filter: brightness(1.45); }
      100% { transform: scale(1); filter: brightness(1); }
    }
    @keyframes ira-cat-shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-2px); }
      75% { transform: translateX(2px); }
    }
    @keyframes ira-cat-sleep {
      0%, 100% { transform: translateY(0); opacity: 0.68; }
      50% { transform: translateY(1px); opacity: 0.9; }
    }
    .pi-agent-status-inline {
      min-width: 0;
      max-width: 48%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #a3a3a3;
      font-size: 12px;
    }
    .pi-agent-settings-panel {
      border-top: 1px solid #262626;
      padding: 10px 14px 12px;
      background: linear-gradient(180deg, rgba(23, 23, 23, 0.96), rgba(10, 10, 10, 0.98));
    }
    .pi-agent-settings-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 170px), 1fr));
      gap: 9px;
    }
    .pi-agent-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }
    .pi-agent-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      color: #d4d4d4;
      font-size: 12px;
      padding-top: 20px;
    }
    .pi-agent-toggle input {
      width: 14px;
      height: 14px;
      accent-color: #39c5bb;
    }
    .pi-agent-label {
      font-size: 11px;
      color: #a3a3a3;
    }
    .pi-agent-input,
    .pi-agent-textarea {
      width: 100%;
      min-width: 0;
      border: 1px solid #404040;
      border-radius: 8px;
      background: #171717;
      color: #f5f5f5;
      outline: none;
      padding: 6px 9px;
      font-size: 12px;
    }
    .pi-agent-input {
      height: 30px;
    }
    .pi-agent-input:focus,
    .pi-agent-textarea:focus {
      border-color: #39c5bb;
      box-shadow: 0 0 0 2px rgba(57, 197, 187, 0.16);
    }
    .pi-agent-main {
      min-width: 0;
      min-height: 0;
    }
    .pi-agent-scroll {
      height: 100%;
      min-height: 0;
      overflow: auto;
      padding: 18px 20px;
    }
    .pi-agent-message {
      max-width: min(920px, 86%);
      margin: 0 0 12px;
      border: 1px solid #262626;
      border-radius: 8px;
      background: rgba(23, 23, 23, 0.86);
      overflow: hidden;
    }
    .pi-agent-message--user {
      margin-left: auto;
      border-color: rgba(57, 197, 187, 0.45);
      background: rgba(57, 197, 187, 0.08);
    }
    .pi-agent-message--loading {
      border-color: rgba(103, 232, 249, 0.3);
      background: rgba(14, 116, 144, 0.1);
    }
    .pi-agent-message-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      border-bottom: 1px solid #262626;
      padding: 8px 10px;
      color: #a3a3a3;
      font-size: 12px;
    }
    .pi-agent-message-meta {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .pi-agent-message-delete {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      border: 1px solid transparent;
      border-radius: 6px;
      background: transparent;
      color: #737373;
      cursor: pointer;
      font-size: 15px;
      line-height: 1;
    }
    .pi-agent-message-delete:hover {
      border-color: rgba(239, 68, 68, 0.38);
      background: rgba(127, 29, 29, 0.22);
      color: #fca5a5;
    }
    .pi-agent-message-delete:disabled {
      cursor: not-allowed;
      opacity: 0.38;
    }
    .pi-agent-message-body {
      word-break: break-word;
      line-height: 1.6;
      padding: 10px;
      font-size: 13px;
      color: #e5e5e5;
    }
    .pi-agent-message-body--plain {
      white-space: pre-wrap;
    }
    .pi-agent-loading-line {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: #d4d4d4;
    }
    .pi-agent-loading-dots {
      display: inline-flex;
      gap: 4px;
      align-items: center;
      padding-top: 2px;
    }
    .pi-agent-loading-dots span {
      width: 5px;
      height: 5px;
      border-radius: 999px;
      background: #67e8f9;
      opacity: 0.32;
      animation: pi-agent-loading-dot 1s ease-in-out infinite;
    }
    .pi-agent-loading-dots span:nth-child(2) {
      animation-delay: 0.14s;
    }
    .pi-agent-loading-dots span:nth-child(3) {
      animation-delay: 0.28s;
    }
    @keyframes pi-agent-loading-dot {
      0%, 100% { transform: translateY(0); opacity: 0.32; }
      45% { transform: translateY(-3px); opacity: 1; }
    }
    .pi-agent-message-body--markdown p,
    .pi-agent-message-body--markdown h3,
    .pi-agent-message-body--markdown h4,
    .pi-agent-message-body--markdown h5,
    .pi-agent-message-body--markdown blockquote,
    .pi-agent-message-body--markdown pre {
      margin: 0 0 10px;
    }
    .pi-agent-message-body--markdown p:last-child,
    .pi-agent-message-body--markdown h3:last-child,
    .pi-agent-message-body--markdown h4:last-child,
    .pi-agent-message-body--markdown h5:last-child,
    .pi-agent-message-body--markdown blockquote:last-child,
    .pi-agent-message-body--markdown pre:last-child {
      margin-bottom: 0;
    }
    .pi-agent-message-body--markdown a {
      color: #67e8f9;
      text-decoration: none;
      border-bottom: 1px solid rgba(103, 232, 249, 0.38);
    }
    .pi-agent-message-body--markdown a:hover {
      border-bottom-color: #67e8f9;
    }
    .pi-agent-message-body--markdown code {
      border: 1px solid #262626;
      border-radius: 5px;
      background: rgba(38, 38, 38, 0.72);
      padding: 1px 5px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
      font-size: 12px;
    }
    .pi-agent-markdown-code {
      overflow: auto;
      border: 1px solid #262626;
      border-radius: 8px;
      background: rgba(10, 10, 10, 0.58);
      padding: 10px;
    }
    .pi-agent-markdown-code code {
      border: 0;
      background: transparent;
      padding: 0;
    }
    .pi-agent-markdown-list-item {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 8px;
      margin: 0 0 6px;
    }
    .pi-agent-message-body--markdown blockquote {
      border-left: 2px solid #39c5bb;
      padding-left: 10px;
      color: #cbd5e1;
    }
    .pi-agent-markdown-image {
      display: block;
      max-width: min(100%, 520px);
      max-height: 360px;
      margin: 8px 0;
      border: 1px solid #262626;
      border-radius: 8px;
      object-fit: contain;
      background: #050505;
    }
    .pi-agent-markdown-image-wrap {
      display: block;
    }
    .pi-agent-markdown-image-fallback {
      display: none;
      width: fit-content;
      max-width: 100%;
      border: 1px solid rgba(239, 68, 68, 0.48);
      border-radius: 8px;
      background: rgba(127, 29, 29, 0.28);
      color: #fca5a5;
      padding: 8px 10px;
      margin: 8px 0;
      word-break: break-word;
    }
    .pi-agent-markdown-image-wrap.is-error .pi-agent-markdown-image {
      display: none;
    }
    .pi-agent-markdown-image-wrap.is-error .pi-agent-markdown-image-fallback {
      display: inline-flex;
    }
    .pi-agent-empty {
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      text-align: center;
      color: #737373;
    }
    .pi-agent-tools {
      margin-bottom: 16px;
      border-bottom: 1px solid #262626;
      padding-bottom: 12px;
    }
    .pi-agent-tool-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px 12px;
      border: 1px solid #262626;
      border-radius: 8px;
      background: rgba(38, 38, 38, 0.55);
      padding: 8px 10px;
      margin-top: 8px;
      font-size: 12px;
      color: #d4d4d4;
    }
    .pi-agent-tool-debug {
      grid-column: 1 / -1;
      max-height: 260px;
      overflow: auto;
      margin: 2px 0 0;
      border: 1px solid #262626;
      border-radius: 8px;
      background: rgba(10, 10, 10, 0.72);
      padding: 10px;
      color: #a3e635;
      font-size: 11px;
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .pi-agent-compose {
      border-top: 1px solid #262626;
      background: rgba(10, 10, 10, 0.96);
      padding: 12px 14px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px;
    }
    .pi-agent-textarea {
      min-height: 72px;
      resize: vertical;
      line-height: 1.5;
    }
    .pi-agent-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: stretch;
    }
    .pi-agent-button {
      height: 30px;
      min-width: 74px;
      border: 1px solid #404040;
      border-radius: 8px;
      background: #171717;
      color: #f5f5f5;
      font-size: 12px;
      cursor: pointer;
      padding: 0 10px;
    }
    .pi-agent-button:hover {
      border-color: #39c5bb;
    }
    .pi-agent-button:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }
    .pi-agent-button--primary {
      border-color: #39c5bb;
      background: #39c5bb;
      color: #050505;
      font-weight: 600;
    }
    .pi-agent-button--danger {
      border-color: rgba(239, 68, 68, 0.7);
      color: #fca5a5;
      background: rgba(127, 29, 29, 0.35);
    }
    .pi-agent-status {
      border: 1px solid #262626;
      border-radius: 8px;
      padding: 10px;
      color: #a3a3a3;
      font-size: 12px;
      line-height: 1.5;
      background: rgba(23, 23, 23, 0.7);
    }
    @media (max-width: 760px) {
      .pi-agent-status-inline {
        max-width: 34%;
      }
      .pi-agent-message {
        max-width: 100%;
      }
      .pi-agent-compose {
        grid-template-columns: 1fr;
      }
      .pi-agent-actions {
        flex-direction: row;
      }
      .ira-cat-label {
        display: none;
      }
    }
  `;
  document.head.appendChild(style);
};

export const ui = ({ context, plugin }) => {
  const { hooks, actions } = context;
  const { useEffect, useRef, useState } = React;
  const { t } = hooks.useT();

  ensureStyles();

  const [settings, setSettings] = useState(loadSettings);
  const [conversation, setConversation] = useState(loadConversation);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState({ key: "command.piAgentAssistant.status.ready" });
  const [isRunning, setIsRunning] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [toolEvents, setToolEvents] = useState([]);
  const [runningToolCallIds, setRunningToolCallIds] = useState([]);
  const taskRef = useRef({ taskId: "", cursor: 0, cancelled: false });
  const settingsRef = useRef(settings);
  const conversationRef = useRef(conversation);
  const draftTextRef = useRef("");
  const scrollRef = useRef(null);

  const writeSettings = (patch) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    saveSettings(next);
    setSettings(next);
  };

  const writeConversation = (next) => {
    conversationRef.current = next;
    saveConversation(next);
    setConversation(next);
  };

  const appendToolEvent = (event) => {
    const turnId = taskRef.current.turnId || "";
    if (event.type === "tool_execution_start" && event.toolCallId) {
      setRunningToolCallIds((ids) =>
        ids.includes(event.toolCallId) ? ids : [...ids, event.toolCallId],
      );
    }
    if (event.type === "tool_execution_end" && event.toolCallId) {
      setRunningToolCallIds((ids) => ids.filter((id) => id !== event.toolCallId));
    }
    setToolEvents((items) => [...items.slice(-20), { ...event, turnId }]);
  };

  const setDraft = (value) => {
    if (typeof value === "function") {
      setDraftText((current) => {
        const next = value(current);
        draftTextRef.current = next;
        return next;
      });
      return;
    }
    draftTextRef.current = value;
    setDraftText(value);
  };

  const notifyImportedPlugin = () => {
    actions.globalActions.pushToast(
      { key: "toast.command.piAgentAssistant.imported" },
      "success",
    );
    appendToolEvent({ type: "imported", toolName: t("command.piAgentAssistant.imported") });
  };

  const persistAssistantFailure = (message) => {
    const text = draftTextRef.current.trim() || message;
    if (!text) return;
    const nextMessages = [
      ...conversationRef.current.messages,
      {
        role: "assistant",
        content: text,
        timestamp: Date.now(),
        turnId: taskRef.current.turnId,
        stopReason: "error",
        errorMessage: message,
      },
    ];
    writeConversation({ messages: nextMessages });
  };

  const consumeEvents = async (entries) => {
    for (const entry of entries) {
      const event = entry.event;
      if (event.type === "message_update" && event.delta) {
        setDraft((value) => `${value}${event.delta}`);
      }
      if (event.type === "message_start" && event.role === "assistant") {
        setDraft("");
      }
      if (event.type === "tool_execution_start" || event.type === "tool_execution_end") {
        appendToolEvent(event);
      }
      if (isImportedPluginEvent(event)) {
        notifyImportedPlugin();
      }
    }
  };

  const pollTask = async (taskId) => {
    while (!taskRef.current.cancelled) {
      const payload = await plugin.invoke("pollTurn", {
        taskId,
        cursor: taskRef.current.cursor,
      });
      taskRef.current.cursor = payload.cursor;
      await consumeEvents(payload.events || []);

      if (payload.status === "completed") {
        const nextMessages = attachTurnIdToLatestUserMessage(
          payload.result?.messages || conversationRef.current.messages,
          taskRef.current.turnId,
        );
        writeConversation({ messages: nextMessages });
        setDraft("");
        const assistantError = getLastAssistantError(nextMessages);
        if (assistantError) {
          setStatus({
            key: "command.piAgentAssistant.status.failed",
            params: { error: assistantError },
          });
        } else {
          setStatus({ key: "command.piAgentAssistant.status.completed" });
        }
        setIsRunning(false);
        setRunningToolCallIds([]);
        return;
      }
      if (payload.status === "failed") {
        throw new Error(payload.error || t("command.piAgentAssistant.error.agentFailed"));
      }
      if (payload.status === "cancelled") {
        setStatus({ key: "command.piAgentAssistant.status.cancelled" });
        setIsRunning(false);
        setRunningToolCallIds([]);
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  };

  const handleSend = async () => {
    const prompt = input.trim();
    if (!prompt || isRunning) return;
    try {
      const turnId = createTurnId();
      setInput("");
      setIsRunning(true);
      setDraft("");
      setRunningToolCallIds([]);
      setStatus({ key: "command.piAgentAssistant.status.running" });
      taskRef.current = { taskId: "", cursor: 0, cancelled: false, turnId };
      const optimistic = {
        messages: [
          ...conversationRef.current.messages,
          { role: "user", content: prompt, timestamp: Date.now(), turnId },
        ],
      };
      writeConversation(optimistic);
      const started = await plugin.invoke("startTurn", {
        settings: settingsRef.current,
        messages: conversationRef.current.messages.slice(0, -1),
        prompt,
      });
      taskRef.current = { taskId: started.taskId, cursor: 0, cancelled: false, turnId };
      await pollTask(started.taskId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      persistAssistantFailure(message);
      setDraft("");
      setStatus({
        key: "command.piAgentAssistant.status.failed",
        params: { error: message },
      });
      setIsRunning(false);
      setRunningToolCallIds([]);
      actions.globalActions.pushToast(
        { key: "toast.command.piAgentAssistant.failed", params: { error: message } },
        "error",
      );
    }
  };

  const handleCancel = async () => {
    const taskId = taskRef.current.taskId;
    taskRef.current.cancelled = true;
    if (taskId) await plugin.invoke("cancelTurn", { taskId });
    setIsRunning(false);
    setRunningToolCallIds([]);
    setStatus({ key: "command.piAgentAssistant.status.cancelled" });
  };

  const handleClear = () => {
    const next = { messages: [] };
    writeConversation(next);
    setDraft("");
    setToolEvents([]);
    setRunningToolCallIds([]);
    actions.globalActions.pushToast(
      { key: "toast.command.piAgentAssistant.cleared" },
      "success",
    );
  };

  const handleDeleteMessage = (index) => {
    if (isRunning) return;
    const target = conversationRef.current.messages[index];
    if (!target) return;
    const nextMessages = conversationRef.current.messages.filter((_, itemIndex) => itemIndex !== index);
    writeConversation({ messages: nextMessages });
    if (target.turnId) {
      setToolEvents((items) => items.filter((event) => event.turnId !== target.turnId));
    }
  };

  const handleInputKeyDown = (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void handleSend();
    }
  };

  const messages = conversation.messages || [];
  const statusText = t(status.key, status.params);
  const iraState = getIraState(status.key);
  const showLoadingMessage = isRunning && (!draftText || runningToolCallIds.length > 0);
  const renderToolEvents = (turnId) => {
    const events = toolEvents.filter((event) => event.turnId && event.turnId === turnId);
    if (events.length === 0) return null;
    return (
      <section className="pi-agent-tools">
        <div className="pi-agent-label">{t("command.piAgentAssistant.tools")}</div>
        {events.map((event, index) => {
          const debugText = settings.debug === true ? getToolEventDebugText(event) : "";
          return (
            <div className="pi-agent-tool-row" key={`${event.type}-${event.toolCallId || index}`}>
              <span>{event.toolName || t("command.piAgentAssistant.tool")}</span>
              <span>{getToolEventText(event, t)}</span>
              {debugText ? <pre className="pi-agent-tool-debug">{debugText}</pre> : null}
            </div>
          );
        })}
      </section>
    );
  };

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return undefined;
    const frame = requestAnimationFrame(() => {
      node.scrollTop = node.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [
    messages.length,
    draftText,
    toolEvents.length,
    status.key,
    isRunning,
    runningToolCallIds.length,
  ]);

  return (
    <div className="pi-agent-shell">
      <header className="pi-agent-topbar">
        <div className="pi-agent-topbar-row">
          <div className="pi-agent-title">
            <pre className={`ira-cat ira-cat--${iraState}`} aria-label={t("command.piAgentAssistant.title")}>
              {getIraCat(iraState)}
            </pre>
          </div>
          <div className="pi-agent-status-inline">{statusText}</div>
          <button
            type="button"
            className="pi-agent-button"
            onClick={() => setIsSettingsOpen((value) => !value)}
          >
            {isSettingsOpen
              ? t("command.piAgentAssistant.hideSettings")
              : t("command.piAgentAssistant.settings")}
          </button>
          <button
            type="button"
            className="pi-agent-button pi-agent-button--danger"
            onClick={handleClear}
            disabled={isRunning}
          >
            {t("command.piAgentAssistant.clear")}
          </button>
        </div>
        {isSettingsOpen ? (
          <div className="pi-agent-settings-panel">
            <div className="pi-agent-settings-grid">
              <label className="pi-agent-field">
                <span className="pi-agent-label">{t("command.piAgentAssistant.baseUrl")}</span>
                <input
                  className="pi-agent-input"
                  value={settings.baseUrl}
                  onChange={(event) => writeSettings({ baseUrl: event.target.value })}
                />
              </label>
              <label className="pi-agent-field">
                <span className="pi-agent-label">{t("command.piAgentAssistant.apiKey")}</span>
                <input
                  className="pi-agent-input"
                  type="password"
                  value={settings.apiKey}
                  onChange={(event) => writeSettings({ apiKey: event.target.value })}
                />
              </label>
              <label className="pi-agent-field">
                <span className="pi-agent-label">{t("command.piAgentAssistant.model")}</span>
                <input
                  className="pi-agent-input"
                  value={settings.model}
                  onChange={(event) => writeSettings({ model: event.target.value })}
                />
              </label>
              <label className="pi-agent-toggle">
                <input
                  type="checkbox"
                  checked={settings.debug === true}
                  onChange={(event) => writeSettings({ debug: event.target.checked })}
                />
                <span>{t("command.piAgentAssistant.debug")}</span>
              </label>
            </div>
          </div>
        ) : null}
      </header>

      <main className="pi-agent-main">
        <div className="pi-agent-scroll" ref={scrollRef}>
          {messages.length === 0 && !draftText && !showLoadingMessage ? (
            <div className="pi-agent-empty">
              <div>{t("command.piAgentAssistant.empty")}</div>
              <div>{t("command.piAgentAssistant.emptyHint")}</div>
            </div>
          ) : (
            <>
              {messages.map((message, index) => {
                const role = String(message.role || "");
                const text = getMessageText(message);
                if (!text && role !== "user") return null;
                const stopReason = message.stopReason ? String(message.stopReason) : "";
                return (
                  <React.Fragment key={`${role}-${message.timestamp || index}-${index}`}>
                    <article
                      className={`pi-agent-message ${role === "user" ? "pi-agent-message--user" : ""}`}
                    >
                      <div className="pi-agent-message-head">
                        <span>{t(getRoleKey(role))}</span>
                        <span className="pi-agent-message-meta">
                          {stopReason ? <span>{stopReason}</span> : null}
                          <button
                            type="button"
                            className="pi-agent-message-delete"
                            onClick={() => handleDeleteMessage(index)}
                            disabled={isRunning}
                            title={t("command.piAgentAssistant.deleteMessage")}
                            aria-label={t("command.piAgentAssistant.deleteMessage")}
                          >
                            ×
                          </button>
                        </span>
                      </div>
                      <div
                        className={`pi-agent-message-body ${
                          role === "assistant"
                            ? "pi-agent-message-body--markdown"
                            : "pi-agent-message-body--plain"
                        }`}
                      >
                        {role === "assistant" ? renderMarkdown(React, text) : text}
                      </div>
                    </article>
                    {role === "user" ? renderToolEvents(message.turnId) : null}
                  </React.Fragment>
                );
              })}
              {draftText ? (
                <article className="pi-agent-message">
                  <div className="pi-agent-message-head">
                    <span>{t("command.piAgentAssistant.assistant")}</span>
                  </div>
                  <div className="pi-agent-message-body pi-agent-message-body--markdown">
                    {renderMarkdown(React, draftText)}
                  </div>
                </article>
              ) : null}
              {showLoadingMessage ? (
                <article className="pi-agent-message pi-agent-message--loading">
                  <div className="pi-agent-message-head">
                    <span>{t("command.piAgentAssistant.assistant")}</span>
                  </div>
                  <div className="pi-agent-message-body">
                    <span className="pi-agent-loading-line">
                      {t("command.piAgentAssistant.thinking")}
                      <span className="pi-agent-loading-dots" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                      </span>
                    </span>
                  </div>
                </article>
              ) : null}
            </>
          )}
        </div>
      </main>

      <div className="pi-agent-compose">
        <textarea
          className="pi-agent-textarea"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder={t("command.piAgentAssistant.placeholder")}
          disabled={isRunning}
        />
        <div className="pi-agent-actions">
          <button
            type="button"
            className="pi-agent-button pi-agent-button--primary"
            onClick={() => void handleSend()}
            disabled={isRunning || !input.trim()}
          >
            {t("command.piAgentAssistant.send")}
          </button>
          <button
            type="button"
            className="pi-agent-button"
            onClick={() => void handleCancel()}
            disabled={!isRunning}
          >
            {t("command.piAgentAssistant.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
};
