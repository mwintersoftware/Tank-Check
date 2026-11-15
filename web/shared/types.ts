export type PriceKind = "station" | "average" | "ceiling" | "manual";

export type CheckRequest = {
  lat: number;
  lng: number;
  fuelType?: "e5" | "e10" | "diesel";
  czPriceKc?: number;
};

export type RouteOption = {
  name: string;
  destLat: number;
  destLng: number;
  onewayKm: number;
  durationH: number;
  routingSource: string;
  naviUrl: string;
  stationName?: string;
  stationAddress?: string;
  stationOpeningHours?: string;
  priceKc: number;
  priceEur: number;
  priceKind: PriceKind;
  priceSource: string;
  priceTimestamp: string;
};

export type TripView = {
  onewayLiters: number;
  remainingLiters: number;
  remainingAfterArrivalL: number;
  fillUsedL: number;
  kannHin: boolean;
  pCzPay: number;
  kartengebuehrEur: number;
  ersparnisBrutto: number;
  fahrtHinOpportunitaetEur: number;
  fahrtRueckEur: number;
  dRoundKm: number;
  nettoSprit: number;
  nettoStreng: number;
  kasse: number;
  mitAusflug: number;
  lohntSprit: boolean;
  lohntAusflug: boolean;
  noetigerAusflugWertEur: number;
  maxEinfacheKm: number | null;
};

export type CheckResponse = {
  checkedAt: string;
  incomplete: boolean;
  lohntSich: boolean;
  status: string;
  homeLat: number;
  homeLng: number;
  deutschland: {
    stationName: string;
    address?: string;
    openingHours?: string;
    isOpen?: boolean;
    fuelType: string;
    priceEur: number;
    source: string;
    timestamp: string;
    kind: PriceKind;
    note?: string;
  };
  tschechien: {
    label: string;
    priceKc: number;
    priceEur: number;
    source: string;
    timestamp: string;
    kind: PriceKind;
    note?: string;
    lat?: number;
    lng?: number;
  };
  kursKcProEur: number;
  kursSource: string;
  annahmen: {
    consumptionLPer100km: number;
    tankCapacityL: number;
    fillLiters: number;
    remainingRangeKm: number;
    cardFeePercent: number;
    mealEur: number;
    ausflugWertEur: number;
    minNetSavingEur: number;
    tollEur: number;
  };
  routen: RouteOption[];
  strecke: {
    onewayKm: number;
    roundKm: number;
    borderName: string;
    routingSource: string;
    destLat: number;
    destLng: number;
  };
  trip: TripView;
  ersparnisBrutto: number;
  fahrtspritEur: number;
  mautEur: number;
  netto: number;
  breakEvenKm: number | null;
  naviUrl: string | null;
  hints: string[];
};
