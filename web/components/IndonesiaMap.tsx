"use client";
import { useEffect, useMemo, useRef, useState } from "react";

// Choropleth map of Indonesia, dependency-free. We load a real provinces GeoJSON
// from /geo (served statically, so no bundle bloat), project it to the SVG box
// ourselves, and shade each province by its value. Meta ad insights expose
// geography at region (province) level, which maps 1:1 to these polygons.

type Geo = { type: string; features: { properties: Record<string, unknown>; geometry: { type: string; coordinates: unknown } }[] };

// Indonesian province name (GeoJSON "Propinsi") -> canonical lowercase English
// (Meta region name). Handles the older 32-province file's naming.
const ID_TO_EN: Record<string, string> = {
  "DKI JAKARTA": "jakarta", "JAWA BARAT": "west java", "JAWA TENGAH": "central java",
  "JAWA TIMUR": "east java", "PROBANTEN": "banten", "DAERAH ISTIMEWA YOGYAKARTA": "yogyakarta",
  "BALI": "bali", "SUMATERA UTARA": "north sumatra", "SUMATERA BARAT": "west sumatra",
  "SUMATERA SELATAN": "south sumatra", "RIAU": "riau", "JAMBI": "jambi", "BENGKULU": "bengkulu",
  "LAMPUNG": "lampung", "BANGKA BELITUNG": "bangka belitung islands", "DI. ACEH": "aceh",
  "KALIMANTAN BARAT": "west kalimantan", "KALIMANTAN TENGAH": "central kalimantan",
  "KALIMANTAN SELATAN": "south kalimantan", "KALIMANTAN TIMUR": "east kalimantan",
  "SULAWESI UTARA": "north sulawesi", "GORONTALO": "gorontalo", "SULAWESI TENGAH": "central sulawesi",
  "SULAWESI SELATAN": "south sulawesi", "SULAWESI TENGGARA": "southeast sulawesi",
  "MALUKU": "maluku", "MALUKU UTARA": "north maluku", "NUSATENGGARA BARAT": "west nusa tenggara",
  "NUSA TENGGARA TIMUR": "east nusa tenggara", "IRIAN JAYA TIMUR": "papua",
  "IRIAN JAYA TENGAH": "papua", "IRIAN JAYA BARAT": "west papua",
};

// Normalize a Meta region name to the canonical english key.
function normEn(name: string): string {
  let s = (name || "").toLowerCase().trim().replace(/[–—]/g, "-").replace(/-/g, " ").replace(/\s+/g, " ");
  s = s.replace(/^dki\s+/, "").replace(/^di\s+/, "").replace(/^d\.i\.?\s+/, "")
    .replace("special region of ", "").replace(" special region", "");
  if (s === "bangka belitung") s = "bangka belitung islands";
  if (s === "central papua" || s === "highland papua" || s === "south papua") s = "papua";
  if (s === "southwest papua") s = "west papua";
  if (s === "north kalimantan") s = "east kalimantan"; // merged in the 32-province file
  if (s === "west sulawesi") s = "south sulawesi";
  if (s === "riau islands") s = "riau";
  return s;
}

const VB_W = 960;

export interface MapPoint { name: string; value: number }

export function IndonesiaMap({ points, isMoney, money }: { points: MapPoint[]; isMoney?: boolean; money?: (n: number) => string }) {
  const [geo, setGeo] = useState<Geo | null>(null);
  const [hover, setHover] = useState<{ name: string; value: number; x: number; y: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetch("/geo/id-provinces.json").then((r) => r.json()).then((d) => { if (alive) setGeo(d); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const valueByEn = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of points) m[normEn(p.name)] = (m[normEn(p.name)] || 0) + p.value;
    return m;
  }, [points]);
  const max = useMemo(() => Object.values(valueByEn).reduce((a, b) => Math.max(a, b), 0) || 1, [valueByEn]);

  // Projection: fit the GeoJSON bbox to the viewBox width, preserving aspect.
  const proj = useMemo(() => {
    if (!geo) return null;
    let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
    const walk = (c: unknown) => {
      if (Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number") {
        const [lng, lat] = c as number[];
        if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
      } else if (Array.isArray(c)) c.forEach(walk);
    };
    geo.features.forEach((f) => walk(f.geometry.coordinates));
    const lngSpan = maxLng - minLng || 1, latSpan = maxLat - minLat || 1;
    const scale = VB_W / lngSpan;
    const H = latSpan * scale;
    const project = (lng: number, lat: number): [number, number] => [(lng - minLng) * scale, (maxLat - lat) * scale];
    return { project, H };
  }, [geo]);

  const paths = useMemo(() => {
    if (!geo || !proj) return [];
    const ring = (r: number[][]) => r.map(([lng, lat], i) => `${i ? "L" : "M"}${proj.project(lng, lat).map((n) => n.toFixed(1)).join(" ")}`).join("") + "Z";
    return geo.features.map((f) => {
      const g = f.geometry;
      const polys = (g.type === "Polygon" ? [g.coordinates] : g.coordinates) as number[][][][];
      const d = polys.map((poly) => poly.map(ring).join("")).join("");
      const en = ID_TO_EN[String(f.properties.Propinsi || "").toUpperCase()] || "";
      const val = valueByEn[en] || 0;
      return { d, en, val, name: String(f.properties.Propinsi || "") };
    });
  }, [geo, proj, valueByEn]);

  // Auto-zoom: fit the viewBox to the provinces that actually have data (with
  // padding), so the map frames where the leads are instead of all of Indonesia.
  const viewBox = useMemo(() => {
    if (!geo || !proj) return `0 0 ${VB_W} ${VB_W * 0.4}`;
    const feats = geo.features.filter((f) => (valueByEn[ID_TO_EN[String(f.properties.Propinsi || "").toUpperCase()] || ""] || 0) > 0);
    const target = feats.length ? feats : geo.features;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const walk = (c: unknown) => {
      if (Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number") {
        const [x, y] = proj.project(c[0] as number, c[1] as number);
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      } else if (Array.isArray(c)) c.forEach(walk);
    };
    target.forEach((f) => walk(f.geometry.coordinates));
    let w = maxX - minX, h = maxY - minY;
    const padX = Math.max(w * 0.2, 24), padY = Math.max(h * 0.2, 24);
    minX -= padX; minY -= padY; w += padX * 2; h += padY * 2;
    const MIN_W = VB_W * 0.14;
    if (w < MIN_W) { minX -= (MIN_W - w) / 2; w = MIN_W; }
    const AR = 2.4; // keep a wide, card-friendly aspect
    if (w / h < AR) { const nw = h * AR; minX -= (nw - w) / 2; w = nw; }
    else { const nh = w / AR; minY -= (nh - h) / 2; h = nh; }
    return `${minX.toFixed(1)} ${minY.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`;
  }, [geo, proj, valueByEn]);

  const fmt = (v: number) => (isMoney && money ? money(v) : v.toLocaleString());

  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const drag = useRef<{ sx: number; sy: number; vx: number; vy: number } | null>(null);

  // Reset pan/zoom whenever the auto-fit box changes (new data / new filter).
  useEffect(() => {
    const n = viewBox.split(" ").map(Number);
    setView({ x: n[0], y: n[1], w: n[2], h: n[3] });
  }, [viewBox]);

  // Scroll-to-zoom around the cursor. Non-passive so we can stop the page from
  // scrolling while the pointer is over the map.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      const f = e.deltaY < 0 ? 0.85 : 1.18;
      setView((v) => {
        if (!v) return v;
        const nw = Math.min(VB_W * 3.5, Math.max(VB_W * 0.04, v.w * f));
        const nh = nw * (v.h / v.w);
        return { x: v.x + px * v.w - px * nw, y: v.y + py * v.h - py * nh, w: nw, h: nh };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [geo, proj]);

  if (!geo || !proj) {
    return <div className="w-full aspect-[2.5/1] rounded-lg bg-muted/30 animate-pulse" />;
  }

  const vb = view ? `${view.x} ${view.y} ${view.w} ${view.h}` : viewBox;
  const label = (n: string) => (ID_TO_EN[n.toUpperCase()] || n).replace(/\b\w/g, (m) => m.toUpperCase());

  return (
    <div ref={wrapRef} className="relative w-full overflow-hidden rounded-lg">
      <svg ref={svgRef} viewBox={vb} className="w-full h-auto select-none" preserveAspectRatio="xMidYMid meet"
        style={{ cursor: drag.current ? "grabbing" : "grab" }}
        onMouseDown={(e) => { if (view) drag.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; setHover(null); }}
        onMouseMove={(e) => {
          if (!drag.current || !view) return;
          const rect = svgRef.current!.getBoundingClientRect();
          setView({ ...view,
            x: drag.current.vx - (e.clientX - drag.current.sx) * (view.w / rect.width),
            y: drag.current.vy - (e.clientY - drag.current.sy) * (view.h / rect.height) });
        }}
        onMouseUp={() => { drag.current = null; }}
        onMouseLeave={() => { drag.current = null; setHover(null); }}>
        <g className="text-primary">
          {paths.map((p, i) => {
            const intensity = p.val > 0 ? 0.18 + 0.72 * (p.val / max) : 0;
            const active = hover?.name === p.name;
            return (
              <path key={i} d={p.d}
                fill={p.val > 0 ? "currentColor" : "hsl(var(--muted))"}
                fillOpacity={p.val > 0 ? (active ? 1 : intensity) : 1}
                stroke="#fff" strokeWidth={active ? 1.4 : 0.6}
                className="cursor-pointer"
                onMouseMove={(e) => {
                  if (drag.current) return;
                  const r = wrapRef.current?.getBoundingClientRect();
                  if (r) setHover({ name: p.name, value: p.val, x: e.clientX - r.left, y: e.clientY - r.top });
                }}
              />
            );
          })}
        </g>
      </svg>
      {hover && (
        <div className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-[calc(100%+12px)]" style={{ left: hover.x, top: hover.y }}>
          <div className="rounded-md bg-[#356B5A]/90 backdrop-blur-sm text-white px-3 py-2 shadow-md">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-white/90" />
              <span className="text-[12px] font-semibold capitalize whitespace-nowrap">{label(hover.name)}</span>
            </div>
            <div className="text-[11px] tabular-nums opacity-80 mt-0.5 pl-3">{hover.value > 0 ? fmt(hover.value) : "No data"}</div>
          </div>
          <div className="w-2.5 h-2.5 bg-[#356B5A]/90 rotate-45 mx-auto -mt-[5px] rounded-[2px]" />
        </div>
      )}
      <div className="pointer-events-none absolute bottom-2 right-2 text-[10px] font-medium text-muted-foreground/70 bg-card/70 backdrop-blur-sm rounded px-1.5 py-0.5">drag to pan · scroll to zoom</div>
    </div>
  );
}
