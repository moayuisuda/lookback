import { proxy } from 'valtio';
import { loadExternalCommands } from '../service';
import { mapExternalCommands, type ExternalCommandRecord } from '../commands/external';
import type { CommandDefinition } from '../commands/types';

export const commandState = proxy<{
  isOpen: boolean;
  query: string;
  selectedIndex: number;
  activeCommandId: string | null;
  externalCommands: CommandDefinition[];
  deleteTarget: {
    id: string;
    title: string;
    folder: string;
    entry: string;
  } | null;
}>({
  isOpen: false,
  query: '',
  selectedIndex: 0,
  activeCommandId: null,
  externalCommands: [],
  deleteTarget: null,
});

export const commandActions = {
  hydrateSettings: async () => {
    // No-op for now as we removed commandInputs
  },
  open: () => {
    commandState.isOpen = true;
    commandState.query = '';
    commandState.selectedIndex = 0;
    commandState.activeCommandId = null;
    commandState.deleteTarget = null;
  },
  close: () => {
    commandState.isOpen = false;
    commandState.query = '';
    commandState.selectedIndex = 0;
    commandState.activeCommandId = null;
    commandState.deleteTarget = null;
  },
  toggle: () => {
    if (commandState.isOpen) {
      commandActions.close();
    } else {
      commandActions.open();
    }
  },
  setQuery: (value: string) => {
    commandState.query = value;
    commandState.selectedIndex = 0;
  },
  setSelectedIndex: (index: number) => {
    commandState.selectedIndex = index;
  },
  setActiveCommand: (commandId: string | null) => {
    commandState.activeCommandId = commandId;
  },
  setDeleteTarget: (
    target: {
      id: string;
      title: string;
      folder: string;
      entry: string;
    } | null,
  ) => {
    commandState.deleteTarget = target;
  },
  loadExternalCommands: async () => {
    try {
      const commands = await loadExternalCommands();
      const filtered = commands.filter(
        (item): item is ExternalCommandRecord =>
          Boolean(item && typeof item === 'object' && typeof item.id === 'string'),
      );
      commandState.externalCommands = await mapExternalCommands(filtered);
    } catch (error) {
      void error;
    }
  },
};
