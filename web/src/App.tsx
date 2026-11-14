import { useEffect, useMemo, useRef, useState } from "react";
import { calculateTrip } from "../shared/calc";
import { DEFAULT_CONFIG } from "../shared/config";
import type { CheckResponse, RouteOption } from "../shared/types";
import { eur, kc, localWhen, price3 } from "./format";

type Fuel = "e10" | "e5" | "diesel";

const HOME = { lat: DEFAULT_CONFIG.homeLat, lng: DEFAULT_CONFIG.homeLng };
const SETTINGS_KEY = "tank-check-settings";

type Settings = {
  fuel: Fuel;
  rangeKm: string;
  meal: string;
  fee: string;
  ausflug: string;
  useLive: boolean;
  czManual: string;
};

function defaultSettings(): Settings {
  return {
    fuel: "e10",
    rangeKm: String(DEFAULT_CONFIG.remainingRangeKm),
    meal: String(DEFAULT_CONFIG.mealEur),
    fee: String(DEFAULT_CONFIG.cardFeePercent).replace(".", ","),
    ausflug: String(DEFAULT_CONFIG.ausflugWertEur),
    useLive: true,
    czManual: "",
  };
}

function loadSettings(): Settings {
  const d = defaultSettings();
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return d;
    return { ...d, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return d;
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [routeName, setRouteName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needCz, setNeedCz] = useState(false);
  const [pending, setPending] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

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

  function saveSettings(next: Settings) {
    setSettings(next);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    setMenuOpen(false);
  }

  async function locate(): Promise<{ lat: number; lng: number }> {
    if (!settings.useLive || !navigator.geolocation) return HOME;
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(HOME),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
      );
    });
  }

  async function runCheck() {
    setError(null);
    setNeedCz(false);
    setPending(true);
    try {
      const pos = await locate();
      const payload: Record<string, unknown> = {
        lat: pos.lat,
        lng: pos.lng,
        fuelType: settings.fuel,
      };
      const manual = settings.czManual.trim().replace(",", ".");
      if (manual) payload.czPriceKc = Number(manual);

      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "CZ_PRICE_REQUIRED") {
          setNeedCz(true);
          setError(data.message);
          setResult(null);
          setMenuOpen(true);
          return;
        }
        throw new Error(data.error || data.message || "Prüfung fehlgeschlagen");
      }
      const body = data as CheckResponse;
      setResult(body);
      setRouteName(body.routen[0]?.name ?? body.strecke.borderName);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
    } finally {
      setPending(false);
    }
  }

  const fuelLabel = settings.fuel.toUpperCase();

  return (
    <div className="relative mx-auto flex min-h-dvh max-w-lg flex-col px-5 pb-10 pt-8 sm:pt-12">
      <header className="mb-7 flex items-start justify-between gap-3 animate-[fadeUp_0.5s_ease-out]">
        <div>
          <p className="font-display text-4xl font-bold tracking-tight text-[var(--color-moss-deep)] sm:text-5xl">
            Tank-Check
          </p>
          <p className="mt-2 max-w-[22rem] text-[0.95rem] leading-snug text-[var(--color-ink)]/75">
            Rest reicht hin – zurück mit CZ-Sprit. Essen, Karte, Quatschen.
          </p>
        </div>
        <button
          type="button"
          aria-label="Einstellungen öffnen"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
          className="mt-1 grid size-11 shrink-0 place-items-center rounded-xl border border-[var(--color-moss)]/20 bg-white/70 text-[var(--color-moss-deep)] shadow-sm"
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
      </header>

      <section className="space-y-3.5 animate-[fadeUp_0.55s_ease-out]">
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="w-full rounded-2xl border border-[var(--color-moss)]/15 bg-white/60 px-4 py-3 text-left text-sm text-[var(--color-ink)]/80"
        >
          <span className="font-semibold text-[var(--color-moss-deep)]">Dein Setup</span>
          <span className="mt-0.5 block text-xs text-[var(--color-ink)]/55">
            {fuelLabel} · noch {settings.rangeKm || "—"} km im Tank · Essen {settings.meal || "—"} € ·
            Karte {settings.fee || "—"} %
          </span>
        </button>

        {error && (
          <p
            ref={errorRef}
            className="rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-4 py-3 text-sm text-[var(--color-danger)]"
            role="alert"
          >
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={runCheck}
          disabled={pending}
          className="w-full rounded-2xl bg-[var(--color-moss-deep)] px-4 py-4 text-lg font-semibold text-[var(--color-paper)] shadow-[0_12px_30px_-12px_rgba(26,46,31,0.7)] transition hover:bg-[var(--color-moss)] disabled:opacity-60"
        >
          {pending ? "Prüfe …" : "Jetzt prüfen"}
        </button>
      </section>

      {result && (
        <div ref={resultRef}>
          <ResultCard
            data={result}
            routeName={routeName ?? result.strecke.borderName}
            onRoute={setRouteName}
            remainingRangeKm={num(settings.rangeKm, DEFAULT_CONFIG.remainingRangeKm)}
            mealEur={num(settings.meal, DEFAULT_CONFIG.mealEur)}
            cardFeePercent={num(settings.fee, DEFAULT_CONFIG.cardFeePercent)}
            ausflugWertEur={num(settings.ausflug, DEFAULT_CONFIG.ausflugWertEur)}
          />
        </div>
      )}

      <footer className="mt-auto pt-10 text-xs leading-relaxed text-[var(--color-ink)]/55">
        Persönliche Mini-App. DE: Stationspreise. CZ: günstigste Tankstelle hinter der Grenze.
        Kurs: EZB-Referenz. Karte: typische Auslandsgebühr, in Kč zahlen.
      </footer>

      {menuOpen && (
        <SettingsDrawer
          settings={settings}
          needCz={needCz}
          onSave={saveSettings}
          onClose={() => setMenuOpen(false)}
        />
      )}

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function SettingsDrawer({
  settings,
  needCz,
  onSave,
  onClose,
}: {
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
        aria-label="Einstellungen schließen"
        className="absolute inset-0 bg-[var(--color-moss-deep)]/40"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-label="Einstellungen"
        className="relative flex h-full w-[min(100%,22rem)] flex-col bg-[var(--color-paper)] shadow-[-12px_0_40px_-20px_rgba(26,46,31,0.5)]"
      >
        <div className="flex items-center justify-between px-5 pb-3 pt-5">
          <p className="font-display text-2xl font-bold text-[var(--color-moss-deep)]">
            Einstellungen
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-[var(--color-ink)]/70"
          >
            Abbrechen
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-5 pb-4">
          <label className="block text-sm font-semibold text-[var(--color-moss-deep)]">
            Sorte
            <select
              className="mt-1 w-full rounded-xl border border-[var(--color-moss)]/20 bg-white/70 px-3 py-3 text-base outline-none focus:border-[var(--color-moss)]"
              value={draft.fuel}
              onChange={(e) => patch({ fuel: e.target.value as Fuel })}
            >
              <option value="e10">E10</option>
              <option value="e5">E5</option>
              <option value="diesel">Diesel</option>
            </select>
          </label>

          <Field
            label="Noch km im Tank"
            value={draft.rangeKm}
            onChange={(v) => patch({ rangeKm: v })}
            hint="z. B. 450"
            note="Was der Tacho zeigt, bevor du losfährst. Nicht die Tankgröße (die ist 62 l)."
          />
          <Field
            label="Essen € (2 Pers.)"
            value={draft.meal}
            onChange={(v) => patch({ meal: v })}
            hint="12"
          />
          <Field
            label="Kartengebühr %"
            value={draft.fee}
            onChange={(v) => patch({ fee: v })}
            hint="1,75"
          />
          <Field
            label="Ausflug wert €"
            value={draft.ausflug}
            onChange={(v) => patch({ ausflug: v })}
            hint="Hausnummer"
          />

          <label className="flex items-center gap-3 text-sm text-[var(--color-ink)]/85">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-moss)]"
              checked={draft.useLive}
              onChange={(e) => patch({ useLive: e.target.checked })}
            />
            Live-Standort nutzen (sonst Oberasbach)
          </label>

          <p className="text-xs text-[var(--color-ink)]/55">
            Verbrauch {DEFAULT_CONFIG.consumptionLPer100km.toString().replace(".", ",")} l / 100 km.
            CZ-Preis holt die App von der günstigsten Tankstelle hinter der Grenze.
          </p>

          <label className="block text-sm font-semibold text-[var(--color-moss-deep)]">
            CZ-Preis Kč/l {needCz ? "(nötig, Quelle fehlte)" : "(nur falls Stationen fehlen)"}
            <input
              type="text"
              inputMode="decimal"
              placeholder="wird automatisch geholt"
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
            Speichern
          </button>
        </div>
      </aside>
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
  data,
  routeName,
  onRoute,
  remainingRangeKm,
  mealEur,
  cardFeePercent,
  ausflugWertEur,
}: {
  data: CheckResponse;
  routeName: string;
  onRoute: (name: string) => void;
  remainingRangeKm: number;
  mealEur: number;
  cardFeePercent: number;
  ausflugWertEur: number;
}) {
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
        consumptionLPer100km: data.annahmen.consumptionLPer100km,
        dOnewayKm: selected.onewayKm,
        remainingRangeKm,
        cardFeePercent,
        mealEur,
        ausflugWertEur,
        tollEur: data.annahmen.tollEur,
        minNetSavingEur: data.annahmen.minNetSavingEur,
      }),
    [
      data,
      pCz,
      selected.onewayKm,
      remainingRangeKm,
      cardFeePercent,
      mealEur,
      ausflugWertEur,
    ],
  );

  const headline = !trip.kannHin
    ? "REST REICHT NICHT"
    : trip.lohntSprit
      ? "LOHNT SICH (Sprit)"
      : trip.lohntAusflug
        ? "LOHNT ALS AUSFLUG"
        : "LOHNT SICH NICHT (nur Sprit)";
  const ok = trip.lohntSprit || trip.lohntAusflug;
  const czLabel = selected.stationName
    ? `${selected.stationName}${selected.stationAddress ? `, ${selected.stationAddress}` : ""}`
    : data.tschechien.label;

  return (
    <article
      className="mt-7 animate-[fadeUp_0.4s_ease-out] space-y-5 rounded-3xl border border-[var(--color-moss)]/15 bg-white/75 p-5 shadow-[0_20px_50px_-28px_rgba(26,46,31,0.45)] backdrop-blur-sm"
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
          Stand {localWhen(data.checkedAt)} · Kurs {price3(data.kursKcProEur)} Kč/€ (EZB-Referenz)
        </p>
      </div>

      <fieldset>
        <legend className="text-xs font-semibold uppercase tracking-wide text-[var(--color-moss)]">
          Strecke wählen (kürzeste zuerst)
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
                  {r.name}
                  {i === 0 ? " · kürzeste" : ""}
                </span>
                <span className="mt-0.5 block text-xs text-[var(--color-ink)]/55">
                  {r.stationName ? `${r.stationName} · ` : ""}
                  {kc(r.priceKc)} Kč/l · {Math.round(r.onewayKm)} km · ca.{" "}
                  {Math.round(r.durationH * 60)} min
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="overflow-hidden rounded-2xl border border-[var(--color-moss)]/15">
        <iframe
          title="Strecke auf der Karte"
          className="h-48 w-full"
          src={osmEmbed(data.homeLat, data.homeLng, selected.destLat, selected.destLng)}
        />
      </div>
      <a
        href={selected.naviUrl}
        target="_blank"
        rel="noreferrer"
        className="flex w-full items-center justify-center rounded-2xl bg-[var(--color-amber-road)] px-4 py-3.5 text-base font-semibold text-[var(--color-ink)] transition hover:brightness-105"
      >
        Navi: {selected.stationName || selected.name}
      </a>
      <p className="text-xs text-[var(--color-ink)]/55">
        {Math.round(selected.onewayKm)} km hin, {Math.round(selected.onewayKm * 2)} km hin und
        zurück. Ziel {selected.destLat.toFixed(4)}, {selected.destLng.toFixed(4)}
      </p>

      <dl className="space-y-3 text-sm">
        <Row
          label="Deutschland"
          value={`${data.deutschland.stationName}, ${data.deutschland.fuelType.toUpperCase()} ${price3(data.deutschland.priceEur)} €/l`}
          meta={`${localWhen(data.deutschland.timestamp)}, ${data.deutschland.source}`}
        />
        <Row
          label="Tschechien + Kurs"
          value={`${czLabel} ${kc(selected.priceKc)} Kč = ${price3(pCz)} €/l`}
          meta={`${selected.priceSource} · ${price3(data.kursKcProEur)} Kč je € · mit Karte ${price3(trip.pCzPay)} €/l`}
        />
        <Row
          label="Tank-Logik"
          value={
            trip.kannHin
              ? `Rest ${Math.round(remainingRangeKm)} km reicht. Hin ${trip.onewayLiters.toFixed(1).replace(".", ",")} l schon im Tank.`
              : `Rest reicht nicht (${Math.round(remainingRangeKm)} km < ${Math.round(selected.onewayKm)} km).`
          }
          meta={`Ankunft ~${trip.remainingAfterArrivalL.toFixed(1).replace(".", ",")} l übrig → ${trip.fillUsedL.toFixed(1).replace(".", ",")} l nachfüllen (nicht ${data.annahmen.fillLiters} l in den vollen Tank).`}
        />
        <Row
          label="Sprit-Rechnung"
          value={`Ersparnis ${eur(trip.ersparnisBrutto)} · Rückweg −${eur(trip.fahrtRueckEur)}`}
          meta={`Hinweg-Opportunität (streng) −${eur(trip.fahrtHinOpportunitaetEur)} · Maut ${eur(data.mautEur)}`}
        />
        <Row
          label="Sprit-Netto"
          value={eur(trip.nettoSprit)}
          meta={`Streng inkl. Hinweg-Restsprit: ${eur(trip.nettoStreng)}`}
        />
        <Row
          label="Kasse nach Essen"
          value={eur(trip.kasse)}
          meta={`Essen ${eur(mealEur)} für 2 Personen (gutes Essen).`}
        />
        <Row
          label="Mit Ausflug"
          value={eur(trip.mitAusflug)}
          meta={`Quatschen/Ausflug mit ${eur(ausflugWertEur)} angesetzt. Damit die Kasse aufgeht, muss der Nachmittag dir mindestens ${eur(trip.noetigerAusflugWertEur)} wert sein – unbezahlbar zählt trotzdem.`}
        />
      </dl>

      <ul className="space-y-1 text-xs text-[var(--color-ink)]/55">
        {data.hints.map((h) => (
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
