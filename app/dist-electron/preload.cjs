// electron/preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("electron", {
  min: () => import_electron.ipcRenderer.send("window-min"),
  max: () => import_electron.ipcRenderer.send("window-max"),
  close: () => import_electron.ipcRenderer.send("window-close"),
  focus: () => import_electron.ipcRenderer.send("window-focus"),
  toggleAlwaysOnTop: (flag) => import_electron.ipcRenderer.send("toggle-always-on-top", flag),
  setPinMode: (enabled, widthDelta) => import_electron.ipcRenderer.send("set-pin-mode", { enabled, widthDelta }),
  setPinTransparent: (enabled) => import_electron.ipcRenderer.send("set-pin-transparent", enabled),
  resizeWindowBy: (delta) => import_electron.ipcRenderer.send("resize-window-by", delta),
  setToggleWindowShortcut: (accelerator) => import_electron.ipcRenderer.invoke("set-toggle-window-shortcut", accelerator),
  setSettingsOpen: (open) => import_electron.ipcRenderer.send("settings-open-changed", open),
  getStorageDir: () => import_electron.ipcRenderer.invoke("get-storage-dir"),
  chooseStorageDir: () => import_electron.ipcRenderer.invoke("choose-storage-dir"),
  openExternal: (url) => import_electron.ipcRenderer.invoke("open-external", url),
  onNewCollection: (callback) => {
    const handler = (_, data) => callback(data);
    import_electron.ipcRenderer.on("new-collection", handler);
    return () => import_electron.ipcRenderer.off("new-collection", handler);
  },
  onImageUpdated: (callback) => {
    const handler = (_, data) => callback(data);
    import_electron.ipcRenderer.on("image-updated", handler);
    return () => import_electron.ipcRenderer.off("image-updated", handler);
  },
  onSearchUpdated: (callback) => {
    const handler = (_, data) => callback(data);
    import_electron.ipcRenderer.on("search-updated", handler);
    return () => import_electron.ipcRenderer.off("search-updated", handler);
  },
  onModelDownloadProgress: (callback) => {
    const handler = (_, data) => callback(data);
    import_electron.ipcRenderer.on("model-download-progress", handler);
    return () => import_electron.ipcRenderer.off("model-download-progress", handler);
  },
  onEnvInitProgress: (callback) => {
    const handler = (_, data) => callback(data);
    import_electron.ipcRenderer.on("env-init-progress", handler);
    return () => import_electron.ipcRenderer.off("env-init-progress", handler);
  },
  onIndexingProgress: (callback) => {
    const handler = (_, data) => callback(data);
    import_electron.ipcRenderer.on("indexing-progress", handler);
    return () => import_electron.ipcRenderer.off("indexing-progress", handler);
  },
  onToast: (callback) => {
    const handler = (_, data) => callback(data);
    import_electron.ipcRenderer.on("toast", handler);
    return () => import_electron.ipcRenderer.off("toast", handler);
  },
  log: (level, ...args) => import_electron.ipcRenderer.send("log-message", level, ...args),
  getLogContent: () => import_electron.ipcRenderer.invoke("get-log-content"),
  ensureModelReady: () => import_electron.ipcRenderer.invoke("ensure-model-ready")
});
