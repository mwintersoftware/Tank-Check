/** Öffnungszeiten: Betreiber schnell, Overpass gebündelt für alle Stationen. */

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

export type OpeningHoursTarget = {
  lat: number;
  lng: number;
  name?: string;
  address?: string;
};

const cache = new Map<string, { expires: number; value: string | null }>();
const TTL_OK_MS = 6 * 60 * 60 * 1000;
const TTL_MISS_MS = 90_000;

const OVERPASS_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

const BRAND_TIMEOUT_MS = 5_000;
const OVERPASS_TIMEOUT_MS = 12_000;
const BATCH_BUDGET_MS = 14_000;
const MATCH_RADIUS_M = 450;

function cacheKey(t: OpeningHoursTarget): string {
  const h = `${t.name || ""}|${t.address || ""}`.toLowerCase().slice(0, 80);
  return `oh:${t.lat.toFixed(4)},${t.lng.toFixed(4)}:${h}`;
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
  if (blob.includes("cheb") || blob.includes("svaty kriz") || blob.includes("svaty-kriz")) {
    urls.push("https://www.one1.eu/de/svaty-kriz");
  }
  if (blob.includes("folmava") || blob.includes("ceska kubice") || blob.includes("kubice")) {
    urls.push("https://www.one1.eu/de/ceska-kubice");
  }
  if (blob.includes("rozvadov") && urls.length === 0) {
    urls.push(
      "https://www.one1.eu/de/rozvadov-d5-smer-nemecko",
      "https://www.one1.eu/de/rozvadov-d5-smer-praha",
      "https://www.one1.eu/de/rozvadov-i",
      "https://www.one1.eu/de/rozvadov-ii",
    );
  }
  return [...new Set(urls)];
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
        signal: AbortSignal.timeout(BRAND_TIMEOUT_MS),
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
  maxM = MATCH_RADIUS_M,
): string | null {
  let best: { dist: number; hours: string } | null = null;
  for (const e of elements) {
    const raw = e.tags?.opening_hours?.trim();
    if (!raw) continue;
    const elat = e.lat ?? e.center?.lat;
    const elng = e.lon ?? e.center?.lon;
    if (elat == null || elng == null) continue;
    const dist = haversineM(lat, lng, elat, elng);
    if (dist > maxM) continue;
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
    signal: AbortSignal.timeout(OVERPASS_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const data = (await res.json()) as { elements?: OsmElement[] };
  return data.elements ?? [];
}

/** Ein Overpass-Call für alle Stationen statt N Einzelabfragen. */
async function fetchOverpassBatch(targets: OpeningHoursTarget[]): Promise<OsmElement[]> {
  if (!targets.length) return [];
  const parts = targets
    .map(
      (t) =>
        `node(around:${MATCH_RADIUS_M},${t.lat},${t.lng})["amenity"="fuel"];` +
        `way(around:${MATCH_RADIUS_M},${t.lat},${t.lng})["amenity"="fuel"];`,
    )
    .join("");
  const query = `[out:json][timeout:10];(${parts});out tags center;`;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const elements = await fetchOverpassOnce(endpoint, query);
      if (elements.length) return elements;
    } catch {
      /* nächster Spiegel */
    }
  }
  return [];
}

function remember(t: OpeningHoursTarget, value: string | null): void {
  cache.set(cacheKey(t), {
    expires: Date.now() + (value ? TTL_OK_MS : TTL_MISS_MS),
    value,
  });
}

/**
 * Öffnungszeiten für viele Stationen:
 * 1) Cache
 * 2) Betreiberseiten parallel (schnell)
 * 3) ein gebündelter Karten-Abruf nur für Lücken
 * Gesamtes Zeitbudget begrenzt die Wartezeit.
 */
export async function fetchOpeningHoursBatch(
  targets: OpeningHoursTarget[],
): Promise<(string | null)[]> {
  if (!targets.length) return [];

  const out: (string | null)[] = targets.map(() => null);
  const needIdx: number[] = [];

  for (let i = 0; i < targets.length; i++) {
    const hit = cache.get(cacheKey(targets[i]!));
    if (hit && Date.now() < hit.expires) {
      out[i] = hit.value;
    } else {
      needIdx.push(i);
    }
  }
  if (!needIdx.length) return out;

  const started = Date.now();
  const budgetLeft = () => Math.max(0, BATCH_BUDGET_MS - (Date.now() - started));

  const brandJobs = needIdx.map(async (i) => {
    const hours = await fetchOne1Hours(targets[i]);
    if (hours) {
      out[i] = hours;
      remember(targets[i]!, hours);
    }
  });
  await Promise.all(brandJobs);

  const stillNeed = needIdx.filter((i) => !out[i]);
  if (!stillNeed.length || budgetLeft() < 1_500) return out;

  const osmPromise = fetchOverpassBatch(stillNeed.map((i) => targets[i]!));
  const elements = await Promise.race([
    osmPromise,
    new Promise<OsmElement[]>((resolve) =>
      setTimeout(() => resolve([]), budgetLeft()),
    ),
  ]);

  for (const i of stillNeed) {
    if (out[i]) continue;
    const t = targets[i]!;
    const hours = pickNearestHours(elements, t.lat, t.lng);
    out[i] = hours;
    remember(t, hours);
  }
  return out;
}

export async function fetchOpeningHoursNear(
  lat: number,
  lng: number,
  hint?: OpeningHoursHint,
): Promise<string | null> {
  const [one] = await fetchOpeningHoursBatch([
    { lat, lng, name: hint?.name, address: hint?.address },
  ]);
  return one ?? null;
}
