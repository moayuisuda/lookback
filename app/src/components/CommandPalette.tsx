import React, { useEffect, useMemo, useRef } from "react";
import { FileUp, Trash2, MousePointerClick } from "lucide-react";
import Input, { type InputRef } from "rc-input";
import { useSnapshot } from "valtio";
import { useMemoizedFn } from "ahooks";
import { useT } from "../i18n/useT";
import { commandActions, commandState } from "../store/commandStore";
import { globalActions, globalState } from "../store/globalStore";
import { isAcceleratorMatch } from "../utils/hotkeys";
import {
  canvasActions,
  canvasState,
  type CanvasText,
} from "../store/canvasStore";
import { getCommandContext, getCommands } from "../commands";
import { getCommandDescription, getCommandTitle } from "../commands/display";
import { importExternalCommand } from "../commands/importExternalCommand";
import type { CommandContext, CommandDefinition } from "../commands/types";
import { useClickOutside } from "../hooks/useClickOutside";
import { ConfirmModal } from "./ConfirmModal";
import { deleteExternalCommand } from "../service";
import { clsx } from "clsx";
import { ShortcutInput } from "./ShortcutInput";

type CommandResult = {
  kind: "command";
  command: CommandDefinition;
};

type TextResult = {
  kind: "text";
  item: CanvasText;
};

type ImageResult = {
  kind: "image";
  item: never;
  distance?: number;
};

type SearchResult = CommandResult | TextResult | ImageResult;

const normalizeQuery = (value: string) => value.trim().toLowerCase();

const isUiComponent = (
  ui: CommandDefinition["ui"],
): ui is React.FC<{ context: CommandContext }> => {
  return typeof ui === "function" || (typeof ui === "object" && ui !== null);
};

export const CommandPalette: React.FC = () => {
  const snap = useSnapshot(commandState, { sync: true });
  const globalSnap = useSnapshot(globalState);
  const canvasSnap = useSnapshot(canvasState);
  const { t } = useT();
  const inputRef = useRef<InputRef | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  void snap.externalCommands;
  const deleteTarget = snap.deleteTarget;

  useClickOutside(panelRef, () => {
    if (snap.isOpen) commandActions.close();
  });

  const handleImportCommand = async () => {
    await importExternalCommand(t);
  };

  const handleRequestDelete = (command: CommandDefinition) => {
    if (!command.external) return;
    commandActions.setDeleteTarget({
      id: command.id,
      title: getCommandTitle(command, t),
      folder: command.external.folder,
      entry: command.external.entry,
    });
  };

  const handleShortcutInvalid = useMemoizedFn(() => {
    globalActions.pushToast({ key: "toast.shortcutInvalid" }, "error");
  });

  const handleSetExternalCommandShortcut = useMemoizedFn(
    async (commandId: string, accelerator: string) => {
      await commandActions.setExternalCommandShortcut(commandId, accelerator);
    },
  );

  const handleToggleContextMenu = useMemoizedFn(async (commandId: string) => {
    await commandActions.toggleExternalCommandContextMenu(commandId);
  });

  const handleConfirmDelete = async () => {
    const target = snap.deleteTarget;
    if (!target) return;
    const result = await deleteExternalCommand(target.folder, target.entry);
    if (result.success) {
      await commandActions.clearExternalCommandShortcut(target.id);
      globalActions.pushToast({ key: "toast.commandDeleted" }, "success");
      void commandActions.loadExternalCommands();
    } else {
      globalActions.pushToast(
        {
          key: "toast.commandDeleteFailed",
          params: { error: result.error || "" },
        },
        "error",
      );
    }
    commandActions.setDeleteTarget(null);
  };

  useEffect(() => {
    if (!snap.isOpen) return;
    // 已有 activeCommandId 说明是从 contextmenu 直接触发 UI 命令，
    // 命令列表已加载过，跳过重新加载以避免模块实例被替换导致 ui 组件重挂载
    if (!snap.activeCommandId) {
      void commandActions.loadExternalCommands();
    }
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [snap.isOpen, snap.activeCommandId]);

  const commands = getCommands();
  const commandContext = getCommandContext();
  const query = normalizeQuery(snap.query);

  const commandResults = useMemo<CommandResult[]>(() => {
    if (!query) {
      return commands.map((command) => ({ kind: "command", command }));
    }
    return commands
      .filter((command) => {
        const title = normalizeQuery(getCommandTitle(command, t));
        const desc = normalizeQuery(getCommandDescription(command, t));
        const keywordHit = (command.keywords || []).some((k) =>
          normalizeQuery(k).includes(query),
        );
        return title.includes(query) || desc.includes(query) || keywordHit;
      })
      .map((command) => ({ kind: "command", command }));
  }, [commands, query, t]);

  const textResults = useMemo<TextResult[]>(() => {
    if (!query) return [];
    return canvasSnap.canvasItems
      .filter((item): item is CanvasText => item.type === "text")
      .filter((item) => normalizeQuery(item.text || "").includes(query))
      .map((item) => ({ kind: "text", item }));
  }, [canvasSnap.canvasItems, query]);

  const results: SearchResult[] = [...commandResults, ...textResults];

  const activeCommand = commands.find(
    (command) => command.id === snap.activeCommandId,
  );
  const activeUi = activeCommand?.ui;
  const isTaskUi = !!activeUi;

  useEffect(() => {
    if (!snap.isOpen) return;
    if (results.length === 0) {
      if (snap.selectedIndex !== 0) {
        commandActions.setSelectedIndex(0);
      }
      return;
    }
    if (snap.selectedIndex >= results.length) {
      commandActions.setSelectedIndex(0);
    }
  }, [snap.isOpen, results.length, snap.selectedIndex]);

  useEffect(() => {
    if (!snap.isOpen) return;
    if (isTaskUi) return;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [snap.isOpen, isTaskUi, snap.activeCommandId]);

  const handleConfirmSelection = async (result?: SearchResult) => {
    const current = result ?? results[snap.selectedIndex];
    if (!current) return;
    if (current.kind === "command") {
      const command = current.command;
      if (command.ui) {
        commandActions.setActiveCommand(command.id);
        return;
      }
      if (command.run) {
        await command.run(commandContext);
        commandActions.close();
        return;
      }
      return;
    }
    if (current.kind === "text") {
      canvasActions.panToCanvasItem(current.item.itemId);
      commandActions.close();
      return;
    }
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement> | KeyboardEvent,
  ) => {
    const isComposing =
      ("isComposing" in e && e.isComposing) ||
      ("keyCode" in e && e.keyCode === 229);
    if (e.key === "Escape") {
      e.preventDefault();
      if (snap.activeCommandId) {
        commandActions.setActiveCommand(null);
      } else {
        commandActions.close();
      }
      return;
    }

    // Only handle other keys if it's the input element
    if (!("target" in e) || (e.target as HTMLElement).tagName !== "INPUT")
      return;
    if (isComposing) return;

    const nativeEvent = "nativeEvent" in e ? e.nativeEvent : e;
    if (
      globalSnap.commandPaletteShortcut &&
      isAcceleratorMatch(nativeEvent, globalSnap.commandPaletteShortcut)
    ) {
      e.preventDefault();
      commandActions.close();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (results.length === 0) return;
      const next = (snap.selectedIndex + 1) % results.length;
      commandActions.setSelectedIndex(next);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (results.length === 0) return;
      const next = (snap.selectedIndex - 1 + results.length) % results.length;
      commandActions.setSelectedIndex(next);
      return;
    }
  };

  useEffect(() => {
    if (!snap.isOpen) return;
    if (!isTaskUi) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (snap.activeCommandId) {
          commandActions.setActiveCommand(null);
        } else {
          commandActions.close();
        }
        return;
      }

      if (
        globalSnap.commandPaletteShortcut &&
        isAcceleratorMatch(e, globalSnap.commandPaletteShortcut)
      ) {
        e.preventDefault();
        e.stopPropagation();
        commandActions.close();
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    snap.isOpen,
    isTaskUi,
    snap.activeCommandId,
    globalSnap.commandPaletteShortcut,
  ]);

  if (!snap.isOpen) return null;

  return (
    <>
      <div className="absolute inset-0 z-[9998] flex items-start justify-center bg-black/40 backdrop-blur-sm no-drag top-[32px]">
        <div
          ref={panelRef}
          className="relative mt-2 w-[640px] rounded-xl border border-neutral-800 bg-neutral-950/95 shadow-2xl overflow-hidden"
        >
          {isTaskUi ? (
            <>
              <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
                <span className="font-medium text-sm text-neutral-200">
                  {activeCommand ? getCommandTitle(activeCommand, t) : ""}
                </span>
                <button
                  type="button"
                  onClick={() => commandActions.setActiveCommand(null)}
                  className="text-xs text-neutral-400 hover:text-neutral-200"
                >
                  {t("commandPalette.back")}
                </button>
              </div>
              {isUiComponent(activeUi) ? (
                <div className="max-h-full overflow-y-auto dark-scrollbar">
                  {React.createElement(activeUi, {
                    context: commandContext,
                  })}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-neutral-800 flex items-center gap-3">
                <Input
                  ref={inputRef}
                  value={snap.query}
                  onChange={(e) => commandActions.setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPressEnter={(e: React.KeyboardEvent<HTMLInputElement>) => {
                    if (e.nativeEvent.isComposing) return;
                    void handleConfirmSelection();
                  }}
                  placeholder={t("commandPalette.placeholder")}
                  className="flex-1 bg-transparent text-sm text-neutral-100 outline-none placeholder:text-neutral-500"
                />
                <button
                  type="button"
                  onClick={handleImportCommand}
                  className="text-neutral-400 hover:text-neutral-200 p-1 rounded hover:bg-neutral-800 transition-colors"
                  title={t("commandPalette.import")}
                >
                  <FileUp size={16} />
                </button>
              </div>

              <div className="max-h-[360px] overflow-y-auto dark-scrollbar">
                {results.length === 0 && (
                  <div className="px-4 py-6 text-center text-xs text-neutral-500">
                    {t("commandPalette.empty")}
                  </div>
                )}
                {results.map((result, index) => {
                  const isActive = index === snap.selectedIndex;
                  if (result.kind === "command") {
                    return (
                      <div
                        key={result.command.id}
                        role="button"
                        tabIndex={0}
                        onMouseEnter={() =>
                          commandActions.setSelectedIndex(index)
                        }
                        onClick={() => void handleConfirmSelection(result)}
                        className={clsx(
                          "w-full px-4 py-3 text-left flex items-center justify-between gap-4 text-sm transition-colors",
                          isActive
                            ? "bg-neutral-800/70 text-white"
                            : "text-neutral-200",
                        )}
                      >
                        <div>
                          <div className="font-medium">
                            {getCommandTitle(result.command, t)}
                          </div>
                          {getCommandDescription(result.command, t) && (
                            <div className="text-xs text-neutral-500">
                              {getCommandDescription(result.command, t)}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase text-neutral-500">
                            {t("commandPalette.commandLabel")}
                          </span>
                          {result.command.external && (
                            <>
                              <div
                                className="group relative flex items-center"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ShortcutInput
                                  value={
                                    snap.externalCommandShortcuts[
                                      result.command.id
                                    ] ?? ""
                                  }
                                  onChange={(accelerator) =>
                                    void handleSetExternalCommandShortcut(
                                      result.command.id,
                                      accelerator,
                                    )
                                  }
                                  onInvalid={handleShortcutInvalid}
                                />
                                {snap.externalCommandShortcuts[
                                  result.command.id
                                ] && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void commandActions.clearExternalCommandShortcut(
                                        result.command.id,
                                      )
                                    }
                                    className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full border border-neutral-600 bg-neutral-900 text-[9px] leading-none text-neutral-300 hover:text-white hover:border-neutral-400 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto transition-colors"
                                    title={t("commandPalette.shortcutClear")}
                                    aria-label={t(
                                      "commandPalette.shortcutClear",
                                    )}
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleToggleContextMenu(
                                    result.command.id,
                                  );
                                }}
                                className={clsx(
                                  "p-1 rounded transition-colors",
                                  snap.externalCommandContextMenus[
                                    result.command.id
                                  ] === false
                                    ? "text-neutral-600 hover:text-neutral-400 hover:bg-neutral-800"
                                    : "text-primary hover:text-primary/80 hover:bg-primary/20",
                                )}
                                title={t("commandPalette.toggleContextMenu")}
                              >
                                <MousePointerClick size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRequestDelete(result.command);
                                }}
                                className="text-neutral-500 hover:text-red-400 p-1 rounded hover:bg-red-950/30 transition-colors"
                                title={t("commandPalette.delete")}
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  }
                  if (result.kind === "text") {
                    return (
                      <button
                        key={result.item.itemId}
                        type="button"
                        onMouseEnter={() =>
                          commandActions.setSelectedIndex(index)
                        }
                        onClick={() => void handleConfirmSelection(result)}
                        className={clsx(
                          "w-full px-4 py-3 text-left flex items-center justify-between gap-4 text-sm transition-colors",
                          isActive
                            ? "bg-neutral-800/70 text-white"
                            : "text-neutral-200",
                        )}
                      >
                        <div className="truncate">{result.item.text || ""}</div>
                        <span className="text-[10px] uppercase text-neutral-500">
                          {t("commandPalette.textLabel")}
                        </span>
                      </button>
                    );
                  }
                  return null;
                })}
              </div>
            </>
          )}
        </div>
      </div>
      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title={t("commandPalette.deleteTitle")}
        message={t("commandPalette.deleteMessage", {
          name: deleteTarget?.title || "",
        })}
        confirmText={t("common.confirm")}
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => commandActions.setDeleteTarget(null)}
      />
    </>
  );
};
