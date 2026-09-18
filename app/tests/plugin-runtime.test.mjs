import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const workingDir = fileURLToPath(new URL("..", import.meta.url));
const pluginPath = fileURLToPath(new URL("./fixtures/blocking-plugin.mjs", import.meta.url));

const workerBuild = await build({
  absWorkingDir: workingDir,
  entryPoints: ["backend/pluginServerWorker.ts"],
  platform: "node",
  bundle: true,
  format: "esm",
  write: false,
});
const workerUrl = `data:text/javascript;base64,${Buffer.from(workerBuild.outputFiles[0].text).toString("base64")}`;
const runtimeBuild = await build({
  absWorkingDir: workingDir,
  entryPoints: ["backend/pluginRuntime.ts"],
  platform: "node",
  bundle: true,
  format: "cjs",
  write: false,
  plugins: [{
    name: "worker-location",
    setup(builder) {
      builder.onResolve({ filter: /^\.\/workerPath$/ }, () => ({
        path: "workerPath",
        namespace: "test",
      }));
      builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({
        contents: `export const getBundledWorkerPath = () => new URL(${JSON.stringify(workerUrl)});`,
      }));
    },
  }],
});
const nodeRequire = createRequire(import.meta.url);
const runtimeModule = { exports: {} };
new Function("require", "module", "exports", runtimeBuild.outputFiles[0].text)(
  nodeRequire,
  runtimeModule,
  runtimeModule.exports,
);
const { pluginRuntime } = runtimeModule.exports;

test("plugin module and actions run off the main loop and reload after worker exit", async () => {
  const context = {
    pluginKey: "fixture:plugin",
    folder: "fixture",
    storageDir: "storage",
    commandDir: "storage/commands",
    pluginDir: "storage/commands/fixture",
  };
  let ticks = 0;
  const timer = setInterval(() => ticks++, 1);
  try {
    const actions = await pluginRuntime.load(context.pluginKey, context.folder, pluginPath);
    assert.deepEqual(actions.sort(), ["crash", "run"]);
    assert.ok(ticks > 0, "module initialization blocked the main loop");

    ticks = 0;
    const first = await pluginRuntime.invoke(
      context.pluginKey,
      "run",
      { duration: 100, value: "first" },
      context,
    );
    assert.ok(ticks > 0, "plugin action blocked the main loop");
    assert.deepEqual(first, { calls: 1, value: "first", context });

    await assert.rejects(
      pluginRuntime.invoke(context.pluginKey, "crash", undefined, context),
      /exited with code 17/,
    );
    const recovered = await pluginRuntime.invoke(
      context.pluginKey,
      "run",
      { duration: 0, value: "recovered" },
      context,
    );
    assert.deepEqual(recovered, { calls: 1, value: "recovered", context });
  } finally {
    clearInterval(timer);
  }
});

test("blocking and crashing plugins do not delay another plugin", async () => {
  const keepAlive = setInterval(() => {}, 100);
  try {
    const slow = {
      pluginKey: "fixture:slow",
      folder: "fixture",
      storageDir: "storage",
      commandDir: "storage/commands",
      pluginDir: "storage/commands/fixture",
    };
    const fast = { ...slow, pluginKey: "fixture:fast" };
    await Promise.all([
      pluginRuntime.load(slow.pluginKey, slow.folder, pluginPath),
      pluginRuntime.load(fast.pluginKey, fast.folder, pluginPath),
    ]);

    const slowCall = pluginRuntime.invoke(slow.pluginKey, "run", { duration: 350, value: "slow" }, slow);
    const fastCall = pluginRuntime.invoke(fast.pluginKey, "run", { duration: 0, value: "fast" }, fast);
    const first = await Promise.race([
      slowCall.then(() => "slow"),
      fastCall.then(() => "fast"),
    ]);
    assert.equal(first, "fast");
    assert.equal((await fastCall).calls, 1);
    await slowCall;

    await assert.rejects(
      pluginRuntime.invoke(slow.pluginKey, "crash", undefined, slow),
      /exited with code 17/,
    );
    const stillAvailable = await pluginRuntime.invoke(
      fast.pluginKey,
      "run",
      { duration: 0, value: "available" },
      fast,
    );
    assert.equal(stillAvailable.calls, 2);
  } finally {
    clearInterval(keepAlive);
  }
});
