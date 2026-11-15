/** Öffnungszeiten nahe einer Tankstelle (Karten-Daten + Betreiberseite). */

type OsmElement = {
  type?: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

export type OpeningHoursHint = {
  name?: string;
  address?: string;
};

const cache = new Map<string, { expires: number; value: string | null }>();
const TTL_OK_MS = 6 * 60 * 60 * 1000;
const TTL_MISS_MS = 60_000;

const OVERPASS_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

function cacheKey(lat: number, lng: number, hint?: OpeningHoursHint): string {
  const h = `${hint?.name || ""}|${hint?.address || ""}`.toLowerCase().slice(0, 80);
  return `oh:${lat.toFixed(4)},${lng.toFixed(4)}:${h}`;
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = 6371000;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dphi = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dphi / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

/** 24/7 und OSM-Rohwerte etwas lesbarer. */
export function humanizeOpeningHours(raw: string): string {
  const s = raw.replace(/\s+/g, " ").trim();
  if (/^24\/7$/i.test(s) || /^non-?stop$/i.test(s)) return "Nonstop (24/7)";
  if (/nonstop/i.test(s) && !/\d/.test(s)) return "Nonstop (24/7)";
  return s;
}

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ß/g, "ss");
}

/** One1-Betreiberseiten an der Grenze – oft zuverlässiger als Karten-Tags. */
function one1StationUrls(hint?: OpeningHoursHint): string[] {
  const blob = fold(`${hint?.name || ""} ${hint?.address || ""}`);
  if (!/(?:^|[^a-z])(?:one\s*1|one1|free\s*1|free1)(?:[^a-z]|$)/.test(blob)) {
    return [];
  }
  const urls: string[] = [];
  if (blob.includes("rozvadov") && (blob.includes("nemecko") || blob.includes("deutschland"))) {
    urls.push("https://www.one1.eu/de/rozvadov-d5-smer-nemecko");
  }
  if (blob.includes("rozvadov") && (blob.includes("praha") || blob.includes("plzen"))) {
    urls.push("https://www.one1.eu/de/rozvadov-d5-smer-praha");
  }
  if (blob.includes("rozvadov") && urls.length === 0) {
    urls.push(
      "https://www.one1.eu/de/rozvadov-d5-smer-nemecko",
      "https://www.one1.eu/de/rozvadov-d5-smer-praha",
      "https://www.one1.eu/de/rozvadov-i",
      "https://www.one1.eu/de/rozvadov-ii",
    );
  }
  return urls;
}

function parseOne1Hours(html: string): string | null {
  const ul = html.match(/<ul[^>]*class="[^"]*Detail-timetable[^"]*"[^>]*>[\s\S]*?<\/ul>/i)?.[0];
  if (ul) {
    const items = [...ul.matchAll(/<li\b[\s\S]*?<\/li>/gi)].map((m) => m[0]);
    if (items.length >= 5) {
      const allNonstop = items.every((li) => /Non-?stop|24\s*\/\s*7|24\s*h/i.test(li));
      if (allNonstop) return "Nonstop (24/7)";
      const lines = items.slice(0, 7).map((li) => {
        const day =
          li.match(
            /(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag|Pondělí|Úterý|Středa|Čtvrtek|Pátek|Sobota|Neděle)/i,
          )?.[1] ?? "";
        const span = li.match(/<span[^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? "";
        const hours = span
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .replace(/Heute\s+geöffnet\s+/i, "")
          .trim();
        return `${day} ${hours}`.trim();
      });
      return lines.filter(Boolean).join("; ");
    }
  }
  if (/Detail-timetable[\s\S]{0,800}Nonstop/i.test(html)) return "Nonstop (24/7)";
  return null;
}

async function fetchOne1Hours(hint?: OpeningHoursHint): Promise<string | null> {
  const urls = one1StationUrls(hint);
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Tank-Check/1.0 (personal)",
          Accept: "text/html",
        },
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) continue;
      const hours = parseOne1Hours(await res.text());
      if (hours) return humanizeOpeningHours(hours);
    } catch {
      /* nächste URL */
    }
  }
  return null;
}

function pickNearestHours(
  elements: OsmElement[],
  lat: number,
  lng: number,
): string | null {
  let best: { dist: number; hours: string } | null = null;
  for (const e of elements) {
    const raw = e.tags?.opening_hours?.trim();
    if (!raw) continue;
    const elat = e.lat ?? e.center?.lat;
    const elng = e.lon ?? e.center?.lon;
    const dist =
      elat != null && elng != null ? haversineM(lat, lng, elat, elng) : 99999;
    if (!best || dist < best.dist) best = { dist, hours: raw };
  }
  return best ? humanizeOpeningHours(best.hours) : null;
}

async function fetchOverpassOnce(
  endpoint: string,
  query: string,
): Promise<OsmElement[]> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": "Tank-Check/1.0 (personal)",
    },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(22_000),
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const data = (await res.json()) as { elements?: OsmElement[] };
  return data.elements ?? [];
}

async function fetchFromOverpass(lat: number, lng: number): Promise<string | null> {
  const query =
    `[out:json][timeout:20];` +
    `(node(around:400,${lat},${lng})["amenity"="fuel"];` +
    `way(around:400,${lat},${lng})["amenity"="fuel"];);out tags center 12;`;

  const errors: unknown[] = [];
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const elements = await fetchOverpassOnce(endpoint, query);
      const hours = pickNearestHours(elements, lat, lng);
      if (hours) return hours;
    } catch (err) {
      errors.push(err);
    }
  }
  if (errors.length) return null;
  return null;
}

export async function fetchOpeningHoursNear(
  lat: number,
  lng: number,
  hint?: OpeningHoursHint,
): Promise<string | null> {
  const key = cacheKey(lat, lng, hint);
  const hit = cache.get(key);
  if (hit && Date.now() < hit.expires) return hit.value;

  const [overpass, brand] = await Promise.all([
    fetchFromOverpass(lat, lng),
    fetchOne1Hours(hint),
  ]);

  // Betreiberseite bevorzugen, wenn vorhanden (aktueller als OSM)
  const value = brand || overpass;
  cache.set(key, {
    expires: Date.now() + (value ? TTL_OK_MS : TTL_MISS_MS),
    value,
  });
  return value;
}
