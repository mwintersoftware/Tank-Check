/** Reine Rechenlogik (entspricht calc.py). */

export type CalcInput = {
  pHome: number;
  pCz: number;
  fillLiters: number;
  consumptionLPer100km: number;
  dOnewayKm: number;
  tollEur?: number;
  timeValueEurPerH?: number;
  driveTimeRoundH?: number;
  minNetSavingEur?: number;
};

export type CalcResult = {
  c: number;
  fahrtspritEur: number;
  ersparnisBrutto: number;
  zeitkosten: number;
  netto: number;
  lohntSich: boolean;
  maxEinfacheKm: number | null;
  dRoundKm: number;
};

export type TripInput = {
  pHome: number;
  pCz: number;
  fillLiters: number;
  tankCapacityL: number;
  consumptionLPer100km: number;
  dOnewayKm: number;
  remainingRangeKm: number;
  cardFeePercent?: number;
  mealEur?: number;
  ausflugWertEur?: number;
  /** Beobachteter Reichweiten-Bonus von CZ-Sprit in % (z. B. 20). */
  czRangeBonusPercent?: number;
  tollEur?: number;
  minNetSavingEur?: number;
};

export type TripResult = {
  c: number;
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
  /** Extra-km durch beobachteten CZ-Reichweiten-Bonus. */
  extraRangeKm: number;
  /** Gegenwert der Extra-km in € (zu DE-Preis). */
  rangeBonusWertEur: number;
  /** Kasse + Ausflug + Reichweiten-Mehrwert. */
  mitReichweite: number;
  lohntSprit: boolean;
  lohntAusflug: boolean;
  lohntMitReichweite: boolean;
  noetigerAusflugWertEur: number;
  maxEinfacheKm: number | null;
};

export function kcToEur(preisKc: number, kursKcProEur: number): number {
  if (kursKcProEur <= 0) throw new Error("Wechselkurs muss > 0 sein");
  return preisKc / kursKcProEur;
}

export function calculate(inp: CalcInput): CalcResult {
  const toll = inp.tollEur ?? 0;
  const timeValue = inp.timeValueEurPerH ?? 0;
  const driveTime = inp.driveTimeRoundH ?? 0;
  const minNet = inp.minNetSavingEur ?? 0;

  const c = inp.consumptionLPer100km / 100;
  const dRound = 2 * inp.dOnewayKm;
  const fahrtspritEur = dRound * c * inp.pHome;
  const ersparnisBrutto = inp.fillLiters * (inp.pHome - inp.pCz);
  const zeitkosten = driveTime * timeValue;
  const netto = ersparnisBrutto - fahrtspritEur - toll - zeitkosten;
  const lohntSich = netto >= minNet;

  const denom = 2 * c * inp.pHome;
  let maxEinfacheKm: number | null = null;
  if (denom > 0 && inp.pHome - inp.pCz > 0) {
    maxEinfacheKm = (inp.fillLiters * (inp.pHome - inp.pCz) - toll) / denom;
  }

  return {
    c,
    fahrtspritEur,
    ersparnisBrutto,
    zeitkosten,
    netto,
    lohntSich,
    maxEinfacheKm,
    dRoundKm: dRound,
  };
}

export function calculateTrip(inp: TripInput): TripResult {
  const fee = Math.max(0, inp.cardFeePercent ?? 0) / 100;
  const meal = inp.mealEur ?? 0;
  const ausflug = inp.ausflugWertEur ?? 0;
  const toll = inp.tollEur ?? 0;
  const minNet = inp.minNetSavingEur ?? 0;

  const c = inp.consumptionLPer100km / 100;
  const onewayLiters = inp.dOnewayKm * c;
  const remainingLiters = Math.max(0, inp.remainingRangeKm * c);
  const kannHin = inp.remainingRangeKm + 1e-9 >= inp.dOnewayKm;
  const remainingAfter = kannHin ? remainingLiters - onewayLiters : 0;
  const room = Math.max(0, inp.tankCapacityL - remainingAfter);
  const fillUsedL = Math.min(Math.max(0, inp.fillLiters), room);
  const pCzPay = inp.pCz * (1 + fee);
  const kartengebuehrEur = fillUsedL * inp.pCz * fee;
  const ersparnisBrutto = fillUsedL * (inp.pHome - pCzPay);
  const fahrtHinOpportunitaetEur = onewayLiters * inp.pHome;
  const fahrtRueckEur = onewayLiters * pCzPay;
  const nettoSprit = ersparnisBrutto - fahrtRueckEur - toll;
  const nettoStreng = nettoSprit - fahrtHinOpportunitaetEur;
  const kasse = nettoSprit - meal;
  const mitAusflug = kasse + ausflug;
  const noetigerAusflugWertEur = Math.max(0, meal - nettoSprit);

  // Persönliche Beobachtung: CZ-Sprit oft ~X % mehr Reichweite → Extra-km wert DE-Preis
  const bonusPct = Math.max(0, Math.min(50, inp.czRangeBonusPercent ?? 0)) / 100;
  const baseRangeKm = c > 0 ? fillUsedL / c : 0;
  const extraRangeKm = baseRangeKm * bonusPct;
  const rangeBonusWertEur = extraRangeKm * c * inp.pHome; // = fillUsedL * bonusPct * pHome
  const mitReichweite = mitAusflug + rangeBonusWertEur;

  const emptyStart = inp.tankCapacityL - remainingLiters;
  const delta = inp.pHome - pCzPay;
  const slope = inp.pHome - 2 * pCzPay;
  let maxEinfacheKm: number | null = null;
  if (c > 0 && delta > 0) {
    const rhs = minNet + toll - emptyStart * delta;
    if (Math.abs(slope) > 1e-12) {
      const liters = rhs / slope;
      const km = liters / c;
      if (km > 0) maxEinfacheKm = km;
    }
  }

  return {
    c,
    onewayLiters,
    remainingLiters,
    remainingAfterArrivalL: remainingAfter,
    fillUsedL,
    kannHin,
    pCzPay,
    kartengebuehrEur,
    ersparnisBrutto,
    fahrtHinOpportunitaetEur,
    fahrtRueckEur,
    dRoundKm: 2 * inp.dOnewayKm,
    nettoSprit,
    nettoStreng,
    kasse,
    mitAusflug,
    extraRangeKm,
    rangeBonusWertEur,
    mitReichweite,
    lohntSprit: kannHin && nettoSprit >= minNet,
    lohntAusflug: kannHin && mitAusflug >= minNet,
    lohntMitReichweite: kannHin && mitReichweite >= minNet,
    noetigerAusflugWertEur,
    maxEinfacheKm,
  };
}
