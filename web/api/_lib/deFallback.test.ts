import { describe, expect, it } from "vitest";
import { parseCityPage } from "./deFallback";

const SAMPLE = `
<p class="ns_p">Ein Liter E10 kostet aktuell ⌀ 1,87 Euro. <strong class="isstrong">Bester Preis: 1,869 Euro!</strong> (Stand: 08.11.2026, 10:20 Uhr)</p>
<div id="station-x"><div class="ns_price"><em title="E10-Preis JET Tankstelle Oberasbach: 1.869 Euro">1.86</em><sup>9</sup></div>
<p><strong class="isstrong">JET Tankstelle Oberasbach</strong><br>Rothenburger Str. 33</p></div>
<li>Günstigster Preis: 1,869 €</li><li>Stand: 08.11.2026, 10:20 Uhr</li>
`;

describe("deFallback parseCityPage", () => {
  it("liest besten Preis und Station", () => {
    const q = parseCityPage(SAMPLE, "e10");
    expect(q.price).toBeCloseTo(1.869, 3);
    expect(q.stationName).toContain("JET");
    expect(q.source).toMatch(/MTS-K/);
  });
});
