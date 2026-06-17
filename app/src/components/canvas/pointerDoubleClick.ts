export type PointerDoubleClickTap = {
  clientX: number;
  clientY: number;
  pointerType: string;
  timeStamp: number;
};

const POINTER_DOUBLE_CLICK_MAX_DELAY = 300;
const POINTER_DOUBLE_CLICK_MAX_DISTANCE = 12;

export const createPointerDoubleClickTap = (
  e: Pick<PointerEvent, "clientX" | "clientY" | "pointerType" | "timeStamp">,
): PointerDoubleClickTap => ({
  clientX: e.clientX,
  clientY: e.clientY,
  pointerType: e.pointerType,
  timeStamp: e.timeStamp,
});

export const isPointerDoubleClickTap = (
  current: PointerDoubleClickTap,
  previous: PointerDoubleClickTap | null,
) => {
  if (!previous || previous.pointerType !== current.pointerType) return false;

  const delay = current.timeStamp - previous.timeStamp;
  const distance = Math.hypot(
    current.clientX - previous.clientX,
    current.clientY - previous.clientY,
  );

  return (
    delay > 0 &&
    delay <= POINTER_DOUBLE_CLICK_MAX_DELAY &&
    distance <= POINTER_DOUBLE_CLICK_MAX_DISTANCE
  );
};
