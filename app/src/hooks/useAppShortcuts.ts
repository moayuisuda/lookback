import { useEffect } from "react";
import { useSnapshot } from "valtio";
import { useHotkeys } from "react-hotkeys-hook";
import { globalState, globalActions } from "../store/globalStore";
import { acceleratorToHotkey, isAcceleratorMatch, parseAccelerator } from "../utils/hotkeys";
import { CANVAS_AUTO_LAYOUT, CANVAS_ZOOM_TO_FIT } from "../events/uiEvents";
import { commandActions } from "../store/commandStore";


export const useAppShortcuts = () => {
  const snap = useSnapshot(globalState);

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
};
