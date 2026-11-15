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
        if (!url.startsWith("/api/check") && !url.startsWith("/api/nearby")) {
          return next();
        }
        try {
          const env = loadEnv(server.config.mode, server.config.envDir, "");
          for (const [k, v] of Object.entries(env)) {
            if (!(k in process.env)) process.env[k] = v;
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
