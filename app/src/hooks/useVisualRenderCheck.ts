import { useRef } from 'react';

export const useVisualRenderCheck = (componentName: string, enabled = true) => {
  void componentName;
  void enabled;
  const ref = useRef<SVGElement | HTMLElement | null>(null);

  // useEffect(() => {
  //   if (!enabled) return;
  //   void componentName;

  //   const el = ref.current;
  //   if (el) {
  //     // 保存原始样式
  //     const originalOutline = el.style.outline;
  //     const originalFilter = el.style.filter;

  //     // HTML 元素用 outline
  //     el.style.outline = '2px solid rgba(255, 0, 0, 0.8)';

  //     // SVG 元素(特别是 g 标签)通常不支持 outline，使用 drop-shadow filter 模拟高亮
  //     // 注意：这会叠加或覆盖现有的 filter，但对于调试目的通常是可以接受的
  //     el.style.filter = 'drop-shadow(0 0 100px red)';

  //     const timer = setTimeout(() => {
  //       if (el) {
  //         el.style.outline = originalOutline;
  //         el.style.filter = originalFilter;
  //       }
  //     }, 200);

  //     return () => {
  //       clearTimeout(timer);
  //       if (el) {
  //         el.style.outline = originalOutline;
  //         el.style.filter = originalFilter;
  //       }
  //     };
  //   }

  //   // 可以在控制台也输出一下
  //   // console.log(`[${componentName}] Rendered at`, new Date().toLocaleTimeString());
  // }, [componentName, enabled]);

  return ref;
};
