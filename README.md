# Boîte à Oublis

**Wortschatz sammeln, Wortbanken bauen, sauber projizieren.**
Eine eigenständige, vollständig lokale Browser-App für den Fremdsprachenunterricht.
Version 1.0.0 · © Florian Nowak

Boîte à Oublis ist keine Vokabelverwaltung, sondern ein Unterrichtswerkzeug. Sie verbindet

* einen **langfristig wachsenden Wortschatzbestand** je Lerngruppe,
* **Wortverbindungen, Chunks und kommunikative Satzanfänge**,
* daraus zusammengestellte, situationsbezogene **Wortbanken**,
* **abgestufte sprachliche Hilfen**, die im Unterricht in Sekunden erweitert oder zurückgenommen werden,
* und eine **Projektionsansicht**, die auch aus der letzten Reihe lesbar ist.

Keine Konten, kein Server, keine Cloud, keine KI, keine Datenübertragung. Alles bleibt auf dem Lehrer-Laptop.

---

## 1. Starten

### Windows (Normalfall)

1. Den Projektordner an einen festen Ort legen, zum Beispiel `C:\Users\<Name>\Documents\boite-a-oublis`.
2. **`start.cmd`** doppelklicken.

`start.cmd` öffnet `dist/boite-a-oublis.html` im Standardbrowser. Diese eine Datei enthält die vollständige
App – kein Webserver, kein Node.js, keine Internetverbindung nötig. Sie lässt sich auch direkt doppelklicken
oder auf einen USB-Stick kopieren.

> **Wichtig:** Immer über dieselbe Datei starten. Browser trennen den lokalen Speicher nach Herkunft;
> wer die App abwechselnd über `dist/boite-a-oublis.html` und über `app/index.html` öffnet, sieht unter
> Umständen zwei getrennte Bestände. Zum Umziehen den Export/Import aus dem Bereich **Daten** verwenden.

### Andere Betriebssysteme

`dist/boite-a-oublis.html` im Browser öffnen. Fertig.

### Mit lokalem Webserver (optional)

Nur nötig, wenn ein Browser das Öffnen lokaler Dateien einschränkt:

```bash
npm start          # startet http://localhost:8765/
```

oder unter Windows `serve.cmd`. Voraussetzung ist eine Node.js-Installation.

### Empfohlene Browser

Aktuelle Versionen von Chrome, Edge oder Firefox. Für das eigene Beamerfenster müssen Pop-ups für
die Seite erlaubt sein – wird das Fenster blockiert, meldet die App das und bietet den Vollbildmodus an.

---

## 2. Der erste Unterrichtseinsatz in fünf Klicks

1. Oben im Kopfbereich **Fach** und **Lerngruppe** wählen.
2. Auf der Startseite eine Wortbank anklicken → **Projizieren**.
3. **Beamerfenster** öffnet ein zweites Fenster; dieses auf den Beamer-Bildschirm ziehen und dort **F** drücken.
   Alternativ **Vollbild** für die Projektion auf dem aktuellen Bildschirm.
4. Mit **1 / 2 / 3** die Unterstützungsstufe steuern, mit **← →** blättern.
5. Spontan gebraucht? **Strg + L** → Live-Hilfe eingeben → erscheint sofort am Beamer.

### Tastenkürzel

| Überall | |
|---|---|
| `Strg + K` | Schnellsuche über den gesamten Bestand |
| `Strg + L` | Live-Hilfe einblenden |
| `Strg + B` | Beamerfenster öffnen / schließen |
| `Strg + Z` / `Strg + Umschalt + Z` | Rückgängig / Wiederherstellen |
| `Alt + 1 … 7` | Ansicht wechseln |

| In der Projektion (Steuerfenster **und** Beamerfenster) | |
|---|---|
| `← →` | eine Seite zurück / weiter |
| `Pos1` / `Ende` | erste / letzte Seite |
| `Leertaste` | Automatik starten / anhalten |
| `1` `2` `3` | Unterstützungsstufe |
| `B` | Bildschirm leeren (schwarz) |
| `C` | Abschreibmodus |
| `F` | Vollbild |
| `+` `−` | Schrift größer / kleiner |
| `Esc` | Vollbild-Überlagerung beenden |

---

## 3. Wie die Inhalte organisiert sind

```
Fach (Französisch, Englisch, …)
└── Lerngruppe (9b, Jg. 9, Schuljahr 2025/26)
    ├── Unterrichtsreihe („Le stage en entreprise“)
    ├── Wortschatzbestand      ← wächst über Jahre, wird nie dupliziert
    ├── Satzanfänge            ← nach kommunikativen Funktionen geordnet
    └── Wortbanken             ← Auswahl für eine konkrete Unterrichtsszene
```

**Der Bestand gehört der Lerngruppe, nicht der Reihe.** Eine Wortbank enthält keine Kopien, sondern
Verweise. Deshalb kann derselbe Eintrag in beliebig vielen Wortbanken auftauchen, ohne sich zu vervielfachen –
und beim Schuljahreswechsel bleibt alles erhalten.

### Status eines Wortschatzeintrags

| Status | Bedeutung |
|---|---|
| **neu** | wird gerade eingeführt |
| **aktiv** | gehört zur laufenden Reihe |
| **auffrischen** | aus einer früheren Reihe, soll wieder aufgegriffen werden |
| **gesichert** | Grundbestand der Lerngruppe |
| **archiviert** | vorläufig aus dem aktiven Bestand genommen |

Der Status ist der Kern des Mitwachsens: Er entscheidet, was im Filter auftaucht, was in eine Wortbank
wandert und was beim Schuljahreswechsel passiert.

### Schuljahreswechsel

**Lerngruppen → „Ins nächste Schuljahr“** erhöht die Jahrgangsstufe, schreibt das Schuljahr fort und
notiert den Schritt im Verlauf der Lerngruppe. Auf Wunsch:

* was neu oder aktiv war, wird **Grundbestand**,
* der Wortschatz der letzten Reihe wird auf **auffrischen** gesetzt,
* laufende Reihen werden abgeschlossen,
* eine neue Reihe wird angelegt.

Es entstehen **keine Kopien**. Der Schritt lässt sich mit `Strg + Z` zurücknehmen.

---

## 4. Abgestufte Hilfen

Drei Stufen, die im Unterricht mit einem Tastendruck wechseln:

| Stufe | zeigt |
|---|---|
| **1 · Impuls** | nur die Schlüsselwörter, sehr groß, zentriert |
| **2 · Chunks** | zusätzlich Wortverbindungen, Chunks und Satzanfänge |
| **3 · Vollbild** | zusätzlich Erklärung, Beispielsatz, deutsche Entsprechung, Aussprache |

Welches Feld ab welcher Stufe erscheint, ist unter **Daten → Einstellungen** frei zuzuordnen.
Zusätzlich lässt sich in der Steuerungsansicht **jede einzelne Hilfe** ein- und ausblenden – etwa „alles
außer der Übersetzung“. Ein Stufenwechsel setzt diese Einzelschalter wieder auf die Voreinstellung.

Der **Fokusmodus** zeigt nur einen Abschnitt (zum Beispiel nur die Satzanfänge), dafür deutlich größer.

---

## 5. Projektion

Die Projektionsansicht ist bewusst reduziert: keine Bedienelemente, kein Menü, keine Dekoration.

* **Sehr große Schrift**, die sich an Breite *und* Höhe der Ausgabefläche orientiert.
* **Nichts wird gequetscht.** Passt eine Wortbank nicht auf eine Seite, wird sie automatisch auf mehrere
  Abschnitte verteilt – die Aufteilung entsteht durch echtes Messen im Browser, nicht durch Schätzen.
  Gleichzeitig begrenzt eine einstellbare Obergrenze (Voreinstellung 12) die Einträge je Seite.
* **Farbe nur mit Bedeutung:** Zielsprache = Tinte, Wortverbindung/Chunk = Akzentfarbe,
  deutsche Entsprechung = Blau, Beispielsatz = kursiv gedämpft, Live-Hilfe = warmer Akzent.
* **Leerstellen** in Satzanfängen werden als ruhige Linie dargestellt (im Text als `___` geschrieben).
* **Zwischenüberschriften** nach kommunikativer Funktion erscheinen automatisch, sobald ein Abschnitt
  mehrere Funktionen enthält – und werden bei einem Seitenumbruch wiederholt, nie allein gelassen.
* **Fortschritt** erscheint dezent: Punkte, Seitenzahl und – nur bei laufender Automatik – ein schmaler
  Zeitbalken. Abschaltbar.
* **Hell oder dunkel** je nach Raum, umschaltbar in der Steuerung.

### Zwei Wege auf den Beamer

1. **Eigenes Beamerfenster** (bevorzugt): ein zweites Browserfenster, das auf den zweiten Bildschirm gezogen
   und dort mit `F` in den Vollbildmodus gesetzt wird. Es zeigt immer denselben Stand wie die Steuerung.
2. **Vollbild-Überlagerung**: Wenn der Browser das Pop-up blockiert oder nur ein Bildschirm zur Verfügung
   steht, blendet die App die Projektion als Vollbild über die eigene Oberfläche.

Beide Wege lassen sich jederzeit kombinieren; die kleine Vorschau in der Steuerung spiegelt immer das,
was die Lernenden sehen.

### Automatisches Weiterschalten

Abschnittsweise, nie fließend. Intervall frei wählbar (Voreinstellungen 20–90 s), sofortiges Pausieren und
Fortsetzen, Vor- und Zurückspringen, verständliche Fortschrittsanzeige. Am Ende bleibt die letzte Seite
stehen – ein Neustart passiert nur, wenn er ausdrücklich eingeschaltet ist. Der **Abschreibmodus** friert die
Seite ein und blockiert die Automatik. Eine **Live-Hilfe pausiert automatisch**. Systemweit reduzierte
Bewegung (`prefers-reduced-motion`) schaltet alle Übergänge ab.

---

## 6. Datensicherung

Alles liegt im lokalen Speicher des Browsers (`localStorage`, Schlüssel `bao.state.v1`) und wird nach jeder
Änderung automatisch gesichert. Die Fußzeile zeigt den Speicherstand; kann der Browser nicht speichern,
weist die App deutlich darauf hin.

### Export

**Daten → Alle Daten exportieren** schreibt eine Datei `boite-a-oublis_JJJJ-MM-TT_hhmm.json` mit dem
gesamten Bestand samt Einstellungen. Zusätzlich lässt sich der Wortschatz einer Lerngruppe als CSV
ausgeben.

### Import

Datei auf das Feld ziehen oder auswählen. Die App **prüft zuerst** (Format, Kennzeichen, Datenversion,
Verweise) und zeigt dann einen Vergleich „jetzt / in der Datei“. Erst danach wird entschieden:

| Möglichkeit | Wirkung |
|---|---|
| **Zusammenführen** | Vorhandenes bleibt, Neues kommt hinzu; bei gleicher Kennung gewinnt der jüngere Stand |
| **Wiederherstellen** | Der jetzige Bestand wird vollständig ersetzt (mit zusätzlicher Rückfrage) |
| **Abbrechen** | Es passiert nichts |

Vor jedem schreibenden Import wird eine **Sicherheitskopie** des bisherigen Standes abgelegt
(wiederherstellbar unter *Daten*), und der Schritt landet im Rückgängig-Verlauf.
Fremde oder beschädigte Dateien werden mit einer verständlichen Meldung abgelehnt, ohne etwas zu verändern.

### CSV-Import

Für vorhandene Listen aus Tabellenprogrammen. Trennzeichen (`;` `,` Tabulator `|`) und Spalten werden
erkannt – gängige Überschriften wie *Zielwort, Artikel, Deutsch, Wortverbindung, Chunk, Erklärung,
Beispiel, Aussprache, Thema, Tags, Niveau, Status* werden automatisch zugeordnet. Die Zuordnung ist vor
dem Import sichtbar und änderbar, mit Vorschau.

Für den Alltag gibt es außerdem **Mehrere Zeilen einfügen**: eine Zeile je Eintrag, getrennt durch
`=`, `–`, `-`, Semikolon oder Tabulator.

### Versionierung des Datenformats

Jede Sicherung trägt eine `schemaVersion`. Beim Laden hebt eine Kette von Migrationen
(`app/js/core/migrations.js`) ältere Stände schrittweise an. Neuere Dateien als die installierte
Programmversion werden erkannt und höflich abgelehnt, statt Daten zu beschädigen.

---

## 7. Projektstruktur

```
boite-a-oublis/
├── start.cmd                     Windows-Start (öffnet die portable Datei)
├── serve.cmd                     optionaler lokaler Webserver
├── dist/boite-a-oublis.html      portable Einzeldatei (erzeugt aus app/)
├── app/                          Quelltext der Anwendung
│   ├── index.html                Grundgerüst, lädt alle Bausteine in fester Reihenfolge
│   ├── assets/icon.svg
│   ├── styles/
│   │   ├── tokens.css            Farben, Abstände, Typografie (hell und dunkel)
│   │   ├── base.css              Reset und wiederkehrende Bedienelemente
│   │   ├── shell.css             Kopfzeile, Navigation, Inhalt, Fußzeile
│   │   ├── views.css             die einzelnen Ansichten
│   │   └── projection.css        Rahmen der Projektion in der Lehreransicht
│   └── js/
│       ├── core/                 util, storage, schema, migrations, store,
│       │                         selectors, search, csv, backup
│       ├── data/seed.js          Beispieldaten
│       ├── ui/                   toast, modal, components (Symbole, Felder, Chips)
│       ├── projection/           stage-style, deck, render, output, session
│       ├── views/                dashboard, vocab, starters, banks, bank-editor,
│       │                         present, manage, data
│       ├── app.js                Navigation, Kontext, Schnellsuche, Tastenkürzel
│       └── main.js               Start
├── tools/
│   ├── build.mjs                 erzeugt dist/boite-a-oublis.html
│   ├── serve.mjs                 kleiner Webserver für die Entwicklung
│   └── check.mjs                 Selbstprüfung ohne Browser
├── tests/e2e.mjs                 Durchlauf der Bedienabläufe im echten Browser
└── docs/datenmodell.md           Referenz des Datenmodells
```

### Befehle

```bash
npm run build     # dist/boite-a-oublis.html neu erzeugen
npm run check     # Dateien, Syntax und Freiheit von externen Verweisen prüfen
npm test          # Bedienabläufe im Browser durchspielen (Playwright)
npm start         # lokaler Webserver auf http://localhost:8765/
```

Es gibt **keine Laufzeit-Abhängigkeiten**. `package.json` enthält keine `dependencies`; Playwright wird nur
für den Testlauf gebraucht (`npm install -D playwright` oder global installiert).

---

## 8. Zentrale Architekturentscheidungen

**Kein Framework, kein Bundler zur Laufzeit.**
Die App besteht aus klassischen Skripten unter einem gemeinsamen Namensraum `BAO`, die `index.html` in
fester Reihenfolge lädt. Das hat einen konkreten Grund: Klassische Skripte funktionieren auch beim Öffnen
per Doppelklick (`file://`), ES-Module dagegen nicht. Dadurch braucht die App weder Webserver noch
Build-Schritt – und ist trotzdem in nachvollziehbare Dateien gegliedert.

**Der Build ist optional und trivial.**
`tools/build.mjs` liest `app/index.html`, bettet alle Stylesheets und Skripte ein und schreibt eine einzige
HTML-Datei. Kein Transpiler, keine Abhängigkeiten, keine Namensmangelung – der Quelltext in der Einzeldatei
ist derselbe wie im Ordner `app/`.

**Ein Zustand, eine Schreibstelle.**
`core/store.js` hält den gesamten Bestand. Änderungen laufen ausschließlich über `commit(label, mutator)`.
Jeder Commit legt eine Momentaufnahme für „Rückgängig“ an (bis zu 40 Schritte, mit Wiederherstellen) und
speichert verzögert lokal. Ansichten lesen nur und zeichnen sich nach jeder Änderung neu.

**Speicherung über `localStorage`, nicht IndexedDB.**
Textdaten in dieser Größenordnung passen bequem hinein, das Format ist portabel, und – entscheidend –
`localStorage` funktioniert beim Start über `file://` zuverlässig, IndexedDB nicht überall. Fällt die
Speicherung aus, arbeitet die App weiter und weist sichtbar auf den Nur-Sitzung-Betrieb hin.

**Wortbanken verweisen, sie kopieren nicht.**
Eine Wortbank besteht aus Abschnitten mit Verweisen auf Wortschatzeinträge und Satzanfänge. Das ist die
Voraussetzung dafür, dass ein Bestand über Jahre wachsen kann, ohne unübersichtlich zu werden.

**Die Bühnengestaltung steht als Zeichenkette im Programmcode** (`projection/stage-style.js`).
Das Beamerfenster wird über `window.open('')` erzeugt und programmatisch aufgebaut; es teilt sich dadurch
den Ursprung mit der Lehreransicht. Ein dorthin verlinktes Stylesheet wäre beim Start über `file://` nicht
in allen Browsern ladbar – als eingebettete Zeichenkette ist die Projektion immer korrekt formatiert.
Aus demselben Grund braucht die Synchronisierung keine Kanäle: Die Steuerung schreibt direkt in das
Dokument des Beamerfensters.

**Die Seitenaufteilung wird gemessen, nicht geraten.**
`projection/render.js` füllt eine Seite Eintrag für Eintrag und prüft nach jedem Schritt, ob der Inhalt noch
vollständig sichtbar ist. Danach werden die Seiten gleichmäßig ausbalanciert und erneut gemessen. Die
Schriftgröße hängt linear an einer Grundeinheit `--u`, die aus der tatsächlichen Größe der Ausgabefläche
berechnet wird – deshalb zeigt die kleine Vorschau exakt dasselbe Umbruchverhalten wie der Beamer.

**Kommunikative Funktionen und Unterrichtsszenen sind Daten, kein Code.**
Beide Listen stehen im Bestand und lassen sich unter *Daten → Einstellungen* erweitern. Ebenso sind
weitere Fächer und Sprachen ohne Programmänderung anlegbar.

**Alles offline.**
Keine externen Schriften, keine CDNs, keine Netzwerkzugriffe. Symbole sind Inline-SVG, Schriften sind
Systemschriften. `npm run check` prüft das automatisch.

---

## 9. Prüfen

```bash
npm run check   # ohne Browser: Dateien, Syntax, keine externen Verweise
npm test        # mit Browser: 89 Prüfungen entlang der Bedienabläufe
```

Der Testlauf öffnet die App als Datei (`file://`) – genau so, wie sie im Unterricht gestartet wird – und
prüft unter anderem: Beispieldaten und getrennte Fächer, Anlegen von Lerngruppen, Reihen, Einträgen und
Satzanfängen, Wortbanken samt Ziehen und Ablegen, die drei Unterstützungsstufen, Fokus- und
Abschreibmodus, Automatik, Live-Hilfe, das eigene Beamerfenster, die Projektion bei fünf Auflösungen
(dabei: nichts wird abgeschnitten, die Schrift bleibt groß), Schuljahreswechsel, Rückgängig,
Export/Import/Zusammenführen, CSV und die Dauerhaftigkeit nach einem Neustart.
Bildschirmfotos landen in `tests/output/`.

---

## 10. Bewusst nicht enthalten

Benutzerkonten, Cloud-Synchronisierung, Schülergeräte, künstliche Intelligenz, automatische Übersetzung,
Lernstandsanalysen einzelner Schülerinnen und Schüler, Gamification.

---

© Florian Nowak
