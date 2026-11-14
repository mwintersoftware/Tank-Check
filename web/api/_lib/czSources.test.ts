import { describe, expect, it } from "vitest";
import { parseFuelwideCz, parseMapapumpPage } from "./czSources";

const SAMPLE = `
<span>Aktualizováno 14. 11. 2026</span>
<div class="price-card__label">Nafta</div>
<div class="price-card__val"><span data-czk="44.794">44,79</span></div>
<div class="price-card__label">Natural 95</div>
<div class="price-card__val"><span data-czk="39.694">39,69</span></div>
`;

describe("czSources", () => {
  it("liest Natural-95-Tagesmittel", () => {
    const q = parseMapapumpPage(SAMPLE, "e10");
    expect(q.priceKc).toBeCloseTo(39.694, 3);
    expect(q.kind).toBe("average");
    expect(q.stationName).toContain("Natural 95");
  });

  it("liest Nafta-Tagesmittel", () => {
    expect(parseMapapumpPage(SAMPLE, "diesel").priceKc).toBeCloseTo(44.794, 3);
  });

  it("rechnet EU-Wochenpreis in Kč um", () => {
    const q = parseFuelwideCz(
      {
        observations: [
          { fuelType: "petrol95", price: 1.653, currency: "EUR", observedAt: "2026-11-09" },
        ],
      },
      "e10",
      24.2,
    );
    expect(q.priceKc).toBeCloseTo(1.653 * 24.2, 2);
    expect(q.source).toMatch(/Oil Bulletin/);
  });
});
