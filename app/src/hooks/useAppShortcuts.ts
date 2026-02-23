import { useEffect } from "react";
import { useSnapshot } from "valtio";
import { useHotkeys } from "react-hotkeys-hook";
import { globalState, globalActions } from "../store/globalStore";
import { acceleratorToHotkey, isAcceleratorMatch, parseAccelerator } from "../utils/hotkeys";
import { CANVAS_AUTO_LAYOUT, CANVAS_ZOOM_TO_FIT } from "../events/uiEvents";
import { commandActions, commandState } from "../store/commandStore";
import { getCommandContext } from "../commands";


export const useAppShortcuts = () => {
  const snap = useSnapshot(globalState);
  const commandSnap = useSnapshot(commandState);
  const isCommandPaletteOpen = commandSnap.isOpen;
  const externalCommands = commandSnap.externalCommands;
  const externalCommandShortcuts = commandSnap.externalCommandShortcuts;

  const canvasGroupHotkey = acceleratorToHotkey(snap.canvasGroupShortcut);
  const zoomToFitHotkey = acceleratorToHotkey(snap.zoomToFitShortcut);
  const commandPaletteShortcut = snap.commandPaletteShortcut;

  useHotkeys(
    canvasGroupHotkey ?? "",
    (e) => {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent(CANVAS_AUTO_LAYOUT));
    },
    { preventDefault: true, enabled: Boolean(canvasGroupHotkey) },
    [canvasGroupHotkey],
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
    const shortcutEntries: Array<{ command: (typeof externalCommands)[number]; accelerator: string }> = [];
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
