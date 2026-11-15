-- Preishistorie für Ausflugstag-Empfehlungen (einmalig anlegen, falls Auto-Migrate fehlt)
CREATE TABLE IF NOT EXISTS price_snapshots (
  id BIGSERIAL PRIMARY KEY,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  region TEXT NOT NULL,
  fuel_type TEXT NOT NULL,
  price NUMERIC NOT NULL,
  currency TEXT NOT NULL,
  kind TEXT NOT NULL,
  source TEXT NOT NULL,
  source_ts TIMESTAMPTZ,
  lat NUMERIC,
  lng NUMERIC,
  station_key TEXT,
  station_name TEXT,
  border_name TEXT,
  meta JSONB
);

CREATE INDEX IF NOT EXISTS idx_price_snapshots_captured
  ON price_snapshots (captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_price_snapshots_region_fuel
  ON price_snapshots (region, fuel_type, captured_at DESC);
