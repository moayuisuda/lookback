import React, { useEffect, useRef, useState } from "react";
import {
  Minus,
  Square,
  X,
  Settings,
  Ghost,
  Plus,
  Trash2,
  Edit2,
  Check,
  ChevronDown,
} from "lucide-react";
import { clsx } from "clsx";
import { globalActions, globalState } from "../store/globalStore";
import { canvasActions, canvasState } from "../store/canvasStore";
import { THEME } from "../theme";
import { useSnapshot } from "valtio";
import { useT } from "../i18n/useT";
import { useClickOutside } from "../hooks/useClickOutside";
import {
  listCanvases,
  createCanvas,
  renameCanvas,
  deleteCanvas,
  type CanvasMeta,
} from "../service";
import { ShortcutInput } from "./ShortcutInput";
import { ConfirmModal } from "./ConfirmModal";

export const TitleBar: React.FC = () => {
  const snap = useSnapshot(globalState);
  const { t, locale, setLocale } = useT();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [canvasMenuOpen, setCanvasMenuOpen] = useState(false);
  const [storageDir, setStorageDir] = useState("");
  const [loadingStorageDir, setLoadingStorageDir] = useState(false);
  const [updatingStorageDir, setUpdatingStorageDir] = useState(false);
  const [isWindowActive, setIsWindowActive] = useState(true);

  const canvasMenuRef = useRef<HTMLDivElement>(null);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);
  const settingsMenuRef = useRef<HTMLDivElement>(null);

  useClickOutside(canvasMenuRef, () => setCanvasMenuOpen(false));
  useClickOutside<HTMLElement>([settingsBtnRef, settingsMenuRef], () =>
    setSettingsOpen(false),
  );

  const canvasSnap = useSnapshot(canvasState);
  const [canvases, setCanvases] = useState<CanvasMeta[]>([]);
  const [newCanvasName, setNewCanvasName] = useState("");
  const [isCreatingCanvas, setIsCreatingCanvas] = useState(false);
  const [editingCanvas, setEditingCanvas] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const refreshCanvases = async () => {
    try {
      const list = await listCanvases();
      setCanvases(list);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (settingsOpen) {
      void loadStorageDir();
    }
  }, [settingsOpen]);

  useEffect(() => {
    if (canvasMenuOpen) {
      void refreshCanvases();
    }
  }, [canvasMenuOpen]);

  const handleCreateCanvas = async () => {
    if (!newCanvasName.trim()) return;
    try {
      await createCanvas(newCanvasName);
      setNewCanvasName("");
      setIsCreatingCanvas(false);
      await refreshCanvases();
    } catch (e) {
      console.error(e);
      globalActions.pushToast({ key: "toast.createCanvasFailed" }, "error");
    }
  };

  const handleSwitchCanvas = async (name: string) => {
    await canvasActions.switchCanvas(name);
  };

  const [deleteConfirmCanvas, setDeleteConfirmCanvas] = useState<string | null>(
    null,
  );

  const handleDeleteCanvas = (name: string) => {
    setDeleteConfirmCanvas(name);
  };

  const handleConfirmDelete = async () => {
    const name = deleteConfirmCanvas;
    if (!name) return;
    setDeleteConfirmCanvas(null);

    try {
      canvasActions.cancelPendingSave();

      if (canvasSnap.currentCanvasName === name) {
        const list = await listCanvases();
        const next = list.find((c) => c.name !== name);
        if (next) {
          await canvasActions.switchCanvas(next.name, true);
        }
      }

      await deleteCanvas(name);
      globalActions.pushToast({ key: "toast.canvasDeleted" }, "success");
      await refreshCanvases();

      if (canvasSnap.currentCanvasName === name) {
        const list = await listCanvases();
        if (list.length > 0) {
          await canvasActions.switchCanvas(list[0].name, true);
        }
      }
    } catch (e) {
      console.error(e);
      globalActions.pushToast({ key: "toast.deleteCanvasFailed" }, "error");
    }
  };

  const handleRenameCanvas = async () => {
    if (!editingCanvas || !editingName.trim()) return;
    try {
      await renameCanvas(editingCanvas, editingName);
      setEditingCanvas(null);
      setEditingName("");
      await refreshCanvases();
      if (canvasSnap.currentCanvasName === editingCanvas) {
        await canvasActions.switchCanvas(editingName);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadStorageDir = async () => {
    if (!window.electron?.getStorageDir) return;
    setLoadingStorageDir(true);
    try {
      const dir = await window.electron.getStorageDir();
      setStorageDir(dir);
    } finally {
      setLoadingStorageDir(false);
    }
  };

  useEffect(() => {
    const handleFocus = () => setIsWindowActive(true);
    const handleBlur = () => setIsWindowActive(false);
    const handleVisibilityChange = () => {
      setIsWindowActive(!document.hidden);
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    handleVisibilityChange();

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const handleToggleSettings = () => {
    setSettingsOpen((prev) => {
      const next = !prev;
      window.electron?.setSettingsOpen?.(next);
      return next;
    });
  };

  const handleChangeStorageDir = async () => {
    if (!window.electron?.chooseStorageDir) return;
    setUpdatingStorageDir(true);
    try {
      const dir = await window.electron.chooseStorageDir();
      if (dir) {
        setStorageDir(dir);
      }
    } finally {
      setUpdatingStorageDir(false);
    }
  };

  const handleToggleMouseThrough = () => {
    const next = !snap.mouseThrough;
    globalActions.setMouseThrough(next);
  };

  const handleShortcutInvalid = () => {
    globalActions.pushToast({ key: "toast.shortcutInvalid" }, "error");
  };

  const handleSetToggleWindowShortcut = async (accelerator: string) => {
    await globalActions.setToggleWindowShortcut(accelerator);
  };

  const handleSetCanvasOpacityUpShortcut = async (accelerator: string) => {
    await globalActions.setCanvasOpacityUpShortcut(accelerator);
  };

  const handleSetCanvasOpacityDownShortcut = async (accelerator: string) => {
    await globalActions.setCanvasOpacityDownShortcut(accelerator);
  };

  const handleSetToggleMouseThroughShortcut = async (accelerator: string) => {
    await globalActions.setToggleMouseThroughShortcut(accelerator);
  };

  const handleSetCanvasGroupShortcut = async (accelerator: string) => {
    await globalActions.setCanvasGroupShortcut(accelerator);
  };

  const handleSetCommandPaletteShortcut = async (accelerator: string) => {
    await globalActions.setCommandPaletteShortcut(accelerator);
  };

  useEffect(() => {
    const cleanup = window.electron?.onRendererEvent?.((event: string) => {
      if (event === "toggle-mouse-through") {
        if (globalState.pinMode) {
          globalActions.setMouseThrough(!globalState.mouseThrough);
        }
      }
    });
    return cleanup;
  }, []);

  const titleBarRef = useRef<HTMLDivElement>(null);
  const isIgnoringMouseRef = useRef(false);
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!snap.mouseThrough) return;

    // Initial state assumption: when entering mouseThrough, it's ignored (true)
    // Force set once to ensure state sync
    window.electron?.setIgnoreMouseEvents?.(true, { forward: true });
    isIgnoringMouseRef.current = true;

    const checkAndSetIgnore = (clientX: number, clientY: number) => {
      if (!titleBarRef.current) return;

      const rect = titleBarRef.current.getBoundingClientRect();
      const inTitleBar =
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom;

      if (inTitleBar) {
        if (isIgnoringMouseRef.current) {
          window.electron?.setIgnoreMouseEvents?.(false);
          isIgnoringMouseRef.current = false;
        }
      } else {
        if (!isIgnoringMouseRef.current) {
          window.electron?.setIgnoreMouseEvents?.(true, { forward: true });
          isIgnoringMouseRef.current = true;
        }
      }
    };

    const handleGlobalMouseMove = (e: MouseEvent) => {
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      checkAndSetIgnore(e.clientX, e.clientY);
    };

    window.addEventListener("mousemove", handleGlobalMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
    };
  }, [snap.mouseThrough]);

  const handleCanvasOpacityChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const val = parseFloat(e.target.value);
    globalActions.setCanvasOpacity(val);
  };

  return (
    <div className="flex w-full">
      <div
        ref={titleBarRef}
        className={clsx(
          "relative z-[100] bg-neutral-900 h-8 transition-all inline-flex items-center select-none border-b border-neutral-800",
          snap.mouseThrough
            ? "justify-start rounded-tr-xl w-auto flex-none"
            : "justify-between w-auto flex-1 pr-2 pl-2",
          // Padding adjustment for visual consistency
          snap.mouseThrough ? "px-2" : "",
        )}
      >
        {/* Draggable area - leaves top 8px (top-2) for window resizing */}
        <div className="absolute inset-x-0 bottom-0 top-2 draggable" />

        <div className="relative z-10 flex items-center gap-2 text-neutral-400 text-xs font-bold mr-2">
          <span
            style={{
              color: isWindowActive ? THEME.primary : "#6b7280",
            }}
          >
            LookBack
          </span>
        </div>

        <div className="relative z-10 flex items-center gap-1 no-drag">
          <div className="relative" ref={canvasMenuRef}>
            <button
              onClick={() => setCanvasMenuOpen(!canvasMenuOpen)}
              className={clsx(
                "flex items-center gap-1 px-2 py-1 hover:bg-neutral-800 rounded transition-colors max-w-[160px]",
                canvasMenuOpen && "bg-neutral-800",
              )}
              title={t("settings.canvas")}
            >
              <span className="truncate text-[10px] font-medium">
                {canvasSnap.currentCanvasName || t("common.notSet")}
              </span>
              <ChevronDown size={10} className="shrink-0" />
            </button>

            {canvasMenuOpen && (
              <div
                className={clsx(
                  "absolute top-8 mt-1 w-64 rounded border border-neutral-700 bg-neutral-900/95 shadow-lg p-3 text-xs text-neutral-200 no-drag z-[110]",
                  snap.mouseThrough ? "left-0" : "right-0",
                )}
              >
                <div className="space-y-1">
                  <div className="text-[11px] text-neutral-400 flex justify-between items-center">
                    <span>{t("settings.canvas")}</span>
                    <button
                      onClick={() => setIsCreatingCanvas(true)}
                      className="p-1 hover:bg-neutral-800 rounded"
                      title={t("settings.canvas.create")}
                    >
                      <Plus size={12} />
                    </button>
                  </div>

                  {isCreatingCanvas && (
                    <div className="flex gap-1 mb-2">
                      <input
                        className="flex-1 bg-neutral-800 text-[10px] px-2 py-1 rounded border border-neutral-700 outline-none focus:border-blue-500"
                        value={newCanvasName}
                        onChange={(e) => setNewCanvasName(e.target.value)}
                        placeholder={t("settings.canvas.placeholder")}
                        onKeyDown={(e) =>
                          e.key === "Enter" && handleCreateCanvas()
                        }
                        autoFocus
                      />
                      <button
                        onClick={handleCreateCanvas}
                        className="p-1 hover:bg-neutral-700 rounded text-green-500"
                      >
                        <Check size={12} />
                      </button>
                      <button
                        onClick={() => setIsCreatingCanvas(false)}
                        className="p-1 hover:bg-neutral-700 rounded text-neutral-400"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}

                  <div className="max-h-32 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                    {canvases.map((c) => (
                      <div
                        key={c.name}
                        className={clsx(
                          "flex items-center justify-between p-1 rounded group",
                          canvasSnap.currentCanvasName === c.name
                            ? "bg-neutral-800"
                            : "hover:bg-neutral-800/50 text-neutral-300",
                        )}
                        style={{
                          color:
                            canvasSnap.currentCanvasName === c.name
                              ? THEME.primary
                              : undefined,
                        }}
                      >
                        {editingCanvas === c.name ? (
                          <div className="flex flex-1 gap-1 items-center">
                            <input
                              className="flex-1 bg-neutral-900 text-[10px] px-1 rounded border border-neutral-700 outline-none"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) =>
                                e.key === "Enter" && handleRenameCanvas()
                              }
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                            <button
                              onClick={handleRenameCanvas}
                              className="text-green-500 hover:text-green-400"
                            >
                              <Check size={10} />
                            </button>
                            <button
                              onClick={() => setEditingCanvas(null)}
                              className="text-neutral-500 hover:text-neutral-400"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        ) : (
                          <>
                            <div
                              className="flex-1 truncate text-[10px] cursor-pointer"
                              onClick={() => {
                                handleSwitchCanvas(c.name);
                                setCanvasMenuOpen(false);
                              }}
                            >
                              {c.name}
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingCanvas(c.name);
                                  setEditingName(c.name);
                                }}
                                className="p-0.5 hover:text-white text-neutral-500"
                                title={t("settings.canvas.rename")}
                              >
                                <Edit2 size={10} />
                              </button>
                              {canvases.length > 1 && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteCanvas(c.name);
                                  }}
                                  className="p-0.5 hover:text-red-400 text-neutral-500"
                                  title={t("settings.canvas.deleteConfirm")}
                                >
                                  <Trash2 size={10} />
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {!snap.mouseThrough && (
            <>
              <div className="w-px h-4 bg-neutral-700 mx-1" />
              <button
                ref={settingsBtnRef}
                onClick={handleToggleSettings}
                className={clsx(
                  "p-1 hover:bg-neutral-800 rounded transition-colors",
                  settingsOpen && "bg-neutral-800",
                )}
                style={{ color: settingsOpen ? THEME.primary : undefined }}
                title={t("titleBar.settings")}
              >
                <Settings size={14} />
              </button>
            </>
          )}
          <button
            onClick={handleToggleMouseThrough}
            className="p-1 hover:bg-neutral-800 rounded transition-colors"
            style={{ color: snap.mouseThrough ? THEME.primary : undefined }}
            title={t("titleBar.mouseThrough")}
          >
            <Ghost size={14} />
          </button>
          <div className="w-px h-4 bg-neutral-700 mx-1" />
          <button
            onClick={() => window.electron?.min()}
            className="p-1 hover:bg-neutral-800 rounded transition-colors"
          >
            <Minus size={14} />
          </button>
          <button
            onClick={() => window.electron?.max()}
            className="p-1 hover:bg-neutral-800 rounded transition-colors"
          >
            <Square size={14} />
          </button>
          <button
            onClick={() => window.electron?.close()}
            className="p-1 hover:bg-red-900 hover:text-red-200 rounded transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {settingsOpen && (
          <div
            ref={settingsMenuRef}
            className={clsx(
              "absolute top-8 mt-1 w-80 rounded border border-neutral-700 bg-neutral-900/95 shadow-lg p-3 text-xs text-neutral-200 no-drag flex flex-col gap-3 max-h-[85vh] overflow-y-auto custom-scrollbar",
              snap.mouseThrough ? "left-0" : "right-2",
            )}
          >
            <div className="font-semibold px-1">{t("titleBar.settings")}</div>

            <div className="bg-neutral-800/30 p-2 rounded border border-neutral-800">
              <div className="text-[11px] text-neutral-400 mb-1">
                {t("titleBar.dataFolder")}
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="flex-1 truncate text-[10px] text-neutral-300"
                  title={storageDir || t("titleBar.dataFolder.default")}
                >
                  {loadingStorageDir
                    ? t("common.loading")
                    : storageDir || t("titleBar.dataFolder.default")}
                </div>
                <button
                  onClick={handleChangeStorageDir}
                  disabled={updatingStorageDir}
                  className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-[10px] disabled:opacity-60 border border-neutral-700 transition-colors"
                >
                  {t("titleBar.change")}
                </button>
              </div>
            </div>

            <div className="bg-neutral-800/30 p-2 rounded border border-neutral-800">
              <div className="text-[11px] text-neutral-400 mb-1">
                {t("common.language")}
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setLocale("en")}
                  className={clsx(
                    "flex-1 py-1 rounded text-[10px] transition-colors border",
                    locale === "en"
                      ? "bg-neutral-700 text-white border-neutral-600"
                      : "bg-neutral-800 hover:bg-neutral-700 text-neutral-400 border-transparent hover:border-neutral-700",
                  )}
                >
                  {t("common.language.en")}
                </button>
                <button
                  type="button"
                  onClick={() => setLocale("zh")}
                  className={clsx(
                    "flex-1 py-1 rounded text-[10px] transition-colors border",
                    locale === "zh"
                      ? "bg-neutral-700 text-white border-neutral-600"
                      : "bg-neutral-800 hover:bg-neutral-700 text-neutral-400 border-transparent hover:border-neutral-700",
                  )}
                >
                  {t("common.language.zh")}
                </button>
              </div>
            </div>

            <div className="bg-neutral-800/30 p-2 rounded border border-neutral-800 space-y-2">
              <div className="text-[11px] text-neutral-400">
                {t("titleBar.window")}
              </div>
              <div className="flex flex-col gap-1 pt-1 border-t border-neutral-800/50">
                <div className="flex justify-between text-[10px]">
                  <span>{t("titleBar.canvasOpacity")}</span>
                  <span>{snap.canvasOpacity.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.1"
                  value={snap.canvasOpacity}
                  onChange={handleCanvasOpacityChange}
                  style={
                    {
                      "--thumb-color": THEME.primary,
                    } as React.CSSProperties
                  }
                  className={clsx(
                    "w-full h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer",
                    "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full",
                    "[&::-webkit-slider-thumb]:bg-[var(--thumb-color)]",
                  )}
                />
              </div>
            </div>

            <div className="bg-neutral-800/30 p-2 rounded border border-neutral-800 space-y-2">
              <div className="text-[11px] text-neutral-400">
                {t("titleBar.shortcuts")}
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-neutral-300">
                    {t("titleBar.toggleWindowVisibility")}
                  </span>
                  <div className="flex items-center gap-1">
                    <ShortcutInput
                      value={snap.toggleWindowShortcut}
                      onChange={(accel) =>
                        void handleSetToggleWindowShortcut(accel)
                      }
                      onInvalid={handleShortcutInvalid}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-neutral-300">
                    {t("titleBar.commandPalette")}
                  </span>
                  <ShortcutInput
                    value={snap.commandPaletteShortcut}
                    onChange={(accel) =>
                      void handleSetCommandPaletteShortcut(accel)
                    }
                    onInvalid={handleShortcutInvalid}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-neutral-300">
                    {t("titleBar.canvasOpacityUp")}
                  </span>
                  <ShortcutInput
                    value={snap.canvasOpacityUpShortcut}
                    onChange={(accel) =>
                      void handleSetCanvasOpacityUpShortcut(accel)
                    }
                    onInvalid={handleShortcutInvalid}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-neutral-300">
                    {t("titleBar.canvasOpacityDown")}
                  </span>
                  <ShortcutInput
                    value={snap.canvasOpacityDownShortcut}
                    onChange={(accel) =>
                      void handleSetCanvasOpacityDownShortcut(accel)
                    }
                    onInvalid={handleShortcutInvalid}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-neutral-300">
                    {t("titleBar.canvasGroup")}
                  </span>
                  <ShortcutInput
                    value={snap.canvasGroupShortcut}
                    onChange={(accel) =>
                      void handleSetCanvasGroupShortcut(accel)
                    }
                    onInvalid={handleShortcutInvalid}
                  />
                </div>
                {snap.pinMode && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-neutral-300">
                      {t("titleBar.toggleMouseThrough")}
                    </span>
                    <ShortcutInput
                      value={snap.toggleMouseThroughShortcut}
                      onChange={(accel) =>
                        void handleSetToggleMouseThroughShortcut(accel)
                      }
                      onInvalid={handleShortcutInvalid}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div
        className={clsx(
          "h-full no-drag ease-in-out",
          snap.mouseThrough ? "flex-1" : "flex-none w-0",
        )}
        onMouseEnter={() => {
          window.electron?.setIgnoreMouseEvents?.(true, { forward: true });
        }}
      />

      <ConfirmModal
        isOpen={!!deleteConfirmCanvas}
        title={t("settings.canvas.deleteTitle")}
        message={t("settings.canvas.deleteConfirm")}
        confirmText={t("common.confirm")}
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirmCanvas(null)}
      />
    </div>
  );
};
