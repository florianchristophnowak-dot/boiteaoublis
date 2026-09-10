# Boîte à Oublis

**An der Tafel sammeln, Wortschatz aufbauen, sauber projizieren.**
Eine eigenständige, vollständig lokale Browser-App für den Fremdsprachenunterricht.
Version 1.1.0 · © Florian Nowak

Boîte à Oublis ist keine Vokabelverwaltung, sondern ein Unterrichtswerkzeug. Sie verbindet

* die **Tafel** – eine Fläche, auf der Wörter und Sätze gleichberechtigt stehen und sich frei verschieben lassen,
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

### Mit einer Tafel (die Grundform)

1. Oben im Kopfbereich **Fach** und **Lerngruppe** wählen.
2. **Tafeln → Neue Tafel**, Titel eingeben.
3. **Beamerfenster** öffnet ein zweites Fenster; dieses auf den Beamer-Bildschirm ziehen und dort **F** drücken.
4. **Doppelklick** auf die Fläche – im Beamerfenster genügt das ebenfalls – und lostippen.
5. Elemente mit der Maus dorthin ziehen, wo sie hingehören.

### Mit einer Wortbank (vollständige Ansicht)

1. Auf der Startseite eine Wortbank anklicken → **Projizieren**.
2. **Beamerfenster** oder **Vollbild** für die Projektion auf dem aktuellen Bildschirm.
3. Mit **1 / 2 / 3** die Unterstützungsstufe steuern, mit **← →** blättern.
4. Spontan gebraucht? **Strg + L** → Live-Hilfe eingeben → erscheint sofort am Beamer.

### Tastenkürzel

| Überall | |
|---|---|
| `Strg + K` | Schnellsuche über den gesamten Bestand |
| `Strg + L` | Live-Hilfe einblenden |
| `Strg + B` | Beamerfenster öffnen / schließen |
| `Strg + Z` / `Strg + Umschalt + Z` | Rückgängig / Wiederherstellen |
| `Alt + 1 … 8` | Ansicht wechseln |

| Auf einer Tafel (Vorschau **und** Beamerfenster) | |
|---|---|
| Doppelklick | Element anlegen oder ändern |
| Ziehen | Element verschieben |
| `← ↑ ↓ →` · `+` `−` · `Entf` | rücken · Größe · von der Tafel nehmen |

| In der Wortbank-Projektion (Steuerfenster **und** Beamerfenster) | |
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

## 3. Die Tafel – die einfache Grundform

Die Tafel ist Boîte à Oublis auf das Wesentliche zurückgenommen: **eine Fläche, Elemente darauf, sonst nichts.**

**Ob Wort oder Satz, spielt keine Rolle.** Auf der Tafel gibt es nur *Elemente*. „le stage“ steht neben
„Je voudrais expliquer que ___.“ – beides ist dasselbe: ein Stück Sprache an einer selbst gewählten Stelle.
Es gibt keine Abschnitte, keine Seiten und nichts zu blättern.

### Bedienung auf der Fläche

| | |
|---|---|
| **Doppelklick auf eine freie Stelle** | legt dort ein Element an |
| **Doppelklick auf ein Element** | ändert seinen Text |
| **Ziehen** | verschiebt |
| **einfach lostippen** | öffnet die Eingabe |
| `← ↑ ↓ →` | rückt das ausgewählte Element (mit `Umschalt` in größeren Schritten) |
| `+` `−` | Element größer / kleiner |
| `Entf` | von der Tafel nehmen – der Eintrag selbst bleibt im Bestand |
| `B` / `F` | Bildschirm leeren / Vollbild |

Das alles gilt **auch unmittelbar im Beamerfenster.** Wer mitten in der Stunde am Beamer ein Wort ergänzt
oder ein Element an eine andere Stelle zieht, arbeitet in denselben Daten: Vorschau, Vollbild-Überlagerung
und Beamerfenster zeigen immer denselben Stand. Mehrere Zeilen auf einmal eingefügt ergeben mehrere
Elemente, versetzt abgelegt.

Gespeichert wird die **Mitte eines Elements als Anteil der Fläche**. Deshalb sitzt es auf jeder Auflösung
an derselben Stelle – die Vorschau zeigt genau das Bild des Beamers. **Ordnen** stellt jederzeit ein
gleichmäßiges Raster wieder her.

### Später ergänzen

Ein auf der Fläche getipptes Element ist ein **gewöhnlicher Eintrag des Bestands** – zunächst nur Text.
In der Liste neben der Fläche trägt er die Kennzeichnung **nur Text**; das Stiftsymbol öffnet den
vollständigen Editor mit Artikel, Formhinweis, Wortverbindung, Chunk, Erklärung, Übersetzung, Beispielsatz,
Lautschrift, Thema und Niveau. Er taucht damit auch überall sonst auf: in der Wortschatzliste, in der
Schnellsuche, in Wortbanken, im Export.

Was ergänzt wurde, wirkt sofort auf die Tafel zurück. Zwei Schalter je Tafel entscheiden darüber:

* **Artikel zeigen** – vorhandene Artikel erscheinen farbig nach Genus (`le` blau, `la` rot),
* **Deutsch zeigen** – die deutsche Entsprechung erscheint unter dem Element.

Umgekehrt lässt sich alles, was die Lerngruppe schon kennt, über **Aus dem Bestand holen** auf die Tafel
legen – Wortschatzeinträge und Satzanfänge gleichermaßen. Eine ganze **Wortbank** wird über
*Tafeln → Aus einer Wortbank* zu einer Tafel; die Einträge verteilen sich gleichmäßig und sind danach
frei verschiebbar.

### Einfache Grundform oder vollständige Ansicht

Der Knopf **Ansicht** in der Kopfzeile schaltet zwischen beiden um:

* **einfache Grundform** – Tafeln, Elemente, Lerngruppen, Daten. Mehr nicht.
* **vollständige Ansicht** – zusätzlich Startseite, Satzanfänge, Wortbanken und Projektion.

Ein frisch eingerichteter Bestand startet in der Grundform. Versteckt wird dabei nichts, was verloren ginge:
Es sind dieselben Daten, nur die Navigationsleiste ist kürzer. Ein vorhandener Bestand behält beim
Aktualisieren die vollständige Ansicht.

---

## 4. Wie die Inhalte organisiert sind

```
Fach (Französisch, Englisch, …)
└── Lerngruppe (9b, Jg. 9, Schuljahr 2025/26)
    ├── Unterrichtsreihe („Le stage en entreprise“)
    ├── Wortschatzbestand      ← wächst über Jahre, wird nie dupliziert
    ├── Satzanfänge            ← nach kommunikativen Funktionen geordnet
    ├── Wortbanken             ← Auswahl für eine konkrete Unterrichtsszene
    └── Tafeln                 ← freie Fläche, Elemente an selbst gewählter Stelle
```

**Der Bestand gehört der Lerngruppe, nicht der Reihe.** Eine Wortbank und eine Tafel enthalten keine
Kopien, sondern Verweise. Deshalb kann derselbe Eintrag in beliebig vielen Wortbanken auftauchen, ohne sich zu vervielfachen –
und beim Schuljahreswechsel bleibt alles erhalten.

### Satzanfänge erfassen

Satzanfänge sind nach ihrer **Verwendung** geordnet – „eine Meinung äußern“, „begründen“,
„widersprechen“ und so weiter. Diese Bezeichnungen sind **frei benennbar**: Im Editor lässt sich eine
vorhandene auswählen oder einfach eine neue eintippen; sie wird beim Speichern angelegt und steht
danach überall zur Verfügung (Filter, Projektionsüberschriften, Einstellungen).

Für die Leerstellen gibt es einen Knopf **Leerstelle einfügen** – man muss keine Unterstriche tippen.
Als Leerstelle erkannt werden `___` (mehrere Unterstriche), `...` und `…`; in der Projektion erscheinen
sie als ruhige Linie.

### Lautschrift eingeben

Das Feld **Aussprache / Betonung** im Eintragseditor öffnet beim Anklicken eine **virtuelle IPA-Tastatur**.
Sie hat vier Register – Französisch, Englisch, Spanisch und ein Register mit Klammern, Betonungs- und
Längenzeichen sowie Diakritika. Das zum Fach passende Register ist vorgewählt.

* Zeichen werden an der Cursorposition eingefügt, der Fokus bleibt im Feld – Tippen und Klicken lassen
  sich mischen.
* Über allen Registern steht eine Zeile mit den ständig gebrauchten Zeichen: `[ ]`, `/ /`, `ˈ`, `ˌ`, `ː`, `.`
  Die Klammertasten setzen den Cursor gleich dazwischen.
* Zu jedem Zeichen gehört ein Beispielwort (`ɛ̃` – *vin*, `θ` – *think*, `β` – *haber*). Es erscheint in der
  Hinweiszeile, sobald man ein Zeichen berührt oder mit der Tabulatortaste anspringt.
* **Löschen** nimmt ein ganzes Zeichen samt Kombinationszeichen zurück – ein Klick eingefügt, ein Klick weg.
* `Esc` schließt zuerst die Tastatur und erst beim zweiten Mal den Dialog, damit keine halb fertige
  Eingabe verloren geht.

### Genus und Artikelfarben

Das Genus wird zuerst am Artikel selbst erkannt (`le`, `la`, `un`, `une`, `el`, `il`, `der`, `die`, `das` …),
sonst am Formhinweis (`m.`, `f.`, `n.`, auch `masculin`, `weiblich`, `neutrum`). Mehrdeutige Artikel wie
`l’`, `les` oder `des` richten sich nach dem Formhinweis – deshalb steht bei `l’entreprise` im Feld
*Formhinweis* ein `f.`. Gibt es keinen Anhaltspunkt, bleibt der Artikel neutral grau: **lieber keine Farbe
als eine falsche.** Sprachen ohne Artikelgenus (Englisch) bleiben davon unberührt.

Die Farben gelten überall gleich – in der Projektion, in der Wortschatzliste und im Wortbank-Editor.
Auf dunklem Hintergrund werden dieselben Farben aufgehellt, damit sie lesbar bleiben.

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

## 5. Abgestufte Hilfen

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

## 6. Projektion

Die Projektionsansicht ist bewusst reduziert: keine Bedienelemente, kein Menü, keine Dekoration.

* **Sehr große Schrift**, die sich an Breite *und* Höhe der Ausgabefläche orientiert.
* **Nichts wird gequetscht.** Passt eine Wortbank nicht auf eine Seite, wird sie automatisch auf mehrere
  Abschnitte verteilt – die Aufteilung entsteht durch echtes Messen im Browser, nicht durch Schätzen.
  Gleichzeitig begrenzt eine einstellbare Obergrenze (Voreinstellung 12) die Einträge je Seite.
* **Farbe nur mit Bedeutung.** Die einzige inhaltliche Farbcodierung ist das **Genus des Artikels**:
  <br>**maskulin = dunkelblau, feminin = dunkelrot, neutrum = dunkelgrün** – die aus dem Unterricht
  vertraute Konvention der/die/das. Bei Doppelformen wird jedes Teilstück einzeln eingefärbt
  („**le** / **la** responsable“). Alles Weitere ist reine Hierarchie: Zielsprache = Tinte,
  Wortverbindung/Chunk = Akzentfarbe, deutsche Entsprechung = gedämpftes Blaugrau,
  Beispielsatz = kursiv, Live-Hilfe = warmer Akzent.
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

## 7. Datensicherung

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

## 8. Projektstruktur

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
│       ├── ui/                   toast, modal, components, ipa (Lautschrift-Tastatur)
│       ├── projection/           stage-style, deck, render, output, session,
│       │                         board (freie Fläche)
│       ├── views/                dashboard, vocab, starters, banks, bank-editor,
│       │                         boards, board, present, manage, data
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

## 9. Zentrale Architekturentscheidungen

**Kein Framework, kein Bundler zur Laufzeit.**
Die App besteht aus klassischen Skripten unter einem gemeinsamen Namensraum `BAO`, die `index.html` in
fester Reihenfolge lädt. Das hat einen konkreten Grund: Klassische Skripte funktionieren auch beim Öffnen
per Doppelklick (`file://`), ES-Module dagegen nicht. Dadurch braucht die App weder Webserver noch
Build-Schritt – und ist trotzdem in nachvollziehbare Dateien gegliedert.

**Der Build ist optional und trivial.**
`tools/build.mjs` liest `app/index.html`, bettet alle Stylesheets und Skripte ein und schreibt eine einzige
HTML-Datei. Kein Transpiler, keine Abhängigkeiten, keine Namensmangelung – der Quelltext in der Einzeldatei
ist derselbe wie im Ordner `app/`. Das ist keine Selbstverständlichkeit: `String.replace` deutet `$$`,
`$&` und ``$` `` im Ersatztext als Sonderfolgen. Genau daran wurde aus `util.$$` einmal ein `util.$` –
die ausgelieferte Datei verhielt sich anders als der Quelltext. Deshalb ersetzt der Build ausschließlich
über Funktionen und prüft anschließend, dass jede eingebettete Datei Zeichen für Zeichen in der Ausgabe
steht; `npm run check` prüft dasselbe noch einmal.

**Ein Zustand, eine Schreibstelle.**
`core/store.js` hält den gesamten Bestand. Änderungen laufen ausschließlich über `commit(label, mutator)`.
Jeder Commit legt eine Momentaufnahme für „Rückgängig“ an (bis zu 40 Schritte, mit Wiederherstellen) und
speichert verzögert lokal. Ansichten lesen nur und zeichnen sich nach jeder Änderung neu.

**Speicherung über `localStorage`, nicht IndexedDB.**
Textdaten in dieser Größenordnung passen bequem hinein, das Format ist portabel, und – entscheidend –
`localStorage` funktioniert beim Start über `file://` zuverlässig, IndexedDB nicht überall. Fällt die
Speicherung aus, arbeitet die App weiter und weist sichtbar auf den Nur-Sitzung-Betrieb hin.

**Die Tafel benutzt dieselben Daten wie alles andere.**
Ein Element der Tafel ist ein Verweis auf einen Eintrag des Bestands, ergänzt um Position und Größe. Ein
auf der Fläche getipptes Wort legt deshalb einen ganz gewöhnlichen Wortschatzeintrag an – nur eben ohne
weitere Angaben. Genau das macht die einfache Grundform anschlussfähig: Was in der Stunde entsteht, ist
später vollständig ausbaubar, ohne dass etwas umgezogen oder abgeglichen werden müsste. Es gibt nur eine
Leinwand: Startet eine Wortbank-Projektion, gibt die Tafel sie ab, und umgekehrt.

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

## 10. Prüfen

```bash
npm run check   # ohne Browser: Dateien, Syntax, keine externen Verweise
npm test        # mit Browser: 153 Prüfungen entlang der Bedienabläufe
```

Der Testlauf öffnet die App als Datei (`file://`) – genau so, wie sie im Unterricht gestartet wird – und
prüft unter anderem: Beispieldaten und getrennte Fächer, Anlegen von Lerngruppen, Reihen, Einträgen und
Satzanfängen, die IPA-Tastatur, die Tafel (Anlegen per Doppelklick, Verschieben per Ziehen – beides auch
im Beamerfenster – und das spätere Ergänzen eines Elements), Wortbanken samt Ziehen und Ablegen, die drei
Unterstützungsstufen, Fokus- und
Abschreibmodus, Automatik, Live-Hilfe, das eigene Beamerfenster, die Projektion bei fünf Auflösungen
(dabei: nichts wird abgeschnitten, die Schrift bleibt groß), Genuserkennung und Artikelfarben in hell und
dunkel, Schuljahreswechsel, Rückgängig, Export/Import/Zusammenführen, CSV und die Dauerhaftigkeit nach
einem Neustart. Ein eigener Abschnitt prüft dieselben Abläufe zusätzlich in der portablen
Einzeldatei `dist/boite-a-oublis.html` – dort lief einmal ein Einbettungsfehler auf, den der Quelltext
nicht hatte. Bildschirmfotos landen in `tests/output/`.

---

## 11. Bewusst nicht enthalten

Benutzerkonten, Cloud-Synchronisierung, Schülergeräte, künstliche Intelligenz, automatische Übersetzung,
Lernstandsanalysen einzelner Schülerinnen und Schüler, Gamification.

---

© Florian Nowak
