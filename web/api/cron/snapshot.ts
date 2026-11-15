import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runPriceSnapshot } from "../_lib/snapshotPrices.js";

function authorized(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.authorization;
  if (auth === `Bearer ${secret}`) return true;
  const q = req.query.secret;
  const fromQuery = Array.isArray(q) ? q[0] : q;
  return typeof fromQuery === "string" && fromQuery === secret;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Methode nicht erlaubt" });
  }

  if (!authorized(req)) {
    return res.status(401).json({ error: "Nicht autorisiert" });
  }

  const result = await runPriceSnapshot();
  const status = result.ok ? 200 : result.skipped ? 503 : 500;
  return res.status(status).json(result);
}
