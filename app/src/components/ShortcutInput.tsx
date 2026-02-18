import React, { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { useT } from '../i18n/useT';

const normalizeMainKey = (key: string): string | null => {
  if (key === ' ') return 'Space';
  if (key === '+') return 'Plus';
  if (key === 'ArrowUp') return 'Up';
  if (key === 'ArrowDown') return 'Down';
  if (key === 'ArrowLeft') return 'Left';
  if (key === 'ArrowRight') return 'Right';
  if (key === 'Escape') return 'Esc';

  const k = key.trim();
  if (!k) return null;
  return k;
};

const isMacPlatform = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const p = navigator.platform || '';
  return /Mac|iPhone|iPad|iPod/.test(p);
};

const buildAccelerator = (e: KeyboardEvent): string | null => {
  const mainKey = normalizeMainKey(e.key);
  if (!mainKey) return null;

  const mods: string[] = [];
  const isMac = isMacPlatform();
  if (isMac) {
    if (e.metaKey) mods.push('Command');
  } else {
    if (e.ctrlKey) mods.push('Ctrl');
  }
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');

  // if (mods.length === 0) {
  //   if (mainKey === '/' || /^F([1-9]|1[0-2])$/.test(mainKey)) {
  //     return mainKey;
  //   }
  //   return null;
  // }
  return [...mods, mainKey].join('+');
};

const formatShortcutDisplay = (accelerator: string) => {
  const raw = accelerator.trim();
  if (!raw) return '';
  const parts = raw
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return '';
  const mainKey = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1);
  const displayKey = mainKey.length === 1 ? mainKey.toUpperCase() : mainKey;
  return [...modifiers, displayKey].join('+');
};

export type ShortcutInputProps = {
  value: string;
  disabled?: boolean;
  onChange: (accelerator: string) => void;
  onInvalid: () => void;
};

export const ShortcutInput: React.FC<ShortcutInputProps> = ({
  value,
  disabled,
  onChange,
  onInvalid,
}) => {
  const { t } = useT();
  const [recording, setRecording] = useState(false);

  const displayText = useMemo(() => {
    if (recording) return t('titleBar.shortcutRecording');
    return value ? formatShortcutDisplay(value) : t('titleBar.shortcutClickToRecord');
  }, [recording, t, value]);

  useEffect(() => {
    if (!recording) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

       if (e.key === 'Escape') {
        setRecording(false);
        return;
      }

      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Meta' || e.key === 'Alt') {
        return;
      }

      const accel = buildAccelerator(e);
      if (!accel) {
        onInvalid();
        return;
      }
      onChange(accel);
      setRecording(false);
    };
    window.addEventListener('keydown', handler, true);
    return () => {
      window.removeEventListener('keydown', handler, true);
    };
  }, [onChange, onInvalid, recording]);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setRecording(true)}
      className={clsx(
        'h-6 px-2 rounded border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-[10px] text-neutral-200 transition-colors',
        'disabled:opacity-60 disabled:hover:bg-neutral-800',
      )}
      title={t('titleBar.shortcutClickToRecord')}
    >
      {displayText}
    </button>
  );
};
