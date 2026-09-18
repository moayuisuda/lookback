import { parentPort } from "node:worker_threads";
import { pathToFileURL } from "node:url";
import type {
  PluginServerAction,
  PluginWorkerRequest,
  PluginWorkerResponse,
} from "./pluginRuntimeProtocol";

const registry = new Map<string, Map<string, PluginServerAction>>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object";

const collectActions = (module: unknown): Map<string, PluginServerAction> => {
  const source = isRecord(module) && isRecord(module.default)
    ? module.default
    : module;
  const actions = new Map<string, PluginServerAction>();
  if (!isRecord(source)) return actions;
  Object.entries(source).forEach(([name, value]) => {
    if (name !== "default" && typeof value === "function") {
      actions.set(name, value as PluginServerAction);
    }
  });
  return actions;
};

parentPort!.on("message", async (request: PluginWorkerRequest) => {
  let response: PluginWorkerResponse;
  try {
    if (request.type === "load") {
      const url = pathToFileURL(request.entryPath).href;
      const module = await import(`${url}?t=${Date.now()}`);
      const actions = collectActions(module);
      registry.set(request.pluginKey, actions);
      response = {
        id: request.id,
        success: true,
        actions: Array.from(actions.keys()),
      };
    } else {
      const action = registry.get(request.pluginKey)?.get(request.action);
      if (!action) throw new Error(`Plugin action not found: ${request.action}`);
      response = {
        id: request.id,
        success: true,
        result: await action(request.payload, request.context),
      };
    }
  } catch (error) {
    response = {
      id: request.id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  parentPort!.postMessage(response);
});
