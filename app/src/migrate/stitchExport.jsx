
// This file is intended to be dynamically loaded.
// Imports are not allowed. Dependencies are passed via context.

const getImageUrl = (imagePath, canvasName, apiBaseUrl) => {
  let normalized = imagePath.replace(/\\/g, '/');
  if (normalized.startsWith('/')) {
    normalized = normalized.slice(1);
  }
  if (normalized.startsWith('assets/')) {
    const filename = normalized.split('/').pop() || normalized;
    const safeCanvasName = encodeURIComponent(canvasName || 'Default');
    const safeFilename = encodeURIComponent(filename);
    return `${apiBaseUrl}/api/assets/${safeCanvasName}/${safeFilename}`;
  }
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    return normalized;
  }
  return `${apiBaseUrl}/${normalized}`;
};

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = src;
  });

const clampPositive = (value) =>
  Number.isFinite(value) && value > 0 ? value : 0;

const buildExportBounds = (items, getRenderBbox) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  items.forEach((item) => {
    const baseScale = item.scale ?? 1;
    const rawW = clampPositive(item.width) * baseScale * Math.abs(item.scaleX ?? 1);
    const rawH = clampPositive(item.height) * baseScale * Math.abs(item.scaleY ?? 1);
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

const generateStitchPreview = async (context, background) => {
  const { 
    state: { canvasState }, 
    utils: { getRenderBbox },
    config: { API_BASE_URL },
  } = context;

  const selectedIds = Array.from(canvasState.selectedIds || []);
  if (selectedIds.length === 0) return null;

  const selectedItems = canvasState.canvasItems.filter(
    (item) => item.type === 'image' && selectedIds.includes(item.canvasId),
  );

  if (selectedItems.length === 0) return null;

  const bounds = buildExportBounds(selectedItems, getRenderBbox);
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null;

  // Limit preview size to avoid performance issues
  const MAX_PREVIEW_SIZE = 800;
  const scale = Math.min(1, MAX_PREVIEW_SIZE / Math.max(bounds.width, bounds.height));
  
  const exportWidth = Math.ceil(bounds.width * scale);
  const exportHeight = Math.ceil(bounds.height * scale);
  
  const canvasEl = document.createElement('canvas');
  canvasEl.width = exportWidth;
  canvasEl.height = exportHeight;
  const ctx = canvasEl.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, exportWidth, exportHeight);
  
  ctx.scale(scale, scale);

  const orderedItems = canvasState.canvasItems.filter(
    (item) => item.type === 'image' && selectedIds.includes(item.canvasId),
  );

  const loadedImages = await Promise.all(
    orderedItems.map(async (item) => {
      const url = getImageUrl(item.imagePath, canvasState.currentCanvasName, API_BASE_URL);
      try {
        const img = await loadImage(url);
        return { item, img };
      } catch (e) {
        return null;
      }
    }),
  );

  loadedImages.forEach((data) => {
    if (!data) return;
    const { item, img } = data;
    const baseScale = item.scale ?? 1;
    const scaleX = item.scaleX ?? 1;
    const scaleY = item.scaleY ?? 1;
    const rotation = (item.rotation ?? 0) * (Math.PI / 180);
    const drawX = item.x - bounds.x;
    const drawY = item.y - bounds.y;
    ctx.save();
    ctx.translate(drawX, drawY);
    ctx.rotate(rotation);
    ctx.scale(baseScale * scaleX, baseScale * scaleY);
    ctx.drawImage(img, -item.width / 2, -item.height / 2, item.width, item.height);
    ctx.restore();
  });

  return canvasEl.toDataURL('image/png');
};

const exportStitchedImage = async (context) => {
  const { 
    state: { canvasState, commandState }, 
    actions: { globalActions },
    utils: { getRenderBbox },
    config: { API_BASE_URL },
    electron 
  } = context;
  
  const selectedIds = Array.from(canvasState.selectedIds || []);
  if (selectedIds.length === 0) {
    globalActions.pushToast({ key: 'toast.command.exportNoSelection' }, 'warning');
    return;
  }

  const selectedItems = canvasState.canvasItems.filter(
    (item) => item.type === 'image' && selectedIds.includes(item.canvasId),
  );

  if (selectedItems.length === 0) {
    globalActions.pushToast({ key: 'toast.command.exportNoSelection' }, 'warning');
    return;
  }

  try {
    const bounds = buildExportBounds(selectedItems, getRenderBbox);
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
      globalActions.pushToast({ key: 'toast.command.exportFailed' }, 'error');
      return;
    }

    const exportWidth = Math.ceil(bounds.width);
    const exportHeight = Math.ceil(bounds.height);
    const canvasEl = document.createElement('canvas');
    canvasEl.width = exportWidth;
    canvasEl.height = exportHeight;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) {
      globalActions.pushToast({ key: 'toast.command.exportFailed' }, 'error');
      return;
    }

    const background =
      commandState.commandInputs['stitch-export']?.background || '#ffffff';
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, exportWidth, exportHeight);

    const orderedItems = canvasState.canvasItems.filter(
      (item) => item.type === 'image' && selectedIds.includes(item.canvasId),
    );

    const loadedImages = await Promise.all(
      orderedItems.map(async (item) => {
        const url = getImageUrl(item.imagePath, canvasState.currentCanvasName, API_BASE_URL);
        const img = await loadImage(url);
        return { item, img };
      }),
    );

    loadedImages.forEach(({ item, img }) => {
      const scale = item.scale ?? 1;
      const scaleX = item.scaleX ?? 1;
      const scaleY = item.scaleY ?? 1;
      const rotation = (item.rotation ?? 0) * (Math.PI / 180);
      const drawX = item.x - bounds.x;
      const drawY = item.y - bounds.y;
      ctx.save();
      ctx.translate(drawX, drawY);
      ctx.rotate(rotation);
      ctx.scale(scale * scaleX, scale * scaleY);
      ctx.drawImage(img, -item.width / 2, -item.height / 2, item.width, item.height);
      ctx.restore();
    });

    const imageBase64 = canvasEl.toDataURL('image/png');
    const filename = `stitched_${Date.now()}.png`;

    if (electron?.saveImageFile) {
      const result = await electron.saveImageFile(imageBase64, filename);
      if (result?.canceled) {
        return;
      }
      if (!result?.success) {
        globalActions.pushToast({ key: 'toast.command.exportFailed' }, 'error');
        return;
      }
      globalActions.pushToast({ key: 'toast.command.exportSaved' }, 'success');
      return;
    }

    const link = document.createElement('a');
    link.href = imageBase64;
    link.download = filename;
    link.click();
    globalActions.pushToast({ key: 'toast.command.exportSaved' }, 'success');
  } catch (error) {
    void error;
    globalActions.pushToast({ key: 'toast.command.exportFailed' }, 'error');
  }
};

export const config = {
  id: 'stitchExport',
  title: 'Stitch Export',
  description: 'Export selected images as a stitched image',
  keywords: ['export', 'stitch', 'image', 'combine'],
};

export const ui = ({ context }) => {
  const { React, hooks, state, actions, components } = context;
  const { useSnapshot } = hooks;
  const { useState, useEffect } = React;
  const snap = useSnapshot(state.commandState);
  const globalSnap = useSnapshot(state.globalState);
  const { ColorPicker } = components || {}; 

  const background = snap.commandInputs['stitch-export']?.background || '#ffffff';
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(false);

  const setBackground = (color) => {
    actions.commandActions.setCommandInput('stitch-export', 'background', color);
  };

  const handleExport = async () => {
    await exportStitchedImage(context);
    actions.commandActions.close();
  };

  // Generate preview when background or selection changes
  useEffect(() => {
    let active = true;
    setLoading(true);
    generateStitchPreview(context, background).then((url) => {
        if (active) {
            setPreviewUrl(url);
            setLoading(false);
        }
    });
    return () => { active = false; };
  }, [background, context]); // Note: context includes state, so it might re-render often. Ideally we should pick specific deps.
  // However, since this component is remounted when command opens, it's fine. 
  // But if context changes too often, we should optimize. 
  // state.canvasState.selectedIds is deep in context.state. 
  // For now let's rely on the fact that this UI is simple.

  return (
    <div className="flex flex-col h-full max-h-[500px]">
        {/* Preview Area */}
        <div className="flex-1 min-h-[200px] flex items-center justify-center bg-neutral-900/50 p-4 border-b border-neutral-800 overflow-hidden relative">
            {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm">
                    <span className="text-xs text-neutral-400">Loading preview...</span>
                </div>
            )}
            {previewUrl ? (
                <img src={previewUrl} className="max-w-full max-h-full object-contain shadow-lg" />
            ) : (
                <span className="text-xs text-neutral-500">No images selected</span>
            )}
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-3 p-4 text-xs text-neutral-300">
            <div className="flex items-center gap-2">
            <span className="text-neutral-400">Background Color</span>
            {ColorPicker ? (
                <ColorPicker
                    value={background}
                    onChange={setBackground}
                    swatches={globalSnap.colorSwatches}
                />
            ) : (
                <input
                    type="color"
                    value={background}
                    onChange={(e) => setBackground(e.target.value)}
                    className="h-6 w-8 rounded border border-neutral-700 bg-neutral-900"
                />
            )}
            </div>
            <div className="flex justify-end pt-2">
            <button
                type="button"
                onClick={handleExport}
                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded text-xs text-white transition-colors"
            >
                Export Stitch
            </button>
            </div>
        </div>
    </div>
  );
};
