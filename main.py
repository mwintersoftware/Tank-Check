"""Tank-Check – Kommandozeile (Phase 1)."""

from __future__ import annotations

import argparse
import os
import sys
import tomllib
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from calc import TripInput, calculate_trip, kc_to_eur
from providers.cz_prices import resolve_cz_price
from providers.de_prices import fetch_cheapest_nearby
from providers.fx import fetch_eur_czk
from providers.routing import route_distance

ROOT = Path(__file__).resolve().parent


def _local_tz():
    """Europe/Berlin wenn verfügbar, sonst System-Zeitzone (Windows ohne tzdata)."""
    try:
        from zoneinfo import ZoneInfo

        return ZoneInfo("Europe/Berlin")
    except Exception:
        return datetime.now().astimezone().tzinfo


@dataclass
class BorderCrossing:
    name: str
    lat: float
    lng: float
    dest_lat: float
    dest_lng: float


@dataclass
class AppConfig:
    home_lat: float
    home_lng: float
    fuel_type: str
    consumption_l_per_100km: float
    tank_capacity_l: float
    fill_liters: float
    min_net_saving_eur: float
    home_search_radius_km: float
    toll_eur: float
    time_value_eur_per_h: float
    remaining_range_km: float
    card_fee_percent: float
    meal_eur: float
    ausflug_wert_eur: float
    border_crossings: list[BorderCrossing]
    cz_price_kc: float | None = None


def _load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        os.environ.setdefault(key, val)


def load_config(path: Path) -> AppConfig:
    with path.open("rb") as f:
        raw = tomllib.load(f)
    crossings = [
        BorderCrossing(
            name=c["name"],
            lat=float(c["lat"]),
            lng=float(c["lng"]),
            dest_lat=float(c["dest_lat"]),
            dest_lng=float(c["dest_lng"]),
        )
        for c in raw.get("border_crossings", [])
    ]
    if not crossings:
        raise SystemExit("config.toml: border_crossings fehlen.")
    return AppConfig(
        home_lat=float(raw["home_lat"]),
        home_lng=float(raw["home_lng"]),
        fuel_type=str(raw.get("fuel_type", "e10")).lower(),
        consumption_l_per_100km=float(raw["consumption_l_per_100km"]),
        tank_capacity_l=float(raw["tank_capacity_l"]),
        fill_liters=float(raw.get("fill_liters", raw["tank_capacity_l"])),
        min_net_saving_eur=float(raw.get("min_net_saving_eur", 5.0)),
        home_search_radius_km=float(raw.get("home_search_radius_km", 5.0)),
        toll_eur=float(raw.get("toll_eur", 0.0)),
        time_value_eur_per_h=float(raw.get("time_value_eur_per_h", 0.0)),
        remaining_range_km=float(raw.get("remaining_range_km", 450.0)),
        card_fee_percent=float(raw.get("card_fee_percent", 1.75)),
        meal_eur=float(raw.get("meal_eur", 12.0)),
        ausflug_wert_eur=float(raw.get("ausflug_wert_eur", 24.0)),
        border_crossings=crossings,
        cz_price_kc=float(raw["cz_price_kc"]) if "cz_price_kc" in raw else None,
    )


def _fmt_eur(v: float, digits: int = 2) -> str:
    return f"{v:.{digits}f}".replace(".", ",")


def _fmt_price3(v: float) -> str:
    return f"{v:.3f}".replace(".", ",")


def _local_ts(dt: datetime) -> str:
    tz = _local_tz()
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=tz)
    return dt.astimezone(tz).strftime("%d.%m.%Y %H:%M")


def _ask_manual_cz() -> float:
    print("Keine tschechische Live-/Durchschnittsquelle nutzbar.")
    while True:
        raw = input("Bitte CZ-Preis in Kč/l eingeben (z. B. 42.39): ").strip().replace(",", ".")
        try:
            val = float(raw)
            if val <= 0:
                raise ValueError
            return val
        except ValueError:
            print("Ungültig – bitte positive Zahl eingeben.")


def _maps_link(dest_lat: float, dest_lng: float, origin_lat: float, origin_lng: float) -> str:
    return (
        "https://www.google.com/maps/dir/?api=1"
        f"&origin={origin_lat},{origin_lng}"
        f"&destination={dest_lat},{dest_lng}&travelmode=driving"
    )


def run(cfg: AppConfig, force_manual_cz: bool = False) -> int:
    incomplete = False
    now = datetime.now(_local_tz())

    # 1) DE-Preis
    try:
        de = fetch_cheapest_nearby(
            cfg.home_lat, cfg.home_lng, cfg.home_search_radius_km, cfg.fuel_type
        )
    except RuntimeError as exc:
        print(f"FEHLER Deutschland-Preis: {exc}")
        return 2

    # 2) Wechselkurs
    try:
        fx = fetch_eur_czk()
    except RuntimeError as exc:
        print(f"FEHLER Wechselkurs: {exc}")
        return 2

    # 3) CZ-Preis
    manual = cfg.cz_price_kc
    try:
        if force_manual_cz and manual is None:
            manual = _ask_manual_cz()
        cz = resolve_cz_price(
            cfg.fuel_type,
            manual_kc=manual,
            prefer_manual=force_manual_cz,
            kc_per_eur=fx.kc_per_eur,
        )
    except RuntimeError:
        try:
            manual = _ask_manual_cz() if sys.stdin.isatty() else None
            if manual is None:
                print("FEHLER: CZ-Preis fehlt und keine interaktive Eingabe möglich.")
                return 2
            cz = resolve_cz_price(cfg.fuel_type, manual_kc=manual, prefer_manual=True)
        except RuntimeError as exc:
            print(f"FEHLER Tschechien-Preis: {exc}")
            return 2

    p_cz = kc_to_eur(cz.price, fx.kc_per_eur)

    # 4) Alle Grenzen, kürzeste zuerst
    ranked: list[tuple] = []
    for crossing in cfg.border_crossings:
        route = route_distance(
            cfg.home_lat,
            cfg.home_lng,
            crossing.dest_lat,
            crossing.dest_lng,
            via_name=crossing.name,
        )
        if "Schätzung" in route.source:
            incomplete = True
        ranked.append((route, crossing))
    ranked.sort(key=lambda x: x[0].distance_km)
    best_route, best_crossing = ranked[0]

    assert best_route is not None and best_crossing is not None

    result = calculate_trip(
        TripInput(
            p_home=de.price,
            p_cz=p_cz,
            fill_liters=cfg.fill_liters,
            tank_capacity_l=cfg.tank_capacity_l,
            consumption_l_per_100km=cfg.consumption_l_per_100km,
            d_oneway_km=best_route.distance_km,
            remaining_range_km=cfg.remaining_range_km,
            card_fee_percent=cfg.card_fee_percent,
            meal_eur=cfg.meal_eur,
            ausflug_wert_eur=cfg.ausflug_wert_eur,
            toll_eur=cfg.toll_eur,
            min_net_saving_eur=cfg.min_net_saving_eur,
        )
    )

    kind_cz = {
        "station": "Stationspreis",
        "average": "Landesdurchschnitt",
        "ceiling": "Obergrenze/Preisdeckel",
        "manual": "manuell",
    }[cz.kind]

    fuel_label = cfg.fuel_type.upper()
    if not result.kann_hin:
        status = "REST REICHT NICHT"
    elif result.lohnt_sprit:
        status = "LOHNT SICH (Sprit)"
    elif result.lohnt_ausflug:
        status = "LOHNT ALS AUSFLUG"
    else:
        status = "LOHNT SICH NICHT (nur Sprit)"
    if incomplete:
        status = f"UNVOLLSTÄNDIG – {status}"

    print(f"Tank-Check  {now.strftime('%d.%m.%Y %H:%M')}")
    print(
        f"Deutschland: {de.station_name or 'Tankstelle'}, {fuel_label} "
        f"{_fmt_price3(de.price)} €/l (Stand {_local_ts(de.timestamp)}, {de.source})"
    )
    print(
        f"Tschechien:  {cz.station_name or 'Preis'} {_fmt_price3(cz.price)} Kč/l = "
        f"{_fmt_price3(p_cz)} €/l ({cz.source}, {_local_ts(cz.timestamp)}, {kind_cz})"
    )
    print(
        f"Kurs:        {_fmt_price3(fx.kc_per_eur)} Kč/€ ({fx.source})  "
        f"mit Karte {_fmt_price3(result.p_cz_pay)} €/l"
    )
    print(
        f"Strecke:     {best_route.distance_km:.0f} km einfach / "
        f"{result.d_round_km:.0f} km hin+zurück  (kürzeste: {best_crossing.name})"
        f"  [{best_route.source}]"
    )
    for route, crossing in ranked:
        mark = " ← kürzeste" if crossing.name == best_crossing.name else ""
        print(f"  • {crossing.name}: {route.distance_km:.0f} km einfach{mark}")
    print(
        f"Resttank:    {cfg.remaining_range_km:.0f} km → "
        f"{'reicht hin' if result.kann_hin else 'reicht NICHT'}  "
        f"nachfüllen {result.fill_used_l:.1f} l"
    )
    print(
        f"Ersparnis:   {_fmt_eur(result.ersparnis_brutto)} €   "
        f"Rückweg: -{_fmt_eur(result.fahrt_rueck_eur)} €   "
        f"Karte: -{_fmt_eur(result.kartengebuehr_eur)} €"
    )
    print(f"SPRIT-NETTO: {_fmt_eur(result.netto_sprit)} €")
    print(
        f"Kasse:       {_fmt_eur(result.kasse)} €  "
        f"(Essen {_fmt_eur(cfg.meal_eur)} € für 2)"
    )
    print(
        f"Ausflug:     {_fmt_eur(result.mit_ausflug)} €  ->  {status}  "
        f"(Wert angesetzt {_fmt_eur(cfg.ausflug_wert_eur)} €)"
    )
    print(
        f"Navi:        {_maps_link(best_crossing.dest_lat, best_crossing.dest_lng, cfg.home_lat, cfg.home_lng)}"
    )
    if cz.note:
        print(f"Hinweis:     {cz.note}")
    print("Hinweis:     Hinweg aus dem Resttank (schon bezahlt). In Kronen zahlen.")
    if cz.kind == "ceiling":
        print("Hinweis:     Rechnung konservativ (nur Preisdeckel/Obergrenze).")

    return 0


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    parser = argparse.ArgumentParser(description="Tank-Check: lohnt sich Tanken in CZ?")
    parser.add_argument(
        "--config",
        default=str(ROOT / "config.toml"),
        help="Pfad zur config.toml",
    )
    parser.add_argument(
        "--manual-cz",
        action="store_true",
        help="CZ-Preis manuell abfragen (ignoriere ČSÚ)",
    )
    parser.add_argument(
        "--cz-price",
        type=float,
        default=None,
        help="CZ-Preis in Kč/l (einmalig, ohne config)",
    )
    args = parser.parse_args(argv)

    _load_dotenv(ROOT / ".env")
    cfg = load_config(Path(args.config))
    if args.cz_price is not None:
        cfg.cz_price_kc = args.cz_price
    return run(cfg, force_manual_cz=args.manual_cz)


if __name__ == "__main__":
    raise SystemExit(main())
