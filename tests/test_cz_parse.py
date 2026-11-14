"""Parser-Test für ČSÚ-CSV (ohne Netzwerk)."""

from __future__ import annotations

import csv
import io

from providers.cz_prices import _FUEL_MARKERS


def _latest_price(csv_text: str, fuel_type: str) -> float:
    marker = _FUEL_MARKERS[fuel_type]
    rows: list[tuple[str, float]] = []
    for row in csv.DictReader(io.StringIO(csv_text)):
        if (row.get("IndicatorType") or "").strip() != "6621T":
            continue
        if marker.lower() not in (row.get("Druh PHM") or "").lower():
            continue
        cast = (row.get("CASTPHM") or "").strip()
        val = float((row.get("Hodnota") or "").replace(",", "."))
        rows.append((cast, val))
    rows.sort()
    return rows[-1][1]


def test_ignores_index_rows():
    sample = (
        '"IndicatorType","Druh PHM","CASTPHM","Hodnota"\n'
        '"6621T","Benzin automobilový bezolovnatý Natural 95 oktanu","2026-W44","43.82"\n'
        '"6621TI","Benzin automobilový bezolovnatý Natural 95 oktanu","2026-W45","98.1"\n'
        '"6621T","Benzin automobilový bezolovnatý Natural 95 oktanu","2026-W45","42.98"\n'
    )
    assert _latest_price(sample, "e10") == 42.98
