"""EU Weekly Oil Bulletin über die kostenlose FuelWide-JSON-API."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from urllib.error import URLError
from urllib.request import Request, urlopen

from providers import cache
from providers.base import PriceQuote

_UA = {"User-Agent": "Tank-Check/1.0 (personal)", "Accept": "application/json"}


def _want(fuel_type: str) -> str:
    return "diesel" if fuel_type.lower() == "diesel" else "petrol95"


def _fetch(url: str, timeout_s: float) -> dict:
    req = Request(url, headers=_UA)
    with urlopen(req, timeout=timeout_s) as resp:
        return json.loads(resp.read().decode())


def fetch_cz_weekly(fuel_type: str, kc_per_eur: float, timeout_s: float = 15.0) -> PriceQuote:
    fuel = fuel_type.lower()
    cache_key = f"cz:eu:{fuel}:{kc_per_eur:.3f}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached
    try:
        data = _fetch("https://fuelwide.com/api/fuel-prices/czechia", timeout_s)
    except (URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"EU-Wochenbulletin CZ nicht erreichbar: {exc}") from exc
    obs = next((o for o in data.get("observations") or [] if o.get("fuelType") == _want(fuel)), None)
    if not obs or not obs.get("price"):
        raise RuntimeError("Kein EU-Wochenpreis für CZ")
    price_kc = float(obs["price"]) * kc_per_eur
    day = obs.get("observedAt") or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    display = "Nafta" if fuel == "diesel" else "Natural 95"
    quote = PriceQuote(
        price=price_kc,
        currency="CZK",
        fuel_type=fuel,
        source="Weekly Oil Bulletin (EU)",
        timestamp=datetime.fromisoformat(f"{day}T00:00:00+00:00"),
        kind="average",
        station_name=f"Ø {display}",
        note="Wöchentlicher Landesdurchschnitt der EU-Kommission.",
    )
    cache.set(cache_key, quote)
    return quote


def fetch_de_weekly(fuel_type: str, timeout_s: float = 15.0) -> PriceQuote:
    fuel = fuel_type.lower()
    cache_key = f"de:eu:{fuel}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached
    try:
        data = _fetch("https://fuelwide.com/api/fuel-prices/germany", timeout_s)
    except (URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"EU-Wochenbulletin DE nicht erreichbar: {exc}") from exc
    obs = next((o for o in data.get("observations") or [] if o.get("fuelType") == _want(fuel)), None)
    if not obs or not obs.get("price"):
        raise RuntimeError("Kein EU-Wochenpreis für DE")
    day = obs.get("observedAt") or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    quote = PriceQuote(
        price=float(obs["price"]),
        currency="EUR",
        fuel_type=fuel,
        source="Weekly Oil Bulletin (EU)",
        timestamp=datetime.fromisoformat(f"{day}T00:00:00+00:00"),
        kind="average",
        station_name="Ø Deutschland",
        note="Wöchentlicher Landesdurchschnitt der EU-Kommission (kein Stationspreis).",
    )
    cache.set(cache_key, quote)
    return quote
