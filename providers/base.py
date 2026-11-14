"""Gemeinsame Typen für Preis- und Routenquellen."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

PriceKind = Literal["station", "average", "ceiling", "manual"]


@dataclass(frozen=True)
class PriceQuote:
    price: float
    currency: Literal["EUR", "CZK"]
    fuel_type: str
    source: str
    timestamp: datetime
    kind: PriceKind
    station_name: str | None = None
    lat: float | None = None
    lng: float | None = None
    note: str | None = None


@dataclass(frozen=True)
class FxQuote:
    kc_per_eur: float
    source: str
    timestamp: datetime


@dataclass(frozen=True)
class RouteResult:
    distance_km: float
    duration_h: float
    source: str
    via_name: str | None = None
