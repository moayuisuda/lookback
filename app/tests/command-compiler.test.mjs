import assert from "node:assert/strict";
import test from "node:test";
import { Worker } from "node:worker_threads";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const workingDir = fileURLToPath(new URL("..", import.meta.url));

const bundleWorker = async (entryPoint, platform) => {
  const result = await build({
    absWorkingDir: workingDir,
    entryPoints: [entryPoint],
    platform,
    bundle: true,
    format: platform === "node" ? "cjs" : "iife",
    write: false,
  });
  return result.outputFiles[0].text;
};

const createCompiler = async (kind) => {
  const browser = kind === "browser";
  const code = await bundleWorker(
    browser ? "src/commands/commandCompiler.worker.ts" : "backend/commandCompilerWorker.ts",
    browser ? "browser" : "node",
  );
  const browserBridge = `
    const { parentPort } = require("node:worker_threads");
    globalThis.self = { postMessage: (response) => parentPort.postMessage(response) };
    parentPort.on("message", (data) => self.onmessage({ data }));
  `;
  return new Worker(browser ? `${browserBridge}\n${code}` : code, { eval: true });
};

const compile = (compiler, id, source, filePath) => new Promise((resolve, reject) => {
  const onMessage = (response) => {
    if (response.id !== id) return;
    compiler.off("message", onMessage);
    compiler.off("error", reject);
    resolve(response);
  };
  compiler.on("message", onMessage);
  compiler.once("error", reject);
  compiler.postMessage({ id, source, filePath });
});

for (const kind of ["browser", "node"]) {
  test(`${kind} compiler converts JSX off the caller's event loop`, async () => {
    const compiler = await createCompiler(kind);
    try {
      let mainLoopTicks = 0;
      const ticker = setInterval(() => mainLoopTicks++, 1);
      const response = await compile(
        compiler,
        1,
        'export const config = { id: "demo" }; export const ui = () => <section>ready</section>;',
        "demo.jsx",
      );
      clearInterval(ticker);
      assert.equal(response.error, undefined);
      assert.match(response.code, /React\.createElement\(['"]section['"]/);
      assert.ok(mainLoopTicks > 0);

      const invalid = await compile(compiler, 2, "export const ui = () => <section>", "broken.jsx");
      assert.equal(typeof invalid.error, "string");
      assert.equal(invalid.code, undefined);

      const repaired = await compile(compiler, 3, "export const run = () => 1;", "fixed.js");
      assert.equal(repaired.error, undefined);
      assert.match(repaired.code, /export const run/);
    } finally {
      await compiler.terminate();
    }
  });
}
