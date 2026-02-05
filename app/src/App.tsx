import { useEffect } from "react";
import { TitleBar } from "./components/TitleBar";
import { Canvas } from "./components/Canvas";
import {
  globalActions,
  globalState,
  type ToastType,
} from "./store/globalStore";
import { canvasActions, canvasState } from "./store/canvasStore";
import { anchorActions } from "./store/anchorStore";
import { useSnapshot } from "valtio";
import { clsx } from "clsx";

import { createTempMetasFromFiles } from "./utils/import";
import { useT } from "./i18n/useT";
import { isI18nKey } from "../shared/i18n/guards";
import { useAppShortcuts } from "./hooks/useAppShortcuts";

import { WindowResizer } from "./components/WindowResizer";
import { CommandPalette } from "./components/CommandPalette";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

function App() {
  useAppShortcuts();
  const globalSnap = useSnapshot(globalState);
  const { t } = useT();

  useEffect(() => {
    // 监听 Toast 消息
    const cleanupToast = window.electron?.onToast?.((data) => {
      if (!isRecord(data)) return;
      if (!isI18nKey(data.key)) return;
      const type =
        data.type === "success" ||
        data.type === "error" ||
        data.type === "warning" ||
        data.type === "info"
          ? (data.type as ToastType)
          : "info";
      const params = isRecord(data.params)
        ? (data.params as Record<string, string | number>)
        : undefined;
      globalActions.pushToast({ key: data.key, params }, type);
    });
    
    // 初始化加载
    anchorActions.loadAnchors();

    const cleanupVisibility = window.electron?.onRendererEvent?.(
      (event: string, ...args: unknown[]) => {
        if (event === "app-visibility") {
          const visible = args[0] as boolean;
          globalActions.setAppHidden(!visible);
        }
      }
    );

    return () => {
      cleanupToast?.();
      cleanupVisibility?.();
    };
  }, []);

  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (document.hidden) return;
      // 1. Try to get files directly (works for Finder files and most screenshots)
      let files = Array.from(e.clipboardData?.files || []);

      // 2. If no files found, check items (some browsers/OS might put image data here without populating files)
      if (files.length === 0 && e.clipboardData?.items) {
        const items = Array.from(e.clipboardData.items);
        files = items
          .filter((item) => item.type.startsWith("image/"))
          .map((item) => item.getAsFile())
          .filter((f): f is File => f !== null);
      }

      if (files.length > 0) {
        e.preventDefault();

        const { canvasViewport, dimensions } = canvasState;
        const width = dimensions.width || canvasViewport.width;
        const height = dimensions.height || canvasViewport.height;
        const scale = canvasViewport.scale || 1;
        const hasViewport =
          Number.isFinite(width) &&
          Number.isFinite(height) &&
          width > 0 &&
          height > 0 &&
          Number.isFinite(canvasViewport.x) &&
          Number.isFinite(canvasViewport.y) &&
          Number.isFinite(scale) &&
          scale > 0;
        const center = hasViewport
          ? {
              x: (width / 2 - canvasViewport.x) / scale,
              y: (height / 2 - canvasViewport.y) / scale,
            }
          : null;

        const metas = await createTempMetasFromFiles(
          files,
          canvasState.currentCanvasName
        );
        
        const newIds: string[] = [];
        metas.forEach((meta, index) => {
          let newId: string | undefined;
          if (!center) {
            newId = canvasActions.addToCanvas(meta);
          } else {
            const offset = index * 24;
            newId = canvasActions.addToCanvas(meta, center.x + offset, center.y + offset);
          }
          if (newId) newIds.push(newId);
        });

        if (newIds.length > 1) {
          setTimeout(() => {
            canvasActions.autoLayoutCanvas(newIds, {
              startX: center?.x ?? 100,
              startY: center?.y ?? 100,
            });
          }, 50);
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  return (
    <div
      className={clsx(
        "relative flex flex-col h-screen text-white overflow-hidden transition-colors",
        globalSnap.mouseThrough ? "bg-transparent" : "bg-neutral-950/85",
        globalSnap.isAppHidden && "hidden"
      )}
    >
      <WindowResizer />
      <TitleBar />
      {globalSnap.toasts.length > 0 && (
        <div className="fixed right-4 top-10 z-[9999] flex flex-col gap-2 no-drag">
          {globalSnap.toasts.map((toast) => {
            const tone =
              toast.type === "success"
                ? "border-emerald-700/60 bg-emerald-950/80 text-emerald-100"
                : toast.type === "error"
                  ? "border-red-700/60 bg-red-950/80 text-red-100"
                  : toast.type === "warning"
                    ? "border-yellow-700/60 bg-yellow-950/80 text-yellow-100"
                    : "border-neutral-700/70 bg-neutral-900/90 text-neutral-100";
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
        className={clsx(
          "relative flex flex-1 overflow-hidden transition-colors duration-300",
        )}
      >
        <CommandPalette />
        <div className="flex-1 w-full h-full">
          <Canvas />
        </div>
      </div>
    </div>
  );
}

export default App;
