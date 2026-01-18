## 目标范围
- 前端：所有静态文案（按钮/标题/placeholder/tooltip/空状态/确认弹窗/设置项/右键菜单等）支持英文/中文切换。
- 后端/主进程：所有发到前端的 toast、初始化/下载/索引等进度文案、以及 Electron 原生 dialog 文案。
- 持久化：语言设置走现有 settings 存储链路（本地文件），不使用 localStorage。
- 约束：不做任何“兼容逻辑”（不支持旧结构/旧协议/旧状态字段），改造后所有文案必须来自 i18n。

## “常量”怎么处理（你问的重点）
- 原则：
  - 非展示用常量（如数值、key、枚举 code）保持不变。
  - 展示用常量（任何会显示给用户的字符串）一律变成 i18n key（可带 params），并且“不把翻译后的字符串存进 state”。
- 具体落地方式：
  - 组件内常量：`const items = [{ labelKey: 'settings.language', value: '...' }]`，渲染时 `t(labelKey)`。
  - Store 内默认文案（如 `envInitState.status = 'Preparing...'`）：改成 `statusKey: 'envInit.preparing'`；UI 层用 `t(statusKey)`。
  - IPC/后端进度状态（如 `sendProgress('Checking uv...')`）：不发送字符串，发送 `statusKey`/`statusParams`。
  - 原生 dialog（`dialog.showMessageBox` 的 title/message/detail）：同样用 `t(locale, key)` 生成。

## 现状调研结论（关键落点）
- 入口与渲染：前端 [main.tsx](file:///Users/anhaohui/Documents/stocks/RroRef/app/src/main.tsx)；toast 渲染在 [App.tsx](file:///Users/anhaohui/Documents/stocks/RroRef/app/src/App.tsx)；toast/state 在 [globalStore.ts](file:///Users/anhaohui/Documents/stocks/RroRef/app/src/store/globalStore.ts)。
- 后端 IPC toast：当前已存在 `sendToRenderer('toast', ...)`（Youdao 翻译 warning）：[server.ts](file:///Users/anhaohui/Documents/stocks/RroRef/app/backend/server.ts#L2097-L2111)
- 主进程进度/弹窗：`env-init-progress` 与 `dialog.showMessageBox` 中有大量字符串常量：[electron/main.ts](file:///Users/anhaohui/Documents/stocks/RroRef/app/electron/main.ts#L550-L606)

## 技术方案（共享字典，前端/后端/主进程共用）
- 新增共享 i18n 目录（让 `electron/*`、`backend/*`、`src/*` 都能 import）：
  - `app/shared/i18n/`：
    - `locales/en.ts`、`locales/zh.ts`
    - `types.ts`：`Locale`、`I18nKey` 从 `en` 推导；并用 TS 约束 `zh` 必须覆盖所有 key（避免运行时缺 key）。
    - `t.ts`：`t(locale, key, params?)`，插值 `{{param}}`。
    - `agents.md`：目录概览与文件索引（按你们规则）。
- 前端侧状态：
  - `app/src/store/i18nStore.ts`（valtio）：`locale` + `hydrate()`/`setLocale()`。
  - 语言持久化走 `fileStorage.get/set('language')`（封装到 [service.ts](file:///Users/anhaohui/Documents/stocks/RroRef/app/src/service.ts) 新增 `getLanguage/setLanguage`）。
  - `app/src/i18n/useT.ts`：hook 内 `useSnapshot(i18nState)`，渲染期翻译。

## Toast/错误国际化（严格迁移、无兼容）
- Toast 结构只允许 i18n descriptor：
  - `Toast.message: { key: I18nKey; params?: Record<string, string|number> }`
  - `globalActions.pushToast()` 只接受 descriptor；全仓库所有旧 `pushToast('...')` 一次性改完。
- IPC `toast` 协议也只允许 `{ key, params?, type }`：
  - 后端 `sendToRenderer('toast', ...)` 改成发 key。
  - 前端 `onToast` 只解析新结构（不做旧结构分支）。
- 全局错误（[main.tsx](file:///Users/anhaohui/Documents/stocks/RroRef/app/src/main.tsx)）使用固定 key（`toast.globalError`/`toast.unhandledRejection`），把 error 文本作为 params。

## 进度/状态字段国际化（处理“字符串常量”在 state 与 IPC 里的问题）
- 前端 store：
  - `envInitState.status`/`indexingState.status`/`modelProgressState.status` 等展示字段改为 `statusKey` + `statusParams`。
- 主进程/后端：
  - `env-init-progress`、`model-download-progress`、`indexing-progress` 等事件 payload 同步改为发送 `statusKey/statusParams`（不再发字符串）。
  - Electron 原生 dialog 的文案改为读取当前语言后 `t(locale, ...)`。
  - 语言读取方式：主进程从 settings.json 读取 `language`（与 enableVectorSearch 同一文件）并做缓存/按需刷新。

## 静态文案替换策略（按模块推进，但每个模块内一次性迁完）
- 先建立 key 体系：`common.*`、`settings.*`、`toast.*`、`envInit.*`、`model.*`、`indexing.*`、`gallery.*`、`canvas.*`、`errors.*`。
- 优先改密集入口：
  1) [TitleBar.tsx](file:///Users/anhaohui/Documents/stocks/RroRef/app/src/components/TitleBar.tsx)：Setting 弹层新增 Language 选项（EN/中文），所有 Setting 文案迁移。
  2) [ErrorBoundary.tsx](file:///Users/anhaohui/Documents/stocks/RroRef/app/src/components/ErrorBoundary.tsx) / [ErrorDisplay.tsx](file:///Users/anhaohui/Documents/stocks/RroRef/app/src/components/ErrorDisplay.tsx)：错误页全部迁移。
  3) Gallery/菜单/搜索栏/右键菜单等：逐文件把常量 label/placeholder/title 迁成 key。

## 验证方式（不跑 build）
- `npm run dev`：
  - 切换语言后：Setting 面板、ErrorDisplay、Gallery 常用入口、toast/进度状态即时切换。
  - 触发全局错误与 Promise rejection：toast 翻译正确。
  - 触发 env-init 进度：进度文本使用 key 翻译。
  - 触发后端翻译 warning：后端发 key，前端翻译。

## 交付物
- 共享 i18n 字典与 `t()`（前端/后端/主进程共用）。
- 语言设置持久化 + UI 切换入口。
- 全仓库强制迁移：所有展示用字符串常量变 i18n key（含 toast、进度、dialog）。