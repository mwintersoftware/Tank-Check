/** Restaurants & Einkaufen in der Nähe – Overpass + Nominatim-Fallback. */

import { humanizeOpeningHours } from "./openingHours.js";

export type NearbyPlace = {
  kind: "restaurant" | "shop";
  name: string;
  openingHours?: string;
  phone?: string;
  website?: string;
  mapUrl: string;
  recommended: boolean;
  note?: string;
};

type OsmEl = {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

const ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

const cache = new Map<string, { expires: number; value: { restaurants: NearbyPlace[]; shops: NearbyPlace[] } }>();
const TTL_MS = 30 * 60 * 1000;

function mapLink(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;
}

function placeScore(tags: Record<string, string>): number {
  let s = 0;
  if (tags.phone || tags["contact:phone"]) s += 3;
  if (tags.opening_hours) s += 3;
  if (tags.website || tags["contact:website"]) s += 2;
  if (tags.cuisine) s += 1;
  const stars = Number(tags.stars || tags.rating);
  if (Number.isFinite(stars) && stars >= 4) s += 4;
  if (Number.isFinite(stars) && stars >= 3) s += 1;
  return s;
}

function fromOsm(el: OsmEl, kind: "restaurant" | "shop"): NearbyPlace | null {
  const tags = el.tags ?? {};
  const name = (tags.name || tags.brand || "").trim();
  if (!name) return null;
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (lat == null || lng == null) return null;
  const phone = (tags.phone || tags["contact:phone"] || "").trim() || undefined;
  const website = (tags.website || tags["contact:website"] || "").trim() || undefined;
  const hoursRaw = tags.opening_hours?.trim();
  const score = placeScore(tags);
  const stars = Number(tags.stars || tags.rating);
  const recommended = score >= 4 || (Number.isFinite(stars) && stars >= 4);
  return {
    kind,
    name,
    phone,
    website: website?.startsWith("http") ? website : undefined,
    openingHours: hoursRaw ? humanizeOpeningHours(hoursRaw) : undefined,
    mapUrl: mapLink(lat, lng),
    recommended,
    note: Number.isFinite(stars) && stars > 0 ? `${stars}★` : undefined,
  };
}

async function overpassOnce(endpoint: string, query: string): Promise<OsmEl[]> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": "Tank-Check/1.0 (personal)",
    },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(9_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { elements?: OsmEl[] };
  return data.elements ?? [];
}

/** Spiegel parallel – erster Treffer mit Daten gewinnt. */
async function overpass(query: string): Promise<OsmEl[]> {
  const jobs = ENDPOINTS.map((ep) => overpassOnce(ep, query));
  const settled = await Promise.allSettled(jobs);
  for (const s of settled) {
    if (s.status === "fulfilled" && s.value.length) return s.value;
  }
  for (const s of settled) {
    if (s.status === "fulfilled") return s.value;
  }
  return [];
}

function pickBest(places: NearbyPlace[], limit: number): NearbyPlace[] {
  const seen = new Set<string>();
  const out: NearbyPlace[] = [];
  const sorted = places.slice().sort((a, b) => {
    if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
    const sa = (a.phone ? 2 : 0) + (a.openingHours ? 2 : 0) + (a.website ? 1 : 0);
    const sb = (b.phone ? 2 : 0) + (b.openingHours ? 2 : 0) + (b.website ? 1 : 0);
    return sb - sa;
  });
  for (const p of sorted) {
    const key = `${p.kind}:${p.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

/** Nominatim: Suche nach Kategorie im Umkreis (Fallback wenn Overpass leer/langsam). */
async function nominatimAround(
  lat: number,
  lng: number,
  query: string,
  kind: "restaurant" | "shop",
): Promise<NearbyPlace[]> {
  const delta = 0.04; // ~4 km
  const viewbox = `${lng - delta},${lat + delta},${lng + delta},${lat - delta}`;
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8` +
    `&q=${encodeURIComponent(query)}` +
    `&viewbox=${viewbox}&bounded=1` +
    `&addressdetails=0&extratags=1`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Tank-Check/1.0 (personal; private use)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<{
      display_name?: string;
      name?: string;
      lat?: string;
      lon?: string;
      extratags?: Record<string, string>;
      type?: string;
      class?: string;
    }>;
    const out: NearbyPlace[] = [];
    for (const row of rows) {
      const name =
        (row.name || row.display_name?.split(",")[0] || "").trim();
      const plat = Number(row.lat);
      const plng = Number(row.lon);
      if (!name || !Number.isFinite(plat) || !Number.isFinite(plng)) continue;
      const tags = row.extratags ?? {};
      const phone = (tags.phone || tags["contact:phone"] || "").trim() || undefined;
      const website = (tags.website || tags["contact:website"] || "").trim();
      const hours = tags.opening_hours?.trim();
      out.push({
        kind,
        name,
        phone,
        website: website?.startsWith("http") ? website : undefined,
        openingHours: hours ? humanizeOpeningHours(hours) : undefined,
        mapUrl: mapLink(plat, plng),
        recommended: Boolean(phone || hours || website),
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Restaurants & Einkaufen nahe der Tankstelle (Radius ~4 km). */
export async function fetchNearbyPlaces(
  lat: number,
  lng: number,
): Promise<{ restaurants: NearbyPlace[]; shops: NearbyPlace[] }> {
  const key = `nb:${lat.toFixed(3)},${lng.toFixed(3)}`;
  const hit = cache.get(key);
  if (hit && Date.now() < hit.expires) return hit.value;

  const r = 4000;
  const query =
    `[out:json][timeout:8];(` +
    `nwr(around:${r},${lat},${lng})["amenity"~"^(restaurant|cafe|fast_food|biergarten|food_court)$"];` +
    `nwr(around:${r},${lat},${lng})["shop"~"^(supermarket|mall|department_store|convenience|bakery|kiosk)$"];` +
    `);out tags center 50;`;

  let elements: OsmEl[] = [];
  try {
    elements = await overpass(query);
  } catch {
    elements = [];
  }

  const restaurants: NearbyPlace[] = [];
  const shops: NearbyPlace[] = [];

  for (const el of elements) {
    const tags = el.tags ?? {};
    if (tags.amenity) {
      const p = fromOsm(el, "restaurant");
      if (p) restaurants.push(p);
    } else if (tags.shop) {
      const p = fromOsm(el, "shop");
      if (p) shops.push(p);
    }
  }

  // Fallback: Nominatim, wenn Overpass wenig liefert (Grenze oft dünn gemappt)
  if (restaurants.length < 2) {
    const extra = await nominatimAround(lat, lng, "restaurant", "restaurant");
    restaurants.push(...extra);
  }
  if (shops.length < 2) {
    const extra = await nominatimAround(lat, lng, "supermarket", "shop");
    shops.push(...extra);
  }

  const value = {
    restaurants: pickBest(restaurants, 4),
    shops: pickBest(shops, 4),
  };
  cache.set(key, { expires: Date.now() + TTL_MS, value });
  return value;
}
