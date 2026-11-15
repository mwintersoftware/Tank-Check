/** Persistente Preissnapshots für Ausflugstag-Empfehlungen. */

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export type PriceSnapshotRow = {
  region: "de" | "cz" | "fx";
  fuelType: string;
  price: number;
  currency: "EUR" | "CZK";
  kind: string;
  source: string;
  sourceTs?: string | null;
  lat?: number | null;
  lng?: number | null;
  stationKey?: string | null;
  stationName?: string | null;
  borderName?: string | null;
  meta?: Record<string, unknown> | null;
};

let schemaReady = false;

export function dbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function sqlClient(): NeonQueryFunction<false, false> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL fehlt.");
  return neon(url);
}

export async function ensurePriceSchema(): Promise<void> {
  if (!dbConfigured()) return;
  if (schemaReady) return;
  const sql = sqlClient();
  await sql`
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
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_price_snapshots_captured
    ON price_snapshots (captured_at DESC)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_price_snapshots_region_fuel
    ON price_snapshots (region, fuel_type, captured_at DESC)
  `;
  schemaReady = true;
}

export async function insertSnapshots(rows: PriceSnapshotRow[]): Promise<number> {
  if (!rows.length || !dbConfigured()) return 0;
  await ensurePriceSchema();
  const sql = sqlClient();
  let n = 0;
  for (const r of rows) {
    await sql`
      INSERT INTO price_snapshots (
        region, fuel_type, price, currency, kind, source, source_ts,
        lat, lng, station_key, station_name, border_name, meta
      ) VALUES (
        ${r.region},
        ${r.fuelType},
        ${r.price},
        ${r.currency},
        ${r.kind},
        ${r.source},
        ${r.sourceTs ? r.sourceTs : null},
        ${r.lat ?? null},
        ${r.lng ?? null},
        ${r.stationKey ?? null},
        ${r.stationName ?? null},
        ${r.borderName ?? null},
        ${r.meta ? (JSON.stringify(r.meta) as unknown as string) : null}
      )
    `;
    n += 1;
  }
  return n;
}

export type WeekdaySpread = {
  /** 0 = Sonntag … 6 = Samstag (JS getDay). */
  weekday: number;
  samples: number;
  avgSpreadEur: number;
  avgDeEur: number;
  avgCzEur: number;
};

export type OutingSuggestResult = {
  configured: boolean;
  ready: boolean;
  sampleBuckets: number;
  minBuckets: number;
  weekdaySpreads: WeekdaySpread[];
  bestWeekdays: number[];
  /** ISO-Datum YYYY-MM-DD der nächsten guten Tage. */
  suggestedDates: string[];
  note: string;
};

const MIN_BUCKETS = 24; // ~12 h bei 30-Min-Cron bzw. genug Paare

type BucketAgg = {
  de: number[];
  cz: number[];
};

function toDay(iso: string): string {
  return iso.slice(0, 10);
}

function weekdayOf(isoDate: string): number {
  // Mittag UTC → stabiler Wochentag für Mitteleuropa
  return new Date(`${isoDate}T12:00:00Z`).getUTCDay();
}

function nextDatesForWeekdays(weekdays: Set<number>, count: number, from = new Date()): string[] {
  const out: string[] = [];
  const d = new Date(from);
  d.setHours(12, 0, 0, 0);
  for (let i = 0; i < 28 && out.length < count; i++) {
    const cur = new Date(d);
    cur.setDate(d.getDate() + i);
    if (weekdays.has(cur.getDay())) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, "0");
      const day = String(cur.getDate()).padStart(2, "0");
      out.push(`${y}-${m}-${day}`);
    }
  }
  return out;
}

export async function suggestOutingDays(opts: {
  fuelType: string;
  horizonDays?: number;
}): Promise<OutingSuggestResult> {
  const fuel = opts.fuelType.toLowerCase();
  const minBuckets = MIN_BUCKETS;
  const emptyNote =
    "Noch keine gespeicherten Preise – Datensammlung läuft erst, wenn der Speicher eingerichtet ist.";

  if (!dbConfigured()) {
    return {
      configured: false,
      ready: false,
      sampleBuckets: 0,
      minBuckets,
      weekdaySpreads: [],
      bestWeekdays: [],
      suggestedDates: [],
      note: emptyNote,
    };
  }

  await ensurePriceSchema();
  const sql = sqlClient();
  const days = Math.min(90, Math.max(7, opts.horizonDays ?? 28));

  const rows = await sql`
    SELECT captured_at, region, price, currency
    FROM price_snapshots
    WHERE fuel_type = ${fuel}
      AND region IN ('de', 'cz')
      AND currency = 'EUR'
      AND captured_at > NOW() - (${days}::text || ' days')::interval
    ORDER BY captured_at ASC
  `;

  const buckets = new Map<string, BucketAgg>();
  for (const row of rows as {
    captured_at: string;
    region: string;
    price: string | number;
    currency: string;
  }[]) {
    const captured = String(row.captured_at);
    const t = new Date(captured);
    t.setUTCMinutes(t.getUTCMinutes() < 30 ? 0 : 30, 0, 0);
    const key = t.toISOString();
    let b = buckets.get(key);
    if (!b) {
      b = { de: [], cz: [] };
      buckets.set(key, b);
    }
    const price = Number(row.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    if (row.region === "de") b.de.push(price);
    if (row.region === "cz") b.cz.push(price);
  }

  type SpreadPoint = { weekday: number; spread: number; de: number; cz: number };
  const points: SpreadPoint[] = [];

  for (const [bucketIso, b] of buckets) {
    if (!b.de.length || !b.cz.length) continue;
    const de = Math.min(...b.de);
    const cz = Math.min(...b.cz);
    const day = toDay(bucketIso);
    points.push({
      weekday: weekdayOf(day),
      spread: de - cz,
      de,
      cz,
    });
  }

  const byWd = new Map<number, { spreads: number[]; des: number[]; czs: number[] }>();
  for (const p of points) {
    let g = byWd.get(p.weekday);
    if (!g) {
      g = { spreads: [], des: [], czs: [] };
      byWd.set(p.weekday, g);
    }
    g.spreads.push(p.spread);
    g.des.push(p.de);
    g.czs.push(p.cz);
  }

  const weekdaySpreads: WeekdaySpread[] = [];
  for (let wd = 0; wd < 7; wd++) {
    const g = byWd.get(wd);
    if (!g || !g.spreads.length) continue;
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    weekdaySpreads.push({
      weekday: wd,
      samples: g.spreads.length,
      avgSpreadEur: avg(g.spreads),
      avgDeEur: avg(g.des),
      avgCzEur: avg(g.czs),
    });
  }
  weekdaySpreads.sort((a, b) => b.avgSpreadEur - a.avgSpreadEur);

  const ready = points.length >= minBuckets && weekdaySpreads.length >= 3;
  const best = weekdaySpreads.slice(0, 2).map((w) => w.weekday);
  const suggestedDates = ready
    ? nextDatesForWeekdays(new Set(best.length ? best : [weekdaySpreads[0]!.weekday]), 3)
    : [];

  let note: string;
  if (points.length === 0) {
    note =
      "Noch zu wenig gespeicherte Preispaare. Cron sammelt weiter – Empfehlungen kommen, sobald genug Tage da sind.";
  } else if (!ready) {
    note = `Bisher ${points.length} Preispaare (Ziel ab ca. ${minBuckets}). Vorschau unvollständig – keine Garantie.`;
  } else {
    note =
      "Vorschlag aus gespeicherten Spreads (DE−CZ). Historisch – kein Zukunftspreis, vor Ort prüfen.";
  }

  return {
    configured: true,
    ready,
    sampleBuckets: points.length,
    minBuckets,
    weekdaySpreads,
    bestWeekdays: best,
    suggestedDates,
    note,
  };
}
