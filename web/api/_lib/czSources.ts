/** Kostenlose CZ-Preise: Tagesmittel (Seite) → EU-Wochenbulletin → ČSÚ. */

export type CzParsed = {
  priceKc: number;
  timestamp: string;
  source: string;
  kind: "average" | "ceiling";
  stationName: string;
  note: string;
};

function parseCzDate(raw: string): string {
  const m = raw.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (!m) return new Date().toISOString();
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}T12:00:00Z`;
}

export function parseMapapumpPage(html: string, fuelType: string): CzParsed {
  const fuel = fuelType.toLowerCase();
  const label = fuel === "diesel" ? "Nafta" : "Natural 95";
  const card = html.match(
    new RegExp(
      `price-card__label">${label}</div>\\s*<div class="price-card__val"><span data-czk="([\\d.]+)"`,
      "i",
    ),
  );
  if (!card) throw new Error(`Kein ${label}-Tagesmittel auf der CZ-Übersicht`);
  const priceKc = Number(card[1]);
  if (!Number.isFinite(priceKc) || priceKc < 10 || priceKc > 80) {
    throw new Error("Unplausibles CZ-Tagesmittel");
  }
  const stand = html.match(/Aktualizováno\s+(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})/i);
  const display = label === "Nafta" ? "Nafta" : "Natural 95";
  return {
    priceKc,
    timestamp: parseCzDate(stand?.[1] ?? ""),
    source: "Tagesmittel CZ-Stationen",
    kind: "average",
    stationName: `Ø ${display}`,
    note: "Tägliches Mittel gemeldeter Stationspreise; vor Ort kann es abweichen.",
  };
}

export function parseFuelwideCz(
  data: {
    observations?: Array<{
      fuelType: string;
      price: number;
      currency: string;
      observedAt?: string;
      attribution?: string;
    }>;
  },
  fuelType: string,
  kcPerEur: number,
): CzParsed {
  const want = fuelType.toLowerCase() === "diesel" ? "diesel" : "petrol95";
  const obs = (data.observations ?? []).find((o) => o.fuelType === want);
  if (!obs || !(obs.price > 0)) throw new Error("Kein EU-Wochenpreis für CZ");
  const eur = obs.currency === "EUR" ? obs.price : obs.price / kcPerEur;
  const priceKc = eur * kcPerEur;
  const display = want === "diesel" ? "Nafta" : "Natural 95";
  return {
    priceKc,
    timestamp: `${obs.observedAt || new Date().toISOString().slice(0, 10)}T00:00:00Z`,
    source: "Weekly Oil Bulletin (EU)",
    kind: "average",
    stationName: `Ø ${display}`,
    note: "Wöchentlicher Landesdurchschnitt der EU-Kommission.",
  };
}

export async function fetchMapapumpAverage(fuelType: string): Promise<CzParsed> {
  const res = await fetch("https://mapapump.cz/ceny", {
    headers: {
      "User-Agent": "Tank-Check/1.0 (personal)",
      Accept: "text/html",
    },
  });
  if (!res.ok) throw new Error(`CZ-Tagesübersicht nicht erreichbar (${res.status})`);
  return parseMapapumpPage(await res.text(), fuelType);
}

export async function fetchFuelwideCz(fuelType: string, kcPerEur: number): Promise<CzParsed> {
  const res = await fetch("https://fuelwide.com/api/fuel-prices/czechia", {
    headers: { "User-Agent": "Tank-Check/1.0 (personal)", Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`EU-Wochenbulletin nicht erreichbar (${res.status})`);
  return parseFuelwideCz((await res.json()) as Parameters<typeof parseFuelwideCz>[0], fuelType, kcPerEur);
}

export async function fetchFuelwideDe(fuelType: string): Promise<{
  priceEur: number;
  timestamp: string;
  source: string;
  stationName: string;
  note: string;
}> {
  const res = await fetch("https://fuelwide.com/api/fuel-prices/germany", {
    headers: { "User-Agent": "Tank-Check/1.0 (personal)", Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`EU-Wochenbulletin DE nicht erreichbar (${res.status})`);
  const data = (await res.json()) as {
    observations?: Array<{ fuelType: string; price: number; observedAt?: string }>;
  };
  const want = fuelType.toLowerCase() === "diesel" ? "diesel" : "petrol95";
  const obs = (data.observations ?? []).find((o) => o.fuelType === want);
  if (!obs || !(obs.price > 0)) throw new Error("Kein EU-Wochenpreis für DE");
  return {
    priceEur: obs.price,
    timestamp: `${obs.observedAt || new Date().toISOString().slice(0, 10)}T00:00:00Z`,
    source: "Weekly Oil Bulletin (EU)",
    stationName: "Ø Deutschland",
    note: "Wöchentlicher Landesdurchschnitt der EU-Kommission (kein Stationspreis).",
  };
}
