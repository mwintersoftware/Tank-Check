import { calculateTrip, kcToEur } from "./calc.js";
import { DEFAULT_CONFIG } from "./config.js";
import type { CheckRequest, CheckResponse, PriceKind, RouteOption, TripView } from "./types.js";

export type ProviderFns = {
  fetchDeCheapest: (
    lat: number,
    lng: number,
    radiusKm: number,
    fuelType: string,
  ) => Promise<{
    price: number;
    source: string;
    timestamp: string;
    kind: CheckResponse["deutschland"]["kind"];
    stationName?: string;
    note?: string;
  }>;
  fetchEurCzk: () => Promise<{ kcPerEur: number; source: string; timestamp: string }>;
  fetchCzPrice: (fuelType: string) => Promise<{
    price: number;
    source: string;
    timestamp: string;
    kind: CheckResponse["tschechien"]["kind"];
    stationName?: string;
    note?: string;
  }>;
  manualCzPrice: (
    preisKc: number,
    fuelType: string,
  ) => {
    price: number;
    source: string;
    timestamp: string;
    kind: CheckResponse["tschechien"]["kind"];
    stationName?: string;
    note?: string;
  };
  routeDistance: (
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ) => Promise<{ distanceKm: number; durationH: number; source: string }>;
  fetchCzStations?: (
    cityPath: string,
    fuelType: string,
  ) => Promise<
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
  >;
};

export class CzPriceRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CzPriceRequiredError";
  }
}

function naviUrl(fromLat: number, fromLng: number, toLat: number, toLng: number): string {
  return (
    `https://www.google.com/maps/dir/?api=1` +
    `&origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&travelmode=driving`
  );
}

export function tripToView(t: ReturnType<typeof calculateTrip>): TripView {
  return {
    onewayLiters: t.onewayLiters,
    remainingLiters: t.remainingLiters,
    remainingAfterArrivalL: t.remainingAfterArrivalL,
    fillUsedL: t.fillUsedL,
    kannHin: t.kannHin,
    pCzPay: t.pCzPay,
    kartengebuehrEur: t.kartengebuehrEur,
    ersparnisBrutto: t.ersparnisBrutto,
    fahrtHinOpportunitaetEur: t.fahrtHinOpportunitaetEur,
    fahrtRueckEur: t.fahrtRueckEur,
    dRoundKm: t.dRoundKm,
    nettoSprit: t.nettoSprit,
    nettoStreng: t.nettoStreng,
    kasse: t.kasse,
    mitAusflug: t.mitAusflug,
    lohntSprit: t.lohntSprit,
    lohntAusflug: t.lohntAusflug,
    noetigerAusflugWertEur: t.noetigerAusflugWertEur,
    maxEinfacheKm: t.maxEinfacheKm,
  };
}

export async function runCheck(
  body: CheckRequest,
  providers: ProviderFns,
): Promise<CheckResponse> {
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("lat und lng sind erforderlich");
  }

  const cfg = DEFAULT_CONFIG;
  const fuelType = body.fuelType || cfg.fuelType;
  let incomplete = false;

  const manualKc =
    body.czPriceKc != null && Number.isFinite(body.czPriceKc) ? Number(body.czPriceKc) : null;
  const czFallbackPromise =
    manualKc != null
      ? Promise.resolve(providers.manualCzPrice(manualKc, fuelType))
      : providers.fetchCzPrice(fuelType).catch(() => null);

  const [de, fx, czFallback] = await Promise.all([
    providers.fetchDeCheapest(lat, lng, cfg.homeSearchRadiusKm, fuelType),
    providers.fetchEurCzk(),
    czFallbackPromise,
  ]);

  type StationHit = {
    name: string;
    address: string;
    lat: number;
    lng: number;
    priceKc: number;
    timestamp: string;
    stale: boolean;
  };

  const routed = await Promise.all(
    cfg.borderCrossings.map(async (crossing) => {
      let station: StationHit | null = null;
      if (providers.fetchCzStations && manualKc == null) {
        try {
          const list = await providers.fetchCzStations(crossing.cityPath, fuelType);
          const fresh = list.filter((s) => !s.stale);
          const pool = fresh.length ? fresh : list;
          station = pool.length
            ? pool.reduce((a, b) => (a.priceKc <= b.priceKc ? a : b))
            : null;
        } catch {
          incomplete = true;
        }
      }
      const destLat = station?.lat ?? crossing.destLat;
      const destLng = station?.lng ?? crossing.destLng;
      const route = await providers.routeDistance(lat, lng, destLat, destLng);
      const priceKc = manualKc ?? station?.priceKc ?? czFallback?.price ?? null;
      return { crossing, route, station, destLat, destLng, priceKc };
    }),
  );
  routed.sort((a, b) => a.route.distanceKm - b.route.distanceKm);
  const best = routed[0];
  if (routed.some((r) => r.route.source.includes("Schätzung"))) incomplete = true;
  if (best.priceKc == null || !Number.isFinite(best.priceKc)) {
    throw new CzPriceRequiredError(
      "Kein tschechischer Stationspreis gefunden. Bitte Kč/l unter Einstellungen eintragen.",
    );
  }

  const pCzBest = kcToEur(best.priceKc, fx.kcPerEur);
  const trip = calculateTrip({
    pHome: de.price,
    pCz: pCzBest,
    fillLiters: cfg.fillLiters,
    tankCapacityL: cfg.tankCapacityL,
    consumptionLPer100km: cfg.consumptionLPer100km,
    dOnewayKm: best.route.distanceKm,
    remainingRangeKm: cfg.remainingRangeKm,
    cardFeePercent: cfg.cardFeePercent,
    mealEur: cfg.mealEur,
    ausflugWertEur: cfg.ausflugWertEur,
    tollEur: cfg.tollEur,
    minNetSavingEur: cfg.minNetSavingEur,
  });
  const view = tripToView(trip);

  const kindLabel = {
    station: "Stationspreis",
    average: "Landesdurchschnitt",
    ceiling: "Obergrenze",
    manual: "manuell",
  } as const;

  function routeKind(r: (typeof routed)[number]): PriceKind {
    if (manualKc != null) return "manual";
    if (r.station) return "station";
    return czFallback?.kind ?? "average";
  }

  const hints = [
    "Hinweg: Rest im Tank (schon bezahlt). Rückweg: CZ-Sprit inkl. Kartengebühr.",
    "Es fließt nur rein, was nach der Ankunft noch Platz hat – nicht der volle Tank, wenn noch Rest da ist.",
    "Essen 12 € für 2 ist Kasse. Quatschen und Ausflug stehen extra – unbezahlbar, hier mit Hausnummer.",
    `Euro-Kurs: ${fx.kcPerEur.toFixed(3).replace(".", ",")} Kč je €. In Kronen zahlen, nicht in Euro umrechnen lassen.`,
    "CZ-Preis kommt von der günstigsten Tankstelle hinter der gewählten Grenze.",
  ];
  if (!trip.kannHin) {
    hints.unshift("Restreichweite reicht nicht bis zur Grenze – vorher in DE nachfüllen oder andere Strecke.");
  }
  if (de.note) hints.unshift(de.note);
  if (best.station?.stale) {
    hints.unshift("Stationspreis älter als 14 Tage – vor Ort prüfen.");
  } else if (czFallback?.note && !best.station) {
    hints.unshift(czFallback.note);
  }

  const lohnt = trip.lohntAusflug || trip.lohntSprit;
  const status = incomplete
    ? `UNVOLLSTÄNDIG – ${trip.lohntAusflug ? "LOHNT ALS AUSFLUG" : trip.lohntSprit ? "LOHNT SICH" : "LOHNT SICH NICHT"}`
    : trip.lohntSprit
      ? "LOHNT SICH (Sprit)"
      : trip.lohntAusflug
        ? "LOHNT ALS AUSFLUG"
        : "LOHNT SICH NICHT (nur Sprit)";

  const routen: RouteOption[] = routed.map((r) => {
    const kc = r.priceKc ?? best.priceKc;
    const kind = routeKind(r);
    const source = r.station
      ? "CZ-Stationskatalog"
      : manualKc != null
        ? "manuell"
        : czFallback?.source || "Durchschnitt";
    return {
      name: r.crossing.name,
      destLat: r.destLat,
      destLng: r.destLng,
      onewayKm: r.route.distanceKm,
      durationH: r.route.durationH,
      routingSource: r.route.source,
      naviUrl: naviUrl(lat, lng, r.destLat, r.destLng),
      stationName: r.station?.name,
      stationAddress: r.station?.address,
      priceKc: kc,
      priceEur: kcToEur(kc, fx.kcPerEur),
      priceKind: kind,
      priceSource: `${source}, ${kindLabel[kind]}`,
      priceTimestamp: r.station?.timestamp ?? czFallback?.timestamp ?? new Date().toISOString(),
    };
  });

  return {
    checkedAt: new Date().toISOString(),
    incomplete,
    lohntSich: lohnt,
    status,
    homeLat: lat,
    homeLng: lng,
    deutschland: {
      stationName: de.stationName || "Tankstelle",
      fuelType,
      priceEur: de.price,
      source: de.source,
      timestamp: de.timestamp,
      kind: de.kind,
      note: de.note,
    },
    tschechien: {
      label:
        best.station
          ? `${best.station.name}${best.station.address ? `, ${best.station.address}` : ""}`
          : czFallback?.stationName || "Preis",
      priceKc: best.priceKc,
      priceEur: pCzBest,
      source: routen[0]?.priceSource ?? "CZ",
      timestamp: routen[0]?.priceTimestamp ?? new Date().toISOString(),
      kind: routen[0]?.priceKind ?? "average",
      note: best.station
        ? best.station.stale
          ? "Stationspreis älter als 14 Tage – vor Ort prüfen."
          : "Günstigste Station hinter der Grenze; vor Ort kann es abweichen."
        : czFallback?.note,
      lat: best.destLat,
      lng: best.destLng,
    },
    kursKcProEur: fx.kcPerEur,
    kursSource: fx.source,
    annahmen: {
      consumptionLPer100km: cfg.consumptionLPer100km,
      tankCapacityL: cfg.tankCapacityL,
      fillLiters: cfg.fillLiters,
      remainingRangeKm: cfg.remainingRangeKm,
      cardFeePercent: cfg.cardFeePercent,
      mealEur: cfg.mealEur,
      ausflugWertEur: cfg.ausflugWertEur,
      minNetSavingEur: cfg.minNetSavingEur,
      tollEur: cfg.tollEur,
    },
    routen,
    strecke: {
      onewayKm: best.route.distanceKm,
      roundKm: trip.dRoundKm,
      borderName: best.crossing.name,
      routingSource: best.route.source,
      destLat: best.destLat,
      destLng: best.destLng,
    },
    trip: view,
    ersparnisBrutto: trip.ersparnisBrutto,
    fahrtspritEur: trip.fahrtRueckEur,
    mautEur: cfg.tollEur,
    netto: trip.nettoSprit,
    breakEvenKm: trip.maxEinfacheKm,
    naviUrl: naviUrl(lat, lng, best.destLat, best.destLng),
    hints,
  };
}
