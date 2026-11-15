import type { VercelRequest, VercelResponse } from "@vercel/node";
import { suggestOutingDays } from "./_lib/priceDb.js";
import { assertRateLimit, publicErrorMessage } from "../shared/validate.js";

function clientKey(req: VercelRequest): string {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) return xf.split(",")[0]!.trim();
  if (Array.isArray(xf) && xf[0]) return xf[0].split(",")[0]!.trim();
  return req.socket?.remoteAddress || "unknown";
}

const WEEKDAYS_DE = [
  "Sonntag",
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=600");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Methode nicht erlaubt" });
  }

  try {
    assertRateLimit(clientKey(req));
    const fuelRaw = String(req.query.fuelType || "e10").toLowerCase();
    const fuelType =
      fuelRaw === "e5" || fuelRaw === "e10" || fuelRaw === "diesel" ? fuelRaw : "e10";
    const dateRaw = typeof req.query.date === "string" ? req.query.date : "";
    const picked =
      /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : null;

    const base = await suggestOutingDays({ fuelType });
    let pickedWeekday: number | null = null;
    let pickedSpread: number | null = null;
    let pickedRank: number | null = null;

    if (picked) {
      pickedWeekday = new Date(`${picked}T12:00:00Z`).getUTCDay();
      const hit = base.weekdaySpreads.find((w) => w.weekday === pickedWeekday);
      if (hit) {
        pickedSpread = hit.avgSpreadEur;
        pickedRank =
          base.weekdaySpreads.findIndex((w) => w.weekday === pickedWeekday) + 1;
      }
    }

    return res.status(200).json({
      ...base,
      fuelType,
      pickedDate: picked,
      pickedWeekday,
      pickedWeekdayLabel:
        pickedWeekday != null ? WEEKDAYS_DE[pickedWeekday] : null,
      pickedAvgSpreadEur: pickedSpread,
      pickedRank,
      weekdayLabels: WEEKDAYS_DE,
    });
  } catch (err) {
    return res.status(500).json({ error: publicErrorMessage(err) });
  }
}
