/** Zwischenlösung ohne Tankerkönig-Key: Ortsseite eines MTS-K-VID lesen. */

export type FallbackQuote = {
  price: number;
  stationName: string;
  timestamp: string;
  source: string;
  note: string;
};

const FUEL_PATH: Record<string, string> = {
  e10: "e10preise",
  e5: "benzinpreise",
  diesel: "dieselpreise",
};

function parseDeTimestamp(raw: string): string {
  // "08.11.2026, 10:20 Uhr"
  const m = raw.match(/(\d{2})\.(\d{2})\.(\d{4}),\s*(\d{1,2}):(\d{2})/);
  if (!m) return new Date().toISOString();
  const [, dd, mm, yyyy, hh, mi] = m;
  const iso = `${yyyy}-${mm}-${dd}T${hh.padStart(2, "0")}:${mi}:00`;
  return new Date(iso).toISOString();
}

export function parseCityPage(html: string, fuel: string): FallbackQuote {
  const best = html.match(
    /Bester Preis:\s*([\d]+[.,]\d{2,3})\s*Euro!?\s*\(Stand:\s*([^)]+)\)/i,
  );
  const cheapLi = html.match(/Günstigster Preis:\s*([\d]+[.,]\d{2,3})\s*€/i);
  const standLi = html.match(/Stand:\s*(\d{2}\.\d{2}\.\d{4},\s*\d{1,2}:\d{2}\s*Uhr)/i);
  const stationTitle = html.match(
    new RegExp(
      `${fuel === "e5" ? "(?:Super|Benzin|E5)" : fuel === "diesel" ? "Diesel" : "E10"}-Preis\\s+([^:]+):\\s*([\\d]+[.,]\\d{2,3})\\s*Euro`,
      "i",
    ),
  );

  let price: number | null = null;
  let stationName = "Günstigste Tankstelle vor Ort";
  let tsRaw = standLi?.[1] ?? "";

  if (best) {
    price = Number(best[1].replace(",", "."));
    tsRaw = best[2] || tsRaw;
  } else if (cheapLi) {
    price = Number(cheapLi[1].replace(",", "."));
  }

  if (stationTitle) {
    stationName = stationTitle[1].trim();
    if (price == null) price = Number(stationTitle[2].replace(",", "."));
  }

  // Stationen-Blöcke: <em title="...: 1.869 Euro">
  if (price == null) {
    const titles = [...html.matchAll(/title="[^"]*?([\d]+[.,]\d{2,3})\s*Euro"/gi)];
    const prices = titles
      .map((t) => Number(t[1].replace(",", ".")))
      .filter((n) => n > 0.5 && n < 5);
    if (prices.length) price = Math.min(...prices);
  }

  const nameMatch = html.match(
    /<strong class="isstrong">([^<]+Tankstelle[^<]*)<\/strong>/i,
  );
  if (nameMatch) stationName = nameMatch[1].trim();

  if (price == null || !Number.isFinite(price)) {
    throw new Error("Auf der Ortsseite keinen Spritpreis gefunden");
  }

  return {
    price,
    stationName,
    timestamp: parseDeTimestamp(tsRaw),
    source: "MTS-K (Verbraucher-Info, Zwischenlösung)",
    note: "Zwischenlösung ohne API-Key: Ortspreise eines zugelassenen Verbraucher-Informationsdienstes (MTS-K).",
  };
}

export async function fetchDeFromCityPage(
  citySlug: string,
  fuelType: string,
): Promise<FallbackQuote> {
  const fuel = fuelType.toLowerCase();
  const prefix = FUEL_PATH[fuel];
  if (!prefix) throw new Error(`Unbekannte Sorte: ${fuelType}`);

  const slug = citySlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 64);
  if (!slug) throw new Error("Ungültiger Ortsname");
  const url = `https://www.benzinpreis-aktuell.de/${prefix}-${slug}-heute`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Tank-Check/1.0 (personal)",
      Accept: "text/html",
    },
  });
  if (!res.ok) throw new Error(`Ortsseite nicht erreichbar (${res.status})`);
  const html = await res.text();
  return parseCityPage(html, fuel);
}
