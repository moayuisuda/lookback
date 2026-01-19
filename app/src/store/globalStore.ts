import { proxy } from 'valtio';
import { THEME } from '../theme';
import { fileStorage } from '../service';
import type { I18nKey, I18nMessage, I18nParams } from '../../shared/i18n/types';

export interface EnvInitState {
  isOpen: boolean;
  progress: number; // 0 to 1
  statusKey: I18nKey;
  statusParams?: I18nParams;
  percentText: string;
}

export const envInitState = proxy<EnvInitState>({
  isOpen: false,
  progress: 0,
  statusKey: 'envInit.preparing',
  percentText: '0%',
});

export interface IndexingState {
  isIndexing: boolean;
  current: number;
  total: number;
  statusKey: I18nKey | null;
  statusParams?: I18nParams;
  filename?: string;
}

export const indexingState = proxy<IndexingState>({
  isIndexing: false,
  current: 0,
  total: 0,
  statusKey: null,
});

export interface ModelProgressState {
  isDownloading: boolean;
  current: number;
  total: number;
  statusKey: I18nKey | null;
  statusParams?: I18nParams;
  filename?: string;
}

export const modelProgressState = proxy<ModelProgressState>({
  isDownloading: false,
  current: 0,
  total: 0,
  statusKey: null,
});

export const indexingActions = {
  update: (data: Partial<IndexingState>) => {
    Object.assign(indexingState, data);
  },
  reset: () => {
    indexingState.isIndexing = false;
    indexingState.current = 0;
    indexingState.total = 0;
    indexingState.statusKey = null;
    indexingState.statusParams = undefined;
    indexingState.filename = undefined;
  },
};

export const modelProgressActions = {
  update: (data: Partial<ModelProgressState>) => {
    Object.assign(modelProgressState, data);
  },
  reset: () => {
    modelProgressState.isDownloading = false;
    modelProgressState.current = 0;
    modelProgressState.total = 0;
    modelProgressState.statusKey = null;
    modelProgressState.statusParams = undefined;
    modelProgressState.filename = undefined;
  },
};

export const envInitActions = {
  update: (data: Partial<EnvInitState>) => {
    Object.assign(envInitState, data);
  },
  reset: () => {
    envInitState.isOpen = false;
    envInitState.progress = 0;
    envInitState.statusKey = 'envInit.preparing';
    envInitState.statusParams = undefined;
    envInitState.percentText = '0%';
  },
};

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export type Toast = {
  id: string;
  message: I18nMessage;
  type: ToastType;
  createdAt: number;
};

export type ActiveArea = 'gallery' | 'canvas' | null;

export interface GlobalState {
  tagColors: Record<string, string>;
  colorSwatches: string[];
  toasts: Toast[];
  pinMode: boolean;
  pinTransparent: boolean;
  toggleWindowShortcut: string;
  canvasOpacity: number;
  mouseThrough: boolean;
  canvasOpacityUpShortcut: string;
  canvasOpacityDownShortcut: string;
  toggleMouseThroughShortcut: string;
   canvasGroupShortcut: string;
  sidebarWidth: number;
  activeArea: ActiveArea;
  vectorSearchThreshold: number;
}

const DEFAULT_COLOR_SWATCHES = [
  '#a855f7',
  '#3b82f6',
  '#06b6d4',
  '#22c55e',
  '#eab308',
  '#f97316',
  '#ef4444',
  '#ec4899',
  '#94a3b8',
  '#ffffff',
  '#0f172a',
] as const;

const isHexColor = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  return (
    /^#[0-9a-fA-F]{6}$/.test(value.trim()) ||
    /^#[0-9a-fA-F]{3}$/.test(value.trim())
  );
};

const normalizeHexColor = (value: string): string => {
  const v = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) {
    const r = v[1];
    const g = v[2];
    const b = v[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return THEME.primary;
};

const ensureSidebarWidth = (value: unknown): number => {
  if (
    typeof value !== 'number' ||
    Number.isNaN(value) ||
    !Number.isFinite(value)
  ) {
    return 320;
  }
  return value;
};

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || '');

const DEFAULT_TOGGLE_WINDOW_SHORTCUT = isMac ? 'Command+L' : 'Ctrl+L';
const DEFAULT_CANVAS_OPACITY_UP_SHORTCUT = isMac ? 'Command+Up' : 'Ctrl+Up';
const DEFAULT_CANVAS_OPACITY_DOWN_SHORTCUT = isMac ? 'Command+Down' : 'Ctrl+Down';
const DEFAULT_TOGGLE_MOUSE_THROUGH_SHORTCUT = isMac ? 'Command+T' : 'Ctrl+T';
const DEFAULT_CANVAS_GROUP_SHORTCUT = isMac ? 'Command+G' : 'Ctrl+G';

export const globalState = proxy<GlobalState>({
  tagColors: {},
  colorSwatches: [...DEFAULT_COLOR_SWATCHES],
  toasts: [],
  pinMode: false,
  pinTransparent: false,
  toggleWindowShortcut: DEFAULT_TOGGLE_WINDOW_SHORTCUT,
  canvasOpacity: 1,
  mouseThrough: false,
  canvasOpacityUpShortcut: DEFAULT_CANVAS_OPACITY_UP_SHORTCUT,
  canvasOpacityDownShortcut: DEFAULT_CANVAS_OPACITY_DOWN_SHORTCUT,
  toggleMouseThroughShortcut: DEFAULT_TOGGLE_MOUSE_THROUGH_SHORTCUT,
  canvasGroupShortcut: DEFAULT_CANVAS_GROUP_SHORTCUT,
  sidebarWidth: 320,
  activeArea: null,
  vectorSearchThreshold: 0.19,
});

export const globalActions = {
  hydrateSettings: async () => {
    try {
      const [
        rawTagColors,
        rawColorSwatches,
        rawSidebarWidth,
        rawVectorSearchThreshold,
        rawPinTransparent,
        rawPinMode,
        rawToggleWindowShortcut,
        rawCanvasOpacity,
        rawMouseThrough,
        rawCanvasOpacityUpShortcut,
        rawCanvasOpacityDownShortcut,
        rawToggleMouseThroughShortcut,
        rawCanvasGroupShortcut,
      ] =
        await Promise.all([
          fileStorage.get<Record<string, unknown>>({
            key: 'tagColors',
            fallback: {},
          }),
          fileStorage.get<unknown>({
            key: 'colorSwatches',
            fallback: [...DEFAULT_COLOR_SWATCHES],
          }),
          fileStorage.get<unknown>({
            key: 'sidebarWidth',
            fallback: 320,
          }),
          fileStorage.get<unknown>({
            key: 'vectorSearchThreshold',
            fallback: 0.19,
          }),
          fileStorage.get<unknown>({
            key: 'pinTransparent',
            fallback: false,
          }),
          fileStorage.get<unknown>({
            key: 'pinMode',
            fallback: false,
          }),
          fileStorage.get<unknown>({
            key: 'toggleWindowShortcut',
            fallback: DEFAULT_TOGGLE_WINDOW_SHORTCUT,
          }),
          fileStorage.get<unknown>({
            key: 'canvasOpacity',
            fallback: 1,
          }),
          fileStorage.get<unknown>({
            key: 'mouseThrough',
            fallback: false,
          }),
          fileStorage.get<unknown>({
            key: 'canvasOpacityUpShortcut',
            fallback: DEFAULT_CANVAS_OPACITY_UP_SHORTCUT,
          }),
          fileStorage.get<unknown>({
            key: 'canvasOpacityDownShortcut',
            fallback: DEFAULT_CANVAS_OPACITY_DOWN_SHORTCUT,
          }),
          fileStorage.get<unknown>({
            key: 'toggleMouseThroughShortcut',
            fallback: DEFAULT_TOGGLE_MOUSE_THROUGH_SHORTCUT,
          }),
          fileStorage.get<unknown>({
            key: 'canvasGroupShortcut',
            fallback: DEFAULT_CANVAS_GROUP_SHORTCUT,
          }),
        ]);

      const nextTagColors: Record<string, string> = {};
      for (const [k, v] of Object.entries(rawTagColors)) {
        if (typeof k === 'string' && typeof v === 'string' && k.trim()) {
          nextTagColors[k] = v;
        }
      }
      globalState.tagColors = nextTagColors;

      let swatches: string[] = [];
      if (Array.isArray(rawColorSwatches)) {
        swatches = rawColorSwatches
          .filter(isHexColor)
          .map((c) => normalizeHexColor(c));
      }
      if (swatches.length === 0) {
        swatches = [...DEFAULT_COLOR_SWATCHES];
      }
      globalState.colorSwatches = swatches.slice(0, DEFAULT_COLOR_SWATCHES.length);

      globalState.sidebarWidth = ensureSidebarWidth(rawSidebarWidth);

      if (typeof rawVectorSearchThreshold === 'number') {
        globalState.vectorSearchThreshold = rawVectorSearchThreshold;
      }

      if (typeof rawPinTransparent === 'boolean') {
        globalState.pinTransparent = rawPinTransparent;
      }

      if (typeof rawPinMode === 'boolean') {
        globalState.pinMode = rawPinMode;
      }

      if (typeof rawToggleWindowShortcut === 'string' && rawToggleWindowShortcut.trim()) {
        globalState.toggleWindowShortcut = rawToggleWindowShortcut.trim();
      }

      if (typeof rawCanvasOpacity === 'number') {
        globalState.canvasOpacity = rawCanvasOpacity;
      }

      if (typeof rawMouseThrough === 'boolean') {
        globalState.mouseThrough = rawMouseThrough;
      }

      if (typeof rawCanvasOpacityUpShortcut === 'string' && rawCanvasOpacityUpShortcut.trim()) {
        globalState.canvasOpacityUpShortcut = rawCanvasOpacityUpShortcut.trim();
      }

      if (typeof rawCanvasOpacityDownShortcut === 'string' && rawCanvasOpacityDownShortcut.trim()) {
        globalState.canvasOpacityDownShortcut = rawCanvasOpacityDownShortcut.trim();
      }

      if (typeof rawToggleMouseThroughShortcut === 'string' && rawToggleMouseThroughShortcut.trim()) {
        globalState.toggleMouseThroughShortcut = rawToggleMouseThroughShortcut.trim();
      }

      if (typeof rawCanvasGroupShortcut === 'string' && rawCanvasGroupShortcut.trim()) {
        globalState.canvasGroupShortcut = rawCanvasGroupShortcut.trim();
      }
    } catch (error) {
      console.error('Failed to hydrate settings:', error);
    }
  },

  pushToast: (message: I18nMessage, type: ToastType = 'info', timeoutMs = 3200) => {
    const id = `toast_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    globalState.toasts = [
      ...globalState.toasts,
      { id, message, type, createdAt: Date.now() },
    ];
    if (timeoutMs > 0) {
      window.setTimeout(() => {
        globalActions.removeToast(id);
      }, timeoutMs);
    }
  },

  removeToast: (id: string) => {
    globalState.toasts = globalState.toasts.filter((t) => t.id !== id);
  },

  setActiveArea: (area: ActiveArea) => {
    globalState.activeArea = area;
  },

  setVectorSearchThreshold: (threshold: number) => {
    globalState.vectorSearchThreshold = threshold;
    void fileStorage.set('vectorSearchThreshold', threshold);
  },

  setTagColor: (tag: string, color: string) => {
    const key = tag.trim();
    if (!key) return;
    const next = { ...globalState.tagColors, [key]: color };
    globalState.tagColors = next;
    void fileStorage.set('tagColors', next);
  },

  clearTagColor: (tag: string) => {
    const key = tag.trim();
    if (!key) return;
    if (!Object.prototype.hasOwnProperty.call(globalState.tagColors, key)) return;
    const next = { ...globalState.tagColors };
    delete next[key];
    globalState.tagColors = next;
    void fileStorage.set('tagColors', next);
  },

  setColorSwatch: (index: number, color: string) => {
    if (!Number.isInteger(index)) return;
    if (index < 0 || index >= globalState.colorSwatches.length) return;
    if (!isHexColor(color)) return;
    const next = [...globalState.colorSwatches];
    next[index] = normalizeHexColor(color);
    globalState.colorSwatches = next;
    void fileStorage.set('colorSwatches', next);
  },

  togglePinMode: () => {
    globalState.pinMode = !globalState.pinMode;
  },

  setPinMode: (enabled: boolean) => {
    globalState.pinMode = enabled;
    void fileStorage.set('pinMode', enabled);
  },

  setPinTransparent: (enabled: boolean) => {
    globalState.pinTransparent = enabled;
    void fileStorage.set('pinTransparent', enabled);
  },

  setToggleWindowShortcut: async (accelerator: string) => {
    const next = accelerator.trim();
    if (!next) return false;
    const prev = globalState.toggleWindowShortcut;
    globalState.toggleWindowShortcut = next;
    await fileStorage.set('toggleWindowShortcut', next);

    const res = await window.electron?.setToggleWindowShortcut?.(next);
    if (res && res.success !== true) {
      globalState.toggleWindowShortcut = prev;
      await fileStorage.set('toggleWindowShortcut', prev);
      globalActions.pushToast(
        { key: 'toast.shortcutUpdateFailed', params: { error: res.error ?? '' } },
        'error',
      );
      return false;
    }
    return true;
  },

  setCanvasOpacity: (opacity: number) => {
    const val = Math.max(0.1, Math.min(1, opacity));
    globalState.canvasOpacity = val;
    void fileStorage.set('canvasOpacity', val);
  },

  setMouseThrough: (enabled: boolean) => {
    globalState.mouseThrough = enabled;
    void fileStorage.set('mouseThrough', enabled);
    window.electron?.setMouseThrough?.(enabled);
  },

  setCanvasOpacityUpShortcut: async (accelerator: string) => {
    const next = accelerator.trim();
    if (!next) return false;
    const prev = globalState.canvasOpacityUpShortcut;
    globalState.canvasOpacityUpShortcut = next;
    await fileStorage.set('canvasOpacityUpShortcut', next);

    const res = await window.electron?.setCanvasOpacityUpShortcut?.(next);
    if (res && res.success !== true) {
      globalState.canvasOpacityUpShortcut = prev;
      await fileStorage.set('canvasOpacityUpShortcut', prev);
      globalActions.pushToast(
        { key: 'toast.shortcutUpdateFailed', params: { error: res.error ?? '' } },
        'error',
      );
      return false;
    }
    return true;
  },

  setCanvasOpacityDownShortcut: async (accelerator: string) => {
    const next = accelerator.trim();
    if (!next) return false;
    const prev = globalState.canvasOpacityDownShortcut;
    globalState.canvasOpacityDownShortcut = next;
    await fileStorage.set('canvasOpacityDownShortcut', next);

    const res = await window.electron?.setCanvasOpacityDownShortcut?.(next);
    if (res && res.success !== true) {
      globalState.canvasOpacityDownShortcut = prev;
      await fileStorage.set('canvasOpacityDownShortcut', prev);
      globalActions.pushToast(
        { key: 'toast.shortcutUpdateFailed', params: { error: res.error ?? '' } },
        'error',
      );
      return false;
    }
    return true;
  },

  setToggleMouseThroughShortcut: async (accelerator: string) => {
    const next = accelerator.trim();
    if (!next) return false;
    const prev = globalState.toggleMouseThroughShortcut;
    globalState.toggleMouseThroughShortcut = next;
    await fileStorage.set('toggleMouseThroughShortcut', next);

    const res = await window.electron?.setToggleMouseThroughShortcut?.(next);
    if (res && res.success !== true) {
      globalState.toggleMouseThroughShortcut = prev;
      await fileStorage.set('toggleMouseThroughShortcut', prev);
      globalActions.pushToast(
        { key: 'toast.shortcutUpdateFailed', params: { error: res.error ?? '' } },
        'error',
      );
      return false;
    }
    return true;
  },

  setCanvasGroupShortcut: async (accelerator: string) => {
    const next = accelerator.trim();
    if (!next) return false;
    const prev = globalState.canvasGroupShortcut;
    globalState.canvasGroupShortcut = next;
    await fileStorage.set('canvasGroupShortcut', next);

    const res = await window.electron?.setCanvasGroupShortcut?.(next);
    if (res && res.success !== true) {
      globalState.canvasGroupShortcut = prev;
      await fileStorage.set('canvasGroupShortcut', prev);
      globalActions.pushToast(
        { key: 'toast.shortcutUpdateFailed', params: { error: res.error ?? '' } },
        'error',
      );
      return false;
    }
    return true;
  },

  setSidebarWidth: (width: number) => {
    globalState.sidebarWidth = width;
  },

  persistSidebarWidth: () => {
    void fileStorage.set('sidebarWidth', globalState.sidebarWidth);
  },
};
