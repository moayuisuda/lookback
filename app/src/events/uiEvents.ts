export const OPEN_TAG_COLOR_PICKER = "open-tag-color-picker" as const;
export const CANVAS_AUTO_LAYOUT = "canvas-auto-layout" as const;
export const CONTAIN_CANVAS_ITEM = "contain-canvas-item" as const;

export type OpenTagColorPickerDetail = {
  tag: string;
  x: number;
  y: number;
};

export type ContainCanvasItemDetail = {
  id: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isOpenTagColorPickerDetail = (
  detail: unknown
): detail is OpenTagColorPickerDetail => {
  if (!isRecord(detail)) return false;
  return (
    typeof detail.tag === "string" &&
    typeof detail.x === "number" &&
    typeof detail.y === "number"
  );
};

export const isContainCanvasItemDetail = (
  detail: unknown
): detail is ContainCanvasItemDetail => {
  if (!isRecord(detail)) return false;
  return typeof detail.id === "string" && detail.id.trim().length > 0;
};

export const emitOpenTagColorPicker = (detail: OpenTagColorPickerDetail) => {
  window.dispatchEvent(
    new CustomEvent<OpenTagColorPickerDetail>(OPEN_TAG_COLOR_PICKER, { detail })
  );
};

export const emitContainCanvasItem = (detail: ContainCanvasItemDetail) => {
  window.dispatchEvent(
    new CustomEvent<ContainCanvasItemDetail>(CONTAIN_CANVAS_ITEM, { detail })
  );
};

export const onOpenTagColorPicker = (
  handler: (detail: OpenTagColorPickerDetail) => void
) => {
  const listener = (e: Event) => {
    if (!(e instanceof CustomEvent)) return;
    if (!isOpenTagColorPickerDetail((e as CustomEvent).detail)) return;
    handler((e as CustomEvent<OpenTagColorPickerDetail>).detail);
  };
  window.addEventListener(OPEN_TAG_COLOR_PICKER, listener);
  return () => window.removeEventListener(OPEN_TAG_COLOR_PICKER, listener);
};

export const onContainCanvasItem = (
  handler: (detail: ContainCanvasItemDetail) => void
) => {
  const listener = (e: Event) => {
    if (!(e instanceof CustomEvent)) return;
    if (!isContainCanvasItemDetail((e as CustomEvent).detail)) return;
    handler((e as CustomEvent<ContainCanvasItemDetail>).detail);
  };
  window.addEventListener(CONTAIN_CANVAS_ITEM, listener);
  return () => window.removeEventListener(CONTAIN_CANVAS_ITEM, listener);
};
