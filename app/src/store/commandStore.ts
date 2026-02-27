import { proxy } from "valtio";
import { loadExternalCommands, settingStorage } from "../service";
import {
  mapExternalCommands,
  type ExternalCommandRecord,
} from "../commands/external";
import type { CommandDefinition } from "../commands/types";

const EXTERNAL_COMMAND_SHORTCUTS_KEY = "externalCommandShortcuts";
const EXTERNAL_COMMAND_CONTEXT_MENUS_KEY = "externalCommandContextMenus";

const normalizeShortcutMap = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== "object") return {};
  const next: Record<string, string> = {};
  Object.entries(value as Record<string, unknown>).forEach(([id, raw]) => {
    if (!id) return;
    if (typeof raw !== "string") return;
    const accelerator = raw.trim();
    if (!accelerator) return;
    next[id] = accelerator;
  });
  return next;
};

const normalizeContextMenuMap = (value: unknown): Record<string, boolean> => {
  if (!value || typeof value !== "object") return {};
  const next: Record<string, boolean> = {};
  Object.entries(value as Record<string, unknown>).forEach(([id, raw]) => {
    if (!id) return;
    if (typeof raw !== "boolean") return;
    next[id] = raw;
  });
  return next;
};

export const commandState = proxy<{
  isOpen: boolean;
  query: string;
  selectedIndex: number;
  activeCommandId: string | null;
  externalCommands: CommandDefinition[];
  externalCommandShortcuts: Record<string, string>;
  externalCommandContextMenus: Record<string, boolean>;
  deleteTarget: {
    id: string;
    title: string;
    folder: string;
    entry: string;
  } | null;
}>({
  isOpen: false,
  query: "",
  selectedIndex: 0,
  activeCommandId: null,
  externalCommands: [],
  externalCommandShortcuts: {},
  externalCommandContextMenus: {},
  deleteTarget: null,
});

export const commandActions = {
  hydrateSettings: async () => {
    const rawShortcuts = await settingStorage.get<Record<string, unknown>>({
      key: EXTERNAL_COMMAND_SHORTCUTS_KEY,
      fallback: {},
    });
    commandState.externalCommandShortcuts = normalizeShortcutMap(rawShortcuts);

    const rawContextMenus = await settingStorage.get<Record<string, unknown>>({
      key: EXTERNAL_COMMAND_CONTEXT_MENUS_KEY,
      fallback: {},
    });
    commandState.externalCommandContextMenus =
      normalizeContextMenuMap(rawContextMenus);
  },
  open: () => {
    commandState.isOpen = true;
    commandState.query = "";
    commandState.selectedIndex = 0;
    commandState.activeCommandId = null;
    commandState.deleteTarget = null;
  },
  close: () => {
    commandState.isOpen = false;
    commandState.query = "";
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
  setExternalCommandShortcut: async (
    commandId: string,
    accelerator: string,
  ) => {
    const id = commandId.trim();
    const nextShortcut = accelerator.trim();
    if (!id || !nextShortcut) return false;
    const next = {
      ...commandState.externalCommandShortcuts,
      [id]: nextShortcut,
    };
    commandState.externalCommandShortcuts = next;
    await settingStorage.set(EXTERNAL_COMMAND_SHORTCUTS_KEY, next);
    return true;
  },
  clearExternalCommandShortcut: async (commandId: string) => {
    const id = commandId.trim();
    if (!id) return;
    if (
      !Object.prototype.hasOwnProperty.call(
        commandState.externalCommandShortcuts,
        id,
      )
    )
      return;
    const next = { ...commandState.externalCommandShortcuts };
    delete next[id];
    commandState.externalCommandShortcuts = next;
    await settingStorage.set(EXTERNAL_COMMAND_SHORTCUTS_KEY, next);
  },
  toggleExternalCommandContextMenu: async (commandId: string) => {
    const id = commandId.trim();
    if (!id) return;
    const current = commandState.externalCommandContextMenus[id];
    // undefined or true means active, so toggle means if it's not false, we set to false
    const nextValue = current === false ? true : false;
    const next = {
      ...commandState.externalCommandContextMenus,
      [id]: nextValue,
    };
    commandState.externalCommandContextMenus = next;
    await settingStorage.set(EXTERNAL_COMMAND_CONTEXT_MENUS_KEY, next);
  },
  loadExternalCommands: async () => {
    try {
      const commands = await loadExternalCommands();
      const filtered = commands.filter((item): item is ExternalCommandRecord =>
        Boolean(
          item && typeof item === "object" && typeof item.id === "string",
        ),
      );
      const mapped = await mapExternalCommands(filtered);
      commandState.externalCommands = mapped;

      const validIds = new Set(mapped.map((item) => item.id));
      const nextShortcuts: Record<string, string> = {};
      const nextContextMenus: Record<string, boolean> = {};
      let changedShortcuts = false;
      let changedContextMenus = false;

      Object.entries(commandState.externalCommandShortcuts).forEach(
        ([id, accelerator]) => {
          if (validIds.has(id)) {
            nextShortcuts[id] = accelerator;
            return;
          }
          changedShortcuts = true;
        },
      );

      Object.entries(commandState.externalCommandContextMenus).forEach(
        ([id, show]) => {
          if (validIds.has(id)) {
            nextContextMenus[id] = show;
            return;
          }
          changedContextMenus = true;
        },
      );

      if (changedShortcuts) {
        commandState.externalCommandShortcuts = nextShortcuts;
        await settingStorage.set(EXTERNAL_COMMAND_SHORTCUTS_KEY, nextShortcuts);
      }

      if (changedContextMenus) {
        commandState.externalCommandContextMenus = nextContextMenus;
        await settingStorage.set(
          EXTERNAL_COMMAND_CONTEXT_MENUS_KEY,
          nextContextMenus,
        );
      }
    } catch (error) {
      void error;
    }
  },
};
