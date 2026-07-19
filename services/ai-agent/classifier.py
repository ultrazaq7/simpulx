"""AI lead classifier - infers interest level, pipeline stage, and off-topic
disposition from the customer's chat messages.

Intent keyword categories started from the team-validated OTO Lead Quality
framework (Indonesian car-buying signals) and were expanded to cover every
segment Simpulx sells into: automotive (mobil + motor), property (rumah tapak,
apartemen, ruko/kavling), and general B2C retail, plus the English phrases
Meta's click-to-WhatsApp ads inject ("Can I get more info on this?"). Sources:
real prod inbound chats + Indonesian property/credit glossaries (UTJ/NUP/PPJB/
AJB, TDP/ADDM/ADDB) + online-selling slang (COD/PO/nego/nett). Rules-first:
deterministic, instant, and free - the LLM can refine later. Track intent
per-lead (any customer message contains a keyword), never per-message.

Category names are FROZEN: they feed feature names in features.py (lead-score
model input) - add patterns inside a category, never rename/remove categories.
"""
from __future__ import annotations

import re
from typing import Dict, List, TypedDict

# 11 intent categories; patterns grouped per segment (umum / otomotif /
# properti / retail / english) so per-vertical additions stay reviewable.
INTENT_CATEGORIES: Dict[str, List[str]] = {
    "Price/Financing": [
        # umum
        r"\bdp\b", r"\bcicilan\b", r"\bangsuran\b", r"\bharga\b", r"\bkredit\b",
        r"\btunai\b", r"\bcash\b", r"\bbunga\b", r"\btenor\b", r"\bberapa\b", r"\bbrp\b",
        r"\bjuta\b", r"\bjt\b", r"\bsimulasi\b", r"\bacc\b", r"\bbudget\b", r"\bdana\b",
        r"\bnego\b", r"\bnett\b", r"\bbisa kurang\b", r"\bkurangin\b", r"\bmurahin\b",
        r"\bpricelist\b", r"\bprice list\b", r"\bharga pas\b", r"\btermurah\b",
        # format angka harga khas chat: 800jt / 1,5m / 1.2m / 900juta (nempel atau spasi)
        r"\b\d+(?:[.,]\d+)?\s*(?:jt|juta|miliar|milyar)\b", r"\b\d+(?:[.,]\d+)?m\b",
        # otomotif
        r"\botr\b", r"\bleasing\b", r"\btaf\b", r"\btdp\b", r"\baddm\b", r"\baddb\b",
        # properti
        r"\bkpr\b", r"\bkpa\b", r"\bcash bertahap\b", r"\bcash keras\b",
        r"\bin.?house\b", r"\btake.?over\b", r"\bfix rate\b", r"\bfloating\b",
        # english (CTWA / expat)
        r"\bprice\b", r"\bhow much\b", r"\binstallment\b", r"\bdown payment\b",
    ],
    "Promo/Deal": [
        r"\bpromo\b", r"\bdiskon\b", r"\bpenawaran\b", r"\bbonus\b", r"\bcashback\b",
        r"\bsubsidi\b", r"\bgratis\b", r"\bvoucher\b", r"\bfree biaya\b", r"\bdp 0\b",
        r"\bfree ongkir\b", r"\bdiscount\b",
    ],
    "Test Drive": [
        r"\btest drive\b", r"\btest-drive\b", r"\btestdrive\b", r"\btest ride\b",
        r"\buji coba\b", r"\bcoba mobil\b", r"\bcoba unit\b", r"\bcoba dulu\b", r"\bjajal\b",
    ],
    "Booking/Order": [
        # umum
        r"\bbooking\b", r"\binden\b", r"\bindent\b", r"\btanda jadi\b", r"\bpesan unit\b",
        r"\bmau pesan\b", r"\bpesan sekarang\b", r"\bamankan unit\b",
        # otomotif
        r"\bspk\b", r"\bambil unit\b", r"\bambil mobil\b", r"\bambil motor\b", r"\bdelivery order\b",
        # properti
        r"\bbooking fee\b", r"\butj\b", r"\bnup\b", r"\buang tanda jadi\b",
        # retail
        r"\bpre.?order\b", r"\bpo\b", r"\bcod\b", r"\bmau order\b", r"\border sekarang\b",
        # english
        r"\breserve\b", r"\bbook now\b",
    ],
    "Visit/Showroom": [
        # umum
        r"\bketemu\b", r"\bketemuan\b", r"\bjanjian\b", r"\bjanji temu\b", r"\bdatang\b",
        r"\bberkunjung\b", r"\balamat\b", r"\blokasi\b", r"\bmampir\b", r"\bkunjung\b",
        r"\bmaps\b", r"\bshare.?loc\b", r"\bshare lokasi\b", r"\bjadwal ketemu\b",
        # otomotif
        r"\bshowroom\b", r"\bdealer\b",
        # properti
        r"\bsurvey\b", r"\bsurvei\b", r"\bsite visit\b", r"\bshow unit\b",
        r"\brumah contoh\b", r"\bunit contoh\b", r"\bmarketing gallery\b",
        r"\bkantor pemasaran\b", r"\bli(?:h?)at unit\b", r"\bli(?:h?)at rumah\b",
        r"\bli(?:h?)at lokasi\b",
        # english
        r"\bvisit\b", r"\bcome by\b",
    ],
    "Stock/Availability": [
        r"\bstok\b", r"\bstock\b", r"\bready\b", r"\btersedia\b", r"\bada unit\b",
        r"\bunit ready\b", r"\bready stock\b", r"\bmasih ada\b", r"\bsisa unit\b",
        r"\bsisa berapa\b", r"\bmasih kosong\b", r"\bavailable\b",
    ],
    "Specs/Variant": [
        # umum
        r"\bvarian\b", r"\bvariant\b", r"\btipe\b", r"\bspek\b", r"\bspesifikasi\b",
        r"\bwarna\b", r"\bbrosur\b", r"\bkatalog\b", r"\be-?brosur\b", r"\be-?katalog\b",
        # otomotif
        r"\btransmisi\b", r"\bmatic\b", r"\bmanual\b", r"\bcvt\b",
        # properti
        r"\bdenah\b", r"\bsite.?plan\b", r"\bluas tanah\b", r"\bluas bangunan\b",
        r"\bkamar tidur\b", r"\bcarport\b", r"\bfasilitas\b", r"\bspesifikasi bangunan\b",
        # english
        r"\bspecs\b", r"\bbrochure\b", r"\bfloor.?plan\b",
    ],
    "Trade-in": [
        r"\btukar tambah\b", r"\btrade.?in\b", r"\bover kredit\b", r"\bover credit\b",
    ],
    "Documents/Process": [
        # umum
        r"\bktp\b", r"\bnpwp\b", r"\bslip gaji\b", r"\bsyarat\b", r"\bpersyaratan\b",
        r"\bdokumen\b", r"\bberkas\b", r"\bbi checking\b", r"\bslik\b",
        # otomotif
        r"\bbpkb\b", r"\bstnk\b",
        # properti
        r"\bshm\b", r"\bhgb\b", r"\bajb\b", r"\bppjb\b", r"\bimb\b", r"\bpbg\b",
        r"\bbphtb\b", r"\bsertifikat\b", r"\bbalik nama\b", r"\bnotaris\b",
        r"\bproses kpr\b", r"\bakad\b",
        # english
        r"\brequirements\b",
    ],
    "Strong/Closing": [
        # umum
        r"\bdeal\b", r"\boke deal\b", r"\boke jadi\b", r"\bsiap order\b", r"\bsepakat\b",
        r"\bjadi ambil\b", r"\bfix ambil\b", r"\bsaya ambil\b", r"\blanjut proses\b",
        r"\bgaskeun\b", r"\bgaskan\b", r"\btransfer\b", r"\bbayar\b", r"\bkirim rekening\b",
        r"\bno.?rek\b", r"\brekening berapa\b",
        # otomotif
        r"\bkapan bisa diambil\b", r"\bkapan ready\b",
        # properti
        r"\bkapan akad\b", r"\bkapan serah terima\b", r"\bkapan bisa ditempati\b",
    ],
    # Explicit product interest: generic interest verbs + per-segment product nouns.
    # Mined from real SmartKonek + Simpulx prod chats (incl. CTWA ad templates).
    "Model/Brand Interest": [
        # umum
        r"\btertarik\b", r"\bminat\b", r"\bnaksir\b", r"\bpengen\b", r"\bmau beli\b",
        # english - Meta CTWA default greeting is "Hello! Can I get more info on this?"
        r"\binterested\b", r"\bmore info\b",
        # otomotif - mobil
        r"\bbajaj\b", r"\bcreta\b", r"\bbrio\b", r"\bsuzuki\b", r"\btoyota\b",
        r"\bhonda\b", r"\bhyundai\b", r"\bxpeng\b", r"\bdaihatsu\b", r"\bmitsubishi\b",
        r"\bwuling\b", r"\bnissan\b", r"\bmazda\b", r"\bkia\b", r"\bavanza\b",
        r"\bxenia\b", r"\bertiga\b", r"\brush\b", r"\bterios\b", r"\braize\b",
        r"\bfortuner\b", r"\bpajero\b", r"\binnova\b", r"\bhrv\b", r"\bbrv\b",
        r"\bmobilio\b", r"\bbr-v\b", r"\bhr-v\b", r"\bxforce\b", r"\bx-force\b",
        r"\bxpander\b", r"\bveloz\b", r"\bstargazer\b", r"\bseltos\b", r"\bsonet\b",
        r"\byaris\b", r"\bagya\b", r"\bcalya\b", r"\bsigra\b", r"\bayla\b", r"\brocky\b",
        r"\bwr-v\b", r"\bjazz\b", r"\bcivic\b", r"\bcrv\b", r"\bcr-v\b", r"\balmaz\b",
        r"\balvez\b", r"\bbyd\b", r"\bseal\b", r"\batto\b", r"\bdolphin\b", r"\bomoda\b",
        r"\bchery\b", r"\btiggo\b", r"\bzenix\b", r"\balphard\b",
        # otomotif - motor
        r"\byamaha\b", r"\bvespa\b", r"\bkawasaki\b", r"\bnmax\b", r"\bpcx\b",
        r"\baerox\b", r"\bbeat\b", r"\bvario\b", r"\bscoopy\b",
        # properti
        r"\brumah\b", r"\bruko\b", r"\bapartemen?t?\b", r"\bkavling\b", r"\bcluster\b",
        r"\btownhouse\b", r"\bvilla\b", r"\bkost\b", r"\bgudang\b", r"\brumah subsidi\b",
        r"\b[23]br\b", r"\bstudio\b", r"\bbeli tanah\b",
    ],
}

STRONG_INTENT = {"Booking/Order", "Test Drive", "Visit/Showroom", "Strong/Closing", "Promo/Deal", "Price/Financing", "Specs/Variant", "Documents/Process"}
# Considering-tier intent (shopping, not yet committing).
CONSIDERING_INTENT = {"Stock/Availability", "Trade-in", "Model/Brand Interest"}

# Interest TEMPERATURE tiers (a different axis from STRONG_INTENT, which drives the
# funnel STAGE + the LLM gate). "Hot" is deliberately narrow: only commitment / visit /
# closing signals -- someone truly ready for sales, not merely asking a price. Asking
# price/specs/promo/docs is genuine buying interest but still shopping, so it is WARM,
# never hot. Everything with no intent category is COLD (ambiguous). Volume (reply count)
# and ad-clicks are NOT signals here: a chatty lead with no intent, or a bare ad click,
# is cold. The final hot/warm/cold also passes business filters (out-of-area, buy
# horizon, qualifier completeness) applied in the orchestrator where lead_fields live.
HOT_INTEREST = {"Booking/Order", "Test Drive", "Visit/Showroom", "Strong/Closing"}

# Off-topic: job-seekers replying to driver-recruitment ads (NOT buyers).
OFF_TOPIC = [r"\bjadi driver\b", r"\bjadi sopir\b", r"\bmau jadi driver\b", r"\bsyarat driver\b",
             r"\blamar driver\b", r"\brekrut\b", r"\blowongan\b"]

# Precompile.
_COMPILED = {cat: re.compile("|".join(pats)) for cat, pats in INTENT_CATEGORIES.items()}
_OFF_TOPIC_RE = re.compile("|".join(OFF_TOPIC))

# Filler / non-informative customer turns ("ya", "ok", emoji, ack). Ported from
# distill_kb.py. Used to skip the expensive LLM analyze on throwaway messages.
_FILLER_RE = re.compile(
    r"^(ya+|iya+|oke?|ok|ku|baik|siap|sip|halo+|hai|hi|pagi|siang|sore|malam|"
    r"terima kasih|makasih|thanks?|sama2|sama-sama|mantap|noted|pak|bu|kak|min|"
    r"ditunggu|monggo|silahkan|silakan|y|ya pak|ok pak|oke pak)$",
    re.IGNORECASE,
)
_EMOJI_PUNCT_RE = re.compile(r"^[\W\d\s]+$")  # only emoji/punctuation/digits


def is_trivial(text: str) -> bool:
    """True for filler/ack/emoji-only messages not worth an LLM call."""
    t = (text or "").strip()
    if len(t) < 3:
        return True
    if _EMOJI_PUNCT_RE.match(t):
        return True
    return bool(_FILLER_RE.match(t))


# ---- Lost Analysis & Junk Detection (FR-34) ----------------
# Structured lost_reason enum. `did_purchase=true` for the first group (we lost the
# deal but the customer DID buy — competitive/product loss); the rest are no-buy or junk.
LOST_REASONS = [
    # lost, did_purchase=true
    "bought_other_brand", "bought_used_car", "bought_elsewhere", "competitor_promo",
    # lost, did_purchase=false
    "out_of_area", "price_too_high", "financing_rejected", "no_budget", "postponed",
    "wrong_product", "changed_mind", "trade_in_issue",
    # spam / junk (never a real lead)
    "spam_junk", "job_seeker", "abusive", "ghosted", "duplicate", "wrong_number",
]

# Conservative (high-precision) profanity — a customer being abusive, word-boundary.
# Includes common chat abbreviations (kntl, anjg, jnck...) so an abusive troll is
# caught deterministically and the bot stands down instead of burning a credit per
# reply. Kept tight to unambiguous abuse; softer gibberish/trolling is handled by the
# nurture LLM's stand_down decision, not here.
_ABUSIVE = [r"\banjing\b", r"\bbangsat\b", r"\bkontol\b", r"\bmemek\b", r"\bgoblok\b",
            r"\btolol\b", r"\bbabi\b", r"\bngentot\b", r"\basu\b", r"\bjancok\b",
            r"\bkampret\b", r"\bbrengsek\b", r"\bbgst\b", r"\bbangke\b",
            r"\bkntl\b", r"\banjg\b", r"\bjnck\b", r"\bjancuk\b",
            r"\bbgsd\b", r"\bbangsad\b", r"\bgblk\b", r"\bngentod\b",
            r"\bkampang\b", r"\bkontl\b", r"\bkntol\b"]
# Obscene / lewd (sexual) content — "konten senonoh". High-precision, word-boundary
# so ordinary product chat is never caught. Bucketed the same as abusive (spam).
_OBSCENE = [r"\bngewe\b", r"\bngentod\b", r"\bcoli\b", r"\bcolmek\b", r"\bsange\b",
            r"\bngaceng\b", r"\bpepek\b", r"\bpeler\b", r"\bjembut\b", r"\btoket\b",
            r"\bbugil\b", r"\btelanjang\b", r"\bbokep\b", r"\bhorny\b", r"\bbispak\b",
            r"\bbisyar\b", r"\bpukimak\b", r"\btempik\b", r"\bnyepong\b", r"\bcrot\b"]
_ABUSIVE_RE = re.compile("|".join(_ABUSIVE + _OBSCENE), re.IGNORECASE)
_URL_RE = re.compile(r"(https?://|www\.|wa\.me/|fb\.me/|t\.me/|bit\.ly/)", re.IGNORECASE)


def detect_junk(customer_messages: List[str]) -> dict:
    """Rules-only junk / lost-reason early detection (free, HIGH-PRECISION on purpose:
    a false positive = a lost real lead). Returns {is_junk, category, lost_reason,
    confidence, reason}. category is 'spam' (never a real lead -> excluded from
    conversion math) or 'off_topic'. Caller must confidence-gate and NEVER override a
    human-set disposition; auto-set is reversible (BR-44). Ghost/non-responder is a
    TIME signal (no genuine reply after follow-up) -> handled at the orchestrator/cron,
    not here."""
    msgs = [m for m in customer_messages if (m or "").strip()]
    low = "\n".join(msgs).lower()

    if _OFF_TOPIC_RE.search(low):
        return {"is_junk": True, "category": "off_topic", "lost_reason": "job_seeker",
                "confidence": 0.85, "reason": "Job-seeker / driver-recruitment, not a buyer."}
    if _ABUSIVE_RE.search(low):
        return {"is_junk": True, "category": "spam", "lost_reason": "abusive",
                "confidence": 0.85, "reason": "Abusive or obscene content detected."}
    urls = len(_URL_RE.findall(low))
    norm = [re.sub(r"\s+", " ", m.strip().lower()) for m in msgs]
    repeated_blast = len(norm) >= 3 and len(set(norm)) == 1
    if urls >= 2 or repeated_blast:
        return {"is_junk": True, "category": "spam", "lost_reason": "spam_junk",
                "confidence": 0.70, "reason": "Spam pattern (multiple links / repeated blast)."}
    return {"is_junk": False, "category": None, "lost_reason": None, "confidence": 0.0, "reason": ""}


class Classification(TypedDict):
    interest: str | None      # hot | warm | cold | None
    stage_key: str            # AI ceiling is "qualified": new | contacted | qualified
                              # (appointment / spk are human-confirmed, never auto-set)
    disposition_key: str | None
    categories: List[str]
    off_topic: bool
    confidence: float
    reason: str


# Buy horizon buckets, read off the free-text purchase_timeframe the extractor stores.
# A lead planning to buy MORE than 3 months out (or with no committed timing -- "masih
# survei", "belum tahu") is not warm/hot yet, so the orchestrator demotes it to cold.
# Conservative on purpose: only clear signals move the needle; anything unrecognised
# returns None (unknown) so a strong-intent lead isn't punished for vague phrasing.
_TF_FAR_RE = re.compile(
    r"(survei|surve|lihat.?lihat|liat.?liat|belum\s*(tau|tahu|pasti|ada|kepikiran|kepikir)|"
    r"ga+\s*tau|gak\s*tau|ngga?k?\s*tau|nanti|tahun\s*depan|thn\s*depan|taun\s*depan|"
    r"akhir\s*tahun|se\s*tahun|setahun|satu\s*tahun|1\s*tahun|12\s*bulan|jangka\s*panjang|"
    r"lebih\s*dari\s*3|>\s*3|\b([4-9]|1[0-2])\s*(bulan|bln))", re.I)
_TF_SOON_RE = re.compile(
    r"(secepat|segera|\basap\b|dalam\s*waktu\s*dekat|minggu\s*ini|minggu\s*depan|"
    r"bulan\s*ini|bulan\s*depan|bln\s*ini|bln\s*depan|hari\s*ini|sekarang|"
    r"\b([1-3])\s*(bulan|bln)\b|sebulan|dua\s*bulan|tiga\s*bulan)", re.I)


def buy_within_3mo(timeframe) -> bool | None:
    """True if the timeframe clearly means WITHIN ~3 months, False if it clearly means
    beyond 3 months / non-committal, None if unknown/unrecognised. FAR is checked before
    SOON so a mixed phrase ('mau bulan depan tapi masih survei') stays cautious."""
    s = (timeframe or "").strip().lower()
    if not s:
        return None
    if _TF_FAR_RE.search(s):
        return False
    if _TF_SOON_RE.search(s):
        return True
    return None


def classify(customer_messages: List[str]) -> Classification:
    # customer_messages is GENUINE-only (the caller filters ad/keyword openers), so
    # every signal here is something the lead actually typed. Ad clicks and raw message
    # volume are intentionally NOT inputs: neither is buying intent.
    reply_count = len(customer_messages)
    blob = "\n".join(customer_messages).lower()

    categories = [cat for cat, rx in _COMPILED.items() if rx.search(blob)]
    off_topic = bool(_OFF_TOPIC_RE.search(blob))
    has_strong = any(c in STRONG_INTENT for c in categories)
    has_intent = len(categories) > 0

    # ---- stage ----
    # The AI auto-advances a lead only as far as "qualified". "appointment" and
    # "spk" (a booked visit / signed order) are real-world commitments that a
    # human must confirm, so the classifier NEVER auto-selects a stage past
    # "qualified" from chat text alone — even on a strong/closing signal.
    if has_strong and any(c == "Strong/Closing" for c in categories):
        stage_key, confidence = "qualified", 0.92
    elif has_strong:
        stage_key, confidence = "qualified", 0.80
    elif any(c in CONSIDERING_INTENT for c in categories):
        stage_key, confidence = "qualified", 0.66
    elif reply_count >= 1:
        stage_key, confidence = "contacted", 0.50
    else:
        stage_key, confidence = "new", 0.30

    # ---- interest level (temperature) ----
    # Intent-only and strict. HOT is just the commitment/visit/closing categories;
    # any other intent (price/specs/promo/docs/stock/trade-in/model) is WARM shopping;
    # replied-but-no-intent is COLD (ambiguous). No volume/ad-click shortcuts. The
    # orchestrator then applies business filters (out-of-area, buy horizon >3mo, and
    # WARM's requirement that the qualifiers be complete) before this is stored.
    has_hot = any(c in HOT_INTEREST for c in categories)
    if off_topic:
        interest = "cold"
    elif has_hot:
        interest = "hot"
    elif has_intent:
        interest = "warm"
    elif reply_count >= 1:
        interest = "cold"
    else:
        interest = None

    disposition_key = "off_topic" if off_topic else None

    # ---- human-readable reason ----
    if off_topic:
        reason = "Off-topic: looks like a job-seeker / driver-recruitment lead, not a buyer."
        confidence = max(confidence, 0.85)
    elif has_strong:
        reason = ("Strong buying signal detected (" + ", ".join(categories)
                  + ") - marked qualified; a human confirms the appointment/SPK.")
    elif categories:
        reason = "Detected buying intent: " + ", ".join(categories) + "."
    elif reply_count >= 1:
        reason = "Customer is replying but no clear buying intent yet."
    else:
        reason = "New lead, awaiting first reply."

    return Classification(
        interest=interest, stage_key=stage_key, disposition_key=disposition_key,
        categories=categories, off_topic=off_topic, confidence=confidence, reason=reason,
    )
