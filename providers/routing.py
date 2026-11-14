"""Straßenrouting: OSRM (ohne Key) oder OpenRouteService (optionaler Key)."""

from __future__ import annotations

import json
import math
import os
from urllib.error import URLError
from urllib.request import Request, urlopen

from providers import cache
from providers.base import RouteResult

_OSRM = "https://router.project-osrm.org/route/v1/driving/{lng1},{lat1};{lng2},{lat2}?overview=false"
_ORS = "https://api.openrouteservice.org/v2/directions/driving-car"


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _ors_key() -> str | None:
    return os.environ.get("ORS_API_KEY") or os.environ.get("OPENROUTESERVICE_API_KEY")


def _route_osrm(
    lat1: float, lng1: float, lat2: float, lng2: float, timeout_s: float
) -> RouteResult:
    url = _OSRM.format(lat1=lat1, lng1=lng1, lat2=lat2, lng2=lng2)
    req = Request(url, headers={"User-Agent": "Tank-Check/1.0 (personal)"})
    with urlopen(req, timeout=timeout_s) as resp:
        data = json.loads(resp.read().decode())
    if data.get("code") != "Ok" or not data.get("routes"):
        raise RuntimeError(f"OSRM: {data.get('code', data)}")
    route = data["routes"][0]
    return RouteResult(
        distance_km=float(route["distance"]) / 1000.0,
        duration_h=float(route["duration"]) / 3600.0,
        source="OSRM",
    )


def _route_ors(
    lat1: float, lng1: float, lat2: float, lng2: float, timeout_s: float
) -> RouteResult:
    key = _ors_key()
    if not key:
        raise RuntimeError("Kein ORS_API_KEY")
    body = json.dumps({"coordinates": [[lng1, lat1], [lng2, lat2]]}).encode()
    req = Request(
        _ORS,
        data=body,
        headers={
            "Authorization": key,
            "Content-Type": "application/json",
            "User-Agent": "Tank-Check/1.0 (personal)",
        },
        method="POST",
    )
    with urlopen(req, timeout=timeout_s) as resp:
        data = json.loads(resp.read().decode())
    summary = data["routes"][0]["summary"]
    return RouteResult(
        distance_km=float(summary["distance"]) / 1000.0,
        duration_h=float(summary["duration"]) / 3600.0,
        source="OpenRouteService",
    )


def route_distance(
    lat1: float,
    lng1: float,
    lat2: float,
    lng2: float,
    via_name: str | None = None,
    timeout_s: float = 15.0,
) -> RouteResult:
    cache_key = f"route:{lat1:.4f},{lng1:.4f}:{lat2:.4f},{lng2:.4f}"
    cached = cache.get(cache_key)
    if cached is not None:
        return RouteResult(
            distance_km=cached.distance_km,
            duration_h=cached.duration_h,
            source=cached.source,
            via_name=via_name,
        )

    errors: list[str] = []
    for fn in (_route_osrm, _route_ors):
        try:
            result = fn(lat1, lng1, lat2, lng2, timeout_s)
            tagged = RouteResult(
                distance_km=result.distance_km,
                duration_h=result.duration_h,
                source=result.source,
                via_name=via_name,
            )
            cache.set(cache_key, tagged)
            return tagged
        except (URLError, TimeoutError, OSError, RuntimeError, KeyError, IndexError, json.JSONDecodeError) as exc:
            errors.append(f"{fn.__name__}: {exc}")

    # Letzter Fallback: Luftlinie × 1,3 (als Schätzung kennzeichnen)
    air = _haversine_km(lat1, lng1, lat2, lng2)
    approx = RouteResult(
        distance_km=air * 1.3,
        duration_h=(air * 1.3) / 80.0,
        source="Schätzung (Luftlinie×1,3)",
        via_name=via_name,
    )
    cache.set(cache_key, approx)
    return approx
