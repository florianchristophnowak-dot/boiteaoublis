/* ==========================================================================
   Gestaltung der Projektionsansicht
   Diese Regeln stehen bewusst als Zeichenkette im Programmcode: Sie werden
   unverändert in das separate Beamerfenster injiziert. Ein dorthin verlinktes
   Stylesheet wäre beim Start über file:// nicht in allen Browsern ladbar –
   so ist die Projektion immer korrekt formatiert, auch ohne Webserver.

   Gestaltungsgrundsätze
   - sehr große Grundschrift, die sich an Breite UND Höhe orientiert
   - hoher Kontrast, ruhige Flächen, wenig Dekoration
   - Farbe nur mit Bedeutung:
       Zielsprache = Tinte,  Wortverbindung = Akzent,
       Deutsch     = Blau,   Beispiel      = kursiv/gedämpft,
       Live-Hilfe  = warmer Akzent
   ========================================================================== */
(function (BAO) {
  'use strict';

  BAO.stageStyle = `
.bao-stage {
  --u: min(1.05vw, 1.85vh);
  --user-scale: 1;
  --scale: var(--user-scale);
  --pad: calc(var(--u) * 2.2);

  --stage-bg: #fbfaf7;
  --stage-ink: #10141a;
  --stage-ink-2: #39414e;
  --stage-muted: #6d7684;
  --stage-line: #ded8ce;
  --stage-accent: #a8502c;
  --stage-de: #3d5b7a;
  --stage-brand: #1f4f6b;
  --stage-live: #8a5200;

  /* Genus des Artikels – die vertraute Konvention der/die/das.
     Nur hier tragen Blau, Rot und Grün eine Bedeutung. */
  --stage-genus-m: #0f3f96;
  --stage-genus-f: #9c1223;
  --stage-genus-n: #10603a;

  position: absolute;
  inset: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  background: var(--stage-bg);
  color: var(--stage-ink);
  font-family: "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system,
               Roboto, "Helvetica Neue", Arial, sans-serif;
  overflow: hidden;
  -webkit-font-smoothing: antialiased;

  /* Alle Größen hängen linear an --u. Das Skript setzt --u aus der echten
     Flächengröße, damit die kleine Vorschau exakt dasselbe Umbruchverhalten
     zeigt wie der Beamer. */
  --fs-term: max(9px, calc(var(--u) * 2.15 * var(--scale)));
  --fs-line: max(7px, calc(var(--u) * 1.26 * var(--scale)));
  --fs-head: max(6px, calc(var(--u) * 1.12 * var(--scale)));
  --fs-title: max(8px, calc(var(--u) * 1.62 * var(--scale)));
}

.bao-stage[data-stage-theme="dark"] {
  --stage-bg: #0d1116;
  --stage-ink: #f4f7fa;
  --stage-ink-2: #cdd5df;
  --stage-muted: #8c97a5;
  --stage-line: #2b333e;
  --stage-accent: #f0a074;
  --stage-de: #9fc3e2;
  --stage-brand: #8ec3e3;
  --stage-live: #f0c273;
  /* Auf dunklem Grund müssen dieselben Genusfarben aufgehellt werden,
     damit sie lesbar bleiben – blau, rot und grün bleiben erkennbar. */
  --stage-genus-m: #7db0f7;
  --stage-genus-f: #f5919c;
  --stage-genus-n: #77d3a5;
}

.bao-stage *, .bao-stage *::before, .bao-stage *::after { box-sizing: border-box; }
.bao-stage p, .bao-stage h1, .bao-stage h2, .bao-stage ul, .bao-stage li,
.bao-stage figure, .bao-stage article { margin: 0; padding: 0; list-style: none; }

/* --- Kopfzeile ---------------------------------------------------------- */
.stage__head {
  display: flex; align-items: baseline; gap: calc(var(--u) * 1.4);
  padding: calc(var(--pad) * .75) var(--pad) calc(var(--pad) * .45);
  border-bottom: 1px solid var(--stage-line);
  min-width: 0;
}
.stage__crumb {
  font-size: var(--fs-head); color: var(--stage-muted); font-weight: 600;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 0 1 auto; max-width: 34%;
}
.stage__crumb b { color: var(--stage-brand); font-weight: 700; }
.stage__title {
  font-size: var(--fs-title); font-weight: 650; letter-spacing: -.01em;
  flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.stage__pos {
  font-size: var(--fs-head); color: var(--stage-muted);
  font-variant-numeric: tabular-nums; white-space: nowrap; flex: none;
}
.stage__pos b { color: var(--stage-ink-2); }

/* --- Inhalt -------------------------------------------------------------- */
.stage__body {
  padding: var(--pad);
  overflow: hidden;
  display: grid;
  /* Ruhige Fläche: Inhalt wird vertikal zentriert, weil die Seitenaufteilung
     ohnehin dafür sorgt, dass alles passt. */
  align-content: center;
  gap: calc(var(--u) * 1.15) calc(var(--u) * 2.6);
  grid-template-columns: repeat(var(--cols, 2), minmax(0, 1fr));
}
.stage__body[data-layout="starters"] { gap: calc(var(--u) * 1.5) calc(var(--u) * 3); }
.stage__body[data-layout="impulse"] { justify-items: center; gap: calc(var(--u) * 2.4); }

/* Wortschatzseiten fließen spaltenweise: erst Spalte 1 von oben nach unten,
   dann Spalte 2. Das packt unterschiedlich hohe Einträge dicht und entspricht
   der gewohnten Lesart einer Wortliste. */
.stage__body[data-layout="cards"] {
  display: block;
  columns: var(--cols, 2);
  column-gap: calc(var(--u) * 2.8);
  /* Ausgeglichene Spalten: Auch eine halb volle Seite wirkt aufgeräumt.
     Passt der Inhalt nicht, entstehen weitere Spalten – das erkennt die
     Messung in render.js an der Breite und bricht die Seite um. */
  column-fill: balance;
}
.stage__body[data-layout="cards"] .pitem {
  break-inside: avoid;
  margin-bottom: calc(var(--u) * 1.3);
}
.stage__body[data-layout="cards"] .pitem:last-child { margin-bottom: 0; }

/* Während der Messung oben ausrichten – nur so ist ein Überlauf messbar. */
.stage__body[data-measuring="true"] { visibility: hidden; align-content: start; }

.pitem { min-width: 0; }
.pitem__term {
  font-size: var(--fs-term); font-weight: 650; line-height: 1.12;
  letter-spacing: -.012em; overflow-wrap: break-word;
}
.pitem__term .art { color: var(--stage-muted); font-weight: 500; }
.pitem__term .art__part[data-gender] { font-weight: 650; }
.pitem__term .art__part[data-gender="m"] { color: var(--stage-genus-m); }
.pitem__term .art__part[data-gender="f"] { color: var(--stage-genus-f); }
.pitem__term .art__part[data-gender="n"] { color: var(--stage-genus-n); }
.pitem__term .gram {
  font-size: .5em; color: var(--stage-muted); font-weight: 500;
  margin-left: .35em; white-space: nowrap;
}
.pitem__line {
  font-size: var(--fs-line); line-height: 1.3; margin-top: calc(var(--u) * .3);
  overflow-wrap: break-word;
}
.pitem__chunk { color: var(--stage-accent); font-weight: 600; }
.pitem__expl { color: var(--stage-ink-2); }
.pitem__de { color: var(--stage-de); }
.pitem__ex { color: var(--stage-muted); font-style: italic; }
.pitem__meta { font-size: calc(var(--fs-line) * .78); color: var(--stage-muted); margin-top: calc(var(--u) * .22); }

.stage__body[data-layout="impulse"] .pitem { text-align: center; }
.stage__body[data-layout="impulse"] .pitem__term { font-size: calc(var(--fs-term) * 1.3); }

.pitem--starter .pitem__starter {
  font-size: calc(var(--fs-term) * .8); line-height: 1.3; font-weight: 550;
  overflow-wrap: break-word;
}
.pitem__starter .gap {
  display: inline-block; min-width: 6ch;
  border-bottom: .07em solid currentColor; opacity: .34;
  margin: 0 .12em;
}
.pitem--starter .pitem__de { font-size: calc(var(--fs-line) * .92); }

.pitem--live {
  border-left: .16em solid var(--stage-live);
  padding-left: calc(var(--u) * .9);
}
.pitem--live .pitem__term, .pitem--live .pitem__starter { color: var(--stage-live); }

.pgroup {
  grid-column: 1 / -1;
  font-size: calc(var(--fs-head) * 1.02); font-weight: 700; letter-spacing: .07em;
  text-transform: uppercase; color: var(--stage-muted);
  padding-bottom: calc(var(--u) * .25); border-bottom: 1px solid var(--stage-line);
  margin-top: calc(var(--u) * .5);
}
.pgroup:first-child { margin-top: 0; }

.stage__empty {
  grid-column: 1 / -1; align-self: center; justify-self: center; text-align: center;
  color: var(--stage-muted); font-size: var(--fs-title); max-width: 26ch; line-height: 1.4;
}

/* --- Fußzeile ------------------------------------------------------------ */
.stage__foot {
  display: flex; align-items: center; gap: calc(var(--u) * 1.2);
  padding: calc(var(--pad) * .35) var(--pad) calc(var(--pad) * .45);
  border-top: 1px solid var(--stage-line);
  font-size: calc(var(--fs-head) * .92); color: var(--stage-muted);
}
.stage__foot[data-hidden="true"] { visibility: hidden; }
.stage__dots { display: flex; gap: calc(var(--u) * .45); flex-wrap: wrap; flex: 1 1 auto; align-items: center; }
.stage__dot {
  width: calc(var(--u) * .6); height: calc(var(--u) * .6); border-radius: 50%;
  background: var(--stage-line); flex: none;
}
.stage__dot[data-state="done"] { background: var(--stage-muted); opacity: .55; }
.stage__dot[data-state="current"] { background: var(--stage-brand); transform: scale(1.4); }
.stage__timer {
  width: calc(var(--u) * 8); height: calc(var(--u) * .32); border-radius: 99px;
  background: var(--stage-line); overflow: hidden; flex: none;
}
.stage__timer i { display: block; height: 100%; background: var(--stage-brand); width: 0%; }
.stage__badge {
  display: inline-flex; align-items: center; gap: .4em; flex: none;
  padding: .1em .7em; border-radius: 99px; font-weight: 650;
  background: var(--stage-line); color: var(--stage-ink-2);
}
.stage__badge[data-kind="copy"] { background: var(--stage-brand); color: var(--stage-bg); }
.stage__badge[data-kind="live"] { background: var(--stage-live); color: var(--stage-bg); }

/* --- Sonderzustände ------------------------------------------------------ */
.bao-stage[data-blank="true"] > * { visibility: hidden; }
.bao-stage[data-blank="true"] { background: #05070a; }
.bao-stage[data-blank="true"]::after {
  content: attr(data-blank-hint);
  position: absolute; inset: auto 0 4vh 0; text-align: center;
  color: #26313f; font-size: 13px; letter-spacing: .1em; visibility: visible;
}

.stage__hint {
  position: absolute; left: 50%; bottom: 2.5vh; transform: translateX(-50%);
  background: rgba(16, 21, 28, .86); color: #eef2f6;
  border-radius: 999px; padding: .5em 1.2em; font-size: 14px; letter-spacing: .01em;
  display: flex; gap: 1.1em; align-items: center; pointer-events: none;
  transition: opacity .4s ease; z-index: 5;
}
.stage__hint[data-hidden="true"] { opacity: 0; }
.stage__hint kbd {
  font-family: inherit; background: rgba(255,255,255,.16); border-radius: 4px;
  padding: 0 .4em; margin-right: .3em;
}

.stage__body { animation: bao-stage-fade .18s ease-out; }
@keyframes bao-stage-fade { from { opacity: .4; } to { opacity: 1; } }

@media (prefers-reduced-motion: reduce) {
  .stage__body { animation: none; }
  .stage__dot[data-state="current"] { transform: none; outline: 2px solid var(--stage-brand); outline-offset: 2px; }
  .stage__timer i { transition: none; }
  .stage__hint { transition: none; }
}
`;

  /** Grundgerüst für das eigenständige Beamerfenster. */
  BAO.stageDocumentStyle = `
html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #0d1116; }
body { position: relative; }
`;
})(window.BAO = window.BAO || {});
