import type {
  CompileCommandRequest,
  CompileCommandResponse,
} from "../../shared/compileCommandSource";

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, {
  resolve: (code: string) => void;
  reject: (error: Error) => void;
}>();

const failPending = (error: Error) => {
  pending.forEach(({ reject }) => reject(error));
  pending.clear();
  worker?.terminate();
  worker = null;
};

const getWorker = (): Worker => {
  if (worker) return worker;
  worker = new Worker(new URL("./commandCompiler.worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = ({ data }: MessageEvent<CompileCommandResponse>) => {
    const task = pending.get(data.id);
    if (!task) return;
    pending.delete(data.id);
    if (data.error !== undefined) task.reject(new Error(data.error));
    else task.resolve(data.code!);
  };
  worker.onerror = (event) => {
    event.preventDefault();
    failPending(new Error(event.message));
  };
  worker.onmessageerror = () => failPending(new Error("Invalid command compiler response"));
  return worker;
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
