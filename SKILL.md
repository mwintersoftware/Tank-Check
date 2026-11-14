---
name: tank-check
description: Baut, erweitert und prüft die persönliche Mini-App "Tank-Check", die entscheidet, ob sich Tanken im Nachbarland (z. B. Tschechien) nach Abzug von Hin- und Rückfahrt lohnt. Verwenden bei Wünschen zu Spritpreis-Vergleich über die Grenze, Break-even-Strecke, Tankstellen-Koordinaten oder Änderungen an dieser App.
---

# Skill: Tank-Check

## Zweck
Hilf beim Bauen und Pflegen einer kleinen App, die eine Frage beantwortet: **Lohnt sich die Fahrt zum Tanken ins Ausland jetzt?** Maßgeblich ist die Datei `SPEC.md` im Projektordner. Bei Widerspruch gilt die Spezifikation, außer der Nutzer ändert sie ausdrücklich.

## Ablauf
1. `SPEC.md` lesen. Fehlt sie, Nutzer nach ihr fragen oder anhand der Beschreibung unten eine Kurzfassung vorschlagen und bestätigen lassen.
2. **Quellen prüfen, bevor Code entsteht** (Tankerkönig/MTS-K für Deutschland, Wechselkurs, Routing, tschechische Preise). Pro Quelle URL, Format, Kosten, Limits und Nutzungsbedingungen notieren. Nichts scrapen, was die Bedingungen verbieten.
3. Reihenfolge beim Bauen: `calc.py` + Tests → Provider (DE, CZ, Kurs, Routing) → `main.py`-Ausgabe → Webseite (Phase 2) → Preisverlauf (Phase 3).
4. Tests ausführen und die Ausgabe wirklich ansehen, nicht nur behaupten, dass sie läuft.
5. Am Ende kurz berichten: was fertig ist, was der Nutzer tun muss (z. B. API-Keys), was als Nächstes kommt.

## Rechenformeln (verbindlich)
```
c                 = verbrauch_l_pro_100km / 100
fahrtsprit_eur    = 2 * d_einfach_km * c * p_home
ersparnis_brutto  = fill_liters * (p_home - p_cz)
netto             = ersparnis_brutto - fahrtsprit_eur - maut - zeitkosten
lohnt_sich        = netto >= min_netto
max_einfache_km   = (fill_liters * (p_home - p_cz) - maut) / (2 * c * p_home)
p_cz              = preis_kc / kurs_kc_pro_eur
```
Testfall: p_home 1,869; Preis 42,39 Kč bei Kurs 24,2 → p_cz ≈ 1,752; 62 l; 5,2 l/100 km → Ersparnis ≈ 7,25 €, Break-even ≈ 37 km einfach.

## Harte Regeln
- **Keine erfundenen Preise, Kurse oder Koordinaten.** Fehlt eine Quelle: Fallback (Durchschnitt, manuelle Eingabe) und das in der Ausgabe kennzeichnen.
- Jede Preisangabe trägt **Quelle, Zeitstempel und Art** (Stationspreis, Durchschnitt, Obergrenze/Preisdeckel, manuell).
- Preisdeckel-Höchstpreise sind Obergrenzen, keine echten Preise. Ergebnis dann "konservativ" nennen.
- **Rückfahrt immer einrechnen**, Straßenkilometer statt Luftlinie.
- Koordinaten und Navi-Link nur ausgeben, wenn `lohnt_sich` wahr ist.
- Ausflug- oder Essens-Nutzen nicht in `netto` einrechnen; höchstens als Textzeile erwähnen.
- API-Keys nur aus Umgebungsvariablen oder `.env`, niemals im Code oder in der Ausgabe.
- Netzwerkfehler abfangen, Ergebnis als "unvollständig" markieren, kurz cachen (≈ 5 Minuten).
- Alles auf Deutsch, kurz und ohne Fachjargon in der Nutzerausgabe.

## Ausgabeformat (Terminal)
```
Tank-Check <Datum Uhrzeit>
Deutschland: <Station>, <Sorte> <preis> €/l (Stand <Zeit>, <Quelle>)
Tschechien:  <Preis Kč> = <preis €/l> (<Quelle>, <Datum>, <Art>)  Kurs <kurs>
Strecke:     <km> einfach / <km> hin+zurück (<Grenzübergang>)
Ersparnis:   <eur>   Fahrtsprit: -<eur>   Maut: <eur>
NETTO:       <eur>  ->  LOHNT SICH / LOHNT SICH NICHT
Break-even:  ca. <km> km einfach
```

## Checkliste vor "fertig"
- [ ] Tests für `calc.py` laufen grün (Testfall + Schwellenkippen).
- [ ] Ohne CZ-Live-Quelle wird nach manuellem Preis gefragt.
- [ ] Quelle und Zeitstempel beider Preise stehen in der Ausgabe.
- [ ] Koordinaten nur bei `LOHNT SICH`.
- [ ] Keine Keys im Code.
