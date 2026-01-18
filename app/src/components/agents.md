# Components Directory Agents

本目录包含 React 组件实现，专注于 UI 与交互逻辑。

## 组件职责
- `Gallery.tsx`: 图片瀑布流、搜索与右键菜单（Tag 管理、dominantColor 展示/编辑、颜色过滤与颜色选择器）。
    - **排序**: 支持直接拖拽图片进行排序（移除独立拖拽图标），排序仅在无搜索词时可用。
    - **交互**: 支持拖拽文件导入，并统一将剪贴板图片/文件粘贴导入到 Gallery。
    - **搜索**: 支持多 Tag 严格匹配与 Tag + 自然语言混合搜索（先返回快速结果，再异步回传向量检索结果覆盖），Tag 会回显在搜索框中且可移除。
    - **名称**: meta 包含 `name`，右键菜单可修改，搜索时会联合匹配；卡片左上角常驻展示名称。
    - **组件拆分**: 图片卡片（包含悬浮放大、Tag 气泡与“Show in Folder”等交互）提取为独立的 `GalleryItem.tsx` 组件，Gallery 本身只负责布局与数据流转。卡片左上角展示排序索引与搜索分数（如有）。
    - **右键菜单**: 菜单 UI 抽为独立组件，Tag 输入与建议列表逻辑内聚在菜单内部。
    - **主体色编辑**: 右键菜单展示主体色，弹出颜色选择器并支持一键清空，修改即保存。
    - **色板复用**: Tag 颜色、搜索颜色与主体色共用一套全局色板，支持长按色板将其替换为当前颜色。
    - **Tag 排序**: Tag 列表支持换行（flex-wrap），并使用 DragOverlay + 原位占位避免 dropend 闪动。
    - **复用**: DragOverlay 渲染抽象为通用容器，避免重复 JSX。
    - **优化**: 修复了拖拽时的类型转换问题，增加了搜索状态下的排序保护。
    - **空状态**: 当图库为空时，通过 `gallery/EmptyState.tsx` 展示引导卡片（支持拖拽导入）。
- `EnvInitModal.tsx`: 全局环境初始化弹窗，仅展示 UV/Python 运行时准备进度（阻塞性前置步骤），通过 Valtio 状态与 IPC `env-init-progress` 驱动。
- `Tag.tsx`: 通用标签组件，支持显示、编辑模式（删除/颜色设置）；颜色圆点单一实现并可通过 `showColor` 控制显示。编辑模式下，操作按钮默认折叠（w-0），Hover 时展开，保持界面整洁。
- `Canvas.tsx`: Konva 画布交互（选择/框选/多选/拖拽/缩放/旋转/翻转/删除/撤销/平移）。
    - **文本支持**: 双击画布空白处创建文本节点，支持双击文本节点进行行内编辑（Textarea Overlay）。
    - **文本交互**: 文本节点支持左右缩放（调整宽度，无旋转），支持拖拽移动、删除与撤销重做。
    - **文本编辑体验**: 输入框挂载在 Canvas 容器内避免遮住旁侧 UI；输入时 Overlay 会随内容自动扩展宽高并实时写回节点尺寸；删除按钮渲染在选框之上并在拖拽中用 Konva ref 实时跟随。
    - **交互优化**:
        - **操作模式**: 空格按下显示抓手，空格 + 鼠标拖拽平移画布；右键拖拽平移画布；左键拖动进行框选（Box Selection），支持 Shift/Ctrl 多选。
        - **选择逻辑**: 优化了点击与拖拽的交互冲突，仅在点击（Click）或开始拖拽对象（DragStart）时触发选择，防止拖动状态下的误触。
        - **焦点反馈**: 激活时显示 Theme Brand Color 边框高亮。
    - **Pin 透明**: 当 `pinMode + pinTransparent` 打开时，Canvas 容器背景为透明，利用 Electron 透明窗口展示桌面背景。
    - **工具栏**: 顶部左侧悬浮工具栏组件（`canvas/CanvasToolbar.tsx`），承载 Grayscale / Auto Layout / Minimap / Clear 按钮。支持向右折叠/展开（带动画），折叠状态持久化。
    - **小地图**: 集成 `Minimap.tsx` 组件，提供全局预览与快速导航。
    - **功能**: 支持拖拽导入（含临时上传）、数据持久化。
    - **层级管理**: 点击图片自动置顶 (Bring to Front)。
    - **性能优化**: 拖拽移动时使用 Transient Update（不立即提交历史记录），拖拽结束时才提交，避免历史记录膨胀。
    - **多选结构**: 多选包围框与批量删除按钮抽象为 `canvas/MultiSelectOverlay.tsx`，框选矩形抽象为 `canvas/SelectionRect.tsx`，画布组件只关心选中集合与几何信息。
    - **撤销/重做**: 支持 Ctrl+Z (Undo) 和 Ctrl+Shift+Z (Redo)。
- `Minimap.tsx`: 画布右下角小地图组件。
    - **实时同步**: 视口信息通过全局 `canvasViewport` 管理，Canvas 所有缩放/平移/autolayout 更新同一数据源。
    - **可视化**: 等比例缩放渲染所有画布元素（灰色块）与当前视口（圆角高亮框）。
    - **交互**: 支持在小地图内点击与拖动，推动主画布视口平滑移动。
    - 状态隔离: 仅依赖 Valtio 状态与 Stage 引用，不反向影响 Canvas 渲染结构。
- `TitleBar.tsx`: 窗口标题栏与 Pin 模式入口；Setting 面板内展示后台任务进度（模型下载与批量索引），通过 IPC `model-download-progress` 与 `indexing-progress` 驱动。
        - **UI**: 品牌色文本统一引用 `theme/index.ts`。
        - 设置中包含“存储目录”配置项，通过 IPC 调用主进程选择/更新图片根目录（`lookback_config.json`），前端使用最新根目录拼接本地访问路径。
        - **搜索配置**: 支持开启/关闭 AI 向量搜索，并可调节向量搜索阈值（0.15 - 0.25，默认 0.19）。
        - **窗口配置**: 提供 Pin Transparent 开关，控制 Pin 模式下 Canvas 是否透明（值持久化到 settings）。
        - **i18n**: Setting 面板提供语言切换入口（EN/中文）；渲染层所有可见文案均通过 i18n key 翻译（Toast/进度/弹窗等只在 state 与 IPC 中传递 key+params）。
- `ToggleSwitch.tsx`: 通用开关组件（用于 Setting 面板等场景，checked 时使用主题色）。
- `ShortcutInput.tsx`: 快捷键录制输入组件（捕获按键组合并生成 Electron accelerator 字符串）。
