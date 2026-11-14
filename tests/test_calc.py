"""Unit-Tests für die Rechenlogik."""

from __future__ import annotations

from calc import CalcInput, TripInput, calculate, calculate_trip, kc_to_eur


def test_spec_case_ersparnis_and_breakeven():
    """SPEC Abschnitt 4: p_home 1,869; 42,39 Kč bei Kurs 24,2; 62 l; 5,2 l/100 km."""
    p_cz = kc_to_eur(42.39, 24.2)
    assert abs(p_cz - 1.75165) < 0.001

    # Mit gerundetem p_cz ≈ 1,752 wie in SPEC/Skill
    p_cz_r = round(p_cz, 3)
    assert p_cz_r == 1.752

    result = calculate(
        CalcInput(
            p_home=1.869,
            p_cz=p_cz_r,
            fill_liters=62,
            consumption_l_per_100km=5.2,
            d_oneway_km=37,
            toll_eur=0.0,
            min_net_saving_eur=0.0,
        )
    )

    assert abs(result.ersparnis_brutto - 7.254) < 0.01
    assert result.max_einfache_km is not None
    assert abs(result.max_einfache_km - 37.25) < 0.5


def test_breakeven_exact_formula():
    p_home = 1.869
    p_cz = 1.752
    fill = 62.0
    c = 5.2 / 100.0
    expected = (fill * (p_home - p_cz)) / (2 * c * p_home)
    result = calculate(
        CalcInput(
            p_home=p_home,
            p_cz=p_cz,
            fill_liters=fill,
            consumption_l_per_100km=5.2,
            d_oneway_km=expected,
            min_net_saving_eur=0.0,
        )
    )
    assert result.max_einfache_km is not None
    assert abs(result.max_einfache_km - expected) < 1e-9
    assert abs(result.netto) < 0.02


def test_threshold_tips_at_min_net():
    """An der Schwelle kippt das Ergebnis."""
    base = CalcInput(
        p_home=1.90,
        p_cz=1.70,
        fill_liters=50,
        consumption_l_per_100km=5.0,
        d_oneway_km=10,
        toll_eur=0.0,
        min_net_saving_eur=5.0,
    )
    # ersparnis = 50*0.2 = 10; fahrtsprit = 20*0.05*1.9 = 1.9; netto = 8.1
    above = calculate(base)
    assert above.lohnt_sich is True
    assert above.netto >= 5.0

    at_edge = calculate(
        CalcInput(
            **{
                **base.__dict__,
                "min_net_saving_eur": above.netto,
            }
        )
    )
    assert at_edge.lohnt_sich is True

    just_below = calculate(
        CalcInput(
            **{
                **base.__dict__,
                "min_net_saving_eur": above.netto + 0.01,
            }
        )
    )
    assert just_below.lohnt_sich is False


def test_no_breakeven_when_cz_more_expensive():
    result = calculate(
        CalcInput(
            p_home=1.70,
            p_cz=1.90,
            fill_liters=62,
            consumption_l_per_100km=5.2,
            d_oneway_km=20,
            min_net_saving_eur=5.0,
        )
    )
    assert result.max_einfache_km is None
    assert result.lohnt_sich is False
    assert result.ersparnis_brutto < 0


def test_trip_resttank_and_return_at_cz_price():
    t = calculate_trip(
        TripInput(
            p_home=2.0,
            p_cz=1.5,
            fill_liters=62,
            tank_capacity_l=62,
            consumption_l_per_100km=5.2,
            d_oneway_km=50,
            remaining_range_km=450,
            card_fee_percent=2.0,
            meal_eur=12.0,
            ausflug_wert_eur=24.0,
            min_net_saving_eur=5.0,
        )
    )
    assert t.kann_hin is True
    assert abs(t.oneway_liters - 2.6) < 1e-9
    assert abs(t.fill_used_l - 41.2) < 1e-9
    assert abs(t.p_cz_pay - 1.53) < 1e-9
    assert abs(t.netto_sprit - 15.386) < 0.02
    assert t.lohnt_sprit is True
    assert t.lohnt_ausflug is True


def test_trip_range_too_short():
    t = calculate_trip(
        TripInput(
            p_home=2.0,
            p_cz=1.5,
            fill_liters=62,
            tank_capacity_l=62,
            consumption_l_per_100km=5.2,
            d_oneway_km=200,
            remaining_range_km=50,
            min_net_saving_eur=5.0,
        )
    )
    assert t.kann_hin is False
    assert t.lohnt_sprit is False
