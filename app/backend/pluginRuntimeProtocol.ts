export type PluginServerContext = {
  pluginKey: string;
  folder: string;
  apiPort: number;
  storageDir: string;
  commandDir: string;
  pluginDir: string;
};

export type PluginServerAction = (
  payload: unknown,
  context: PluginServerContext,
) => Promise<unknown> | unknown;

export type PluginWorkerRequest =
  | {
      id: number;
      type: "load";
      pluginKey: string;
      folder: string;
      entryPath: string;
    }
  | {
      id: number;
      type: "invoke";
      pluginKey: string;
      action: string;
      payload: unknown;
      context: PluginServerContext;
    };

export type PluginWorkerResponse = {
  id: number;
  success: boolean;
  actions?: string[];
  result?: unknown;
  error?: string;
};
