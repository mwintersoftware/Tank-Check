import type { VercelRequest, VercelResponse } from "@vercel/node";
import { CzPriceRequiredError, runCheck } from "../shared/runCheck.js";
import {
  assertBodySize,
  assertRateLimit,
  normalizeCheckRequest,
  parseCheckBody,
  publicErrorMessage,
  ValidationError,
} from "../shared/validate.js";
import * as providers from "./_lib/providers.js";

function clientKey(req: VercelRequest): string {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) return xf.split(",")[0]!.trim();
  if (Array.isArray(xf) && xf[0]) return xf[0].split(",")[0]!.trim();
  return req.socket?.remoteAddress || "unknown";
}

function securityHeaders(res: VercelResponse): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "geolocation=(self), camera=(), microphone=()");
  res.setHeader("Cache-Control", "no-store");
}

function readBody(req: VercelRequest) {
  if (req.method === "GET") {
    const q = req.query;
    return normalizeCheckRequest({
      lat: q.lat,
      lng: q.lng,
      fuelType: q.fuelType,
      czPriceKc: q.czPriceKc,
    });
  }

  const raw = typeof req.body === "string" ? req.body : undefined;
  if (raw != null) assertBodySize(raw);

  let parsed: unknown = req.body;
  if (typeof req.body === "string") {
    try {
      parsed = req.body ? JSON.parse(req.body) : {};
    } catch {
      throw new ValidationError("Ungültiges JSON.");
    }
  }
  return parseCheckBody(parsed);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  securityHeaders(res);

  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Methode nicht erlaubt" });
  }

  try {
    assertRateLimit(clientKey(req));
    const payload = await runCheck(readBody(req), {
      fetchDeCheapest: providers.fetchDeCheapest,
      fetchEurCzk: providers.fetchEurCzk,
      fetchCzPrice: providers.fetchCzPrice,
      fetchCzStations: providers.fetchCzStations,
      fetchCzStationsFresh: providers.fetchCzStationsFresh,
      fetchOpeningHours: providers.fetchOpeningHours,
      fetchOpeningHoursBatch: providers.fetchOpeningHoursBatch,
      fetchNearbyPlaces: providers.fetchNearbyPlaces,
      manualCzPrice: providers.manualCzPrice,
      routeDistance: providers.routeDistance,
    });
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json(payload);
  } catch (err) {
    if (err instanceof CzPriceRequiredError) {
      return res.status(422).json({ error: "CZ_PRICE_REQUIRED", message: err.message });
    }
    if (err instanceof ValidationError) {
      const status = err.message.includes("Zu viele") ? 429 : 400;
      return res.status(status).json({ error: err.message });
    }
    return res.status(500).json({ error: publicErrorMessage(err) });
  }
}
