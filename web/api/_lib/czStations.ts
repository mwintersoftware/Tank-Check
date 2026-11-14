/** Öffentliche CZ-Stadtseiten: Stationskarten mit Kč-Preis, Koordinaten, Stand. */

export type CzStationOffer = {
  name: string;
  address: string;
  lat: number;
  lng: number;
  priceKc: number;
  timestamp: string;
  href: string;
  stale: boolean;
};

const FRESH_MS = 14 * 24 * 60 * 60 * 1000;
const SOURCE = "CZ-Stationskatalog";

function fuelKey(fuelType: string): "natural95" | "diesel" {
  return fuelType.toLowerCase() === "diesel" ? "diesel" : "natural95";
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseLocalTs(raw: string | null | undefined): string {
  if (!raw) return new Date().toISOString();
  const t = Date.parse(raw.replace(" ", "T"));
  return Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString();
}

function attr(block: string, name: string): string | null {
  const m = block.match(new RegExp(`\\b${name}="([^"]*)"`, "i"));
  return m ? decodeEntities(m[1]) : null;
}

function inner(block: string, cls: string): string {
  const m = block.match(new RegExp(`class="${cls}"[^>]*>([\\s\\S]*?)</div>`, "i"));
  return m ? stripTags(m[1]) : "";
}

function priceFromChips(block: string, key: "natural95" | "diesel"): number | null {
  const label = key === "diesel" ? "Nafta" : "Natural 95";
  const m = block.match(
    new RegExp(
      `price-chip__label">${label}<\\/span>[\\s\\S]*?data-czk="([\\d.]+)"`,
      "i",
    ),
  );
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function parseStationList(
  html: string,
  fuelType: string,
  nowMs = Date.now(),
): CzStationOffer[] {
  const key = fuelKey(fuelType);
  const cards = html.match(/<article\b[^>]*class="[^"]*\bstation-card\b[\s\S]*?<\/article>/gi) ?? [];
  const out: CzStationOffer[] = [];

  for (const card of cards) {
    const lat = Number(attr(card, "data-lat"));
    const lng = Number(attr(card, "data-lng"));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    let priceKc: number | null = null;
    let ageRaw: string | null = null;
    const pricesAttr = attr(card, "data-prices");
    const agesAttr = attr(card, "data-price-ages");
    if (pricesAttr) {
      try {
        const prices = JSON.parse(pricesAttr) as Record<string, string | null>;
        const raw = prices[key];
        if (raw != null && raw !== "") priceKc = Number(raw);
      } catch {
        /* Chip-Fallback */
      }
    }
    if (agesAttr) {
      try {
        const ages = JSON.parse(agesAttr) as Record<string, string | null>;
        ageRaw = ages[key];
      } catch {
        ageRaw = attr(card, "data-valid-at");
      }
    }
    if (priceKc == null) priceKc = priceFromChips(card, key);
    if (priceKc == null || !Number.isFinite(priceKc) || priceKc < 10 || priceKc > 80) continue;

    const ts = parseLocalTs(ageRaw ?? attr(card, "data-valid-at"));
    const age = nowMs - Date.parse(ts);
    const stale = Number.isFinite(age) ? age > FRESH_MS : true;

    const href = attr(card, "href") ?? "";
    const name = inner(card, "station-name") || inner(card, "station-brand") || "Tankstelle";
    const address = inner(card, "station-address");

    out.push({
      name,
      address,
      lat,
      lng,
      priceKc,
      timestamp: ts,
      href: href.startsWith("http") ? href : href ? `https://mapapump.cz${href}` : "",
      stale,
    });
  }
  return out;
}

export function pickCheapest(offers: CzStationOffer[]): CzStationOffer | null {
  const fresh = offers.filter((o) => !o.stale);
  const pool = fresh.length ? fresh : offers;
  if (!pool.length) return null;
  return pool.reduce((a, b) => (a.priceKc <= b.priceKc ? a : b));
}

export function stationQuote(best: CzStationOffer, fuelType: string) {
  const fuel = fuelType.toLowerCase() === "diesel" ? "Nafta" : "Natural 95";
  return {
    priceKc: best.priceKc,
    timestamp: best.timestamp,
    source: SOURCE,
    kind: "station" as const,
    stationName: `${best.name}${best.address ? `, ${best.address}` : ""}`,
    note: best.stale
      ? `Stationspreis ${fuel}, Stand älter als 14 Tage – vor Ort prüfen.`
      : `Stationspreis ${fuel}; vor Ort kann es abweichen.`,
    lat: best.lat,
    lng: best.lng,
  };
}

export async function fetchCityStations(
  cityPath: string,
  fuelType: string,
): Promise<CzStationOffer[]> {
  const palivo = fuelKey(fuelType);
  const url = `https://mapapump.cz/stanice/${cityPath}?palivo=${palivo}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Tank-Check/1.0 (personal)",
      Accept: "text/html",
    },
  });
  if (!res.ok) throw new Error(`CZ-Stadtseite nicht erreichbar (${res.status})`);
  return parseStationList(await res.text(), fuelType);
}
