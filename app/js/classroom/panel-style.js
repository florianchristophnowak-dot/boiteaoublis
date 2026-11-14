/* ==========================================================================
   Gestaltung der Unterrichtsleiste
   Die Leiste des Soundboards liegt am rechten Rand jeder Leinwand – auch im
   eigenständigen Beamerfenster. Ihre Regeln hängen deshalb an BAO.stageStyle
   und werden mit der Projektionsansicht in jedes Dokument injiziert (siehe
   stage-style.js).

   Grundsätze, übernommen aus dem Teacher Soundboard:
   - keine Schrift: nur Symbole, lesbar bis in die letzte Reihe
   - keine Karte, kein Rahmen: Gruppen trennt allein der Abstand
   - alles rechtsbündig, zur Kante hin, an der die Leiste klebt
   - eine einzige Grundeinheit (--cu); das Skript setzt sie aus der Höhe der
     Fläche, damit die Vorschau dieselben Verhältnisse zeigt wie der Beamer
   ========================================================================== */
(function (BAO) {
  'use strict';

  BAO.stageStyle += `
/* --- Unterrichtsleiste (Soundboard) ---------------------------------------- */

/* Die Leinwand räumt der Leiste eine eigene Spalte ein – nichts wird verdeckt. */
.bao-stage { padding-right: var(--cr-reserve, 0px); }

/* Auch auf geleerter Leinwand bleibt die Leiste stehen: Der Timer läuft weiter. */
.bao-stage[data-blank="true"] > .cr-panel,
.bao-stage[data-blank="true"] > .cr-pop { visibility: visible; }

.cr-panel {
  --cu: 48px;
  position: absolute; right: 0; top: 0; z-index: 4;
  display: flex; flex-direction: column; align-items: flex-end;
  padding: calc(var(--cu) * .14);
  line-height: 0;
  pointer-events: none;            /* nur die Zeichen selbst nehmen Klicks an */
  -webkit-user-select: none; user-select: none;
}
.cr-panel[hidden] { display: none; }
.cr-panel *, .cr-pop * { box-sizing: border-box; }

:where(.cr-panel, .cr-pop) button {
  -webkit-appearance: none; appearance: none;
  position: relative; display: block; flex: none;
  margin: 0; padding: 0; border: 0; min-height: 0;
  background: none; color: inherit; font: inherit; line-height: inherit;
  cursor: pointer; pointer-events: auto;
  -webkit-tap-highlight-color: transparent; touch-action: manipulation;
}
.cr-panel button:focus-visible, .cr-pop button:focus-visible {
  outline: 3px solid #7cc4ff; outline-offset: 2px;
}

/* Griff: die Leiste lässt sich senkrecht verschieben. */
.cr-panel .cr-grip {
  width: calc(var(--cu) * .62); height: calc(var(--cu) * .24);
  cursor: grab; touch-action: none;
}
.cr-grip::before {
  content: ""; position: absolute; left: 0; right: 0; top: 30%;
  height: max(3px, calc(var(--cu) * .07)); border-radius: 99px;
  background: rgba(125, 134, 146, .75);
}
.cr-panel[data-dragging="true"] .cr-grip { cursor: grabbing; }

.cr-groups { display: flex; flex-direction: column; align-items: flex-end; gap: calc(var(--cu) * .38); }
.cr-group { display: flex; flex-direction: column; align-items: flex-end; gap: calc(var(--cu) * .13); }
.cr-row {
  display: flex; flex-wrap: wrap; justify-content: flex-end;
  gap: calc(var(--cu) * .13); max-width: calc(var(--cu) * 2.13);
}

/* Kachel: weißes Motiv auf farbigem Grund. */
.cr-tile {
  width: var(--cu); height: var(--cu); border-radius: 22%;
  background: var(--tile, #475569); color: #fff; overflow: hidden;
}
.cr-panel .cr-tile--big { width: calc(var(--cu) * 1.5); height: calc(var(--cu) * 1.5); }
.cr-glyph { position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: block; }
/* Eigene Bilder bekommen Abstand zum Rand; die mitgelieferten Zeichen tragen ihn in sich. */
.cr-tile__image { position: absolute; left: 10%; top: 10%; width: 80%; height: 80%; object-fit: contain; }
.cr-tile[data-state="blank"] { box-shadow: inset 0 0 0 max(2px, calc(var(--cu) * .06)) #1d9a6c; }

/* Münze: die Klangtaste. */
.cr-coin { width: var(--cu); height: var(--cu); border-radius: 50%; }
.cr-coin__face, .cr-coin__image {
  position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: block; border-radius: 50%;
}
.cr-coin__image { object-fit: cover; }
.cr-coin[data-empty="true"] { opacity: .45; }
.cr-coin[data-playing="true"] { box-shadow: 0 0 0 max(3px, calc(var(--cu) * .07)) rgba(0, 200, 255, .78); }

/* Timer: Scheibe und drei runde Schaltflächen. */
.cr-dial { width: calc(var(--cu) * 1.9); height: calc(var(--cu) * 1.9); border-radius: 50%; }
.cr-dial__svg { position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: block; }
.cr-timer__row { display: flex; align-items: center; gap: calc(var(--cu) * .16); }
.cr-round {
  width: calc(var(--cu) * .62); height: calc(var(--cu) * .62); border-radius: 50%;
  background: #5d6874; color: #fff;
}
.cr-panel .cr-round--main { width: calc(var(--cu) * .86); height: calc(var(--cu) * .86); }
.cr-action { position: absolute; left: 14%; top: 14%; width: 72%; height: 72%; display: block; overflow: visible; }

/* Dünner heller Ring unter dem Zeiger, breiter Ring um die Auswahl. */
.cr-tile::after, .cr-coin::after, .cr-round::after, .cr-dial::after {
  content: ""; position: absolute; left: 0; top: 0; right: 0; bottom: 0;
  border-radius: inherit; pointer-events: none;
}
@media (hover: hover) {
  .cr-tile:hover::after, .cr-coin:hover::after, .cr-round:hover::after, .cr-dial:hover::after {
    box-shadow: inset 0 0 0 max(1.6px, calc(var(--cu) * .035)) rgba(255, 255, 255, .8);
  }
}
.cr-tile[data-selected="true"]::after { box-shadow: inset 0 0 0 max(2.5px, calc(var(--cu) * .06)) #fff; }

/* --- Auswahlfelder der Leiste -------------------------------------------------
   Sie erscheinen links neben der Leiste, in derselben Fläche – also auch im
   Beamerfenster. Hier darf Schrift stehen: Sie richten sich an die Lehrkraft. */
.cr-pop {
  --pu: 56px;
  --cu: var(--pu);
  position: absolute; z-index: 6;
  display: flex; flex-direction: column; gap: calc(var(--pu) * .14);
  max-width: calc(100% - 12px); max-height: calc(100% - 12px); overflow: auto;
  padding: calc(var(--pu) * .16);
  background: #20252b; color: #fff; border: 1px solid #59616b; border-radius: 8px;
  box-shadow: 0 12px 34px rgba(0, 0, 0, .38);
  font: 600 calc(var(--pu) * .25)/1.3 "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system,
        Roboto, "Helvetica Neue", Arial, sans-serif;
  text-align: left;
  -webkit-user-select: none; user-select: none;
}
.cr-pop__grid { display: grid; grid-template-columns: repeat(var(--cols, 5), var(--pu)); gap: calc(var(--pu) * .1); }
.cr-pop__row { display: flex; align-items: center; gap: calc(var(--pu) * .1); }
.cr-pop__row--wrap { flex-wrap: wrap; }
.cr-pop__head { font-size: 1.15em; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cr-pop__detail, .cr-pop__label { color: #aab4c0; font-weight: 500; }
.cr-pop__label { margin-top: calc(var(--pu) * .06); }
.cr-pop__sep { height: 1px; background: #3d454f; margin: calc(var(--pu) * .02) 0; }
.cr-pop__value {
  min-width: calc(var(--pu) * 1.5); text-align: center;
  font-size: calc(var(--pu) * .44); font-weight: 700; font-variant-numeric: tabular-nums;
}
.cr-pop__value small { display: block; font-size: .42em; font-weight: 500; color: #aab4c0; }
.cr-pop__list { display: flex; flex-direction: column; gap: calc(var(--pu) * .08); }

/* Taste eines Auswahlfelds: Zeichen oder kurze Beschriftung. */
.cr-pop .cr-key {
  display: grid; place-items: center;
  min-width: var(--pu); height: calc(var(--pu) * .82); padding: 0 calc(var(--pu) * .22);
  border-radius: 7px; background: #353c44; color: #fff; font-weight: 700; white-space: nowrap;
}
.cr-pop .cr-key--wide { justify-items: start; width: 100%; overflow: hidden; text-overflow: ellipsis; }
.cr-key .cr-action { position: static; width: calc(var(--pu) * .62); height: calc(var(--pu) * .62); }
.cr-key[aria-pressed="true"] { background: #1d9a6c; }
.cr-key[data-warn="true"] { color: #ffd591; }
.cr-pop .cr-key:disabled { opacity: .38; cursor: default; }
@media (hover: hover) {
  .cr-key:not(:disabled):not([aria-pressed="true"]):hover { background: #46505c; }
}

/* --- Video einer Klangtaste ------------------------------------------------------ */
.snd-video {
  position: fixed; left: 0; top: 0; right: 0; bottom: 0; z-index: 75;
  display: grid; place-items: center; pointer-events: none;
}
.snd-video__box {
  width: min(75vw, 1280px, calc(75vh * 16 / 9)); aspect-ratio: 16 / 9;
  background: #000; border-radius: 10px; overflow: hidden; cursor: pointer; pointer-events: auto;
  box-shadow: 0 18px 60px rgba(0, 0, 0, .5);
}
.snd-video[data-mode="full"] { background: #000; pointer-events: auto; }
.snd-video[data-mode="full"] .snd-video__box {
  width: 100%; height: 100%; aspect-ratio: auto; border-radius: 0; box-shadow: none;
}
.snd-video__film { display: block; width: 100%; height: 100%; object-fit: contain; background: #000; }
`;
})(window.BAO = window.BAO || {});
