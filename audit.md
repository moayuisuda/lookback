# LookBack 代码审计

## 范围
- app 渲染进程、Electron 主进程、本地 API 后端
- extension 浏览器插件
- 已提交的构建产物

## 冗余点
- Settings 接口重复：同时存在 /settings 与 /api/settings，且前端 `getSettingsSnapshot` 使用 /settings，而其他调用使用 /api/settings，造成重复维护与调用路径分裂。[settings.ts](file:///E:/responsities/lookback%20-%20%E5%89%AF%E6%9C%AC/app/backend/routes/settings.ts#L11-L29) [service.ts](file:///E:/responsities/lookback%20-%20%E5%89%AF%E6%9C%AC/app/src/service.ts#L14-L34)
- 构建产物被提交：`dist-electron` 与 `dist-renderer` 已在仓库中，且 `.gitignore` 仅忽略 `dist`，容易形成源代码与产物双轨、导致发布内容与源码不一致。[.gitignore](file:///E:/responsities/lookback%20-%20%E5%89%AF%E6%9C%AC/app/.gitignore#L10-L13) [main.cjs](file:///E:/responsities/lookback%20-%20%E5%89%AF%E6%9C%AC/app/dist-electron/main.cjs) [index.html](file:///E:/responsities/lookback%20-%20%E5%89%AF%E6%9C%AC/app/dist-renderer/index.html)
- 语言读取逻辑重复：Electron 主进程直接读 settings.json，渲染进程通过 API 读取语言设置，双份实现容易产生不一致与维护开销。[main.ts](file:///E:/responsities/lookback%20-%20%E5%89%AF%E6%9C%AC/app/electron/main.ts#L82-L104) [service.ts](file:///E:/responsities/lookback%20-%20%E5%89%AF%E6%9C%AC/app/src/service.ts#L86-L96)

## 非鲁棒问题
- 资源清理逻辑存在异步 filter 错误：`cleanupCanvasAssets` 使用 `Array.filter(async ...)`，实际不会等待异步判断，导致引用过滤与 `changed` 判断失效，未引用文件可能无法清理。[server.ts](file:///E:/responsities/lookback%20-%20%E5%89%AF%E6%9C%AC/app/backend/server.ts#L161-L216)
- Settings 缓存无失效机制：`settingsSnapshot` 首次失败会永久缓存空对象，且后续设置变更不一定刷新，容易造成前端状态与实际设置不一致。[service.ts](file:///E:/responsities/lookback%20-%20%E5%89%AF%E6%9C%AC/app/src/service.ts#L11-L83)
- `localApi` JSON 解析失败直接返回 null，调用方若未处理会进入“静默失败”状态，定位问题困难。[service.ts](file:///E:/responsities/lookback%20-%20%E5%89%AF%E6%9C%AC/app/src/service.ts#L206-L233)
- 本地 API 默认监听所有网卡且 `cors()` 全开放，扩展与任意网页均可访问接口，若端口暴露到局域网会形成不必要风险。[server.ts](file:///E:/responsities/lookback%20-%20%E5%89%AF%E6%9C%AC/app/backend/server.ts#L279-L364)

## 架构不合理与维护风险
- 关键文件体量过大、职责混杂：Canvas/TitleBar/CanvasStore 单文件 700~1400 行，交互逻辑、状态、渲染混在一起，降低可维护性与可测试性。[Canvas.tsx](file:///E:/responsities/lookback%20-%20%E5%89%AF%E6%9C%AC/app/src/components/Canvas.tsx#L1-L200) [TitleBar.tsx](file:///E:/responsities/lookback%20-%20%E5%89%AF%E6%9C%AC/app/src/components/TitleBar.tsx#L1-L200) [canvasStore.ts](file:///E:/responsities/lookback%20-%20%E5%89%AF%E6%9C%AC/app/src/store/canvasStore.ts#L1-L220)
- 兼容逻辑与新方案共存：`canvasGrayscale` 与 `canvasFilters` 双通道并存，并保留迁移逻辑，违背当前“无旧数据兼容”的约束，且增大状态分歧风险。[canvasStore.ts](file:///E:/responsities/lookback%20-%20%E5%89%AF%E6%9C%AC/app/src/store/canvasStore.ts#L158-L348) [canvasStore.ts](file:///E:/responsities/lookback%20-%20%E5%89%AF%E6%9C%AC/app/src/store/canvasStore.ts#L893-L913)
- 配置与端口强耦合：`API_BASE_URL` 固定为 `http://localhost:30001`，缺少探测与协商机制，未来端口冲突或多实例场景下扩展成本高。[config.ts](file:///E:/responsities/lookback%20-%20%E5%89%AF%E6%9C%AC/app/src/config.ts#L1-L1)
