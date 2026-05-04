// This file is intended to be dynamically loaded.
// Imports are not allowed. Dependencies are passed via context.

const PNG_MIME_TYPE = "image/png";
const MAX_CANVAS_SIDE = 32767;
const MAX_CANVAS_PIXELS = 268435456;
const PNG_TILE_WIDTH = 4096;
const MAX_PNG_STRIP_BYTES = 32 * 1024 * 1024;

const getImageUrl = (imagePath, canvasName, apiBaseUrl) => {
  let normalized = imagePath.replace(/\\/g, "/");
  if (normalized.startsWith("/")) {
    normalized = normalized.slice(1);
  }
  if (normalized.startsWith("assets/")) {
    const filename = normalized.split("/").pop() || normalized;
    const safeCanvasName = encodeURIComponent(canvasName || "Default");
    const safeFilename = encodeURIComponent(filename);
    return `${apiBaseUrl}/api/assets/${safeCanvasName}/${safeFilename}`;
  }
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return normalized;
  }
  return `${apiBaseUrl}/${normalized}`;
};

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = src;
  });

const clampPositive = (value) =>
  Number.isFinite(value) && value > 0 ? value : 0;

const getRenderBbox = (width, height, rotationDeg) => {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const hw = width / 2;
  const hh = height / 2;

  // Corners relative to center
  const x1 = -hw * cos - -hh * sin;
  const y1 = -hw * sin + -hh * cos;

  const x2 = hw * cos - -hh * sin;
  const y2 = hw * sin + -hh * cos;

  const x3 = hw * cos - hh * sin;
  const y3 = hw * sin + hh * cos;

  const x4 = -hw * cos - hh * sin;
  const y4 = -hw * sin + hh * cos;

  const xs = [x1, x2, x3, x4];
  const ys = [y1, y2, y3, y4];

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    width: maxX - minX,
    height: maxY - minY,
    offsetX: minX,
    offsetY: minY,
  };
};

const buildExportBounds = (items) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  items.forEach((item) => {
    const baseScale = item.scale ?? 1;
    const rawW =
      clampPositive(item.width) * baseScale;
    const rawH =
      clampPositive(item.height) * baseScale;
    if (!rawW || !rawH) return;
    const bbox = getRenderBbox(rawW, rawH, item.rotation ?? 0);
    minX = Math.min(minX, item.x + bbox.offsetX);
    minY = Math.min(minY, item.y + bbox.offsetY);
    maxX = Math.max(maxX, item.x + bbox.offsetX + bbox.width);
    maxY = Math.max(maxY, item.y + bbox.offsetY + bbox.height);
  });

  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY)
  ) {
    return null;
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
};

const trimTransparentEdges = (canvasEl) => {
  const ctx = canvasEl.getContext("2d");
  if (!ctx) return canvasEl;

  try {
    const { width, height } = canvasEl;
    const imageData = ctx.getImageData(0, 0, width, height).data;

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    // 扫描非透明像素，计算最小包围盒，消除导出空边
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const alpha = imageData[(y * width + x) * 4 + 3];
        if (alpha === 0) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }

    if (maxX < minX || maxY < minY) return canvasEl;

    const trimWidth = maxX - minX + 1;
    const trimHeight = maxY - minY + 1;
    if (trimWidth === width && trimHeight === height && minX === 0 && minY === 0) {
      return canvasEl;
    }

    const trimmed = document.createElement("canvas");
    trimmed.width = trimWidth;
    trimmed.height = trimHeight;
    const trimmedCtx = trimmed.getContext("2d");
    if (!trimmedCtx) return canvasEl;
    trimmedCtx.drawImage(
      canvasEl,
      minX,
      minY,
      trimWidth,
      trimHeight,
      0,
      0,
      trimWidth,
      trimHeight,
    );
    return trimmed;
  } catch {
    // 跨域图像会导致画布污染，此时保留原始画布避免流程中断
    return canvasEl;
  }
};

const applyBackground = (canvasEl, background) => {
  const output = document.createElement("canvas");
  output.width = canvasEl.width;
  output.height = canvasEl.height;
  const ctx = output.getContext("2d");
  if (!ctx) return canvasEl;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, output.width, output.height);
  ctx.drawImage(canvasEl, 0, 0);
  return output;
};

const getSelectedImageItems = (canvasState) =>
  canvasState.canvasItems.filter(
    (item) => item.isSelected && item.type === "image",
  );

const shouldUseSingleCanvasExport = (width, height) =>
  width <= MAX_CANVAS_SIDE &&
  height <= MAX_CANVAS_SIDE &&
  width * height <= MAX_CANVAS_PIXELS;

const canvasToPngBlob = (canvasEl) =>
  new Promise((resolve, reject) => {
    canvasEl.toBlob((blob) => {
      if (!blob || blob.size === 0) {
        reject(new Error("Canvas PNG encoding failed"));
        return;
      }
      resolve(blob);
    }, PNG_MIME_TYPE);
  });

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

const writeUint32 = (target, offset, value) => {
  target[offset] = (value >>> 24) & 255;
  target[offset + 1] = (value >>> 16) & 255;
  target[offset + 2] = (value >>> 8) & 255;
  target[offset + 3] = value & 255;
};

const getCrc32 = (bytes) => {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = crcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const createPngChunk = (type, data = new Uint8Array(0)) => {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(12 + data.length);
  writeUint32(chunk, 0, data.length);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  writeUint32(
    chunk,
    8 + data.length,
    getCrc32(chunk.subarray(4, 8 + data.length)),
  );
  return chunk;
};

const createPngHeader = (width, height) => {
  const signature = new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10,
  ]);
  const ihdr = new Uint8Array(13);
  writeUint32(ihdr, 0, width);
  writeUint32(ihdr, 4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return [signature, createPngChunk("IHDR", ihdr)];
};

const createRenderBox = (item) => {
  const baseScale = item.scale ?? 1;
  const rawW = clampPositive(item.width) * baseScale;
  const rawH = clampPositive(item.height) * baseScale;
  if (!rawW || !rawH) return null;
  const bbox = getRenderBbox(rawW, rawH, item.rotation ?? 0);
  return {
    x: item.x + bbox.offsetX,
    y: item.y + bbox.offsetY,
    width: bbox.width,
    height: bbox.height,
  };
};

const isBoxIntersecting = (a, b) =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

const renderTile = (
  tileCanvas,
  loadedImages,
  bounds,
  tile,
  background,
  transparent,
) => {
  tileCanvas.width = tile.width;
  tileCanvas.height = tile.height;
  const ctx = tileCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas context unavailable");

  ctx.clearRect(0, 0, tile.width, tile.height);
  if (!transparent) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, tile.width, tile.height);
  }

  const tileWorldBox = {
    x: bounds.x + tile.x,
    y: bounds.y + tile.y,
    width: tile.width,
    height: tile.height,
  };

  const visibleImages = loadedImages.filter(
    ({ renderBox }) => renderBox && isBoxIntersecting(renderBox, tileWorldBox),
  );
  drawLoadedImages(ctx, visibleImages, tileWorldBox);
  return ctx.getImageData(0, 0, tile.width, tile.height).data;
};

async function* generateTiledPngRows(
  loadedImages,
  bounds,
  width,
  height,
  background,
  transparent,
) {
  const tileCanvas = document.createElement("canvas");
  const bytesPerRow = width * 4 + 1;
  const stripHeight = Math.max(
    1,
    Math.min(256, Math.floor(MAX_PNG_STRIP_BYTES / bytesPerRow)),
  );

  for (let stripY = 0; stripY < height; stripY += stripHeight) {
    const currentStripHeight = Math.min(stripHeight, height - stripY);
    const rows = Array.from(
      { length: currentStripHeight },
      () => new Uint8Array(bytesPerRow),
    );

    for (let tileX = 0; tileX < width; tileX += PNG_TILE_WIDTH) {
      const tileWidth = Math.min(PNG_TILE_WIDTH, width - tileX);
      const tile = {
        x: tileX,
        y: stripY,
        width: tileWidth,
        height: currentStripHeight,
      };
      const tileData = renderTile(
        tileCanvas,
        loadedImages,
        bounds,
        tile,
        background,
        transparent,
      );

      for (let rowIndex = 0; rowIndex < currentStripHeight; rowIndex += 1) {
        const sourceStart = rowIndex * tileWidth * 4;
        const sourceEnd = sourceStart + tileWidth * 4;
        const targetStart = 1 + tileX * 4;
        rows[rowIndex].set(tileData.subarray(sourceStart, sourceEnd), targetStart);
      }
    }

    for (const row of rows) {
      // PNG filter type 0 keeps rows independent, so strips can be encoded sequentially.
      row[0] = 0;
      yield row;
    }
  }
}

const encodeTiledPngBlob = async (
  loadedImages,
  bounds,
  width,
  height,
  background,
  transparent,
) => {
  if (typeof CompressionStream !== "function") {
    throw new Error("CompressionStream is unavailable");
  }

  const parts = createPngHeader(width, height);
  const compressor = new CompressionStream("deflate");
  const writer = compressor.writable.getWriter();
  const reader = compressor.readable.getReader();

  const writeRows = async () => {
    try {
      for await (const row of generateTiledPngRows(
        loadedImages,
        bounds,
        width,
        height,
        background,
        transparent,
      )) {
        await writer.write(row);
      }
      await writer.close();
    } catch (error) {
      await writer.abort(error);
      throw error;
    }
  };

  const writePromise = writeRows();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.length) {
        parts.push(createPngChunk("IDAT", value));
      }
    }
    await writePromise;
  } catch (error) {
    await writePromise.catch(() => {});
    throw error;
  }

  parts.push(createPngChunk("IEND"));
  return new Blob(parts, { type: PNG_MIME_TYPE });
};

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

const loadSelectedImages = async (
  items,
  currentCanvasName,
  apiBaseUrl,
  ignoreLoadFailure,
) =>
  Promise.all(
    items.map(async (item) => {
      const url = getImageUrl(
        item.imagePath,
        currentCanvasName,
        apiBaseUrl,
      );
      try {
        const img = await loadImage(url);
        return { item, img };
      } catch (error) {
        if (ignoreLoadFailure) return null;
        throw error;
      }
    }),
  );

const drawLoadedImages = (ctx, loadedImages, bounds) => {
  loadedImages.forEach((data) => {
    if (!data) return;
    const { item, img } = data;
    const baseScale = item.scale ?? 1;
    const flipX = item.flipX === true;
    const rotation = (item.rotation ?? 0) * (Math.PI / 180);
    const drawX = item.x - bounds.x;
    const drawY = item.y - bounds.y;
    ctx.save();
    ctx.translate(drawX, drawY);
    ctx.rotate(rotation);
    ctx.scale(baseScale * (flipX ? -1 : 1), baseScale);
    ctx.drawImage(
      img,
      -item.width / 2,
      -item.height / 2,
      item.width,
      item.height,
    );
    ctx.restore();
  });
};

const renderStitchedCanvas = async (
  context,
  canvasState,
  { background, transparent, scale, trim, ignoreLoadFailure },
) => {
  const {
    config: { API_BASE_URL },
  } = context;

  const selectedItems = getSelectedImageItems(canvasState);
  if (selectedItems.length === 0) return null;

  const bounds = buildExportBounds(selectedItems);
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null;

  const exportWidth = Math.max(1, Math.ceil(bounds.width * scale));
  const exportHeight = Math.max(1, Math.ceil(bounds.height * scale));
  const canvasEl = document.createElement("canvas");
  canvasEl.width = exportWidth;
  canvasEl.height = exportHeight;
  const ctx = canvasEl.getContext("2d");
  if (!ctx) return null;

  if (!transparent && !trim) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, exportWidth, exportHeight);
  }

  ctx.scale(scale, scale);

  const loadedImages = await loadSelectedImages(
    selectedItems,
    canvasState.currentCanvasName,
    API_BASE_URL,
    ignoreLoadFailure,
  );
  drawLoadedImages(ctx, loadedImages, bounds);

  if (!trim) return canvasEl;

  const trimmedCanvas = trimTransparentEdges(canvasEl);
  return transparent ? trimmedCanvas : applyBackground(trimmedCanvas, background);
};

const generateStitchPreview = async (context, canvasState, options = {}) => {
  const { background = "#ffffff", transparent = false } = options;

  const selectedItems = getSelectedImageItems(canvasState);
  const bounds = buildExportBounds(selectedItems);
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null;

  // Limit preview size to avoid performance issues
  const MAX_PREVIEW_SIZE = 800;
  const scale = Math.min(
    1,
    MAX_PREVIEW_SIZE / Math.max(bounds.width, bounds.height),
  );

  const outputCanvas = await renderStitchedCanvas(context, canvasState, {
    background,
    transparent,
    scale,
    trim: true,
    ignoreLoadFailure: true,
  });
  if (!outputCanvas) return null;

  const blob = await canvasToPngBlob(outputCanvas);
  return URL.createObjectURL(blob);
};

const exportStitchedImage = async (context, canvasState, options = {}) => {
  const {
    actions: { globalActions },
  } = context;

  const { background = "#ffffff", transparent = false } = options;

  const selectedItems = getSelectedImageItems(canvasState);

  if (selectedItems.length === 0) {
    globalActions.pushToast(
      { key: "toast.command.exportNoSelection" },
      "warning",
    );
    return;
  }

  try {
    const bounds = buildExportBounds(selectedItems);
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
      globalActions.pushToast({ key: "toast.command.exportFailed" }, "error");
      return;
    }

    const exportWidth = Math.max(1, Math.ceil(bounds.width));
    const exportHeight = Math.max(1, Math.ceil(bounds.height));

    let blob = null;
    if (shouldUseSingleCanvasExport(exportWidth, exportHeight)) {
      const outputCanvas = await renderStitchedCanvas(context, canvasState, {
        background,
        transparent,
        scale: 1,
        trim: false,
        ignoreLoadFailure: false,
      });
      if (!outputCanvas) {
        globalActions.pushToast({ key: "toast.command.exportFailed" }, "error");
        return;
      }
      blob = await canvasToPngBlob(outputCanvas);
    } else {
      const {
        config: { API_BASE_URL },
      } = context;
      const loadedImages = await loadSelectedImages(
        selectedItems,
        canvasState.currentCanvasName,
        API_BASE_URL,
        false,
      );
      const renderableImages = loadedImages.map((data) => ({
        ...data,
        renderBox: createRenderBox(data.item),
      }));
      blob = await encodeTiledPngBlob(
        renderableImages,
        bounds,
        exportWidth,
        exportHeight,
        background,
        transparent,
      );
    }

    const filename = `stitched_${Date.now()}.png`;
    downloadBlob(blob, filename);
    globalActions.pushToast({ key: "toast.command.exportSaved" }, "success");
  } catch (error) {
    void error;
    globalActions.pushToast({ key: "toast.command.exportFailed" }, "error");
  }
};

export const config = {
  id: "stitchExport",
  i18n: {
    en: {
      "command.stitchExport.title": "Stitch Export",
      "command.stitchExport.description":
        "Export selected images as a stitched image",
      "command.stitchExport.preview.loading": "Loading preview...",
      "command.stitchExport.preview.empty": "No images selected",
      "command.stitchExport.transparent": "Transparent",
      "command.stitchExport.action.export": "Export Stitch",
      "command.stitchExport.action.exporting": "Exporting...",
    },
    zh: {
      "command.stitchExport.title": "拼接导出",
      "command.stitchExport.description": "将选中图片拼接并导出",
      "command.stitchExport.preview.loading": "预览生成中...",
      "command.stitchExport.preview.empty": "未选择图片",
      "command.stitchExport.transparent": "透明背景",
      "command.stitchExport.action.export": "导出拼接图",
      "command.stitchExport.action.exporting": "导出中...",
    },
  },
  titleKey: "command.stitchExport.title",
  title: "Stitch Export",
  descriptionKey: "command.stitchExport.description",
  description: "Export selected images as a stitched image",
  keywords: ["export", "stitch", "image", "combine"],
};

export const ui = ({ context }) => {
  const { React, actions, hooks } = context;
  const { useState, useEffect } = React;
  const { useT } = hooks;
  const { t } = useT();
  const { useEnvState } = hooks;
  const { canvas: canvasSnap } = useEnvState();

  const [background, setBackground] = useState("#ffffff");
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [transparent, setTransparent] = useState(false);
  const [previewBackground, setPreviewBackground] = useState(background);

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await exportStitchedImage(context, canvasSnap, { background, transparent });
      actions.commandActions.close();
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    const handle = setTimeout(() => {
      setPreviewBackground(background);
    }, 300);
    return () => clearTimeout(handle);
  }, [background]);

  useEffect(() => {
    let active = true;
    let objectUrl = null;
    setLoading(true);
    generateStitchPreview(context, canvasSnap, {
      background: previewBackground,
      transparent,
    }).then((url) => {
      objectUrl = url;
      if (active) {
        setPreviewUrl(url);
        setLoading(false);
      } else if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    }).catch(() => {
      if (active) {
        setPreviewUrl(null);
        setLoading(false);
      }
    });
    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [previewBackground, transparent, context, canvasSnap]);

  return (
    <div className="flex flex-col h-full">
      {/* Preview Area */}
      <div className="h-96 flex items-center justify-center bg-neutral-900/50 p-4 border-b border-neutral-800 overflow-hidden relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm">
            <span className="text-xs text-neutral-400">
              {t("command.stitchExport.preview.loading")}
            </span>
          </div>
        )}
        {previewUrl ? (
          <img
            src={previewUrl}
            className="h-full object-contain shadow-lg"
          />
        ) : (
          <span className="text-xs text-neutral-500">
            {t("command.stitchExport.preview.empty")}
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 p-4 text-xs text-neutral-300">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-neutral-400">
              <input
                type="checkbox"
                checked={transparent}
                onChange={(e) => setTransparent(e.target.checked)}
                className="h-3.5 w-3.5 rounded border border-neutral-700 bg-neutral-900"
              />
              <span>{t("command.stitchExport.transparent")}</span>
            </label>
            <input
              type="color"
              value={background}
              onChange={(e) => setBackground(e.target.value)}
              disabled={transparent}
              className={`h-6 w-8 rounded border bg-neutral-900 ${
                transparent
                  ? "border-neutral-800 opacity-40 cursor-not-allowed"
                  : "border-neutral-700"
              }`}
            />
          </div>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded text-xs text-white transition-colors ${
              exporting
                ? "bg-neutral-800/70 cursor-not-allowed opacity-70"
                : "bg-neutral-800 hover:bg-neutral-700"
            }`}
          >
            {exporting && (
              <span className="h-3 w-3 rounded-full border border-neutral-500 border-t-white animate-spin" />
            )}
            <span>
              {t(
                exporting
                  ? "command.stitchExport.action.exporting"
                  : "command.stitchExport.action.export",
              )}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
