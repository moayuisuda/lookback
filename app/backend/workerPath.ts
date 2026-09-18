import { app } from "electron";
import path from "node:path";

export const getBundledWorkerPath = (fileName: string): string => {
  const outputDir = app.isPackaged
    ? __dirname.replace(/app\.asar(?=[\\/])/, "app.asar.unpacked")
    : __dirname;
  return path.join(outputDir, fileName);
};
