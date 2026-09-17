import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { KIND_LABEL } from "@/lib/detect";
import { formatTez, formatUsd, shortAddress } from "@/lib/format";
import type { Finding, Sale } from "@/lib/types";

/**
 * Every sale of the group's works over time, price per edition on a log
 * scale, with the sales that are part of a pattern drawn on top: did those
 * sales sit where the rest of the market was, or apart from it?
 */

const HEIGHT = 300;
const PAD = { top: 12, right: 12, bottom: 28, left: 52 };

interface Point {
  x: number;
  y: number;
  sale: Sale;
  finding: Finding | null;
}

export function PriceChart({
  works,
  findings,
  names,
  onSelect,
}: {
  works: Sale[];
  findings: Finding[];
  names: Record<string, string>;
  onSelect: (findingId: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [hover, setHover] = useState<Point | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(320, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const flaggedBy = useMemo(() => {
    const m = new Map<number, Finding>();
    for (const f of findings) for (const s of f.sales) if (!m.has(s.id)) m.set(s.id, f);
    return m;
  }, [findings]);

  const geo = useMemo(() => {
    const sales = works.filter((s) => s.price > 0);
    if (sales.length === 0) return null;
    const t0 = sales[0].time;
    const t1 = Math.max(sales[sales.length - 1].time, t0 + 86_400_000);
    const prices = sales.map((s) => s.price / 1e6);
    const lo = Math.floor(Math.log10(Math.max(0.01, Math.min(...prices))));
    const hi = Math.ceil(Math.log10(Math.max(...prices)));
    const plotW = width - PAD.left - PAD.right;
    const plotH = HEIGHT - PAD.top - PAD.bottom;
    const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0)) * plotW;
    const y = (tez: number) => PAD.top + plotH - ((Math.log10(Math.max(tez, 10 ** lo)) - lo) / Math.max(1, hi - lo)) * plotH;

    const regular: Point[] = [];
    const flagged: Point[] = [];
    for (const s of sales) {
      const finding = flaggedBy.get(s.id) ?? null;
      const p = { x: x(s.time), y: y(s.price / 1e6), sale: s, finding };
      (finding ? flagged : regular).push(p);
    }
    const r = 1.8;
    const path = regular.map((p) => `M${(p.x - r).toFixed(1)},${p.y.toFixed(1)}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`).join("");

    const yTicks: { v: number; label: string }[] = [];
    for (let e = lo; e <= hi; e++) yTicks.push({ v: y(10 ** e), label: `${10 ** e >= 1 ? (10 ** e).toLocaleString("en-US") : 10 ** e} ꜩ` });

    const years: { v: number; label: string }[] = [];
    const startYear = new Date(t0).getUTCFullYear();
    const endYear = new Date(t1).getUTCFullYear();
    const step = Math.ceil((endYear - startYear + 1) / Math.max(1, Math.floor(plotW / 90)));
    for (let yr = startYear + 1; yr <= endYear; yr += step) years.push({ v: x(Date.UTC(yr, 0, 1)), label: String(yr) });

    return { regular, flagged, path, yTicks, years, plotW, plotH };
  }, [works, flaggedBy, width]);

  if (!geo) return <p className="muted">No sales of the group&apos;s works were found.</p>;

  function nearest(px: number, py: number): Point | null {
    let best: Point | null = null;
    let bestD = 14 * 14;
    for (const p of geo!.flagged) {
      const d = (p.x - px) ** 2 + (p.y - py) ** 2;
      if (d < bestD) [best, bestD] = [p, d];
    }
    if (best) return best;
    bestD = 8 * 8;
    for (const p of geo!.regular) {
      const d = (p.x - px) ** 2 + (p.y - py) ** 2;
      if (d < bestD) [best, bestD] = [p, d];
    }
    return best;
  }

  function onMove(e: PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    setHover(nearest(e.clientX - rect.left, e.clientY - rect.top));
  }

  const tipLeft = hover ? Math.min(Math.max(hover.x + 12, 0), width - 270) : 0;
  const tipTop = hover ? Math.max(hover.y - 70, 0) : 0;

  return (
    <div className="panel">
      <div className="chart-head">
        <div className="legend">
          <span>
            <i style={{ width: 7, height: 7, background: "var(--series-regular)" }} />
            Other sales of the group&apos;s works ({geo.regular.length.toLocaleString("en-US")})
          </span>
          <span>
            <i style={{ width: 11, height: 11, background: "var(--series-flagged)", boxShadow: "0 0 0 2px var(--surface)" }} />
            Sales in a pattern ({geo.flagged.length})
          </span>
        </div>
        <span className="faint" style={{ fontSize: 12 }}>
          Price per edition, log scale · click a highlighted sale to open its pattern
        </span>
      </div>
      <div className="chart" ref={box}>
        <svg
          viewBox={`0 0 ${width} ${HEIGHT}`}
          height={HEIGHT}
          role="img"
          aria-label={`Sale prices over time: ${geo.regular.length} other sales and ${geo.flagged.length} sales that are part of a pattern, listed under Patterns.`}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
          onClick={() => hover?.finding && onSelect(hover.finding.id)}
          style={{ cursor: hover?.finding ? "pointer" : "default" }}
        >
          <g className="grid">
            {geo.yTicks.map((t) => (
              <line key={t.v} x1={PAD.left} x2={width - PAD.right} y1={t.v} y2={t.v} />
            ))}
          </g>
          <g className="axis">
            {geo.yTicks.map((t) => (
              <text key={t.v} x={PAD.left - 8} y={t.v + 4} textAnchor="end">
                {t.label}
              </text>
            ))}
            {geo.years.map((t) => (
              <text key={t.label} x={t.v} y={HEIGHT - 8} textAnchor="middle">
                {t.label}
              </text>
            ))}
          </g>
          <path d={geo.path} fill="var(--series-regular)" />
          {geo.flagged.map((p) => (
            <circle
              key={p.sale.id}
              cx={p.x}
              cy={p.y}
              r={hover?.sale.id === p.sale.id ? 7 : 5.5}
              fill="var(--series-flagged)"
              stroke="var(--surface)"
              strokeWidth={2}
            />
          ))}
          {hover && !hover.finding ? (
            <circle cx={hover.x} cy={hover.y} r={4} fill="none" stroke="var(--text)" strokeWidth={1.5} />
          ) : null}
        </svg>
        {hover ? (
          <div className="tooltip" style={{ left: tipLeft, top: tipTop }}>
            <strong>{hover.sale.tokenName ?? `#${hover.sale.tokenId}`}</strong>
            {formatTez(hover.sale.price)}
            {hover.sale.amount > 1 ? ` × ${hover.sale.amount}` : ""}
            {hover.sale.usd != null ? ` · ${formatUsd(hover.sale.usd / hover.sale.amount)}` : ""} ·{" "}
            {hover.sale.timestamp.slice(0, 10)}
            <br />
            {names[hover.sale.buyer] ?? shortAddress(hover.sale.buyer)} bought from{" "}
            {names[hover.sale.seller] ?? shortAddress(hover.sale.seller)}
            {hover.finding ? (
              <>
                <br />
                <span style={{ color: "var(--text)" }}>Pattern: {KIND_LABEL[hover.finding.kind]}</span>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
