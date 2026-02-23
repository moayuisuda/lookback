1. Use valtio for state management. Rendering code must use `useSnapshot` to read state; use `state` directly inside event handlers to avoid closure traps.
2. No mock/lazy implementations allowed — all code must meet production quality standards.
3. Visual effects must be elegant and consistent with the overall design. Refer to `index.css` for the current theme colors.
4. During development, no backward-compatibility logic for legacy data.
5. Unless explicitly required, do not run `npm run build`.
6. All configuration must be persisted via `localApi` using local files, only commands-pending use `localStorage`.
7. All user-facing text must be internationalized. Refer to `app/shared/i18n/agents.md`.
8. Use `radash` for debounce, throttle, and other utility functions.
9. All file read/write operations must go through `fileLock` methods to prevent data corruption from concurrent access.
10. After completing a code task, always run `npm run lint` to check code quality.
11. Functions strongly tied to state should be placed in the valtio store whenever possible.
12. When writing commands, you must first read the existing code in `app/src/commands/index.ts` and `app/src/commands-pending`. For commands-pending task, Do not couple or modify the main application code without explicit permission. Command's i18n should placed in <commandName>.jsx.

Release:
/Users/anhaohui/Documents/stocks/RroRef/scripts/release-tag.sh v0.1.17
