import { useEffect, useMemo, useRef, useState } from "react";
import { calculateTrip } from "../shared/calc";
import { DEFAULT_CONFIG } from "../shared/config";
import type { CheckResponse, RouteOption } from "../shared/types";
import { ageLabel, eur, kc, liters, localWhen, price3 } from "./format";
import { CookieBanner, LegalLinks, LegalModal, type LegalPage } from "./Legal";
import { loadLocale, saveLocale, t, type Locale } from "./i18n";
import { CheckWow, type ProgressState } from "./CheckWow";
import type { NearbyPlace } from "../shared/types";

type Fuel = "e10" | "e5" | "diesel";

const SETTINGS_KEY = "tank-check-settings";
const LAST_CZ_KEY = "tank-check-last-cz";

type Settings = {
  fuel: Fuel;
  rangeKm: string;
  cons: string;
  meal: string;
  fee: string;
  ausflug: string;
  /** Option: beobachteten CZ-Reichweiten-Bonus (~20 %) mitrechnen. */
  rangeBonus: boolean;
  czManual: string;
};

type LastCzPrice = {
  priceKc: number;
  timestamp: string;
  fuel: Fuel;
};

function defaultSettings(): Settings {
  return {
    fuel: "e10",
    rangeKm: String(DEFAULT_CONFIG.remainingRangeKm),
    cons: String(DEFAULT_CONFIG.consumptionLPer100km).replace(".", ","),
    meal: String(DEFAULT_CONFIG.mealEur),
    fee: String(DEFAULT_CONFIG.cardFeePercent).replace(".", ","),
    ausflug: String(DEFAULT_CONFIG.ausflugWertEur),
    rangeBonus: true,
    czManual: "",
  };
}

function loadLastCz(): LastCzPrice | null {
  try {
    const raw = localStorage.getItem(LAST_CZ_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as LastCzPrice;
    if (!Number.isFinite(p.priceKc) || !p.timestamp) return null;
    return p;
  } catch {
    return null;
  }
}

function saveLastCz(priceKc: number, timestamp: string, fuel: Fuel): void {
  try {
    const row: LastCzPrice = { priceKc, timestamp, fuel };
    localStorage.setItem(LAST_CZ_KEY, JSON.stringify(row));
  } catch {
    /* ignore */
  }
}

function loadSettings(): Settings {
  const d = defaultSettings();
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return d;
    const parsed = JSON.parse(raw) as Partial<Settings> & { useLive?: boolean };
    const { useLive: _drop, ...rest } = parsed;
    const merged = { ...d, ...rest };
    if (merged.fuel !== "e5" && merged.fuel !== "e10" && merged.fuel !== "diesel") {
      merged.fuel = d.fuel;
    }
    merged.rangeBonus = rest.rangeBonus !== false;
    return merged;
  } catch {
    return d;
  }
}

function safeNaviHref(url: string): string | undefined {
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

function num(v: string, fallback: number): number {
  const n = Number(v.trim().replace("%", "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function osmEmbed(fromLat: number, fromLng: number, toLat: number, toLng: number): string {
  const minLat = Math.min(fromLat, toLat) - 0.15;
  const maxLat = Math.max(fromLat, toLat) + 0.15;
  const minLng = Math.min(fromLng, toLng) - 0.25;
  const maxLng = Math.max(fromLng, toLng) + 0.25;
  return (
    `https://www.openstreetmap.org/export/embed.html?bbox=${minLng},${minLat},${maxLng},${maxLat}` +
    `&layer=mapnik&marker=${toLat},${toLng}`
  );
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [locale, setLocale] = useState<Locale>(loadLocale);
  const [menuOpen, setMenuOpen] = useState(false);
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [routeName, setRouteName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needCz, setNeedCz] = useState(false);
  const [pending, setPending] = useState(false);
  const [legalPage, setLegalPage] = useState<LegalPage>(null);
  const [lastCz, setLastCz] = useState<LastCzPrice | null>(loadLastCz);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [wowDone, setWowDone] = useState(false);
  const [celebrateOuting, setCelebrateOuting] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const progressTimer = useRef<number | null>(null);

  const SCAN_NAMES = [
    "One1 Rozvadov",
    "OMV Rozvadov",
    "MOL Cheb",
    "EuroOil Folmava",
    "Shell Cheb",
    "Benzina",
  ];

  function clearProgressTimer() {
    if (progressTimer.current != null) {
      window.clearInterval(progressTimer.current);
      progressTimer.current = null;
    }
  }

  function startProgressRoll() {
    clearProgressTimer();
    let tick = 0;
    setProgress({ step: 0, pct: 8, scanName: SCAN_NAMES[0]! });
    progressTimer.current = window.setInterval(() => {
      tick += 1;
      const step = Math.min(4, Math.floor(tick / 3));
      const pct = Math.min(92, 8 + tick * 4);
      setProgress({
        step,
        pct,
        scanName: SCAN_NAMES[tick % SCAN_NAMES.length]!,
      });
    }, 700);
  }

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  /** GPS vorwärmen (Permission/Cache), damit der erste Klick nicht wegen Timeout abbricht. */
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      () => {},
      () => {},
      { enableHighAccuracy: false, timeout: 30_000, maximumAge: 300_000 },
    );
  }, []);

  useEffect(() => {
    saveLocale(locale);
    document.documentElement.lang = locale === "cs" ? "cs" : "de";
  }, [locale]);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    else if (result) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [error, result]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  useEffect(() => () => clearProgressTimer(), []);

  function saveSettings(next: Settings) {
    setSettings(next);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    setMenuOpen(false);
  }

  function readPosition(
    options: PositionOptions,
  ): Promise<{ lat: number; lng: number }> {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => reject(err),
        options,
      );
    });
  }

  async function locate(): Promise<{ lat: number; lng: number }> {
    if (!navigator.geolocation) {
      throw new Error(t(locale, "errNoGps"));
    }
    // Erster Klick: GPS oft noch kalt → Timeout bei 8s/highAccuracy.
    // Zweiter Versuch nutzt Cache → wirkt „beim 2. Mal ok“.
    try {
      return await readPosition({
        enableHighAccuracy: true,
        timeout: 20_000,
        maximumAge: 120_000,
      });
    } catch (first) {
      const code =
        first && typeof first === "object" && "code" in first
          ? Number((first as GeolocationPositionError).code)
          : 0;
      if (code === 1) {
        // PERMISSION_DENIED
        throw new Error(t(locale, "errGpsDenied"));
      }
      try {
        return await readPosition({
          enableHighAccuracy: false,
          timeout: 25_000,
          maximumAge: 300_000,
        });
      } catch (second) {
        const code2 =
          second && typeof second === "object" && "code" in second
            ? Number((second as GeolocationPositionError).code)
            : 0;
        if (code2 === 1) throw new Error(t(locale, "errGpsDenied"));
        if (code2 === 3 || code === 3) throw new Error(t(locale, "errGpsTimeout"));
        throw new Error(t(locale, "errGpsDenied"));
      }
    }
  }

  async function runCheck(opts?: { useLastCz?: boolean }) {
    setError(null);
    setNeedCz(false);
    setPending(true);
    setResult(null);
    setWowDone(false);
    setCelebrateOuting(false);
    startProgressRoll();
    try {
      setProgress((p) => (p ? { ...p, step: 0, pct: 12 } : p));
      const pos = await locate();
      setProgress((p) =>
        p ? { ...p, step: 1, pct: Math.max(p.pct, 22) } : p,
      );
      const payload: Record<string, unknown> = {
        lat: pos.lat,
        lng: pos.lng,
        fuelType: settings.fuel,
        czRangeBonusPercent: settings.rangeBonus
          ? DEFAULT_CONFIG.czRangeBonusPercent
          : 0,
      };
      const manual = settings.czManual.trim().replace(",", ".");
      if (manual) {
        payload.czPriceKc = Number(manual);
      } else if (opts?.useLastCz && lastCz) {
        payload.czPriceKc = lastCz.priceKc;
      }

      setProgress((p) =>
        p ? { ...p, step: 2, pct: Math.max(p.pct, 35) } : p,
      );
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "CZ_PRICE_REQUIRED") {
          setNeedCz(true);
          setError(t(locale, "errCzRequired"));
          setResult(null);
          if (!lastCz) setMenuOpen(true);
          return;
        }
        const msg =
          typeof data.error === "string" && data.error.length < 200
            ? data.error
            : t(locale, "errCheckFailed");
        throw new Error(msg);
      }
      const body = data as CheckResponse;
      clearProgressTimer();
      const log = body.scanLog?.length ? body.scanLog : SCAN_NAMES;
      const outing =
        body.trip?.lohntAusflug === true ||
        (body.lohntSich && !body.trip?.lohntSprit);
      setCelebrateOuting(Boolean(outing || body.lohntSich));
      setProgress({
        step: 4,
        pct: 100,
        scanName: log[0] || SCAN_NAMES[0]!,
      });
      setWowDone(true);
      // Kurz echte Stationsnamen durchrollen
      let i = 0;
      const roll = window.setInterval(() => {
        i += 1;
        if (i >= log.length) {
          window.clearInterval(roll);
          return;
        }
        setProgress((p) =>
          p ? { ...p, scanName: log[i] || p.scanName, pct: 100, step: 4 } : p,
        );
      }, 180);
      setResult(body);
      setRouteName(body.routen[0]?.name ?? body.strecke.borderName);
      if (body.tschechien.kind !== "manual" || !opts?.useLastCz) {
        saveLastCz(body.tschechien.priceKc, body.tschechien.timestamp, settings.fuel);
        setLastCz({
          priceKc: body.tschechien.priceKc,
          timestamp: body.tschechien.timestamp,
          fuel: settings.fuel,
        });
      }
      window.setTimeout(() => {
        window.clearInterval(roll);
        setProgress(null);
        setWowDone(false);
      }, 1600);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : t(locale, "errUnknown"));
      setProgress(null);
      setWowDone(false);
    } finally {
      clearProgressTimer();
      setPending(false);
    }
  }

  const fuelLabel =
    settings.fuel === "diesel" ? t(locale, "diesel") : settings.fuel.toUpperCase();

  return (
    <div className="app-shell relative mx-auto flex min-h-dvh max-w-lg flex-col px-4 pb-12 pt-7 sm:px-5 sm:pt-10">
      <div className="app-shell__frame flex flex-1 flex-col px-5 pb-8 pt-6 sm:px-6 sm:pt-7">
        <header className="mb-6 animate-[fadeUp_0.55s_ease-out]">
          <div className="journey-rail mb-4">
            <span>{t(locale, "journeyDe")}</span>
            <span className="journey-rail__line" aria-hidden />
            <span className="text-[var(--color-amber-road)]">{t(locale, "journeyLabel")}</span>
            <span className="journey-rail__line" aria-hidden />
            <span>{t(locale, "journeyCz")}</span>
          </div>

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="brand-hero font-display text-[2.65rem] font-extrabold sm:text-5xl">
                {t(locale, "brand")}
              </p>
              <p className="mt-3 max-w-[22rem] text-[0.95rem] leading-snug text-[var(--color-paper)]/72">
                {t(locale, "tagline")}
              </p>
            </div>
            <div className="mt-1 flex shrink-0 flex-col items-end gap-2">
              <LangSwitch locale={locale} onChange={setLocale} />
              <button
                type="button"
                aria-label={t(locale, "openSettings")}
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen(true)}
                className="grid size-11 place-items-center rounded-2xl border border-white/15 bg-white/10 text-[var(--color-paper)] shadow-sm backdrop-blur-sm transition hover:bg-white/16"
              >
                <svg width="22" height="16" viewBox="0 0 22 16" aria-hidden="true">
                  <path
                    d="M1 1.5h20M1 8h20M1 14.5h20"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          </div>
        </header>

        <section className="space-y-3.5 animate-[fadeUp_0.65s_ease-out]">
          <div className="panel-glass overflow-hidden rounded-2xl">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="w-full px-4 py-3.5 text-left text-sm text-[var(--color-ink)]/85"
            >
              <span className="font-semibold text-[var(--color-moss-deep)]">
                {t(locale, "yourSetup")}
              </span>
              <span className="mt-0.5 block text-xs text-[var(--color-ink)]/55">
                {t(locale, "setupLine", {
                  fuel: fuelLabel,
                  cons: settings.cons || "—",
                  km: settings.rangeKm || "—",
                  meal: settings.meal || "—",
                  fee: settings.fee || "—",
                })}
              </span>
            </button>
            <div className="border-t border-[var(--color-moss)]/12 px-4 py-3">
              <button
                type="button"
                role="switch"
                aria-checked={settings.rangeBonus}
                onClick={() =>
                  setSettings((s) => ({ ...s, rangeBonus: !s.rangeBonus }))
                }
                className="flex w-full items-center gap-3 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[var(--color-moss-deep)]">
                    {t(locale, "rangeBonusLabel")}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-[var(--color-ink)]/55">
                    {t(locale, "rangeBonusHomeHint")}
                  </span>
                </span>
                <span
                  className={
                    "relative h-7 w-12 shrink-0 rounded-full transition-colors " +
                    (settings.rangeBonus
                      ? "bg-[var(--color-ok)]"
                      : "bg-[var(--color-mist)]")
                  }
                  aria-hidden
                >
                  <span
                    className={
                      "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform " +
                      (settings.rangeBonus ? "translate-x-5" : "translate-x-0.5")
                    }
                  />
                </span>
              </button>
            </div>
          </div>

          <OutingPlanCard locale={locale} fuelType={settings.fuel} />

          {error && (
            <div
              ref={errorRef}
              className="space-y-2 rounded-2xl border border-[var(--color-danger)]/35 bg-[var(--color-danger)]/15 px-4 py-3 text-sm text-[#ffc4bc]"
              role="alert"
            >
              <p>{error}</p>
              {needCz && lastCz && (
                <div className="space-y-1.5 text-[var(--color-paper)]">
                  <p className="text-xs text-[var(--color-paper)]/70">
                    {t(locale, "lastPriceHint")}
                  </p>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => runCheck({ useLastCz: true })}
                    className="rounded-xl bg-[var(--color-amber-road)] px-3 py-2 text-sm font-semibold text-[var(--color-moss-deep)] disabled:opacity-60"
                  >
                    {t(locale, "useLastPrice", {
                      price: kc(lastCz.priceKc),
                      age: ageLabel(lastCz.timestamp, locale),
                    })}
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => runCheck()}
            disabled={pending}
            className="cta-pass w-full rounded-2xl px-4 py-4 text-lg disabled:opacity-60"
          >
            {pending ? t(locale, "checking") : t(locale, "checkNow")}
          </button>

          {progress && (
            <CheckWow
              locale={locale}
              progress={progress}
              celebrateOuting={celebrateOuting}
              done={wowDone}
            />
          )}
        </section>

        {result && (
          <div ref={resultRef} className="mt-2">
            <ResultCard
              locale={locale}
              data={result}
              routeName={routeName ?? result.strecke.borderName}
              onRoute={setRouteName}
              remainingRangeKm={num(settings.rangeKm, DEFAULT_CONFIG.remainingRangeKm)}
              consumptionLPer100km={num(
                settings.cons,
                DEFAULT_CONFIG.consumptionLPer100km,
              )}
              mealEur={num(settings.meal, DEFAULT_CONFIG.mealEur)}
              cardFeePercent={num(settings.fee, DEFAULT_CONFIG.cardFeePercent)}
              ausflugWertEur={num(settings.ausflug, DEFAULT_CONFIG.ausflugWertEur)}
              czRangeBonusPercent={
                settings.rangeBonus ? DEFAULT_CONFIG.czRangeBonusPercent : 0
              }
            />
          </div>
        )}

        <footer className="mt-auto pt-10 text-xs leading-relaxed text-[var(--color-paper)]/50">
          <p>{t(locale, "footer")}</p>
          <LegalLinks locale={locale} onOpen={setLegalPage} />
        </footer>
      </div>

      {menuOpen && (
        <SettingsDrawer
          locale={locale}
          onLocale={setLocale}
          settings={settings}
          needCz={needCz}
          onSave={saveSettings}
          onClose={() => setMenuOpen(false)}
        />
      )}

      <LegalModal page={legalPage} locale={locale} onClose={() => setLegalPage(null)} />
      <CookieBanner locale={locale} />
    </div>
  );
}

function NearbyBlock({
  locale,
  lat,
  lng,
}: {
  locale: Locale;
  lat: number;
  lng: number;
}) {
  const [restaurants, setRestaurants] = useState<NearbyPlace[]>([]);
  const [shops, setShops] = useState<NearbyPlace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setRestaurants([]);
    setShops([]);
    const q = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
    });
    fetch(`/api/nearby?${q}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("nearby");
        return res.json() as Promise<{
          restaurants?: NearbyPlace[];
          shops?: NearbyPlace[];
        }>;
      })
      .then((data) => {
        if (cancelled) return;
        setRestaurants(data.restaurants ?? []);
        setShops(data.shops ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setRestaurants([]);
          setShops([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  function PlaceList({
    title,
    places,
  }: {
    title: string;
    places: NearbyPlace[];
  }) {
    if (!places.length) return null;
    return (
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-moss)]">
          {title}
        </p>
        <ul className="mt-2 space-y-2.5">
          {places.map((p) => (
            <li
              key={`${p.kind}-${p.name}-${p.mapUrl}`}
              className="rounded-xl border border-[var(--color-moss)]/12 bg-white/70 px-3 py-2.5"
            >
              <p className="font-medium text-[var(--color-ink)]">
                {p.name}
                {p.recommended && (
                  <span className="ml-2 text-xs font-semibold text-[var(--color-ok)]">
                    {t(locale, "nearbyReco")}
                    {p.note ? ` · ${p.note}` : ""}
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-[var(--color-ink)]/60">
                {t(locale, "openingHours")}:{" "}
                {p.openingHours || t(locale, "hoursUnknown")}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {p.phone && (
                  <a
                    href={`tel:${p.phone.replace(/\s+/g, "")}`}
                    className="rounded-lg bg-[var(--color-moss-deep)]/90 px-2.5 py-1 text-xs font-semibold text-[var(--color-paper)]"
                  >
                    {t(locale, "nearbyPhone")}
                  </a>
                )}
                <a
                  href={p.mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-[var(--color-moss)]/25 px-2.5 py-1 text-xs font-semibold text-[var(--color-moss-deep)]"
                >
                  {t(locale, "nearbyMap")}
                </a>
                {p.website && (
                  <a
                    href={p.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-[var(--color-moss)]/25 px-2.5 py-1 text-xs font-semibold text-[var(--color-moss-deep)]"
                  >
                    {t(locale, "nearbyWeb")}
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div
      id="nearby"
      className="space-y-4 rounded-2xl border-2 border-[var(--color-moss)]/25 bg-gradient-to-b from-white/90 to-[var(--color-moss)]/8 px-4 py-4 shadow-sm"
    >
      <div>
        <p className="font-display text-xl font-bold text-[var(--color-moss-deep)]">
          {t(locale, "nearbyTitle")}
        </p>
        <p className="mt-1 text-xs text-[var(--color-ink)]/55">
          {t(locale, "nearbyHint")}
        </p>
      </div>
      {loading ? (
        <p className="text-sm font-medium text-[var(--color-moss-deep)] animate-pulse">
          {t(locale, "nearbyLoading")}
        </p>
      ) : !restaurants.length && !shops.length ? (
        <p className="text-sm text-[var(--color-ink)]/55">{t(locale, "nearbyNone")}</p>
      ) : (
        <>
          <PlaceList title={t(locale, "nearbyRestaurants")} places={restaurants} />
          <PlaceList title={t(locale, "nearbyShops")} places={shops} />
        </>
      )}
    </div>
  );
}

function LangSwitch({
  locale,
  onChange,
}: {
  locale: Locale;
  onChange: (l: Locale) => void;
}) {
  return (
    <div
      className="flex overflow-hidden rounded-xl border border-white/20 bg-white/10 text-xs font-bold backdrop-blur-sm"
      role="group"
      aria-label={t(locale, "language")}
    >
      <button
        type="button"
        onClick={() => onChange("de")}
        className={`px-2.5 py-1.5 ${
          locale === "de"
            ? "bg-[var(--color-amber-road)] text-[var(--color-moss-deep)]"
            : "text-[var(--color-paper)]/80"
        }`}
      >
        DE
      </button>
      <button
        type="button"
        onClick={() => onChange("cs")}
        className={`px-2.5 py-1.5 ${
          locale === "cs"
            ? "bg-[var(--color-amber-road)] text-[var(--color-moss-deep)]"
            : "text-[var(--color-paper)]/80"
        }`}
      >
        CZ
      </button>
    </div>
  );
}

function SettingsDrawer({
  locale,
  onLocale,
  settings,
  needCz,
  onSave,
  onClose,
}: {
  locale: Locale;
  onLocale: (l: Locale) => void;
  settings: Settings;
  needCz: boolean;
  onSave: (next: Settings) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Settings>(settings);

  function patch(p: Partial<Settings>) {
    setDraft((s) => ({ ...s, ...p }));
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label={t(locale, "closeSettings")}
        className="absolute inset-0 bg-[var(--color-moss-deep)]/40"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-label={t(locale, "settings")}
        className="relative flex h-full w-[min(100%,22rem)] flex-col bg-[var(--color-paper)] shadow-[-12px_0_40px_-20px_rgba(26,46,31,0.5)]"
      >
        <div className="flex items-center justify-between px-5 pb-3 pt-5">
          <p className="font-display text-2xl font-bold text-[var(--color-moss-deep)]">
            {t(locale, "settings")}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-[var(--color-ink)]/70"
          >
            {t(locale, "cancel")}
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-5 pb-4">
          <div>
            <p className="mb-1.5 text-sm font-semibold text-[var(--color-moss-deep)]">
              {t(locale, "language")}
            </p>
            <LangSwitch locale={locale} onChange={onLocale} />
          </div>

          <label className="block text-sm font-semibold text-[var(--color-moss-deep)]">
            {t(locale, "fuel")}
            <select
              className="mt-1 w-full rounded-xl border border-[var(--color-moss)]/20 bg-white/70 px-3 py-3 text-base outline-none focus:border-[var(--color-moss)]"
              value={draft.fuel}
              onChange={(e) => patch({ fuel: e.target.value as Fuel })}
            >
              <option value="e10">E10</option>
              <option value="e5">E5</option>
              <option value="diesel">{t(locale, "diesel")}</option>
            </select>
          </label>

          <Field
            label={t(locale, "rangeLabel")}
            value={draft.rangeKm}
            onChange={(v) => patch({ rangeKm: v })}
            hint={t(locale, "rangeHint")}
            note={t(locale, "rangeNote")}
          />
          <Field
            label={t(locale, "consLabel")}
            value={draft.cons}
            onChange={(v) => patch({ cons: v })}
            hint={t(locale, "consHint")}
            note={t(locale, "consNote")}
          />
          <Field
            label={t(locale, "mealLabel")}
            value={draft.meal}
            onChange={(v) => patch({ meal: v })}
            hint="20"
          />
          <Field
            label={t(locale, "feeLabel")}
            value={draft.fee}
            onChange={(v) => patch({ fee: v })}
            hint={t(locale, "feeHint")}
          />
          <Field
            label={t(locale, "ausflugLabel")}
            value={draft.ausflug}
            onChange={(v) => patch({ ausflug: v })}
            hint={t(locale, "ausflugHint")}
          />

          <button
            type="button"
            role="switch"
            aria-checked={draft.rangeBonus}
            onClick={() => patch({ rangeBonus: !draft.rangeBonus })}
            className="flex w-full items-center gap-3 rounded-xl border border-[var(--color-moss)]/20 bg-white/70 px-3 py-3 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-[var(--color-moss-deep)]">
                {t(locale, "rangeBonusLabel")}
              </span>
              <span className="mt-0.5 block text-xs text-[var(--color-ink)]/55">
                {t(locale, "rangeBonusHint")}
              </span>
            </span>
            <span
              className={
                "relative h-7 w-12 shrink-0 rounded-full transition-colors " +
                (draft.rangeBonus ? "bg-[var(--color-ok)]" : "bg-[var(--color-mist)]")
              }
              aria-hidden
            >
              <span
                className={
                  "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform " +
                  (draft.rangeBonus ? "translate-x-5" : "translate-x-0.5")
                }
              />
            </span>
          </button>

          <p className="text-xs text-[var(--color-ink)]/55">{t(locale, "settingsHint")}</p>

          <label className="block text-sm font-semibold text-[var(--color-moss-deep)]">
            {needCz ? t(locale, "czPriceLabelNeed") : t(locale, "czPriceLabelOpt")}
            <input
              type="text"
              inputMode="decimal"
              placeholder={t(locale, "czPricePlaceholder")}
              className="mt-1 w-full rounded-xl border border-[var(--color-moss)]/20 bg-white/70 px-3 py-3 text-base outline-none focus:border-[var(--color-moss)]"
              value={draft.czManual}
              onChange={(e) => patch({ czManual: e.target.value })}
            />
          </label>
        </div>

        <div className="border-t border-[var(--color-moss)]/10 bg-[var(--color-paper)] px-5 py-4">
          <button
            type="button"
            onClick={() => onSave(draft)}
            className="w-full rounded-2xl bg-[var(--color-moss-deep)] px-4 py-3.5 text-base font-semibold text-[var(--color-paper)]"
          >
            {t(locale, "save")}
          </button>
        </div>
      </aside>
    </div>
  );
}

type OutingSuggestPayload = {
  configured: boolean;
  ready: boolean;
  sampleBuckets: number;
  minBuckets: number;
  bestWeekdays: number[];
  suggestedDates: string[];
  note: string;
  weekdayLabels: string[];
  pickedDate: string | null;
  pickedWeekdayLabel: string | null;
  pickedAvgSpreadEur: number | null;
  pickedRank: number | null;
};

function OutingPlanCard({
  locale,
  fuelType,
}: {
  locale: Locale;
  fuelType: Fuel;
}) {
  const today = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }, []);
  const [date, setDate] = useState(today);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<OutingSuggestPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const q = new URLSearchParams({
      fuelType,
      date,
    });
    fetch(`/api/outing-suggest?${q}`)
      .then(async (res) => {
        const body = (await res.json()) as OutingSuggestPayload & { error?: string };
        if (!res.ok) throw new Error(body.error || "fail");
        if (!cancelled) setData(body);
      })
      .catch(() => {
        if (!cancelled) {
          setData({
            configured: false,
            ready: false,
            sampleBuckets: 0,
            minBuckets: 24,
            bestWeekdays: [],
            suggestedDates: [],
            note: "",
            weekdayLabels: [],
            pickedDate: date,
            pickedWeekdayLabel: null,
            pickedAvgSpreadEur: null,
            pickedRank: null,
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date, fuelType]);

  const dayNames =
    data?.bestWeekdays
      .map((wd) => data.weekdayLabels[wd])
      .filter(Boolean)
      .join(", ") || t(locale, "outingNoDates");
  const dates =
    data?.suggestedDates?.length
      ? data.suggestedDates.join(", ")
      : t(locale, "outingNoDates");

  let detail: string | null = null;
  if (data?.configured && data.pickedDate && data.pickedWeekdayLabel) {
    if (data.pickedAvgSpreadEur == null) {
      detail = t(locale, "outingPickedUnknown");
    } else if (data.pickedRank != null && data.pickedRank <= 3) {
      detail = t(locale, "outingPickedGood", {
        date: data.pickedDate,
        weekday: data.pickedWeekdayLabel,
        spread: data.pickedAvgSpreadEur.toFixed(3).replace(".", ","),
        rank: data.pickedRank,
      });
    } else {
      detail = t(locale, "outingPickedWeak", {
        date: data.pickedDate,
        weekday: data.pickedWeekdayLabel,
        spread: data.pickedAvgSpreadEur.toFixed(3).replace(".", ","),
      });
    }
  }

  return (
    <div className="panel-glass rounded-2xl px-4 py-3.5">
      <p className="font-semibold text-[var(--color-moss-deep)]">
        {t(locale, "outingPlanTitle")}
      </p>
      <p className="mt-0.5 text-xs text-[var(--color-ink)]/55">
        {t(locale, "outingPlanHint")}
      </p>
      <label className="mt-3 block text-sm font-semibold text-[var(--color-moss-deep)]">
        {t(locale, "outingDateLabel")}
        <input
          type="date"
          min={today}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1 w-full rounded-xl border border-[var(--color-moss)]/20 bg-white/70 px-3 py-2.5 text-base outline-none focus:border-[var(--color-moss)]"
        />
      </label>
      <div className="mt-2 space-y-1.5 text-xs leading-snug text-[var(--color-ink)]/70">
        {loading && <p>{t(locale, "outingSuggestLoading")}</p>}
        {!loading && data && !data.configured && (
          <p>{t(locale, "outingNotConfigured")}</p>
        )}
        {!loading && data?.configured && !data.ready && (
          <p>
            {t(locale, "outingCollecting", {
              n: data.sampleBuckets,
              min: data.minBuckets,
            })}
          </p>
        )}
        {!loading && data?.configured && data.ready && (
          <p>
            {t(locale, "outingReady", {
              days: dayNames,
              dates,
            })}
          </p>
        )}
        {!loading && detail && <p>{detail}</p>}
        <p className="text-[var(--color-ink)]/45">{t(locale, "outingDisclaimer")}</p>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
  note,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint: string;
  note?: string;
}) {
  return (
    <label className="block text-sm font-semibold text-[var(--color-moss-deep)]">
      {label}
      <input
        type="text"
        inputMode="decimal"
        placeholder={hint}
        className="mt-1 w-full rounded-xl border border-[var(--color-moss)]/20 bg-white/70 px-3 py-2.5 text-base outline-none focus:border-[var(--color-moss)]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {note && (
        <span className="mt-1 block text-xs font-normal text-[var(--color-ink)]/55">{note}</span>
      )}
    </label>
  );
}

function ResultCard({
  locale,
  data,
  routeName,
  onRoute,
  remainingRangeKm,
  consumptionLPer100km,
  mealEur,
  cardFeePercent,
  ausflugWertEur,
  czRangeBonusPercent,
}: {
  locale: Locale;
  data: CheckResponse;
  routeName: string;
  onRoute: (name: string) => void;
  remainingRangeKm: number;
  consumptionLPer100km: number;
  mealEur: number;
  cardFeePercent: number;
  ausflugWertEur: number;
  czRangeBonusPercent: number;
}) {
  const [shareNote, setShareNote] = useState<string | null>(null);

  const selected: RouteOption =
    data.routen.find((r) => r.name === routeName) ?? data.routen[0] ?? {
      name: data.strecke.borderName,
      destLat: data.strecke.destLat,
      destLng: data.strecke.destLng,
      onewayKm: data.strecke.onewayKm,
      durationH: 0,
      routingSource: data.strecke.routingSource,
      naviUrl: data.naviUrl || "",
      priceKc: data.tschechien.priceKc,
      priceEur: data.tschechien.priceEur,
      priceKind: data.tschechien.kind,
      priceSource: data.tschechien.source,
      priceTimestamp: data.tschechien.timestamp,
    };

  const pCz = selected.priceEur ?? data.tschechien.priceEur;

  const trip = useMemo(
    () =>
      calculateTrip({
        pHome: data.deutschland.priceEur,
        pCz,
        fillLiters: data.annahmen.fillLiters,
        tankCapacityL: data.annahmen.tankCapacityL,
        consumptionLPer100km,
        dOnewayKm: selected.onewayKm,
        remainingRangeKm,
        cardFeePercent,
        mealEur,
        ausflugWertEur,
        czRangeBonusPercent,
        tollEur: data.annahmen.tollEur,
        minNetSavingEur: data.annahmen.minNetSavingEur,
      }),
    [
      data,
      pCz,
      selected.onewayKm,
      remainingRangeKm,
      consumptionLPer100km,
      cardFeePercent,
      mealEur,
      ausflugWertEur,
      czRangeBonusPercent,
    ],
  );

  const headline = !trip.kannHin
    ? t(locale, "restNotEnough")
    : trip.lohntSprit
      ? t(locale, "worthFuel")
      : trip.lohntAusflug
        ? t(locale, "worthTrip")
        : trip.lohntMitReichweite
          ? t(locale, "worthRange")
          : t(locale, "notWorthFuel");
  const ok = trip.lohntSprit || trip.lohntAusflug || trip.lohntMitReichweite;
  const czName = selected.stationName || data.tschechien.label;
  const czAddress = selected.stationAddress;
  const czHours = selected.stationOpeningHours;
  const naviHref = safeNaviHref(selected.naviUrl);

  const hints = useMemo(() => {
    const list = [
      t(locale, "hintOutbound"),
      t(locale, "hintFillRoom"),
      t(locale, "hintMealOuting"),
      t(locale, "hintFx", {
        rate: data.kursKcProEur.toFixed(3).replace(".", ","),
      }),
      t(locale, "hintStationPrice"),
    ];
    if (czRangeBonusPercent > 0) {
      list.splice(
        3,
        0,
        t(locale, "hintRangeBonus", {
          pct: czRangeBonusPercent,
          km: Math.round(trip.extraRangeKm),
          eur: eur(trip.rangeBonusWertEur),
        }),
      );
    }
    if (!trip.kannHin) list.unshift(t(locale, "hintRangeShort"));
    if (data.tschechien.note?.includes("7 Tage") || data.tschechien.note?.includes("7 dní")) {
      list.unshift(t(locale, "hintStale"));
    } else {
      const ageH =
        (Date.now() - Date.parse(selected.priceTimestamp)) / 3_600_000;
      if (Number.isFinite(ageH) && ageH > 24) list.unshift(t(locale, "hintPriceOld"));
    }
    return list;
  }, [
    locale,
    data.kursKcProEur,
    data.tschechien.note,
    trip.kannHin,
    trip.extraRangeKm,
    trip.rangeBonusWertEur,
    czRangeBonusPercent,
    selected.priceTimestamp,
  ]);

  const shareText = useMemo(() => {
    const lines = [
      `${t(locale, "shareTitle")}: ${headline}`,
      czName + (czAddress ? ` · ${czAddress}` : ""),
      `${kc(selected.priceKc)} Kč/l · ${Math.round(selected.onewayKm)} km · ${t(locale, "approxMin", { min: Math.round(selected.durationH * 60) })}`,
      czHours
        ? `${t(locale, "openingHours")}: ${czHours}`
        : `${t(locale, "openingHours")}: ${t(locale, "hoursUnknown")}`,
      `${t(locale, "germany")}: ${price3(data.deutschland.priceEur)} €/l (${ageLabel(data.deutschland.timestamp, locale)})`,
      `${t(locale, "czechiaFx")}: ${kc(selected.priceKc)} Kč/l (${ageLabel(selected.priceTimestamp, locale)})`,
    ];
    if (czRangeBonusPercent > 0) {
      lines.push(
        t(locale, "shareRangeBonus", {
          km: Math.round(trip.extraRangeKm),
          eur: eur(trip.rangeBonusWertEur),
        }),
      );
    }
    lines.push(t(locale, "priceGuarantee"));
    if (naviHref) lines.push(naviHref);
    return lines.filter(Boolean).join("\n");
  }, [
    locale,
    headline,
    czName,
    czAddress,
    czHours,
    selected,
    data.deutschland,
    naviHref,
    trip.extraRangeKm,
    trip.rangeBonusWertEur,
    czRangeBonusPercent,
  ]);

  async function shareNative() {
    try {
      if (navigator.share) {
        await navigator.share({ title: t(locale, "shareTitle"), text: shareText });
        return;
      }
      await navigator.clipboard.writeText(shareText);
      setShareNote(t(locale, "shareCopied"));
    } catch {
      /* Abbruch / Fehler */
    }
  }

  async function shareCopy() {
    try {
      await navigator.clipboard.writeText(shareText);
      setShareNote(t(locale, "shareCopied"));
    } catch {
      setShareNote(null);
    }
  }

  const waHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  return (
    <article
      className="result-wow mt-7 space-y-5 rounded-3xl border border-[var(--color-moss)]/15 bg-white/75 p-5 shadow-[0_20px_50px_-28px_rgba(26,46,31,0.45)] backdrop-blur-sm"
      aria-live="polite"
    >
      <div>
        <p
          className={`font-display text-2xl font-bold tracking-tight ${
            ok ? "text-[var(--color-ok)]" : "text-[var(--color-danger)]"
          }`}
        >
          {headline}
        </p>
        <p className="mt-1 text-sm text-[var(--color-ink)]/65">
          {t(locale, "asOf", {
            when: localWhen(data.checkedAt, locale),
            rate: price3(data.kursKcProEur),
          })}
        </p>
        <p className="mt-1 text-sm text-[var(--color-ink)]/55">
          {t(locale, "priceAgeDe", { age: ageLabel(data.deutschland.timestamp, locale) })}
          {" · "}
          {t(locale, "priceAgeCz", { age: ageLabel(selected.priceTimestamp, locale) })}
        </p>
        <p className="mt-1 text-sm text-[var(--color-ink)]/55">
          {t(locale, "priceGuarantee")}
        </p>
      </div>

      <fieldset>
        <legend className="text-xs font-semibold uppercase tracking-wide text-[var(--color-moss)]">
          {t(locale, "pickRoute")}
        </legend>
        <div className="mt-2 space-y-2">
          {data.routen.map((r, i) => (
            <label
              key={r.name}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm ${
                r.name === selected.name
                  ? "border-[var(--color-moss)] bg-[var(--color-moss)]/8"
                  : "border-[var(--color-moss)]/15 bg-white/50"
              }`}
            >
              <input
                type="radio"
                name="route"
                className="mt-1 accent-[var(--color-moss)]"
                checked={r.name === selected.name}
                onChange={() => onRoute(r.name)}
              />
              <span>
                <span className="font-medium">
                  {t(locale, "bestRank", { n: r.rank ?? i + 1 })}
                  {i === 0 ? ` · ${t(locale, "shortest")}` : ""}
                  {" · "}
                  {r.stationName || r.name}
                </span>
                <span className="mt-0.5 block text-xs text-[var(--color-ink)]/55">
                  {r.stationAddress ? `${r.stationAddress} · ` : ""}
                  {kc(r.priceKc)} Kč/l · {Math.round(r.onewayKm)} km ·{" "}
                  {t(locale, "approxMin", { min: Math.round(r.durationH * 60) })}
                  {r.sparEur != null
                    ? ` · ${t(locale, "sparHint", { spar: eur(r.sparEur) })}`
                    : ""}
                </span>
                <span className="mt-0.5 block text-xs text-[var(--color-ink)]/55">
                  {t(locale, "openingHours")}:{" "}
                  {r.stationOpeningHours || t(locale, "hoursUnknown")}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="rounded-2xl border border-[var(--color-moss)]/15 bg-white/60 px-4 py-3 text-sm">
        <p className="font-semibold text-[var(--color-moss-deep)]">{czName}</p>
        <p className="mt-1 text-[var(--color-ink)]/75">
          <span className="font-medium">{t(locale, "address")}: </span>
          {czAddress || t(locale, "hoursUnknown")}
        </p>
        <p className="mt-1 text-[var(--color-ink)]/75">
          <span className="font-medium">{t(locale, "openingHours")}: </span>
          {czHours || t(locale, "hoursUnknown")}
        </p>
      </div>

      <NearbyBlock
        locale={locale}
        lat={selected.destLat}
        lng={selected.destLng}
      />

      <div className="overflow-hidden rounded-2xl border border-[var(--color-moss)]/15">
        <iframe
          title={t(locale, "mapTitle")}
          className="h-48 w-full"
          src={osmEmbed(data.homeLat, data.homeLng, selected.destLat, selected.destLng)}
        />
      </div>
      {naviHref && (
        <a
          href={naviHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center rounded-2xl bg-[var(--color-amber-road)] px-4 py-3.5 text-base font-semibold text-[var(--color-ink)] transition hover:brightness-105"
        >
          {t(locale, "navi", { name: selected.stationName || selected.name })}
        </a>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={shareNative}
          className="rounded-xl border border-[var(--color-moss)]/20 bg-white/70 px-3 py-2 text-sm font-semibold text-[var(--color-moss-deep)]"
        >
          {t(locale, "share")}
        </button>
        <button
          type="button"
          onClick={shareCopy}
          className="rounded-xl border border-[var(--color-moss)]/20 bg-white/70 px-3 py-2 text-sm font-semibold text-[var(--color-moss-deep)]"
        >
          {t(locale, "shareCopy")}
        </button>
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl border border-[var(--color-moss)]/20 bg-white/70 px-3 py-2 text-sm font-semibold text-[var(--color-moss-deep)]"
        >
          {t(locale, "shareWhatsApp")}
        </a>
        {shareNote && (
          <span className="self-center text-xs text-[var(--color-ok)]">{shareNote}</span>
        )}
      </div>

      <p className="text-xs text-[var(--color-ink)]/55">
        {t(locale, "roundTrip", {
          one: Math.round(selected.onewayKm),
          round: Math.round(selected.onewayKm * 2),
          lat: selected.destLat.toFixed(4),
          lng: selected.destLng.toFixed(4),
        })}
      </p>

      <dl className="space-y-3 text-sm">
        <Row
          label={t(locale, "germany")}
          value={`${data.deutschland.stationName}, ${data.deutschland.fuelType.toUpperCase()} ${price3(data.deutschland.priceEur)} €/l`}
          meta={[
            data.deutschland.address,
            data.deutschland.openingHours
              ? `${t(locale, "openingHours")}: ${data.deutschland.openingHours}`
              : undefined,
            data.deutschland.isOpen === true
              ? t(locale, "openNow")
              : data.deutschland.isOpen === false
                ? t(locale, "closedNow")
                : undefined,
            `${ageLabel(data.deutschland.timestamp, locale)} · ${data.deutschland.source}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        />
        <Row
          label={t(locale, "czechiaFx")}
          value={`${czName}${czAddress ? `, ${czAddress}` : ""} · ${kc(selected.priceKc)} Kč = ${price3(pCz)} €/l`}
          meta={[
            czHours
              ? `${t(locale, "openingHours")}: ${czHours}`
              : `${t(locale, "openingHours")}: ${t(locale, "hoursUnknown")}`,
            `${selected.priceSource} · ${ageLabel(selected.priceTimestamp, locale)} · ${price3(data.kursKcProEur)} Kč/€ · ${t(locale, "withCard", { price: price3(trip.pCzPay) })}`,
          ].join(" · ")}
        />
        <Row
          label={t(locale, "tankLogic")}
          value={
            trip.kannHin
              ? t(locale, "tankOk", {
                  km: Math.round(remainingRangeKm),
                  liters: liters(trip.onewayLiters),
                })
              : t(locale, "tankFail", {
                  have: Math.round(remainingRangeKm),
                  need: Math.round(selected.onewayKm),
                })
          }
          meta={t(locale, "tankMeta", {
            left: liters(trip.remainingAfterArrivalL),
            fill: liters(trip.fillUsedL),
            full: data.annahmen.fillLiters,
          })}
        />
        <Row
          label={t(locale, "fuelCalc")}
          value={t(locale, "fuelCalcValue", {
            save: eur(trip.ersparnisBrutto),
            back: eur(trip.fahrtRueckEur),
          })}
          meta={t(locale, "fuelCalcMeta", {
            opp: eur(trip.fahrtHinOpportunitaetEur),
            toll: eur(data.mautEur),
          })}
        />
        <Row
          label={t(locale, "fuelNet")}
          value={eur(trip.nettoSprit)}
          meta={t(locale, "fuelNetMeta", { strict: eur(trip.nettoStreng) })}
        />
        <Row
          label={t(locale, "cashAfterMeal")}
          value={eur(trip.kasse)}
          meta={t(locale, "cashMeta", { meal: eur(mealEur) })}
        />
        <Row
          label={t(locale, "withOuting")}
          value={eur(trip.mitAusflug)}
          meta={t(locale, "outingMeta", {
            value: eur(ausflugWertEur),
            need: eur(trip.noetigerAusflugWertEur),
          })}
        />
        {czRangeBonusPercent > 0 && (
          <Row
            label={t(locale, "rangeBonus")}
            value={t(locale, "rangeBonusValue", {
              km: Math.round(trip.extraRangeKm),
              eur: eur(trip.rangeBonusWertEur),
            })}
            meta={t(locale, "rangeBonusMeta", {
              pct: czRangeBonusPercent,
              total: eur(trip.mitReichweite),
            })}
          />
        )}
      </dl>

      <ul className="space-y-1 text-xs text-[var(--color-ink)]/55">
        {hints.map((h) => (
          <li key={h}>• {h}</li>
        ))}
      </ul>
    </article>
  );
}

function Row({
  label,
  value,
  meta,
}: {
  label: string;
  value: string;
  meta?: string;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-moss)]">
        {label}
      </dt>
      <dd className="mt-0.5 font-medium leading-snug">{value}</dd>
      {meta && <dd className="text-xs text-[var(--color-ink)]/55">{meta}</dd>}
    </div>
  );
}
