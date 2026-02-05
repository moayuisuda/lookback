import type { I18nKey } from '../../shared/i18n/types';
import type { canvasActions, canvasState } from '../store/canvasStore';
import type { globalActions, globalState } from '../store/globalStore';
import type { commandActions, commandState } from '../store/commandStore';
import type { useSnapshot } from 'valtio';

export type CommandContext = {
  React: typeof import('react');
  hooks: {
    useSnapshot: typeof useSnapshot;
  };
  state: {
    canvasState: typeof canvasState;
    globalState: typeof globalState;
    commandState: typeof commandState;
  };
  actions: {
    canvasActions: typeof canvasActions;
    globalActions: typeof globalActions;
    commandActions: typeof commandActions;
    emitContainCanvasItem: (detail: { id: string }) => void;
  };
  utils: {
    getRenderBbox: (width: number, height: number, rotation: number) => { offsetX: number; offsetY: number; width: number; height: number };
  };
  config: {
    API_BASE_URL: string;
  };
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
};
