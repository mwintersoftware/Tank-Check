import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchNearbyPlaces } from "./_lib/nearbyPlaces.js";
import { ValidationError, assertRateLimit, publicErrorMessage } from "../shared/validate.js";

function clientKey(req: VercelRequest): string {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) return xf.split(",")[0]!.trim();
  if (Array.isArray(xf) && xf[0]) return xf[0].split(",")[0]!.trim();
  return req.socket?.remoteAddress || "unknown";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=600");

  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Methode nicht erlaubt" });
  }

  try {
    assertRateLimit(clientKey(req));
    const src = req.method === "GET" ? req.query : (req.body as Record<string, unknown>);
    const lat = Number(src?.lat);
    const lng = Number(src?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new ValidationError("lat und lng sind erforderlich.");
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new ValidationError("Koordinaten außerhalb des gültigen Bereichs.");
    }
    const nearby = await fetchNearbyPlaces(lat, lng);
    return res.status(200).json(nearby);
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: publicErrorMessage(err) });
  }
}
