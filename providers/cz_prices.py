"""Tschechische Preise: ČSÚ-Landesdurchschnitt, sonst manuell."""

from __future__ import annotations

import csv
import io
from datetime import datetime, timezone
from urllib.error import URLError
from urllib.request import Request, urlopen

from providers import cache
from providers.base import PriceQuote
from providers.cz_daily import fetch_daily_average
from providers.fuelwide import fetch_cz_weekly

_CSV_URL = "https://data.csu.gov.cz/opendata/sady/CENPHMT/distribuce/csv"

_FUEL_MARKERS = {
    "e10": "Natural 95",
    "e5": "Natural 95",
    "diesel": "nafta",
}


def _parse_week(castphm: str) -> datetime:
    # z. B. 2026-W44
    year_s, week_s = castphm.split("-W")
    return datetime.fromisocalendar(int(year_s), int(week_s), 1).replace(tzinfo=timezone.utc)


def fetch_csu_average(fuel_type: str, timeout_s: float = 20.0) -> PriceQuote:
    fuel = fuel_type.lower()
    marker = _FUEL_MARKERS.get(fuel)
    if not marker:
        raise ValueError(f"Unbekannte Sorte: {fuel_type}")

    cache_key = f"cz:csu:{fuel}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    req = Request(_CSV_URL, headers={"User-Agent": "Tank-Check/1.0 (personal)"})
    try:
        with urlopen(req, timeout=timeout_s) as resp:
            raw = resp.read().decode("utf-8")
    except (URLError, TimeoutError, OSError) as exc:
        raise RuntimeError(f"ČSÚ-Preise nicht erreichbar: {exc}") from exc

    reader = csv.DictReader(io.StringIO(raw))
    rows: list[tuple[str, float, str]] = []
    for row in reader:
        # 6621T = Preis Kč/l; 6621TI = Index (nicht verwenden)
        if (row.get("IndicatorType") or "").strip() != "6621T":
            continue
        druh = row.get("Druh PHM") or ""
        if marker.lower() not in druh.lower():
            continue
        cast = (row.get("CASTPHM") or "").strip()
        val_s = (row.get("Hodnota") or "").strip()
        if not cast or not val_s:
            continue
        try:
            rows.append((cast, float(val_s.replace(",", ".")), druh))
        except ValueError:
            continue

    if not rows:
        raise RuntimeError("In der ČSÚ-CSV keine passenden Preise gefunden.")

    rows.sort(key=lambda r: r[0])
    cast, value, druh = rows[-1]
    label = "Natural 95" if "95" in druh else "Nafta"
    quote = PriceQuote(
        price=value,
        currency="CZK",
        fuel_type=fuel,
        source="ČSÚ",
        timestamp=_parse_week(cast),
        kind="average",
        station_name=f"Ø {label}",
        note="Landesdurchschnitt; Preis vor Ort kann abweichen",
    )
    cache.set(cache_key, quote)
    return quote


def manual_price(preis_kc: float, fuel_type: str) -> PriceQuote:
    return PriceQuote(
        price=preis_kc,
        currency="CZK",
        fuel_type=fuel_type.lower(),
        source="manuell",
        timestamp=datetime.now(timezone.utc),
        kind="manual",
        station_name="Manueller Preis",
        note="Manuell eingegeben",
    )


def resolve_cz_price(
    fuel_type: str,
    manual_kc: float | None = None,
    prefer_manual: bool = False,
    kc_per_eur: float | None = None,
) -> PriceQuote:
    """Manuell → Tagesmittel → EU-Wochenbulletin → ČSÚ → Fehler."""
    if prefer_manual or manual_kc is not None:
        if manual_kc is None:
            raise RuntimeError("Manueller CZ-Preis erwartet, aber nicht gesetzt.")
        return manual_price(manual_kc, fuel_type)

    try:
        return fetch_daily_average(fuel_type)
    except RuntimeError:
        pass

    if kc_per_eur and kc_per_eur > 0:
        try:
            return fetch_cz_weekly(fuel_type, kc_per_eur)
        except RuntimeError:
            pass

    try:
        return fetch_csu_average(fuel_type)
    except RuntimeError:
        if manual_kc is not None:
            return manual_price(manual_kc, fuel_type)
        raise
