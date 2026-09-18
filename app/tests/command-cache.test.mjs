import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const workingDir = fileURLToPath(new URL("..", import.meta.url));
const result = await build({
  absWorkingDir: workingDir,
  stdin: {
    contents: 'export { createCommandsRouter } from "./backend/routes/commands.ts"; export { lockedFs } from "./backend/fileLock.ts";',
    resolveDir: workingDir,
    sourcefile: "cache-test-entry.ts",
  },
  platform: "node",
  format: "cjs",
  bundle: true,
  packages: "external",
  write: false,
  plugins: [{
    name: "isolated-command-compiler",
    setup(builder) {
      builder.onResolve({ filter: /^electron$/ }, () => ({ path: "electron", namespace: "test" }));
      builder.onLoad({ filter: /^electron$/, namespace: "test" }, () => ({
        contents: 'export const app = { getAppPath: () => "" };',
      }));
      builder.onResolve({ filter: /compileInWorker$/ }, () => ({ path: "compiler", namespace: "test" }));
      builder.onLoad({ filter: /^compiler$/, namespace: "test" }, () => ({
        contents: "export const compileInWorker = async (source) => { globalThis.__compileCalls++; return source; };",
      }));
    },
  }],
});
const runtimeModule = { exports: {} };
new Function("require", "module", "exports", result.outputFiles[0].text)(
  createRequire(import.meta.url),
  runtimeModule,
  runtimeModule.exports,
);
const { createCommandsRouter, lockedFs } = runtimeModule.exports;

test("unchanged plugin source reuses compiled output and changed source rebuilds it", async () => {
  const storageDir = path.join(os.tmpdir(), `lookback-command-cache-${randomUUID()}`);
  const pluginDir = path.join(storageDir, "commands", "fixture");
  await lockedFs.ensureDir(pluginDir);
  await lockedFs.writeJson(path.join(pluginDir, "package.json"), {
    lookback: { id: "fixture", ui: "index.js" },
  });
  const sourcePath = path.join(pluginDir, "index.js");
  await lockedFs.writeFile(sourcePath, 'export const config = { id: "one" };');
  globalThis.__compileCalls = 0;

  const app = express();
  app.use(createCommandsRouter({ getStorageDir: () => storageDir }));
  const server = app.listen(0);
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const prepare = async () => {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/commands/fixture/esm/prepare`, {
        method: "POST",
      });
      assert.equal(response.status, 200);
      return response.json();
    };

    const first = await prepare();
    assert.equal(globalThis.__compileCalls, 1);
    const second = await prepare();
    assert.equal(second.entryPath, first.entryPath);
    assert.equal(globalThis.__compileCalls, 1);

    await lockedFs.writeFile(sourcePath, 'export const config = { id: "two" };');
    const changed = await prepare();
    assert.notEqual(changed.entryPath, first.entryPath);
    assert.equal(globalThis.__compileCalls, 2);
    assert.equal(await lockedFs.pathExists(first.entryPath), true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await lockedFs.remove(storageDir);
  }
});
