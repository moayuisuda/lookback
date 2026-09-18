import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { extractFile, statFile } from "@electron/asar";

const appDir = path.resolve(process.argv[2] || "dist/win-unpacked");
const archivePath = path.join(appDir, "resources", "app.asar");

const packedFiles = [
  "package.json",
  "dist-electron/main.cjs",
  "dist-electron/preload.cjs",
  "dist-renderer/index.html",
];

for (const fileName of packedFiles) {
  const file = statFile(archivePath, fileName);
  assert.equal(file.unpacked, undefined, `${fileName} must stay inside app.asar`);
  const content = extractFile(archivePath, fileName);
  const hash = createHash("sha256").update(content).digest("hex");
  assert.equal(hash, file.integrity?.hash, `${fileName} is corrupt in app.asar`);
}

const manifest = JSON.parse(extractFile(archivePath, "package.json").toString());
assert.equal(manifest.main, "dist-electron/main.cjs");

for (const fileName of ["commandCompilerWorker.cjs", "pluginServerWorker.cjs"]) {
  const packagedPath = path.join(appDir, "resources", "workers", fileName);
  const sourcePath = path.resolve("dist-electron", fileName);
  const [packaged, source] = await Promise.all([
    readFile(packagedPath),
    readFile(sourcePath),
  ]);
  assert.ok((await stat(packagedPath)).isFile());
  assert.deepEqual(packaged, source, `${fileName} differs from the built worker`);
}

process.stdout.write(`Packaged app verified: ${manifest.version}\n`);
