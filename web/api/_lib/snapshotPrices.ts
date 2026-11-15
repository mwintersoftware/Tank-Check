/** Periodische Preissnapshots (DE + CZ-Stationen + Kurs). */

import { DEFAULT_CONFIG } from "../../shared/config.js";
import { insertSnapshots, type PriceSnapshotRow, dbConfigured } from "./priceDb.js";
import * as providers from "./providers.js";

const FUELS = ["e10", "e5", "diesel"] as const;

export type SnapshotResult = {
  ok: boolean;
  inserted: number;
  skipped?: string;
  error?: string;
};

export async function runPriceSnapshot(): Promise<SnapshotResult> {
  if (!dbConfigured()) {
    return { ok: false, inserted: 0, skipped: "DATABASE_URL fehlt" };
  }

  const cfg = DEFAULT_CONFIG;
  const rows: PriceSnapshotRow[] = [];

  try {
    const fx = await providers.fetchEurCzk();
    rows.push({
      region: "fx",
      fuelType: "eurczk",
      price: fx.kcPerEur,
      currency: "CZK",
      kind: "fx",
      source: fx.source,
      sourceTs: fx.timestamp,
      meta: { unit: "kc_per_eur" },
    });

    for (const fuel of FUELS) {
      try {
        const de = await providers.fetchDeCheapest(
          cfg.homeLat,
          cfg.homeLng,
          cfg.homeSearchRadiusKm,
          fuel,
        );
        rows.push({
          region: "de",
          fuelType: fuel,
          price: de.price,
          currency: "EUR",
          kind: de.kind,
          source: de.source,
          sourceTs: de.timestamp,
          lat: de.lat ?? cfg.homeLat,
          lng: de.lng ?? cfg.homeLng,
          stationKey:
            de.lat != null && de.lng != null
              ? `${de.lat.toFixed(5)},${de.lng.toFixed(5)}`
              : de.stationName ?? null,
          stationName: de.stationName ?? null,
        });
      } catch {
        /* einzelne Sorte darf fehlen */
      }

      for (const crossing of cfg.borderCrossings) {
        try {
          const list = await providers.fetchCzStations(crossing.cityPath, fuel);
          const sorted = [...list]
            .filter((s) => Number.isFinite(s.priceKc) && s.priceKc > 0)
            .sort((a, b) => a.priceKc - b.priceKc)
            .slice(0, 5);
          for (const s of sorted) {
            const priceEur = s.priceKc / fx.kcPerEur;
            rows.push({
              region: "cz",
              fuelType: fuel,
              price: priceEur,
              currency: "EUR",
              kind: "station",
              source: "mapapump",
              sourceTs: s.timestamp,
              lat: s.lat,
              lng: s.lng,
              stationKey: s.href || `${s.lat},${s.lng}`,
              stationName: s.name,
              borderName: crossing.name,
              meta: { priceKc: s.priceKc, cityPath: crossing.cityPath },
            });
            // Rohpreis Kč parallel (für Audit)
            rows.push({
              region: "cz",
              fuelType: fuel,
              price: s.priceKc,
              currency: "CZK",
              kind: "station",
              source: "mapapump",
              sourceTs: s.timestamp,
              lat: s.lat,
              lng: s.lng,
              stationKey: s.href || `${s.lat},${s.lng}`,
              stationName: s.name,
              borderName: crossing.name,
              meta: { as: "kc", cityPath: crossing.cityPath },
            });
          }
        } catch {
          /* Stadt/Sorte überspringen */
        }
      }
    }

    const inserted = await insertSnapshots(rows);
    return { ok: true, inserted };
  } catch (err) {
    return {
      ok: false,
      inserted: 0,
      error: err instanceof Error ? err.message : "Snapshot fehlgeschlagen",
    };
  }
}
