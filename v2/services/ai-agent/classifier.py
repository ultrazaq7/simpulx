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
                        r"\bberapa\b", r"\bbrp\b", r"\bjuta\b", r"\bjt\b"],
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

STRONG_INTENT = {"Booking/Order", "Test Drive", "Visit/Showroom", "Strong/Closing"}
# Considering-tier intent (shopping, not yet committing).
CONSIDERING_INTENT = {"Price/Financing", "Promo/Deal", "Stock/Availability",
                      "Specs/Variant", "Trade-in", "Documents/Process", "Model/Brand Interest"}

# Off-topic: job-seekers replying to driver-recruitment ads (NOT buyers).
OFF_TOPIC = [r"\bjadi driver\b", r"\bjadi sopir\b", r"\bmau jadi driver\b", r"\bsyarat driver\b",
             r"\blamar driver\b", r"\brekrut\b", r"\blowongan\b"]

# Precompile.
_COMPILED = {cat: re.compile("|".join(pats)) for cat, pats in INTENT_CATEGORIES.items()}
_OFF_TOPIC_RE = re.compile("|".join(OFF_TOPIC))


class Classification(TypedDict):
    interest: str | None      # hot | warm | cold | None
    stage_key: str            # new | engaged | considering | high_intent | closing
    disposition_key: str | None
    categories: List[str]
    off_topic: bool
    confidence: float
    reason: str


def classify(customer_messages: List[str]) -> Classification:
    reply_count = len(customer_messages)
    blob = "\n".join(customer_messages).lower()

    categories = [cat for cat, rx in _COMPILED.items() if rx.search(blob)]
    off_topic = bool(_OFF_TOPIC_RE.search(blob))
    has_strong = any(c in STRONG_INTENT for c in categories)
    has_intent = len(categories) > 0

    # ---- stage ----
    if has_strong and any(c == "Strong/Closing" for c in categories):
        stage_key, confidence = "spk", 0.92
    elif has_strong:
        stage_key, confidence = "appointment", 0.80
    elif any(c in CONSIDERING_INTENT for c in categories):
        stage_key, confidence = "qualified", 0.66
    elif reply_count >= 1:
        stage_key, confidence = "contacted", 0.50
    else:
        stage_key, confidence = "new", 0.30

    # ---- interest level ----
    if off_topic:
        interest = "cold"
    elif has_strong or reply_count >= 5:
        interest = "hot"
    elif has_intent or reply_count >= 2:
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
    elif stage_key == "spk":
        reason = "Strong closing signal detected (" + ", ".join(categories) + ")."
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
