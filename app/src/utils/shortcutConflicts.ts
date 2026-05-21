import { parseAccelerator } from "./hotkeys";

export type ShortcutEntry = {
  id: string;
  accelerator: string;
};

const normalizeMainKey = (key: string) => {
  if (key.length === 1) return key.toLowerCase();
  return key.toLowerCase();
};

export const normalizeAcceleratorForConflict = (accelerator: string) => {
  const parsed = parseAccelerator(accelerator);
  if (!parsed) return "";

  const modifiers = [
    parsed.ctrl ? "ctrl" : "",
    parsed.meta ? "meta" : "",
    parsed.alt ? "alt" : "",
    parsed.shift ? "shift" : "",
  ].filter(Boolean);

  return [...modifiers, normalizeMainKey(parsed.key)].join("+");
};

export const findShortcutConflict = (
  accelerator: string,
  entries: ShortcutEntry[],
  ignoreId?: string,
) => {
  const normalized = normalizeAcceleratorForConflict(accelerator);
  if (!normalized) return null;

  return (
    entries.find((entry) => {
      if (ignoreId && entry.id === ignoreId) return false;
      return normalizeAcceleratorForConflict(entry.accelerator) === normalized;
    }) ?? null
  );
};
