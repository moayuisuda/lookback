import type { I18nKey } from '../../shared/i18n/types';
import type { canvasActions } from '../store/canvasStore';
import type { globalActions } from '../store/globalStore';
import type { commandActions } from '../store/commandStore';
import type { useEnvState } from '../hooks/useEnvState';
import type { useT } from '../i18n/useT';
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
  ui?: React.FC<{ context: CommandContext }>;
  run?: (context: CommandContext) => Promise<void> | void;
  external?: {
    folder: string;
    entry: string;
  };
};
