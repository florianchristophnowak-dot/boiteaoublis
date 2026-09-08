/* ==========================================================================
   Unterrichtssitzung
   Der Zustandsautomat hinter der Projektion: Unterstützungsstufe, Blättern,
   Automatik, Fokus, Abschreibmodus, Live-Hilfe. Alle Ausgabeflächen zeigen
   stets denselben Stand.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;
  var render = BAO.render;
  var output = BAO.output;
  var deckLib = BAO.deck;
  var select = BAO.select;

  var TICK_MS = 200;

  var state = {
    active: false,
    bankId: '',
    deck: null,
    level: 2,
    fields: null,
    focusSectionId: '',
    index: 0,
    blank: false,
    copyMode: false,
    scale: 1,
    theme: 'light',
    auto: { playing: false, seconds: 45, remaining: 45, reachedEnd: false },
    live: []
  };

  var listeners = [];
  var ticker = null;

  function subscribe(fn) {
    listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  function emit(reason) {
    listeners.forEach(function (fn) {
      try { fn(state, reason); } catch (err) { console.error('Fehler im Sitzungsbeobachter:', err); }
    });
  }

  /* --- Ausgabeflächen ------------------------------------------------------- */

  /** Die maßgebliche Fläche für die Seitenaufteilung: echtes Ausgabegerät zuerst. */
  function leadingSurface() {
    return output.getSurface('window') || output.getSurface('overlay') || output.getSurface('preview');
  }

  /** Grundeinheit der Schriftgröße aus der tatsächlichen Flächengröße. */
  function applyUnit(surface) {
    var root = surface.stage.root;
    var width = root.clientWidth || 960;
    var height = root.clientHeight || 540;
    var unit = Math.min(width * 0.0105, height * 0.0185);
    root.style.setProperty('--u', Math.max(unit, 2) + 'px');
  }

  function viewState() {
    return {
      index: state.index,
      blank: state.blank,
      copyMode: state.copyMode,
      focus: !!state.focusSectionId,
      theme: state.theme,
      scale: state.scale,
      autoPlaying: state.auto.playing,
      autoSeconds: state.auto.seconds,
      autoRemaining: state.auto.remaining,
      showProgress: BAO.store.getState().settings.showProgressOnStage !== false,
      emptyText: state.bankId
        ? 'Diese Wortbank enthält noch keine sichtbaren Einträge.'
        : 'Bereit. Wortbank wählen oder Live-Hilfe eingeben.'
    };
  }

  function renderAll(options) {
    options = options || {};
    var surfaces = output.surfaces();
    if (!surfaces.length) { emit(options.reason || 'render'); return; }

    var leading = leadingSurface();
    if (leading && state.deck) {
      applyUnit(leading);
      if (options.relayout !== false) render.relayout(leading.stage, state.deck);
      clampIndex();
    }

    var view = viewState();
    surfaces.forEach(function (surface) {
      applyUnit(surface);
      render.renderStage(surface.stage, state.deck, view);
    });
    emit(options.reason || 'render');
  }

  function clampIndex() {
    var total = state.deck ? state.deck.slides.length : 0;
    if (!total) { state.index = 0; return; }
    state.index = util.clamp(state.index, 0, total - 1);
  }

  /* --- Aufbau --------------------------------------------------------------- */

  function buildDeck() {
    var store = BAO.store.getState();
    var bank = state.bankId ? select.bank(store, state.bankId) : null;
    if (!state.fields) state.fields = deckLib.fieldsForLevel(state.level, store.settings.fieldLevels);
    state.deck = deckLib.build(store, bank, {
      level: state.level,
      fields: state.fields,
      focusSectionId: state.focusSectionId,
      liveItems: state.live,
      maxItemsPerSlide: store.settings.maxItemsPerSlide
    });
    clampIndex();
    return state.deck;
  }

  /** Startet eine Wortbank (oder eine reine Live-Sitzung ohne Wortbank). */
  function start(bankId, options) {
    options = options || {};
    var store = BAO.store.getState();
    var bank = bankId ? select.bank(store, bankId) : null;

    state.active = true;
    state.bankId = bank ? bank.id : '';
    state.level = options.level || (bank && bank.defaultLevel) || 2;
    state.fields = deckLib.fieldsForLevel(state.level, store.settings.fieldLevels);
    state.focusSectionId = '';
    state.index = 0;
    state.blank = false;
    state.copyMode = false;
    state.scale = store.settings.stageScale || 1;
    state.theme = store.settings.stageTheme || 'light';
    state.auto.seconds = store.settings.autoAdvanceSeconds || 45;
    state.auto.remaining = state.auto.seconds;
    state.auto.playing = false;
    state.auto.reachedEnd = false;
    if (options.keepLive !== true) state.live = [];

    buildDeck();

    if (bank) {
      BAO.store.commit('Wortbank geöffnet', function (draft) {
        var target = select.bank(draft, bank.id);
        if (target) target.lastUsedAt = util.nowISO();
        draft.ui.recentBanks = [bank.id].concat((draft.ui.recentBanks || [])
          .filter(function (id) { return id !== bank.id; })).slice(0, 8);
      }, { undoable: false });
    }

    renderAll({ reason: 'start' });
    return state;
  }

  function stop() {
    pause();
    state.active = false;
    state.bankId = '';
    state.deck = null;
    state.live = [];
    emit('stop');
  }

  function rebuild(options) {
    if (!state.active) return;
    buildDeck();
    renderAll(Object.assign({ reason: 'rebuild' }, options || {}));
  }

  /* --- Navigation ------------------------------------------------------------ */

  function totalSlides() { return state.deck ? state.deck.slides.length : 0; }

  function goTo(index, reason) {
    var total = totalSlides();
    if (!total) return;
    state.index = util.clamp(index, 0, total - 1);
    state.auto.remaining = state.auto.seconds;
    state.auto.reachedEnd = false;
    renderAll({ reason: reason || 'navigate', relayout: false });
  }

  function next(fromAuto) {
    var total = totalSlides();
    if (!total) return false;
    if (state.index >= total - 1) {
      // Kein überraschender Neustart: Am Ende bleibt die letzte Seite stehen.
      state.auto.reachedEnd = true;
      if (fromAuto) {
        var loop = BAO.store.getState().settings.autoAdvanceLoop;
        if (loop) { goTo(0, 'auto'); return true; }
        pause();
        emit('reached-end');
      }
      return false;
    }
    goTo(state.index + 1, fromAuto ? 'auto' : 'navigate');
    return true;
  }

  function prev() {
    if (state.index <= 0) return false;
    goTo(state.index - 1, 'navigate');
    return true;
  }

  function goToSection(sectionId) {
    if (!state.deck) return;
    for (var i = 0; i < state.deck.slides.length; i++) {
      if (state.deck.slides[i].sectionId === sectionId) { goTo(i, 'navigate'); return; }
    }
  }

  /* --- Unterstützungsstufen -------------------------------------------------- */

  function setLevel(level) {
    var store = BAO.store.getState();
    state.level = util.clamp(level, 1, 3);
    state.fields = deckLib.fieldsForLevel(state.level, store.settings.fieldLevels);
    rebuild({ reason: 'level' });
  }

  function toggleField(key) {
    if (!state.fields) return;
    state.fields[key] = !state.fields[key];
    rebuild({ reason: 'fields' });
  }

  function setField(key, value) {
    if (!state.fields) return;
    state.fields[key] = !!value;
    rebuild({ reason: 'fields' });
  }

  function toggleFocus(sectionId) {
    state.focusSectionId = state.focusSectionId === sectionId ? '' : sectionId;
    state.index = 0;
    rebuild({ reason: 'focus' });
  }

  function setScale(scale) {
    state.scale = util.clamp(scale, 0.7, 1.8);
    BAO.store.commit('Schriftgröße der Projektion', function (draft) {
      draft.settings.stageScale = state.scale;
    }, { undoable: false });
    rebuild({ reason: 'scale' });
  }

  function setTheme(theme) {
    state.theme = theme === 'dark' ? 'dark' : 'light';
    BAO.store.commit('Darstellung der Projektion', function (draft) {
      draft.settings.stageTheme = state.theme;
    }, { undoable: false });
    renderAll({ reason: 'theme', relayout: false });
  }

  function toggleBlank() {
    state.blank = !state.blank;
    if (state.blank) pause();
    renderAll({ reason: 'blank', relayout: false });
  }

  function toggleCopyMode() {
    state.copyMode = !state.copyMode;
    // Abschreibmodus hält die Seite bewusst stehen.
    if (state.copyMode) pause();
    renderAll({ reason: 'copy', relayout: false });
  }

  /* --- Automatisches Weiterschalten ------------------------------------------ */

  function tick() {
    if (!state.auto.playing) return;
    state.auto.remaining -= TICK_MS / 1000;
    if (state.auto.remaining <= 0) {
      state.auto.remaining = state.auto.seconds;
      next(true);
      return;
    }
    output.surfaces().forEach(function (surface) {
      render.updateTimer(surface.stage, viewState());
    });
    emit('tick');
  }

  function play() {
    if (state.copyMode) return false;
    if (totalSlides() <= 1) return false;
    if (state.index >= totalSlides() - 1 && !BAO.store.getState().settings.autoAdvanceLoop) {
      // Am Ende zuerst zurück an den Anfang – aber nur auf ausdrücklichen Wunsch.
      return false;
    }
    state.auto.playing = true;
    state.auto.remaining = state.auto.seconds;
    if (ticker) clearInterval(ticker);
    ticker = setInterval(tick, TICK_MS);
    renderAll({ reason: 'play', relayout: false });
    return true;
  }

  function pause() {
    if (ticker) { clearInterval(ticker); ticker = null; }
    if (!state.auto.playing) return;
    state.auto.playing = false;
    renderAll({ reason: 'pause', relayout: false });
  }

  function toggleAuto() { return state.auto.playing ? (pause(), false) : play(); }

  function setSeconds(seconds) {
    state.auto.seconds = util.clamp(Math.round(seconds), 5, 600);
    state.auto.remaining = state.auto.seconds;
    BAO.store.commit('Intervall der Automatik', function (draft) {
      draft.settings.autoAdvanceSeconds = state.auto.seconds;
    }, { undoable: false });
    emit('interval');
  }

  /* --- Live-Hilfe ------------------------------------------------------------ */

  function addLive(entry) {
    var item = {
      id: util.uid('live'),
      type: entry.type === 'starter' ? 'starter' : 'word',
      text: String(entry.text || '').trim(),
      translation: String(entry.translation || '').trim(),
      createdAt: util.nowISO()
    };
    if (!item.text) return null;
    state.live.push(item);
    pause();                                  // Live-Änderung hält die Automatik an
    state.blank = false;
    buildDeck();
    renderAll({ reason: 'live-added' });
    // Nach der Messung auf die letzte Seite der Live-Hilfe springen.
    for (var i = state.deck.slides.length - 1; i >= 0; i--) {
      if (state.deck.slides[i].sectionId === deckLib.LIVE_SECTION_ID) { goTo(i, 'live-added'); break; }
    }
    return item;
  }

  function removeLive(id) {
    state.live = state.live.filter(function (item) { return item.id !== id; });
    rebuild({ reason: 'live-removed' });
  }

  function clearLive() {
    state.live = [];
    rebuild({ reason: 'live-cleared' });
  }

  function getLive(id) {
    return state.live.filter(function (item) { return item.id === id; })[0] || null;
  }

  /* --- Zugriff --------------------------------------------------------------- */

  function getState() { return state; }
  function getDeck() { return state.deck; }
  function currentSlide() { return state.deck ? state.deck.slides[state.index] || null : null; }

  function summary() {
    if (!state.deck) return [];
    return deckLib.sectionSummary(state.deck);
  }

  output.onChange(function (reason) {
    if (!state.active) return;
    if (reason === 'resize' || reason === 'window-opened' || reason === 'overlay-opened' || reason === 'fullscreen') {
      renderAll({ reason: reason });
    } else if (reason === 'window-closed' || reason === 'overlay-closed') {
      renderAll({ reason: reason });
    }
  });

  BAO.session = {
    subscribe: subscribe,
    getState: getState,
    getDeck: getDeck,
    currentSlide: currentSlide,
    summary: summary,
    totalSlides: totalSlides,
    start: start,
    stop: stop,
    rebuild: rebuild,
    renderAll: renderAll,
    next: next,
    prev: prev,
    goTo: goTo,
    goToSection: goToSection,
    setLevel: setLevel,
    toggleField: toggleField,
    setField: setField,
    toggleFocus: toggleFocus,
    setScale: setScale,
    setTheme: setTheme,
    toggleBlank: toggleBlank,
    toggleCopyMode: toggleCopyMode,
    play: play,
    pause: pause,
    toggleAuto: toggleAuto,
    setSeconds: setSeconds,
    addLive: addLive,
    removeLive: removeLive,
    clearLive: clearLive,
    getLive: getLive,
    leadingSurface: leadingSurface
  };
})(window.BAO = window.BAO || {});
