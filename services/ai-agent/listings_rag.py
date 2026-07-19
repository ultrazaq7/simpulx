"""Property e-catalog grounding: pick the listings that actually fit the lead.

The automotive path (finance_rag) grounds on a per-campaign PRICELIST. Property
grounds on `listings` instead: real units the org published, each with a price,
area, size and photos. Same contract as finance_rag.get_catalog_context -- return
a prompt block, or None when there is nothing to ground on.

Ranking is deliberately rules-based (not embeddings): the fields a buyer states
are structured (budget, city, type, bedrooms), so exact/range matching beats
similarity and is explainable when a dealer asks "why did it offer that unit".

Every recommended unit is tagged [[unit:<slug>]] in the context. The orchestrator
strips those markers from the customer-facing text and sends the matching photo
cards instead, so the lead gets a picture + price + link rather than a paragraph.
"""
from __future__ import annotations

import logging
import re
from typing import Optional

log = logging.getLogger("listings_rag")

MAX_UNITS = 4  # how many units may enter the prompt (bounded: cost + focus)


def _num(v) -> Optional[float]:
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


# "400 Juta" / "800jt" / "1,5 M" / "Rp 900.000.000" / "800-1M" -> rupiah range.
# Three shapes, matched in order of confidence and consumed as they are found so a
# single figure is never counted twice:
#   1. thousand-separated full amounts (900.000.000)
#   2. suffixed amounts (800jt, 1,5 M) -- by far the most common in chat
#   3. bare numbers (800), which in a property chat mean juta
_FULL_RE = re.compile(r"\d{1,3}(?:\.\d{3})+")
# "800-1M" / "500-700jt": the range's unit is written once, on the second figure.
_RANGE_RE = re.compile(
    r"(\d+(?:[.,]\d+)?)\s*[-–—]\s*(\d+(?:[.,]\d+)?)\s*(m(?:ilyar|iliar)?|jt|juta|rb|ribu)\b", re.I)
_UNIT_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*(m(?:ilyar|iliar)?|jt|juta|rb|ribu)\b", re.I)
_BARE_RE = re.compile(r"\d+(?:[.,]\d+)?")
# Numbers that describe the PROPERTY, not its price. Stripped before the bare-number
# fallback so "2 kamar, LT 72" never reads as a 72 juta budget.
_SPEC_RE = re.compile(
    r"\b(?:lt|lb|luas|tipe|type|kt|km|kamar|mandi)\s*\d+(?:[.,]\d+)?|"
    r"\d+(?:[.,]\d+)?\s*(?:m2|m²|meter|kamar|kt|km|lantai|unit)\b", re.I)
# A bare number is only read as a budget above this (in juta).
_BARE_MIN_JUTA = 50
_UNIT_MULT = {"m": 1_000_000_000, "jt": 1_000_000, "juta": 1_000_000, "rb": 1_000, "ribu": 1_000}


def _mult(unit: str) -> float:
    u = unit.lower()
    return _UNIT_MULT["m"] if u.startswith("m") else _UNIT_MULT.get(u, 1.0)


def parse_budget(text) -> tuple[Optional[float], Optional[float]]:
    if not text:
        return None, None
    s = str(text).lower().replace("rp", " ")
    vals: list[float] = []

    # Ranges first (they contain the unit-bearing figure the next pass would eat).
    for m in _RANGE_RE.finditer(s):
        try:
            a = float(m.group(1).replace(".", "").replace(",", "."))
            b = float(m.group(2).replace(".", "").replace(",", "."))
        except ValueError:
            continue
        mult = _mult(m.group(3))
        # "800-1M" means 800 JUTA to 1 miliar: when the first figure is larger than
        # the second, it is written in the next unit down, not the shared one.
        a_mult = mult / 1000 if a > b else mult
        vals += [a * a_mult, b * mult]
    s = _RANGE_RE.sub(" ", s)

    for m in _FULL_RE.finditer(s):
        try:
            vals.append(float(m.group(0).replace(".", "")))
        except ValueError:
            pass
    s = _FULL_RE.sub(" ", s)

    for m in _UNIT_RE.finditer(s):
        try:
            vals.append(float(m.group(1).replace(".", "").replace(",", ".")) * _mult(m.group(2)))
        except ValueError:
            continue
    s = _UNIT_RE.sub(" ", s)

    if not vals:  # only fall back to bare numbers when nothing clearer was found
        s = _SPEC_RE.sub(" ", s)  # drop sizes/room counts first
        for m in _BARE_RE.finditer(s):
            try:
                n = float(m.group(0).replace(".", "").replace(",", "."))
            except ValueError:
                continue
            if n >= _BARE_MIN_JUTA:
                vals.append(n * 1_000_000)

    vals = [v for v in vals if v > 0]
    if not vals:
        return None, None
    return min(vals), max(vals)


def _score(row: dict, want_type, city, area, lo, hi, beds) -> float:
    """Higher = better fit. Budget dominates (a lead never buys above budget),
    then location, then type/bedrooms."""
    s = 0.0
    price = _num(row.get("price"))
    if lo and price:
        # Inside the stated range is ideal; up to 10% over is still worth showing
        # (dealers negotiate), anything higher is actively unhelpful.
        if price <= (hi or lo) * 1.02:
            s += 5.0
        elif price <= (hi or lo) * 1.10:
            s += 2.0
        else:
            s -= 4.0
        # Prefer units near the top of the budget: closer to what they can afford.
        s += 1.5 * (min(price, hi or lo) / (hi or lo))
    hay = " ".join(str(row.get(k) or "") for k in ("location_area", "city", "address")).lower()
    for want in (area, city):
        w = (want or "").strip().lower()
        if w and (w in hay or any(tok in hay for tok in w.split() if len(tok) > 3)):
            s += 3.0
            break
    if want_type and (row.get("property_type") or "").strip().lower() == want_type.strip().lower():
        s += 2.0
    b = _num(row.get("bedrooms"))
    if beds and b:
        s += 1.5 if b >= beds else -0.5
    if row.get("photos"):
        s += 0.5  # a unit with photos converts better
    return s


def _rupiah(v) -> str:
    n = _num(v)
    if not n:
        return "-"
    if n >= 1_000_000_000:
        return f"Rp {n / 1_000_000_000:.2f}".rstrip("0").rstrip(".") + " M"
    return f"Rp {n / 1_000_000:.0f} juta"


async def get_listing_context(pool, org_id: str, campaign_id, lead_fields: dict,
                              query: str = None, conn=None) -> tuple[Optional[str], list[dict]]:
    """Return (prompt_block, ranked_units). Units carry slug/photo/price so the
    orchestrator can send cards. Empty result -> (None, [])."""
    lf = lead_fields or {}
    want_type = lf.get("property_type")
    city, area = lf.get("city"), lf.get("location")
    beds = _num(lf.get("bedrooms"))
    lo, hi = parse_budget(lf.get("budget"))
    # The message itself can carry a budget the extractor hasn't stored yet.
    if lo is None and query:
        lo, hi = parse_budget(query)

    sql = """SELECT id::text, slug, title, property_type, price, location_area, city,
                    address, bedrooms, bathrooms, land_area, building_area, certificate,
                    description, photos, campaign_id::text AS campaign_id
               FROM listings
              WHERE organization_id = $1 AND status = 'published'
              ORDER BY sort_order, updated_at DESC
              LIMIT 200"""
    try:
        if conn is not None:
            rows = await conn.fetch(sql, org_id)
        else:
            async with pool.acquire() as c:
                rows = await c.fetch(sql, org_id)
    except Exception as e:  # grounding must never break the reply
        log.warning(f"listings lookup failed: {e}")
        return None, []
    if not rows:
        return None, []

    items = [dict(r) for r in rows]
    # A lead that arrived through a campaign sees that campaign's inventory first;
    # units with no campaign are shared stock and stay eligible.
    if campaign_id:
        for it in items:
            if it.get("campaign_id") == str(campaign_id):
                it["_boost"] = 2.0
    ranked = sorted(
        items,
        key=lambda r: _score(r, want_type, city, area, lo, hi, beds) + r.get("_boost", 0.0),
        reverse=True,
    )[:MAX_UNITS]
    # Nothing sensible to show: every unit is way over budget.
    if lo and all((_num(r.get("price")) or 0) > (hi or lo) * 1.10 for r in ranked):
        cheapest = min(items, key=lambda r: _num(r.get("price")) or float("inf"))
        ranked = [cheapest]

    lines = []
    for r in ranked:
        bits = [f"[[unit:{r['slug']}]] {r['title']}"]
        if r.get("property_type"):
            bits.append(str(r["property_type"]))
        bits.append(_rupiah(r.get("price")))
        loc = r.get("location_area") or r.get("city")
        if loc:
            bits.append(str(loc))
        spec = []
        if _num(r.get("bedrooms")):
            spec.append(f"{int(_num(r['bedrooms']))} KT")
        if _num(r.get("bathrooms")):
            spec.append(f"{int(_num(r['bathrooms']))} KM")
        if _num(r.get("land_area")):
            spec.append(f"LT {int(_num(r['land_area']))}m2")
        if _num(r.get("building_area")):
            spec.append(f"LB {int(_num(r['building_area']))}m2")
        if spec:
            bits.append(", ".join(spec))
        if r.get("certificate"):
            bits.append(str(r["certificate"]))
        lines.append("- " + " | ".join(bits))

    block = (
        "\n\nDAFTAR UNIT TERSEDIA (data resmi, urut dari paling cocok dengan kebutuhan customer):\n"
        + "\n".join(lines)
        + "\n\nATURAN UNIT: rekomendasikan HANYA unit dari daftar di atas, dan sebut harga/luas "
          "PERSIS seperti tertulis. JANGAN mengarang unit, harga, atau lokasi yang tidak ada di "
          "daftar. Saat menyebut sebuah unit, sertakan penanda [[unit:slug]] miliknya tepat "
          "sebelum nama unit; penanda itu otomatis diganti sistem menjadi kartu foto unit, jadi "
          "jangan menjelaskan penanda itu ke customer. Cukup tawarkan maksimal 2 unit paling "
          "cocok dalam satu balasan supaya tidak membanjiri customer.\n"
        "FOTO: setiap unit yang kamu tandai OTOMATIS dikirim sistem sebagai kartu foto "
        "(gambar + harga + link) tepat setelah balasanmu. Jadi kamu MEMANG bisa mengirim "
        "foto: cukup pakai penandanya. DILARANG mengatakan kamu tidak bisa mengirim gambar, "
        "atau menyuruh customer membuka link hanya untuk melihat foto. Kalau customer minta "
        "foto unit tertentu, jawab singkat lalu tandai unit itu supaya kartunya terkirim.\n"
    )
    return block, ranked


_MARKER_RE = re.compile(r"\[\[unit:([a-z0-9\-]+)\]\]\s*", re.I)


def extract_units(reply: str, ranked: list[dict]) -> tuple[str, list[dict]]:
    """Split the model's reply into (clean_text, units_to_send).

    The model tags units it recommended with [[unit:slug]]. Those markers are
    stripped from what the customer reads and turned into photo cards. Unknown
    slugs (a hallucinated tag) are dropped, never sent."""
    if not reply:
        return reply, []
    by_slug = {str(r.get("slug")): r for r in (ranked or [])}
    seen, picked = set(), []
    for slug in _MARKER_RE.findall(reply):
        s = slug.lower()
        if s in by_slug and s not in seen:
            seen.add(s)
            picked.append(by_slug[s])
    return _MARKER_RE.sub("", reply).strip(), picked
