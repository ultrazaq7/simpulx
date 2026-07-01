"use client";
import { useState } from "react";

// Lightweight, dependency-free bubble map of Indonesia. A stylized archipelago
// backdrop (approximate island shapes) with one bubble per province, sized by
// value. Province positions use real centroids projected equirectangularly over
// Indonesia's bounding box, so bubbles land in the right place without shipping a
// heavy TopoJSON. Meta ad insights expose geography at region (province) level.

// Projection: 20px per degree on both axes over lng 94..142, lat 7..-12.
const LNG_MIN = 94, LAT_MAX = 7, PPD = 20;
const VB_W = (142 - LNG_MIN) * PPD; // 960
const VB_H = (LAT_MAX - -12) * PPD; // 380
const px = (lng: number) => (lng - LNG_MIN) * PPD;
const py = (lat: number) => (LAT_MAX - lat) * PPD;

// Province centroids keyed by canonical lowercase name (matches Meta region names).
const CENTROIDS: Record<string, [number, number]> = {
  "aceh": [4.5, 96.9], "north sumatra": [2.3, 99.1], "west sumatra": [-0.8, 100.6],
  "riau": [0.5, 101.8], "riau islands": [0.9, 104.5], "jambi": [-1.6, 103.0],
  "south sumatra": [-3.3, 104.0], "bangka belitung islands": [-2.7, 106.5],
  "bengkulu": [-3.6, 102.3], "lampung": [-4.8, 105.2], "jakarta": [-6.2, 106.8],
  "west java": [-6.9, 107.6], "banten": [-6.4, 106.1], "central java": [-7.2, 110.1],
  "yogyakarta": [-7.9, 110.4], "east java": [-7.8, 112.7], "bali": [-8.4, 115.1],
  "west nusa tenggara": [-8.7, 117.6], "east nusa tenggara": [-8.9, 121.3],
  "west kalimantan": [0.1, 111.3], "central kalimantan": [-1.7, 113.4],
  "south kalimantan": [-3.1, 115.3], "east kalimantan": [0.6, 116.4],
  "north kalimantan": [3.1, 116.4], "north sulawesi": [1.1, 124.5],
  "gorontalo": [0.7, 122.4], "central sulawesi": [-1.4, 121.4],
  "west sulawesi": [-2.8, 119.2], "south sulawesi": [-4.0, 120.0],
  "southeast sulawesi": [-4.1, 122.2], "maluku": [-3.7, 129.0],
  "north maluku": [1.0, 127.8], "papua": [-4.3, 138.0], "west papua": [-1.3, 133.2],
  "central papua": [-3.7, 136.5], "highland papua": [-4.0, 139.0],
  "south papua": [-6.5, 139.9], "southwest papua": [-1.0, 132.0],
};

// Rough island silhouettes for context (centre lat/lng, degree extents, rotation).
const ISLANDS: [number, number, number, number, number][] = [
  [-0.5, 101.8, 6.6, 3.0, -32], // Sumatra
  [-7.4, 110.4, 0.9, 4.7, -6],  // Java
  [0.3, 113.6, 4.2, 3.7, 0],    // Kalimantan
  [-1.9, 120.9, 4.6, 2.3, 0],   // Sulawesi
  [-4.2, 138.2, 3.4, 4.6, 0],   // Papua
  [-8.5, 117.7, 0.6, 1.2, 0],   // West Nusa Tenggara
  [-8.9, 121.4, 0.7, 1.9, 0],   // East Nusa Tenggara
  [-8.4, 115.1, 0.45, 0.5, 0],  // Bali
  [-3.5, 129.1, 2.4, 1.2, 0],   // Maluku
  [1.0, 127.9, 1.5, 0.9, 0],    // North Maluku
];

function normalize(name: string): string {
  return (name || "").toLowerCase().trim()
    .replace(/^dki\s+/, "").replace(/^di\s+/, "").replace(/[–—]/g, "-")
    .replace("-", " ").replace(/\s+/g, " ")
    .replace("special region of ", "").replace(" special region", "")
    .replace("d.i. ", "").replace("bangka belitung", "bangka belitung islands")
    .replace("bangka belitung islands islands", "bangka belitung islands");
}

export interface MapPoint { name: string; value: number }

export function IndonesiaMap({ points, isMoney, money }: { points: MapPoint[]; isMoney?: boolean; money?: (n: number) => string }) {
  const [hover, setHover] = useState<{ name: string; value: number; x: number; y: number } | null>(null);
  const max = points.reduce((m, p) => Math.max(m, p.value), 0) || 1;
  const placed = points
    .map((p) => ({ ...p, c: CENTROIDS[normalize(p.name)] }))
    .filter((p): p is MapPoint & { c: [number, number] } => !!p.c)
    .sort((a, b) => b.value - a.value);
  const fmt = (v: number) => (isMoney && money ? money(v) : v.toLocaleString());

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
        {/* island backdrop */}
        <g className="text-muted-foreground/20" fill="currentColor">
          {ISLANDS.map(([lat, lng, latR, lngR, rot], i) => (
            <ellipse key={i} cx={px(lng)} cy={py(lat)} rx={lngR * PPD} ry={latR * PPD}
              transform={`rotate(${rot} ${px(lng)} ${py(lat)})`} />
          ))}
        </g>
        {/* value bubbles */}
        <g className="text-primary">
          {placed.map((p) => {
            const r = 6 + Math.sqrt(p.value / max) * 26;
            const x = px(p.c[1]), y = py(p.c[0]);
            const active = hover?.name === p.name;
            return (
              <g key={p.name} onMouseEnter={() => setHover({ name: p.name, value: p.value, x, y })} onMouseLeave={() => setHover(null)} className="cursor-pointer">
                <circle cx={x} cy={y} r={r} fill="currentColor" fillOpacity={active ? 0.9 : 0.55} stroke="currentColor" strokeWidth={active ? 3 : 1.5} />
                <circle cx={x} cy={y} r={2.5} fill="#fff" />
              </g>
            );
          })}
        </g>
      </svg>
      {hover && (
        <div className="pointer-events-none absolute z-10 rounded-md border border-border bg-card/95 backdrop-blur-sm px-2.5 py-1.5 shadow-lg text-[12px] -translate-x-1/2 -translate-y-full"
          style={{ left: `${(hover.x / VB_W) * 100}%`, top: `${(hover.y / VB_H) * 100}%` }}>
          <div className="font-semibold text-foreground capitalize">{hover.name}</div>
          <div className="text-muted-foreground tabular-nums">{fmt(hover.value)}</div>
        </div>
      )}
    </div>
  );
}
