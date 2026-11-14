# Bau-Prompt (zum Einfügen in Claude / Claude Code)

Kopiere alles unterhalb der Linie in einen neuen Chat. Lege vorher `SPEC.md` (und optional `SKILL.md`) in den Arbeitsordner.

---

Du bist mein Entwickler-Partner. Baue die persönliche Mini-App **"Tank-Check"** nach der Datei `SPEC.md` (lies sie zuerst vollständig).

**Kontext:** Ich wohne in Oberasbach bei Nürnberg (49.4378, 10.9732), fahre ein Auto mit 5,2 l/100 km und 62 l Tank und will per Knopfdruck wissen, ob sich das Tanken in Tschechien nach Abzug der Hin- und Rückfahrt lohnt. Nur für meinen eigenen Gebrauch, keine Veröffentlichung.

**Vorgehen:**
1. Fasse in höchstens 8 Zeilen zusammen, wie du die Aufgabe verstehst, und nenne offene Punkte. Stelle höchstens drei Rückfragen, wenn wirklich nötig, sonst starte direkt.
2. **Prüfe zuerst die Datenquellen**, bevor du Code schreibst: Tankerkönig-API (Endpunkte, Limits, Key), Wechselkurs-API, Routing-API und vor allem eine **erlaubte, maschinenlesbare Quelle für tschechische Spritpreise**. Nenne mir pro Quelle: URL, Format, Kosten, Nutzungsbedingungen. Wenn es keine stationsgenaue tschechische Quelle gibt, baue die Provider-Schnittstelle mit Landesdurchschnitt und manueller Eingabe als Fallback, und sage mir das deutlich.
3. Baue **Phase 1** (Python 3.11+, Kommandozeile): `config.toml`, `calc.py` (reine Rechenlogik), `providers/` (de_prices, cz_prices, fx, routing), `main.py`, `tests/`.
4. Schreibe Unit-Tests für `calc.py` mit dem Testfall aus der Spezifikation (Ergebnis ca. 7,25 € Ersparnis, Break-even ca. 37 km einfach) und für die Schwellenlogik. Führe die Tests aus und zeige das Ergebnis.
5. Starte die App einmal mit meinen echten Einstellungen und zeige die Ausgabe. Wenn ein API-Key fehlt, sag mir genau, wo ich ihn kostenlos bekomme und in welche Variable er gehört. Erfinde keine Werte.
6. Danach frage mich, ob ich **Phase 2** (kleine Webseite mit Live-Standort) möchte.

**Regeln:**
- Keine erfundenen Preise oder Koordinaten. Jede Zahl braucht Quelle und Zeitstempel.
- Rückfahrt immer einrechnen. Fahrtsprit mit dem deutschen Preis bewerten.
- Straßenkilometer verwenden, nicht Luftlinie.
- Keys nur über Umgebungsvariablen/`.env`.
- Antworte kurz, auf Deutsch, und liste am Ende nur: was fertig ist, was ich tun muss (Keys), was als Nächstes kommt.
