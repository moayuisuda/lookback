import type { CommandContext, CommandDefinition } from './types';
import {
  ensureCommandDependencies,
  loadCommandScript,
  prepareCommandEsm,
} from '../service';
import { transform } from 'sucrase';
import type { I18nDict, Locale } from '../../shared/i18n/types';
import { registerI18n } from '../../shared/i18n/t';
import { writeTextToClipboard } from '../utils/clipboard';

export type ExternalCommandRecord = {
  folder: string;
  entry: string;
  serverEntry?: string;
  id: string;
  title?: string;
  titleKey?: string;
  description?: string;
  descriptionKey?: string;
  keywords?: string[];
  i18n?: CommandI18n;
};

type CommandModule = {
  run?: (context: CommandContext, helpers: CommandHelpers) => Promise<void> | void;
  ui?: React.FC<{ context: CommandContext; plugin?: CommandPluginClient }>;
  i18n?: CommandI18n;
  config?: {
    id: string;
    title?: string;
    titleKey?: string;
    description?: string;
    descriptionKey?: string;
    keywords?: string[];
    i18n?: CommandI18n;
  };
};

type CommandHelpers = {
  openExternal: (url: string) => Promise<void>;
  copyText: (text: string) => Promise<void>;
  toast: (message: string) => void;
};

type CommandI18n = Partial<Record<Locale, I18nDict>>;

type CommandPluginClient = {
  key: string;
  folder: string;
  actions: string[];
  invoke: <T = unknown>(action: string, payload?: unknown) => Promise<T>;
};

const INVALID_CONFIG_ERROR = 'Missing `export const config` or `config.id`.';
const ROOT_FOLDER = '__root__';

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (message) return message;
  }
  const message = String(error).trim();
  return message || 'Unknown error';
};

const buildHelpers = (
  context: CommandContext
): CommandHelpers => ({
  openExternal: async (url: string) => {
    const target = url.trim();
    if (!target) return;
    if (window.electron?.openExternal) {
      await window.electron.openExternal(target);
      return;
    }
    window.open(target, '_blank');
  },
  copyText: async (text: string) => {
    const value = text ?? '';
    if (!value) return;
    await writeTextToClipboard(value);
  },
  toast: (message: string) => {
    const text = message.trim();
    if (!text) return;
    context.actions.globalActions.pushToast({ key: 'toast.command.externalMessage', params: { message: text } });
  },
});

export const getExternalCommandRecordKey = (record: ExternalCommandRecord): string =>
  `${record.folder}\u0000${record.entry}\u0000${record.id}`;

const getExternalCommandPluginKey = (record: ExternalCommandRecord): string =>
  `${record.folder}:${record.id}`;

export const getExternalCommandKey = (command: CommandDefinition): string =>
  command.external
    ? getExternalCommandRecordKey({
        folder: command.external.folder,
        entry: command.external.entry,
        id: command.external.recordId ?? command.id,
      })
    : "";

export const createExternalCommandPlaceholder = (
  record: ExternalCommandRecord,
): CommandDefinition => {
  if (record.i18n) registerI18n(record.i18n);
  return {
    id: record.id,
    title: record.title || record.id,
    titleKey: record.titleKey,
    description: record.description,
    descriptionKey: record.descriptionKey,
    keywords: record.keywords,
    loading: true,
    external: {
      folder: record.folder,
      entry: record.entry,
      recordId: record.id,
    },
  };
};

const loadCommandPluginServer = async (
  record: ExternalCommandRecord,
  prepared: Awaited<ReturnType<typeof prepareCommandEsm>>,
): Promise<CommandPluginClient | undefined> => {
  if (!record.serverEntry || !prepared.serverEntryPath) return undefined;
  const pluginKey = getExternalCommandPluginKey(record);
  const loadResult = await window.electron?.loadCommandPluginServer({
    pluginKey,
    folder: record.folder,
    entryPath: prepared.serverEntryPath,
  });
  if (!loadResult?.success) {
    throw new Error(loadResult?.error || "Failed to load plugin server.");
  }
  const actions = loadResult.actions ?? [];
  return {
    key: pluginKey,
    folder: record.folder,
    actions,
    invoke: async <T = unknown>(action: string, payload?: unknown) => {
      const result = await window.electron?.invokeCommandPlugin({
        pluginKey,
        action,
        payload,
      });
      if (!result?.success) {
        throw new Error(result?.error || `Plugin action failed: ${action}`);
      }
      return result.result as T;
    },
  };
};

const loadFolderModule = async (
  record: ExternalCommandRecord,
): Promise<{ module: CommandModule; plugin?: CommandPluginClient }> => {
  await ensureCommandDependencies(record.folder);
  const result = await prepareCommandEsm(record.folder, record.entry);
  if (!result.entryUrl) {
    throw new Error('Prepared ESM entry is missing.');
  }
  const separator = result.entryUrl.includes('?') ? '&' : '?';
  const module = (await import(
    /* @vite-ignore */ `${result.entryUrl}${separator}t=${Date.now()}`
  )) as CommandModule;
  const plugin = await loadCommandPluginServer(record, result);
  return { module, plugin };
};

const loadModule = async (
  record: ExternalCommandRecord,
): Promise<{ module: CommandModule; plugin?: CommandPluginClient }> => {
  if (record.folder !== ROOT_FOLDER) {
    return loadFolderModule(record);
  }

  const script = await loadCommandScript(record.folder, record.entry);

  let compiled = '';
  try {
    compiled = transform(script, {
      transforms: ['jsx'],
      production: true,
    }).code;
  } catch (error) {
    throw new Error(`Compile failed: ${getErrorMessage(error)}`);
  }

  const blob = new Blob([compiled], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  try {
    return { module: (await import(/* @vite-ignore */ url)) as CommandModule };
  } catch (error) {
    throw new Error(`Module import failed: ${getErrorMessage(error)}`);
  } finally {
    URL.revokeObjectURL(url);
  }
};

const resolveModuleI18n = (module?: CommandModule): CommandI18n | undefined =>
  module?.i18n ?? module?.config?.i18n;

const hasI18nKey = (i18n: CommandI18n | undefined, key?: string): boolean => {
  if (!key) return false;
  return Boolean(i18n?.en?.[key] || i18n?.zh?.[key]);
};

export const mapExternalCommand = async (
  item: ExternalCommandRecord,
): Promise<CommandDefinition> => {
      let module: CommandModule | undefined;
      let plugin: CommandPluginClient | undefined;
      try {
        const loaded = await loadModule(item);
        module = loaded.module;
        plugin = loaded.plugin;
      } catch (error) {
        return {
          id: item.id,
          loadError: getErrorMessage(error),
          external: {
            folder: item.folder,
            entry: item.entry,
            recordId: item.id,
          },
        };
      }

      if (!module?.config || !module.config.id) {
        return {
          id: item.id,
          loadError: INVALID_CONFIG_ERROR,
          external: {
            folder: item.folder,
            entry: item.entry,
            recordId: item.id,
          },
        };
      }

      const config = module.config;
      const hasRun = typeof module?.run === 'function' || plugin?.actions.includes('run') === true;
      const i18n = resolveModuleI18n(module);
      if (i18n) registerI18n(i18n);
      const titleKey = config.titleKey ?? (hasI18nKey(i18n, config.title) ? config.title : undefined);
      const descriptionKey = config.descriptionKey ?? (hasI18nKey(i18n, config.description) ? config.description : undefined);
      const ui = module.ui
        ? ((props: { context: CommandContext }) =>
            module?.ui
              ? props.context.React.createElement(module.ui, { ...props, plugin })
              : null)
        : undefined;

      return {
        id: config.id,
        titleKey,
        title: config.title,
        descriptionKey,
        description: config.description,
        keywords: config.keywords,
        ui,
        external: {
          folder: item.folder,
          entry: item.entry,
          recordId: item.id,
        },
        run: hasRun
          ? async (ctx: CommandContext) => {
              try {
                const loaded = await loadModule(item);
                const mod = loaded.module;
                if (typeof mod.run === 'function') {
                  await mod.run(ctx, buildHelpers(ctx));
                  return;
                }
                if (loaded.plugin?.actions.includes('run')) {
                  await loaded.plugin.invoke('run', undefined);
                }
              } catch (error) {
                ctx.actions.globalActions.pushToast(
                  {
                    key: 'toast.command.scriptFailedWithReason',
                    params: { error: getErrorMessage(error) },
                  },
                  'error',
                );
              }
            }
          : undefined,
      };
};

export const mapExternalCommands = (
  payload: ExternalCommandRecord[],
): Promise<CommandDefinition[]> => {
  return Promise.all(payload.map(mapExternalCommand));
};
