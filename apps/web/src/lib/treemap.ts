/** A box in a treemap, in the same units as the rectangle it was laid out in. */
export type Box = { x: number; y: number; width: number; height: number };

/**
 * Squarified treemap: splits `rect` into one box per value, each box's area in
 * proportion to its value, keeping boxes as close to square as possible
 * (Bruls, Huizing and van Wijk). Values that are zero or less get an empty box.
 * Boxes come back in the same order as `values`.
 */
export function squarify(values: number[], rect: Box): Box[] {
  const boxes: Box[] = values.map(() => ({ x: rect.x, y: rect.y, width: 0, height: 0 }));
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0 || rect.width <= 0 || rect.height <= 0) return boxes;

  // Largest first; areas scaled to the rectangle.
  const scale = (rect.width * rect.height) / total;
  const order = values
    .map((value, index) => ({ index, area: Math.max(0, value) * scale }))
    .filter((item) => item.area > 0)
    .sort((a, b) => b.area - a.area);

  let { x, y, width, height } = rect;
  let row: typeof order = [];

  /** The worst aspect ratio in a row laid along a side of length `side`. */
  const worst = (items: typeof order, side: number) => {
    const sum = items.reduce((total, item) => total + item.area, 0);
    if (!sum || !side) return Infinity;
    let max = 0;
    for (const item of items) {
      const ratio = Math.max((side * side * item.area) / (sum * sum), (sum * sum) / (side * side * item.area));
      max = Math.max(max, ratio);
    }
    return max;
  };

  const place = (items: typeof order) => {
    const sum = items.reduce((total, item) => total + item.area, 0);
    if (width >= height) {
      // A column along the left edge.
      const columnWidth = height ? sum / height : 0;
      let offset = y;
      for (const item of items) {
        const boxHeight = columnWidth ? item.area / columnWidth : 0;
        boxes[item.index] = { x, y: offset, width: columnWidth, height: boxHeight };
        offset += boxHeight;
      }
      x += columnWidth;
      width -= columnWidth;
    } else {
      // A row along the top edge.
      const rowHeight = width ? sum / width : 0;
      let offset = x;
      for (const item of items) {
        const boxWidth = rowHeight ? item.area / rowHeight : 0;
        boxes[item.index] = { x: offset, y, width: boxWidth, height: rowHeight };
        offset += boxWidth;
      }
      y += rowHeight;
      height -= rowHeight;
    }
  };

  for (const item of order) {
    const side = Math.min(width, height);
    if (row.length === 0 || worst([...row, item], side) <= worst(row, side)) {
      row.push(item);
    } else {
      place(row);
      row = [item];
    }
  }
  if (row.length) place(row);
  return boxes;
}

/**
 * Heat-map colour for a day's change in percent: red for falls, grey near zero, green for
 * rises, at full strength from ±3%.
 */
export function changeColor(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return "#8a9396";
  const strength = Math.min(1, Math.abs(pct) / 3);
  const grey = [138, 147, 150];
  const target = pct >= 0 ? [27, 122, 61] : [196, 36, 46];
  const mix = grey.map((channel, index) => Math.round(channel + (target[index] - channel) * strength));
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
}
