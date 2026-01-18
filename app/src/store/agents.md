# Store Directory Agents

本目录包含全局 Valtio 状态与动作封装，作为渲染层的单一数据源。

## 文件索引
- `globalStore.ts`: 全局 UI 状态（toast、pinMode、pinTransparent、toggleWindowShortcut、侧边栏宽度、进度状态等）与持久化设置（基于 `service.ts` 的 settings 存储链路）。
- `galleryStore.ts`: 图库数据与搜索/过滤/排序相关状态。
- `canvasStore.ts`: 画布数据、选择态、viewport 与历史记录相关状态。
- `i18nStore.ts`: 语言状态（`locale`）与 hydrate/setLocale（通过 settings 持久化）。
