"""Retrieval Khusus untuk Simulasi Kredit (Finance Packages)."""
from __future__ import annotations

import json
import logging
import re
from contextlib import asynccontextmanager

log = logging.getLogger("finance-rag")


def _as_dict(v):
    """asyncpg returns a jsonb column as a JSON *string* (no codec is registered),
    so `attributes` arrives as text, not a dict. Parse it so the per-tenor credit
    fields (tenor/angsuran/tdp) are actually read — otherwise the model only ever
    sees OTR and wrongly says the installment data isn't available."""
    if isinstance(v, dict):
        return v
    if isinstance(v, str) and v.strip():
        try:
            d = json.loads(v)
            return d if isinstance(d, dict) else {}
        except Exception:
            return {}
    return {}


@asynccontextmanager
async def _acquire(pool, conn):
    """Yield `conn` if the caller passed one (reuse it, e.g. the connection holding
    the nurture advisory lock), otherwise acquire and release a fresh pooled one."""
    if conn is not None:
        yield conn
    else:
        async with pool.acquire() as c:
            yield c


async def get_catalog_context(pool, campaign_id, brand: str, model: str,
                              city: str = None, segment: str = None,
                              query: str = None, recent_text: str = None,
                              conn=None) -> str | None:
    """Segment-generic, CAMPAIGN-SCOPED catalog lookup (WS-A).

    Tries the per-campaign campaign_catalog first so one campaign never grounds
    on another's pricing (fixes the global finance_packages cross-dealer leak).
    If the campaign has no catalog rows -- or anything goes wrong -- it FALLS BACK
    to the legacy global finance_packages lookup, so the live bot never loses its
    grounding. Safe to swap in for get_finance_context at any call site that has
    the conversation's campaign_id in scope.

    `query` is the customer's latest message: when they name a specific trim
    ("Ultimate"), the matching rows are floated to the top so the model answers
    from THAT variant instead of the cheapest one it happens to see.
    """
    if campaign_id:
        try:
            ctx = await _catalog_from_table(pool, campaign_id, model, city, query,
                                            recent_text=recent_text, conn=conn)
            if ctx:
                return ctx
            # No row matched. If this campaign HAS a catalog, its own pricelist is the
            # ONLY valid grounding -- falling through to the global finance_packages
            # here is exactly the cross-dealer leak WS-A exists to prevent (it served
            # another dealer's Surabaya packages into a Jakarta Mitsubishi campaign).
            # Better ungrounded than grounded on someone else's prices.
            if await _campaign_has_catalog(pool, campaign_id, conn=conn):
                log.info("no catalog match for this campaign; staying ungrounded (no global fallback)")
                return None
        except Exception as e:  # never let the new path break grounding
            log.warning(f"campaign_catalog lookup failed, falling back: {e}")
    # Fallback: legacy global finance_packages (automotive only) -- only for campaigns
    # that have no catalog of their own.
    return await get_finance_context(pool, brand, model, city, conn=conn)


async def _campaign_has_catalog(pool, campaign_id, conn=None) -> bool:
    """True when the campaign has any catalog row at all. Distinguishes 'this campaign
    has no pricelist' (global fallback is fine) from 'it has one but nothing matched'
    (falling back would leak another dealer's pricing)."""
    async with _acquire(pool, conn) as c:
        return bool(await c.fetchval(
            "SELECT EXISTS(SELECT 1 FROM campaign_catalog WHERE campaign_id = $1::uuid)",
            campaign_id))


# Transmission / drivetrain / generic spec tokens that appear inside variant
# names but DON'T identify a specific trim, so they must not trigger a variant
# match on their own (e.g. "Exceed CVT" shouldn't be picked just because the
# customer typed "cvt"; only a real trim word like "exceed"/"ultimate"/"gl" should).
_GENERIC_VARIANT_TOKENS = {
    "cvt", "at", "mt", "matic", "manual", "automatic", "ds", "cbu", "ckd",
    "4x2", "4x4", "2wd", "4wd", "awd", "fwd", "rwd", "mpv", "suv", "cc",
}


# Price/finance intent in the customer's own words. Gates whether ANY figure reaches the
# prompt at all: unasked-for pricing is anchoring (the lead now expects a number that the
# agent's real quote will contradict), so the catalog ships as NAMES ONLY until asked.
_PRICE_INTENT = re.compile(
    r"(harga|harganya|hrg|otr|\bdp\b|uang muka|cicilan|angsuran|kredit|tenor|leasing|"
    r"budget|bajet|termurah|termahal|paling murah|paling mahal|berapa|brp|berapaan|"
    r"simulasi|promo|diskon|potongan|\bcash\b|bunga|tdp)", re.I)


def _asks_price(query: str) -> bool:
    """True when the customer's own message asks about price/finance. Deliberately wide:
    a false positive only re-allows figures the model may still withhold, while a false
    negative would make the bot dodge a real price question."""
    return bool(query and _PRICE_INTENT.search(query))


# Promo/incentive language the catalog CANNOT ground (the catalog only has standard
# OTR/tenor/installment, never promo terms). Deliberately NARROWER than _PRICE_INTENT:
# it must NOT catch a normal financing question ("bunga berapa", "DP-nya berapa",
# "cicilan"), only deal/incentive framing (bunga 0%, tanpa DP, cashback, diskon...).
# A promo mention is handled specially -- acknowledged but never confirmed/denied from
# catalog data -- and handed off, so over-matching here would hand off normal price
# questions the bot can answer.
_PROMO_INTENT = re.compile(
    r"(promo|cash\s*back|cashback|diskon|potongan\s*harga|\bgratis\b|\bfree\b|bonus|"
    r"hadiah|voucher|subsidi|giveaway|bunga\s*0|0\s*%|nol\s*persen|tanpa\s*bunga|"
    r"tanpa\s*dp|dp\s*0\b|dp\s*nol|dp\s*ringan|dp\s*murah)", re.I)


def _asks_promo(query: str) -> bool:
    """True when the customer references a promo/incentive the catalog can't verify.
    Narrow on purpose (see _PROMO_INTENT): a false positive hands off a normal price
    question, so this matches only deal framing, not standard finance terms."""
    return bool(query and _PROMO_INTENT.search(query))


def _variant_hits(query: str, rows) -> list:
    """Rows whose variant/item the customer explicitly named. Matches on each
    significant TRIM token of variant_name (e.g. 'ultimate', 'exceed', 'gls', 'gl')
    as a whole word, so 'kalo ultimate otrnya berapa' hits the 'Ultimate' row and
    not just the alphabetically/cheapest-first one. Generic transmission/spec
    tokens are skipped so they never trigger a false variant match.

    Both sides are tokenised the same way and compared as tokens: a substring test
    on the raw query missed the model whenever punctuation touched it, because the
    padded needle needs a space on BOTH sides. Real customers write "saya minat
    Xforce, saya di Wamena" -- " xforce " is not in " ... xforce, ... ", so ranking
    silently fell back to catalog order and turn 1 offered Destinator (D sorts
    before X) to a lead who had just asked for an Xforce."""
    if not query:
        return []
    q_toks = {tk.strip(".,;:!?'\"") for tk in re.split(r"[\s/()-]+", query.lower())}

    def _tok_match(a: str, b: str) -> bool:
        # Exact, plus prefix untuk token >= 4 huruf: "destinator" tetap kena kalau
        # customer menulis "destinators"/"destina" dst. Batas 4 mencegah prefix
        # pendek ("gl" vs "gls") saling nyamber.
        return a == b or (len(a) >= 4 and len(b) >= 4 and (a.startswith(b) or b.startswith(a)))

    hits = []
    for r in rows:
        name = " ".join(x for x in (r["variant_name"], r["item_name"]) if x).strip().lower()
        toks = [tk for tk in re.split(r"[\s/()-]+", name)
                if len(tk) >= 2 and tk not in _GENERIC_VARIANT_TOKENS]
        if any(_tok_match(tk, qt) for tk in toks for qt in q_toks):
            hits.append(r)
    return hits


async def get_catalog_rows(pool, campaign_id, query: str = None, conn=None) -> list[dict]:
    """Distinct catalog VARIANTS for the interactive "pilih varian" list, one row
    per (item, variant) with a representative row id + its OTR. Automotive catalog
    is variant x tenor, so many rows collapse to one entry here; the cheapest
    (headline_price ASC) row is kept as the representative for the tap lookup.

    Ranked so a named model/trim in `query` floats to the top (same intent as the
    grounding path), then by price. Returns [] when the campaign has no catalog.
    """
    if not campaign_id:
        return []
    try:
        async with _acquire(pool, conn) as conn:
            rows = await conn.fetch(
                """SELECT DISTINCT ON (lower(coalesce(item_name,'')), lower(coalesce(variant_name,'')))
                          id::text AS id, item_name, variant_name, location_name, headline_price
                     FROM campaign_catalog
                    WHERE campaign_id = $1::uuid AND headline_price IS NOT NULL
                    ORDER BY lower(coalesce(item_name,'')), lower(coalesce(variant_name,'')),
                             headline_price ASC NULLS LAST""",
                campaign_id)
    except Exception as e:  # never let this break the reply
        log.warning(f"catalog rows lookup failed: {e}")
        return []
    items = [dict(r) for r in rows]
    q = (query or "").lower()
    hits = [t for t in re.split(r"[^a-z0-9]+", q) if len(t) > 2]

    def score(r):
        hay = f"{r.get('item_name') or ''} {r.get('variant_name') or ''}".lower()
        return sum(1 for h in hits if h in hay)

    # Keep the hit count on each row: the caller decides between "send the list" and
    # "ask a narrowing question first", and that turns on whether the customer actually
    # named something (any row with _score > 0) or is just browsing a wide catalog.
    for r in items:
        r["_score"] = score(r)
    items.sort(key=lambda r: (-r["_score"], float(r.get("headline_price") or 1e18)))
    return items


async def _catalog_from_table(pool, campaign_id, model: str,
                              city: str = None, query: str = None,
                              recent_text: str = None, conn=None) -> str | None:
    """Query campaign_catalog for one campaign, matching item/variant on the
    lead's brand/model. Formats rows segment-agnostically (spine columns +
    whatever segment-specific keys sit in the attributes jsonb).

    When brand/model aren't extracted yet the whole (campaign-scoped) catalog is
    returned so even the FIRST turn is grounded; a named trim in `query` is then
    used to rank so the customer's exact variant leads."""
    # Match on the MODEL only -- never the brand. campaign_catalog is already scoped by
    # campaign_id, so brand adds nothing; worse, item_name holds MODEL names ("XFORCE
    # EXCEED CVT"), so a brand needle ("Mitsubishi") matches ZERO rows. That silently
    # defeated the "no model yet -> return the whole catalog so turn 1 is grounded"
    # intent below on every branded campaign: turn 1 fell through to the global
    # finance_packages and grounded the bot on another dealer's cars entirely.
    # An empty needle is the point, not a bug: it returns this campaign's whole
    # pricelist, and `query` then ranks the customer's model to the top.
    needle = (model or "").strip()
    like = f"%{needle}%" if needle else "%"
    async with _acquire(pool, conn) as conn:
        # The LIMIT must cover the WHOLE campaign catalog, because ranking (variant
        # hits + city preference) happens in Python below -- a truncated fetch ranks
        # rows it never saw. At LIMIT 300 over a 500-row catalog ordered by item_name,
        # every XFORCE row (X sorts last) was cut off: turn 1 asked about Xforce and
        # got Destinator. Rows collapse to one entry per variant right after this, and
        # the injection is capped at 14, so a wide fetch costs nothing in prompt size.
        # SELALU ambil SELURUH katalog campaign. Model TIDAK dipakai untuk
        # MEMFILTER (itu yang membuat DAFTAR LENGKAP hanya berisi 1 model dan bot
        # yakin "cuma jual Xpander" saat lead_fields.model=Xpander padahal katalog
        # penuh). Model hanya untuk RANKING di bawah (_variant_hits), sehingga
        # daftar tetap lengkap dan model yang diminta naik ke atas untuk harga.
        _ = (like, needle)  # dipertahankan agar tanda tangan/pemanggil tidak berubah
        rows = await conn.fetch(
            """SELECT item_name, variant_name, location_name, category_type,
                      headline_price, attributes
                 FROM campaign_catalog
                WHERE campaign_id = $1::uuid
                ORDER BY item_name NULLS LAST, variant_name NULLS LAST, headline_price ASC NULLS LAST
                LIMIT 3000""",
            campaign_id,
        )
    if not rows:
        return None
    rows = list(rows)

    # Collapse credit rows to ONE entry per variant (item+variant+location). Each
    # catalog row is a single (variant x tenor), so a trim is 5+ rows sharing one OTR;
    # grouping first makes the injection budget count VARIANTS, not tenor-copies of the
    # cheapest trim (which used to crowd every other trim out of the model's context).
    _groups: dict = {}
    _order: list = []
    for r in rows:
        k = (r["item_name"] or "", r["variant_name"] or "", r["location_name"] or "")
        g = _groups.get(k)
        if g is None:
            g = {"item_name": r["item_name"], "variant_name": r["variant_name"],
                 "location_name": r["location_name"], "category_type": r["category_type"],
                 "headline_price": r["headline_price"], "attributes": _as_dict(r["attributes"]),
                 "tenors": []}
            _groups[k] = g
            _order.append(k)
        a = _as_dict(r["attributes"])
        if a.get("tenor") not in (None, ""):
            g["tenors"].append(a)
    rows = [_groups[k] for k in _order]

    # If the customer named a specific trim, answer from THAT trim (city-preferred
    # within it if possible). This must win over the plain city preference so a
    # lead asking about "Ultimate" is never quoted the cheaper "Exceed" price.
    focus_note = None
    # Set when the lead's city is known but NO row carries it. The rows we inject are
    # then another city's prices, and quoting them as if they applied is the worst
    # failure this module has: a wrong number stated confidently to a customer. Both
    # branches below used to fall back to all rows silently -- keep the fallback (a
    # neighbouring city's price is still useful context) but never let it pass as the
    # lead's own price.
    city_mismatch = False
    hits = _variant_hits(query, rows)
    if not hits and recent_text:
        # Pesan terakhir sering cuma "yang tertinggi" / "simulasi lengkap" tanpa
        # nama model; model yang dimaksud ada di pesan-pesan sebelumnya.
        hits = _variant_hits(recent_text, rows)
    if not hits and model:
        # Fallback terakhir: model dari lead_fields (mis. sudah diekstrak turn lalu).
        hits = _variant_hits(model, rows)
    if hits:
        if city:
            cl = city.strip().lower()
            city_hits = [r for r in hits if r["location_name"] and cl in r["location_name"].lower()]
            if city_hits:
                hits = city_hits
            else:
                city_mismatch = True
        rest = [r for r in rows if r not in hits]
        rows = hits + rest
        focus_note = ("Customer menyebut varian/tipe spesifik; baris yang cocok sudah diletakkan "
                      "PALING ATAS. Jawab pakai baris itu, jangan pakai varian lain.")
    elif city:
        # No specific trim named: keep the plain city preference (else keep all).
        cl = city.strip().lower()
        pref = [r for r in rows if r["location_name"] and cl in r["location_name"].lower()]
        if pref:
            rows = pref
        else:
            city_mismatch = True

    # The FULL variant list, names only -- deduped across cities/tenors, never truncated.
    # This exists because the priced injection below is capped, and a cap plus the
    # alphabetical fetch order meant the model saw only the first few variants and was
    # then told they were "SEMUA varian": a lead asking for a Pajero got "our catalog is
    # Destinator". Names are cheap (~20 lines), so the model can always answer "what do
    # you sell?" correctly and never has to guess a model.
    _names: list = []
    _seen: set = set()
    for r in rows:
        nm = " ".join(x for x in (r["item_name"], r["variant_name"]) if x).strip()
        if nm and nm.lower() not in _seen:
            _seen.add(nm.lower())
            _names.append(nm)

    catalog_lines = [f"[KATALOG CAMPAIGN INI -- DAFTAR LENGKAP ({len(_names)} varian yang dijual)]:"]
    catalog_lines += [f"  - {nm}" for nm in _names]
    catalog_lines.append(
        "CATATAN KATALOG: SEMUA item di daftar di atas kamu jual dan siap kamu bantu - termasuk kalau "
        "customer minta daftar lengkap atau pindah ke model lain yang ADA di daftar; JANGAN pernah bilang "
        "campaign cuma fokus/khusus satu model kalau daftarnya lebih dari satu. Hanya kalau customer "
        "menyebut model yang BENAR-BENAR tidak ada di daftar: jangan mengarang, tanyakan maksudnya atau "
        "tawarkan cek ke tim.")

    # Prices are the expensive AND the risky part: quoting a number nobody asked for is
    # anchoring. Until the customer actually asks, the catalog ships as names only.
    # `recent_text` carries their last few messages so a price question asked one or two
    # turns ago (before they answered the bot's variant/city follow-ups) still counts --
    # once asked, a price is no longer anchoring.
    if not (_asks_price(query) or _asks_price(recent_text)):
        catalog_lines.append(
            "CATATAN HARGA: customer BELUM menanyakan harga. Data harga sengaja TIDAK "
            "disertakan. JANGAN sebut angka harga/DP/cicilan sama sekali dan JANGAN memancing "
            "dengan angka. Kalau customer menanyakan harga, jawab bahwa kamu bantu cek dulu.")
        return "\n".join(catalog_lines)

    # Bound what we inject (ranking already put the relevant variants first).
    rows = rows[:14]

    def rupiah(v):
        try:
            return f"Rp {int(v):,}".replace(",", ".")
        except (TypeError, ValueError):
            return None

    lines = catalog_lines + ["", "[INFO HARGA UNTUK VARIAN YANG RELEVAN]:"]
    for i, r in enumerate(rows, 1):
        parts = [r["item_name"] or ""]
        if r["variant_name"]:
            parts.append(r["variant_name"])
        if r["location_name"]:
            parts.append(f"({r['location_name']})")
        price = rupiah(r["headline_price"])
        if price:
            parts.append(f"| OTR: {price}")
        # Compact credit options collapsed from the per-tenor rows (tenor -> monthly
        # installment [+ TDP]), so one variant stays one line.
        tenors = sorted((a for a in r.get("tenors", []) if isinstance(a, dict)),
                        key=lambda a: int(a.get("tenor") or 0))
        if tenors:
            sim = ", ".join(
                f"{a.get('tenor')}bln {rupiah(a.get('angsuran')) or a.get('angsuran')}"
                + (f"/TDP {rupiah(a.get('tdp'))}" if a.get("tdp") not in (None, '') else "")
                for a in tenors if a.get("angsuran") not in (None, ""))
            if sim:
                parts.append(f"| Cicilan: {sim}")
        else:
            # Non-credit segments: surface whatever attributes exist (dp, size, ...).
            attrs = r["attributes"] or {}
            if isinstance(attrs, dict):
                for k, v in attrs.items():
                    if v in (None, ""):
                        continue
                    money = rupiah(v) if k in ("dp", "dp_amount", "emi", "plafon", "otr_price", "price") else None
                    parts.append(f"| {k}: {money or v}")
        lines.append("  " + f"{i}. " + " ".join(str(p) for p in parts if p))
    # "untuk model & area ini" is only true when the rows actually carry the lead's
    # city; on a mismatch it asserts the wrong city's prices are the lead's own.
    area_claim = "model ini" if city_mismatch else "model & area ini"
    lines.append(f"CATATAN VARIAN: Blok harga di atas memuat varian yang RELEVAN untuk {area_claim}, "
                 "BUKAN seluruh katalog -- katalog lengkapnya ada di daftar nama paling atas. "
                 "Untuk 'tipe tertinggi/termahal' pilih OTR TERBESAR; 'termurah/entry-level' pilih OTR terkecil. "
                 "Jika varian yang ditanya ADA di blok harga, harganya TERSEDIA -- jangan bilang belum ada data. "
                 "Jika varian ADA di daftar nama tapi TIDAK ada di blok harga, jangan bilang tidak dijual: "
                 "bilang harganya perlu dicek ke tim.")
    if city_mismatch:
        lines.append(
            f"CATATAN AREA -- PENTING: TIDAK ADA data harga untuk area customer ({city}). "
            "Harga di atas berasal dari area LAIN (kota tertera di tiap baris) dan BISA BERBEDA. "
            "JANGAN sebut angka di atas sebagai harga untuk area customer. "
            "JANGAN sebut angka harga sama sekali KECUALI customer SECARA EKSPLISIT menanyakan "
            "harga/DP/cicilan. Kalau tidak ditanya, JANGAN pancing dengan angka. "
            f"Kalau ditanya: WAJIB tetap SEBUTKAN angka dari daftar di atas sebagai gambaran "
            f"lengkap dengan nama kotanya (contoh: 'di Jakarta OTR-nya Rp X'), lalu jelaskan data "
            f"untuk {city} belum tersedia dan tawarkan cek ke tim. JANGAN menolak menjawab dan "
            f"JANGAN menanyakan ulang kota customer -- kotanya sudah diketahui ({city}).")
    if focus_note:
        lines.append("CATATAN FOKUS: " + focus_note)
    lines.append("CATATAN UNTUK AI: Jika customer bertanya tentang harga/DP/cicilan, GUNAKAN angka dari atas persis untuk varian yang ditanya. "
                 "Jika varian yang ditanya TIDAK ADA di daftar, katakan datanya belum tersedia dan tawarkan cek ke tim; jangan buat estimasi atau pakai harga varian lain.")
    return "\n".join(lines)

async def get_finance_context(pool, brand: str, model: str, city: str = None, conn=None) -> str | None:
    """
    Mencari paket kredit yang cocok di tabel finance_packages
    berdasarkan brand dan model (dan opsional city).
    Mengembalikan string context untuk disuntikkan ke prompt LLM.
    """
    if not brand and not model:
        return None
        
    # ILIKE patterns (case-insensitive). The DB stores the BASE model ("Brio"),
    # while a lead usually gives a variant ("Brio RS"). So besides the normal
    # match, also match when the searched model CONTAINS the stored model_name
    # (reverse match) — otherwise "Brio RS" never matches "Brio" and no finance
    # context is injected. Order by variant so specific trims (e.g. RS) surface.
    b_pattern = f"%{brand.strip()}%" if brand else "%"
    m_pattern = f"%{model.strip()}%" if model else "%"
    m_raw = model.strip() if model else ""

    cols = ("brand_name, model_name, variant_name, city_name, otr_price, "
            "dp_amount, tenor_months, emi, package_name")
    model_cond = ("(model_name ILIKE $2 "
                  "OR ($3 <> '' AND $3 ILIKE '%' || model_name || '%'))")

    try:
        async with _acquire(pool, conn) as conn:
            rows = []
            if city:
                rows = await conn.fetch(
                    f"SELECT {cols} FROM finance_packages "
                    f"WHERE brand_name ILIKE $1 AND {model_cond} AND city_name ILIKE $4 "
                    f"ORDER BY variant_name, dp_amount ASC LIMIT 8",
                    b_pattern, m_pattern, m_raw, f"%{city.strip()}%",
                )
            # Fallback: no city / nothing in that city -> drop the city filter.
            if not rows:
                rows = await conn.fetch(
                    f"SELECT {cols} FROM finance_packages "
                    f"WHERE brand_name ILIKE $1 AND {model_cond} "
                    f"ORDER BY variant_name, dp_amount ASC LIMIT 8",
                    b_pattern, m_pattern, m_raw,
                )
    except Exception as e:
        log.warning(f"Failed to fetch finance_packages: {e}")
        return None
            
    if not rows:
        return None
        
    # Format baris jadi bullet points
    lines = ["[INFO PAKET KREDIT / SIMULASI CICILAN TERBARU YANG TERSEDIA DI DATABASE (Tawarkan Jika Relavan)]:"]
    for i, r in enumerate(rows, 1):
        v_name = r["variant_name"] if r["variant_name"] else ""
        c_name = f"({r['city_name']})" if r["city_name"] else ""
        pkg = f"[{r['package_name']}]" if r["package_name"] else ""
        
        # Formatting uang (misal: 150.000.000)
        otr = f"Rp {int(r['otr_price']):,}".replace(",", ".") if r["otr_price"] else "N/A"
        dp = f"Rp {int(r['dp_amount']):,}".replace(",", ".") if r["dp_amount"] else "N/A"
        emi = f"Rp {int(r['emi']):,}".replace(",", ".") if r["emi"] else "N/A"
        tenor = f"{r['tenor_months']} bln" if r["tenor_months"] else "N/A"
        
        line = f"  {i}. {pkg} {r['brand_name']} {r['model_name']} {v_name} {c_name} | OTR: {otr} | DP: {dp} | Tenor: {tenor} | Cicilan: {emi}/bulan"
        lines.append(line)
        
    lines.append("CATATAN UNTUK AI: Jika customer bertanya tentang DP/Cicilan/Harga, GUNAKAN angka dari atas. Jangan buat estimasi sendiri.")
    
    return "\n".join(lines)
