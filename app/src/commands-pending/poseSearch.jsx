// This file is intended to be dynamically loaded.
// Imports are not allowed. Dependencies are passed via context.

export const config = {
  id: "poseSearch",
  i18n: {
    en: {
      "command.poseSearch.title": "Pose Search",
      "command.poseSearch.description": "Search and add pose reference images",
      "command.poseSearch.loading": "Loading...",
      "command.poseSearch.error": "Failed to load",
      "toast.command.poseSearch.added": "Image added to canvas",
      "toast.command.poseSearch.failed": "Failed to add image: {{error}}",
      "toast.command.poseSearch.clipAdded": "Clipped image added to canvas",
    },
    zh: {
      "command.poseSearch.title": "姿势搜索",
      "command.poseSearch.description": "搜索并添加姿势参考图",
      "command.poseSearch.loading": "加载中...",
      "command.poseSearch.error": "加载失败",
      "toast.command.poseSearch.added": "图片已加入画板",
      "toast.command.poseSearch.failed": "添加图片失败：{{error}}",
      "toast.command.poseSearch.clipAdded": "裁剪图片已加入画板",
    },
  },
  titleKey: "command.poseSearch.title",
  title: "Pose Search",
  descriptionKey: "command.poseSearch.description",
  description: "Search and add pose reference images",
  keywords: ["pose", "search", "reference", "姿势", "搜索", "参考"],
};

const getCanvasCenter = (canvasSnap) => {
  const viewport = canvasSnap.canvasViewport || {};
  const dimensions = canvasSnap.dimensions || {};
  const scale = viewport.scale || 1;
  return {
    x: ((dimensions.width || 0) / 2 - (viewport.x || 0)) / scale,
    y: ((dimensions.height || 0) / 2 - (viewport.y || 0)) / scale,
  };
};

export const ui = ({ context }) => {
  const { React, hooks, actions, config: appConfig } = context;
  const { useRef, useEffect, useState } = React;
  const { useT, useEnvState } = hooks;
  const { t } = useT();
  const { canvas: canvasSnap } = useEnvState();

  const iframeRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      setIsLoading(false);
      setHasError(false);

      try {
        // 注入脚本到 iframe，监听右键点击图片事件
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDoc) return;

        // 创建脚本元素
        const script = iframeDoc.createElement("script");
        script.textContent = `
          (function() {
            // 监听右键菜单
            document.addEventListener('contextmenu', function(e) {
              // 检查是否点击的是图片
              let target = e.target;
              let imgUrl = null;
              
              // 直接点击 img 标签
              if (target.tagName === 'IMG') {
                imgUrl = target.src;
              }
              // 点击包含背景图的元素
              else if (target.style && target.style.backgroundImage) {
                const match = target.style.backgroundImage.match(/url\\(['"]?([^'"\\)]+)['"]?\\)/);
                if (match) {
                  imgUrl = match[1];
                }
              }
              // 向上查找父元素中的图片
              else {
                let parent = target.parentElement;
                let depth = 0;
                while (parent && depth < 5) {
                  if (parent.tagName === 'IMG') {
                    imgUrl = parent.src;
                    break;
                  }
                  if (parent.style && parent.style.backgroundImage) {
                    const match = parent.style.backgroundImage.match(/url\\(['"]?([^'"\\)]+)['"]?\\)/);
                    if (match) {
                      imgUrl = match[1];
                      break;
                    }
                  }
                  const img = parent.querySelector('img');
                  if (img) {
                    imgUrl = img.src;
                    break;
                  }
                  parent = parent.parentElement;
                  depth++;
                }
              }

              if (imgUrl) {
                e.preventDefault();
                e.stopPropagation();
                
                // 发送消息到父窗口
                window.parent.postMessage({
                  type: 'POSE_SEARCH_ADD_IMAGE',
                  imageUrl: imgUrl
                }, '*');
              }
            }, true);
          })();
        `;
        iframeDoc.head.appendChild(script);
      } catch (error) {
        console.error("Failed to inject script into iframe:", error);
      }
    };

    const handleError = () => {
      setIsLoading(false);
      setHasError(true);
    };

    iframe.addEventListener("load", handleLoad);
    iframe.addEventListener("error", handleError);

    return () => {
      iframe.removeEventListener("load", handleLoad);
      iframe.removeEventListener("error", handleError);
    };
  }, []);

  useEffect(() => {
    // 监听来自 iframe 的消息
    const handleMessage = async (event) => {
      // 安全检查：确保消息来自本地开发服务器或 pose-search 网站
      const origin = event.origin;
  const isLocalhost = origin.includes("localhost") || origin.includes("127.0.0.1");
  const isPoseSearch = origin.includes("clever-starship-00b840.netlify.app");
      
      if (!isLocalhost && !isPoseSearch) return;

      // 处理 IMAGE_CLIP 事件（base64 图片数据）
      if (event.data?.type === "IMAGE_CLIP") {
        const { data: base64, width, height } = event.data;
        if (!base64) return;

        try {
          const { API_BASE_URL } = appConfig;
          const canvasName = canvasSnap.currentCanvasName;
          // 解析 base64，支持 data:image/png;base64,... 或纯 base64
          let mimeType = "image/png";
          let b64 = base64;
          const dataUriMatch = base64.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
          if (dataUriMatch) {
            mimeType = dataUriMatch[1];
            b64 = dataUriMatch[2];
          }
          // 转为二进制
          const byteString = atob(b64);
          const arrayBuffer = new Uint8Array(byteString.length);
          for (let i = 0; i < byteString.length; i++) {
            arrayBuffer[i] = byteString.charCodeAt(i);
          }
          const blob = new Blob([arrayBuffer], { type: mimeType });
          // 构造上传参数
          const formData = new FormData();
          formData.append("filename", `pose-clip-${Date.now()}.png`);
          formData.append("canvasName", canvasName || "");
          formData.append("file", blob);

          // 上传到 /api/upload-temp
          const resp = await fetch(`${API_BASE_URL}/api/upload-temp?filename=pose-clip-${Date.now()}.png&canvasName=${encodeURIComponent(canvasName || "")}`, {
            method: "POST",
            body: blob,
            headers: {
              "Content-Type": mimeType
            }
          });

          if (!resp.ok) {
            throw new Error("Failed to save image");
          }

          const data = await resp.json();
          if (!data?.success || !data.path) {
            throw new Error(data?.error || "Failed to save image");
          }

          // 创建图片元数据
          const filename = data.filename || "pose-clip";
          const dot = filename.lastIndexOf(".");
          const imageMeta = {
            id: `temp_${Date.now()}_${Math.random().toString(16).slice(2)}`,
            filename: dot > 0 ? filename.slice(0, dot) : filename,
            imagePath: data.path,
            pageUrl: "pose-search-clip",
            tags: ["pose", "reference", "clip"],
            createdAt: Date.now(),
            dominantColor: data.dominantColor ?? null,
            tone: data.tone ?? null,
            hasVector: false,
            width: width || data.width || 0,
            height: height || data.height || 0,
          };

          // 添加到画板
          actions.canvasActions.addManyImagesToCanvasCentered(
            [imageMeta],
            getCanvasCenter(canvasSnap)
          );

          actions.globalActions.pushToast(
            { key: "toast.command.poseSearch.clipAdded" },
            "success"
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          actions.globalActions.pushToast(
            {
              key: "toast.command.poseSearch.failed",
              params: { error: message },
            },
            "error"
          );
        }
        return;
      }

      // 处理原有的 POSE_SEARCH_ADD_IMAGE 事件（URL 图片）
      if (event.data?.type === "POSE_SEARCH_ADD_IMAGE") {
        const imageUrl = event.data.imageUrl;
        if (!imageUrl) return;

        try {
          const { API_BASE_URL } = appConfig;
          const canvasName = canvasSnap.currentCanvasName;

          // 下载图片
          const resp = await fetch(`${API_BASE_URL}/api/download-url`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: imageUrl,
              canvasName,
            }),
          });

          if (!resp.ok) {
            throw new Error("Download failed");
          }

          const data = await resp.json();
          if (!data?.success || !data.path) {
            throw new Error(data?.error || "Download failed");
          }

          // 创建图片元数据
          const filename = data.filename || "pose-image";
          const dot = filename.lastIndexOf(".");
          const imageMeta = {
            id: `temp_${Date.now()}_${Math.random().toString(16).slice(2)}`,
            filename: dot > 0 ? filename.slice(0, dot) : filename,
            imagePath: data.path,
            pageUrl: imageUrl,
            tags: ["pose", "reference"],
            createdAt: Date.now(),
            dominantColor: data.dominantColor ?? null,
            tone: data.tone ?? null,
            hasVector: false,
            width: data.width || 0,
            height: data.height || 0,
          };

          // 添加到画板
          actions.canvasActions.addManyImagesToCanvasCentered(
            [imageMeta],
            getCanvasCenter(canvasSnap)
          );

          actions.globalActions.pushToast(
            { key: "toast.command.poseSearch.added" },
            "success"
          );
          // 不自动关闭命令面板，方便连续添加多张图片
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          actions.globalActions.pushToast(
            {
              key: "toast.command.poseSearch.failed",
              params: { error: message },
            },
            "error"
          );
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [actions, t, appConfig, canvasSnap]);

  return (
    <div className="flex flex-col w-full" style={{height: 680}}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-900/90 z-10">
          <div className="text-sm text-neutral-400">
            {t("command.poseSearch.loading")}
          </div>
        </div>
      )}

      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-900/90 z-10">
          <div className="text-sm text-red-400">
            {t("command.poseSearch.error")}
          </div>
        </div>
      )}

      <div className="flex-1 relative">
        <iframe
          ref={iframeRef}
          src="https://clever-starship-00b840.netlify.app/#/"
          className="w-full h-full border-0"
          title="Pose Search"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          allow="clipboard-read; clipboard-write"
        />
      </div>

      <div className="px-4 py-2 text-xs text-neutral-500 border-t border-neutral-800 shrink-0">
        {t("command.poseSearch.description")} - 右键图片可添加到画板
      </div>
    </div>
  );
};
