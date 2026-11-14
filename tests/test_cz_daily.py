from providers.cz_daily import parse_mapapump_page


SAMPLE = """
<span>Aktualizováno 14. 11. 2026</span>
<div class="price-card__label">Nafta</div>
<div class="price-card__val"><span data-czk="44.794">44,79</span></div>
<div class="price-card__label">Natural 95</div>
<div class="price-card__val"><span data-czk="39.694">39,69</span></div>
"""


def test_parse_natural_95():
    q = parse_mapapump_page(SAMPLE, "e10")
    assert abs(q.price - 39.694) < 0.001
    assert q.kind == "average"
    assert "Natural 95" in (q.station_name or "")


def test_parse_nafta():
    q = parse_mapapump_page(SAMPLE, "diesel")
    assert abs(q.price - 44.794) < 0.001
