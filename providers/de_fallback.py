"""Zwischenlösung: DE-Preise von Ortsseite eines MTS-K-VID (ohne API-Key)."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from urllib.error import URLError
from urllib.request import Request, urlopen

from providers import cache
from providers.base import PriceQuote

_FUEL_PATH = {
    "e10": "e10preise",
    "e5": "benzinpreise",
    "diesel": "dieselpreise",
}


def _parse_ts(raw: str) -> datetime:
    m = re.search(r"(\d{2})\.(\d{2})\.(\d{4}),\s*(\d{1,2}):(\d{2})", raw or "")
    if not m:
        return datetime.now(timezone.utc)
    dd, mm, yyyy, hh, mi = m.groups()
    return datetime(int(yyyy), int(mm), int(dd), int(hh), int(mi), tzinfo=timezone.utc)


def parse_city_page(html: str, fuel: str) -> PriceQuote:
    best = re.search(
        r"Bester Preis:\s*([\d]+[.,]\d{2,3})\s*Euro!?\s*\(Stand:\s*([^)]+)\)",
        html,
        re.I,
    )
    cheap = re.search(r"Günstigster Preis:\s*([\d]+[.,]\d{2,3})\s*€", html, re.I)
    stand = re.search(r"Stand:\s*(\d{2}\.\d{2}\.\d{4},\s*\d{1,2}:\d{2}\s*Uhr)", html, re.I)

    price: float | None = None
    station = "Günstigste Tankstelle vor Ort"
    ts_raw = stand.group(1) if stand else ""

    if best:
        price = float(best.group(1).replace(",", "."))
        ts_raw = best.group(2) or ts_raw
    elif cheap:
        price = float(cheap.group(1).replace(",", "."))

    name_m = re.search(
        r'<strong class="isstrong">([^<]+Tankstelle[^<]*)</strong>', html, re.I
    )
    if name_m:
        station = name_m.group(1).strip()

    if price is None:
        found = [
            float(x.replace(",", "."))
            for x in re.findall(r'title="[^"]*?([\d]+[.,]\d{2,3})\s*Euro"', html, re.I)
        ]
        found = [p for p in found if 0.5 < p < 5]
        if found:
            price = min(found)

    if price is None:
        raise RuntimeError("Auf der Ortsseite keinen Spritpreis gefunden")

    return PriceQuote(
        price=price,
        currency="EUR",
        fuel_type=fuel,
        source="MTS-K (Verbraucher-Info, Zwischenlösung)",
        timestamp=_parse_ts(ts_raw),
        kind="station",
        station_name=station,
        note="Zwischenlösung ohne API-Key: Ortspreise eines zugelassenen Verbraucher-Informationsdienstes (MTS-K).",
    )


def fetch_from_city_page(city_slug: str, fuel_type: str, timeout_s: float = 15.0) -> PriceQuote:
    fuel = fuel_type.lower()
    prefix = _FUEL_PATH.get(fuel)
    if not prefix:
        raise ValueError(f"Unbekannte Sorte: {fuel_type}")

    slug = re.sub(r"\s+", "-", city_slug.strip().lower())
    cache_key = f"de:fallback:{slug}:{fuel}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    url = f"https://www.benzinpreis-aktuell.de/{prefix}-{slug}-heute"
    req = Request(url, headers={"User-Agent": "Tank-Check/1.0 (personal)", "Accept": "text/html"})
    try:
        with urlopen(req, timeout=timeout_s) as resp:
            html = resp.read().decode("utf-8", "replace")
    except (URLError, TimeoutError, OSError) as exc:
        raise RuntimeError(f"Ortsseite nicht erreichbar: {exc}") from exc

    quote = parse_city_page(html, fuel)
    cache.set(cache_key, quote)
    return quote
