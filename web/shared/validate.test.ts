import { describe, expect, it } from "vitest";
import {
  normalizeCheckRequest,
  safeCitySlug,
  safeHttpsUrl,
  ValidationError,
} from "./validate";

describe("validate", () => {
  it("nimmt gültige Koordinaten und Sorte", () => {
    const r = normalizeCheckRequest({
      lat: 49.4,
      lng: 11.0,
      fuelType: "e10",
      czPriceKc: 39.5,
    });
    expect(r.lat).toBeCloseTo(49.4);
    expect(r.fuelType).toBe("e10");
    expect(r.czPriceKc).toBeCloseTo(39.5);
  });

  it("lehnt ungültige Koordinaten ab", () => {
    expect(() => normalizeCheckRequest({ lat: 200, lng: 0 })).toThrow(ValidationError);
  });

  it("lehnt fremde Kraftstoffsorte ab", () => {
    expect(() =>
      normalizeCheckRequest({ lat: 49, lng: 11, fuelType: "lpg" }),
    ).toThrow(ValidationError);
  });

  it("säubert Orts-Slugs", () => {
    expect(safeCitySlug("oberasbach")).toBe("oberasbach");
    expect(safeCitySlug("../etc/passwd")).toBe("oberasbach");
  });

  it("erlaubt nur https-URLs", () => {
    expect(safeHttpsUrl("https://example.com/x")).toContain("https://");
    expect(safeHttpsUrl("javascript:alert(1)")).toBeNull();
  });
});
