
// This file is intended to be dynamically loaded.
// Imports are not allowed. Dependencies are passed via context.

export const config = {
  id: 'imageSearch',
  title: 'Image Search',
  description: 'Search images by tone and color',
  keywords: ['search', 'image', 'find', 'color', 'tone'],
};

// --- Helpers ---
const isHexColor = (value) => /^#[0-9a-fA-F]{6}$/.test(value.trim());

const hexToRgb = (value) => {
  const normalized = value.trim().replace('#', '');
  if (normalized.length !== 6) return null;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return null;
  return { r, g, b };
};

const colorDistance = (a, b) => {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return null;
  const dr = ra.r - rb.r;
  const dg = ra.g - rb.g;
  const db = ra.b - rb.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
};

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

const COLOR_DISTANCE_THRESHOLD = 90;

export const ui = ({ context }) => {
  const { React, hooks, state, actions, config: appConfig } = context;
  const { useSnapshot } = hooks;
  const { useMemo, useRef } = React;
  const snap = useSnapshot(state.commandState);
  const globalSnap = useSnapshot(state.globalState);
  const canvasSnap = useSnapshot(state.canvasState);
  
  const API_BASE_URL = appConfig?.API_BASE_URL || '';

  // 3x3 Grid
  // Y-axis: High, Mid, Low (Key)
  // X-axis: Short, Mid, Long (Range)
  const rows = ['high', 'mid', 'low'];
  const cols = ['short', 'mid', 'long'];

  const gradients = {
    'high-short': 'linear-gradient(to bottom, #ffffff, #e5e5e5)',
    'high-mid': 'linear-gradient(to bottom, #ffffff, #a3a3a3)',
    'high-long': 'linear-gradient(to bottom, #ffffff, #525252)',
    'mid-short': 'linear-gradient(to bottom, #a3a3a3, #737373)',
    'mid-mid': 'linear-gradient(to bottom, #d4d4d4, #525252)',
    'mid-long': 'linear-gradient(to bottom, #e5e5e5, #262626)',
    'low-short': 'linear-gradient(to bottom, #525252, #262626)',
    'low-mid': 'linear-gradient(to bottom, #737373, #171717)',
    'low-long': 'linear-gradient(to bottom, #a3a3a3, #000000)',
  };

  const currentTone = snap.commandInputs['image-search']?.tone || '';
  const currentColor = snap.commandInputs['image-search']?.color || '';

  const setTone = (val) => actions.commandActions.setCommandInput('image-search', 'tone', val);
  const setColor = (val) => actions.commandActions.setCommandInput('image-search', 'color', val);

  const handleColorChange = (e) => {
    const newColor = e.target.value;
    const index = globalSnap.colorSwatches.indexOf(currentColor);
    if (index !== -1) {
      actions.globalActions.setColorSwatch(index, newColor);
    }
    setColor(newColor);
  };

  const handleClear = () => {
      setTone('');
      setColor('');
  };

  // Search Logic
  const imageResults = useMemo(() => {
    const toneFilter = currentTone.trim();
    const colorFilter = currentColor.trim();
    const hasTone = Boolean(toneFilter);
    const hasColor = isHexColor(colorFilter);

    if (!hasTone && !hasColor) return [];

    const filtered = canvasSnap.canvasItems
      .filter((item) => item.type === 'image')
      .map((item) => {
        const distance = hasColor && item.dominantColor
          ? colorDistance(item.dominantColor, colorFilter)
          : null;
        return { item, distance: distance ?? undefined };
      })
      .filter(({ item, distance }) => {
        if (hasTone && item.tone !== toneFilter) return false;
        if (hasColor) {
          if (!item.dominantColor) return false;
          if (typeof distance !== 'number') return false;
          return distance <= COLOR_DISTANCE_THRESHOLD;
        }
        return true;
      });

    if (hasColor) {
      filtered.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
    }
    return filtered;
  }, [canvasSnap.canvasItems, currentTone, currentColor]);

  const handleSelect = (item) => {
    actions.emitContainCanvasItem({ id: item.canvasId });
    actions.commandActions.close();
  };

  const palette = useMemo(() => {
    const swatches = globalSnap.colorSwatches || [];
    // If current color is set and not in swatches, we append it so it's visible as the active item
    if (currentColor && !swatches.includes(currentColor)) {
        return [...swatches, currentColor];
    }
    return swatches;
  }, [globalSnap.colorSwatches, currentColor]);

  return (
    <div className="flex flex-col h-full max-h-[500px]">
      {/* Header / Filters */}
      <div className="flex gap-4 px-4 py-3 border-b border-neutral-800 shrink-0 overflow-x-auto scrollbar-hide">
        
        {/* Tone Matrix */}
        <div className="flex flex-col gap-1 shrink-0">
          <div className="flex items-center gap-1 mb-1">
             <div className="w-3" />
             <div className="flex justify-between w-[68px] px-1">
                 <span className="text-[9px] text-neutral-600">S</span>
                 <span className="text-[9px] text-neutral-600">M</span>
                 <span className="text-[9px] text-neutral-600">L</span>
             </div>
          </div>
          <div className="flex gap-1">
             {/* Y-Axis Label */}
             <div className="flex flex-col gap-1 w-3">
                 <div className="h-5 flex items-center justify-center">
                    <span className="text-[9px] text-neutral-600 leading-none">H</span>
                 </div>
                 <div className="h-5 flex items-center justify-center">
                    <span className="text-[9px] text-neutral-600 leading-none">M</span>
                 </div>
                 <div className="h-5 flex items-center justify-center">
                    <span className="text-[9px] text-neutral-600 leading-none">L</span>
                 </div>
             </div>

             {/* Grid */}
             <div className="grid grid-cols-3 gap-1">
               {rows.map(row => (
                 cols.map(col => {
                   const value = `${row}-${col}`;
                   const active = currentTone === value;
                   return (
                     <button
                       key={value}
                       type="button"
                       onClick={() => setTone(active ? '' : value)}
                       className={`w-5 h-5 rounded-sm border transition-all ${
                         active 
                           ? 'border-primary ring-1 ring-primary z-10' 
                           : 'border-neutral-800 hover:border-neutral-600 opacity-80 hover:opacity-100'
                       }`}
                       style={{ background: gradients[value] || '#333' }}
                       title={`${row} key / ${col} range`}
                     />
                   );
                 })
               ))}
             </div>
          </div>
        </div>

        <div className="w-px bg-neutral-800 mx-1 shrink-0" />

        {/* Color Palette */}
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400 font-medium">Color</span>
              <button
                  type="button"
                  onClick={handleClear}
                  className="text-[10px] text-neutral-500 hover:text-neutral-300 transition-colors"
              >
                  Clear All
              </button>
          </div>
          
          <div className="flex flex-wrap gap-1.5">
             {palette.map((color) => {
                const isActive = currentColor === color;
                return (
                    <div key={color} className="relative">
                        <button
                            type="button"
                            className={`h-5 w-5 rounded-full border transition-transform ${
                                isActive 
                                    ? 'border-primary ring-1 ring-primary scale-110' 
                                    : 'border-neutral-700 hover:scale-110'
                            }`}
                            style={{ backgroundColor: color }}
                            onClick={() => setColor(color)}
                        />
                        {/* If active, overlay the picker input so clicking again opens picker */}
                        {isActive && (
                             <input
                                type="color"
                                value={currentColor || '#ffffff'}
                                onChange={handleColorChange}
                                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                title="Change this color"
                             />
                        )}
                    </div>
                );
             })}
          </div>
        </div>
      </div>

      {/* Results List */}
      <div className="flex-1 overflow-y-auto">
        {imageResults.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-neutral-500">
            {(currentTone || currentColor) ? 'No images found' : 'Select tone or color to search'}
          </div>
        ) : (
          <div className="flex flex-col">
            {imageResults.map(({ item, distance }) => (
              <button
                key={item.canvasId}
                type="button"
                onClick={() => handleSelect(item)}
                className="w-full px-4 py-3 text-left flex items-center gap-4 text-sm transition-colors text-neutral-200 hover:bg-neutral-800/70 group"
              >
                <div className="h-10 w-10 rounded border border-neutral-700 overflow-hidden shrink-0 bg-neutral-900">
                  <img
                    src={getImageUrl(item.imagePath, canvasSnap.currentCanvasName, API_BASE_URL)}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate group-hover:text-primary transition-colors">{item.filename}</div>
                  <div className="text-[11px] text-neutral-500 flex items-center gap-2">
                    {item.tone && <span>{item.tone}</span>}
                  </div>
                </div>
                {typeof distance === 'number' && (
                  <span className="text-[10px] text-neutral-500">
                    Dist: {Math.round(distance)}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
