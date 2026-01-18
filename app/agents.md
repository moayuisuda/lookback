# App Directory Agents

本目录包含 Electron 应用的主体代码。

## 职责
- 管理 Electron 主进程与渲染进程的构建与运行。
- 包含前端 React 应用源码。
- 处理本地文件系统操作（图片存储、配置管理、向量索引）。

## 核心文件
- `package.json`: 定义了项目的依赖和脚本，特别是 `concurrently` 用于同时运行 Electron 构建和 Vite 服务。
- `vite.config.ts`: Vite 配置文件，集成了 React 和 TailwindCSS。
- `tsconfig.json`: TypeScript 配置文件。
- `electron/main.ts`: Electron 主进程入口，创建窗口、启动本地 API 服务，并提供 Pin 模式与存储目录选择的 IPC。
- `backend/server.ts`: 本地 Express API 服务，负责图片/元数据存储、检索与向量索引等后端逻辑。
- `src/components/TitleBar.tsx`: 标题栏与设置入口，包括存储目录选择和「Index unindexed images」操作入口。
 
## 存储结构
- storage 根目录下的关键子目录：`images/`、`meta/`、`model/`（模型与数据同一根目录，便于打包后的可移植与重置）
