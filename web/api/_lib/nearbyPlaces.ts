/** Restaurants & Einkaufen in der Nähe (Kartendaten: Telefon, Öffnung, Link). */

import { humanizeOpeningHours } from "./openingHours.js";

export type NearbyPlace = {
  kind: "restaurant" | "shop";
  name: string;
  openingHours?: string;
  phone?: string;
  website?: string;
  mapUrl: string;
  /** Qualität aus Vollständigkeit / Sterne-Tags (keine Fake-Bewertung). */
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

function mapLink(lat: number, lng: number, name: string): string {
  const q = encodeURIComponent(`${name} @ ${lat},${lng}`);
  return `https://www.openstreetmap.org/search?query=${q}#map=18/${lat}/${lng}`;
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
  if (tags.wheelchair === "yes") s += 1;
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
  const recommended = score >= 5 || (Number.isFinite(stars) && stars >= 4);
  return {
    kind,
    name,
    phone,
    website: website?.startsWith("http") ? website : undefined,
    openingHours: hoursRaw ? humanizeOpeningHours(hoursRaw) : undefined,
    mapUrl: mapLink(lat, lng, name),
    recommended,
    note: Number.isFinite(stars) && stars > 0 ? `${stars}★` : undefined,
  };
}

async function overpass(query: string): Promise<OsmEl[]> {
  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": "Tank-Check/1.0 (personal)",
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { elements?: OsmEl[] };
      return data.elements ?? [];
    } catch {
      /* nächster Spiegel */
    }
  }
  return [];
}

function pickBest(places: NearbyPlace[], limit: number): NearbyPlace[] {
  const seen = new Set<string>();
  const out: NearbyPlace[] = [];
  const sorted = places.slice().sort((a, b) => {
    if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
    return (b.phone ? 1 : 0) + (b.openingHours ? 1 : 0) - ((a.phone ? 1 : 0) + (a.openingHours ? 1 : 0));
  });
  for (const p of sorted) {
    const key = p.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

/** Restaurants (bevorzugt mit Telefon/Zeiten) und Einkaufen nahe der Tankstelle. */
export async function fetchNearbyPlaces(
  lat: number,
  lng: number,
): Promise<{ restaurants: NearbyPlace[]; shops: NearbyPlace[] }> {
  const r = 1200;
  const query =
    `[out:json][timeout:10];(` +
    `node(around:${r},${lat},${lng})["amenity"~"restaurant|cafe|fast_food|biergarten"];` +
    `way(around:${r},${lat},${lng})["amenity"~"restaurant|cafe|fast_food|biergarten"];` +
    `node(around:${r},${lat},${lng})["shop"~"supermarket|mall|department_store|convenience|bakery"];` +
    `way(around:${r},${lat},${lng})["shop"~"supermarket|mall|department_store|convenience|bakery"];` +
    `);out tags center 40;`;

  const elements = await overpass(query);
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

  // Empfohlene Restaurants zuerst; wenn zu wenige, trotzdem beste Vollständige
  const reco = restaurants.filter((p) => p.recommended);
  const restPool = reco.length >= 2 ? reco : restaurants;

  return {
    restaurants: pickBest(restPool, 3),
    shops: pickBest(shops, 3),
  };
}
