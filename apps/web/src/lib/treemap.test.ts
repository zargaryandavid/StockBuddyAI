import { describe, expect, it } from "vitest";

import { changeColor, squarify } from "./treemap";

describe("squarify", () => {
  it("fills the rectangle with boxes whose areas follow the values", () => {
    const rect = { x: 0, y: 0, width: 600, height: 400 };
    const values = [6, 6, 4, 3, 2, 2, 1];
    const boxes = squarify(values, rect);
    const total = values.reduce((sum, value) => sum + value, 0);
    boxes.forEach((box, index) => {
      expect(box.width * box.height).toBeCloseTo((values[index] / total) * 600 * 400, 3);
      expect(box.x).toBeGreaterThanOrEqual(-1e-9);
      expect(box.y).toBeGreaterThanOrEqual(-1e-9);
      expect(box.x + box.width).toBeLessThanOrEqual(600 + 1e-6);
      expect(box.y + box.height).toBeLessThanOrEqual(400 + 1e-6);
    });
    // No two boxes overlap.
    for (let a = 0; a < boxes.length; a += 1) {
      for (let b = a + 1; b < boxes.length; b += 1) {
        const overlapX = Math.min(boxes[a].x + boxes[a].width, boxes[b].x + boxes[b].width) - Math.max(boxes[a].x, boxes[b].x);
        const overlapY = Math.min(boxes[a].y + boxes[a].height, boxes[b].y + boxes[b].height) - Math.max(boxes[a].y, boxes[b].y);
        expect(overlapX <= 1e-6 || overlapY <= 1e-6).toBe(true);
      }
    }
    // Boxes stay fairly square.
    const worst = Math.max(...boxes.map((box) => Math.max(box.width / box.height, box.height / box.width)));
    expect(worst).toBeLessThan(3);
  });

  it("gives empty boxes to zero values and handles nothing to lay out", () => {
    const boxes = squarify([5, 0, -2], { x: 10, y: 20, width: 100, height: 50 });
    expect(boxes[0]).toEqual({ x: 10, y: 20, width: 100, height: 50 });
    expect(boxes[1].width * boxes[1].height).toBe(0);
    expect(boxes[2].width * boxes[2].height).toBe(0);
    expect(squarify([], { x: 0, y: 0, width: 10, height: 10 })).toEqual([]);
  });
});

describe("changeColor", () => {
  it("is grey at zero, green for rises and red for falls, strongest from 3%", () => {
    expect(changeColor(0)).toBe("rgb(138, 147, 150)");
    expect(changeColor(5)).toBe("rgb(27, 122, 61)");
    expect(changeColor(-3)).toBe("rgb(196, 36, 46)");
    expect(changeColor(null)).toBe("#8a9396");
  });
});
