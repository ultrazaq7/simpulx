// Segment schema registry (WS-B) - mirrors services/ai-agent/segments.py.
// Every segment (automotive included) stores its qualifiers in the
// conversation's lead_fields (metadata->'lead_fields'). Keys are the normalized
// (lowercased) campaign segment labels used in the campaign form.

export type SegmentField = { key: string; label: string };

export const SEGMENT_SCHEMAS: Record<string, SegmentField[]> = {
  "automotive": [
    { key: "brand", label: "components.brand" },
    { key: "model", label: "components.model" },
    { key: "city", label: "components.city" },
    { key: "purchase_timeframe", label: "components.purchaseTime" },
  ],
  "property / real estate": [
    { key: "property_type", label: "Property type" },
    { key: "location", label: "Preferred location" },
    { key: "budget", label: "Budget" },
    { key: "land_area", label: "Land area (LT)" },
    { key: "building_area", label: "Building area (LB)" },
    { key: "purchase_timeframe", label: "Timeframe" },
  ],
  "finance": [
    { key: "product", label: "Product" },
    { key: "loan_amount", label: "Loan amount" },
    { key: "tenor", label: "Tenor" },
    { key: "purpose", label: "Purpose" },
  ],
  "insurance": [
    { key: "insurance_type", label: "Insurance type" },
    { key: "coverage", label: "Coverage" },
    { key: "budget", label: "Budget" },
  ],
  "retail / fmcg": [
    { key: "product", label: "Product" },
    { key: "quantity", label: "Quantity" },
    { key: "budget", label: "Budget" },
  ],
  "education": [
    { key: "program", label: "Program" },
    { key: "level", label: "Level" },
    { key: "intake", label: "Intake" },
  ],
  "healthcare": [
    { key: "service", label: "Service" },
    { key: "preferred_date", label: "Preferred date" },
  ],
  "travel & hospitality": [
    { key: "destination", label: "Destination" },
    { key: "dates", label: "Dates" },
    { key: "pax", label: "Travelers" },
    { key: "budget", label: "Budget" },
  ],
  "food & beverage": [
    { key: "item", label: "Item" },
    { key: "quantity", label: "Quantity" },
    { key: "event_date", label: "Event date" },
  ],
  "services": [
    { key: "service", label: "Service needed" },
    { key: "location", label: "Location" },
    { key: "budget", label: "Budget" },
  ],
};

// The one segment vocabulary: campaign segment AND organisation industry pick from
// this list (stored as the display string; matching always goes through norm()).
export const SEGMENT_OPTIONS = [
  "Automotive", "Property / Real Estate", "Finance", "Insurance", "Retail / FMCG",
  "Education", "Healthcare", "Travel & Hospitality", "Food & Beverage", "Services", "Other",
];

const norm = (segment?: string | null) => (segment || "").trim().toLowerCase();

// Property unlocks the listings e-catalog. Matched loosely so orgs whose industry
// was typed freehand before it became a dropdown ("Property", "Real Estate") keep
// the feature. Mirrors isPropertyIndustry() in services/gateway/listings.go.
export function isPropertySegment(segment?: string | null): boolean {
  const s = norm(segment);
  return s === "property / real estate" || s.includes("propert") || s.includes("real estate");
}

// Unset/empty behaves as automotive (the prior, native behaviour).
export function isAutomotive(segment?: string | null): boolean {
  const s = norm(segment);
  return s === "" || s === "automotive";
}

export function segmentFields(segment?: string | null): SegmentField[] {
  // Unset/empty segment behaves as automotive (the prior, native default).
  return SEGMENT_SCHEMAS[norm(segment) || "automotive"] || [];
}
