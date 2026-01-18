# components/canvas

本目录包含 Canvas 子组件（工具栏、小地图、选框、图片/文本节点等），用于将画布交互拆分为高内聚的可复用模块。

## 文件索引
- `CanvasToolbar.tsx`: 画布左上角工具栏（Grayscale / Smart Layout / Minimap / Clear 等入口与折叠状态）。
- `Minimap.tsx`: 右下角小地图（渲染 viewport 与元素缩略图，支持拖动/点击导航）。
- `CanvasImage.tsx`: 画布图片节点（拖拽、选中、变换、显示控制点等）。
- `Text.tsx`: 画布文本节点与编辑 overlay。
- `SelectionRect.tsx`: 框选矩形与选择框几何计算展示。
- `MultiSelectOverlay.tsx`: 多选包围框与批量操作入口。
- `CanvasButton.tsx`: 画布浮层按钮通用样式与交互封装。
