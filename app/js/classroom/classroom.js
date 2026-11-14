/* ==========================================================================
   Soundboard – Steuerung
   Alles, was Münzen und Unterrichtsleiste tun, läuft durch dieses Modul:
   Sozialform und Material wählen, den Timer führen, Symbole und Klänge
   verwalten, Phasen-Presets starten. Die Leiste auf der Leinwand (panel.js)
   und die Ansicht „Soundboard“ sind nur zwei Bedienoberflächen dafür.

   Zwei Arten von Zustand:

     Bestand (store)        Einstellungen, Kataloge, Zuweisungen, Presets –
                            gesichert, exportiert, teils rückgängig zu machen.
     Augenblick (live)      gewählte Sozialform, gewähltes Material, Timer –
                            eigene kleine Ablage, übersteht ein Neuladen, steht
                            aber weder in der Sicherungsdatei noch im Verlauf.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;
  var model = BAO.classroomModel;
  var T = BAO.classroomTimer;
  var select = BAO.select;

  var LIVE_KEY = 'bao.classroom.live.v1';
  // Einstellungen, die die Leiste selbst ändert (Lage, zuletzt gewählte
  // Dauer, sichtbare Bausteine). Die Lehreransicht wird dafür nicht neu
  // aufgebaut – siehe QUIET_LABELS in app.js.
  var QUIET_LABEL = 'Unterrichtsleiste';
  var TICK_MS = 200;

  var live = { phaseId: '', materialIds: [], timer: T.empty() };
  var soundFired = false;
  var ticker = null;
  var listeners = [];
  var signature = '';
  var clock = function () { return Date.now(); };

  /* --- Beobachter -------------------------------------------------------------
     Gründe: 'live' (Sozialform, Material, Timer gesetzt oder beendet),
             'tick' (die Uhr läuft), 'settings' (Bestand geändert),
             'media' (Dateien geladen, hinzugefügt, entfernt). */

  function subscribe(fn) {
    listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  function emit(reason) {
    listeners.slice().forEach(function (fn) {
      try { fn(reason); } catch (err) { console.error('Fehler im Beobachter der Unterrichtsleiste:', err); }
    });
  }

  /* --- Zugriff ---------------------------------------------------------------- */

  var fallback = null;

  function settings() {
    var state = BAO.store.getState();
    if (state && state.classroom) return state.classroom;
    if (!fallback) fallback = model.defaults();
    return fallback;
  }

  function presets() {
    var state = BAO.store.getState();
    return (state && state.presets) || [];
  }

  function catalog(kind) { return settings()[kind === 'materials' ? 'materials' : 'phases'] || []; }

  function findItem(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function phaseItem() { return live.phaseId ? findItem(catalog('phases'), live.phaseId) : null; }

  function materialItems() {
    var list = catalog('materials');
    return live.materialIds.map(function (id) { return findItem(list, id); }).filter(Boolean);
  }

  /** Verändert Einstellungen, ohne einen Rückgängig-Schritt anzulegen. */
  function tune(mutator) {
    return BAO.store.commit(QUIET_LABEL, function (draft) { return mutator(draft.classroom, draft); }, { undoable: false });
  }

  /** Inhaltliche Änderung – lässt sich rückgängig machen. */
  function change(label, mutator) {
    return BAO.store.commit(label, function (draft) { return mutator(draft.classroom, draft); });
  }

  /* --- Augenblickszustand -------------------------------------------------------- */

  function saveLive() {
    BAO.storage.writeJSON(LIVE_KEY, { phaseId: live.phaseId, materialIds: live.materialIds, timer: live.timer });
  }

  /** Entfernt Verweise auf Symbole, die es nicht mehr gibt. true = etwas geändert. */
  function sanitizeLive() {
    var changed = false;
    if (live.phaseId && !findItem(catalog('phases'), live.phaseId)) { live.phaseId = ''; changed = true; }
    var materials = catalog('materials');
    var kept = [];
    live.materialIds.forEach(function (id) {
      if (findItem(materials, id) && kept.indexOf(id) < 0) kept.push(id);
    });
    if (kept.length !== live.materialIds.length) { live.materialIds = kept; changed = true; }
    return changed;
  }

  function loadLive() {
    var raw = BAO.storage.readJSON(LIVE_KEY) || {};
    live = {
      phaseId: typeof raw.phaseId === 'string' ? raw.phaseId : '',
      materialIds: Array.isArray(raw.materialIds)
        ? raw.materialIds.filter(function (id) { return typeof id === 'string'; }) : [],
      timer: T.normalize(raw.timer, clock())
    };
    sanitizeLive();
    soundFired = false;
    saveLive();
    if (live.timer.running) ensureTicker();
  }

  function liveChanged() {
    saveLive();
    emit('live');
  }

  /* --- Sozialform und Material ------------------------------------------------------ */

  function setPhase(id) {
    var next = id && findItem(catalog('phases'), id) ? id : '';
    if (next === live.phaseId) return;
    live.phaseId = next;
    liveChanged();
  }

  /** Wie in der Leiste: Ein Klick auf die gewählte Sozialform nimmt sie zurück. */
  function togglePhase(id) { setPhase(live.phaseId === id ? '' : id); }

  function toggleMaterial(id) {
    if (!findItem(catalog('materials'), id)) return;
    var index = live.materialIds.indexOf(id);
    if (index >= 0) live.materialIds.splice(index, 1); else live.materialIds.push(id);
    liveChanged();
  }

  function setMaterials(ids) {
    var materials = catalog('materials');
    var next = [];
    (ids || []).forEach(function (id) {
      if (findItem(materials, id) && next.indexOf(id) < 0) next.push(id);
    });
    live.materialIds = next;
    liveChanged();
  }

  function clearMaterials() {
    if (!live.materialIds.length) return;
    live.materialIds = [];
    liveChanged();
  }

  /* --- Timer -------------------------------------------------------------------------
     Der Timer rechnet mit dem Zeitpunkt seines Endes, nicht mit gezählten
     Takten. Ein Browser, der ein verdecktes Fenster ausbremst, verfälscht
     ihn deshalb nicht – tick() darf beliebig oft und von überall gerufen
     werden (auch aus dem Beamerfenster, siehe panel.js). */

  function rememberMinutes(minutes) {
    minutes = T.clampMinutes(minutes, settings().timerMinutes);
    if (minutes !== settings().timerMinutes) tune(function (c) { c.timerMinutes = minutes; });
    return minutes;
  }

  function ensureTicker() {
    if (ticker) return;
    ticker = window.setInterval(tick, TICK_MS);
  }

  function stopTicker() {
    if (!ticker) return;
    window.clearInterval(ticker);
    ticker = null;
  }

  function timerChanged() {
    if (live.timer.running) ensureTicker(); else stopTicker();
    liveChanged();
  }

  function startTimer(minutes) {
    minutes = rememberMinutes(minutes);
    live.timer = T.start(minutes, clock());
    soundFired = false;
    timerChanged();
  }

  /** Start, Pause, Weiter – oder nach dem Ablauf: noch einmal von vorn. */
  function toggleTimer() {
    if (!T.hasValue(live.timer)) { startTimer(settings().timerMinutes); return; }
    if (T.remainingSeconds(live.timer, clock()) <= 0) { resetTimer(); return; }
    live.timer = T.togglePause(live.timer, clock());
    timerChanged();
  }

  function resetTimer() {
    if (!T.hasValue(live.timer)) { startTimer(settings().timerMinutes); return; }
    live.timer = T.reset(live.timer, clock());
    soundFired = false;
    timerChanged();
  }

  /** Ändert die laufende Zeit oder, ohne gesetzten Timer, die Startdauer. */
  function adjustTimer(delta) {
    if (T.hasValue(live.timer)) {
      live.timer = T.addMinutes(live.timer, delta, clock());
      if (T.remainingSeconds(live.timer, clock()) > 0) soundFired = false;
      timerChanged();
      return;
    }
    rememberMinutes(settings().timerMinutes + delta);
  }

  function clearTimer() {
    live.timer = T.empty();
    soundFired = false;
    if (BAO.sounds) BAO.sounds.stopTimerSound();
    timerChanged();
  }

  function tick() {
    var now = clock();
    var before = live.timer;
    live.timer = T.settle(live.timer, now);
    if (T.remainingSeconds(live.timer, now) > 0) {
      soundFired = false;
    } else if (T.hasValue(live.timer) && !soundFired) {
      // Genau einmal je abgelaufenem Timer, nicht bei jedem Takt.
      soundFired = true;
      if (BAO.sounds) BAO.sounds.playTimerSound();
    }
    if (live.timer !== before) { timerChanged(); return; }
    if (!live.timer.running) stopTicker();
    emit('tick');
  }

  /** Alles, was eine Anzeige über den Timer wissen muss. */
  function timerView() {
    var now = clock();
    var remaining = T.remainingSeconds(live.timer, now);
    return {
      phase: T.phase(live.timer, now),          // idle | running | paused | done
      progress: T.progress(live.timer, now),
      remaining: remaining,
      clock: T.clock(remaining),
      totalMinutes: T.totalMinutes(live.timer),
      running: live.timer.running,
      hasValue: T.hasValue(live.timer),
      defaultMinutes: settings().timerMinutes
    };
  }

  /* --- Einstellungen der Leiste ------------------------------------------------------- */

  function setShow(module, on) {
    if (settings().show[module] === !!on) return;
    tune(function (c) { c.show[module] = !!on; });
  }

  function setPanelY(ratio) {
    ratio = util.clamp(Number(ratio) || 0, 0, 1);
    if (Math.abs(ratio - settings().panelY) < 0.001) return;
    tune(function (c) { c.panelY = ratio; });
  }

  function setTimerPresets(list) {
    var next = model.repairTimerPresets(list);
    change('Timer-Schnellwahl geändert', function (c) { c.timerPresets = next; });
    return next;
  }

  function setSoundOption(key, value) {
    tune(function (c) {
      c.sounds[key] = value;
      // Die Prüfung holt jeden Wert in seinen gültigen Bereich zurück.
      c.sounds = model.repairClassroom({ sounds: c.sounds }).sounds;
    });
  }

  /* --- Kataloge: Sozialformen und Materialien --------------------------------------------- */

  function listOf(c, kind) { return kind === 'materials' ? c.materials : c.phases; }
  function kindLabel(kind) { return kind === 'materials' ? 'Material' : 'Sozialform'; }

  function addItem(kind, name) {
    var item = model.makeItem({ name: String(name || '').trim().slice(0, 120) || 'Eigenes Symbol' });
    change(kindLabel(kind) + ' hinzugefügt', function (c) { listOf(c, kind).push(item); });
    return item.id;
  }

  function renameItem(kind, id, name) {
    name = String(name || '').trim().slice(0, 120);
    if (!name) return false;
    return change(kindLabel(kind) + ' umbenannt', function (c) {
      var item = findItem(listOf(c, kind), id);
      if (!item || item.name === name) return false;
      item.name = name;
    });
  }

  function moveItem(kind, id, delta) {
    return change('Reihenfolge geändert', function (c) {
      var list = listOf(c, kind);
      var index = list.indexOf(findItem(list, id));
      var target = index + delta;
      if (index < 0 || target < 0 || target >= list.length) return false;
      list.splice(target, 0, list.splice(index, 1)[0]);
    });
  }

  function removeItem(kind, id) {
    return change(kindLabel(kind) + ' entfernt', function (c) {
      var list = listOf(c, kind);
      var index = list.indexOf(findItem(list, id));
      if (index < 0) return false;
      list.splice(index, 1);
    });
  }

  function restoreDefaults(kind) {
    return change('Standards wiederhergestellt', function (c) {
      if (kind === 'materials') c.materials = model.defaultMaterials(); else c.phases = model.defaultPhases();
    });
  }

  /** Ersetzt das Symbol durch ein eigenes Bild (PNG, JPG, SVG …). */
  function setItemImage(kind, id, file) {
    return storeImage(file).then(function (result) {
      if (!result.ok) return result;
      change('Symbol ausgetauscht', function (c) {
        var item = findItem(listOf(c, kind), id);
        if (!item) return false;
        item.imageId = result.info.id;
      });
      return result;
    });
  }

  function resetItemImage(kind, id) {
    return change('Standardbild wiederhergestellt', function (c) {
      var item = findItem(listOf(c, kind), id);
      if (!item || !item.imageId) return false;
      item.imageId = '';
    });
  }

  /* --- Dateien annehmen --------------------------------------------------------------------- */

  function tooLarge(file) {
    return file.size > BAO.media.MAX_FILE_BYTES
      ? { ok: false, message: '„' + file.name + '“ ist ' + BAO.media.formatBytes(file.size)
        + ' groß. Erlaubt sind höchstens ' + BAO.media.formatBytes(BAO.media.MAX_FILE_BYTES)
        + ' – gedacht ist das Soundboard für kurze Signale und Clips.' }
      : null;
  }

  function storeImage(file) {
    if (!file) return Promise.resolve({ ok: false, message: '' });
    var refused = tooLarge(file);
    if (refused) return Promise.resolve(refused);
    return BAO.media.prepareImage(file).then(function (blob) {
      return BAO.media.add(blob, { name: file.name });
    }).then(function (info) {
      return { ok: true, info: info };
    }, function () {
      return { ok: false, message: '„' + file.name + '“ ließ sich nicht als Bild lesen. Geeignet sind PNG, JPG und SVG.' };
    });
  }

  function storeMedia(file, wantAudio) {
    if (!file) return Promise.resolve({ ok: false, message: '' });
    var refused = tooLarge(file);
    if (refused) return Promise.resolve(refused);
    return BAO.sounds.probe(file).then(function (probe) {
      if (!probe.ok) {
        return { ok: false, message: '„' + file.name + '“ kann dieser Browser nicht abspielen. ' + BAO.sounds.FORMAT_TIP };
      }
      return BAO.media.add(file, { name: file.name }).then(function (info) {
        return { ok: true, info: info, kind: wantAudio ? 'audio' : probe.kind };
      });
    });
  }

  /* --- Münzen ---------------------------------------------------------------------------------- */

  function button(index) { return settings().sounds.buttons[index] || null; }

  function assignMedia(index, file) {
    return storeMedia(file, false).then(function (result) {
      if (!result.ok) return result;
      change('Klang zugewiesen', function (c) {
        var target = c.sounds.buttons[index];
        if (!target) return false;
        target.mediaId = result.info.id;
        target.name = result.info.name;
        target.kind = result.kind;
      });
      return result;
    });
  }

  function assignImage(index, file) {
    return storeImage(file).then(function (result) {
      if (!result.ok) return result;
      change('Münzbild zugewiesen', function (c) {
        var target = c.sounds.buttons[index];
        if (!target) return false;
        target.imageId = result.info.id;
        target.imageName = result.info.name;
      });
      return result;
    });
  }

  function resetImage(index) {
    return change('Münzbild entfernt', function (c) {
      var target = c.sounds.buttons[index];
      if (!target || !target.imageId) return false;
      target.imageId = '';
      target.imageName = '';
    });
  }

  function clearButton(index) {
    if (BAO.sounds && BAO.sounds.playingIndex() === index) BAO.sounds.stop();
    return change('Zuweisungen gelöscht', function (c) {
      var target = c.sounds.buttons[index];
      if (!target || (!target.mediaId && !target.imageId)) return false;
      c.sounds.buttons[index] = model.emptyButton();
    });
  }

  /* --- Klang am Ende des Timers ------------------------------------------------------------------ */

  function assignTimerSound(file) {
    return storeMedia(file, true).then(function (result) {
      if (!result.ok) return result;
      change('Timer-Klang festgelegt', function (c) {
        c.timerSound = { mediaId: result.info.id, name: result.info.name };
      });
      return result;
    });
  }

  function removeTimerSound() {
    if (BAO.sounds) BAO.sounds.stopTimerSound();
    return change('Timer-Klang entfernt', function (c) {
      if (!c.timerSound.mediaId) return false;
      c.timerSound = { mediaId: '', name: '' };
    });
  }

  /* --- Phasen-Presets ------------------------------------------------------------------------------ */

  var TARGET_KINDS = {
    bank: { label: 'Wortbank', collection: 'banks' },
    board: { label: 'Tafel', collection: 'boards' },
    whiteboard: { label: 'Whiteboard', collection: 'whiteboards' }
  };

  function preset(id) { return findItem(presets(), id); }

  /** Das Ziel eines Presets im Bestand – oder null, wenn es gelöscht wurde. */
  function presetTarget(item, state) {
    state = state || BAO.store.getState();
    var kind = item && TARGET_KINDS[item.targetKind];
    if (!kind || !item.targetId) return null;
    return select.byId(state[kind.collection] || [], item.targetId);
  }

  /** hasTarget = es ist ein Ziel gewählt; missing = gewählt, aber nicht mehr vorhanden. */
  function presetStatus(item, state) {
    var hasTarget = !!(item && TARGET_KINDS[item.targetKind] && item.targetId);
    var target = hasTarget ? presetTarget(item, state) : null;
    return {
      hasTarget: hasTarget,
      missing: hasTarget && !target,
      kindLabel: hasTarget ? TARGET_KINDS[item.targetKind].label : '',
      title: target ? target.title : (item ? item.targetTitle : ''),
      target: target
    };
  }

  /** Alles, was ein Preset öffnen kann – für die Auswahl im Dialog. */
  function presetTargets(state) {
    state = state || BAO.store.getState();
    var result = [];
    Object.keys(TARGET_KINDS).forEach(function (kind) {
      (state[TARGET_KINDS[kind].collection] || []).forEach(function (entry) {
        var group = select.group(state, entry.groupId);
        if (group && group.archived) return;
        result.push({
          kind: kind, id: entry.id, kindLabel: TARGET_KINDS[kind].label,
          title: entry.title || '', group: group ? group.name : '',
          scene: kind === 'bank' ? (entry.scene || '') : '',
          level: kind === 'bank' ? (entry.defaultLevel || 2) : 2
        });
      });
    });
    return result.sort(function (a, b) {
      return (a.group + ' ' + a.kindLabel + ' ' + a.title).localeCompare(b.group + ' ' + b.kindLabel + ' ' + b.title, 'de');
    });
  }

  function suggestPhase(scene) {
    return model.suggestPhase(scene, catalog('phases'), settings().sceneMap);
  }

  /**
   * Legt ein Preset an oder ändert es.
   * options.rememberScene: Szene, deren Zuordnung zur Sozialform gemerkt wird.
   */
  function savePreset(data, options) {
    options = options || {};
    var existing = data.id ? preset(data.id) : null;
    var next = model.repairPreset(model.makePreset(Object.assign({}, existing || {}, data, { updatedAt: util.nowISO() })));
    if (!existing) next.createdAt = next.updatedAt;
    next.name = next.name.trim() || next.targetTitle;

    BAO.store.commit(existing ? 'Preset geändert' : 'Preset angelegt', function (draft) {
      var index = draft.presets.indexOf(findItem(draft.presets, next.id));
      if (index >= 0) draft.presets[index] = next; else draft.presets.push(next);
      var sceneKey = model.normalizeScene(options.rememberScene);
      if (sceneKey) {
        if (next.phaseId) draft.classroom.sceneMap[sceneKey] = next.phaseId;
        else delete draft.classroom.sceneMap[sceneKey];
      }
    });
    return next.id;
  }

  function removePreset(id) {
    return BAO.store.commit('Preset gelöscht', function (draft) {
      var index = draft.presets.indexOf(findItem(draft.presets, id));
      if (index < 0) return false;
      draft.presets.splice(index, 1);
    });
  }

  function movePreset(id, delta) {
    return BAO.store.commit('Reihenfolge geändert', function (draft) {
      var index = draft.presets.indexOf(findItem(draft.presets, id));
      var target = index + delta;
      if (index < 0 || target < 0 || target >= draft.presets.length) return false;
      draft.presets.splice(target, 0, draft.presets.splice(index, 1)[0]);
    });
  }

  /** Der Unterrichtsteil eines Presets: Sozialform, Material, Timer. */
  function applyPreset(item) {
    var show = {};
    if (item.phaseId && findItem(catalog('phases'), item.phaseId)) {
      live.phaseId = item.phaseId;
      show.phase = true;
    }
    var materials = catalog('materials');
    var wanted = item.materialIds.filter(function (id) { return !!findItem(materials, id); });
    if (wanted.length) {
      live.materialIds = wanted;
      show.materials = true;
    }
    if (item.timerMinutes > 0) show.timer = true;

    var current = settings();
    var hidden = Object.keys(show).filter(function (key) { return !current.show[key]; });
    var minutes = item.timerMinutes > 0 ? item.timerMinutes : current.timerMinutes;
    if (hidden.length || minutes !== current.timerMinutes) {
      tune(function (c) {
        hidden.forEach(function (key) { c.show[key] = true; });
        c.timerMinutes = minutes;
      });
    }
    liveChanged();
    if (item.timerMinutes > 0 && item.timerAutostart) startTimer(item.timerMinutes);
  }

  /**
   * Startet eine Unterrichtsphase: stellt die Leiste ein und öffnet das Ziel.
   * @returns {{ok: boolean, missing: boolean}} missing = das Ziel gibt es nicht mehr
   */
  function startPreset(id) {
    var item = preset(id);
    if (!item) return { ok: false, missing: false };
    var status = presetStatus(item);
    applyPreset(item);

    if (status.target && BAO.app) {
      var target = status.target;
      if (item.targetKind === 'bank') {
        BAO.app.setContext(target.subjectId, target.groupId);
        BAO.app.projectBank(target.id, { level: item.level });
      } else if (item.targetKind === 'board') {
        BAO.app.projectBoard(target.id);
      } else {
        BAO.app.setContext(target.subjectId, target.groupId);
        BAO.app.go('whiteboard/' + target.id);
      }
    }
    return { ok: true, missing: status.missing };
  }

  /* --- Start ------------------------------------------------------------------------------------------- */

  function sign(state) {
    return JSON.stringify(state.classroom || null) + '\n' + JSON.stringify(state.presets || null);
  }

  function boot(meta) {
    signature = sign(BAO.store.getState());
    loadLive();
    BAO.media.subscribe(function () { emit('media'); });
    BAO.media.init().then(function () {
      // Aufräumen nur bei einem regulär geladenen Bestand: Nach einem
      // Fehlstart verwiese nichts mehr auf die Dateien, obwohl sie noch
      // gebraucht werden könnten.
      if (meta && meta.startedFresh) return;
      var keep = model.mediaIds(BAO.store.getState());
      var safety = BAO.storage.loadSafetyCopy();
      if (safety && safety.state) keep = keep.concat(model.mediaIds(safety.state));
      BAO.media.sweep(keep);
    });
  }

  BAO.store.subscribe(function (state, meta) {
    if (meta.reason === 'init') { boot(meta); return; }
    var next = sign(state);
    if (next === signature) return;
    signature = next;
    if (sanitizeLive()) saveLive();
    emit('settings');
  });

  BAO.classroom = {
    QUIET_LABEL: QUIET_LABEL,
    subscribe: subscribe,
    settings: settings,
    presets: presets,
    catalog: catalog,
    live: function () { return live; },
    phaseItem: phaseItem,
    materialItems: materialItems,

    setPhase: setPhase,
    togglePhase: togglePhase,
    toggleMaterial: toggleMaterial,
    setMaterials: setMaterials,
    clearMaterials: clearMaterials,

    startTimer: startTimer,
    toggleTimer: toggleTimer,
    resetTimer: resetTimer,
    adjustTimer: adjustTimer,
    clearTimer: clearTimer,
    tick: tick,
    timerView: timerView,
    TICK_MS: TICK_MS,

    setShow: setShow,
    setPanelY: setPanelY,
    setTimerPresets: setTimerPresets,
    setSoundOption: setSoundOption,

    addItem: addItem,
    renameItem: renameItem,
    moveItem: moveItem,
    removeItem: removeItem,
    restoreDefaults: restoreDefaults,
    setItemImage: setItemImage,
    resetItemImage: resetItemImage,

    button: button,
    assignMedia: assignMedia,
    assignImage: assignImage,
    resetImage: resetImage,
    clearButton: clearButton,
    assignTimerSound: assignTimerSound,
    removeTimerSound: removeTimerSound,

    preset: preset,
    presetStatus: presetStatus,
    presetTargets: presetTargets,
    suggestPhase: suggestPhase,
    savePreset: savePreset,
    removePreset: removePreset,
    movePreset: movePreset,
    startPreset: startPreset,

    /** Nur für Prüfungen: ersetzt die Uhr, damit ein Timer ohne Warten abläuft. */
    setClock: function (fn) { clock = fn || function () { return Date.now(); }; },
    reloadLive: loadLive
  };
})(window.BAO = window.BAO || {});
