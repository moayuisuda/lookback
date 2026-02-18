import { useEffect, useRef } from "react";
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
  const uploadShowTimerRef = useRef<number | null>(null);
  const uploadVisible = globalSnap.uploadProgress.visible;
  const uploadTotal = globalSnap.uploadProgress.total;
  const uploadCompleted = globalSnap.uploadProgress.completed;
  const uploadStartedAt = globalSnap.uploadProgress.startedAt;

  useEffect(() => {
    if (uploadShowTimerRef.current !== null) {
      window.clearTimeout(uploadShowTimerRef.current);
      uploadShowTimerRef.current = null;
    }

    if (uploadVisible) return;
    if (uploadTotal <= 0) return;
    if (uploadCompleted >= uploadTotal) return;
    if (uploadStartedAt <= 0) return;

    const elapsed = Date.now() - uploadStartedAt;
    const delayMs = Math.max(0, 1000 - elapsed);

    uploadShowTimerRef.current = window.setTimeout(() => {
      const current = globalState.uploadProgress;
      if (current.visible) return;
      if (current.total > 0 && current.completed < current.total) {
        globalActions.showUploadProgress();
      }
    }, delayMs);

    return () => {
      if (uploadShowTimerRef.current !== null) {
        window.clearTimeout(uploadShowTimerRef.current);
        uploadShowTimerRef.current = null;
      }
    };
  }, [uploadVisible, uploadTotal, uploadCompleted, uploadStartedAt]);

  useEffect(() => {
    if (uploadTotal <= 0) return;
    if (uploadCompleted < uploadTotal) return;
    globalActions.hideUploadProgress();
  }, [uploadTotal, uploadCompleted]);

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
        if (metas.length === 0) return;

        if (metas.length > 1) {
          canvasActions.addManyImagesToCanvasCentered(metas, center ?? { x: 100, y: 100 });
          return;
        }

        if (center) {
          canvasActions.addToCanvas(metas[0], center.x, center.y);
          return;
        }

        canvasActions.addToCanvas(metas[0]);
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  const upload = globalSnap.uploadProgress;
  const uploadPercent =
    upload.total > 0 ? (upload.completed / Math.max(1, upload.total)) * 100 : 0;
  const uploadPercentClamped = Math.max(0, Math.min(100, uploadPercent));
  const uploadPercentLabel = Math.round(uploadPercentClamped);

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
      {upload.visible && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-lg border border-neutral-700 bg-neutral-900 p-6 shadow-xl">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold text-white">
                {t("upload.progress.title")}
              </h3>
              <div className="text-xs text-neutral-400">
                {t("upload.progress.counter", {
                  completed: upload.completed,
                  total: upload.total,
                })}
              </div>
            </div>

            <div className="mt-4 h-2 w-full overflow-hidden rounded bg-neutral-800">
              <div
                className="h-full rounded bg-primary transition-[width] duration-200"
                style={{
                  width: `${uploadPercentClamped}%`,
                }}
              />
            </div>

            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-neutral-400">
              <div>
                {t("upload.progress.percent", { percent: uploadPercentLabel })}
              </div>
              {upload.failed > 0 && (
                <div className="text-danger">
                  {t("upload.progress.failed", { failed: upload.failed })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
