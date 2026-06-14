import { proxy } from "valtio";
import {
  loadExternalCommands,
  settingStorage,
} from "../service";
import {
  createExternalCommandPlaceholder,
  getExternalCommandKey,
  getExternalCommandRecordKey,
  mapExternalCommand,
  type ExternalCommandRecord,
} from "../commands/external";
import type { CommandDefinition } from "../commands/types";
import { globalActions, getGlobalShortcutEntries } from "./globalStore";
import {
  findShortcutConflict,
  normalizeAcceleratorForConflict,
} from "../utils/shortcutConflicts";

const EXTERNAL_COMMAND_SHORTCUTS_KEY = "externalCommandShortcuts";
const EXTERNAL_COMMAND_CONTEXT_MENUS_KEY = "externalCommandContextMenus";
const COMMAND_PANEL_ANIMATION_MS = 220;

let closeTimer: ReturnType<typeof setTimeout> | null = null;
let externalCommandLoadVersion = 0;

const clearCloseTimer = () => {
  if (!closeTimer) return;
  clearTimeout(closeTimer);
  closeTimer = null;
};

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

const replaceExternalCommand = (
  record: ExternalCommandRecord,
  command: CommandDefinition,
) => {
  const recordKey = getExternalCommandRecordKey(record);
  const index = commandState.externalCommands.findIndex(
    (item) => getExternalCommandKey(item) === recordKey,
  );
  if (index < 0) return;
  commandState.externalCommands.splice(index, 1, command);
};

const cleanupExternalCommandSettings = async (validIds: Set<string>) => {
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
};

export const commandState = proxy<{
  isOpen: boolean;
  isClosing: boolean;
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
  isClosing: false,
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
    clearCloseTimer();
    commandState.isOpen = true;
    commandState.isClosing = false;
    commandState.query = "";
    commandState.selectedIndex = 0;
    commandState.activeCommandId = null;
    commandState.deleteTarget = null;
  },
  close: () => {
    if (!commandState.isOpen) {
      clearCloseTimer();
      commandState.isClosing = false;
      commandState.query = "";
      commandState.selectedIndex = 0;
      commandState.activeCommandId = null;
      commandState.deleteTarget = null;
      return;
    }
    if (commandState.isClosing) return;
    commandState.isClosing = true;
    commandState.deleteTarget = null;
    closeTimer = setTimeout(() => {
      closeTimer = null;
      commandActions.finishClose();
    }, COMMAND_PANEL_ANIMATION_MS);
  },
  finishClose: () => {
    clearCloseTimer();
    if (commandState.isOpen && !commandState.isClosing) return;
    commandState.isOpen = false;
    commandState.isClosing = false;
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
    const externalEntries = Object.entries(commandState.externalCommandShortcuts)
      .map(([entryId, entryShortcut]) => ({
        id: entryId,
        accelerator: entryShortcut,
      }));
    const conflict =
      findShortcutConflict(nextShortcut, externalEntries, id) ||
      findShortcutConflict(nextShortcut, getGlobalShortcutEntries());
    if (conflict) {
      globalActions.pushToast({ key: "toast.shortcutConflict" }, "error");
      return false;
    }
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
    const loadVersion = externalCommandLoadVersion + 1;
    externalCommandLoadVersion = loadVersion;
    try {
      const commands = await loadExternalCommands();
      if (loadVersion !== externalCommandLoadVersion) return;
      const filtered = commands.filter((item): item is ExternalCommandRecord =>
        Boolean(
          item && typeof item === "object" && typeof item.id === "string",
        ),
      );
      const recordsToLoad: ExternalCommandRecord[] = [];

      commandState.externalCommands.splice(
        0,
        commandState.externalCommands.length,
        ...filtered.map((record) => {
          recordsToLoad.push(record);
          return createExternalCommandPlaceholder(record);
        }),
      );

      void Promise.all(
        recordsToLoad.map(async (record) => {
          const mapped = await mapExternalCommand(record);
          if (loadVersion !== externalCommandLoadVersion) return mapped;
          replaceExternalCommand(record, mapped);
          return mapped;
        }),
      ).then(async (mapped) => {
        if (loadVersion !== externalCommandLoadVersion) return;
        const validIds = new Set(
          commandState.externalCommands
            .map((item) => item.id)
            .concat(mapped.map((item) => item.id)),
        );
        await cleanupExternalCommandSettings(validIds);
      });
    } catch (error) {
      void error;
    }
  },
  removeShortcutConflictsWithGlobalShortcuts: async () => {
    const reserved = new Set(
      getGlobalShortcutEntries()
        .map((entry) => normalizeAcceleratorForConflict(entry.accelerator))
        .filter(Boolean),
    );
    const seenExternal = new Set<string>();
    const nextShortcuts: Record<string, string> = {};
    let changed = false;

    Object.entries(commandState.externalCommandShortcuts).forEach(
      ([id, accelerator]) => {
        const normalized = normalizeAcceleratorForConflict(accelerator);
        if (!normalized) {
          changed = true;
          return;
        }
        if (reserved.has(normalized) || seenExternal.has(normalized)) {
          changed = true;
          return;
        }
        seenExternal.add(normalized);
        nextShortcuts[id] = accelerator;
      },
    );

    if (!changed) return;
    commandState.externalCommandShortcuts = nextShortcuts;
    await settingStorage.set(EXTERNAL_COMMAND_SHORTCUTS_KEY, nextShortcuts);
  },
};
