/* ==========================================================================
   Datenmodell
   Ebenen:  Fach -> Lerngruppe -> Unterrichtsreihe -> Wortbank (Szene)
   Bestände: Wortschatzeinträge und Satzanfänge gehören der Lerngruppe bzw.
             dem Fach – Wortbanken verweisen nur darauf. Dadurch wächst ein
             Bestand über Schuljahre hinweg, ohne dass Einträge dupliziert
             werden.

   Daneben steht die Tafel: die einfache Grundform. Sie kennt nur „Elemente“
   an frei gewählten Stellen der Fläche und unterscheidet nicht zwischen Wort
   und Satz. Ein dort angelegtes Element ist ein gewöhnlicher Eintrag des
   Bestands und lässt sich jederzeit um Artikel, Übersetzung, Beispiel und
   alles Weitere ergänzen.

   Das Whiteboard schließlich ist eine unbegrenzte Fläche für Handschrift:
   Striche, Unterstreichungen und Korrekturzeichen werden als Vektoren in
   Weltkoordinaten gespeichert und bleiben in jeder Vergrößerung scharf.

   Quer dazu liegt das Soundboard: Klangtasten und die Unterrichtsleiste mit
   Sozialform, Material und Timer (state.classroom) sowie die Phasen-Presets
   (state.presets). Ihr Datenmodell steht in classroom/model.js.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;

  var APP_VERSION = '1.3.0';
  var SCHEMA_VERSION = 4;
  var EXPORT_KIND = 'boite-a-oublis.backup';

  /* --- Status eines Wortschatzeintrags ------------------------------------ */
  var STATUS = [
    { id: 'new',      label: 'neu eingeführt',   short: 'neu',        hint: 'Wird gerade zum ersten Mal eingeführt.' },
    { id: 'active',   label: 'aktuell im Einsatz', short: 'aktiv',    hint: 'Gehört zur laufenden Unterrichtsreihe.' },
    { id: 'revisit',  label: 'wieder aufgreifen', short: 'auffrischen', hint: 'Aus einer früheren Reihe, soll reaktiviert werden.' },
    { id: 'core',     label: 'Grundbestand',     short: 'gesichert',  hint: 'Gesicherter Wortschatz der Lerngruppe.' },
    { id: 'archived', label: 'archiviert',       short: 'archiviert', hint: 'Vorläufig aus dem aktiven Bestand genommen.' }
  ];
  var STATUS_ORDER = ['new', 'active', 'revisit', 'core', 'archived'];

  function statusInfo(id) {
    for (var i = 0; i < STATUS.length; i++) if (STATUS[i].id === id) return STATUS[i];
    return STATUS[1];
  }

  /* --- Unterstützungsstufen ----------------------------------------------- */
  var LEVELS = [
    { id: 1, name: 'Impuls',      hint: 'Nur Schlüsselwörter' },
    { id: 2, name: 'Chunks',      hint: 'Wortverbindungen und Satzanfänge' },
    { id: 3, name: 'Vollbild',    hint: 'Erklärung, Beispiel, Übersetzung' }
  ];

  /* --- Projizierbare Felder eines Eintrags --------------------------------
     "level" = ab welcher Unterstützungsstufe das Feld standardmäßig
     eingeblendet wird. Die Lehrkraft kann jedes Feld einzeln übersteuern. */
  var FIELDS = [
    { key: 'article',       label: 'Artikel',          level: 1, kind: 'lex' },
    { key: 'gram',          label: 'Formhinweis',      level: 3, kind: 'lex' },
    { key: 'collocation',   label: 'Wortverbindung',   level: 2, kind: 'lex' },
    { key: 'chunk',         label: 'Chunk',            level: 2, kind: 'lex' },
    { key: 'explanation',   label: 'Erklärung (Zielsprache)', level: 3, kind: 'lex' },
    { key: 'translation',   label: 'Deutsch',          level: 3, kind: 'lex' },
    { key: 'example',       label: 'Beispielsatz',     level: 3, kind: 'lex' },
    { key: 'pronunciation', label: 'Aussprache',       level: 3, kind: 'lex' },
    { key: 'starterTranslation', label: 'Satzanfang: Deutsch', level: 3, kind: 'starter' }
  ];

  function fieldInfo(key) {
    for (var i = 0; i < FIELDS.length; i++) if (FIELDS[i].key === key) return FIELDS[i];
    return null;
  }

  /* --- Kommunikative Funktionen (Datensatz, daher erweiterbar) ------------- */
  function defaultFunctions() {
    var list = [
      ['opinion',   'eine Meinung äußern'],
      ['reason',    'begründen'],
      ['agree',     'zustimmen'],
      ['disagree',  'widersprechen'],
      ['ask',       'nachfragen'],
      ['clarify',   'präzisieren'],
      ['compare',   'vergleichen'],
      ['example',   'ein Beispiel geben'],
      ['continue',  'ein Gespräch weiterführen'],
      ['summarize', 'Ergebnisse zusammenfassen'],
      ['analyse',   'einen Text analysieren'],
      ['mediate',   'sprachmitteln']
    ];
    return list.map(function (pair, index) {
      return { id: 'fn_' + pair[0], label: pair[1], order: index };
    });
  }

  /* --- Unterrichtsszenen --------------------------------------------------- */
  var SCENES = [
    'Partnergespräch', 'Diskussion', 'Rollenspiel', 'Präsentation',
    'Schreibphase', 'Textanalyse', 'Sprachmittlung', 'Reflexion', 'Wortschatzarbeit'
  ];

  var STARTER_VARIANTS = [
    { id: 'einfach',       label: 'einfach',       hint: 'kurze, stark stützende Formulierung' },
    { id: 'standard',      label: 'Standard',      hint: 'Regelvariante für die Lerngruppe' },
    { id: 'anspruchsvoll', label: 'anspruchsvoll', hint: 'für weiter fortgeschrittene Lernende' }
  ];

  /* --- Fabriken ------------------------------------------------------------ */

  function makeSubject(data) {
    return Object.assign({
      id: util.uid('sub'),
      name: 'Neues Fach',
      short: 'NEU',
      color: '#1f4f6b',
      colorSoft: '#e3edf3',
      order: 0,
      createdAt: util.nowISO()
    }, data || {});
  }

  function makeGroup(data) {
    return Object.assign({
      id: util.uid('grp'),
      subjectId: '',
      name: 'Neue Lerngruppe',
      grade: 7,
      schoolYear: util.currentSchoolYear(),
      note: '',
      favorite: false,
      archived: false,
      history: [],
      createdAt: util.nowISO(),
      updatedAt: util.nowISO()
    }, data || {});
  }

  function makeUnit(data) {
    return Object.assign({
      id: util.uid('unt'),
      groupId: '',
      title: 'Neue Unterrichtsreihe',
      description: '',
      schoolYear: util.currentSchoolYear(),
      status: 'current',
      order: 0,
      createdAt: util.nowISO()
    }, data || {});
  }

  function makeLexeme(data) {
    return Object.assign({
      id: util.uid('lex'),
      subjectId: '',
      groupId: '',
      term: '',
      article: '',
      gram: '',
      collocation: '',
      chunk: '',
      explanation: '',
      translation: '',
      example: '',
      pronunciation: '',
      functionId: '',
      topics: [],
      tags: [],
      cefr: '',
      status: 'new',
      introducedUnitId: '',
      introducedSchoolYear: '',
      favorite: false,
      createdAt: util.nowISO(),
      updatedAt: util.nowISO()
    }, data || {});
  }

  function makeStarter(data) {
    return Object.assign({
      id: util.uid('sta'),
      subjectId: '',
      groupId: '',            // leer = im ganzen Fach verfügbar
      text: '',
      translation: '',
      functionId: '',
      variant: 'standard',
      tags: [],
      status: 'active',
      note: '',
      createdAt: util.nowISO(),
      updatedAt: util.nowISO()
    }, data || {});
  }

  function makeBankItem(data) {
    return Object.assign({
      id: util.uid('itm'),
      kind: 'lex',            // 'lex' | 'starter'
      refId: ''
    }, data || {});
  }

  function makeSection(data) {
    return Object.assign({
      id: util.uid('sec'),
      title: 'Neuer Abschnitt',
      layout: 'auto',         // 'auto' | 'cards' | 'impulse' | 'starters'
      items: []
    }, data || {});
  }

  function makeBank(data) {
    return Object.assign({
      id: util.uid('bnk'),
      subjectId: '',
      groupId: '',
      unitId: '',
      title: 'Neue Wortbank',
      scene: 'Partnergespräch',
      note: '',
      favorite: false,
      defaultLevel: 2,
      sections: [],
      createdAt: util.nowISO(),
      updatedAt: util.nowISO(),
      lastUsedAt: ''
    }, data || {});
  }

  /* --- Tafel: die einfache Grundform ---------------------------------------
     Eine Tafel ist eine Fläche mit frei platzierten Elementen. Ein Element ist
     ein Verweis auf einen Eintrag des Bestands – ob dieser aus einem Wort oder
     aus einem ganzen Satz besteht, spielt hier bewusst keine Rolle.
     x und y sind Anteile der Fläche (0…1) und bezeichnen die Mitte des
     Elements. Dadurch sitzt es auf jeder Auflösung an derselben Stelle. */

  function makeBoardItem(data) {
    return Object.assign({
      id: util.uid('bit'),
      kind: 'lex',            // 'lex' | 'starter' – für die Bedienung ohne Bedeutung
      refId: '',
      x: 0.5,
      y: 0.5,
      scale: 1                // 0,5 … 2 – einzelne Elemente hervorheben
    }, data || {});
  }

  function makeBoard(data) {
    return Object.assign({
      id: util.uid('brd'),
      subjectId: '',
      groupId: '',
      unitId: '',
      title: 'Neue Tafel',
      note: '',
      favorite: false,
      showArticle: true,      // vorhandene Artikel farbig mitzeigen
      showTranslation: false, // deutsche Entsprechung einblenden
      items: [],
      createdAt: util.nowISO(),
      updatedAt: util.nowISO(),
      lastUsedAt: ''
    }, data || {});
  }

  /* --- Whiteboard: unbegrenzte Fläche für Handschrift ----------------------
     Ein Whiteboard gehört wie eine Tafel einer Lerngruppe. Es enthält eine
     geordnete Liste von Strichen in Weltkoordinaten (Pixel bei Zoomstufe 1);
     die Fläche selbst hat keinen Rand. Ein Strich ist je nach Werkzeug:

       pen | marker | highlighter
         { id, tool, color, width, points: [x, y, p, x, y, p, …] }
         p = Druck 0…1 (Stift) – bestimmt die Breite entlang des Strichs
       underline   (Unterstreichung wie in Capy-note: waagerecht, mit Stil)
         { id, tool, color, width, x, y, w, style, double, hook }
         style = solid | dashed | dotted | wavy; hook = Häkchen am rechten Ende
       stamp       (Korrekturzeichen: handschriftliches Häkchen u. a.)
         { id, tool, color, variant, text, x, y, size }
         variant = check | check_crossed | omission | text

     Farben sind Schlüssel einer festen Palette (ink, blue, red, …), damit
     dieselbe Tinte auf hellem und dunklem Grund lesbar bleibt. */

  var WHITEBOARD_BACKGROUNDS = [
    { id: 'plain', label: 'Blanko' },
    { id: 'lines', label: 'Linien' },
    { id: 'grid',  label: 'Kästchen' },
    { id: 'dots',  label: 'Punkte' }
  ];
  var STROKE_TOOLS = ['pen', 'marker', 'highlighter', 'underline', 'stamp'];
  var UNDERLINE_STYLES = ['solid', 'dashed', 'dotted', 'wavy'];
  var STAMP_VARIANTS = ['check', 'check_crossed', 'omission', 'text'];

  function makeWhiteboard(data) {
    return Object.assign({
      id: util.uid('wbd'),
      subjectId: '',
      groupId: '',
      unitId: '',
      title: 'Neues Whiteboard',
      note: '',
      favorite: false,
      background: 'plain',    // plain | lines | grid | dots
      strokes: [],
      view: { cx: 0, cy: 0, zoom: 1 },   // zuletzt sichtbare Mitte und Zoomstufe
      createdAt: util.nowISO(),
      updatedAt: util.nowISO(),
      lastUsedAt: ''
    }, data || {});
  }

  function makeStroke(data) {
    var tool = data && STROKE_TOOLS.indexOf(data.tool) >= 0 ? data.tool : 'pen';
    var base = { id: util.uid('stk'), tool: tool, color: 'ink', width: 2.4 };
    if (tool === 'underline') {
      Object.assign(base, { x: 0, y: 0, w: 0, style: 'solid', double: false, hook: false });
    } else if (tool === 'stamp') {
      Object.assign(base, { variant: 'check', text: '', x: 0, y: 0, size: 30, color: 'red' });
    } else {
      base.points = [];
    }
    return Object.assign(base, data || {});
  }

  /* --- Voreinstellungen ---------------------------------------------------- */
  function defaultSettings() {
    return {
      theme: 'auto',
      // Einfacher Modus: Die Oberfläche zeigt nur Tafeln, Elemente,
      // Lerngruppen und Daten. Alles Weitere bleibt vorhanden und ist über
      // die vollständige Ansicht wieder erreichbar.
      simpleMode: false,
      stageTheme: 'light',
      stageScale: 1,
      autoAdvanceSeconds: 45,
      autoAdvanceLoop: false,
      maxItemsPerSlide: 12,
      showProgressOnStage: true,
      railCollapsed: false,
      // Zuletzt gewählte Werkzeuge des Whiteboards (siehe whiteboard/canvas.js)
      whiteboard: {},
      scenes: SCENES.slice(),
      fieldLevels: FIELDS.reduce(function (acc, f) { acc[f.key] = f.level; return acc; }, {})
    };
  }

  function emptyState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      meta: {
        appVersion: APP_VERSION,
        createdAt: util.nowISO(),
        updatedAt: util.nowISO()
      },
      settings: defaultSettings(),
      ui: { subjectId: '', groupId: '', recentBanks: [], recentGroups: [] },
      functions: defaultFunctions(),
      subjects: [],
      groups: [],
      units: [],
      lexemes: [],
      starters: [],
      banks: [],
      boards: [],
      whiteboards: [],
      presets: [],
      classroom: BAO.classroomModel.defaults()
    };
  }

  var COLLECTIONS = ['subjects', 'groups', 'units', 'lexemes', 'starters', 'banks', 'boards', 'whiteboards', 'presets', 'functions'];

  /* --- Prüfung und Reparatur ----------------------------------------------- */

  /**
   * Prüft eine geladene oder importierte Struktur.
   * Gibt { ok, errors[], warnings[], state } zurück. Fehlende Felder werden
   * ergänzt, unbekannte Felder bleiben erhalten (vorwärtskompatibel).
   */
  function validateState(input) {
    var errors = [];
    var warnings = [];

    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return { ok: false, errors: ['Die Datei enthält kein gültiges Datenobjekt.'], warnings: warnings, state: null };
    }

    var state = Object.assign(emptyState(), util.clone(input));
    state.settings = Object.assign(defaultSettings(), input.settings || {});
    state.settings.fieldLevels = Object.assign(defaultSettings().fieldLevels, (input.settings && input.settings.fieldLevels) || {});
    state.meta = Object.assign(emptyState().meta, input.meta || {});
    state.ui = Object.assign({ subjectId: '', groupId: '', recentBanks: [], recentGroups: [] }, input.ui || {});

    COLLECTIONS.forEach(function (name) {
      if (!Array.isArray(state[name])) {
        if (input[name] !== undefined) warnings.push('Die Liste „' + name + '“ war beschädigt und wurde geleert.');
        state[name] = [];
      }
    });

    if (!state.functions.length) state.functions = defaultFunctions();

    // Einträge ohne ID sind nicht referenzierbar -> reparieren statt verwerfen.
    COLLECTIONS.forEach(function (name) {
      var seen = Object.create(null);
      state[name] = state[name].filter(function (item) {
        return item && typeof item === 'object' && !Array.isArray(item);
      }).map(function (item) {
        if (!item.id || seen[item.id]) {
          item.id = util.uid(name.slice(0, 3));
          warnings.push('Ein Eintrag in „' + name + '“ hatte keine eindeutige Kennung und bekam eine neue.');
        }
        seen[item.id] = true;
        return item;
      });
    });

    // Verweise prüfen: Wortbank-Positionen ohne Ziel entfernen.
    var lexIds = new Set(state.lexemes.map(function (l) { return l.id; }));
    var staIds = new Set(state.starters.map(function (s) { return s.id; }));
    var removed = 0;
    state.banks.forEach(function (bank) {
      if (!Array.isArray(bank.sections)) bank.sections = [];
      bank.sections.forEach(function (section) {
        if (!Array.isArray(section.items)) section.items = [];
        section.items = section.items.filter(function (item) {
          if (!item || (item.kind !== 'lex' && item.kind !== 'starter')) return false;
          var exists = item.kind === 'lex' ? lexIds.has(item.refId) : staIds.has(item.refId);
          if (!exists) removed += 1;
          return exists;
        });
      });
    });
    if (removed) warnings.push(removed + ' Wortbank-Einträge verwiesen ins Leere und wurden entfernt.');

    // Dasselbe für die Tafeln, zusätzlich werden Positionen auf die Fläche
    // zurückgeholt: Ein Element außerhalb von 0…1 wäre nicht mehr sichtbar.
    var lostOnBoards = 0;
    state.boards.forEach(function (board) {
      if (!Array.isArray(board.items)) board.items = [];
      board.items = board.items.filter(function (item) {
        if (!item || (item.kind !== 'lex' && item.kind !== 'starter')) return false;
        var exists = item.kind === 'lex' ? lexIds.has(item.refId) : staIds.has(item.refId);
        if (!exists) lostOnBoards += 1;
        return exists;
      }).map(function (item) {
        item.x = util.clamp(typeof item.x === 'number' ? item.x : 0.5, 0, 1);
        item.y = util.clamp(typeof item.y === 'number' ? item.y : 0.5, 0, 1);
        item.scale = util.clamp(typeof item.scale === 'number' ? item.scale : 1, 0.5, 2);
        return item;
      });
    });
    if (lostOnBoards) warnings.push(lostOnBoards + ' Tafel-Elemente verwiesen ins Leere und wurden entfernt.');

    // Whiteboards: Striche ohne brauchbare Geometrie fallen weg, Zahlen werden
    // auf endliche Werte zurückgeholt – ein einziger NaN ließe sonst die ganze
    // Fläche leer erscheinen.
    var brokenStrokes = 0;
    state.whiteboards.forEach(function (wb) {
      if (!Array.isArray(wb.strokes)) wb.strokes = [];
      if (WHITEBOARD_BACKGROUNDS.map(function (b) { return b.id; }).indexOf(wb.background) < 0) wb.background = 'plain';
      var view = wb.view && typeof wb.view === 'object' ? wb.view : {};
      wb.view = {
        cx: isFinite(view.cx) ? Number(view.cx) : 0,
        cy: isFinite(view.cy) ? Number(view.cy) : 0,
        zoom: isFinite(view.zoom) ? util.clamp(Number(view.zoom), 0.1, 8) : 1
      };
      var seenStrokes = Object.create(null);
      wb.strokes = wb.strokes.filter(function (stroke) {
        if (!stroke || typeof stroke !== 'object' || STROKE_TOOLS.indexOf(stroke.tool) < 0) { brokenStrokes += 1; return false; }
        if (!stroke.id || seenStrokes[stroke.id]) stroke.id = util.uid('stk');
        seenStrokes[stroke.id] = true;
        if (typeof stroke.color !== 'string' || !stroke.color) stroke.color = stroke.tool === 'stamp' ? 'red' : 'ink';
        stroke.width = isFinite(stroke.width) && stroke.width > 0 ? Number(stroke.width) : 2.4;
        if (stroke.tool === 'underline') {
          if (!isFinite(stroke.x) || !isFinite(stroke.y) || !isFinite(stroke.w) || stroke.w <= 0) { brokenStrokes += 1; return false; }
          if (UNDERLINE_STYLES.indexOf(stroke.style) < 0) stroke.style = 'solid';
          stroke.double = !!stroke.double;
          stroke.hook = !!stroke.hook;
          return true;
        }
        if (stroke.tool === 'stamp') {
          if (!isFinite(stroke.x) || !isFinite(stroke.y)) { brokenStrokes += 1; return false; }
          if (STAMP_VARIANTS.indexOf(stroke.variant) < 0) stroke.variant = 'check';
          stroke.text = typeof stroke.text === 'string' ? stroke.text.slice(0, 12) : '';
          stroke.size = isFinite(stroke.size) && stroke.size > 0 ? Number(stroke.size) : 30;
          return true;
        }
        if (!Array.isArray(stroke.points) || stroke.points.length < 3
          || !stroke.points.every(function (n) { return typeof n === 'number' && isFinite(n); })) {
          brokenStrokes += 1;
          return false;
        }
        if (stroke.points.length % 3) stroke.points = stroke.points.slice(0, stroke.points.length - stroke.points.length % 3);
        return true;
      });
    });
    if (brokenStrokes) warnings.push(brokenStrokes + ' Striche auf Whiteboards waren beschädigt und wurden entfernt.');

    // Soundboard: Einstellungen, Kataloge und Phasen-Presets (classroom/model.js).
    BAO.classroomModel.repair(state, warnings);

    if (typeof state.schemaVersion !== 'number') {
      state.schemaVersion = SCHEMA_VERSION;
      warnings.push('Die Versionsangabe fehlte und wurde ergänzt.');
    }
    if (state.schemaVersion > SCHEMA_VERSION) {
      errors.push('Die Sicherung stammt aus einer neueren Programmversion (Datenversion '
        + state.schemaVersion + '). Bitte zuerst die App aktualisieren.');
    }

    return { ok: errors.length === 0, errors: errors, warnings: warnings, state: state };
  }

  BAO.schema = {
    APP_VERSION: APP_VERSION,
    SCHEMA_VERSION: SCHEMA_VERSION,
    EXPORT_KIND: EXPORT_KIND,
    STATUS: STATUS,
    STATUS_ORDER: STATUS_ORDER,
    statusInfo: statusInfo,
    LEVELS: LEVELS,
    FIELDS: FIELDS,
    fieldInfo: fieldInfo,
    SCENES: SCENES,
    STARTER_VARIANTS: STARTER_VARIANTS,
    COLLECTIONS: COLLECTIONS,
    defaultFunctions: defaultFunctions,
    defaultSettings: defaultSettings,
    emptyState: emptyState,
    validateState: validateState,
    makeSubject: makeSubject,
    makeGroup: makeGroup,
    makeUnit: makeUnit,
    makeLexeme: makeLexeme,
    makeStarter: makeStarter,
    makeBank: makeBank,
    makeSection: makeSection,
    makeBankItem: makeBankItem,
    makeBoard: makeBoard,
    makeBoardItem: makeBoardItem,
    WHITEBOARD_BACKGROUNDS: WHITEBOARD_BACKGROUNDS,
    STROKE_TOOLS: STROKE_TOOLS,
    UNDERLINE_STYLES: UNDERLINE_STYLES,
    STAMP_VARIANTS: STAMP_VARIANTS,
    makeWhiteboard: makeWhiteboard,
    makeStroke: makeStroke
  };
})(window.BAO = window.BAO || {});
