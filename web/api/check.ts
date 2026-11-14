import type { VercelRequest, VercelResponse } from "@vercel/node";
import { CzPriceRequiredError, runCheck } from "../shared/runCheck.js";
import type { CheckRequest } from "../shared/types.js";
import * as providers from "./_lib/providers.js";

function readBody(req: VercelRequest): CheckRequest {
  if (req.method === "GET") {
    const q = req.query;
    return {
      lat: Number(q.lat),
      lng: Number(q.lng),
      fuelType: (q.fuelType as CheckRequest["fuelType"]) || undefined,
      czPriceKc: q.czPriceKc != null ? Number(q.czPriceKc) : undefined,
    };
  }
  return (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as CheckRequest;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Methode nicht erlaubt" });
  }

  try {
    const payload = await runCheck(readBody(req), {
      fetchDeCheapest: providers.fetchDeCheapest,
      fetchEurCzk: providers.fetchEurCzk,
      fetchCzPrice: providers.fetchCzPrice,
      fetchCzStations: providers.fetchCzStations,
      manualCzPrice: providers.manualCzPrice,
      routeDistance: providers.routeDistance,
    });
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json(payload);
  } catch (err) {
    if (err instanceof CzPriceRequiredError) {
      return res.status(422).json({ error: "CZ_PRICE_REQUIRED", message: err.message });
    }
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    return res.status(500).json({ error: message });
  }
}
