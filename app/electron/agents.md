# Electron Directory Agents

本目录包含 Electron 主进程相关代码。

## 职责
- **Main Process (`main.ts`)**: 
    - 创建和管理应用窗口 (`BrowserWindow`)。
    - 启动本地 Express 服务器 (`startServer`)。
    - 处理 IPC 通信（窗口控制、总是置顶、透明模式、存储目录选择等）。
    - **启动流程**: 优先加载渲染进程窗口，随即启动 API 服务。
    - **快捷键**: 仅保留全局快捷键用于隐藏/展示主窗口与穿透开关，其余应用内快捷键由渲染进程统一管理。
    - **Canvas 资源**: 临时图片由后端存放在各 Canvas 的 `assets` 子目录中。
- **Preload Script (`preload.ts`)**: 
    - 作为主进程和渲染进程之间的桥梁。
    - 通过 `contextBridge` 安全地暴露部分 API 给渲染进程。
    - 提供 `openExternal` 能力。
- **日志系统**: 
    - 使用 `electron-log` 记录应用运行时的关键信息和错误。

## 构建
- 使用 `tsup` 编译为 CommonJS 格式输出到 `dist-electron` 目录。
