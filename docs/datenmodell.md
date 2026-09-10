# Datenmodell

Referenz für Weiterentwicklung und für das Verständnis einer Sicherungsdatei.
Quelle der Wahrheit ist `app/js/core/schema.js`.

## Aufbau einer Sicherungsdatei

```json
{
  "kind": "boite-a-oublis.backup",
  "appVersion": "1.1.0",
  "schemaVersion": 2,
  "exportedAt": "2026-09-07T18:12:00.000Z",
  "counts": { "subjects": 2, "groups": 2, "…": 0 },
  "data": { /* der vollständige Zustand, siehe unten */ }
}
```

Ein Import akzeptiert auch den bloßen Zustand (ohne Hülle), sofern er `schemaVersion` und `lexemes` enthält.

## Zustand

```js
{
  schemaVersion: 2,
  meta:     { appVersion, createdAt, updatedAt, seededAt },
  settings: { … },                 // siehe unten
  ui:       { subjectId, groupId, recentBanks[], recentGroups[] },
  functions: [ { id, label, order } ],   // kommunikative Funktionen
  subjects:  [ … ], groups: [ … ], units: [ … ],
  lexemes:   [ … ], starters: [ … ], banks: [ … ], boards: [ … ]
}
```

Alle Verweise laufen über Kennungen (`id`). Es gibt keine verschachtelten Kopien.

### `subjects` – Fach / Fremdsprache

| Feld | Bedeutung |
|---|---|
| `id`, `name` | z. B. `sub_fr`, „Französisch“ |
| `short` | Kürzel für die Kopfzeile („FR“) |
| `color`, `colorSoft` | Fachfarbe, konsistent in der ganzen Oberfläche |
| `order` | Reihenfolge in der Auswahl |

### `groups` – Lerngruppe

| Feld | Bedeutung |
|---|---|
| `subjectId` | Zugehöriges Fach |
| `name`, `grade`, `schoolYear` | „9b“, `9`, `"2025/26"` |
| `favorite`, `archived`, `note` | |
| `history[]` | `{ schoolYear, grade, at, note }` je Schuljahreswechsel |

Die Lerngruppe ist der Eigentümer des Wortschatzbestands. Beim Schuljahreswechsel ändern sich nur
`grade`, `schoolYear` und `history` – die Einträge bleiben dieselben Objekte.

### `units` – Unterrichtsreihe

`{ id, groupId, title, description, schoolYear, status, order }`
`status`: `planned` | `current` | `done`. Je Lerngruppe ist höchstens eine Reihe `current`.

### `lexemes` – Wortschatzeintrag

| Feld | Bedeutung |
|---|---|
| `term` | Zielwort **ohne** Artikel |
| `article` | „le“, „la“, „l’“, „le / la“ … (wird nicht doppelt angezeigt, wenn er schon im Zielwort steht) |
| `gram` | Form- oder Pluralhinweis („m.“, „pl. les stages“, „adj.“) – bestimmt bei mehrdeutigen Artikeln das Genus |
| `collocation` | typische Wortverbindung |
| `chunk` | kurzer, sofort verwendbarer Baustein |
| `explanation` | zielsprachige Erklärung |
| `translation` | deutsche Entsprechung (optional) |
| `example` | Beispielsatz |
| `pronunciation` | Aussprache- oder Betonungshinweis; im Editor über die IPA-Tastatur eingebbar (`app/js/ui/ipa.js`) |
| `functionId` | kommunikative Funktion (optional) |
| `topics[]`, `tags[]`, `cefr` | Themen, Schlagwörter, Niveau |
| `status` | `new` \| `active` \| `revisit` \| `core` \| `archived` |
| `introducedUnitId`, `introducedSchoolYear` | Zeitpunkt bzw. Kontext der Einführung |
| `subjectId`, `groupId`, `createdAt`, `updatedAt`, `favorite` | |

Pflichtfeld ist nur `term`.

### `starters` – Satzanfang

| Feld | Bedeutung |
|---|---|
| `text` | Formulierung; `___`, `...` oder `…` markieren eine Leerstelle |
| `translation` | deutsche Entsprechung (optional) |
| `functionId` | Verwendung (kommunikative Funktion) – frei benennbar, siehe unten |
| `variant` | `einfach` \| `standard` \| `anspruchsvoll` |
| `groupId` | leer = im ganzen Fach verfügbar |
| `subjectId`, `tags[]`, `status`, `note` | |

### `banks` – Wortbank

```js
{
  id, subjectId, groupId, unitId, title,
  scene: "Partnergespräch",
  defaultLevel: 2,
  note,                       // nur für die Lehrkraft
  favorite, createdAt, updatedAt, lastUsedAt,
  sections: [
    {
      id, title,
      layout: "auto" | "cards" | "impulse" | "starters",
      items: [ { id, kind: "lex" | "starter", refId } ]
    }
  ]
}
```

Beim Laden entfernt die Prüfung in `schema.validateState` Positionen, deren Ziel es nicht mehr gibt, und
meldet das als Hinweis.

### `boards` – Tafel (die einfache Grundform)

```js
{
  id, subjectId, groupId, unitId, title, note,
  favorite, showArticle, showTranslation,
  createdAt, updatedAt, lastUsedAt,
  items: [ { id, kind: "lex" | "starter", refId, x, y, scale } ]
}
```

Eine Tafel ist eine Fläche mit frei platzierten Elementen. `kind` unterscheidet zwar weiterhin, woher ein
Element stammt, aber **nur für die Auflösung des Verweises** – in Bedienung und Darstellung sind Wort und
Satz dasselbe. Neu auf der Fläche angelegte Elemente entstehen immer als Wortschatzeintrag (`kind: "lex"`)
und lassen sich deshalb später mit dem gewöhnlichen Eintragseditor vervollständigen.

| Feld | Bedeutung |
|---|---|
| `x`, `y` | **Mitte** des Elements als Anteil der Fläche (0…1) – auflösungsunabhängig |
| `scale` | 0,5…2; hebt einzelne Elemente hervor |
| `showArticle` | vorhandene Artikel farbig nach Genus mitzeigen |
| `showTranslation` | deutsche Entsprechung unter dem Element einblenden |

Beim Laden werden Positionen auf 0…1 zurückgeholt und Verweise ins Leere entfernt (`schema.validateState`).
Die Anzeige korrigiert zusätzlich nach dem Messen: Ein Element, das mit seiner tatsächlichen Breite über den
Rand ragen würde, rückt in die Fläche – der gespeicherte Wert bleibt davon unberührt.

`BAO.select.isBareEntry(ref)` beantwortet, ob ein Eintrag außer dem Text schon weitere Angaben trägt. Die
Tafelansicht kennzeichnet solche Elemente mit „nur Text“.

### `settings`

| Feld | Bedeutung |
|---|---|
| `theme` | `auto` \| `light` \| `dark` (Lehreransicht) |
| `simpleMode` | einfache Grundform: nur Tafeln, Elemente, Lerngruppen, Daten |
| `stageTheme`, `stageScale` | Projektion: hell/dunkel, Schriftfaktor |
| `autoAdvanceSeconds`, `autoAdvanceLoop` | Automatik |
| `maxItemsPerSlide` | didaktische Obergrenze je Projektionsseite |
| `showProgressOnStage` | Fortschritt am Beamer zeigen |
| `railCollapsed` | Navigationsbreite |
| `scenes[]` | Unterrichtsszenen (erweiterbar) |
| `fieldLevels{}` | ab welcher Unterstützungsstufe ein Feld erscheint |

## Unterstützungsstufen

`fieldLevels` ordnet jedem projizierbaren Feld eine Stufe zu. Voreinstellung:

| Feld | ab Stufe |
|---|---|
| `article` | 1 |
| `collocation`, `chunk` | 2 |
| `gram`, `explanation`, `translation`, `example`, `pronunciation`, `starterTranslation` | 3 |

`BAO.deck.fieldsForLevel(level, fieldLevels)` erzeugt daraus die Sichtbarkeitszuordnung. Die Lehrkraft kann
in der Steuerung einzelne Felder übersteuern; ein Stufenwechsel setzt die Übersteuerung zurück.

## Migrationen

`app/js/core/migrations.js` enthält eine geordnete Liste von Schritten, die den Bestand jeweils um genau
eine Version anheben. Version 2 hat `boards` und `settings.simpleMode` ergänzt; ein vorhandener Bestand
behält dabei die vollständige Ansicht, ein frisch angelegter startet in der Grundform. Eine neue Version bedeutet:

1. `SCHEMA_VERSION` in `schema.js` erhöhen,
2. einen Schritt `{ to: n, describe, run(state) }` an `STEPS` anhängen,
3. Standardwerte in den Fabriken (`makeLexeme`, `makeBank`, …) ergänzen.

Fehlende Felder werden zusätzlich beim Laden durch `validateState` ergänzt, sodass auch unvollständige
Datensätze nutzbar bleiben.

## Genus der Artikel

`BAO.ui.genderOf(lexeme)` liefert `'m'`, `'f'`, `'n'`, `'mf'` (Doppelform) oder `''` (unbestimmt).
Die Reihenfolge der Auswertung:

1. **Artikel selbst** – `le, un, el, lo, il, uno, der` → maskulin; `la, une, una, die, eine` → feminin;
   `das` → neutrum. Bewusst *nicht* in der Tabelle: `les, des, los, las, l’, the, ein` – sie sind
   mehrdeutig.
2. **Formhinweis** (`gram`) – `m.`, `f.`, `n.` sowie ausgeschriebene Formen wie `maskulin`, `weiblich`,
   `neutrum`. Der Hinweis greift auch für die mehrdeutigen Artikel aus Schritt 1.
3. Sonst: keine Farbe.

`BAO.ui.termNode(lexeme, { doc, gram })` erzeugt daraus die Darstellung. Jedes Teilstück des Artikels
bekommt ein eigenes `<span class="art__part" data-gender="…">`, damit „le / la“ zweifarbig erscheint.
Die Farben stehen als Token `--genus-m/-f/-n` (Lehreransicht) und `--stage-genus-m/-f/-n` (Projektion,
jeweils für hell und dunkel).

Eine weitere Sprache braucht dafür keinen Programmeingriff, solange ihre Artikel in der Tabelle stehen
oder die Lehrkraft den Formhinweis pflegt.

## IPA-Tastatur

`BAO.ipa.field({ label, value, placeholder, hint, subject, full })` liefert ein Eingabefeld mit
eingebauter Zeichentastatur. `BAO.ipa.LAYOUTS` enthält die Register; jede Taste ist entweder

* `'ʃ'` – nur das Zeichen,
* `['ɛ̃', 'vin']` – Zeichen mit Beispielwort, oder
* `{ ins, show, hint, caret }` – für Fälle, in denen sich Eingefügtes und Angezeigtes unterscheiden
  (`{ ins: '[]', show: '[ ]', caret: -1 }` setzt den Cursor zwischen die Klammern; `{ ins: '\u0303',
  show: '◌̃' }` zeigt ein Kombinationszeichen auf dem gepunkteten Kreis).

Ein weiteres Register braucht nur einen zusätzlichen Eintrag in `LAYOUTS`. `layoutForSubject` wählt das
Register anhand des Fachnamens vor.

## Verwendungen (kommunikative Funktionen)

`state.functions` ist eine gewöhnliche Liste `{ id, label, order }` – kein fester Vorrat im Programm.
`BAO.ui.functionField({ state, value, label })` liefert ein Eingabefeld mit Vorschlagsliste; sein
`resolve(draft)` sucht die eingetippte Bezeichnung (akzentunempfindlich) und legt sie andernfalls an.
Aufgerufen wird es **innerhalb** des commit-Mutators, damit Anlegen und Zuordnen ein einziger,
gemeinsam rückgängig zu machender Schritt sind.
