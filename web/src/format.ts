import { localeTag, type Locale } from "./i18n";

export function eur(v: number, digits = 2): string {
  return v.toFixed(digits).replace(".", ",") + " €";
}

export function price3(v: number): string {
  return v.toFixed(3).replace(".", ",");
}

export function kc(v: number): string {
  return v.toFixed(2).replace(".", ",");
}

export function localWhen(iso: string, locale: Locale = "de"): string {
  try {
    return new Date(iso).toLocaleString(localeTag(locale), {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Relative Preis-Alter: „vor 40 min“, „vor 2 h“, „vor 3 Tagen“. */
export function ageLabel(iso: string, locale: Locale = "de"): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return localWhen(iso, locale);
  const min = Math.round(ms / 60_000);
  if (min < 1) return locale === "cs" ? "právě teď" : "gerade eben";
  if (min < 60) return locale === "cs" ? `před ${min} min` : `vor ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return locale === "cs" ? `před ${h} h` : `vor ${h} h`;
  const d = Math.round(h / 24);
  return locale === "cs" ? `před ${d} dny` : `vor ${d} Tagen`;
}

export function liters(v: number): string {
  return v.toFixed(1).replace(".", ",");
}
