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

/** Bevorzugt: Preise der letzten 48 h. Älter als 7 Tage gelten als veraltet. */
const PREFERRED_MS = 2 * 24 * 60 * 60 * 1000;
const FRESH_MS = 7 * 24 * 60 * 60 * 1000;
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

/** Mapapump-Zeiten ohne TZ → als Mitteleuropa lesen (CET/CEST grob). */
function parseLocalTs(raw: string | null | undefined): string {
  if (!raw) return new Date().toISOString();
  const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const month = Number(m[2]);
    const offset = month >= 4 && month <= 10 ? "+02:00" : "+01:00";
    const sec = m[6] ?? "00";
    const t = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${sec}${offset}`);
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  const t = Date.parse(raw.replace(" ", "T"));
  return Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString();
}

function ageMs(iso: string, nowMs: number): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? nowMs - t : Number.POSITIVE_INFINITY;
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
    const age = ageMs(ts, nowMs);
    const stale = age > FRESH_MS;

    const hrefRaw = attr(card, "href") ?? "";
    const overlay =
      card.match(/class="[^"]*station-card__overlay[^"]*"[^>]*href="([^"]+)"/i)?.[1] ??
      card.match(/href="(\/stanice\/[^"]+)"/i)?.[1] ??
      "";
    const hrefPath = hrefRaw || overlay;
    const name = inner(card, "station-name") || inner(card, "station-brand") || "Tankstelle";
    const address = inner(card, "station-address");

    out.push({
      name,
      address,
      lat,
      lng,
      priceKc,
      timestamp: ts,
      href: hrefPath.startsWith("http")
        ? hrefPath
        : hrefPath
          ? `https://mapapump.cz${hrefPath}`
          : "",
      stale,
    });
  }
  return out;
}

/** Frische zuerst (48 h), sonst bis 7 Tage, sonst alles – dann günstigster Preis. */
export function pickFreshPool(
  offers: CzStationOffer[],
  limit: number,
  nowMs = Date.now(),
): CzStationOffer[] {
  if (!offers.length || limit <= 0) return [];
  const recent = offers.filter((o) => ageMs(o.timestamp, nowMs) <= PREFERRED_MS);
  const week = offers.filter((o) => !o.stale);
  const pool = (recent.length ? recent : week.length ? week : offers).slice();
  pool.sort(
    (a, b) =>
      a.priceKc - b.priceKc ||
      ageMs(a.timestamp, nowMs) - ageMs(b.timestamp, nowMs),
  );
  return pool.slice(0, limit);
}

export function pickCheapest(offers: CzStationOffer[]): CzStationOffer | null {
  const pool = pickFreshPool(offers, 1);
  return pool[0] ?? null;
}

/** Aktuelleren Preis von der Stations-Detailseite lesen (Listenalter oft veraltet). */
export function parseStationDetail(
  html: string,
  fuelType: string,
): { priceKc: number; timestamp: string } | null {
  const key = fuelKey(fuelType);
  const agesBlocks = [...html.matchAll(/data-price-ages="([^"]*)"/gi)].map((m) =>
    decodeEntities(m[1]!),
  );
  const pricesBlocks = [...html.matchAll(/data-prices="([^"]*)"/gi)].map((m) =>
    decodeEntities(m[1]!),
  );

  let priceKc: number | null = null;
  let ageRaw: string | null = null;

  for (const raw of pricesBlocks) {
    try {
      const prices = JSON.parse(raw) as Record<string, string | number | null>;
      const v = prices[key];
      if (v != null && v !== "") {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 10 && n <= 80) {
          priceKc = n;
          break;
        }
      }
    } catch {
      /* weiter */
    }
  }
  for (const raw of agesBlocks) {
    try {
      const ages = JSON.parse(raw) as Record<string, string | null>;
      if (ages[key]) {
        ageRaw = ages[key];
        break;
      }
    } catch {
      /* weiter */
    }
  }

  if (priceKc == null) {
    const label = key === "diesel" ? "Nafta" : "Natural 95";
    const m = html.match(
      new RegExp(
        `price-card--${key === "diesel" ? "diesel" : "natural95"}[\\s\\S]*?data-czk="([\\d.]+)"`,
        "i",
      ),
    ) ?? html.match(
      new RegExp(`${label}[\\s\\S]{0,80}?data-czk="([\\d.]+)"`, "i"),
    );
    if (m) priceKc = Number(m[1]);
  }
  if (priceKc == null || !Number.isFinite(priceKc) || priceKc < 10 || priceKc > 80) {
    return null;
  }
  return { priceKc, timestamp: parseLocalTs(ageRaw) };
}

export async function fetchStationDetailPrice(
  href: string,
  fuelType: string,
): Promise<{ priceKc: number; timestamp: string } | null> {
  if (!href.startsWith("https://mapapump.cz/")) return null;
  const res = await fetch(href, {
    headers: {
      "User-Agent": "Tank-Check/1.0 (personal)",
      Accept: "text/html",
    },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) return null;
  return parseStationDetail(await res.text(), fuelType);
}

/** Mehrere Detailseiten parallel – frischt Listenpreise nach. */
export async function refreshStationsFromDetail(
  stations: CzStationOffer[],
  fuelType: string,
): Promise<CzStationOffer[]> {
  const results = await Promise.all(
    stations.map(async (s) => {
      if (!s.href) return s;
      try {
        const detail = await fetchStationDetailPrice(s.href, fuelType);
        if (!detail) return s;
        const stale = ageMs(detail.timestamp, Date.now()) > FRESH_MS;
        return {
          ...s,
          priceKc: detail.priceKc,
          timestamp: detail.timestamp,
          stale,
        };
      } catch {
        return s;
      }
    }),
  );
  return results;
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
      ? `Stationspreis ${fuel}, Stand älter als 7 Tage – vor Ort prüfen.`
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
