export function eur(v: number, digits = 2): string {
  return v.toFixed(digits).replace(".", ",") + " €";
}

export function price3(v: number): string {
  return v.toFixed(3).replace(".", ",");
}

export function kc(v: number): string {
  return v.toFixed(2).replace(".", ",");
}

export function localWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("de-DE", {
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
