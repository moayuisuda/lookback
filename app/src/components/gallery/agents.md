# Gallery Components Agents

本目录包含 Gallery 相关的组件拆分，主要负责图片卡片、右键菜单、搜索头部与空状态等 UI/交互。

## 文件索引
- `GalleryItem.tsx`: 单个图片卡片渲染与交互入口（Hover、Tag 展示等）。
- `GalleryHeader.tsx`: 搜索/过滤相关的头部 UI。
- `GalleryContextMenu.tsx`: 自定义右键菜单（名称编辑、Tag 编辑、主体色编辑、外链打开等）。
- `EmptyState.tsx`: 空图库引导与导入提示。
- `DragOverlayItem.tsx`: 拖拽排序/拖拽态的 Overlay 渲染。
- `ColorInput.tsx`: 颜色输入与展示辅助组件。
- `SortableTag.tsx`: Tag 的拖拽排序渲染单元。
- `Swatch.tsx`: 色板渲染（与全局色板/颜色选择器配合使用）。

## i18n 约束
- 本目录所有展示文本均通过 i18n key 翻译，不直接在组件中保留展示用英文/中文常量。
