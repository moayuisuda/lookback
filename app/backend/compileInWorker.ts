import { Worker } from "node:worker_threads";
import { getBundledWorkerPath } from "./workerPath";
import type {
  CompileCommandRequest,
  CompileCommandResponse,
} from "../shared/compileCommandSource";

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, {
  resolve: (code: string) => void;
  reject: (error: Error) => void;
}>();

const failPending = (compiler: Worker, error: Error) => {
  if (worker !== compiler) return;
  pending.forEach(({ reject }) => reject(error));
  pending.clear();
  worker = null;
};

const getWorker = (): Worker => {
  if (worker) return worker;
  const compiler = new Worker(getBundledWorkerPath("commandCompilerWorker.cjs"));
  worker = compiler;
  compiler.on("message", ({ id, code, error }: CompileCommandResponse) => {
    const task = pending.get(id);
    if (!task) return;
    pending.delete(id);
    if (error !== undefined) task.reject(new Error(error));
    else task.resolve(code!);
  });
  compiler.on("error", (error) => failPending(compiler, error));
  compiler.on("exit", (code) => {
    failPending(compiler, new Error(`Command compiler exited with code ${code}`));
  });
  compiler.unref();
  return compiler;
};

export const compileInWorker = (source: string, filePath: string): Promise<string> => {
  const compiler = getWorker();
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const request: CompileCommandRequest = { id, source, filePath };
    compiler.postMessage(request);
  });
};
