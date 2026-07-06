"""Segment schema registry (WS-B).

Drives what the Simpuler bot qualifies a lead on, per the conversation's campaign
segment. AUTOMOTIVE is native: its fields live in dedicated conversation columns
(car_brand/car_model/city/purchase_timeframe) and the extraction path is UNCHANGED.
Every other segment stores its qualifiers in conversations.metadata->'lead_fields'.

Keys here are the normalized (lowercased) campaign segment labels used in the web
campaign form. An unset/unknown segment behaves exactly like automotive did before
this change, so existing campaigns are not affected.
"""
from __future__ import annotations

AUTOMOTIVE = "automotive"

# Per segment: ordered list of {key, label} the bot qualifies on.
SEGMENT_SCHEMAS: dict[str, list[dict]] = {
    "property / real estate": [
        {"key": "property_type", "label": "Property type"},
        {"key": "location", "label": "Preferred location"},
        {"key": "budget", "label": "Budget"},
        {"key": "purchase_timeframe", "label": "Timeframe"},
    ],
    "finance": [
        {"key": "product", "label": "Product"},
        {"key": "loan_amount", "label": "Loan amount"},
        {"key": "tenor", "label": "Tenor"},
        {"key": "purpose", "label": "Purpose"},
    ],
    "insurance": [
        {"key": "insurance_type", "label": "Insurance type"},
        {"key": "coverage", "label": "Coverage"},
        {"key": "budget", "label": "Budget"},
    ],
    "retail / fmcg": [
        {"key": "product", "label": "Product"},
        {"key": "quantity", "label": "Quantity"},
        {"key": "budget", "label": "Budget"},
    ],
    "education": [
        {"key": "program", "label": "Program"},
        {"key": "level", "label": "Level"},
        {"key": "intake", "label": "Intake"},
    ],
    "healthcare": [
        {"key": "service", "label": "Service"},
        {"key": "preferred_date", "label": "Preferred date"},
    ],
    "travel & hospitality": [
        {"key": "destination", "label": "Destination"},
        {"key": "dates", "label": "Dates"},
        {"key": "pax", "label": "Travelers"},
        {"key": "budget", "label": "Budget"},
    ],
    "food & beverage": [
        {"key": "item", "label": "Item"},
        {"key": "quantity", "label": "Quantity"},
        {"key": "event_date", "label": "Event date"},
    ],
    "services": [
        {"key": "service", "label": "Service needed"},
        {"key": "location", "label": "Location"},
        {"key": "budget", "label": "Budget"},
    ],
}


def _norm(segment) -> str:
    return (segment or "").strip().lower()


def is_automotive(segment) -> bool:
    """Unset/empty segments behave as automotive (the prior, native behaviour)."""
    s = _norm(segment)
    return s == "" or s == AUTOMOTIVE


def fields_for(segment) -> list[dict]:
    return SEGMENT_SCHEMAS.get(_norm(segment), [])


def extra_fields_for(segment) -> list[dict]:
    """Non-native fields to extract into metadata.lead_fields. Empty for
    automotive/unset so the live extraction path stays byte-for-byte identical."""
    if is_automotive(segment):
        return []
    return fields_for(segment)


def required_keys(segment) -> list[str]:
    """Keys that mark a non-auto lead 'qualified' (all present -> ready to hand off)."""
    return [f["key"] for f in fields_for(segment)]
