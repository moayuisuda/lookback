# Server Directory Agents

本目录包含应用的“后端”代码（本地 API 服务），由 Electron 主进程启动。

## 职责
- **Local API (`server.ts`)**
  - 启动本地 Express 服务（默认端口 `30001`），为前端与插件提供 REST API。
  - 提供 settings 聚合接口 `/settings`。
  - 管理 Canvas 数据存储。
  - Canvas 临时图片存放在 `canvases/<name>/assets`，通过 `/api/assets/:canvasName/:filename` 提供访问。
  - 临时图片上传与下载时会计算 dominant color 与 tone，并回传给前端。
  - 启动时清理画布中无效的 `assets` 引用并删除未被引用的文件。
  - 启动时将内置命令脚本写入 storage 的 `commands` 目录。
  - 提供命令脚本 API（列出、读取、删除），所有文件操作使用 `fileLock` 防并发。
  - **并发控制**：通过 `fileLock.ts` 的 `KeyedMutex`/`lockedFs` 将本地文件读写串行化。
- **Image Analysis (`imageAnalysis.ts`)**
  - 计算 dominant color 与 tone 时忽略透明像素。
