"""AI lead classifier - infers interest level, pipeline stage, and off-topic
disposition from the customer's chat messages.

Intent keyword categories are ported from the team-validated OTO Lead Quality
framework (Indonesian car-buying signals). Rules-first: deterministic, instant,
and free - the LLM can refine later. Track intent per-lead (any customer message
contains a keyword), never per-message.
"""
from __future__ import annotations

import re
from typing import Dict, List, TypedDict

# 10 validated intent categories (Indonesian car-buying signals).
INTENT_CATEGORIES: Dict[str, List[str]] = {
    "Price/Financing": [r"\bdp\b", r"\bcicilan\b", r"\bangsuran\b", r"\bharga\b", r"\botr\b",
                        r"\bkredit\b", r"\btunai\b", r"\bbunga\b", r"\btenor\b", r"\bleasing\b",
                        r"\bberapa\b", r"\bbrp\b", r"\bjuta\b", r"\bjt\b", r"\bsimulasi\b", r"\bacc\b", r"\btaf\b"],
    "Promo/Deal": [r"\bpromo\b", r"\bdiskon\b", r"\bpenawaran\b", r"\bbonus\b", r"\bcashback\b",
                   r"\bsubsidi\b", r"\bgratis\b"],
    "Test Drive": [r"\btest drive\b", r"\btest-drive\b", r"\btestdrive\b", r"\buji coba\b",
                   r"\bcoba mobil\b", r"\bcoba unit\b", r"\bcoba dulu\b"],
    "Booking/Order": [r"\bbooking\b", r"\bspk\b", r"\binden\b", r"\bindent\b", r"\btanda jadi\b",
                      r"\bpesan unit\b", r"\bambil unit\b", r"\bambil mobil\b", r"\bdelivery order\b"],
    "Visit/Showroom": [r"\bshowroom\b", r"\bdealer\b", r"\bketemu\b", r"\bdatang\b", r"\bberkunjung\b",
                       r"\balamat\b", r"\blokasi\b", r"\bmampir\b", r"\bsurvey\b", r"\bkunjung\b"],
    "Stock/Availability": [r"\bstok\b", r"\bstock\b", r"\bready\b", r"\btersedia\b", r"\bada unit\b",
                           r"\bunit ready\b", r"\bready stock\b"],
    "Specs/Variant": [r"\bvarian\b", r"\bvariant\b", r"\btipe\b", r"\bspek\b", r"\bspesifikasi\b",
                      r"\bwarna\b", r"\btransmisi\b", r"\bmatic\b", r"\bmanual\b", r"\bcvt\b",
                      r"\bbrosur\b", r"\bkatalog\b"],
    "Trade-in": [r"\btukar tambah\b", r"\btrade.?in\b", r"\bover kredit\b", r"\bover credit\b"],
    "Documents/Process": [r"\bktp\b", r"\bnpwp\b", r"\bslip gaji\b", r"\bsyarat\b", r"\bpersyaratan\b",
                          r"\bbpkb\b", r"\bstnk\b", r"\bdokumen\b"],
    "Strong/Closing": [r"\bdeal\b", r"\boke deal\b", r"\boke jadi\b", r"\bsiap order\b",
                       r"\bkapan bisa diambil\b", r"\bkapan ready\b", r"\btransfer\b", r"\bbayar\b"],
    # Explicit product/model interest. Mined from real SmartKonek chat data
    # (top inbound terms: tertarik + vehicle brand/model names). Per-industry:
    # this category is vehicle-specific — swap the brand list for other verticals.
    "Model/Brand Interest": [r"\btertarik\b", r"\bminat\b", r"\bnaksir\b", r"\bpengen\b", r"\bmau beli\b",
                             r"\bbajaj\b", r"\bcreta\b", r"\bbrio\b", r"\bsuzuki\b", r"\btoyota\b",
                             r"\bhonda\b", r"\bhyundai\b", r"\bxpeng\b", r"\bdaihatsu\b", r"\bmitsubishi\b",
                             r"\bwuling\b", r"\bnissan\b", r"\bmazda\b", r"\bkia\b", r"\bavanza\b",
                             r"\bxenia\b", r"\bertiga\b", r"\brush\b", r"\bterios\b", r"\braize\b",
                             r"\bfortuner\b", r"\bpajero\b", r"\binnova\b", r"\bhrv\b", r"\bbrv\b",
                             r"\bmobilio\b", r"\bbr-v\b", r"\bhr-v\b"],
}

STRONG_INTENT = {"Booking/Order", "Test Drive", "Visit/Showroom", "Strong/Closing", "Promo/Deal", "Price/Financing", "Specs/Variant", "Documents/Process"}
# Considering-tier intent (shopping, not yet committing).
CONSIDERING_INTENT = {"Stock/Availability", "Trade-in", "Model/Brand Interest"}

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
_ABUSIVE = [r"\banjing\b", r"\bbangsat\b", r"\bkontol\b", r"\bmemek\b", r"\bgoblok\b",
            r"\btolol\b", r"\bbabi\b", r"\bngentot\b", r"\basu\b", r"\bjancok\b",
            r"\bkampret\b", r"\bbrengsek\b", r"\bbgst\b", r"\bbangke\b"]
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


def classify(customer_messages: List[str], ad_clicks: int = 0) -> Classification:
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

    # ---- interest level ----
    if off_topic:
        interest = "cold"
    elif has_strong or reply_count >= 5 or ad_clicks >= 3:
        interest = "hot"
    elif has_intent or reply_count >= 2 or ad_clicks >= 1:
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
