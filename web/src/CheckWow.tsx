import type { Locale } from "./i18n";
import { t } from "./i18n";

export type ProgressState = {
  step: number;
  pct: number;
  scanName: string;
};

/** Stage-Namen für fliegende Chips je Schritt. */
const STAGE_CHIPS: Record<number, string[]> = {
  0: ["GPS", "Standort", "Route"],
  1: ["DE-Preis", "Tankstelle", "E10"],
  2: ["One1", "OMV", "MOL", "Shell", "Benzina"],
  3: ["Spar-Rechnung", "Resttank", "Ausflug"],
  4: ["Restaurant", "Café", "Einkauf", "Travel Free"],
};

type Props = {
  locale: Locale;
  progress: ProgressState;
  /** true = Ergebnis lohnt sich als Ausflug → Herzen-Finale */
  celebrateOuting?: boolean;
  done?: boolean;
};

export function CheckWow({ locale, progress, celebrateOuting, done }: Props) {
  const steps = [
    t(locale, "progressGps"),
    t(locale, "progressDe"),
    t(locale, "progressCz"),
    t(locale, "progressRoutes"),
    t(locale, "progressNearby"),
  ];
  const chips = STAGE_CHIPS[progress.step] ?? STAGE_CHIPS[2]!;
  const showHearts = progress.step >= 3 || done || celebrateOuting;

  return (
    <div
      className="check-wow relative mt-1 overflow-hidden rounded-3xl border border-white/12 bg-[var(--color-moss-deep)] text-[var(--color-paper)] shadow-[0_24px_50px_-28px_rgba(0,0,0,0.65)]"
      aria-live="polite"
      role="status"
    >
      <div className="check-wow__sky pointer-events-none absolute inset-0" aria-hidden />

      {/* Fliegende Tankstellen / Orte */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {chips.map((label, i) => (
          <span
            key={`${progress.step}-${label}-${i}`}
            className={`check-wow__fly check-wow__fly--${i % 5} ${
              progress.step >= 2 && progress.step < 4
                ? "check-wow__fly--pump"
                : progress.step >= 4
                  ? "check-wow__fly--food"
                  : "check-wow__fly--soft"
            }`}
            style={{ animationDelay: `${i * 0.35}s` }}
          >
            {label}
          </span>
        ))}
        {showHearts &&
          Array.from({ length: 7 }).map((_, i) => (
            <span
              key={`heart-${i}`}
              className={`check-wow__heart check-wow__heart--${i % 4}`}
              style={{ animationDelay: `${0.2 + i * 0.28}s` }}
            >
              ♥
            </span>
          ))}
      </div>

      <div className="relative z-10 px-5 pb-5 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-2xl font-bold tracking-tight">
              {done
                ? celebrateOuting
                  ? t(locale, "wowOuting")
                  : t(locale, "progressDone")
                : t(locale, "progressTitle")}
            </p>
            <p className="mt-1 text-sm text-[var(--color-paper)]/75">
              {done
                ? t(locale, "wowReady")
                : (steps[progress.step] ?? steps[0])}
            </p>
          </div>
          <span className="rounded-full bg-[var(--color-amber-road)] px-3 py-1 text-xs font-bold text-[var(--color-ink)]">
            {t(locale, "progressPct", { pct: progress.pct })}
          </span>
        </div>

        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/15">
          <div
            className="check-wow__bar h-full rounded-full bg-[var(--color-amber-road)]"
            style={{ width: `${progress.pct}%` }}
          />
        </div>

        <div className="mt-4 min-h-[3.2rem]">
          <p className="check-wow__scan font-display text-lg font-semibold text-[var(--color-amber-road)]">
            {t(locale, "progressScan", { name: progress.scanName })}
          </p>
          {showHearts && !done && (
            <p className="mt-1 text-xs text-[var(--color-paper)]/65">
              {t(locale, "wowHeartsHint")}
            </p>
          )}
        </div>

        <ul className="mt-4 flex flex-wrap gap-2">
          {steps.map((label, i) => {
            const active = i === progress.step;
            const doneStep = i < progress.step || done;
            return (
              <li
                key={label}
                className={`rounded-full px-2.5 py-1 text-[0.7rem] font-semibold transition ${
                  doneStep
                    ? "bg-[var(--color-ok)]/90 text-white"
                    : active
                      ? "bg-[var(--color-amber-road)] text-[var(--color-ink)]"
                      : "bg-white/10 text-[var(--color-paper)]/45"
                }`}
              >
                {doneStep ? "✓ " : active ? "→ " : ""}
                {label.replace(/\s*…\s*$/, "")}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
