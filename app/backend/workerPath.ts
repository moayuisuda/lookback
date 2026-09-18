import { app } from "electron";
import path from "node:path";

export const getBundledWorkerPath = (fileName: string): string => {
  return app.isPackaged
    ? path.join(process.resourcesPath, "workers", fileName)
    : path.join(__dirname, fileName);
};
