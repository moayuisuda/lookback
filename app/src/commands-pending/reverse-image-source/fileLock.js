import fs from "node:fs/promises";
import path from "node:path";

class KeyedMutex {
  constructor() {
    this.locks = new Map();
  }

  async run(key, task) {
    const previous = this.locks.get(key) ?? Promise.resolve();
    let release = () => {};
    const current = new Promise((resolve) => {
      release = resolve;
    });
    const chain = previous.then(() => current);
    this.locks.set(key, chain);
    await previous;

    try {
      return await task();
    } finally {
      release();
      if (this.locks.get(key) === chain) {
        this.locks.delete(key);
      }
    }
  }
}

const mutex = new KeyedMutex();

const normalizeKey = (target) => path.resolve(String(target || "unknown"));

export const withFileLock = (target, task) =>
  mutex.run(normalizeKey(target), task);

export const lockedFs = {
  ensureDir: (target) =>
    withFileLock(target, () => fs.mkdir(target, { recursive: true })),
  pathExists: (target) =>
    withFileLock(target, async () => {
      try {
        await fs.access(target);
        return true;
      } catch {
        return false;
      }
    }),
  readJson: (target) =>
    withFileLock(target, async () => JSON.parse(await fs.readFile(target, "utf8"))),
  readFile: (target) => withFileLock(target, () => fs.readFile(target)),
  writeJson: (target, data) =>
    withFileLock(target, async () => {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    }),
  stat: (target) => withFileLock(target, () => fs.stat(target)),
};
