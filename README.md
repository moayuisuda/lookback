# LookBack 专业图片参考器

面向美术人士的专业图片收集与参考工具，类似于 PureRef，但集成了浏览器采集功能。

## 功能特性

*   **浏览器采集插件**：在网页图片上右键，一键收藏到本地。
*   **本地瀑布流图库**：所有收藏的图片以瀑布流形式展示，支持 Tag 搜索。
*   **无限画布 (Canvas)**：类似 PureRef 的操作体验。
    *   从左侧图库拖拽图片到画布。
    *   支持图片拖拽移动、缩放 (滚轮)、删除 (选中后按 Delete)。
*   **窗口控制**：
    *   **Always on Top**: 点击标题栏 Pin 图标，保持窗口置顶。
    *   **Ghost Mode**: 点击标题栏幽灵图标，半透明显示，方便临摹。

## 安装与运行

### 1. 启动本地应用 (Electron)

确保已安装 Node.js。

```bash
cd app
npm install
npm run dev
```

应用启动后，会运行在 `localhost:30001` 监听来自插件的请求。

### 2. 安装浏览器插件

1.  打开 Chrome/Edge 浏览器，进入扩展程序管理页面 (`chrome://extensions`)。
2.  开启右上角的 **开发者模式**。
3.  点击 **加载已解压的扩展程序**。
4.  选择本项目下的 `extension` 目录。

## 使用说明

1.  启动 Electron 应用。
2.  在浏览器中浏览图片网站（如 Pinterest, ArtStation）。
3.  在喜欢的图片上右键 -> **Collect to LookBack**。
4.  回到 LookBack 应用，图片会自动出现在左侧列表。
5.  将图片拖入右侧画布，自由排版。

## 技术栈

*   **Electron**: 桌面应用框架
*   **React + Vite**: 前端 UI
*   **TailwindCSS**: 样式
*   **Konva (react-konva)**: 高性能 Canvas 渲染
*   **Valtio**: 状态管理
*   **Express**: 本地通信服务器
