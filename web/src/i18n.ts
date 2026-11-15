/** Einfache DE/CS-Sprachumschaltung. */

export type Locale = "de" | "cs";

export const LANG_KEY = "tank-check-lang";

const de = {
  brand: "CZ-Tank-Check",
  tagline:
    "Lohnt sich Tanken in Tschechien? Hin mit dem Rest im Tank, zurück mit günstigerem Sprit – Essen und Quatschen inklusive.",
  openSettings: "Einstellungen öffnen",
  yourSetup: "Dein Setup",
  setupLine:
    "{fuel} · {cons} l/100 km · noch {km} km im Tank · Essen {meal} € · Karte {fee} %",
  checking: "Prüfe …",
  checkNow: "Jetzt prüfen",
  footer:
    "Persönliche Mini-App zum privaten Gebrauch. DE: Stationspreise. CZ: günstigste Tankstelle hinter der Grenze. Kurs: EZB-Referenz. In Kronen zahlen.",
  errNoGps: "Ohne GPS geht die Strecke nicht. Bitte Standort am Gerät anmachen.",
  errGpsDenied: "Standort nicht da. Bitte GPS erlauben und nochmal prüfen.",
  errCheckFailed: "Prüfung fehlgeschlagen",
  errUnknown: "Unbekannter Fehler",
  errCzRequired:
    "Kein tschechischer Stationspreis gefunden. Bitte Kč/l unter Einstellungen eintragen.",
  useLastPrice: "Mit letztem Preis prüfen ({price} Kč/l, {age})",
  lastPriceHint: "Letzter bekannter CZ-Preis vom Gerät – nur geschätzt.",

  settings: "Einstellungen",
  cancel: "Abbrechen",
  save: "Speichern",
  closeSettings: "Einstellungen schließen",
  fuel: "Sorte",
  diesel: "Diesel",
  rangeLabel: "Noch km im Tank",
  rangeHint: "z. B. 200",
  rangeNote:
    "Was der Tacho zeigt, bevor du losfährst. Nicht die Tankgröße (die ist 62 l).",
  consLabel: "Verbrauch l / 100 km",
  consHint: "5,2",
  consNote: "Wie dein Auto wirklich fährt – Anhänger und Winter zählen.",
  mealLabel: "Essen € (2 Pers.)",
  feeLabel: "Kartengebühr %",
  feeHint: "0,2",
  ausflugLabel: "Ausflug wert €",
  ausflugHint: "Hausnummer",
  settingsHint:
    "Start ist immer dein aktueller Standort (GPS). CZ-Preis holt die App von der günstigsten Tankstelle hinter der Grenze.",
  czPriceLabelNeed: "CZ-Preis Kč/l (nötig, Quelle fehlte)",
  czPriceLabelOpt: "CZ-Preis Kč/l (nur falls Stationen fehlen)",
  czPricePlaceholder: "wird automatisch geholt",
  language: "Sprache",

  restNotEnough: "Rest reicht nicht bis zur Grenze",
  worthFuel: "Ja, allein der Sprit lohnt sich",
  worthTrip: "Ja, der Ausflug lohnt sich ;-)",
  notWorthFuel: "Nein, nur wegen Sprit lohnt es sich nicht",
  asOf: "Stand {when} · Kurs {rate} Kč/€ (EZB-Referenz)",
  priceAgeDe: "DE-Preis {age}",
  priceAgeCz: "CZ-Preis {age}",
  priceGuarantee:
    "Preisgarantie nur geschätzt – oft nur für wenige Stunden, vor Ort prüfen.",
  pickRoute: "Tankstelle wählen (kürzeste zuerst, bis 5 je Grenze)",
  shortest: "kürzeste",
  mapTitle: "Strecke auf der Karte",
  navi: "Navi: {name}",
  share: "Teilen",
  shareCopy: "Kopieren",
  shareWhatsApp: "WhatsApp",
  shareCopied: "Kopiert",
  shareTitle: "CZ-Tank-Check",
  address: "Adresse",
  openingHours: "Öffnungszeiten",
  hoursUnknown: "nicht hinterlegt",
  openNow: "gerade geöffnet",
  closedNow: "gerade geschlossen",
  roundTrip: "{one} km hin, {round} km hin und zurück. Ziel {lat}, {lng}",
  germany: "Deutschland",
  czechiaFx: "Tschechien + Kurs",
  withCard: "mit Karte {price} €/l",
  tankLogic: "Tank-Logik",
  tankOk: "Rest {km} km reicht. Hin {liters} l schon im Tank.",
  tankFail: "Rest reicht nicht ({have} km < {need} km).",
  tankMeta:
    "Ankunft ~{left} l übrig → {fill} l nachfüllen (nicht {full} l in den vollen Tank).",
  fuelCalc: "Sprit-Rechnung",
  fuelCalcValue: "Ersparnis {save} · Rückweg −{back}",
  fuelCalcMeta: "Hinweg-Opportunität (streng) −{opp} · Maut {toll}",
  fuelNet: "Sprit-Netto",
  fuelNetMeta: "Streng inkl. Hinweg-Restsprit: {strict}",
  cashAfterMeal: "Kasse nach Essen",
  cashMeta: "Essen {meal} für 2 Personen (gutes Essen).",
  withOuting: "Mit Ausflug",
  outingMeta:
    "Quatschen/Ausflug mit {value} angesetzt. Damit die Kasse aufgeht, muss der Nachmittag dir mindestens {need} wert sein – unbezahlbar zählt trotzdem.",
  approxMin: "ca. {min} min",

  hintOutbound:
    "Hinweg: Rest im Tank (schon bezahlt). Rückweg: CZ-Sprit inkl. Kartengebühr.",
  hintFillRoom:
    "Es fließt nur rein, was nach der Ankunft noch Platz hat – nicht der volle Tank, wenn noch Rest da ist.",
  hintMealOuting:
    "Essen ist Kasse. Quatschen und Ausflug stehen extra – unbezahlbar, hier mit Hausnummer.",
  hintFx: "Euro-Kurs: {rate} Kč je €. In Kronen zahlen, nicht in Euro umrechnen lassen.",
  hintStationPrice: "CZ-Preis kommt von der günstigsten Tankstelle hinter der gewählten Grenze.",
  hintRangeShort:
    "Restreichweite reicht nicht bis zur Grenze – vorher in DE nachfüllen oder andere Strecke.",
  hintStale: "Stationspreis älter als 14 Tage – vor Ort prüfen.",

  cookieAria: "Hinweis zu Cookies und Speicherung",
  cookieText:
    "Nur notwendige Technik: deine Einstellungen bleiben im Browser. Keine Werbe- oder Analyse-Cookies. Details unter Datenschutz.",
  cookieOk: "Verstanden",
  legalNav: "Rechtliches",
  impressum: "Impressum",
  privacy: "Datenschutz",
  close: "Schließen",

  impressumIntro:
    "CZ-Tank-Check ist eine persönliche Mini-App zum privaten Gebrauch. Kein Angebot an die Allgemeinheit, kein Shop, keine Werbung.",
  operator: "Betreiber",
  emailLabel: "E-Mail:",
  contactHint: "Kontaktadresse in der App-Konfiguration hinterlegen, falls nötig.",
  impressumDisclaimer:
    "Angaben ohne Gewähr. Preise und Entfernungen können abweichen. Die Entscheidung zu fahren und zu tanken liegt bei dir.",

  privacyIntro: "Kurzer Hinweis für diese persönliche Mini-App. Stand: November 2026.",
  privacyPurposeTitle: "Zweck",
  privacyPurpose:
    "Die App hilft dir einzuschätzen, ob sich eine Tankfahrt über die Grenze lohnt. Sie ist für den privaten Gebrauch gedacht.",
  privacyLocalTitle: "Was lokal bleibt",
  privacyLocal:
    "Einstellungen (Sorte, Verbrauch, Restkilometer, Essen, Kartengebühr, Ausflugswert, Sprache), den letzten bekannten CZ-Preis und die Zustimmung zu diesem Hinweis speichert dein Browser auf dem Gerät. Das verlässt dein Gerät nicht über unsere App.",
  privacyLocTitle: "Standort",
  privacyLoc:
    "Wenn du prüfst, fragt der Browser nach deinem Standort. Die Koordinaten gehen nur an unsere Prüf-Schnittstelle, um Strecke und Preise zu berechnen. Ohne deine Freigabe findet keine Standortnutzung statt.",
  privacyExtTitle: "Externe Abrufe",
  privacyExt:
    "Zur Berechnung werden aktuelle Preise, Wechselkurs, Straßenentfernung und Kartenausschnitte von öffentlichen Quellen und Diensten geladen. Dabei können technische Verbindungsdaten (z. B. IP-Adresse) beim jeweiligen Betreiber anfallen. Es werden keine Werbe- oder Analyse-Cookies von uns gesetzt.",
  privacyHostTitle: "Hosting",
  privacyHost:
    "Die Webseite liegt bei einem Hosting-Anbieter. Beim Aufruf entstehen übliche Server-Logs (Zeit, IP, aufgerufene Seite). Details stehen in der Datenschutzerklärung des Hosting-Anbieters.",
  privacyRightsTitle: "Rechte",
  privacyRights:
    "Du kannst die lokalen Daten jederzeit im Browser löschen (Webseitendaten / Speicher). Auskunft, Berichtigung und Löschung gegenüber dem Betreiber: siehe Impressum.",
  privacyFooter:
    "Keine Tracking-Tools, kein Login, kein Newsletter. Nur so viel Technik wie nötig für die Prüfung.",
} as const;

type Dict = { [K in keyof typeof de]: string };

const cs: Dict = {
  brand: "CZ-Tank-Check",
  tagline:
    "Vyplatí se tankovat v Česku? Tam s tím, co zbývá v nádrži, zpět s levnějším benzinem – jídlo a pokec v ceně.",
  openSettings: "Otevřít nastavení",
  yourSetup: "Tvé nastavení",
  setupLine:
    "{fuel} · {cons} l/100 km · ještě {km} km v nádrži · jídlo {meal} € · karta {fee} %",
  checking: "Počítám …",
  checkNow: "Zkontrolovat",
  footer:
    "Osobní miniaplikace pro soukromé použití. DE: ceny u čerpacích. CZ: nejlevnější pumpa za hranicí. Kurz: referenční kurz ECB. Plaťte v korunách.",
  errNoGps: "Bez GPS nejde spočítat trasu. Zapni polohu v zařízení.",
  errGpsDenied: "Poloha není k dispozici. Povol GPS a zkus to znovu.",
  errCheckFailed: "Kontrola selhala",
  errUnknown: "Neznámá chyba",
  errCzRequired:
    "Nenašla se česká cena u stanice. Zadej Kč/l v nastavení.",
  useLastPrice: "Zkontrolovat s poslední cenou ({price} Kč/l, {age})",
  lastPriceHint: "Poslední známá cena ČR z zařízení – jen odhad.",

  settings: "Nastavení",
  cancel: "Zrušit",
  save: "Uložit",
  closeSettings: "Zavřít nastavení",
  fuel: "Palivo",
  diesel: "Nafta",
  rangeLabel: "Ještě km v nádrži",
  rangeHint: "např. 200",
  rangeNote:
    "Co ukazuje palubní počítač, než vyjedeš. Ne velikost nádrže (ta je 62 l).",
  consLabel: "Spotřeba l / 100 km",
  consHint: "5,2",
  consNote: "Jak auto opravdu jezdí – přívěs a zima se počítají.",
  mealLabel: "Jídlo € (2 os.)",
  feeLabel: "Poplatek karty %",
  feeHint: "0,2",
  ausflugLabel: "Výlet má cenu €",
  ausflugHint: "odhad",
  settingsHint:
    "Start je vždy tvoje aktuální poloha (GPS). Cenu v ČR bere aplikace z nejlevnější pumpy za hranicí.",
  czPriceLabelNeed: "Cena ČR Kč/l (nutné, zdroj chyběl)",
  czPriceLabelOpt: "Cena ČR Kč/l (jen když chybí stanice)",
  czPricePlaceholder: "načte se automaticky",
  language: "Jazyk",

  restNotEnough: "Zbytek nestačí k hranici",
  worthFuel: "Jo, samotné palivo se vyplatí",
  worthTrip: "Jo, výlet se vyplatí ;-)",
  notWorthFuel: "Ne, jen kvůli palivu se to nevyplatí",
  asOf: "Stav {when} · kurz {rate} Kč/€ (referenční kurz ECB)",
  priceAgeDe: "Cena DE {age}",
  priceAgeCz: "Cena CZ {age}",
  priceGuarantee:
    "Garance ceny jen odhad – často jen na pár hodin, ověř na místě.",
  pickRoute: "Vyber pumpu (nejkratší první, max. 5 na hranici)",
  shortest: "nejkratší",
  mapTitle: "Trasa na mapě",
  navi: "Navigace: {name}",
  share: "Sdílet",
  shareCopy: "Kopírovat",
  shareWhatsApp: "WhatsApp",
  shareCopied: "Zkopírováno",
  shareTitle: "CZ-Tank-Check",
  address: "Adresa",
  openingHours: "Otevírací doba",
  hoursUnknown: "není uvedeno",
  openNow: "právě otevřeno",
  closedNow: "právě zavřeno",
  roundTrip: "{one} km tam, {round} km tam a zpět. Cíl {lat}, {lng}",
  germany: "Německo",
  czechiaFx: "Česko + kurz",
  withCard: "s kartou {price} €/l",
  tankLogic: "Logika nádrže",
  tankOk: "Zbytek {km} km stačí. Tam {liters} l už v nádrži.",
  tankFail: "Zbytek nestačí ({have} km < {need} km).",
  tankMeta:
    "Po příjezdu ~{left} l zbývá → doplnit {fill} l (ne {full} l do plné nádrže).",
  fuelCalc: "Výpočet paliva",
  fuelCalcValue: "Úspora {save} · cesta zpět −{back}",
  fuelCalcMeta: "Alternativní cena cesty tam (přísně) −{opp} · mýto {toll}",
  fuelNet: "Čisté palivo",
  fuelNetMeta: "Přísně včetně zbytku na cestě tam: {strict}",
  cashAfterMeal: "Pokladna po jídle",
  cashMeta: "Jídlo {meal} pro 2 osoby (dobré jídlo).",
  withOuting: "S výletem",
  outingMeta:
    "Pokec/výlet oceněn na {value}. Aby pokladna vyšla, musí ti odpoledne stát alespoň za {need} – i tak je to k nezaplacení.",
  approxMin: "cca {min} min",

  hintOutbound:
    "Cesta tam: zbytek v nádrži (už zaplacený). Cesta zpět: české palivo včetně poplatku karty.",
  hintFillRoom:
    "Doplní se jen to, co se po příjezdu ještě vejde – ne celá nádrž, když něco zbývá.",
  hintMealOuting:
    "Jídlo jde z pokladny. Pokec a výlet jsou navíc – k nezaplacení, tady s odhadem.",
  hintFx: "Kurz eura: {rate} Kč za €. Plaťte v korunách, nenechte si přepočítat na eura.",
  hintStationPrice: "Cena v ČR je z nejlevnější pumpy za zvolenou hranicí.",
  hintRangeShort:
    "Dojezd nestačí k hranici – nejdřív doplň v DE nebo zvol jinou trasu.",
  hintStale: "Cena stanice je starší než 14 dní – ověř na místě.",

  cookieAria: "Upozornění na cookies a ukládání",
  cookieText:
    "Jen nutná technika: nastavení zůstane v prohlížeči. Žádné reklamní ani analytické cookies. Podrobnosti v ochraně údajů.",
  cookieOk: "Rozumím",
  legalNav: "Právní informace",
  impressum: "Tiráž",
  privacy: "Ochrana údajů",
  close: "Zavřít",

  impressumIntro:
    "CZ-Tank-Check je osobní miniaplikace pro soukromé použití. Nejde o nabídku veřejnosti, obchod ani reklamu.",
  operator: "Provozovatel",
  emailLabel: "E-mail:",
  contactHint: "Kontaktní adresu doplň v konfiguraci aplikace, pokud je potřeba.",
  impressumDisclaimer:
    "Údaje bez záruky. Ceny a vzdálenosti se mohou lišit. Rozhodnutí jet a tankovat je na tobě.",

  privacyIntro: "Krátké upozornění k této osobní miniaplikaci. Stav: listopad 2026.",
  privacyPurposeTitle: "Účel",
  privacyPurpose:
    "Aplikace pomáhá odhadnout, jestli se vyplatí tankovací cesta přes hranici. Je určena pro soukromé použití.",
  privacyLocalTitle: "Co zůstane lokálně",
  privacyLocal:
    "Nastavení (palivo, spotřeba, zbývající kilometry, jídlo, poplatek karty, hodnota výletu, jazyk), poslední známou cenu ČR a souhlas s tímto upozorněním ukládá prohlížeč v zařízení. Přes naši aplikaci to zařízení neopustí.",
  privacyLocTitle: "Poloha",
  privacyLoc:
    "Při kontrole se prohlížeč zeptá na polohu. Souřadnice jdou jen na naši výpočetní službu kvůli trase a cenám. Bez tvého souhlasu se poloha nepoužije.",
  privacyExtTitle: "Externí načítání",
  privacyExt:
    "Pro výpočet se načítají aktuální ceny, kurz, silniční vzdálenost a výřez mapy z veřejných zdrojů a služeb. U jejich provozovatelů mohou vzniknout technické údaje o spojení (např. IP adresa). My nenastavujeme reklamní ani analytické cookies.",
  privacyHostTitle: "Hosting",
  privacyHost:
    "Web běží u poskytovatele hostingu. Při návštěvě vznikají běžné serverové záznamy (čas, IP, stránka). Podrobnosti jsou v prohlášení o ochraně údajů poskytovatele hostingu.",
  privacyRightsTitle: "Práva",
  privacyRights:
    "Lokální data můžeš kdykoli smazat v prohlížeči (data webu / úložiště). Informace, oprava a smazání u provozovatele: viz tiráž.",
  privacyFooter:
    "Žádné sledovací nástroje, žádné přihlášení, žádný newsletter. Jen tolik techniky, kolik je potřeba ke kontrole.",
};

const catalogs: Record<Locale, Dict> = { de, cs };

export function loadLocale(): Locale {
  try {
    const raw = localStorage.getItem(LANG_KEY);
    if (raw === "cs" || raw === "de") return raw;
  } catch {
    /* ignore */
  }
  const nav = typeof navigator !== "undefined" ? navigator.language.toLowerCase() : "de";
  return nav.startsWith("cs") ? "cs" : "de";
}

export function saveLocale(locale: Locale): void {
  try {
    localStorage.setItem(LANG_KEY, locale);
  } catch {
    /* ignore */
  }
}

export function t(locale: Locale, key: keyof Dict, vars?: Record<string, string | number>): string {
  let s = catalogs[locale][key] ?? catalogs.de[key] ?? String(key);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}

export function localeTag(locale: Locale): string {
  return locale === "cs" ? "cs-CZ" : "de-DE";
}
