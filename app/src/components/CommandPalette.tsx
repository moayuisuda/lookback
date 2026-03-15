import React, { useEffect, useMemo, useRef } from "react";
import {
  Copy,
  FileText,
  FileUp,
  MousePointerClick,
  Trash2,
  TriangleAlert,
} from "lucide-react";
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
import { Tooltip } from "./Tooltip";
import { writeTextToClipboard } from "../utils/clipboard";

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

  const handleOpenLlmTextModal = useMemoizedFn(() => {
    void commandActions.openLlmTextModal();
  });

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

  const handleCopyLlmText = useMemoizedFn(async () => {
    try {
      await commandActions.ensureLlmTextLoaded();
      const content = commandState.llmTextContent.trim();
      if (!content) {
        throw new Error(commandState.llmTextError || "Prompt unavailable");
      }
      await writeTextToClipboard(content);
      globalActions.pushToast({ key: "toast.llmTextCopied" }, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      globalActions.pushToast(
        {
          key: "toast.llmTextCopyFailed",
          params: { error: message },
        },
        "error",
      );
    }
  });

  const handleSaveLlmTextDraft = useMemoizedFn(async () => {
    const result = await commandActions.saveLlmTextDraft();
    if (result.success) {
      globalActions.pushToast(
        {
          key: "toast.llmTextImported",
          params: { id: result.id || "" },
        },
        "success",
      );
      commandActions.closeLlmTextModal();
      await commandActions.loadExternalCommands();
      return;
    }
    globalActions.pushToast(
      {
        key: "toast.llmTextImportFailed",
        params: { error: result.error || "" },
      },
      "error",
    );
  });

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
        const externalEntry = normalizeQuery(command.external?.entry || "");
        const loadError = normalizeQuery(command.loadError || "");
        const keywordHit = (command.keywords || []).some((k) =>
          normalizeQuery(k).includes(query),
        );
        return (
          title.includes(query) ||
          desc.includes(query) ||
          externalEntry.includes(query) ||
          loadError.includes(query) ||
          keywordHit
        );
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
  const isLlmTextView = snap.isLlmTextModalOpen;
  const isDetailView = isTaskUi || isLlmTextView;

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
      if (snap.isLlmTextModalOpen) {
        commandActions.closeLlmTextModal();
        return;
      }
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
      <div className="absolute inset-x-0 bottom-0 top-[32px] z-[9998] flex items-start justify-center overflow-y-auto bg-black/40 backdrop-blur-sm no-drag">
        <div
          ref={panelRef}
          className="relative mt-2 flex max-h-[calc(100vh-48px)] w-[min(640px,calc(100vw-16px))] flex-col rounded-xl border border-neutral-800 bg-neutral-950/95 shadow-2xl"
        >
          {isDetailView ? (
            <>
              <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
                <span className="font-medium text-sm text-neutral-200">
                  {isLlmTextView
                    ? t("commandPalette.llmText")
                    : activeCommand
                      ? getCommandTitle(activeCommand, t)
                      : ""}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (isLlmTextView) {
                      commandActions.closeLlmTextModal();
                      return;
                    }
                    commandActions.setActiveCommand(null);
                  }}
                  className="text-xs text-neutral-400 hover:text-neutral-200"
                >
                  {t("commandPalette.back")}
                </button>
              </div>
              {isLlmTextView ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 dark-scrollbar">
                    <ol className="text-xs leading-5 text-neutral-300">
                      <li>
                        {t("commandPalette.llmTextStep1Prefix")}
                        <button
                          type="button"
                          onClick={() => void handleCopyLlmText()}
                          disabled={snap.llmTextLoading}
                          className="mx-1 inline-flex items-center rounded-md bg-primary/16 px-1.5 py-0.5 text-[10px] font-semibold leading-4 text-primary transition-colors hover:bg-primary/24 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {t("commandPalette.llmTextCopy")}
                        </button>
                      </li>
                      <li>{t("commandPalette.llmTextStep2")}</li>
                      <li>{t("commandPalette.llmTextStep3")}</li>
                    </ol>
                    {snap.llmTextError && (
                      <p className="mt-3 rounded-lg border border-red-500/20 bg-red-950/30 px-3 py-2 text-xs text-red-200">
                        {t("commandPalette.llmTextLoadFailed", {
                          error: snap.llmTextError,
                        })}
                      </p>
                    )}
                    <textarea
                      value={snap.llmTextDraft}
                      onChange={(e) =>
                        commandActions.setLlmTextDraft(e.target.value)
                      }
                      placeholder={t("commandPalette.llmTextInputPlaceholder")}
                      className="mt-4 h-[320px] w-full resize-none rounded-xl bg-neutral-900/80 px-3 py-3 font-mono text-[12px] leading-6 text-neutral-100 outline-none transition-colors placeholder:text-neutral-500 focus:bg-neutral-900"
                      spellCheck={false}
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2 border-t border-neutral-800 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => commandActions.closeLlmTextModal()}
                      className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-neutral-800"
                    >
                      {t("common.cancel")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveLlmTextDraft()}
                      disabled={snap.llmTextSaving || !snap.llmTextDraft.trim()}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-black transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {snap.llmTextSaving
                        ? t("commandPalette.llmTextImportLoading")
                        : t("commandPalette.llmTextImport")}
                    </button>
                  </div>
                </div>
              ) : isUiComponent(activeUi) ? (
                <div className="min-h-0 flex-1 overflow-y-auto dark-scrollbar">
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
                  onClick={handleOpenLlmTextModal}
                  className="text-neutral-400 hover:text-neutral-200 p-1 rounded hover:bg-neutral-800 transition-colors"
                  title={t("commandPalette.llmText")}
                  aria-label={t("commandPalette.llmText")}
                >
                  <FileText size={16} />
                </button>
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
                    const isBrokenCommand = Boolean(result.command.loadError);
                    const externalEntry = result.command.external?.entry || "";
                    const description = getCommandDescription(
                      result.command,
                      t,
                    );
                    return (
                      <div
                        key={result.command.id}
                        role={isBrokenCommand ? undefined : "button"}
                        tabIndex={isBrokenCommand ? -1 : 0}
                        onMouseEnter={() =>
                          commandActions.setSelectedIndex(index)
                        }
                        onClick={() => {
                          if (isBrokenCommand) return;
                          void handleConfirmSelection(result);
                        }}
                        className={clsx(
                          "w-full px-4 py-3 text-left flex items-center justify-between gap-4 text-sm transition-colors",
                          isBrokenCommand
                            ? isActive
                              ? "bg-red-950/40 text-red-50"
                              : "text-red-100/90"
                            : isActive
                              ? "bg-neutral-800/70 text-white"
                              : "text-neutral-200",
                        )}
                      >
                        <div>
                          <div className="font-medium">
                            {getCommandTitle(result.command, t)}
                          </div>
                          {isBrokenCommand ? (
                            <div className="mt-1 space-y-1">
                              <div className="text-[11px] text-neutral-500">
                                {t("commandPalette.externalFile", {
                                  name: externalEntry,
                                })}
                              </div>
                              <div className="flex items-start gap-1.5 text-xs text-red-300 whitespace-pre-wrap break-words">
                                <TriangleAlert
                                  size={12}
                                  className="mt-0.5 shrink-0"
                                />
                                <span>
                                  {t("commandPalette.externalBrokenHint", {
                                    error: result.command.loadError || "",
                                  })}
                                </span>
                              </div>
                            </div>
                          ) : (
                            description && (
                              <div className="text-xs text-neutral-500">
                                {description}
                              </div>
                            )
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase text-neutral-500">
                            {t("commandPalette.commandLabel")}
                          </span>
                          {isBrokenCommand && (
                            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-red-200">
                              {t("commandPalette.externalBroken")}
                            </span>
                          )}
                          {result.command.external && (
                            <>
                              {!isBrokenCommand && (
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
                                        title={t(
                                          "commandPalette.shortcutClear",
                                        )}
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
                                    title={t(
                                      "commandPalette.toggleContextMenu",
                                    )}
                                  >
                                    <MousePointerClick size={14} />
                                  </button>
                                </>
                              )}
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
