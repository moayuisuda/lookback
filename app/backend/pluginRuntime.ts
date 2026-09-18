import { Worker } from "node:worker_threads";
import { getBundledWorkerPath } from "./workerPath";
import type {
  PluginServerContext,
  PluginWorkerRequest,
  PluginWorkerResponse,
} from "./pluginRuntimeProtocol";

type PendingRequest = {
  resolve: (response: PluginWorkerResponse) => void;
  reject: (error: Error) => void;
};

type PluginRuntime = {
  folder: string;
  entryPath: string;
  actions: string[];
  worker: Worker | null;
  loadedWorker: Worker | null;
  loadTask: Promise<string[]> | null;
  pending: Map<number, PendingRequest>;
};

const plugins = new Map<string, PluginRuntime>();
let nextId = 0;

const failPending = (plugin: PluginRuntime, current: Worker, error: Error) => {
  if (plugin.worker !== current) return;
  plugin.worker = null;
  plugin.loadedWorker = null;
  plugin.loadTask = null;
  plugin.pending.forEach(({ reject }) => reject(error));
  plugin.pending.clear();
};

const getWorker = (plugin: PluginRuntime): Worker => {
  if (plugin.worker) return plugin.worker;
  const current = new Worker(getBundledWorkerPath("pluginServerWorker.cjs"));
  plugin.worker = current;
  current.on("message", (response: PluginWorkerResponse) => {
    const task = plugin.pending.get(response.id);
    if (!task) return;
    plugin.pending.delete(response.id);
    task.resolve(response);
  });
  current.on("error", (error) => failPending(plugin, current, error));
  current.on("exit", (code) => {
    failPending(plugin, current, new Error(`Plugin runtime exited with code ${code}`));
  });
  current.unref();
  return current;
};

const request = (
  plugin: PluginRuntime,
  value: Omit<Extract<PluginWorkerRequest, { type: "load" }>, "id"> |
    Omit<Extract<PluginWorkerRequest, { type: "invoke" }>, "id">,
): Promise<PluginWorkerResponse> => {
  const current = getWorker(plugin);
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    plugin.pending.set(id, { resolve, reject });
    try {
      current.postMessage({ ...value, id } as PluginWorkerRequest);
    } catch (error) {
      plugin.pending.delete(id);
      reject(error);
    }
  });
};

const ensureLoaded = (pluginKey: string, plugin: PluginRuntime): Promise<string[]> => {
  if (plugin.loadedWorker && plugin.loadedWorker === plugin.worker) {
    return Promise.resolve(plugin.actions);
  }
  if (plugin.loadTask) return plugin.loadTask;

  const current = getWorker(plugin);
  const task = request(plugin, {
    type: "load",
    pluginKey,
    folder: plugin.folder,
    entryPath: plugin.entryPath,
  }).then((response) => {
    if (!response.success) throw new Error(response.error || "Failed to load plugin server");
    if (plugin.worker !== current) throw new Error("Plugin runtime restarted during load");
    plugin.actions = response.actions ?? [];
    plugin.loadedWorker = current;
    return plugin.actions;
  });
  plugin.loadTask = task;
  void task.finally(() => {
    if (plugin.loadTask === task) plugin.loadTask = null;
  }).catch(() => {});
  return task;
};

export const pluginRuntime = {
  load: (pluginKey: string, folder: string, entryPath: string): Promise<string[]> => {
    let plugin = plugins.get(pluginKey);
    if (!plugin) {
      plugin = {
        folder,
        entryPath,
        actions: [],
        worker: null,
        loadedWorker: null,
        loadTask: null,
        pending: new Map(),
      };
      plugins.set(pluginKey, plugin);
    }
    if (plugin.folder !== folder || plugin.entryPath !== entryPath) {
      if (plugin.worker) {
        const previous = plugin.worker;
        failPending(plugin, previous, new Error("Plugin source changed during execution"));
        void previous.terminate();
      }
      plugin.folder = folder;
      plugin.entryPath = entryPath;
      plugin.loadTask = null;
    }
    return ensureLoaded(pluginKey, plugin);
  },
  getFolder: (pluginKey: string) => plugins.get(pluginKey)?.folder,
  invoke: async (
    pluginKey: string,
    action: string,
    payload: unknown,
    context: PluginServerContext,
  ) => {
    const plugin = plugins.get(pluginKey);
    if (!plugin) throw new Error(`Plugin action not found: ${action}`);
    const actions = await ensureLoaded(pluginKey, plugin);
    if (!actions.includes(action)) throw new Error(`Plugin action not found: ${action}`);
    const response = await request(plugin, {
      type: "invoke",
      pluginKey,
      action,
      payload,
      context,
    });
    if (!response.success) throw new Error(response.error || "Plugin action failed");
    return response.result;
  },
};
