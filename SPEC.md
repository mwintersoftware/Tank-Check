# Spezifikation: "Tank-Check" – lohnt sich Tanken in Tschechien?

Persönliche Mini-App (nur für den Eigengebrauch). Sie prüft per Knopfdruck, ob sich eine Fahrt zum Tanken über die Grenze nach Tschechien rechnet – **inklusive Hin- und Rückfahrt** – und gibt dann die Koordinaten der besten Tankstelle aus.

## 1. Ziel

Beantworte eine einzige Frage: **"Lohnt es sich jetzt, in Tschechien zu tanken?"**
Antwort = `LOHNT SICH` / `LOHNT SICH NICHT` + Ersparnis in Euro + (nur wenn es sich lohnt) Koordinaten und Navi-Link der Tankstelle.

Nicht-Ziele (bewusst weggelassen): Konten, Login, Werbung, Bezahlung, Karten-UI, Mehrbenutzer.

## 2. Eingaben (Konfiguration, einmal festlegen)

| Feld | Beispiel | Hinweis |
|---|---|---|
| `home_lat`, `home_lng` | 49.4378, 10.9732 (Oberasbach) | oder Live-Standort (Phase 2) |
| `fuel_type` | `e10` / `e5` / `diesel` | |
| `consumption_l_per_100km` | 5.2 | |
| `tank_capacity_l` | 62 | |
| `fill_liters` | 62 | Menge, die du in CZ tanken würdest (Standard: Tankgröße) |
| `min_net_saving_eur` | 5.00 | Schwelle: darunter = "lohnt sich nicht" |
| `home_search_radius_km` | 5 | Radius für die deutsche Vergleichstankstelle |
| `toll_eur` | 0 | optional: Vignette/Maut, die für die Fahrt anfällt |
| `time_value_eur_per_h` | 0 | optional: eigene Zeit mit einrechnen |
| `border_crossings[]` | Name + lat/lng | Liste der Grenzübergänge (siehe Abschnitt 6) |

## 3. Datenquellen

| Was | Quelle | Anmerkung |
|---|---|---|
| Deutsche Spritpreise (live, pro Tankstelle) | **Tankerkönig API** (Daten der MTS-K / Bundeskartellamt) | kostenloser API-Key nötig, Nutzungsbedingungen beachten, nicht öfter als erlaubt abfragen |
| Tschechische Spritpreise | siehe Abschnitt 3.1 | wichtigste Unsicherheit |
| Wechselkurs CZK→EUR | EZB-Referenzkurs, z. B. über frankfurter.dev | gratis, ohne Key |
| Strecke / Fahrzeit | OpenRouteService (Key gratis) oder OSRM | **Straßenentfernung**, nicht Luftlinie |

### 3.1 Tschechische Preise (vor dem Bauen prüfen!)

Reihenfolge der Quellen (Provider-Schnittstelle `CzPriceProvider`, damit sie austauschbar sind):

1. **Stationsgenau**, falls es eine erlaubte, maschinenlesbare Quelle gibt (z. B. ein Preisportal mit API). Vor Nutzung Nutzungsbedingungen und Format prüfen. Nicht scrapen, wenn es verboten ist.
2. **Landes- oder Regionsdurchschnitt** (Natural 95, Nafta) in Kč/l von CCS oder dem Statistikamt ČSÚ. Genauigkeit gering, aber besser als nichts.
3. **Manuelle Eingabe** des Preises in Kč (Fallback, immer verfügbar).

Zusatz: Solange in Tschechien eine **Preisdeckelung** gilt, veröffentlicht das Finanzministerium täglich Höchstpreise (Cenový věstník). Das ist eine **Obergrenze**, kein tatsächlicher Preis. Wenn nur sie bekannt ist, vorsichtig rechnen (Ergebnis als "konservativ" kennzeichnen).

Jede Preisangabe muss **Quelle, Zeitstempel und Art** (Stationspreis / Durchschnitt / Obergrenze / manuell) mitführen und in der Ausgabe stehen.

## 4. Rechenlogik

Bezeichnungen:
- `p_home` = günstigster aktueller deutscher Preis (€/l) innerhalb `home_search_radius_km` (so würdest du sonst tanken)
- `p_cz` = tschechischer Preis in €/l (Kč-Preis ÷ Kurs)
- `d_oneway` = Straßenkilometer Zuhause → Tankstelle in CZ (über das beste Grenzübergangs-Routing)
- `d_round` = 2 × `d_oneway` (Rückweg wird **immer** mitgerechnet; bei abweichendem Rückweg echte Rückroute nehmen)
- `c` = Verbrauch in l/km = `consumption_l_per_100km` / 100

```
spritkosten_fahrt = d_round * c * p_home          # Fahrtsprit konservativ zu deutschem Preis
ersparnis_brutto  = fill_liters * (p_home - p_cz)
zeitkosten        = (fahrzeit_round_h) * time_value_eur_per_h
netto             = ersparnis_brutto - spritkosten_fahrt - toll_eur - zeitkosten
lohnt_sich        = netto >= min_net_saving_eur
max_einfache_km   = (fill_liters * (p_home - p_cz) - toll_eur) / (2 * c * p_home)   # Break-even
```

Kandidatenwahl: Für jede Tankstelle in CZ im Umkreis der Grenzübergänge `netto` berechnen, die mit dem **höchsten netto** gewinnt. Gibt es keine stationsgenauen Daten, wird die nächstgelegene Tankstelle hinter dem günstigsten Grenzübergang als Ziel genommen und mit dem Durchschnittspreis gerechnet.

**Testfall (muss exakt stimmen):**
`p_home = 1.869`, `p_cz = 42.39 / 24.2 = 1.7517`, `fill_liters = 62`, `c = 0.052`
→ `ersparnis_brutto = 62 * 0.1173 ≈ 7.27 €` (mit gerundeten 1.752: 7.25 €)
→ `max_einfache_km ≈ 37 km` (Break-even ohne Maut).

## 5. Ausgabe

Beispiel Terminal:

```
Tank-Check  08.11.2026 09:40
Deutschland: JET Oberasbach, E10 1,869 €/l (Stand 09:35, MTS-K)
Tschechien:  Ø Natural 95 42,39 Kč/l = 1,752 €/l (CCS, 04.11., Landesdurchschnitt)  Kurs 24,2
Strecke:     41 km einfach / 82 km hin+zurück  (Grenze Waidhaus)
Ersparnis:   7,25 €   Fahrtsprit: -7,97 €   Maut: 0,00 €
NETTO:       -0,72 €   ->  LOHNT SICH NICHT
Break-even:  ca. 37 km einfach
```

Wenn `LOHNT SICH`: zusätzlich Name der Tankstelle, **Koordinaten** (lat, lng), Google-Maps-/OSM-Navi-Link, Hinweis "Preis gilt für Stand HH:MM".

Immer anzeigen: Unsicherheit (z. B. "nur Durchschnittspreis, tatsächlicher Preis vor Ort kann abweichen"). Ein "Ausflug-Bonus" (Essen, Wochenende) wird **nicht** eingerechnet; höchstens als Textzeile "Netto zählt nur den Sprit".

## 6. Grenzübergänge

Konfigurierbar. Startvorschlag für den Raum Nürnberg (Koordinaten beim Bauen per Geocoding bestimmen und von dir prüfen lassen):
- Waidhaus / Rozvadov (A6 ↔ D5)
- Schirnding / Cheb (A93)
- Furth im Wald / Folmava

## 7. Phasen

- **Phase 1 (MVP):** Python-Kommandozeile, Konfig-Datei, alle Quellen mit Fallback, Ausgabe wie oben, Unit-Tests für die Rechenlogik.
- **Phase 2:** Mini-Webseite (eine HTML-Seite + kleine API), Live-Standort per Browser (HTTPS/localhost), Handy-tauglich, Navi-Button.
- **Phase 3 (optional):** Preisverlauf der letzten ~6 Stunden. Dafür jede Abfrage in einer kleinen SQLite-Datei speichern und Trend (steigt/fällt) anzeigen. In Deutschland steigen Preise laut Meldungen seit 2026 nur einmal täglich um 12 Uhr; Hinweis "vor 12 Uhr tanken" ist daher sinnvoll.

## 8. Qualitätsregeln

- Keine erfundenen Preise. Fehlt eine Quelle, klar sagen und Fallback nutzen oder nachfragen.
- Alle Zahlen in Euro mit zwei Nachkommastellen, Preise mit drei.
- API-Fehler und Zeitüberschreitungen sauber abfangen, Ergebnis dann als "unvollständig" markieren.
- Antwortzeit < 10 s. Ergebnisse kurz cachen (z. B. 5 Minuten), damit die Dienste nicht überlastet werden.
- API-Keys nur in Umgebungsvariablen/`.env`, nie im Code.
- Rechenlogik in einer eigenen, getesteten Funktion (`calc.py`), getrennt von Netzwerk und Ausgabe.

## 9. Abnahmekriterien

1. Testfall aus Abschnitt 4 liefert die genannten Werte.
2. Bei Break-even exakt an der Schwelle kippt das Ergebnis von "lohnt sich nicht" auf "lohnt sich".
3. Ohne tschechische Live-Quelle fragt die App nach einem manuellen Preis statt zu raten.
4. Jede Ausgabe nennt Quelle und Zeitstempel beider Preise.
5. Bei `LOHNT SICH` erscheinen Koordinaten und ein funktionierender Navi-Link; bei `LOHNT SICH NICHT` nicht.
