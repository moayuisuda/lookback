import { useEffect, useRef, type RefObject } from "react";

type Handler = (event: PointerEvent) => void;

export const useClickOutside = <T extends HTMLElement = HTMLElement>(
  ref: RefObject<T | null> | RefObject<T | null>[],
  handler: Handler,
): void => {
  const savedHandler = useRef(handler);

  useEffect(() => {
    savedHandler.current = handler;
  }, [handler]);

  useEffect(() => {
    const listener = (event: PointerEvent) => {
      const refs = Array.isArray(ref) ? ref : [ref];

      const isInside = refs.some((itemRef) => {
        const el = itemRef.current;
        return el && el.contains(event.target as Node);
      });

      if (isInside) {
        return;
      }

      savedHandler.current(event);
    };

    // 捕获 pointerdown，确保画布阻止后续鼠标事件时仍能识别外部点击。
    document.addEventListener("pointerdown", listener, true);

    return () => {
      document.removeEventListener("pointerdown", listener, true);
    };
  }, [ref]);
};
