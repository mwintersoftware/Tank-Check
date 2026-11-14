"""Tägliche CZ-Mittelwerte von der öffentlichen Stationsübersicht."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from urllib.error import URLError
from urllib.request import Request, urlopen

from providers import cache
from providers.base import PriceQuote

_URL = "https://mapapump.cz/ceny"


def _parse_date(raw: str) -> datetime:
    m = re.search(r"(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})", raw or "")
    if not m:
        return datetime.now(timezone.utc)
    d, mo, y = (int(m.group(1)), int(m.group(2)), int(m.group(3)))
    return datetime(y, mo, d, 12, 0, tzinfo=timezone.utc)


def parse_mapapump_page(html: str, fuel_type: str) -> PriceQuote:
    fuel = fuel_type.lower()
    label = "Nafta" if fuel == "diesel" else "Natural 95"
    m = re.search(
        rf'price-card__label">{re.escape(label)}</div>\s*'
        r'<div class="price-card__val"><span data-czk="([\d.]+)"',
        html,
        re.I,
    )
    if not m:
        raise RuntimeError(f"Kein {label}-Tagesmittel auf der CZ-Übersicht")
    price = float(m.group(1))
    if not (10 < price < 80):
        raise RuntimeError("Unplausibles CZ-Tagesmittel")
    stand = re.search(r"Aktualizováno\s+(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})", html, re.I)
    display = "Nafta" if fuel == "diesel" else "Natural 95"
    return PriceQuote(
        price=price,
        currency="CZK",
        fuel_type=fuel,
        source="Tagesmittel CZ-Stationen",
        timestamp=_parse_date(stand.group(1) if stand else ""),
        kind="average",
        station_name=f"Ø {display}",
        note="Tägliches Mittel gemeldeter Stationspreise; vor Ort kann es abweichen.",
    )


def fetch_daily_average(fuel_type: str, timeout_s: float = 15.0) -> PriceQuote:
    fuel = fuel_type.lower()
    cache_key = f"cz:daily:{fuel}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached
    req = Request(_URL, headers={"User-Agent": "Tank-Check/1.0 (personal)", "Accept": "text/html"})
    try:
        with urlopen(req, timeout=timeout_s) as resp:
            html = resp.read().decode("utf-8", "replace")
    except (URLError, TimeoutError, OSError) as exc:
        raise RuntimeError(f"CZ-Tagesübersicht nicht erreichbar: {exc}") from exc
    quote = parse_mapapump_page(html, fuel)
    cache.set(cache_key, quote)
    return quote
