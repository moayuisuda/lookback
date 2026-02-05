import type { CommandContext, CommandDefinition } from './types';
import { loadCommandScript } from '../service';
import { transform } from 'sucrase';

export type ExternalCommandRecord = {
  folder: string;
  entry: string;
  id: string;
};

type CommandModule = {
  run?: (context: CommandContext, helpers: CommandHelpers) => Promise<void> | void;
  ui?: React.FC<{ context: CommandContext }>;
  config?: {
    id: string;
    title?: string;
    description?: string;
    keywords?: string[];
  };
};

type CommandHelpers = {
  openExternal: (url: string) => Promise<void>;
  copyText: (text: string) => Promise<void>;
  toast: (message: string) => void;
  getInput: (fieldId: string, fallback?: string) => string;
  getInputs: () => Record<string, string>;
};

const copyText = async (text: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
};

const buildHelpers = (
  context: CommandContext,
  commandId: string
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
    await copyText(value);
  },
  toast: (message: string) => {
    const text = message.trim();
    if (!text) return;
    context.actions.globalActions.pushToast({ key: 'toast.command.externalMessage', params: { message: text } });
  },
  getInput: (fieldId: string, fallback?: string) => {
    if (!fieldId.trim()) return fallback ?? '';
    const inputs = context.state.commandState.commandInputs[commandId] ?? {};
    const value = inputs[fieldId];
    return typeof value === 'string' ? value : fallback ?? '';
  },
  getInputs: () => {
    const inputs = context.state.commandState.commandInputs[commandId] ?? {};
    return { ...inputs };
  },
});

const loadModule = async (
  record: ExternalCommandRecord,
): Promise<CommandModule> => {
  const script = await loadCommandScript(record.folder, record.entry);
  
  // Transpile JSX to JS
  const compiled = transform(script, {
    transforms: ['jsx'],
    production: true,
  }).code;

  const blob = new Blob([compiled], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  try {
    const module = await import(url);
    // Return the module namespace object directly, it matches CommandModule shape
    // (if it exports ui and run)
    return module as CommandModule;
  } finally {
    URL.revokeObjectURL(url);
  }
};

// Cache for loaded modules to avoid reloading script on every run/render
// This is a simple in-memory cache.
const moduleCache = new Map<string, CommandModule>();

const getOrLoadModule = async (
  record: ExternalCommandRecord,
): Promise<CommandModule> => {
  if (moduleCache.has(record.id)) {
    return moduleCache.get(record.id)!;
  }
  const module = await loadModule(record);
  moduleCache.set(record.id, module);
  return module;
};

export const mapExternalCommands = (
  payload: ExternalCommandRecord[],
): Promise<CommandDefinition[]> => {
  return Promise.all(
    payload.map(async (item) => {
      let module: CommandModule | undefined;
      try {
        module = await getOrLoadModule(item);
      } catch {
        return {
          id: item.id,
        };
      }

      if (!module?.config || !module.config.id) {
        return {
          id: item.id,
        };
      }

      const config = module.config;
      const hasRun = typeof module?.run === 'function';

      return {
        id: config.id,
        title: config.title,
        description: config.description,
        keywords: config.keywords,
        ui: module?.ui,
        run: hasRun
          ? async (ctx: CommandContext) => {
              try {
                const mod = await getOrLoadModule(item);
                if (typeof mod.run === 'function') {
                  await mod.run(ctx, buildHelpers(ctx, item.id));
                }
              } catch (error) {
                void error;
                ctx.actions.globalActions.pushToast(
                  { key: 'toast.command.scriptFailed' },
                  'error',
                );
              }
            }
          : undefined,
      };
    })
  );
};
