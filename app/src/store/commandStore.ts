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
const PLUGIN_PANEL_WIDTHS_KEY = "pluginPanelWidths";
const COMMAND_PANEL_ANIMATION_MS = 220;

export const DEFAULT_PLUGIN_PANEL_WIDTH = 500;
export const MIN_PLUGIN_PANEL_WIDTH = 100;

let closeTimer: ReturnType<typeof setTimeout> | null = null;
let externalCommandLoadVersion = 0;
let externalCommandManifestSignature = "";
const externalCommandDirtyKeys = new Set<string>();

type ExternalCommandDirtyTarget = Pick<
  ExternalCommandRecord,
  "folder" | "entry" | "id"
>;

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

const readPluginPanelWidths = (): Record<string, number> => {
  const raw = window.localStorage.getItem(PLUGIN_PANEL_WIDTHS_KEY);
  if (!raw) return {};

  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const widths: Record<string, number> = {};
  Object.entries(value).forEach(([commandId, width]) => {
    if (
      commandId &&
      typeof width === "number" &&
      Number.isFinite(width) &&
      width >= MIN_PLUGIN_PANEL_WIDTH
    ) {
      widths[commandId] = Math.round(width);
    }
  });
  return widths;
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

const uniqueExternalCommandRecords = (
  records: ExternalCommandRecord[],
): ExternalCommandRecord[] => {
  const seenRecordKeys = new Set<string>();
  const seenIds = new Set<string>();
  const result: ExternalCommandRecord[] = [];

  records.forEach((record) => {
    const recordKey = getExternalCommandRecordKey(record);
    const id = record.id.trim();
    if (!recordKey || !id) return;
    if (seenRecordKeys.has(recordKey) || seenIds.has(id)) return;
    seenRecordKeys.add(recordKey);
    seenIds.add(id);
    result.push(record);
  });

  return result;
};

const uniqueExternalCommands = (
  commands: CommandDefinition[],
): CommandDefinition[] => {
  const seenKeys = new Set<string>();
  const seenIds = new Set<string>();
  const result: CommandDefinition[] = [];

  commands.forEach((command) => {
    const key = getExternalCommandKey(command);
    const id = command.id.trim();
    if (!id) return;
    if ((key && seenKeys.has(key)) || seenIds.has(id)) return;
    if (key) seenKeys.add(key);
    seenIds.add(id);
    result.push(command);
  });

  return result;
};

const createExternalCommandManifestSignature = (
  records: ExternalCommandRecord[],
) =>
  JSON.stringify(
    records.map((record) => ({
      folder: record.folder,
      entry: record.entry,
      serverEntry: record.serverEntry ?? "",
      id: record.id,
      title: record.title ?? "",
      titleKey: record.titleKey ?? "",
      description: record.description ?? "",
      descriptionKey: record.descriptionKey ?? "",
      keywords: record.keywords ?? [],
    })),
  );

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
  pluginPanelWidths: Record<string, number>;
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
  pluginPanelWidths: readPluginPanelWidths(),
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
  setPluginPanelWidth: (commandId: string, width: number) => {
    const id = commandId.trim();
    if (!id || !Number.isFinite(width) || width < MIN_PLUGIN_PANEL_WIDTH)
      return;
    commandState.pluginPanelWidths[id] = Math.round(width);
  },
  persistPluginPanelWidths: () => {
    window.localStorage.setItem(
      PLUGIN_PANEL_WIDTHS_KEY,
      JSON.stringify(commandState.pluginPanelWidths),
    );
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
  markExternalCommandDirty: (target: ExternalCommandDirtyTarget) => {
    const folder = target.folder.trim();
    const entry = target.entry.trim();
    const id = target.id.trim();
    if (!folder || !entry || !id) return;
    externalCommandDirtyKeys.add(
      getExternalCommandRecordKey({ folder, entry, id }),
    );
  },
  loadExternalCommands: async () => {
    const loadVersion = externalCommandLoadVersion + 1;
    externalCommandLoadVersion = loadVersion;
    try {
      const commands = await loadExternalCommands();
      if (loadVersion !== externalCommandLoadVersion) return;
      const filtered = uniqueExternalCommandRecords(
        commands.filter((item): item is ExternalCommandRecord =>
          Boolean(
            item && typeof item === "object" && typeof item.id === "string",
          ),
        ),
      );
      const validRecordKeys = new Set(filtered.map(getExternalCommandRecordKey));
      externalCommandDirtyKeys.forEach((key) => {
        if (!validRecordKeys.has(key)) externalCommandDirtyKeys.delete(key);
      });

      const nextSignature = createExternalCommandManifestSignature(filtered);
      if (
        externalCommandDirtyKeys.size === 0 &&
        nextSignature === externalCommandManifestSignature
      )
        return;

      const recordsToLoad: ExternalCommandRecord[] = [];
      const currentByKey = new Map(
        commandState.externalCommands.map((command) => [
          getExternalCommandKey(command),
          command,
        ]),
      );
      const nextCommands = filtered.map((record) => {
        const recordKey = getExternalCommandRecordKey(record);
        const current = externalCommandDirtyKeys.has(recordKey)
          ? undefined
          : currentByKey.get(recordKey);
        if (current && !current.loadError && !current.loading) return current;
        recordsToLoad.push(record);
        return createExternalCommandPlaceholder(record);
      });

      commandState.externalCommands.splice(
        0,
        commandState.externalCommands.length,
        ...uniqueExternalCommands(nextCommands),
      );

      void Promise.all(
        recordsToLoad.map(async (record) => {
          const mapped = await mapExternalCommand(record);
          if (loadVersion !== externalCommandLoadVersion) {
            return { record, mapped };
          }
          replaceExternalCommand(record, mapped);
          commandState.externalCommands.splice(
            0,
            commandState.externalCommands.length,
            ...uniqueExternalCommands(commandState.externalCommands),
          );
          return { record, mapped };
        }),
      ).then(async (loaded) => {
        if (loadVersion !== externalCommandLoadVersion) return;
        commandState.externalCommands.splice(
          0,
          commandState.externalCommands.length,
          ...uniqueExternalCommands(commandState.externalCommands),
        );
        const mapped = loaded.map((item) => item.mapped);
        const validIds = new Set(
          commandState.externalCommands
            .map((item) => item.id)
            .concat(mapped.map((item) => item.id)),
        );
        await cleanupExternalCommandSettings(validIds);
        loaded.forEach(({ record, mapped: command }) => {
          if (command.loadError) return;
          externalCommandDirtyKeys.delete(getExternalCommandRecordKey(record));
        });
        if (mapped.some((command) => command.loadError)) return;
        externalCommandManifestSignature = nextSignature;
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
