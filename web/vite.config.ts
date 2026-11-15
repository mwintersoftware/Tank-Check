import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { loadEnv } from "vite";

function tankCheckApi(): Plugin {
  return {
    name: "tank-check-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || "";
        if (
          !url.startsWith("/api/check") &&
          !url.startsWith("/api/nearby") &&
          !url.startsWith("/api/outing-suggest") &&
          !url.startsWith("/api/cron/snapshot")
        ) {
          return next();
        }
        try {
          const env = loadEnv(server.config.mode, server.config.envDir, "");
          for (const [k, v] of Object.entries(env)) {
            if (!(k in process.env)) process.env[k] = v;
          }

          if (url.startsWith("/api/cron/snapshot")) {
            const secret = process.env.CRON_SECRET?.trim();
            const u = new URL(url, "http://localhost");
            const auth = req.headers.authorization;
            const qSecret = u.searchParams.get("secret");
            const ok =
              secret &&
              (auth === `Bearer ${secret}` || qSecret === secret);
            if (!ok) {
              res.statusCode = 401;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Nicht autorisiert" }));
              return;
            }
            const { runPriceSnapshot } = await import("./api/_lib/snapshotPrices.ts");
            const result = await runPriceSnapshot();
            res.statusCode = result.ok ? 200 : result.skipped ? 503 : 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(result));
            return;
          }

          if (url.startsWith("/api/outing-suggest")) {
            const { assertRateLimit, publicErrorMessage } =
              await import("./shared/validate.ts");
            assertRateLimit(req.socket.remoteAddress || "dev");
            const u = new URL(url, "http://localhost");
            const fuelRaw = (u.searchParams.get("fuelType") || "e10").toLowerCase();
            const fuelType =
              fuelRaw === "e5" || fuelRaw === "e10" || fuelRaw === "diesel"
                ? fuelRaw
                : "e10";
            const { suggestOutingDays } = await import("./api/_lib/priceDb.ts");
            const base = await suggestOutingDays({ fuelType });
            const WEEKDAYS_DE = [
              "Sonntag",
              "Montag",
              "Dienstag",
              "Mittwoch",
              "Donnerstag",
              "Freitag",
              "Samstag",
            ];
            const dateRaw = u.searchParams.get("date") || "";
            const picked = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : null;
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
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                ...base,
                fuelType,
                pickedDate: picked,
                pickedWeekday,
                pickedWeekdayLabel:
                  pickedWeekday != null ? WEEKDAYS_DE[pickedWeekday] : null,
                pickedAvgSpreadEur: pickedSpread,
                pickedRank,
                weekdayLabels: WEEKDAYS_DE,
              }),
            );
            return;
          }

          if (url.startsWith("/api/nearby")) {
            const { assertRateLimit, ValidationError, publicErrorMessage } =
              await import("./shared/validate.ts");
            assertRateLimit(req.socket.remoteAddress || "dev");
            const u = new URL(url, "http://localhost");
            const lat = Number(u.searchParams.get("lat"));
            const lng = Number(u.searchParams.get("lng"));
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
              throw Object.assign(new Error("lat und lng sind erforderlich."), {
                name: "ValidationError",
              });
            }
            const { fetchNearbyPlaces } = await import("./api/_lib/nearbyPlaces.ts");
            const nearby = await fetchNearbyPlaces(lat, lng);
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(nearby));
            return;
          }

          const chunks: Buffer[] = [];
          await new Promise<void>((resolve, reject) => {
            let total = 0;
            req.on("data", (c: Buffer) => {
              total += c.length;
              if (total > 4096) {
                reject(Object.assign(new Error("Anfrage zu groß."), { name: "ValidationError" }));
                return;
              }
              chunks.push(c);
            });
            req.on("end", () => resolve());
            req.on("error", reject);
          });
          const raw = Buffer.concat(chunks).toString("utf8");
          let body: unknown = {};
          if (raw) {
            try {
              body = JSON.parse(raw);
            } catch {
              throw Object.assign(new Error("Ungültiges JSON."), { name: "ValidationError" });
            }
          }

          const {
            runCheck,
            CzPriceRequiredError,
          } = await import("./shared/runCheck.ts");
          const {
            assertRateLimit,
            parseCheckBody,
            publicErrorMessage,
            ValidationError,
          } = await import("./shared/validate.ts");
          const providers = await import("./api/_lib/providers.ts");

          assertRateLimit(req.socket.remoteAddress || "dev");
          const payload = await runCheck(parseCheckBody(body), {
            fetchDeCheapest: providers.fetchDeCheapest,
            fetchEurCzk: providers.fetchEurCzk,
            fetchCzPrice: providers.fetchCzPrice,
            fetchCzStations: providers.fetchCzStations,
            fetchCzStationsFresh: providers.fetchCzStationsFresh,
            fetchOpeningHours: providers.fetchOpeningHours,
            fetchOpeningHoursBatch: providers.fetchOpeningHoursBatch,
            manualCzPrice: providers.manualCzPrice,
            routeDistance: providers.routeDistance,
          });
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.setHeader("X-Content-Type-Options", "nosniff");
          res.end(JSON.stringify(payload));
        } catch (err) {
          const { CzPriceRequiredError } = await import("./shared/runCheck.ts");
          const { ValidationError, publicErrorMessage } = await import("./shared/validate.ts");
          if (err instanceof CzPriceRequiredError) {
            res.statusCode = 422;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({ error: "CZ_PRICE_REQUIRED", message: err.message }),
            );
            return;
          }
          if (err instanceof ValidationError || (err as Error)?.name === "ValidationError") {
            const msg = err instanceof Error ? err.message : "Ungültige Anfrage";
            res.statusCode = msg.includes("Zu viele") ? 429 : 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: msg }));
            return;
          }
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: publicErrorMessage(err) }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), tankCheckApi()],
  envDir: ".",
});
