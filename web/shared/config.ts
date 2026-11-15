/** Persönliche Defaults (entspricht config.toml). */

export type BorderCrossing = {
  name: string;
  lat: number;
  lng: number;
  destLat: number;
  destLng: number;
  /** Stadtseite hinter der Grenze, z. B. plzensky-kraj/rozvadov */
  cityPath: string;
};

export type AppConfig = {
  homeLat: number;
  homeLng: number;
  fuelType: "e5" | "e10" | "diesel";
  consumptionLPer100km: number;
  tankCapacityL: number;
  fillLiters: number;
  minNetSavingEur: number;
  homeSearchRadiusKm: number;
  tollEur: number;
  timeValueEurPerH: number;
  remainingRangeKm: number;
  cardFeePercent: number;
  mealEur: number;
  ausflugWertEur: number;
  /**
   * Persönliche Beobachtung: CZ-Sprit ~X % mehr Reichweite (keine Labor-Garantie).
   * Default 20 ≈ jahrelange Erfahrung (oft ~300 km mehr je Füllung).
   */
  czRangeBonusPercent: number;
  borderCrossings: BorderCrossing[];
};

export const DEFAULT_CONFIG: AppConfig = {
  homeLat: 49.4378,
  homeLng: 10.9732,
  fuelType: "e10",
  consumptionLPer100km: 5.2,
  tankCapacityL: 62,
  fillLiters: 62,
  minNetSavingEur: 5,
  homeSearchRadiusKm: 5,
  tollEur: 0,
  timeValueEurPerH: 0,
  remainingRangeKm: 200,
  cardFeePercent: 0.2,
  mealEur: 20,
  ausflugWertEur: 24,
  czRangeBonusPercent: 20,
  borderCrossings: [
    {
      name: "Waidhaus / Rozvadov",
      lat: 49.64251,
      lng: 12.52208,
      destLat: 49.673,
      destLng: 12.552,
      cityPath: "plzensky-kraj/rozvadov",
    },
    {
      name: "Schirnding / Cheb",
      lat: 50.08658,
      lng: 12.25427,
      destLat: 50.079,
      destLng: 12.37,
      cityPath: "karlovarsky-kraj/cheb",
    },
    {
      name: "Furth im Wald / Folmava",
      lat: 49.3408,
      lng: 12.85015,
      destLat: 49.352,
      destLng: 12.88,
      cityPath: "plzensky-kraj/ceska-kubice",
    },
  ],
};
