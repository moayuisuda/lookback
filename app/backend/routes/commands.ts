import express from "express";
import path from "path";
import fs from "fs-extra";
import { withFileLock } from "../fileLock";

type CommandsRouteDeps = {
  getStorageDir: () => string;
};

type ExternalCommandManifest = {
  id: string;
  title: string;
  description?: string;
  keywords?: string[];
  entry?: string;
  mode?: string;
  ui?: {
    fields?: unknown;
  };
};

const isSafeSegment = (value: string) =>
  value.length > 0 &&
  !value.includes("..") &&
  !value.includes("/") &&
  !value.includes("\\");

const ROOT_FOLDER = "__root__";

const isScriptFile = (value: string) => {
  const ext = path.extname(value).toLowerCase();
  return ext === ".js" || ext === ".jsx" || ext === ".mjs";
};

const COMMAND_ID_PATTERN =
  /export\s+const\s+config\s*=\s*{[\s\S]*?\bid\s*:\s*['"`]([^'"`]+)['"`]/;

const sanitizeFileBaseName = (value: string) =>
  value.trim().replace(/[<>:"/\\|?*\s]+/g, "_");

const extractCommandId = (script: string) => {
  const match = COMMAND_ID_PATTERN.exec(script);
  if (!match) return "";
  return match[1]?.trim() || "";
};

export const createCommandsRouter = (deps: CommandsRouteDeps) => {
  const router = express.Router();

  const getCommandsDir = () => path.join(deps.getStorageDir(), "commands");

  router.get("/api/commands", async (_req, res) => {
    try {
      const commandsDir = getCommandsDir();
      await fs.ensureDir(commandsDir);
      const entries = await fs.readdir(commandsDir).catch(() => []);
      const result: Array<
        ExternalCommandManifest & { folder: string; entry: string }
      > = [];
      for (const entry of entries) {
        const dirPath = path.join(commandsDir, entry);
        const stat = await fs.stat(dirPath).catch(() => null);
        if (!stat) continue;
        if (!stat.isFile()) continue;
        if (!isSafeSegment(entry)) continue;
        if (!isScriptFile(entry)) continue;
        const parsed = path.parse(entry);
        const id = parsed.name.trim();
        if (!id) continue;
        result.push({
          id,
          title: id,
          entry: entry,
          folder: ROOT_FOLDER,
        });
      }
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.get("/api/commands/:folder/script", async (req, res) => {
    try {
      const { folder } = req.params;
      const entry = typeof req.query.entry === "string" ? req.query.entry : "";
      if (!isSafeSegment(folder) || (entry && !isSafeSegment(entry))) {
        res.status(400).send("Invalid path");
        return;
      }
      const commandsDir = getCommandsDir();
      const dirPath = folder === ROOT_FOLDER ? commandsDir : path.join(commandsDir, folder);
      const entryName = entry || "script.js";
      const scriptPath = path.join(dirPath, entryName);
      await withFileLock(scriptPath, async () => {
        if (!(await fs.pathExists(scriptPath))) {
          res.status(404).send("Not found");
          return;
        }
        const content = await fs.readFile(scriptPath, "utf-8");
        res.type("application/javascript").send(content);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.post("/api/commands/text-import", async (req, res) => {
    try {
      const script =
        typeof req.body?.script === "string" ? req.body.script.trim() : "";
      if (!script) {
        res.status(400).json({ error: "Missing script" });
        return;
      }

      const commandId = extractCommandId(script);
      if (!commandId) {
        res.status(400).json({ error: "Missing config.id" });
        return;
      }

      const fileBaseName = sanitizeFileBaseName(commandId);
      if (!fileBaseName) {
        res.status(400).json({ error: "Invalid config.id" });
        return;
      }

      const commandsDir = getCommandsDir();
      await fs.ensureDir(commandsDir);
      const fileName = `${fileBaseName}.jsx`;
      const scriptPath = path.join(commandsDir, fileName);

      await withFileLock(scriptPath, async () => {
        await fs.writeFile(scriptPath, script, "utf-8");
      });

      res.json({
        success: true,
        id: commandId,
        folder: ROOT_FOLDER,
        entry: fileName,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.delete("/api/commands/:folder", async (req, res) => {
    try {
      const { folder } = req.params;
      const entry = typeof req.query.entry === "string" ? req.query.entry : "";
      if (!entry) {
        res.status(400).json({ error: "Missing entry" });
        return;
      }
      if (!isSafeSegment(folder) || !isSafeSegment(entry) || !isScriptFile(entry)) {
        res.status(400).json({ error: "Invalid path" });
        return;
      }
      const commandsDir = getCommandsDir();
      const dirPath = folder === ROOT_FOLDER ? commandsDir : path.join(commandsDir, folder);
      const scriptPath = path.join(dirPath, entry);
      await withFileLock(scriptPath, async () => {
        if (!(await fs.pathExists(scriptPath))) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        await fs.remove(scriptPath);
        res.json({ success: true });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  return router;
};
