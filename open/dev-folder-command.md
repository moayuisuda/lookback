# LookBack 目录插件生成契约

## 一、你要生成什么

你要生成一个可以直接导入 LookBack 的完整插件文件夹。

最终交付物必须是一个目录，不是单个文件，不是代码片段，不是实现说明。

必须满足：

- 所有文件内容完整；
- 所有导入路径真实存在；
- 不包含 TODO、mock、placeholder 或伪代码；
- 不修改 LookBack 主工程；
- 不要求用户补写任何文件；
- 不生成兼容旧数据的逻辑；
- 不实现重复功能或降级方案。

## 二、生成的目录结构

### 1. 固定结构

每个目录插件都必须包含：

```text
<plugin-name>/
├─ package.json
└─ index.jsx
```

### 2. 前端需要拆分模块时

模块目录名称可以按职责调整，但入口固定为 `index.jsx`：

```text
<plugin-name>/
├─ package.json
├─ index.jsx
├─ components/
│  └─ <ComponentName>.jsx
└─ utils/
   └─ <moduleName>.js
```

### 3. 需要主进程能力时

只有需要 Node.js、后台任务或服务端依赖时，增加 `server.js`：

```text
<plugin-name>/
├─ package.json
├─ index.jsx
└─ server.js
```

禁止交付以下目录：

```text
node_modules/
.lookback-esm/
.lookback-cjs/
.git/
```

## 三、每个文件的约束

### 1. package.json

`package.json` 是插件清单，必须位于插件根目录。

无主进程服务时，固定结构为：

```json
{
  "name": "my-command",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "lookback": {
    "id": "myCommand",
    "ui": "index.jsx"
  }
}
```

存在主进程服务时，固定结构为：

```json
{
  "name": "my-command",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "lookback": {
    "id": "myCommand",
    "ui": "index.jsx",
    "server": "server.js"
  }
}
```

硬性约束：

- `name` 使用 kebab-case；
- `version` 使用合法语义化版本；
- `private` 固定为 `true`；
- `type` 固定为 `module`；
- `lookback.id` 使用 camelCase；
- `lookback.id` 必须与 `index.jsx` 中的 `config.id` 完全一致；
- `lookback.ui` 固定指向真实存在的前端入口；
- 没有 `server.js` 时，禁止声明 `lookback.server`；
- 有 `server.js` 时，`lookback.server` 必须指向该文件；
- 只有代码真实导入第三方包时，才允许声明 `dependencies`；
- 禁止声明未使用的依赖；

### 2. index.jsx

`index.jsx` 是前端入口，运行在 LookBack 渲染进程。

必须具名导出：

```js
export const config = { ... };
```

按功能需要具名导出 `run`。

```js
export const run = (context, helpers) => { ... };
```

没有 `server.js` 时，`ui` 固定写法为：

```js
export const ui = ({ context }) => { ... };
```

存在 `server.js` 时，`ui` 固定写法为：

```js
export const ui = ({ context, plugin }) => { ... };
```

硬性约束：

- 禁止 `export default`；
- `config.id` 必须与 `package.json` 的 `lookback.id` 完全一致；
- `config` 必须包含 `id`、`title`、`description`、`keywords`；
- 所有用户可见文本必须写入 `config.i18n`；
- `config.i18n` 必须同时提供 `zh` 和 `en`；
- `titleKey` 和 `descriptionKey` 必须指向真实存在的 i18n key；
- `run` 中读取状态必须使用 `context.store`；
- `run` 中禁止使用 React hooks；
- `ui` 渲染状态必须使用 `context.hooks.useEnvState()`；
- `ui` 的事件处理器必须从 `context.store` 读取实时状态；
- React 必须通过 `context.React` 使用；
- 禁止直接使用 Node.js API；
- 禁止导入 `node:fs`、`node:path`、`node:crypto` 等 Node.js 模块；
- 前端模块只能使用相对路径导入；
- 每个相对导入必须指向插件目录内真实存在的文件；
- 前端禁止裸导入 npm 包；第三方 npm 包只能在 `server.js` 中使用；
- 样式必须由插件自己注入，并使用插件专属 class 前缀；
- 禁止依赖 LookBack 构建阶段扫描插件中的 Tailwind class。

前端运行时对象固定为：

```js
context = {
  React,
  hooks: {
    useEnvState,
    useT
  },
  actions: {
    canvasActions,
    globalActions,
    commandActions
  },
  store: {
    canvas,
    global,
    command,
    i18n
  },
  config: {
    API_BASE_URL
  },
  shell,
  components
};
```

`run` 的辅助对象固定为：

```js
helpers = {
  openExternal,
  copyText,
  toast
};
```

#### plugin 参数

`plugin` 是 LookBack 注入到 `ui` 的主进程服务调用器。它不是插件配置，不是状态对象，也不是通用 API。

生成条件必须同时满足：

1. 插件目录中存在 `server.js`；
2. `package.json` 声明了 `lookback.server`。

`plugin` 的固定结构为：

```js
plugin = {
  key,
  folder,
  actions,
  invoke
};
```

字段含义：

- `key`：LookBack 分配的服务标识；
- `folder`：当前插件目录名称；
- `actions`：`server.js` 已导出的 action 名称数组；
- `invoke(actionName, payload)`：调用一个 action，并返回该 action 的结果。

调用格式固定为：

```js
const result = await plugin.invoke("actionName", payload);
```

硬性约束：

- 没有 `server.js` 时，`ui` 禁止接收 `plugin` 参数；
- 没有 `server.js` 时，前端禁止出现 `plugin.invoke`；
- 前端只能调用 `plugin.actions` 中存在的 action；
- `actionName` 必须与 `server.js` 导出的函数名完全一致；
- `payload` 必须是 Electron IPC 可序列化数据；
- `plugin.invoke` 的返回值就是对应 server action 的返回值。

参考已有的命令文件夹：https://github.com/moayuisuda/lookback/tree/main/app/src/commands-pending/reverse-image-source

运行时对象与可用能力必须同时核对以下 GitHub 源码：

- [`app/src/commands/index.ts`](https://github.com/moayuisuda/lookback/blob/main/app/src/commands/index.ts)：组装并注入完整 `context`；
- [`app/src/commands/types.ts`](https://github.com/moayuisuda/lookback/blob/main/app/src/commands/types.ts)：定义 `CommandContext`、命令配置和 UI 参数类型；
- [`app/src/store/canvasStore.ts`](https://github.com/moayuisuda/lookback/blob/main/app/src/store/canvasStore.ts)：定义 `canvasState` 与 `canvasActions`；
- [`app/src/store/globalStore.ts`](https://github.com/moayuisuda/lookback/blob/main/app/src/store/globalStore.ts)：定义 `globalState` 与 `globalActions`；
- [`app/src/store/commandStore.ts`](https://github.com/moayuisuda/lookback/blob/main/app/src/store/commandStore.ts)：定义 `commandState` 与 `commandActions`；
- [`app/src/hooks/useEnvState.ts`](https://github.com/moayuisuda/lookback/blob/main/app/src/hooks/useEnvState.ts)：定义 UI 渲染时使用的响应式状态快照；
禁止臆造上述源码中未提供的 state、actions、hooks、组件、字段或接口。

### 3. components/*.jsx

`components` 目录只存放前端展示组件。

硬性约束：

- 每个文件只负责一个清晰组件；
- 使用具名导出；
- 通过 props 接收数据和事件；
- 禁止复制一份插件状态作为第二数据源；
- 禁止直接访问 Node.js API；
- 禁止直接调用主进程服务；主进程调用统一由 `index.jsx` 组织；
- 所有用户可见文本由 `index.jsx` 的 `config.i18n` 提供；
- 禁止在组件内写死用户可见文案。

### 4. utils/*.js

`utils` 目录只存放无界面的前端纯函数。

硬性约束：

- 使用具名导出；
- 输入和输出必须明确；
- 相同输入必须得到相同输出；
- 禁止读取或修改全局状态；
- 禁止产生网络、文件、剪贴板或 DOM 副作用；
- 禁止直接调用 `context`、`actions` 或 `plugin.invoke`。

### 5. server.js

`server.js` 是可选的主进程入口，运行在 Electron 主进程。

只有以下功能允许放入 `server.js`：

- 使用 Node.js API；
- 使用第三方 npm 包；
- 执行后台网络请求；
- 执行文件处理或长时间任务；
- 读写本地文件或持久化配置。

每个 action 的固定签名为：

```js
const actionName = async (payload, context) => { ... };
```

必须使用默认对象导出全部 action：

```js
export default {
  actionName
};
```

服务上下文固定为：

```js
context = {
  pluginKey,
  folder,
  storageDir,
  commandDir,
  pluginDir
};
```

硬性约束：

- action 名称必须与前端 `plugin.invoke()` 使用的名称完全一致；
- 每个 action 必须校验 payload；
- 返回值必须是 Electron IPC 可序列化数据；
- 禁止返回函数、DOM、React 对象、Stream 或 class 实例；
- 插件运行数据必须写入 `storageDir/command-runtimes/<plugin-id>/`；
- 插件自带的只读资源必须通过 `pluginDir` 定位；
- 禁止把运行数据写回插件源码目录；
- 禁止在前端和 `server.js` 重复实现同一业务逻辑；

### 6. server 业务模块

当 `server.js` 需要拆分时，业务模块放入独立目录，例如：

```text
server/
├─ api.js
├─ processor.js
└─ validation.js
```

硬性约束：

- `server.js` 只负责注册和组合 action；
- 网络请求集中在 API 模块；
- 输入校验集中在 validation 模块；
- 业务计算集中在 processor 模块；
- 禁止循环依赖；
- 禁止跨模块复制同一逻辑。

## 四、文件之间的固定关系

```text
package.json
  ├─ lookback.ui ──────> index.jsx
  └─ lookback.server ──> server.js（可选）

index.jsx
  ├─ import ───────────> components/*（可选）
  ├─ import ───────────> utils/*（可选）
  └─ plugin.invoke ────> server.js action（可选）

server.js
  ├─ import ───────────> server/*（可选）
  └─ import ───────────> dependencies（可选）
```

## 五、生成步骤

必须按顺序执行：

1. 根据用户需求确定 `lookback.id`；
2. 创建插件根目录；
3. 创建 `package.json`；
4. 创建 `index.jsx`；
5. 只有前端逻辑需要拆分时，创建 `components` 或 `utils`；
6. 只有需要主进程能力时，创建 `server.js` 并写入 `lookback.server`；
7. 只有主进程代码需要拆分时，创建 `server` 业务模块；
8. 只有使用第三方包时，在 `dependencies` 中声明准确版本；
9. 检查所有导入、action、i18n key 和入口路径；
10. 删除 `node_modules`、编译缓存和其他运行时产物；
11. 交付完整插件目录。

## 六、交付前检查

必须全部通过：

- `package.json` 可以被 JSON 解析；
- `lookback.id` 与 `config.id` 完全一致；
- `lookback.ui` 指向真实文件；
- 声明 `lookback.server` 时，其入口真实存在；
- 每个 import 都能解析到真实文件或已声明依赖；
- 每个 `plugin.invoke` 都有对应的 server action；
- 每个用户可见文本都有中英文 i18n；
- 前端代码没有 Node.js API；
- 不存在未使用的文件、依赖或导出；
- 不包含 `node_modules`、`.lookback-esm`、`.lookback-cjs`、`.git`；
- 不包含密钥、令牌、测试数据或用户数据；
- 不包含 TODO、mock、placeholder、伪代码、兼容逻辑或降级实现。

最后只交付生成完成的插件目录，不要交付设计说明。
