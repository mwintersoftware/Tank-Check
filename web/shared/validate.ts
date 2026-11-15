/** Eingabeprüfung für /api/check – gemeinsame Grenzen für Server und Dev-Middleware. */

import type { CheckRequest } from "./types.js";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

const FUELS = new Set(["e5", "e10", "diesel"]);

const MAX_BODY_BYTES = 4_096;

/** Einfaches In-Memory-Limit je IP (Serverless: pro Instanz). */
const hits = new Map<string, { count: number; reset: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;

export function assertRateLimit(key: string): void {
  const now = Date.now();
  const row = hits.get(key);
  if (!row || now > row.reset) {
    hits.set(key, { count: 1, reset: now + RATE_WINDOW_MS });
    return;
  }
  row.count += 1;
  if (row.count > RATE_MAX) {
    throw new ValidationError("Zu viele Anfragen. Bitte kurz warten.");
  }
}

export function assertBodySize(raw: string | Buffer | undefined): void {
  const n = typeof raw === "string" ? Buffer.byteLength(raw, "utf8") : (raw?.byteLength ?? 0);
  if (n > MAX_BODY_BYTES) {
    throw new ValidationError("Anfrage zu groß.");
  }
}

export function parseCheckBody(raw: unknown): CheckRequest {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ValidationError("Ungültiger Anfragekörper.");
  }
  const o = raw as Record<string, unknown>;
  return normalizeCheckRequest({
    lat: o.lat,
    lng: o.lng,
    fuelType: o.fuelType,
    czPriceKc: o.czPriceKc,
  });
}

export function normalizeCheckRequest(input: {
  lat: unknown;
  lng: unknown;
  fuelType?: unknown;
  czPriceKc?: unknown;
}): CheckRequest {
  const lat = Number(input.lat);
  const lng = Number(input.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new ValidationError("lat und lng sind erforderlich.");
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new ValidationError("Koordinaten außerhalb des gültigen Bereichs.");
  }

  let fuelType: CheckRequest["fuelType"];
  if (input.fuelType != null && input.fuelType !== "") {
    const f = String(input.fuelType).toLowerCase();
    if (!FUELS.has(f)) {
      throw new ValidationError("Ungültige Kraftstoffsorte.");
    }
    fuelType = f as CheckRequest["fuelType"];
  }

  let czPriceKc: number | undefined;
  if (input.czPriceKc != null && input.czPriceKc !== "") {
    const p = Number(input.czPriceKc);
    if (!Number.isFinite(p) || p < 5 || p > 100) {
      throw new ValidationError("CZ-Preis Kč/l ungültig.");
    }
    czPriceKc = p;
  }

  return { lat, lng, fuelType, czPriceKc };
}

/** Stadt-Slug nur Buchstaben/Zahlen/Bindestrich – kein Pfad-Traversal. */
export function safeCitySlug(raw: string | undefined, fallback = "oberasbach"): string {
  const s = (raw || fallback).toLowerCase().trim();
  if (!/^[a-z0-9-]{1,64}$/.test(s)) return fallback;
  return s;
}

export function safeHttpsUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function publicErrorMessage(err: unknown): string {
  if (err instanceof ValidationError) return err.message;
  if (err instanceof Error && err.name === "CzPriceRequiredError") return err.message;
  // Keine internen URLs / Stacks nach außen
  return "Prüfung fehlgeschlagen. Bitte später erneut versuchen.";
}
