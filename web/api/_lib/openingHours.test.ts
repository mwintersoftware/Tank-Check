import { describe, expect, it } from "vitest";
import { humanizeOpeningHours } from "./openingHours";

describe("openingHours", () => {
  it("macht 24/7 lesbar", () => {
    expect(humanizeOpeningHours("24/7")).toBe("Nonstop (24/7)");
    expect(humanizeOpeningHours("nonstop")).toBe("Nonstop (24/7)");
  });

  it("lässt normale Intervalle stehen", () => {
    expect(humanizeOpeningHours("Mo-Fr 06:00-22:00")).toBe("Mo-Fr 06:00-22:00");
  });
});
