1. 使用 valtio 进行状态管理，渲染相关代码必须用 useSnapshot 来获取状态，事件内使用 state 防止闭包陷阱
2. 不允许 mock 偷懒实现，所有代码都是生产级别标准
3. 实现的视觉效果优雅美观，和整体一致，当前主题颜色参考 index.css
4. 开发阶段不要有任何旧数据兼容逻辑
5. 没有特别要求，不要 npm run build
6.  所有配置都要通过 localApi 持久化，数据持久化基于本地文件，不要用 localstorage
7.  所有文案都需要国际化，参考 app/shared/i18n/agents.md
8.  防抖、节流等工具函数用 radash
9.  文件读写操作，都要通过 fileLock 文件的方法来进行，避免并发读写导致数据损坏
10. 代码任务完成后，必须运行 npm run lint 来检查代码质量
11. 和状态强相关的函数尽量放在 valtio store 中
12. 编写命令的时候，必须阅读 app/src/commands/index.ts 和 app/src/commands-pending 里已有的代码。命令编写时候，未经允许要耦合改动主应用代码

版本发布：
/Users/anhaohui/Documents/stocks/RroRef/scripts/release-tag.sh v0.1.17