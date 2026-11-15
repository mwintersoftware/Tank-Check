import { describe, expect, it } from "vitest";
import { calculate, calculateTrip, kcToEur } from "./calc";

describe("calc", () => {
  it("SPEC-Fall: Ersparnis ~7,25 €, Break-even ~37 km", () => {
    const pCz = Number(kcToEur(42.39, 24.2).toFixed(3));
    expect(pCz).toBe(1.752);
    const r = calculate({
      pHome: 1.869,
      pCz,
      fillLiters: 62,
      consumptionLPer100km: 5.2,
      dOnewayKm: 37,
      minNetSavingEur: 0,
    });
    expect(r.ersparnisBrutto).toBeCloseTo(7.254, 2);
    expect(r.maxEinfacheKm).not.toBeNull();
    expect(r.maxEinfacheKm!).toBeCloseTo(37.25, 0);
  });

  it("Schwelle kippt exakt", () => {
    const r = calculate({
      pHome: 1.9,
      pCz: 1.7,
      fillLiters: 50,
      consumptionLPer100km: 5,
      dOnewayKm: 10,
      minNetSavingEur: 5,
    });
    expect(r.lohntSich).toBe(true);
    const edge = calculate({
      pHome: 1.9,
      pCz: 1.7,
      fillLiters: 50,
      consumptionLPer100km: 5,
      dOnewayKm: 10,
      minNetSavingEur: r.netto,
    });
    expect(edge.lohntSich).toBe(true);
    const below = calculate({
      pHome: 1.9,
      pCz: 1.7,
      fillLiters: 50,
      consumptionLPer100km: 5,
      dOnewayKm: 10,
      minNetSavingEur: r.netto + 0.01,
    });
    expect(below.lohntSich).toBe(false);
  });

  it("Resttank: nur nachfüllen was reinpasst, Rückweg zu CZ-Preis", () => {
    const t = calculateTrip({
      pHome: 2,
      pCz: 1.5,
      fillLiters: 62,
      tankCapacityL: 62,
      consumptionLPer100km: 5.2,
      dOnewayKm: 50,
      remainingRangeKm: 450,
      cardFeePercent: 2,
      mealEur: 12,
      ausflugWertEur: 24,
      minNetSavingEur: 5,
    });
    expect(t.kannHin).toBe(true);
    expect(t.onewayLiters).toBeCloseTo(2.6, 5);
    expect(t.fillUsedL).toBeCloseTo(41.2, 5);
    expect(t.pCzPay).toBeCloseTo(1.53, 5);
    expect(t.ersparnisBrutto).toBeCloseTo(19.364, 2);
    expect(t.fahrtRueckEur).toBeCloseTo(3.978, 2);
    expect(t.nettoSprit).toBeCloseTo(15.386, 2);
    expect(t.kasse).toBeCloseTo(3.386, 2);
    expect(t.mitAusflug).toBeCloseTo(27.386, 2);
    expect(t.lohntSprit).toBe(true);
    expect(t.lohntAusflug).toBe(true);
  });

  it("Restreichweite zu knapp", () => {
    const t = calculateTrip({
      pHome: 2,
      pCz: 1.5,
      fillLiters: 62,
      tankCapacityL: 62,
      consumptionLPer100km: 5.2,
      dOnewayKm: 200,
      remainingRangeKm: 50,
      minNetSavingEur: 5,
    });
    expect(t.kannHin).toBe(false);
    expect(t.lohntSprit).toBe(false);
  });

  it("CZ-Reichweiten-Bonus 20 % als ehrlicher Mehrwert", () => {
    const t = calculateTrip({
      pHome: 2,
      pCz: 1.5,
      fillLiters: 62,
      tankCapacityL: 62,
      consumptionLPer100km: 5.2,
      dOnewayKm: 50,
      remainingRangeKm: 450,
      cardFeePercent: 0,
      mealEur: 0,
      ausflugWertEur: 0,
      czRangeBonusPercent: 20,
      minNetSavingEur: 5,
    });
    // fillUsedL ≈ 41.2 → Extra-km = 41.2/0.052 * 0.2 ≈ 158.5 → Wert = 158.5*0.052*2 ≈ 16.48
    expect(t.extraRangeKm).toBeCloseTo(158.46, 0);
    expect(t.rangeBonusWertEur).toBeCloseTo(t.fillUsedL * 0.2 * 2, 2);
    expect(t.mitReichweite).toBeCloseTo(t.mitAusflug + t.rangeBonusWertEur, 5);
    expect(t.lohntMitReichweite).toBe(true);
  });
});
