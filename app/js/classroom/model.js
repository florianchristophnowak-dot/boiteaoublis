/* ==========================================================================
   Datenmodell des Soundboards
   Das Soundboard bringt zwei Dinge mit: Klangtasten („Münzen“) und die
   textfreie Unterrichtsleiste mit Sozialform, Material und Timer. Hier steht,
   was davon gespeichert wird – Voreinstellungen, Prüfung und Reparatur.

     state.classroom   Einstellungen und Kataloge (siehe defaults())
     state.presets     Phasen-Presets: eine Unterrichtsphase auf einen Klick

   Was gerade gilt – gewählte Sozialform, gewähltes Material, laufender
   Timer – steht bewusst NICHT im Bestand, sondern daneben (classroom.js):
   Es ist ein Zustand des Augenblicks und soll weder in der Sicherungsdatei
   landen noch durch „Rückgängig“ zurückspringen.

   Die Klangdateien selbst liegen nicht im Bestand, sondern in der
   Medienablage (media.js). Der Bestand merkt sich nur ihre Kennung.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;
  var timer = BAO.classroomTimer;

  var MAX_BUTTONS = 8;
  var DEFAULT_VISIBLE = 6;
  var MAX_TIMER_PRESETS = 6;
  var MAX_PRESETS = 60;
  var MAX_PRESET_MATERIALS = 12;

  /* Die Bausteine der Unterrichtsleiste, in der Reihenfolge von oben nach unten. */
  var MODULES = [
    { id: 'sounds',     label: 'Klänge',     hint: 'die Münzen der Klangtasten' },
    { id: 'projection', label: 'Projektion', hint: 'Sprachhilfe ein- und ausblenden, blättern, Presets starten' },
    { id: 'phase',      label: 'Sozialform', hint: 'die aktuelle Sozialform oder Methode als Symbol' },
    { id: 'materials',  label: 'Material',   hint: 'was die Lernenden bereitlegen' },
    { id: 'timer',      label: 'Timer',      hint: 'verbleibende Zeit als Kreisfläche, ohne Ziffern' }
  ];

  var VIDEO_MODES = [
    { id: 'large', label: 'groß in der Mitte' },
    { id: 'full',  label: 'bildfüllend' },
    { id: 'burst', label: 'kurz bildfüllend, dann groß' }
  ];

  var DEFAULT_PHASES = [
    ['phase-plenum',       'Plenum',          'plenum'],
    ['phase-individual',   'Einzelarbeit',    'individual'],
    ['phase-partner',      'Partnerarbeit',   'partner'],
    ['phase-group',        'Gruppenarbeit',   'group'],
    ['phase-presentation', 'Präsentation',    'presentation'],
    ['phase-stations',     'Stationenarbeit', 'stations']
  ];

  var DEFAULT_MATERIALS = [
    ['material-binder',     'Hefter',          'binder'],
    ['material-book',       'Buch',            'book'],
    ['material-workbook',   'Arbeitsheft',     'workbook'],
    ['material-sheet',      'Arbeitsblatt',    'worksheet'],
    ['material-pen',        'Stift',           'pen'],
    ['material-tablet',     'Tablet/Computer', 'tablet'],
    ['material-headphones', 'Kopfhörer',       'headphones']
  ];

  function catalog(rows) {
    return rows.map(function (row) { return { id: row[0], name: row[1], icon: row[2], imageId: '' }; });
  }

  function defaultPhases() { return catalog(DEFAULT_PHASES); }
  function defaultMaterials() { return catalog(DEFAULT_MATERIALS); }

  function emptyButton() {
    return { mediaId: '', name: '', kind: '', imageId: '', imageName: '' };
  }

  function defaults() {
    var buttons = [];
    for (var i = 0; i < MAX_BUTTONS; i++) buttons.push(emptyButton());
    return {
      // Welche Bausteine die Leiste auf Projektion und Whiteboard zeigt.
      // Anfangs keiner: Eine bestehende Projektion sieht aus wie bisher.
      show: { sounds: false, projection: false, phase: false, materials: false, timer: false },
      panelY: 0.08,                  // senkrechte Lage der Leiste am rechten Rand (0 … 1)
      phases: defaultPhases(),
      materials: defaultMaterials(),
      timerPresets: [5, 8, 10],      // Minuten für die Schnellwahl
      timerMinutes: 5,               // zuletzt gewählte Dauer
      timerSound: { mediaId: '', name: '' },
      sceneMap: {},                  // gemerkte Zuordnung Szene -> Sozialform
      sounds: {
        volume: 0.75,
        videoMode: 'burst',          // large | full | burst
        burstSeconds: 1.6,
        visible: DEFAULT_VISIBLE,    // so viele Münzen zeigt die Leiste
        buttons: buttons
      }
    };
  }

  function makeItem(data) {
    return Object.assign({ id: util.uid('sym'), name: 'Eigenes Symbol', icon: 'generic', imageId: '' }, data || {});
  }

  /**
   * Ein Phasen-Preset startet alles, was zu einer Unterrichtsphase gehört:
   * die Wortbank, Tafel oder das Whiteboard, dazu Sozialform, Material und
   * Timer. Das Ziel ist freigestellt – ein Preset kann auch nur die Leiste
   * einstellen.
   */
  function makePreset(data) {
    return Object.assign({
      id: util.uid('pre'),
      name: '',
      targetKind: '',           // '' | 'bank' | 'board' | 'whiteboard'
      targetId: '',
      targetTitle: '',          // nur zur Anzeige, falls das Ziel später fehlt
      targetGroup: '',
      level: 2,                 // Unterstützungsstufe, mit der eine Wortbank startet
      phaseId: '',
      materialIds: [],
      timerMinutes: 0,          // 0 = kein Timer
      timerAutostart: false,
      createdAt: util.nowISO(),
      updatedAt: util.nowISO()
    }, data || {});
  }

  function presetLabel(preset) {
    return (preset && (preset.name || preset.targetTitle)) || 'Ohne Namen';
  }

  /* --- Prüfung und Reparatur ------------------------------------------------- */

  function text(value, limit) {
    return typeof value === 'string' ? value.slice(0, limit || 300) : '';
  }

  function boundedNumber(value, fallback, min, max) {
    var number = typeof value === 'number' ? value : parseFloat(value);
    if (!isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
  }

  function boundedInt(value, fallback, min, max) {
    var number = parseInt(value, 10);
    if (!isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
  }

  /**
   * Katalog der Sozialformen oder Materialien. Eine leere Liste bleibt leer –
   * wer alle Symbole entfernt hat, bekommt sie nicht ungefragt zurück. Nur
   * eine fehlende oder beschädigte Liste wird durch die Vorgaben ersetzt.
   */
  function repairCatalog(list, makeDefaults) {
    if (!Array.isArray(list)) return makeDefaults();
    var seen = Object.create(null);
    var result = [];
    list.forEach(function (entry) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
      var id = text(entry.id, 120);
      if (!id || seen[id]) id = util.uid('sym');
      seen[id] = true;
      result.push(Object.assign({}, entry, {
        id: id,
        name: text(entry.name, 120).trim() || 'Eigenes Symbol',
        icon: text(entry.icon, 60) || 'generic',
        imageId: text(entry.imageId, 120)
      }));
    });
    return result;
  }

  function repairTimerPresets(list) {
    var result = [];
    if (Array.isArray(list)) {
      list.forEach(function (value) {
        var minutes = parseInt(value, 10);
        if (isFinite(minutes) && minutes >= timer.MIN_MINUTES && minutes <= timer.MAX_MINUTES
          && result.indexOf(minutes) < 0) result.push(minutes);
      });
    }
    return result.length ? result.slice(0, MAX_TIMER_PRESETS) : [5, 8, 10];
  }

  function repairButtons(list) {
    var result = [];
    for (var i = 0; i < MAX_BUTTONS; i++) {
      var raw = Array.isArray(list) && list[i] && typeof list[i] === 'object' ? list[i] : {};
      var mediaId = text(raw.mediaId, 120);
      result.push({
        mediaId: mediaId,
        name: mediaId ? text(raw.name, 200) : '',
        kind: mediaId ? (raw.kind === 'video' ? 'video' : 'audio') : '',
        imageId: text(raw.imageId, 120),
        imageName: text(raw.imageName, 200)
      });
    }
    return result;
  }

  function repairSceneMap(map) {
    var result = {};
    if (map && typeof map === 'object' && !Array.isArray(map)) {
      Object.keys(map).forEach(function (scene) {
        var key = normalizeScene(scene);
        var value = text(map[scene], 120);
        if (key && value) result[key] = value;
      });
    }
    return result;
  }

  function repairClassroom(input) {
    var base = defaults();
    var raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    var show = raw.show && typeof raw.show === 'object' ? raw.show : {};
    var sounds = raw.sounds && typeof raw.sounds === 'object' ? raw.sounds : {};
    var timerSound = raw.timerSound && typeof raw.timerSound === 'object' ? raw.timerSound : {};
    var soundId = text(timerSound.mediaId, 120);

    // Unbekannte Felder bleiben erhalten (vorwärtskompatibel).
    var result = Object.assign({}, raw);
    result.show = {};
    MODULES.forEach(function (module) {
      result.show[module.id] = typeof show[module.id] === 'boolean' ? show[module.id] : base.show[module.id];
    });
    result.panelY = boundedNumber(raw.panelY, base.panelY, 0, 1);
    result.phases = repairCatalog(raw.phases, defaultPhases);
    result.materials = repairCatalog(raw.materials, defaultMaterials);
    result.timerPresets = repairTimerPresets(raw.timerPresets);
    result.timerMinutes = boundedInt(raw.timerMinutes, base.timerMinutes, timer.MIN_MINUTES, timer.MAX_MINUTES);
    result.timerSound = { mediaId: soundId, name: soundId ? text(timerSound.name, 200) : '' };
    result.sceneMap = repairSceneMap(raw.sceneMap);
    result.sounds = Object.assign({}, sounds, {
      volume: boundedNumber(sounds.volume, base.sounds.volume, 0, 1),
      videoMode: VIDEO_MODES.some(function (mode) { return mode.id === sounds.videoMode; })
        ? sounds.videoMode : base.sounds.videoMode,
      burstSeconds: boundedNumber(sounds.burstSeconds, base.sounds.burstSeconds, 0.2, 10),
      visible: boundedInt(sounds.visible, base.sounds.visible, 1, MAX_BUTTONS),
      buttons: repairButtons(sounds.buttons)
    });
    return result;
  }

  function repairPreset(preset) {
    var kind = ['bank', 'board', 'whiteboard'].indexOf(preset.targetKind) >= 0 ? preset.targetKind : '';
    var targetId = kind ? text(preset.targetId, 120) : '';
    if (!targetId) kind = '';
    var materialIds = [];
    (Array.isArray(preset.materialIds) ? preset.materialIds : []).forEach(function (id) {
      id = text(id, 120);
      if (id && materialIds.indexOf(id) < 0) materialIds.push(id);
    });
    preset.name = text(preset.name, 120);
    preset.targetKind = kind;
    preset.targetId = targetId;
    preset.targetTitle = text(preset.targetTitle, 160);
    preset.targetGroup = text(preset.targetGroup, 120);
    preset.level = boundedInt(preset.level, 2, 1, 3);
    preset.phaseId = text(preset.phaseId, 120);
    preset.materialIds = materialIds.slice(0, MAX_PRESET_MATERIALS);
    preset.timerMinutes = boundedInt(preset.timerMinutes, 0, 0, timer.MAX_MINUTES);
    preset.timerAutostart = !!preset.timerAutostart;
    return preset;
  }

  /**
   * Bringt state.classroom und state.presets in einen gültigen Zustand.
   * Wird von schema.validateState aufgerufen; state.presets ist dort bereits
   * eine Liste von Objekten mit eindeutigen Kennungen.
   */
  function repair(state, warnings) {
    if (state.classroom !== undefined && (!state.classroom || typeof state.classroom !== 'object' || Array.isArray(state.classroom))) {
      warnings.push('Die Einstellungen des Soundboards waren beschädigt und wurden zurückgesetzt.');
    }
    state.classroom = repairClassroom(state.classroom);
    state.presets = (state.presets || []).map(repairPreset);
    if (state.presets.length > MAX_PRESETS) {
      warnings.push((state.presets.length - MAX_PRESETS) + ' Phasen-Presets über der Höchstzahl von '
        + MAX_PRESETS + ' wurden entfernt.');
      state.presets = state.presets.slice(0, MAX_PRESETS);
    }
    return state;
  }

  /* --- Szene -> Sozialform ------------------------------------------------------
     Wer ein Preset für eine Wortbank anlegt, bekommt zur Szene der Wortbank
     eine Sozialform vorgeschlagen. Reihenfolge: eigene Zuordnung, mitgelieferte
     Zuordnung, Ähnlichkeit der Namen. Findet sich nichts, bleibt die Auswahl
     leer – geraten wird nicht. */

  /** Kleinschreibung ohne Akzente und Sonderzeichen. */
  function normalizeScene(value) {
    var folded = String(value || '');
    if (folded.normalize) folded = folded.normalize('NFKD').replace(/[̀-ͯ]/g, '');
    return folded.replace(/ß/g, 'ss').toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  var DEFAULT_SCENE_PHASES = {
    partnergesprach: 'phase-partner',
    diskussion: 'phase-plenum',
    rollenspiel: 'phase-partner',
    prasentation: 'phase-presentation',
    schreibphase: 'phase-individual',
    textanalyse: 'phase-individual',
    sprachmittlung: 'phase-partner',
    reflexion: 'phase-plenum',
    wortschatzarbeit: 'phase-individual'
  };

  function commonPrefix(left, right) {
    var length = 0;
    while (length < left.length && length < right.length && left.charAt(length) === right.charAt(length)) length += 1;
    return length;
  }

  function suggestPhase(scene, phases, sceneMap) {
    var key = normalizeScene(scene);
    if (!key || !phases || !phases.length) return '';
    var available = Object.create(null);
    phases.forEach(function (item) { available[item.id] = item; });

    var own = (sceneMap || {})[key];
    if (own && available[own]) return own;

    var fallback = DEFAULT_SCENE_PHASES[key];
    if (fallback && available[fallback]) return fallback;

    var bestId = '';
    var bestScore = 0;
    phases.forEach(function (item) {
      var candidates = [normalizeScene(item.name)].concat(
        String(item.name || '').split(/[\s\/,-]+/).filter(Boolean).map(normalizeScene));
      candidates.forEach(function (candidate) {
        if (!candidate) return;
        var score = commonPrefix(key, candidate);
        var shortest = Math.min(key.length, candidate.length);
        if (score < 5 || !shortest || score / shortest < 0.4) return;
        if (score > bestScore) { bestScore = score; bestId = item.id; }
      });
    });
    return bestId;
  }

  /* --- Verweise auf die Medienablage ------------------------------------------- */

  /** Alle Kennungen von Dateien, die dieser Bestand braucht. */
  function mediaIds(state) {
    var ids = [];
    var classroom = state && state.classroom;
    if (!classroom) return ids;
    function add(id) { if (id && ids.indexOf(id) < 0) ids.push(id); }
    ((classroom.sounds && classroom.sounds.buttons) || []).forEach(function (button) {
      add(button.mediaId);
      add(button.imageId);
    });
    add(classroom.timerSound && classroom.timerSound.mediaId);
    (classroom.phases || []).concat(classroom.materials || []).forEach(function (item) { add(item.imageId); });
    return ids;
  }

  BAO.classroomModel = {
    MAX_BUTTONS: MAX_BUTTONS,
    DEFAULT_VISIBLE: DEFAULT_VISIBLE,
    MAX_TIMER_PRESETS: MAX_TIMER_PRESETS,
    MAX_PRESETS: MAX_PRESETS,
    MAX_PRESET_MATERIALS: MAX_PRESET_MATERIALS,
    MODULES: MODULES,
    VIDEO_MODES: VIDEO_MODES,
    DEFAULT_SCENE_PHASES: DEFAULT_SCENE_PHASES,
    defaults: defaults,
    defaultPhases: defaultPhases,
    defaultMaterials: defaultMaterials,
    emptyButton: emptyButton,
    makeItem: makeItem,
    makePreset: makePreset,
    presetLabel: presetLabel,
    repair: repair,
    repairClassroom: repairClassroom,
    repairPreset: repairPreset,
    repairTimerPresets: repairTimerPresets,
    normalizeScene: normalizeScene,
    suggestPhase: suggestPhase,
    mediaIds: mediaIds
  };
})(window.BAO = window.BAO || {});
