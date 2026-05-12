import { useEffect, useRef } from "react";
import { useSnapshot } from "valtio";
import { useHotkeys } from "react-hotkeys-hook";
import { globalState, globalActions } from "../store/globalStore";
import {
  acceleratorToHotkey,
  isAcceleratorMainKeyEvent,
  isAcceleratorMatch,
  parseAccelerator,
} from "../utils/hotkeys";
import { CANVAS_AUTO_LAYOUT, CANVAS_ZOOM_TO_FIT } from "../events/uiEvents";
import { commandActions, commandState } from "../store/commandStore";
import { getCommandContext } from "../commands";

import { canvasActions, canvasState } from "../store/canvasStore";

const PEN_ERASE_HOLD_THRESHOLD_MS = 300;

type PenTool = "draw" | "erase";

type PenEraseKeySession = {
  startedAt: number;
  previousTool: PenTool;
  accelerator: string;
};

const isEditableShortcutTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable
  );
};

export const useAppShortcuts = () => {
  const snap = useSnapshot(globalState);
  const commandSnap = useSnapshot(commandState);
  const canvasSnap = useSnapshot(canvasState);
  const penEraseKeySessionRef = useRef<PenEraseKeySession | null>(null);
  const isCommandPaletteOpen = commandSnap.isOpen;
  const externalCommands = commandSnap.externalCommands;
  const externalCommandShortcuts = commandSnap.externalCommandShortcuts;
  const isPenMode = canvasSnap.isPenMode;

  const canvasAutoLayoutHotkey = acceleratorToHotkey(snap.canvasAutoLayoutShortcut);
  const canvasGroupHotkey = acceleratorToHotkey(snap.canvasGroupShortcut);
  const canvasPenHotkey = acceleratorToHotkey(snap.canvasPenShortcut);
  const canvasPenEraseShortcut = snap.canvasPenEraseShortcut.trim();
  const zoomToFitHotkey = acceleratorToHotkey(snap.zoomToFitShortcut);
  const commandPaletteShortcut = snap.commandPaletteShortcut;

  useHotkeys(
    canvasAutoLayoutHotkey ?? "",
    (e) => {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent(CANVAS_AUTO_LAYOUT));
    },
    { preventDefault: true, enabled: Boolean(canvasAutoLayoutHotkey) },
    [canvasAutoLayoutHotkey],
  );

  useHotkeys(
    canvasGroupHotkey ?? "",
    (e) => {
      e.preventDefault();
      canvasActions.groupSelectedItems();
    },
    { preventDefault: true, enabled: Boolean(canvasGroupHotkey) },
    [canvasGroupHotkey],
  );

  useHotkeys(
    canvasPenHotkey ?? "",
    (e) => {
      e.preventDefault();
      canvasActions.togglePenMode();
    },
    { preventDefault: true, enabled: Boolean(canvasPenHotkey) },
    [canvasPenHotkey],
  );

  useHotkeys(
    zoomToFitHotkey ?? "",
    (e) => {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent(CANVAS_ZOOM_TO_FIT));
    },
    { preventDefault: true, enabled: Boolean(zoomToFitHotkey) },
    [zoomToFitHotkey],
  );

  // Tap toggles eraser; holding the shortcut makes eraser momentary.
  useEffect(() => {
    const finishPenEraseKeySession = (restorePreviousTool: boolean) => {
      const session = penEraseKeySessionRef.current;
      if (!session) return;
      penEraseKeySessionRef.current = null;
      if (!canvasState.isPenMode) return;

      if (restorePreviousTool) {
        canvasActions.setPenTool(session.previousTool);
        return;
      }

      if (session.previousTool === "erase") {
        canvasActions.setPenTool("draw");
      }
    };

    if (!canvasPenEraseShortcut || !isPenMode || isCommandPaletteOpen) {
      finishPenEraseKeySession(true);
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || isEditableShortcutTarget(e.target)) return;
      if (!isAcceleratorMatch(e, canvasPenEraseShortcut)) return;

      e.preventDefault();
      e.stopPropagation();
      if (penEraseKeySessionRef.current) return;

      const previousTool = canvasState.penTool;
      penEraseKeySessionRef.current = {
        startedAt: Date.now(),
        previousTool,
        accelerator: canvasPenEraseShortcut,
      };

      if (previousTool !== "erase") {
        canvasActions.setPenTool("erase");
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const session = penEraseKeySessionRef.current;
      if (!session) return;
      if (!isAcceleratorMainKeyEvent(e, session.accelerator)) return;

      e.preventDefault();
      e.stopPropagation();
      const isHold =
        Date.now() - session.startedAt >= PEN_ERASE_HOLD_THRESHOLD_MS;
      finishPenEraseKeySession(isHold);
    };

    const handleBlur = () => {
      finishPenEraseKeySession(true);
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("blur", handleBlur);
      finishPenEraseKeySession(true);
    };
  }, [canvasPenEraseShortcut, isCommandPaletteOpen, isPenMode]);

  // Canvas Undo / Redo
  useHotkeys(
    "mod+z",
    (e) => {
      e.preventDefault();
      const preservePenMode = canvasState.isPenMode;
      canvasActions.undoCanvas({ preservePenMode });
      if (!preservePenMode) {
        canvasActions.clearSelectionState();
      }
    },
    [],
  );

  useHotkeys(
    "mod+shift+z, mod+y",
    (e) => {
      e.preventDefault();
      const preservePenMode = canvasState.isPenMode;
      canvasActions.redoCanvas({ preservePenMode });
      if (!preservePenMode) {
        canvasActions.clearSelectionState();
      }
    },
    [],
  );

  // Canvas Delete
  useHotkeys(
    "del, backspace",
    (e) => {
      const selectedIds = canvasState.canvasItems
        .filter((item) => item.isSelected)
        .map((item) => item.itemId);
      if (selectedIds.length === 0) return;

      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      e.preventDefault();
      canvasActions.removeManyFromCanvas(selectedIds);
      canvasActions.clearSelectionState();
    },
    [],
  );

  useEffect(() => {
    const cleanup = window.electron?.onRendererEvent?.(
      (event: string, ...args: unknown[]) => {
        if (event !== "adjust-canvas-opacity") return;
        const delta = args[0];
        if (typeof delta !== "number" || !Number.isFinite(delta)) return;
        globalActions.setCanvasOpacity(globalState.canvasOpacity + delta);
      },
    );
    return cleanup;
  }, []);

  useEffect(() => {
    if (!commandPaletteShortcut) return;
    const handler = (e: KeyboardEvent) => {
      if (!isAcceleratorMatch(e, commandPaletteShortcut)) return;

      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if (isInput) {
        const parsed = parseAccelerator(commandPaletteShortcut);
        // If no function modifiers (Ctrl/Cmd/Alt), ignore in input fields
        if (parsed && !parsed.ctrl && !parsed.meta && !parsed.alt) {
          return;
        }
      }

      e.preventDefault();
      commandActions.toggle();
    };
    window.addEventListener("keydown", handler, true);
    return () => {
      window.removeEventListener("keydown", handler, true);
    };
  }, [commandPaletteShortcut]);

  useEffect(() => {
    if (isCommandPaletteOpen) return;
    const shortcutEntries: Array<{
      command: (typeof externalCommands)[number];
      accelerator: string;
    }> = [];
    externalCommands.forEach((command) => {
      const accelerator = externalCommandShortcuts[command.id];
      if (!accelerator || !accelerator.trim()) return;
      shortcutEntries.push({ command, accelerator });
    });
    if (shortcutEntries.length === 0) return;

    const handler = (e: KeyboardEvent) => {
      const matched = shortcutEntries.find((item) =>
        isAcceleratorMatch(e, item.accelerator),
      );
      if (!matched) return;

      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;
      if (isInput) {
        const parsed = parseAccelerator(matched.accelerator);
        if (parsed && !parsed.ctrl && !parsed.meta && !parsed.alt) {
          return;
        }
      }

      e.preventDefault();
      e.stopPropagation();

      if (matched.command.ui) {
        commandActions.open();
        commandActions.setActiveCommand(matched.command.id);
        return;
      }
      if (matched.command.run) {
        commandActions.close();
        void matched.command.run(getCommandContext());
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => {
      window.removeEventListener("keydown", handler, true);
    };
  }, [isCommandPaletteOpen, externalCommands, externalCommandShortcuts]);
};
