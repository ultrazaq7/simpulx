// Turn a Google Maps link into coordinates so admins never have to find latitude
// and longitude by hand. Full map URLs parse in the browser; short share links
// (maps.app.goo.gl) need the server to follow their redirect (see geo.go).

export type LatLng = { lat: number; lng: number };

// The place PIN (!3d/!4d) is the real marker and can differ from the map centre
// (@lat,lng), so it is checked first -- same order as the Go side.
const PATTERNS = [
  /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
  /@(-?\d+\.\d+),(-?\d+\.\d+)/,
  /[?&](?:q|query|ll|sll|center|destination)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,
  /^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/,
];

export function parseGoogleMapsCoords(input: string): LatLng | null {
  const s = (input || "").trim();
  for (const re of PATTERNS) {
    const m = s.match(re);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
  }
  return null;
}

export function isShortMapsLink(input: string): boolean {
  return /(?:maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)/i.test(input || "");
}

export function looksLikeMapsLink(input: string): boolean {
  return /google\.[a-z.]+\/maps|maps\.google|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(input || "");
}
