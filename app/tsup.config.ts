import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    main: "electron/main.ts",
    preload: "electron/preload.ts",
    commandCompilerWorker: "backend/commandCompilerWorker.ts",
    pluginServerWorker: "backend/pluginServerWorker.ts",
  },
  format: "cjs",
  outDir: "dist-electron",
  external: ["electron", "sharp"],
  // Worker 在 resources/workers 中独立运行，不能依赖 app.asar 内的 Sucrase。
  noExternal: ["sucrase"],
});
