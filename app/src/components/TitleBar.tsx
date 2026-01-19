import React, { useEffect, useState } from 'react';
import { Minus, Square, X, Pin, Settings, Plus, Trash2, Edit2, Check, ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';
import {
  globalActions,
  globalState,
  indexingActions,
  indexingState,
  modelProgressActions,
  modelProgressState,
} from '../store/globalStore';
import { canvasActions, canvasState } from '../store/canvasStore';
import { THEME } from '../theme';
import { useSnapshot } from 'valtio';
import { API_BASE_URL } from '../config';
import { useT } from '../i18n/useT';
import {
  listCanvases,
  createCanvas,
  renameCanvas,
  deleteCanvas,
  type CanvasMeta,
} from '../service';
import type { I18nKey, I18nParams } from '../../shared/i18n/types';
import { isI18nKey } from '../../shared/i18n/guards';
import { ToggleSwitch } from './ToggleSwitch';
import { ShortcutInput } from './ShortcutInput';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const TitleBar: React.FC = () => {
  const snap = useSnapshot(globalState);
  const indexingSnap = useSnapshot(indexingState);
  const modelSnap = useSnapshot(modelProgressState);
  const { t, locale, setLocale } = useT();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [canvasMenuOpen, setCanvasMenuOpen] = useState(false);
  const [storageDir, setStorageDir] = useState('');
  const [loadingStorageDir, setLoadingStorageDir] = useState(false);
  const [updatingStorageDir, setUpdatingStorageDir] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [isWindowActive, setIsWindowActive] = useState(true);
  const [enableVectorSearch, setEnableVectorSearch] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(false);
  
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
      void loadSettings();
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
          globalActions.pushToast({ key: 'toast.createCanvasFailed' }, 'error');
      }
  };

  const handleSwitchCanvas = async (name: string) => {
    const { state: galleryState } = await import('../store/galleryStore');
    const findImageMeta = (id: string) => {
        const item = galleryState.images.find(img => img.image === id);
        return item || null;
    };
    
    await canvasActions.switchCanvas(name, findImageMeta);
  };

  const handleDeleteCanvas = async (name: string) => {
      if (!confirm(t('settings.canvas.deleteConfirm'))) return;
      try {
          await deleteCanvas(name);
          await refreshCanvases();
          if (canvasSnap.currentCanvasName === name) {
              const list = await listCanvases();
              if (list.length > 0) {
                   handleSwitchCanvas(list[0].name);
              }
          }
      } catch (e) {
          console.error(e);
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
               const { state: galleryState } = await import('../store/galleryStore');
                const findImageMeta = (id: string) => {
                    const item = galleryState.images.find(img => img.image === id);
                    return item || null;
                };
              await canvasActions.switchCanvas(editingName, findImageMeta);
          }
      } catch (e) {
          console.error(e);
      }
  };

  // const [downloadingModel, setDownloadingModel] = useState(false);
  // const [downloadProgress, setDownloadProgress] = useState<{
  //   type?: string;
  //   filename?: string;
  //   current?: number;
  //   total?: number;
  //   message?: string;
  //   // New fields
  //   status?: string;
  //   percentText?: string;
  //   progress?: number;
  //   isOpen?: boolean;
  // } | null>(null);

  useEffect(() => {
    const removeListener = window.electron?.onModelDownloadProgress?.((data: unknown) => {
      if (!isRecord(data)) return;

      if (data.isOpen === false) {
        modelProgressActions.reset();
        return;
      }

      if (typeof data.progress === 'number') {
        if (!isI18nKey(data.statusKey)) return;
        const statusParams = isRecord(data.statusParams)
          ? (data.statusParams as I18nParams)
          : undefined;
        modelProgressActions.update({
          isDownloading: true,
          current: Math.round(Math.max(0, Math.min(1, data.progress)) * 100),
          total: 100,
          statusKey: data.statusKey as I18nKey,
          statusParams,
          filename: typeof data.filename === 'string' ? data.filename : undefined,
        });
        return;
      }

      if (data.type === 'start') {
        modelProgressActions.update({
          isDownloading: true,
          current: 0,
          total: 100,
          statusKey: 'model.preparingDownload',
          statusParams: undefined,
          filename: undefined,
        });
        return;
      }

      if (
        data.type === 'file' &&
        typeof data.current === 'number' &&
        typeof data.total === 'number'
      ) {
        const p = data.total > 0 ? data.current / data.total : 0;
        modelProgressActions.update({
          isDownloading: true,
          current: Math.round(Math.max(0, Math.min(1, p)) * 100),
          total: 100,
          statusKey: 'model.downloadingFraction',
          statusParams: { current: data.current, total: data.total },
          filename: typeof data.filename === 'string' ? data.filename : undefined,
        });
        return;
      }

      if (data.type === 'retry') {
        modelProgressActions.update({
          isDownloading: true,
          statusKey: 'model.retrying',
          statusParams: undefined,
          filename: typeof data.filename === 'string' ? data.filename : undefined,
        });
        return;
      }

      if (data.type === 'done' || (data.type === 'verify' && data.ok === true)) {
        modelProgressActions.update({
          isDownloading: true,
          current: 100,
          total: 100,
          statusKey: 'model.ready',
          statusParams: undefined,
        });
        window.setTimeout(() => modelProgressActions.reset(), 800);
        return;
      }

      if (data.type === 'error' || data.type === 'weight-failed') {
        const reason = typeof data.reason === 'string' ? data.reason : undefined;
        modelProgressActions.update({
          isDownloading: true,
          statusKey: reason ? 'model.downloadFailedWithReason' : 'model.downloadFailed',
          statusParams: reason ? { reason } : undefined,
        });
        window.setTimeout(() => modelProgressActions.reset(), 1600);
      }
    });

    return () => {
      removeListener?.();
    };
  }, []);

  // Use the global event listener in App.tsx to update store
  // Here we rely on useSnapshot(indexingState) to render UI
  useEffect(() => {
    const removeListener = window.electron?.onIndexingProgress?.((data: unknown) => {
      if (!isRecord(data)) return;
      if (typeof data.current !== 'number' || typeof data.total !== 'number') return;
      if (!isI18nKey(data.statusKey)) return;
      const statusParams = isRecord(data.statusParams)
        ? (data.statusParams as I18nParams)
        : undefined;
        indexingActions.update({
          isIndexing: true,
          current: data.current,
          total: data.total,
          statusKey: data.statusKey as I18nKey,
          statusParams,
          filename: undefined,
        });
    });
    return () => {
      removeListener?.();
    };
  }, []);

  const toggleAlwaysOnTop = () => {
    const newState = !globalState.pinMode;
    const widthDelta = globalState.sidebarWidth;
    globalActions.setPinMode(newState);
    window.electron?.setPinMode?.(newState, widthDelta);
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

  const loadSettings = async () => {
    setLoadingSettings(true);
    try {
      const resp = await fetch(`${API_BASE_URL}/api/settings`);
      if (resp.ok) {
        const data = await resp.json();
        setEnableVectorSearch(Boolean(data.enableVectorSearch));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSettings(false);
    }
  };

  useEffect(() => {
    const handleFocus = () => setIsWindowActive(true);
    const handleBlur = () => setIsWindowActive(false);
    const handleVisibilityChange = () => {
      setIsWindowActive(!document.hidden);
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    handleVisibilityChange();

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Load settings once on mount to ensure correct state
  useEffect(() => {
    void loadSettings();
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

  const handleIndexMissing = async () => {
    setIndexing(true);
    indexingActions.update({
      isIndexing: true,
      current: 0,
      total: 0,
      statusKey: 'indexing.starting',
      statusParams: undefined,
    });
    try {
      const resp = await fetch(`${API_BASE_URL}/api/index-missing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!resp.ok) {
        globalActions.pushToast({ key: 'toast.indexFailed' }, 'error');
        return;
      }
      const data = (await resp.json().catch(() => ({}))) as {
        created?: number;
        updated?: number;
      };
      const created = typeof data.created === 'number' ? data.created : 0;
      const updated = typeof data.updated === 'number' ? data.updated : 0;
      const total = created + updated;
      if (total === 0) {
        globalActions.pushToast({ key: 'toast.noUnindexedImages' }, 'info');
        return;
      }
      globalActions.pushToast(
        { key: 'toast.indexCompleted', params: { created, updated } },
        'success',
      );
    } catch (e) {
      console.error(e);
      globalActions.pushToast({ key: 'toast.indexFailed' }, 'error');
    } finally {
      setIndexing(false);
      indexingActions.reset();
    }
  };

  const handleToggleVectorSearch = async () => {
    const newValue = !enableVectorSearch;
    setEnableVectorSearch(newValue);
    try {
      await fetch(`${API_BASE_URL}/api/settings/enableVectorSearch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: newValue }),
      });

      if (newValue) {
        // Trigger download/check model via IPC (more robust environment handling)
        if (window.electron?.ensureModelReady) {
          const res = await window.electron.ensureModelReady();
          if (res.success) {
            globalActions.pushToast({ key: 'toast.modelReady' }, 'success');
          } else {
            globalActions.pushToast(
              { key: 'toast.modelCheckFailed', params: { error: res.error ?? '' } },
              'error',
            );
          }
        } else {
          // Fallback to API
          await fetch(`${API_BASE_URL}/api/download-model`, { method: 'POST' });
        }
      }
    } catch (e) {
      console.error(e);
      globalActions.pushToast({ key: 'toast.settingsUpdateFailed' }, 'error');
      setEnableVectorSearch(!newValue); // revert
    }
  };

  const handleTogglePinTransparent = () => {
    const next = !snap.pinTransparent;
    globalActions.setPinTransparent(next);
    window.electron?.setPinTransparent?.(next);
  };

  const handleToggleMouseThrough = () => {
    const next = !snap.mouseThrough;
    globalActions.setMouseThrough(next);
  };

  const handleShortcutInvalid = () => {
    globalActions.pushToast({ key: 'toast.shortcutInvalid' }, 'error');
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

  useEffect(() => {
    const cleanup = window.electron?.onRendererEvent?.((event: string) => {
      if (event === 'canvas-opacity-up') {
        globalActions.setCanvasOpacity(globalState.canvasOpacity + 0.1);
      } else if (event === 'canvas-opacity-down') {
        globalActions.setCanvasOpacity(globalState.canvasOpacity - 0.1);
      } else if (event === 'toggle-mouse-through') {
        if (globalState.pinMode) {
          globalActions.setMouseThrough(!globalState.mouseThrough);
        }
      }
    });
    return cleanup;
  }, []);

  const [localThreshold, setLocalThreshold] = useState<number | null>(null);

  const handleCanvasOpacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    globalActions.setCanvasOpacity(val);
  };

  const handleVectorSearchThresholdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setLocalThreshold(val);
  };

  const handleVectorSearchThresholdCommit = async () => {
    if (localThreshold === null) return;
    const val = localThreshold;
    globalActions.setVectorSearchThreshold(val);
    setLocalThreshold(null);
    try {
      await fetch(`${API_BASE_URL}/api/settings/vectorSearchThreshold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: val }),
      });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div
      className={clsx(
        'relative z-[100] h-8 flex items-center justify-between pr-2 pl-2 select-none draggable border-b border-neutral-800',
        'bg-neutral-900'
      )}
    >
      <div className="flex items-center gap-2 text-neutral-400 text-xs font-bold">
        <span
          style={{
            color: isWindowActive ? THEME.primary : '#6b7280',
          }}
        >
          LookBack
        </span>
      </div>
      
      <div className="flex items-center gap-1 no-drag">
        <div className="relative">
             <button
                onClick={() => setCanvasMenuOpen(!canvasMenuOpen)}
                className={clsx(
                  "flex items-center gap-1 px-2 py-1 hover:bg-neutral-800 rounded transition-colors max-w-[160px]",
                  canvasMenuOpen && "bg-neutral-800"
                )}
                title={t('settings.canvas')}
            >
                <span className="truncate text-[10px] text-neutral-300 font-medium">
                  {canvasSnap.currentCanvasName || t('common.notSet')}
                </span>
                <ChevronDown size={10} className="text-neutral-500 shrink-0" />
            </button>
            
            {canvasMenuOpen && (
                <div className="absolute right-0 top-8 mt-1 w-64 rounded border border-neutral-700 bg-neutral-900/95 shadow-lg p-3 text-xs text-neutral-200 no-drag z-[110]">
                     <div className="space-y-1">
            <div className="text-[11px] text-neutral-400 flex justify-between items-center">
                <span>{t('settings.canvas')}</span>
                <button 
                    onClick={() => setIsCreatingCanvas(true)}
                    className="p-1 hover:bg-neutral-800 rounded"
                    title={t('settings.canvas.create')}
                >
                    <Plus size={12} />
                </button>
            </div>
            
            {isCreatingCanvas && (
                <div className="flex gap-1 mb-2">
                    <input 
                        className="flex-1 bg-neutral-800 text-[10px] px-2 py-1 rounded border border-neutral-700 outline-none focus:border-blue-500"
                        value={newCanvasName}
                        onChange={e => setNewCanvasName(e.target.value)}
                        placeholder={t('settings.canvas.placeholder')}
                        onKeyDown={e => e.key === 'Enter' && handleCreateCanvas()}
                        autoFocus
                    />
                    <button onClick={handleCreateCanvas} className="p-1 hover:bg-neutral-700 rounded text-green-500">
                        <Check size={12} />
                    </button>
                    <button onClick={() => setIsCreatingCanvas(false)} className="p-1 hover:bg-neutral-700 rounded text-neutral-400">
                        <X size={12} />
                    </button>
                </div>
            )}

            <div className="max-h-32 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                {canvases.map(c => (
                    <div key={c.name} 
                        className={clsx(
                            "flex items-center justify-between p-1 rounded group",
                            canvasSnap.currentCanvasName === c.name ? "bg-neutral-800" : "hover:bg-neutral-800/50 text-neutral-300"
                        )}
                        style={{ color: canvasSnap.currentCanvasName === c.name ? THEME.primary : undefined }}
                    >
                        {editingCanvas === c.name ? (
                            <div className="flex flex-1 gap-1 items-center">
                                <input 
                                    className="flex-1 bg-neutral-900 text-[10px] px-1 rounded border border-neutral-700 outline-none"
                                    value={editingName}
                                    onChange={e => setEditingName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleRenameCanvas()}
                                    autoFocus
                                    onClick={e => e.stopPropagation()}
                                />
                                <button onClick={handleRenameCanvas} className="text-green-500 hover:text-green-400">
                                    <Check size={10} />
                                </button>
                                <button onClick={() => setEditingCanvas(null)} className="text-neutral-500 hover:text-neutral-400">
                                    <X size={10} />
                                </button>
                            </div>
                        ) : (
                            <>
                                <div 
                                    className="flex-1 truncate text-[10px] cursor-pointer"
                                    onClick={() => { handleSwitchCanvas(c.name); setCanvasMenuOpen(false); }}
                                >
                                    {c.name}
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); setEditingCanvas(c.name); setEditingName(c.name); }}
                                        className="p-0.5 hover:text-white text-neutral-500"
                                        title={t('settings.canvas.rename')}
                                    >
                                        <Edit2 size={10} />
                                    </button>
                                    {canvases.length > 1 && (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleDeleteCanvas(c.name); }}
                                            className="p-0.5 hover:text-red-400 text-neutral-500"
                                            title={t('settings.canvas.deleteConfirm')}
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
        
        <div className="w-px h-4 bg-neutral-700 mx-1" />
        <button
          onClick={handleToggleSettings}
          className={clsx(
            'p-1 hover:bg-neutral-800 rounded transition-colors',
            settingsOpen && 'bg-neutral-800'
          )}
          style={{ color: settingsOpen ? THEME.primary : undefined }}
          title={t('titleBar.settings')}
        >
          <Settings size={14} />
        </button>
        <button 
            onClick={toggleAlwaysOnTop}
            className={clsx(
              'p-1 hover:bg-neutral-800 rounded transition-colors'
            )}
            style={{ color: snap.pinMode ? THEME.primary : undefined }}
            title={t('titleBar.alwaysOnTop')}
        >
          <Pin size={14} />
        </button>
        <div className="w-px h-4 bg-neutral-700 mx-1" />
        <button onClick={() => window.electron?.min()} className="p-1 hover:bg-neutral-800 rounded transition-colors">
          <Minus size={14} />
        </button>
        <button onClick={() => window.electron?.max()} className="p-1 hover:bg-neutral-800 rounded transition-colors">
          <Square size={14} />
        </button>
        <button onClick={() => window.electron?.close()} className="p-1 hover:bg-red-900 hover:text-red-200 rounded transition-colors">
          <X size={14} />
        </button>
      </div>

      {settingsOpen && (
        <div className="absolute right-2 top-8 mt-1 w-80 rounded border border-neutral-700 bg-neutral-900/95 shadow-lg p-3 text-xs text-neutral-200 no-drag flex flex-col gap-3 max-h-[85vh] overflow-y-auto custom-scrollbar">
          <div className="font-semibold px-1">{t('titleBar.settings')}</div>

          <div className="bg-neutral-800/30 p-2 rounded border border-neutral-800">
            <div className="text-[11px] text-neutral-400 mb-1">{t('titleBar.dataFolder')}</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 truncate text-[10px] text-neutral-300" title={storageDir || t('titleBar.dataFolder.default')}>
                {loadingStorageDir
                  ? t('common.loading')
                  : storageDir || t('titleBar.dataFolder.default')}
              </div>
              <button
                onClick={handleChangeStorageDir}
                disabled={updatingStorageDir}
                className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-[10px] disabled:opacity-60 border border-neutral-700 transition-colors"
              >
                {t('titleBar.change')}
              </button>
            </div>
          </div>

          <div className="bg-neutral-800/30 p-2 rounded border border-neutral-800">
            <div className="text-[11px] text-neutral-400 mb-1">{t('common.language')}</div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setLocale('en')}
                className={clsx(
                  'flex-1 py-1 rounded text-[10px] transition-colors border',
                  locale === 'en'
                    ? 'bg-neutral-700 text-white border-neutral-600'
                    : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-400 border-transparent hover:border-neutral-700',
                )}
              >
                {t('common.language.en')}
              </button>
              <button
                type="button"
                onClick={() => setLocale('zh')}
                className={clsx(
                  'flex-1 py-1 rounded text-[10px] transition-colors border',
                  locale === 'zh'
                    ? 'bg-neutral-700 text-white border-neutral-600'
                    : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-400 border-transparent hover:border-neutral-700',
                )}
              >
                {t('common.language.zh')}
              </button>
            </div>
          </div>

          <div className="bg-neutral-800/30 p-2 rounded border border-neutral-800 space-y-2">
            <div className="text-[11px] text-neutral-400">{t('titleBar.window')}</div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-neutral-300">
                {t('titleBar.pinTransparent')}
              </span>
              <ToggleSwitch
                checked={snap.pinTransparent}
                onToggle={handleTogglePinTransparent}
              />
            </div>
            {snap.pinMode && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-neutral-300">
                  {t('titleBar.mouseThrough')}
                </span>
                <ToggleSwitch
                  checked={snap.mouseThrough}
                  onToggle={handleToggleMouseThrough}
                />
              </div>
            )}
            <div className="flex flex-col gap-1 pt-1 border-t border-neutral-800/50">
                <div className="flex justify-between text-[10px]">
                  <span>{t('titleBar.canvasOpacity')}</span>
                  <span>{snap.canvasOpacity.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.1"
                  value={snap.canvasOpacity}
                  onChange={handleCanvasOpacityChange}
                  style={{
                      '--thumb-color': THEME.primary,
                  } as React.CSSProperties}
                  className={clsx(
                    "w-full h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer",
                    "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full",
                    "[&::-webkit-slider-thumb]:bg-[var(--thumb-color)]"
                  )}
                />
            </div>
          </div>

          <div className="bg-neutral-800/30 p-2 rounded border border-neutral-800 space-y-2">
            <div className="text-[11px] text-neutral-400">{t('titleBar.index')}</div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-neutral-300">
                {t('titleBar.enableAiSearchVector')}
              </span>
              <ToggleSwitch
                checked={enableVectorSearch}
                onToggle={() => void handleToggleVectorSearch()}
                disabled={loadingSettings}
              />
            </div>
            {enableVectorSearch && (
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[10px]">
                  <span>{t('titleBar.threshold')}</span>
                  <span>{(localThreshold ?? snap.vectorSearchThreshold).toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.15"
                  max="0.25"
                  step="0.01"
                  value={localThreshold ?? snap.vectorSearchThreshold}
                  onChange={handleVectorSearchThresholdChange}
                  onMouseUp={handleVectorSearchThresholdCommit}
                  onTouchEnd={handleVectorSearchThresholdCommit}
                  style={{
                      '--thumb-color': THEME.primary,
                  } as React.CSSProperties}
                  className={clsx(
                    "w-full h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer",
                    "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full",
                    "[&::-webkit-slider-thumb]:bg-[var(--thumb-color)]"
                  )}
                />
              </div>
            )}
            
            {(modelSnap.isDownloading || indexingSnap.isIndexing) && (
                 <div className="pt-2 border-t border-neutral-800/50 space-y-2">
                    {modelSnap.isDownloading && (
                      <div>
                        <div className="flex justify-between items-center text-[10px] text-neutral-400 mb-1">
                          <span>
                            {modelSnap.statusKey
                              ? t(modelSnap.statusKey, modelSnap.statusParams)
                              : t('model.downloading')}
                          </span>
                          <span>
                            {modelSnap.total > 0
                              ? `${Math.round((modelSnap.current / modelSnap.total) * 100)}%`
                              : ''}
                          </span>
                        </div>
                        {modelSnap.filename && (
                          <div className="text-[9px] text-neutral-500 truncate mb-1">
                            {modelSnap.filename}
                          </div>
                        )}
                        <div className="h-1 bg-neutral-800 rounded overflow-hidden">
                          <div
                            className="h-full bg-blue-600 transition-all duration-300"
                            style={{
                              width:
                                modelSnap.total > 0
                                  ? `${(modelSnap.current / modelSnap.total) * 100}%`
                                  : '0%',
                            }}
                          />
                        </div>
                      </div>
                    )}
                    
                    {indexingSnap.isIndexing && (
                        <div>
                           <div className="flex justify-between items-center text-[10px] text-neutral-400 mb-1">
                             <span>
                               {indexingSnap.statusKey
                                 ? t(indexingSnap.statusKey, indexingSnap.statusParams)
                                 : t('titleBar.processing')}
                             </span>
                             <span>{indexingSnap.total > 0 ? `${Math.round((indexingSnap.current / indexingSnap.total) * 100)}%` : ''}</span>
                           </div>
                           {indexingSnap.filename && (
                             <div className="text-[9px] text-neutral-500 truncate mb-1">
                               {indexingSnap.filename}
                             </div>
                           )}
                           <div className="h-1 bg-neutral-800 rounded overflow-hidden">
                             <div 
                               className="h-full bg-blue-600 transition-all duration-300"
                               style={{ 
                                 width: indexingSnap.total > 0 
                                   ? `${(indexingSnap.current / indexingSnap.total) * 100}%` 
                                   : '0%'
                               }} 
                             />
                           </div>
                        </div>
                    )}
                 </div>
            )}
            
            <button
                onClick={handleIndexMissing}
                disabled={indexing}
                className="w-full px-2 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-[10px] disabled:opacity-60 text-center border border-neutral-700 transition-colors"
              >
                {indexing ? t('titleBar.indexing') : t('titleBar.indexUnindexedImages')}
            </button>
          </div>

          <div className="bg-neutral-800/30 p-2 rounded border border-neutral-800 space-y-2">
            <div className="text-[11px] text-neutral-400">{t('titleBar.shortcuts')}</div>
            <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-neutral-300">
                    {t('titleBar.toggleWindowVisibility')}
                  </span>
                  <div className="flex items-center gap-1">
                    <ShortcutInput
                      value={snap.toggleWindowShortcut}
                      onChange={(accel) => void handleSetToggleWindowShortcut(accel)}
                      onInvalid={handleShortcutInvalid}
                    />
                    <button
                      type="button"
                      className="h-6 px-2 rounded bg-neutral-800 hover:bg-neutral-700 text-[10px] text-neutral-200 transition-colors border border-neutral-700"
                      onClick={() => {
                        const isMac =
                          typeof navigator !== 'undefined' &&
                          /Mac|iPhone|iPad|iPod/.test(navigator.platform || '');
                        const fallback = isMac ? 'Command+L' : 'Ctrl+L';
                        void handleSetToggleWindowShortcut(fallback);
                      }}
                      title={t('common.reset')}
                    >
                      {t('common.reset')}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-neutral-300">
                    {t('titleBar.canvasOpacityUp')}
                  </span>
                  <ShortcutInput
                      value={snap.canvasOpacityUpShortcut}
                      onChange={(accel) => void handleSetCanvasOpacityUpShortcut(accel)}
                      onInvalid={handleShortcutInvalid}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-neutral-300">
                    {t('titleBar.canvasOpacityDown')}
                  </span>
                  <ShortcutInput
                      value={snap.canvasOpacityDownShortcut}
                      onChange={(accel) => void handleSetCanvasOpacityDownShortcut(accel)}
                      onInvalid={handleShortcutInvalid}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-neutral-300">
                    {t('titleBar.canvasGroup')}
                  </span>
                  <ShortcutInput
                      value={snap.canvasGroupShortcut}
                      onChange={(accel) => void handleSetCanvasGroupShortcut(accel)}
                      onInvalid={handleShortcutInvalid}
                  />
                </div>
                {snap.pinMode && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-neutral-300">
                      {t('titleBar.toggleMouseThrough')}
                    </span>
                    <ShortcutInput
                        value={snap.toggleMouseThroughShortcut}
                        onChange={(accel) => void handleSetToggleMouseThroughShortcut(accel)}
                        onInvalid={handleShortcutInvalid}
                    />
                  </div>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
