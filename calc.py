"""Reine Rechenlogik für Tank-Check (ohne Netzwerk)."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CalcInput:
    p_home: float
    p_cz: float
    fill_liters: float
    consumption_l_per_100km: float
    d_oneway_km: float
    toll_eur: float = 0.0
    time_value_eur_per_h: float = 0.0
    drive_time_round_h: float = 0.0
    min_net_saving_eur: float = 0.0


@dataclass(frozen=True)
class CalcResult:
    c: float
    fahrtsprit_eur: float
    ersparnis_brutto: float
    zeitkosten: float
    netto: float
    lohnt_sich: bool
    max_einfache_km: float | None
    d_round_km: float


@dataclass(frozen=True)
class TripInput:
    p_home: float
    p_cz: float
    fill_liters: float
    tank_capacity_l: float
    consumption_l_per_100km: float
    d_oneway_km: float
    remaining_range_km: float
    card_fee_percent: float = 0.0
    meal_eur: float = 0.0
    ausflug_wert_eur: float = 0.0
    toll_eur: float = 0.0
    min_net_saving_eur: float = 0.0


@dataclass(frozen=True)
class TripResult:
    c: float
    oneway_liters: float
    remaining_liters: float
    remaining_after_arrival_l: float
    fill_used_l: float
    kann_hin: bool
    p_cz_pay: float
    kartengebuehr_eur: float
    ersparnis_brutto: float
    fahrt_hin_opportunitaet_eur: float
    fahrt_rueck_eur: float
    d_round_km: float
    netto_sprit: float
    netto_streng: float
    kasse: float
    mit_ausflug: float
    lohnt_sprit: bool
    lohnt_ausflug: bool
    noetiger_ausflug_wert_eur: float
    max_einfache_km: float | None


def kc_to_eur(preis_kc: float, kurs_kc_pro_eur: float) -> float:
    if kurs_kc_pro_eur <= 0:
        raise ValueError("Wechselkurs muss > 0 sein")
    return preis_kc / kurs_kc_pro_eur


def calculate(inp: CalcInput) -> CalcResult:
    c = inp.consumption_l_per_100km / 100.0
    d_round = 2.0 * inp.d_oneway_km
    fahrtsprit = d_round * c * inp.p_home
    ersparnis = inp.fill_liters * (inp.p_home - inp.p_cz)
    zeitkosten = inp.drive_time_round_h * inp.time_value_eur_per_h
    netto = ersparnis - fahrtsprit - inp.toll_eur - zeitkosten
    lohnt = netto >= inp.min_net_saving_eur

    denom = 2.0 * c * inp.p_home
    if denom <= 0 or (inp.p_home - inp.p_cz) <= 0:
        max_km: float | None = None
    else:
        max_km = (inp.fill_liters * (inp.p_home - inp.p_cz) - inp.toll_eur) / denom

    return CalcResult(
        c=c,
        fahrtsprit_eur=fahrtsprit,
        ersparnis_brutto=ersparnis,
        zeitkosten=zeitkosten,
        netto=netto,
        lohnt_sich=lohnt,
        max_einfache_km=max_km,
        d_round_km=d_round,
    )


def calculate_trip(inp: TripInput) -> TripResult:
    fee = max(0.0, inp.card_fee_percent) / 100.0
    c = inp.consumption_l_per_100km / 100.0
    oneway_l = inp.d_oneway_km * c
    remaining_l = max(0.0, inp.remaining_range_km * c)
    kann_hin = inp.remaining_range_km + 1e-9 >= inp.d_oneway_km
    remaining_after = remaining_l - oneway_l if kann_hin else 0.0
    room = max(0.0, inp.tank_capacity_l - remaining_after)
    fill_used = min(max(0.0, inp.fill_liters), room)
    p_cz_pay = inp.p_cz * (1.0 + fee)
    kartengebuehr = fill_used * inp.p_cz * fee
    ersparnis = fill_used * (inp.p_home - p_cz_pay)
    fahrt_hin = oneway_l * inp.p_home
    fahrt_rueck = oneway_l * p_cz_pay
    netto_sprit = ersparnis - fahrt_rueck - inp.toll_eur
    netto_streng = netto_sprit - fahrt_hin
    kasse = netto_sprit - inp.meal_eur
    mit_ausflug = kasse + inp.ausflug_wert_eur
    noetig = max(0.0, inp.meal_eur - netto_sprit)

    empty_start = inp.tank_capacity_l - remaining_l
    delta = inp.p_home - p_cz_pay
    slope = inp.p_home - 2.0 * p_cz_pay
    max_km: float | None = None
    if c > 0 and delta > 0 and abs(slope) > 1e-12:
        liters = (inp.min_net_saving_eur + inp.toll_eur - empty_start * delta) / slope
        km = liters / c
        if km > 0:
            max_km = km

    return TripResult(
        c=c,
        oneway_liters=oneway_l,
        remaining_liters=remaining_l,
        remaining_after_arrival_l=remaining_after,
        fill_used_l=fill_used,
        kann_hin=kann_hin,
        p_cz_pay=p_cz_pay,
        kartengebuehr_eur=kartengebuehr,
        ersparnis_brutto=ersparnis,
        fahrt_hin_opportunitaet_eur=fahrt_hin,
        fahrt_rueck_eur=fahrt_rueck,
        d_round_km=2.0 * inp.d_oneway_km,
        netto_sprit=netto_sprit,
        netto_streng=netto_streng,
        kasse=kasse,
        mit_ausflug=mit_ausflug,
        lohnt_sprit=kann_hin and netto_sprit >= inp.min_net_saving_eur,
        lohnt_ausflug=kann_hin and mit_ausflug >= inp.min_net_saving_eur,
        noetiger_ausflug_wert_eur=noetig,
        max_einfache_km=max_km,
    )
