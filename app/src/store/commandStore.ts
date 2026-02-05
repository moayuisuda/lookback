import { proxy } from 'valtio';
import { getSettingsSnapshot, loadExternalCommands, readSetting, settingStorage } from '../service';
import { mapExternalCommands, type ExternalCommandRecord } from '../commands/external';
import type { CommandDefinition } from '../commands/types';

export const commandState = proxy<{
  isOpen: boolean;
  query: string;
  selectedIndex: number;
  activeCommandId: string | null;
  commandInputs: Record<string, Record<string, string>>;
  externalCommands: CommandDefinition[];
}>({
  isOpen: false,
  query: '',
  selectedIndex: 0,
  activeCommandId: null,
  commandInputs: {},
  externalCommands: [],
});

export const commandActions = {
  hydrateSettings: async () => {
    try {
      const settings = await getSettingsSnapshot();
      const rawInputs = readSetting<unknown>(settings, 'commandInputs', {});
      const nextInputs: Record<string, Record<string, string>> = {};
      if (rawInputs && typeof rawInputs === 'object') {
        Object.entries(rawInputs as Record<string, unknown>).forEach(([key, value]) => {
          if (!key.trim() || !value || typeof value !== 'object') return;
          const row: Record<string, string> = {};
          Object.entries(value as Record<string, unknown>).forEach(([field, fieldValue]) => {
            if (!field.trim() || typeof fieldValue !== 'string') return;
            row[field] = fieldValue;
          });
          if (Object.keys(row).length > 0) {
            nextInputs[key] = row;
          }
        });
      }
      commandState.commandInputs = nextInputs;
    } catch (error) {
      void error;
    }
  },
  open: () => {
    commandState.isOpen = true;
    commandState.query = '';
    commandState.selectedIndex = 0;
    commandState.activeCommandId = null;
  },
  close: () => {
    commandState.isOpen = false;
    commandState.query = '';
    commandState.selectedIndex = 0;
    commandState.activeCommandId = null;
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
  setCommandInput: async (commandId: string, fieldId: string, value: string) => {
    if (!commandId.trim() || !fieldId.trim()) return;
    const current = commandState.commandInputs[commandId] ?? {};
    commandState.commandInputs = {
      ...commandState.commandInputs,
      [commandId]: {
        ...current,
        [fieldId]: value,
      },
    };
    await settingStorage.set('commandInputs', commandState.commandInputs);
  },
  setActiveCommand: (commandId: string | null) => {
    commandState.activeCommandId = commandId;
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
