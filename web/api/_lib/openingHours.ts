/** Öffnungszeiten nahe einer Tankstelle (Karten-Daten). */

type OsmElement = {
  tags?: Record<string, string>;
};

const cache = new Map<string, { expires: number; value: string | null }>();
const TTL_MS = 6 * 60 * 60 * 1000;

function cacheKey(lat: number, lng: number): string {
  return `oh:${lat.toFixed(4)},${lng.toFixed(4)}`;
}

/** Leichte Normalisierung; Mo–Su bleibt international lesbar. */
export function humanizeOpeningHours(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

export async function fetchOpeningHoursNear(
  lat: number,
  lng: number,
): Promise<string | null> {
  const key = cacheKey(lat, lng);
  const hit = cache.get(key);
  if (hit && Date.now() < hit.expires) return hit.value;

  const query =
    `[out:json][timeout:8];` +
    `(node(around:120,${lat},${lng})["amenity"="fuel"];` +
    `way(around:120,${lat},${lng})["amenity"="fuel"];);out tags 8;`;

  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "User-Agent": "Tank-Check/1.0 (personal)",
      },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!res.ok) {
      cache.set(key, { expires: Date.now() + 10 * 60 * 1000, value: null });
      return null;
    }
    const data = (await res.json()) as { elements?: OsmElement[] };
    const withHours = (data.elements ?? []).find((e) => e.tags?.opening_hours);
    const raw = withHours?.tags?.opening_hours?.trim() || null;
    const value = raw ? humanizeOpeningHours(raw) : null;
    cache.set(key, { expires: Date.now() + TTL_MS, value });
    return value;
  } catch {
    cache.set(key, { expires: Date.now() + 10 * 60 * 1000, value: null });
    return null;
  }
}
