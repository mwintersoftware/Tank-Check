"""Deutsche Spritpreise über Tankerkönig (MTS-K)."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from providers import cache
from providers.base import PriceQuote
from providers.de_fallback import fetch_from_city_page
from providers.fuelwide import fetch_de_weekly

_BASE = "https://creativecommons.tankerkoenig.de/json/list.php"
_DEFAULT_CITY = os.environ.get("DE_PRICE_CITY", "oberasbach")


def _api_key() -> str | None:
    return os.environ.get("TANKERKOENIG_API_KEY") or os.environ.get("TANKERKOENIG_KEY")


def fetch_cheapest_nearby(
    lat: float,
    lng: float,
    radius_km: float,
    fuel_type: str,
    timeout_s: float = 10.0,
    city_slug: str | None = None,
) -> PriceQuote:
    fuel = fuel_type.lower()
    if fuel not in {"e5", "e10", "diesel"}:
        raise ValueError(f"Unbekannte Sorte: {fuel_type}")

    def _without_key() -> PriceQuote:
        try:
            return fetch_from_city_page(city_slug or _DEFAULT_CITY, fuel, timeout_s=timeout_s)
        except RuntimeError:
            return fetch_de_weekly(fuel, timeout_s=timeout_s)

    key = _api_key()
    if not key:
        return _without_key()

    cache_key = f"de:{lat:.4f}:{lng:.4f}:{radius_km}:{fuel}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    params = urlencode(
        {
            "lat": lat,
            "lng": lng,
            "rad": min(radius_km, 25),
            "type": fuel,
            "sort": "price",
            "apikey": key,
        }
    )
    url = f"{_BASE}?{params}"
    req = Request(url, headers={"User-Agent": "Tank-Check/1.0 (personal)"})
    try:
        with urlopen(req, timeout=timeout_s) as resp:
            data = json.loads(resp.read().decode())
    except (URLError, TimeoutError, json.JSONDecodeError, OSError):
        return _without_key()

    if not data.get("ok"):
        return _without_key()

    stations = data.get("stations") or []
    open_priced = [
        s
        for s in stations
        if s.get("isOpen") and isinstance(s.get("price"), (int, float)) and s["price"] > 0
    ]
    if not open_priced:
        return _without_key()

    best = min(open_priced, key=lambda s: s["price"])
    brand = best.get("brand") or best.get("name") or "Tankstelle"
    place = best.get("place") or ""
    name = f"{brand} {place}".strip()
    quote = PriceQuote(
        price=float(best["price"]),
        currency="EUR",
        fuel_type=fuel,
        source="MTS-K / Tankerkönig",
        timestamp=datetime.now(timezone.utc),
        kind="station",
        station_name=name,
        lat=float(best["lat"]) if best.get("lat") is not None else None,
        lng=float(best["lng"]) if best.get("lng") is not None else None,
    )
    cache.set(cache_key, quote)
    return quote
