import { useEffect, useRef } from 'react';
import { TitleBar } from './components/TitleBar';
import { Gallery } from './components/Gallery';
import { Canvas } from './components/Canvas';
import { EnvInitModal } from './components/EnvInitModal';
import { state as galleryState, actions as galleryActions } from './store/galleryStore';
import { THEME } from './theme';
import {
  globalActions,
  globalState,
  envInitActions,
  type EnvInitState,
  type ToastType,
} from './store/globalStore';
import type { ImageMeta } from './store/galleryStore';
import { canvasActions } from './store/canvasStore';
import { useSnapshot } from 'valtio';

import { importFiles } from './utils/import';
import { API_BASE_URL } from './config';
import { useT } from './i18n/useT';
import { isI18nKey } from '../shared/i18n/guards';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isImageMeta = (value: unknown): value is ImageMeta => {
  if (!isRecord(value)) return false;
  if (typeof value.image !== 'string') return false;
  if (!Array.isArray(value.tags) || !value.tags.every(t => typeof t === 'string')) return false;
  if (typeof value.createdAt !== 'number') return false;
  if (value.dominantColor !== undefined && value.dominantColor !== null && typeof value.dominantColor !== 'string') return false;
  return true;
};

function App() {
  const globalSnap = useSnapshot(globalState);
  const isResizingRef = useRef(false);
  const { t } = useT();
  const isPinTransparent = globalSnap.pinMode && globalSnap.pinTransparent;

  // Removed useEffect for pinMode resizeWindowBy as it is now handled atomically in TitleBar

  useEffect(() => {
    // 监听 Electron 传来的新收藏
    const cleanupNew = window.electron?.onNewCollection((data) => {
      console.log('New collection received:', data);
      if (isImageMeta(data)) {
        galleryActions.addImage(data);
      }
    });
    
    // 监听更新 (例如向量生成完毕)
    const cleanupUpdate = window.electron?.onImageUpdated((data) => {
      console.log('Image update received:', data);
      if (isRecord(data) && typeof data.image === 'string') {
        galleryActions.updateImage(data.image, data as Partial<ImageMeta>);
      }
    });

    // 监听环境初始化进度 (UV/Python) -> 模态框
    const cleanupEnv = window.electron?.onEnvInitProgress((data) => {
      if (isRecord(data)) {
        envInitActions.update(data as unknown as Partial<EnvInitState>);
      }
    });

    // 监听 Toast 消息
    const cleanupToast = window.electron?.onToast?.((data) => {
      if (!isRecord(data)) return;
      if (!isI18nKey(data.key)) return;
      const type =
        data.type === 'success' || data.type === 'error' || data.type === 'warning' || data.type === 'info'
          ? (data.type as ToastType)
          : 'info';
      const params = isRecord(data.params) ? (data.params as Record<string, string | number>) : undefined;
      globalActions.pushToast({ key: data.key, params }, type);
    });

    void (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/images`);
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as { code?: unknown } | null;
          if (payload && payload.code === 'STORAGE_INCOMPATIBLE') {
            globalActions.pushToast(
              { key: 'toast.storageIncompatible' },
              'error',
            );
            return;
          }
          throw new Error(`Failed to fetch images: ${res.status}`);
        }
        const data = await res.json();
        if (Array.isArray(data)) {
          galleryActions.setImages(data);
          galleryActions.setAllImages(data);
        }
      } catch (err) {
        console.error('Failed to fetch images:', err);
      } finally {
        canvasActions.initCanvas((imagePath) => {
          const meta =
            galleryState.allImages.find((m) => m.image === imagePath) ||
            galleryState.images.find((m) => m.image === imagePath);
          return meta ?? null;
        });
      }
    })();

    return () => {
      cleanupNew?.();
      cleanupUpdate?.();
      cleanupEnv?.();
      cleanupToast?.();
    };
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const newWidth = Math.max(200, Math.min(e.clientX, document.body.clientWidth - 200));
      globalActions.setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (isResizingRef.current) {
        globalActions.persistSidebarWidth();
      }
      isResizingRef.current = false;
      document.body.style.cursor = 'default';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      // 1. Try to get files directly (works for Finder files and most screenshots)
      let files = Array.from(e.clipboardData?.files || []);
      
      // 2. If no files found, check items (some browsers/OS might put image data here without populating files)
      if (files.length === 0 && e.clipboardData?.items) {
        const items = Array.from(e.clipboardData.items);
        files = items
          .filter(item => item.type.startsWith('image/'))
          .map(item => item.getAsFile())
          .filter((f): f is File => f !== null);
      }

      if (files.length > 0) {
        e.preventDefault();
        
        const metas = await importFiles(files);
        void metas;
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  return (
    <div
      onMouseEnter={() => window.electron?.focus()}
      className={
        isPinTransparent
          ? 'flex flex-col h-screen bg-transparent text-white overflow-hidden'
          : 'flex flex-col h-screen bg-neutral-950 text-white overflow-hidden'
      }
    >
      <TitleBar />
      <EnvInitModal />
      {globalSnap.toasts.length > 0 && (
        <div className="fixed right-4 top-10 z-[9999] flex flex-col gap-2 no-drag">
          {globalSnap.toasts.map((toast) => {
            const tone =
              toast.type === 'success'
                ? 'border-emerald-700/60 bg-emerald-950/80 text-emerald-100'
                : toast.type === 'error'
                  ? 'border-red-700/60 bg-red-950/80 text-red-100'
                  : toast.type === 'warning'
                    ? 'border-yellow-700/60 bg-yellow-950/80 text-yellow-100'
                    : 'border-neutral-700/70 bg-neutral-900/90 text-neutral-100';
            return (
              <button
                key={toast.id}
                type="button"
                className={`max-w-[320px] rounded border px-3 py-2 text-left text-xs shadow-lg backdrop-blur transition-colors hover:bg-neutral-800/90 ${tone}`}
                onClick={() => globalActions.removeToast(toast.id)}
              >
                {t(toast.message.key, toast.message.params)}
              </button>
            );
          })}
        </div>
      )}
      <div 
        className="flex flex-1 overflow-hidden"
        style={{ opacity: globalSnap.canvasOpacity }}
      >
        {!globalSnap.pinMode && (
          <>
            <Gallery />
            <div
              className="w-1 bg-neutral-800 hover:bg-[var(--resize-hover)] cursor-col-resize transition-colors z-10"
              style={{ '--resize-hover': THEME.primary } as React.CSSProperties}
              onMouseDown={(e) => {
                e.preventDefault();
                isResizingRef.current = true;
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';
              }}
            />
          </>
        )}
        <Canvas />
      </div>
      {isPinTransparent && (
        <div
          className="fixed bottom-1.5 right-1.5 w-2.5 h-2.5 rounded-full z-[9999] shadow-lg draggable cursor-move"
          style={{ backgroundColor: THEME.primary }}
        />
      )}
    </div>
  );
}

export default App;
