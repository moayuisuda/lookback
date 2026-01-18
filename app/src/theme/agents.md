# Theme Directory Agents

本目录包含应用的主题配置与常量定义。

## 职责
- **Theme Constants (`index.ts`)**: Manage all color variables, including:
    - `primary`: Core brand color (Teal #39c5bb).
    - `secondary`: Secondary brand color, primarily for hover states (Darker Teal #2d9d95).
    - `canvas`: Selection stroke, fill, and control colors specific to the canvas.
    - `gallery`: 选中环颜色与不透明度。
    - `ui`: 通用 UI 颜色（Resize Handle Hover, Active Text, Brand Text, Danger）。
    - `tag`: 默认标签颜色。
    - `swatches`: 颜色选择器的默认色板。
- **工具函数**:
    - `hexToRgba`: 将 Hex 颜色转换为带透明度的 RGBA 字符串。

## 设计原则
- **Single Source of Truth**: 所有硬编码颜色应提取至此，禁止在组件中直接使用 Hex 值。
- **可定制性**: 为未来支持多主题或用户自定义主题预留结构。
- **类型安全**: 使用 `as const` 确保类型推断准确。
