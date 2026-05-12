export const acceleratorToHotkey = (accelerator: string): string | null => {
  const raw = accelerator.trim();
  if (!raw) return null;
  const parts = raw
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const mainKey = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1);
  const keys: string[] = [];
  modifiers.forEach((m) => {
    if (m === 'Command' || m === 'Cmd' || m === 'Ctrl' || m === 'Control') {
      if (!keys.includes('mod')) keys.push('mod');
    } else if (m === 'Shift') {
      keys.push('shift');
    } else if (m === 'Alt' || m === 'Option') {
      keys.push('alt');
    }
  });
  const main = mainKey;
  if (!main) return null;
  keys.push(main);
  return keys.join('+');
};

export const parseAccelerator = (value: string) => {
  const raw = value.trim();
  if (!raw) return null;
  const parts = raw
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const mainKey = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1);
  return {
    key: mainKey,
    meta: modifiers.includes("Command") || modifiers.includes("Cmd"),
    ctrl: modifiers.includes("Ctrl") || modifiers.includes("Control"),
    alt: modifiers.includes("Alt") || modifiers.includes("Option"),
    shift: modifiers.includes("Shift"),
  };
};

const isMainKeyMatch = (
  e: KeyboardEvent,
  key: string,
  options: { ignoreModifiers?: boolean } = {},
) => {
  if (key === "/") return e.key === "/" || e.code === "Slash";
  if (key === "?") {
    return e.key === "?" || (options.ignoreModifiers && e.code === "Slash");
  }
  if (key === "Space") return e.key === " " || e.code === "Space";
  if (key === "Plus") {
    return e.key === "+" || (options.ignoreModifiers && e.code === "Equal");
  }
  if (key === "Up") return e.key === "ArrowUp";
  if (key === "Down") return e.key === "ArrowDown";
  if (key === "Left") return e.key === "ArrowLeft";
  if (key === "Right") return e.key === "ArrowRight";
  if (key === "Esc") return e.key === "Escape";
  if (/^F\d{1,2}$/.test(key)) return e.key === key;
  if (key.length === 1) return e.key.toLowerCase() === key.toLowerCase();
  return e.key === key;
};

export const isAcceleratorMainKeyEvent = (
  e: KeyboardEvent,
  accelerator: string,
) => {
  const parsed = parseAccelerator(accelerator);
  if (!parsed) return false;
  return isMainKeyMatch(e, parsed.key, { ignoreModifiers: true });
};

export const isAcceleratorMatch = (e: KeyboardEvent, accelerator: string) => {
  const parsed = parseAccelerator(accelerator);
  if (!parsed) return false;
  if (e.metaKey !== parsed.meta) return false;
  if (e.ctrlKey !== parsed.ctrl) return false;
  if (e.altKey !== parsed.alt) return false;
  if (e.shiftKey !== parsed.shift) return false;
  return isMainKeyMatch(e, parsed.key);
};
