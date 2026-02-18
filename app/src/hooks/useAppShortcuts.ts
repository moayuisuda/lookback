import { useEffect } from "react";
import { useSnapshot } from "valtio";
import { useHotkeys } from "react-hotkeys-hook";
import { globalState, globalActions } from "../store/globalStore";
import { acceleratorToHotkey, isAcceleratorMatch, parseAccelerator } from "../utils/hotkeys";
import { CANVAS_AUTO_LAYOUT, CANVAS_ZOOM_TO_FIT } from "../events/uiEvents";
import { commandActions } from "../store/commandStore";


export const useAppShortcuts = () => {
  const snap = useSnapshot(globalState);

  const opacityUpHotkey = acceleratorToHotkey(snap.canvasOpacityUpShortcut);
  const opacityDownHotkey = acceleratorToHotkey(snap.canvasOpacityDownShortcut);
  const canvasGroupHotkey = acceleratorToHotkey(snap.canvasGroupShortcut);
  const zoomToFitHotkey = acceleratorToHotkey(snap.zoomToFitShortcut);
  const commandPaletteShortcut = snap.commandPaletteShortcut;

  console.log({
    opacityUpHotkey,
    opacityDownHotkey,
    canvasGroupHotkey,
    zoomToFitHotkey,
    commandPaletteShortcut,
  });

  useHotkeys(
    opacityUpHotkey ?? "",
    (e) => {
      e.preventDefault();
      const current = globalState.canvasOpacity;
      if (current < 1) {
        globalActions.setCanvasOpacity(Math.min(1, current + 0.05));
      }
    },
    {
      preventDefault: true,
      enableOnFormTags: false,
      enabled: Boolean(opacityUpHotkey),
    },
    [opacityUpHotkey],
  );

  useHotkeys(
    opacityDownHotkey ?? "",
    (e) => {
      e.preventDefault();
      const current = globalState.canvasOpacity;
      if (current > 0.1) {
        globalActions.setCanvasOpacity(Math.max(0.1, current - 0.05));
      }
    },
    {
      preventDefault: true,
      enableOnFormTags: false,
      enabled: Boolean(opacityDownHotkey),
    },
    [opacityDownHotkey],
  );

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
