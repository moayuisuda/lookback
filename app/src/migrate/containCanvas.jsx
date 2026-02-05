
export const config = {
  id: 'containCanvas',
  title: 'Contain Canvas',
  description: 'Zoom to fit all items in the canvas',
  keywords: ['zoom', 'fit', 'contain', 'reset view'],
};

export const run = ({ state, actions, utils }) => {
  const items = state.canvasState.canvasItems || [];
  if (items.length === 0) return;

  const { getRenderBbox } = utils;

  // Calculate bounding box of all items
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  items.forEach((item) => {
    const scale = item.scale || 1;
    const rawW = (item.width || 0) * scale * Math.abs(item.type === 'text' ? 1 : item.scaleX || 1);
    const rawH = (item.height || 0) * scale * Math.abs(item.type === 'text' ? 1 : item.scaleY || 1);
    const bbox = getRenderBbox(rawW, rawH, item.rotation || 0);

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
    return;
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const padding = 50;

  // Calculate viewport
  const containerWidth = state.canvasState.dimensions.width;
  const containerHeight = state.canvasState.dimensions.height;

  const scaleX = (containerWidth - padding * 2) / width;
  const scaleY = (containerHeight - padding * 2) / height;
  const scale = Math.min(scaleX, scaleY);

  const x = (containerWidth - width * scale) / 2 - minX * scale;
  const y = (containerHeight - height * scale) / 2 - minY * scale;

  actions.canvasActions.setCanvasViewport({
    x,
    y,
    width: containerWidth,
    height: containerHeight,
    scale,
  });
};
