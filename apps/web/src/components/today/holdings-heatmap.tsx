"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid } from "lucide-react";

import { ShimmerLines } from "@/components/shimmer";
import { useT } from "@/lib/i18n/client";
import { money, signedMoney } from "@/lib/portfolio-metrics";
import { HIDDEN_AMOUNT } from "@/lib/privacy";
import type { HoldingTile } from "@/lib/today";
import { changeColor, squarify, type Box } from "@/lib/treemap";

/** Height of a sector's name strip above its boxes, in pixels. */
const HEADER = 18;
/** Space between sectors. */
const GAP = 3;

type Placed = { tile: HoldingTile; box: Box };
type SectorBox = { name: string; box: Box; tiles: Placed[] };

/** Lays out sectors by total value, then each sector's holdings inside it. */
function layout(tiles: HoldingTile[], width: number, height: number): SectorBox[] {
  const groups = new Map<string, HoldingTile[]>();
  for (const tile of tiles) groups.set(tile.sector, [...(groups.get(tile.sector) ?? []), tile]);
  const sectors = [...groups.entries()]
    .map(([name, items]) => ({ name, items, total: items.reduce((sum, item) => sum + item.value, 0) }))
    .sort((a, b) => b.total - a.total);
  // One sector needs no name strip; the card's title says it all.
  const labelled = sectors.length > 1;
  const outer = squarify(
    sectors.map((sector) => sector.total),
    { x: 0, y: 0, width, height },
  );
  return sectors.map((sector, index) => {
    const box = outer[index];
    const top = labelled && box.height > HEADER * 2.2 ? HEADER : 0;
    const inner = {
      x: box.x + GAP / 2,
      y: box.y + GAP / 2 + top,
      width: Math.max(0, box.width - GAP),
      height: Math.max(0, box.height - GAP - top),
    };
    const boxes = squarify(
      sector.items.map((item) => item.value),
      inner,
    );
    return {
      name: top ? sector.name : "",
      box,
      tiles: sector.items.map((tile, at) => ({ tile, box: boxes[at] })),
    };
  });
}

/** A heat map of the holdings: box size is what each is worth, colour is today's move. */
export function HoldingsHeatmap({
  tiles,
  currency,
  hidden,
  onOpen,
}: {
  /** Null while prices load. */
  tiles: HoldingTile[] | null;
  currency: string;
  hidden: boolean;
  onOpen: () => void;
}) {
  const t = useT();
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  // Re-lays out the boxes whenever the card changes width (window resize, phone rotation).
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const measure = () => setWidth(element.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [tiles]);

  // Wide screens get a wide map; phones a taller one so boxes stay readable.
  const height = width ? Math.round(Math.min(440, Math.max(240, width < 640 ? width * 0.95 : width * 0.42))) : 0;
  const sectors = useMemo(
    () => (tiles?.length && width ? layout(tiles, width, height) : []),
    [tiles, width, height],
  );
  const pct = (value: number | null) => (value == null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(2)}%`);

  return (
    <article className="panel holdings-heatmap" aria-labelledby="heatmap-title">
      <div className="heatmap-heading">
        <h2 id="heatmap-title">
          <LayoutGrid size={17} aria-hidden="true" />
          {t("Your holdings today")}
        </h2>
        <span className="heatmap-legend" aria-hidden="true">
          <span>−3%</span>
          <span className="heatmap-scale" />
          <span>+3%</span>
        </span>
      </div>
      {tiles == null ? (
        <ShimmerLines label={t("Loading prices…")} lines={4} />
      ) : tiles.length === 0 ? (
        <p className="muted">{t("No price moves to show yet. Add holdings in Portfolio to see them here.")}</p>
      ) : (
        <div ref={frame} className="heatmap-frame" style={{ height: height || undefined }}>
          {sectors.map((sector) => (
            <div key={sector.name || sector.tiles[0]?.tile.ticker} className="heatmap-sector">
              {sector.name && (
                <span
                  className="heatmap-sector-name"
                  style={{ left: sector.box.x + 4, top: sector.box.y + 2, width: sector.box.width - 8 }}
                >
                  {t(sector.name)}
                </span>
              )}
              {sector.tiles.map(({ tile, box }) => {
                const area = box.width * box.height;
                const size = Math.max(10, Math.min(30, Math.sqrt(area) / 4.2));
                const showText = box.width > 34 && box.height > 22;
                const label = [
                  `${tile.ticker}${tile.name ? ` · ${tile.name}` : ""}`,
                  `${t("Today")}: ${pct(tile.pct)}`,
                  `${t("Your money")}: ${hidden || tile.impact == null ? HIDDEN_AMOUNT : signedMoney(tile.impact, currency)}`,
                  `${t("Worth")}: ${hidden ? HIDDEN_AMOUNT : money(tile.value, currency)}`,
                ].join("\n");
                return (
                  <button
                    key={tile.ticker}
                    type="button"
                    className="heatmap-tile"
                    style={{
                      left: box.x,
                      top: box.y,
                      width: Math.max(0, box.width - 2),
                      height: Math.max(0, box.height - 2),
                      background: changeColor(tile.pct),
                    }}
                    title={label}
                    aria-label={label.replace(/\n/g, ", ")}
                    onClick={onOpen}
                  >
                    {showText && (
                      <>
                        <strong style={{ fontSize: size }}>{tile.ticker}</strong>
                        {box.height > size * 2.3 && <span style={{ fontSize: Math.max(10, size * 0.62) }}>{pct(tile.pct)}</span>}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
