import { useEffect } from "react";
import { useSnapshot } from "valtio";
import { useHotkeys } from "react-hotkeys-hook";
import { globalState, globalActions } from "../store/globalStore";
import { acceleratorToHotkey } from "../utils/hotkeys";
import { CANVAS_AUTO_LAYOUT } from "../events/uiEvents";
import { commandActions } from "../store/commandStore";

const parseAccelerator = (value: string) => {
  const raw = value.trim();
  if (!raw) return null;
  const parts = raw
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const mainKey = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1).map((p) => p.toLowerCase());
  return {
    key: mainKey,
    meta: modifiers.includes("command") || modifiers.includes("cmd"),
    ctrl: modifiers.includes("ctrl") || modifiers.includes("control"),
    alt: modifiers.includes("alt") || modifiers.includes("option"),
    shift: modifiers.includes("shift"),
  };
};

const isAcceleratorMatch = (e: KeyboardEvent, accelerator: string) => {
  const parsed = parseAccelerator(accelerator);
  if (!parsed) return false;
  if (e.metaKey !== parsed.meta) return false;
  if (e.ctrlKey !== parsed.ctrl) return false;
  if (e.altKey !== parsed.alt) return false;
  if (e.shiftKey !== parsed.shift) return false;
  const key = parsed.key.toLowerCase();
  if (key === "/") return e.key === "/" || e.code === "Slash";
  if (key === "?") return e.key === "?" || (e.code === "Slash" && e.shiftKey);
  if (/^f\d{1,2}$/i.test(parsed.key)) return e.key.toLowerCase() === key;
  if (key.length === 1) return e.key.toLowerCase() === key;
  return e.key.toLowerCase() === key;
};

export const useAppShortcuts = () => {
  const snap = useSnapshot(globalState);

  const opacityUpHotkey = acceleratorToHotkey(snap.canvasOpacityUpShortcut);
  const opacityDownHotkey = acceleratorToHotkey(snap.canvasOpacityDownShortcut);
  const canvasGroupHotkey = acceleratorToHotkey(snap.canvasGroupShortcut);
  const commandPaletteShortcut = snap.commandPaletteShortcut;

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

  useEffect(() => {
    if (!commandPaletteShortcut) return;
    const handler = (e: KeyboardEvent) => {
      if (!isAcceleratorMatch(e, commandPaletteShortcut)) return;
      e.preventDefault();
      commandActions.toggle();
    };
    window.addEventListener("keydown", handler, true);
    return () => {
      window.removeEventListener("keydown", handler, true);
    };
  }, [commandPaletteShortcut]);
};
