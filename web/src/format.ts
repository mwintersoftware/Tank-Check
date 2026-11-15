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

export function liters(v: number): string {
  return v.toFixed(1).replace(".", ",");
}
