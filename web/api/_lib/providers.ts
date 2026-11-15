import type { PriceKind } from "../../shared/types.js";

export type PriceQuote = {
  price: number;
  currency: "EUR" | "CZK";
  fuelType: string;
  source: string;
  timestamp: string;
  kind: PriceKind;
  stationName?: string;
  address?: string;
  openingHours?: string;
  isOpen?: boolean;
  lat?: number;
  lng?: number;
  note?: string;
};

export type FxQuote = {
  kcPerEur: number;
  source: string;
  timestamp: string;
};

export type RouteResult = {
  distanceKm: number;
  durationH: number;
  source: string;
};

const cache = new Map<string, { expires: number; value: unknown }>();
const TTL_MS = 5 * 60 * 1000;

function cacheGet<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    cache.delete(key);
    return null;
  }
  return hit.value as T;
}

function cacheSet(key: string, value: unknown): void {
  cache.set(key, { expires: Date.now() + TTL_MS, value });
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "User-Agent": "Tank-Check/1.0 (personal)",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchEurCzk(): Promise<FxQuote> {
  const cached = cacheGet<FxQuote>("fx:eur_czk");
  if (cached) return cached;
  const data = (await fetchJson("https://api.frankfurter.dev/v2/rate/eur/czk")) as {
    rate: number;
    date: string;
  };
  const quote: FxQuote = {
    kcPerEur: Number(data.rate),
    source: "frankfurter.dev",
    timestamp: `${data.date}T00:00:00Z`,
  };
  cacheSet("fx:eur_czk", quote);
  return quote;
}

async function fetchDeFallback(fuelType: string): Promise<PriceQuote> {
  const { fetchDeFromCityPage } = await import("./deFallback.js");
  const { safeCitySlug } = await import("../../shared/validate.js");
  const city = safeCitySlug(process.env.DE_PRICE_CITY);
  const fb = await fetchDeFromCityPage(city, fuelType);
  return {
    price: fb.price,
    currency: "EUR",
    fuelType: fuelType.toLowerCase(),
    source: fb.source,
    timestamp: fb.timestamp,
    kind: "station",
    stationName: fb.stationName,
    note: fb.note,
  };
}

export async function fetchDeCheapest(
  lat: number,
  lng: number,
  radiusKm: number,
  fuelType: string,
): Promise<PriceQuote> {
  const fuel = fuelType.toLowerCase();
  const key = process.env.TANKERKOENIG_API_KEY || process.env.TANKERKOENIG_KEY;
  if (!key) {
    const cacheKey = `de:fallback:${fuel}`;
    const cached = cacheGet<PriceQuote>(cacheKey);
    if (cached) return cached;
    try {
      const quote = await fetchDeFallback(fuel);
      cacheSet(cacheKey, quote);
      return quote;
    } catch {
      const { fetchFuelwideDe } = await import("./czSources.js");
      const fw = await fetchFuelwideDe(fuel);
      const quote: PriceQuote = {
        price: fw.priceEur,
        currency: "EUR",
        fuelType: fuel,
        source: fw.source,
        timestamp: fw.timestamp,
        kind: "average",
        stationName: fw.stationName,
        note: fw.note,
      };
      cacheSet(cacheKey, quote);
      return quote;
    }
  }

  const cacheKey = `de:${lat.toFixed(4)}:${lng.toFixed(4)}:${radiusKm}:${fuel}`;
  const cached = cacheGet<PriceQuote>(cacheKey);
  if (cached) return cached;

  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      rad: String(Math.min(radiusKm, 25)),
      type: fuel,
      sort: "price",
      apikey: key,
    });
    const data = (await fetchJson(
      `https://creativecommons.tankerkoenig.de/json/list.php?${params}`,
    )) as {
      ok: boolean;
      message?: string;
      stations?: Array<{
        id?: string;
        brand?: string;
        name?: string;
        street?: string;
        houseNumber?: string;
        place?: string;
        postCode?: string;
        price?: number;
        isOpen?: boolean;
        lat?: number;
        lng?: number;
      }>;
    };
    if (!data.ok) throw new Error(data.message || "Preisabfrage Deutschland fehlgeschlagen");

    const open = (data.stations ?? []).filter(
      (s) => s.isOpen && typeof s.price === "number" && s.price > 0,
    );
    if (!open.length) throw new Error("Keine geöffnete Tankstelle mit Preis im Umkreis");

    const best = open.reduce((a, b) => ((a.price ?? 999) <= (b.price ?? 999) ? a : b));
    const stationName = `${best.brand || best.name || "Tankstelle"} ${best.place || ""}`.trim();
    const address = [best.street, best.houseNumber, best.postCode, best.place]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    let openingHours: string | undefined;
    if (best.id) {
      openingHours =
        (await fetchDeStationHours(best.id, key)) ??
        (best.lat != null && best.lng != null
          ? (await fetchOpeningHoursCached(best.lat, best.lng)) ?? undefined
          : undefined);
    } else if (best.lat != null && best.lng != null) {
      openingHours = (await fetchOpeningHoursCached(best.lat, best.lng)) ?? undefined;
    }
    const quote: PriceQuote = {
      price: Number(best.price),
      currency: "EUR",
      fuelType: fuel,
      source: "MTS-K / Tankerkönig",
      timestamp: new Date().toISOString(),
      kind: "station",
      stationName,
      address: address || undefined,
      openingHours,
      isOpen: best.isOpen,
      lat: best.lat,
      lng: best.lng,
    };
    cacheSet(cacheKey, quote);
    return quote;
  } catch {
    return fetchDeFallback(fuel);
  }
}

async function fetchOpeningHoursCached(
  lat: number,
  lng: number,
  hint?: { name?: string; address?: string },
): Promise<string | null> {
  const { fetchOpeningHoursNear } = await import("./openingHours.js");
  return fetchOpeningHoursNear(lat, lng, hint);
}

async function fetchDeStationHours(
  stationId: string,
  apikey: string,
): Promise<string | null> {
  const cacheKey = `de:hours:${stationId}`;
  const cached = cacheGet<{ v: string | null }>(cacheKey);
  if (cached) return cached.v;
  try {
    const params = new URLSearchParams({ id: stationId, apikey });
    const data = (await fetchJson(
      `https://creativecommons.tankerkoenig.de/json/detail.php?${params}`,
    )) as {
      ok?: boolean;
      station?: {
        openingTimes?: {
          text?: string[];
          openNow?: boolean;
        };
      };
    };
    const lines = data.station?.openingTimes?.text?.filter(Boolean) ?? [];
    const value = lines.length ? lines.join("; ") : null;
    cacheSet(cacheKey, { v: value });
    return value;
  } catch {
    cacheSet(cacheKey, { v: null });
    return null;
  }
}

export async function fetchOpeningHours(
  lat: number,
  lng: number,
  hint?: { name?: string; address?: string },
): Promise<string | null> {
  return fetchOpeningHoursCached(lat, lng, hint);
}

export async function fetchCzStations(
  cityPath: string,
  fuelType: string,
): Promise<
  Array<{
    name: string;
    address: string;
    lat: number;
    lng: number;
    priceKc: number;
    timestamp: string;
    href: string;
    stale: boolean;
  }>
> {
  const fuel = fuelType.toLowerCase();
  const cacheKey = `cz:stations:${cityPath}:${fuel}`;
  const cached = cacheGet<Awaited<ReturnType<typeof fetchCzStations>>>(cacheKey);
  if (cached) return cached;
  const { fetchCityStations } = await import("./czStations.js");
  const list = await fetchCityStations(cityPath, fuel);
  cacheSet(cacheKey, list);
  return list;
}

export async function fetchCzPrice(fuelType: string): Promise<PriceQuote> {
  const fuel = fuelType.toLowerCase();
  const cacheKey = `cz:best:${fuel}`;
  const cached = cacheGet<PriceQuote>(cacheKey);
  if (cached) return cached;

  try {
    const { fetchMapapumpAverage } = await import("./czSources.js");
    const p = await fetchMapapumpAverage(fuel);
    const quote: PriceQuote = {
      price: p.priceKc,
      currency: "CZK",
      fuelType: fuel,
      source: p.source,
      timestamp: p.timestamp,
      kind: p.kind,
      stationName: p.stationName,
      note: p.note,
    };
    cacheSet(cacheKey, quote);
    return quote;
  } catch {
    // nächste kostenlose Quelle
  }

  try {
    const fx = await fetchEurCzk();
    const { fetchFuelwideCz } = await import("./czSources.js");
    const p = await fetchFuelwideCz(fuel, fx.kcPerEur);
    const quote: PriceQuote = {
      price: p.priceKc,
      currency: "CZK",
      fuelType: fuel,
      source: p.source,
      timestamp: p.timestamp,
      kind: p.kind,
      stationName: p.stationName,
      note: p.note,
    };
    cacheSet(cacheKey, quote);
    return quote;
  } catch {
    // nächste kostenlose Quelle
  }

  const quote = await fetchCsuAverage(fuel);
  cacheSet(cacheKey, quote);
  return quote;
}

export async function fetchCsuAverage(fuelType: string): Promise<PriceQuote> {
  const fuel = fuelType.toLowerCase();
  const marker = fuel === "diesel" ? "nafta" : "Natural 95";
  const cacheKey = `cz:csu:${fuel}`;
  const cached = cacheGet<PriceQuote>(cacheKey);
  if (cached) return cached;

  const res = await fetch("https://data.csu.gov.cz/opendata/sady/CENPHMT/distribuce/csv", {
    headers: { "User-Agent": "Tank-Check/1.0 (personal)" },
  });
  if (!res.ok) throw new Error(`ČSÚ nicht erreichbar (${res.status})`);
  const text = await res.text();
  const lines = text.split(/\r?\n/);
  const header = lines[0]?.split(",") ?? [];
  const idx = (name: string) =>
    header.findIndex((h) => h.replaceAll('"', "") === name);

  const iType = idx("IndicatorType");
  const iDruh = idx("Druh PHM");
  const iCast = idx("CASTPHM");
  const iVal = idx("Hodnota");
  if (iType < 0 || iDruh < 0 || iCast < 0 || iVal < 0) {
    throw new Error("ČSÚ-CSV-Format unerwartet");
  }

  const rows: Array<{ cast: string; value: number; druh: string }> = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    // einfaches CSV-Split mit Anführungszeichen
    const cols = line.match(/("([^"]*)"|[^,]+)/g)?.map((c) => c.replace(/^"|"$/g, "")) ?? [];
    if ((cols[iType] || "").trim() !== "6621T") continue;
    const druh = cols[iDruh] || "";
    if (!druh.toLowerCase().includes(marker.toLowerCase())) continue;
    const cast = (cols[iCast] || "").trim();
    const value = Number((cols[iVal] || "").replace(",", "."));
    if (!cast || !Number.isFinite(value)) continue;
    rows.push({ cast, value, druh });
  }
  if (!rows.length) throw new Error("Keine ČSÚ-Preise gefunden");
  rows.sort((a, b) => a.cast.localeCompare(b.cast));
  const last = rows[rows.length - 1];
  const [y, w] = last.cast.split("-W");
  const monday = isoWeekToDate(Number(y), Number(w));
  const label = last.druh.includes("95") ? "Ø Natural 95" : "Ø Nafta";
  const quote: PriceQuote = {
    price: last.value,
    currency: "CZK",
    fuelType: fuel,
    source: "ČSÚ",
    timestamp: monday.toISOString(),
    kind: "average",
    stationName: label,
    note: "Landesdurchschnitt; Preis vor Ort kann abweichen",
  };
  cacheSet(cacheKey, quote);
  return quote;
}

function isoWeekToDate(year: number, week: number): Date {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay();
  const monday = simple;
  if (dow <= 4) monday.setUTCDate(simple.getUTCDate() - simple.getUTCDay() + 1);
  else monday.setUTCDate(simple.getUTCDate() + 8 - simple.getUTCDay());
  return monday;
}

export function manualCzPrice(preisKc: number, fuelType: string): PriceQuote {
  return {
    price: preisKc,
    currency: "CZK",
    fuelType: fuelType.toLowerCase(),
    source: "manuell",
    timestamp: new Date().toISOString(),
    kind: "manual",
    stationName: "Manueller Preis",
    note: "Manuell eingegeben",
  };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = 6371;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dphi = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dphi / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

export async function routeDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): Promise<RouteResult> {
  const cacheKey = `route:${lat1.toFixed(4)},${lng1.toFixed(4)}:${lat2.toFixed(4)},${lng2.toFixed(4)}`;
  const cached = cacheGet<RouteResult>(cacheKey);
  if (cached) return cached;

  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${lng1},${lat1};${lng2},${lat2}?overview=false`;
    const data = (await fetchJson(url)) as {
      code: string;
      routes?: Array<{ distance: number; duration: number }>;
    };
    if (data.code === "Ok" && data.routes?.[0]) {
      const result: RouteResult = {
        distanceKm: data.routes[0].distance / 1000,
        durationH: data.routes[0].duration / 3600,
        source: "OSRM",
      };
      cacheSet(cacheKey, result);
      return result;
    }
  } catch {
    // Fallback unten
  }

  const air = haversineKm(lat1, lng1, lat2, lng2);
  const approx: RouteResult = {
    distanceKm: air * 1.3,
    durationH: (air * 1.3) / 80,
    source: "Schätzung (Luftlinie×1,3)",
  };
  cacheSet(cacheKey, approx);
  return approx;
}
