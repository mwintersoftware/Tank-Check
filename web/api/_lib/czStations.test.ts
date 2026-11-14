import { describe, expect, it } from "vitest";
import { parseStationList, pickCheapest } from "./czStations";

const SAMPLE = `
<article class="station-card" data-station-id="99" data-lat="49.649536" data-lng="12.532454"
  data-valid-at="2026-11-13 07:02:23" itemscope itemtype="https://schema.org/GasStation">
  <a class="station-card__overlay" href="/stanice/plzensky-kraj/rozvadov/one1-rozvadov-d5-smer-nemecko-99"></a>
  <div class="station-name">One1</div>
  <div class="station-address"><span>D5 směr Německo</span>, <span>Rozvadov</span></div>
  <div class="station-prices">
    <div class="price-chip diesel"><span class="price-chip__label">Nafta</span>
      <span class="price-chip__value" data-czk="45.400">45,40</span></div>
    <div class="price-chip natural"><span class="price-chip__label">Natural 95</span>
      <span class="price-chip__value" data-czk="40.600">40,60</span></div>
  </div>
  <button class="report-link" data-prices="{&quot;diesel&quot;:&quot;45.400&quot;,&quot;natural95&quot;:&quot;40.600&quot;}"
    data-price-ages="{&quot;diesel&quot;:&quot;2026-11-13 07:02:23&quot;,&quot;natural95&quot;:&quot;2026-11-13 13:02:29&quot;}">x</button>
</article>
<article class="station-card" data-lat="49.67857" data-lng="12.60122" data-valid-at="2026-11-12 17:02:35">
  <a class="station-card__overlay" href="/stanice/plzensky-kraj/rozvadov/mol-rozvadov-tir-rozvadov"></a>
  <div class="station-name">MOL</div>
  <div class="station-address">Svatá Kateřina 116, Rozvadov</div>
  <button class="report-link" data-prices="{&quot;diesel&quot;:&quot;45.800&quot;,&quot;natural95&quot;:&quot;41.200&quot;}"
    data-price-ages="{&quot;diesel&quot;:&quot;2026-11-12 17:02:35&quot;,&quot;natural95&quot;:&quot;2026-11-13 18:03:20&quot;}">x</button>
</article>
<article class="station-card" data-lat="49.64" data-lng="12.53" data-valid-at="2026-08-11 00:00:00">
  <div class="station-name">Alt</div>
  <button class="report-link" data-prices="{&quot;diesel&quot;:&quot;40.000&quot;,&quot;natural95&quot;:&quot;37.000&quot;}"
    data-price-ages="{&quot;diesel&quot;:&quot;2026-08-11 00:00:00&quot;,&quot;natural95&quot;:&quot;2026-08-11 00:00:00&quot;}">x</button>
</article>
`;

const NOW = Date.parse("2026-11-14T12:00:00Z");

describe("czStations", () => {
  it("liest Natural-95-Stationspreis samt Koordinaten", () => {
    const list = parseStationList(SAMPLE, "e10", NOW);
    const one = list.find((s) => s.name === "One1");
    expect(one?.priceKc).toBeCloseTo(40.6, 3);
    expect(one?.lat).toBeCloseTo(49.649536, 5);
    expect(one?.stale).toBe(false);
  });

  it("nimmt die günstigste frische Station, nicht den veralteten Tiefstpreis", () => {
    const best = pickCheapest(parseStationList(SAMPLE, "e10", NOW));
    expect(best?.name).toBe("One1");
    expect(best?.priceKc).toBeCloseTo(40.6, 3);
  });

  it("nimmt Nafta bei Diesel", () => {
    const best = pickCheapest(parseStationList(SAMPLE, "diesel", NOW));
    expect(best?.priceKc).toBeCloseTo(45.4, 3);
  });
});
