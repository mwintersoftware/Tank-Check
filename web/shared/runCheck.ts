import { calculateTrip, kcToEur } from "./calc.js";
import { DEFAULT_CONFIG } from "./config.js";
import type { CheckRequest, CheckResponse, PriceKind, RouteOption, TripView } from "./types.js";
import { safeHttpsUrl } from "./validate.js";

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
    address?: string;
    openingHours?: string;
    isOpen?: boolean;
    note?: string;
  }>;
  fetchOpeningHours?: (
    lat: number,
    lng: number,
    hint?: { name?: string; address?: string },
  ) => Promise<string | null>;
  fetchOpeningHoursBatch?: (
    targets: Array<{ lat: number; lng: number; name?: string; address?: string }>,
  ) => Promise<(string | null)[]>;
  fetchNearbyPlaces?: (lat: number, lng: number) => Promise<{
    restaurants: CheckResponse["nearby"]["restaurants"];
    shops: CheckResponse["nearby"]["shops"];
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
  /** Frische Stationen inkl. Detail-Nachladen (bevorzugt). */
  fetchCzStationsFresh?: (
    cityPath: string,
    fuelType: string,
    limit?: number,
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
  const raw =
    `https://www.google.com/maps/dir/?api=1` +
    `&origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&travelmode=driving`;
  return safeHttpsUrl(raw) ?? raw;
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
    extraRangeKm: t.extraRangeKm,
    rangeBonusWertEur: t.rangeBonusWertEur,
    mitReichweite: t.mitReichweite,
    lohntSprit: t.lohntSprit,
    lohntAusflug: t.lohntAusflug,
    lohntMitReichweite: t.lohntMitReichweite,
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
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error("Koordinaten außerhalb des gültigen Bereichs");
  }

  const cfg = DEFAULT_CONFIG;
  const fuelRaw = (body.fuelType || cfg.fuelType).toLowerCase();
  const fuelType =
    fuelRaw === "e5" || fuelRaw === "e10" || fuelRaw === "diesel" ? fuelRaw : cfg.fuelType;
  let incomplete = false;

  const manualRaw =
    body.czPriceKc != null && Number.isFinite(body.czPriceKc) ? Number(body.czPriceKc) : null;
  const manualKc =
    manualRaw != null && manualRaw >= 5 && manualRaw <= 100 ? manualRaw : null;
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
    openingHours?: string;
  };

  /** Pro Grenze mehrere Stationen in der Übersicht (günstigste zuerst). */
  const MAX_STATIONS_PER_CROSSING = 5;

  type Routed = {
    crossing: (typeof cfg.borderCrossings)[number];
    route: { distanceKm: number; durationH: number; source: string };
    station: StationHit | null;
    destLat: number;
    destLng: number;
    priceKc: number | null;
    label: string;
  };

  const routed: Routed[] = (
    await Promise.all(
      cfg.borderCrossings.map(async (crossing) => {
        let stations: StationHit[] = [];
        if (manualKc == null && (providers.fetchCzStationsFresh || providers.fetchCzStations)) {
          try {
            let pool: StationHit[] = [];
            if (providers.fetchCzStationsFresh) {
              pool = await providers.fetchCzStationsFresh(
                crossing.cityPath,
                fuelType,
                MAX_STATIONS_PER_CROSSING,
              );
            } else if (providers.fetchCzStations) {
              const list = await providers.fetchCzStations(crossing.cityPath, fuelType);
              const fresh = list.filter((s) => !s.stale);
              pool = (fresh.length ? fresh : list)
                .slice()
                .sort((a, b) => a.priceKc - b.priceKc)
                .slice(0, MAX_STATIONS_PER_CROSSING);
            }
            stations = pool.map((s) => ({
              name: s.name,
              address: s.address,
              lat: s.lat,
              lng: s.lng,
              priceKc: s.priceKc,
              timestamp: s.timestamp,
              stale: s.stale,
            }));
          } catch {
            incomplete = true;
          }
        }

        if (!stations.length) {
          const destLat = crossing.destLat;
          const destLng = crossing.destLng;
          const route = await providers.routeDistance(lat, lng, destLat, destLng);
          const priceKc = manualKc ?? czFallback?.price ?? null;
          return [
            {
              crossing,
              route,
              station: null,
              destLat,
              destLng,
              priceKc,
              label: crossing.name,
            } satisfies Routed,
          ];
        }

        return Promise.all(
          stations.map(async (station) => {
            const route = await providers.routeDistance(
              lat,
              lng,
              station.lat,
              station.lng,
            );
            return {
              crossing,
              route,
              station,
              destLat: station.lat,
              destLng: station.lng,
              priceKc: manualKc ?? station.priceKc,
              label: `${crossing.name} · ${station.name}`,
            } satisfies Routed;
          }),
        );
      }),
    )
  ).flat();

  // Öffnungszeiten: alle Stationen gebündelt (Betreiber parallel, Overpass einmal)
  const hourTargets = routed
    .map((r, i) => ({ r, i }))
    .filter((x) => x.r.station);
  if (hourTargets.length && (providers.fetchOpeningHoursBatch || providers.fetchOpeningHours)) {
    try {
      const hours = providers.fetchOpeningHoursBatch
        ? await providers.fetchOpeningHoursBatch(
            hourTargets.map(({ r }) => ({
              lat: r.station!.lat,
              lng: r.station!.lng,
              name: r.station!.name,
              address: r.station!.address,
            })),
          )
        : await Promise.all(
            hourTargets.map(({ r }) =>
              providers.fetchOpeningHours!(r.station!.lat, r.station!.lng, {
                name: r.station!.name,
                address: r.station!.address,
              }).catch(() => null),
            ),
          );
      hourTargets.forEach(({ r }, j) => {
        const h = hours[j];
        if (h && r.station) r.station.openingHours = h;
      });
    } catch {
      /* Öffnungszeiten optional */
    }
  }

  if (routed.some((r) => r.route.source.includes("Schätzung"))) incomplete = true;

  const anyPrice = routed.find((r) => r.priceKc != null && Number.isFinite(r.priceKc));
  if (!anyPrice || anyPrice.priceKc == null) {
    throw new CzPriceRequiredError(
      "Kein tschechischer Stationspreis gefunden. Bitte Kč/l unter Einstellungen eintragen.",
    );
  }

  const scanLog = [
    ...new Set(
      routed
        .map((r) => r.station?.name || r.label)
        .filter((n): n is string => Boolean(n && n.trim())),
    ),
  ];

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

  const tripInputBase = {
    pHome: de.price,
    fillLiters: cfg.fillLiters,
    tankCapacityL: cfg.tankCapacityL,
    consumptionLPer100km: cfg.consumptionLPer100km,
    remainingRangeKm: cfg.remainingRangeKm,
    cardFeePercent: cfg.cardFeePercent,
    mealEur: cfg.mealEur,
    ausflugWertEur: cfg.ausflugWertEur,
    czRangeBonusPercent: cfg.czRangeBonusPercent,
    tollEur: cfg.tollEur,
    minNetSavingEur: cfg.minNetSavingEur,
  };

  /** Nur die besten Spar-Ergebnisse (Top 3 inkl. Reichweiten-Mehrwert). */
  const TOP_BEST = 3;
  const scored = routed
    .filter((r) => r.priceKc != null && Number.isFinite(r.priceKc))
    .map((r) => {
      const pCz = kcToEur(r.priceKc!, fx.kcPerEur);
      const tripOne = calculateTrip({
        ...tripInputBase,
        pCz,
        dOnewayKm: r.route.distanceKm,
      });
      return { r, tripOne, sparEur: tripOne.mitReichweite };
    })
    .sort(
      (a, b) =>
        b.sparEur - a.sparEur ||
        a.r.route.distanceKm - b.r.route.distanceKm,
    );

  const top = scored.slice(0, TOP_BEST);
  const bestRow = top[0]!;
  const best = bestRow.r;
  const trip = bestRow.tripOne;
  const view = tripToView(trip);
  const bestPriceKc = best.priceKc!;
  const pCzBest = kcToEur(bestPriceKc, fx.kcPerEur);

  const routen: RouteOption[] = top.map((row, i) => {
    const r = row.r;
    const kc = r.priceKc!;
    const kind = routeKind(r);
    const source = r.station
      ? "CZ-Stationskatalog"
      : manualKc != null
        ? "manuell"
        : czFallback?.source || "Durchschnitt";
    return {
      name: r.label,
      destLat: r.destLat,
      destLng: r.destLng,
      onewayKm: r.route.distanceKm,
      durationH: r.route.durationH,
      routingSource: r.route.source,
      naviUrl: naviUrl(lat, lng, r.destLat, r.destLng),
      stationName: r.station?.name,
      stationAddress: r.station?.address,
      stationOpeningHours: r.station?.openingHours,
      priceKc: kc,
      priceEur: kcToEur(kc, fx.kcPerEur),
      priceKind: kind,
      priceSource: `${source}, ${kindLabel[kind]}`,
      priceTimestamp: r.station?.timestamp ?? czFallback?.timestamp ?? new Date().toISOString(),
      sparEur: row.sparEur,
      rank: i + 1,
    };
  });

  // Nähe-Orte lädt die UI separat (/api/nearby), damit die Prüfung nicht hängen bleibt.
  const nearby: CheckResponse["nearby"] = { restaurants: [], shops: [] };

  const hints = [
    "Hinweg: Rest im Tank (schon bezahlt). Rückweg: CZ-Sprit inkl. Kartengebühr.",
    "Es fließt nur rein, was nach der Ankunft noch Platz hat – nicht der volle Tank, wenn noch Rest da ist.",
    "Essen ist Kasse. Quatschen und Ausflug stehen extra – unbezahlbar, hier mit Hausnummer.",
    `Euro-Kurs: ${fx.kcPerEur.toFixed(3).replace(".", ",")} Kč je €. In Kronen zahlen, nicht in Euro umrechnen lassen.`,
    "Angezeigt: die drei besten Spar-Optionen. CZ-Preise von frischen Stationsmeldungen.",
    `Reichweite: eigene Beobachtung über Jahre – CZ-Sprit oft ca. ${cfg.czRangeBonusPercent} % weiter (Gegenwert in der Rechnung). Keine Labor-Garantie, vor Ort kann es abweichen.`,
  ];
  if (!trip.kannHin) {
    hints.unshift("Restreichweite reicht nicht bis zur Grenze – vorher in DE nachfüllen oder andere Strecke.");
  }
  if (de.note) hints.unshift(de.note);
  if (best.station?.stale) {
    hints.unshift("Stationspreis älter als 7 Tage – vor Ort prüfen.");
  } else if (best.station) {
    const ageH =
      (Date.now() - Date.parse(best.station.timestamp)) / 3_600_000;
    if (Number.isFinite(ageH) && ageH > 24) {
      hints.unshift(
        "CZ-Stationspreis ist älter als 24 Stunden (Meldung der Station) – vor Ort prüfen.",
      );
    }
  } else if (czFallback?.note && !best.station) {
    hints.unshift(czFallback.note);
  }

  const lohnt = trip.lohntAusflug || trip.lohntSprit;
  const status = !trip.kannHin
    ? "Rest reicht nicht bis zur Grenze"
    : incomplete
      ? `Unvollständig – ${trip.lohntAusflug ? "Ausflug lohnt sich" : trip.lohntSprit ? "lohnt sich" : "lohnt sich nicht"}`
      : trip.lohntSprit
        ? "Ja, allein der Sprit lohnt sich"
        : trip.lohntAusflug
          ? "Ja, der Ausflug lohnt sich"
          : "Nein, nur wegen Sprit lohnt es sich nicht";

  return {
    checkedAt: new Date().toISOString(),
    incomplete,
    lohntSich: lohnt,
    status,
    homeLat: lat,
    homeLng: lng,
    deutschland: {
      stationName: de.stationName || "Tankstelle",
      address: de.address,
      openingHours: de.openingHours,
      isOpen: de.isOpen,
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
      priceKc: bestPriceKc,
      priceEur: pCzBest,
      source: routen[0]?.priceSource ?? "CZ",
      timestamp: routen[0]?.priceTimestamp ?? new Date().toISOString(),
      kind: routen[0]?.priceKind ?? "average",
      note: best.station
        ? best.station.stale
          ? "Stationspreis älter als 7 Tage – vor Ort prüfen."
          : "Beste Spar-Option hinter der Grenze; vor Ort kann es abweichen."
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
      czRangeBonusPercent: cfg.czRangeBonusPercent,
      minNetSavingEur: cfg.minNetSavingEur,
      tollEur: cfg.tollEur,
    },
    routen,
    scanLog,
    nearby,
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
