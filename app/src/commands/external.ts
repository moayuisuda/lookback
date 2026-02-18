import type { CommandContext, CommandDefinition } from './types';
import { loadCommandScript } from '../service';
import { transform } from 'sucrase';
import type { I18nDict, Locale } from '../../shared/i18n/types';
import { registerI18n } from '../../shared/i18n/t';

export type ExternalCommandRecord = {
  folder: string;
  entry: string;
  id: string;
};

type CommandModule = {
  run?: (context: CommandContext, helpers: CommandHelpers) => Promise<void> | void;
  ui?: React.FC<{ context: CommandContext }>;
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
    await copyText(value);
  },
  toast: (message: string) => {
    const text = message.trim();
    if (!text) return;
    context.actions.globalActions.pushToast({ key: 'toast.command.externalMessage', params: { message: text } });
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

const resolveModuleI18n = (module?: CommandModule): CommandI18n | undefined =>
  module?.i18n ?? module?.config?.i18n;

const hasI18nKey = (i18n: CommandI18n | undefined, key?: string): boolean => {
  if (!key) return false;
  return Boolean(i18n?.en?.[key] || i18n?.zh?.[key]);
};

export const mapExternalCommands = (
  payload: ExternalCommandRecord[],
): Promise<CommandDefinition[]> => {
  return Promise.all(
    payload.map(async (item) => {
      let module: CommandModule | undefined;
      try {
        module = await loadModule(item);
      } catch {
        return {
          id: item.id,
        };
      }

      if (!module?.config || !module.config.id) {
        return {
          id: item.id,
          external: {
            folder: item.folder,
            entry: item.entry,
          },
        };
      }

      const config = module.config;
      const hasRun = typeof module?.run === 'function';
      const i18n = resolveModuleI18n(module);
      if (i18n) registerI18n(i18n);
      const titleKey = config.titleKey ?? (hasI18nKey(i18n, config.title) ? config.title : undefined);
      const descriptionKey = config.descriptionKey ?? (hasI18nKey(i18n, config.description) ? config.description : undefined);

      return {
        id: config.id,
        titleKey,
        title: config.title,
        descriptionKey,
        description: config.description,
        keywords: config.keywords,
        ui: module?.ui,
        external: {
          folder: item.folder,
          entry: item.entry,
        },
        run: hasRun
          ? async (ctx: CommandContext) => {
              try {
                const mod = await loadModule(item);
                if (typeof mod.run === 'function') {
                  await mod.run(ctx, buildHelpers(ctx));
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
