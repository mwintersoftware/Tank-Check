import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { loadEnv } from "vite";

function tankCheckApi(): Plugin {
  return {
    name: "tank-check-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/check")) return next();
        try {
          const env = loadEnv(server.config.mode, server.config.envDir, "");
          for (const [k, v] of Object.entries(env)) {
            if (!(k in process.env)) process.env[k] = v;
          }

          const chunks: Buffer[] = [];
          await new Promise<void>((resolve) => {
            req.on("data", (c) => chunks.push(c));
            req.on("end", () => resolve());
          });
          const raw = Buffer.concat(chunks).toString("utf8");
          const body = raw ? JSON.parse(raw) : {};

          const { runCheck, CzPriceRequiredError } = await import("./shared/runCheck.ts");
          const providers = await import("./api/_lib/providers.ts");
          const payload = await runCheck(body, {
            fetchDeCheapest: providers.fetchDeCheapest,
            fetchEurCzk: providers.fetchEurCzk,
            fetchCzPrice: providers.fetchCzPrice,
            fetchCzStations: providers.fetchCzStations,
            manualCzPrice: providers.manualCzPrice,
            routeDistance: providers.routeDistance,
          });
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(payload));
        } catch (err) {
          const { CzPriceRequiredError } = await import("./shared/runCheck.ts");
          if (err instanceof CzPriceRequiredError) {
            res.statusCode = 422;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({ error: "CZ_PRICE_REQUIRED", message: err.message }),
            );
            return;
          }
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : "Unbekannter Fehler",
            }),
          );
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), tankCheckApi()],
  envDir: ".",
});
