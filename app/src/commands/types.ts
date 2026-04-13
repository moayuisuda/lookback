import type { I18nKey } from '../../shared/i18n/types';
import type { canvasActions, canvasState } from '../store/canvasStore';
import type { globalActions, globalState } from '../store/globalStore';
import type { commandActions, commandState } from '../store/commandStore';
import type { useEnvState } from '../hooks/useEnvState';
import type { useT } from '../i18n/useT';
import type { i18nState } from '../store/i18nStore';
import type { ShellRequest, ShellResponse } from '../service';

export type CommandContext = {
  React: typeof import('react');
  hooks: {
    useEnvState: typeof useEnvState;
    useT: typeof useT;
  };
  actions: {
    canvasActions: typeof canvasActions;
    globalActions: typeof globalActions;
    commandActions: typeof commandActions;
  };
  store: {
    canvas: typeof canvasState;
    global: typeof globalState;
    command: typeof commandState;
    i18n: typeof i18nState;
  };
  config: {
    API_BASE_URL: string;
  };
  shell: (payload: ShellRequest) => Promise<ShellResponse>;
  components?: {
    ColorPicker?: React.FC<unknown>;
    CanvasButton?: React.FC<unknown>;
  };
};

export type CommandDefinition = {
  id: string;
  titleKey?: I18nKey;
  title?: string;
  descriptionKey?: I18nKey;
  description?: string;
  keywords?: string[];
  loadError?: string;
  ui?: React.FC<{ context: CommandContext }>;
  run?: (context: CommandContext) => Promise<void> | void;
  external?: {
    folder: string;
    entry: string;
  };
};
