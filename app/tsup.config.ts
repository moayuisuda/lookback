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
  // Worker 被解包运行，因此它不能从 app.asar 内查找 Sucrase。
  noExternal: ["sucrase"],
});
