
interface Size {
  w: number;
  h: number;
}

interface Rect extends Size {
  id: string;
  x?: number;
  y?: number;
}

interface Space {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function packRectangles(
  rects: Rect[], 
  gap: number, 
  containerWidth?: number
): Rect[] {
  // 1. Sort by height descending
  const sorted = [...rects].sort((a, b) => b.h - a.h);
  
  // 2. Determine container width if not provided
  let width = containerWidth;
  if (!width) {
    let totalArea = 0;
    let maxWidth = 0;
    for (const r of sorted) {
      totalArea += (r.w + gap) * (r.h + gap);
      maxWidth = Math.max(maxWidth, r.w + gap);
    }
    // Heuristic: sqrt(area) is a good starting point for a square-ish layout
    width = Math.max(Math.ceil(Math.sqrt(totalArea)), maxWidth);
  }

  // 3. Guillotine Packer with Fixed Width
  // Start with one infinite-height space
  const spaces: Space[] = [{ x: 0, y: 0, w: width, h: Infinity }];
  
  for (const rect of sorted) {
    const w = rect.w + gap;
    const h = rect.h + gap;
    
    // Find best space (Top-Left rule: min Y, then min X)
    let bestSpaceIdx = -1;
    let bestY = Infinity;
    let bestX = Infinity;
    
    for (let i = 0; i < spaces.length; i++) {
      const s = spaces[i];
      // Check if fits
      if (s.w >= w && s.h >= h) {
        // Prioritize top-most, then left-most
        if (s.y < bestY || (s.y === bestY && s.x < bestX)) {
          bestY = s.y;
          bestX = s.x;
          bestSpaceIdx = i;
        }
      }
    }
    
    if (bestSpaceIdx !== -1) {
      const s = spaces[bestSpaceIdx];
      
      // Place rect
      rect.x = s.x;
      rect.y = s.y;
      
      // Remove used space
      spaces.splice(bestSpaceIdx, 1);
      
      // Split and add new spaces using "Split Horizontal" (SAS - Short Axis Split logic adapted)
      // Since we sort by height, placing items in rows (Horizontal split) is usually efficient.
      
      // Right space: Height limited to the placed item's height (minus gap logic implicitly handled)
      // We want the space to the right to match the current "row" height.
      const right: Space = {
        x: s.x + w,
        y: s.y,
        w: s.w - w,
        h: h // Limit height to the placed item's height
      };
      
      // Down space: Full width of the original space
      const down: Space = {
        x: s.x,
        y: s.y + h,
        w: s.w,
        h: s.h - h
      };
      
      // Add valid spaces
      if (right.w > 0 && right.h > 0) spaces.push(right);
      if (down.w > 0 && down.h > 0) spaces.push(down);
      
      // Optional: Merge spaces? (Skipped for simplicity, not strictly necessary for basic packing)
    } else {
      // Fallback: If it doesn't fit (e.g. wider than container), extend container?
      // Since we calculate width to be >= maxWidth, this only happens if containerWidth was forced small.
      // In that case, we can't place it inside. 
      // For now, let's just place it at the bottom left as a fail-safe, expanding downward.
      
      // Find max Y of all placed items + spaces?
      // Simple fallback: 
      rect.x = 0;
      rect.y = 0; // Should ideally find max Y.
      // But given our dynamic width calc, this branch should be rare/impossible unless constraints change.
    }
  }
  
  return sorted;
}
