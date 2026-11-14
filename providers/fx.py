"""Wechselkurs CZK/EUR über frankfurter.dev (ohne Key)."""

from __future__ import annotations

from datetime import datetime, timezone
from urllib.error import URLError
from urllib.request import Request, urlopen
import json

from providers import cache
from providers.base import FxQuote

_URL = "https://api.frankfurter.dev/v2/rate/eur/czk"


def fetch_eur_czk(timeout_s: float = 10.0) -> FxQuote:
    cached = cache.get("fx:eur_czk")
    if cached is not None:
        return cached

    req = Request(_URL, headers={"User-Agent": "Tank-Check/1.0 (personal)"})
    try:
        with urlopen(req, timeout=timeout_s) as resp:
            data = json.loads(resp.read().decode())
    except (URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
        raise RuntimeError(f"Wechselkurs nicht erreichbar: {exc}") from exc

    rate = float(data["rate"])
    date_str = data.get("date", "")
    try:
        ts = datetime.fromisoformat(date_str).replace(tzinfo=timezone.utc)
    except ValueError:
        ts = datetime.now(timezone.utc)

    quote = FxQuote(kc_per_eur=rate, source="frankfurter.dev", timestamp=ts)
    cache.set("fx:eur_czk", quote)
    return quote
