/* ==========================================================================
   Zustandsspeicher
   Ein einziger Zustand, veränderbar nur über commit(). Jeder commit legt eine
   Momentaufnahme für „Rückgängig“ an und speichert verzögert lokal.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;
  var schema = BAO.schema;
  var storage = BAO.storage;

  var state = null;
  var listeners = [];
  var undoStack = [];
  var redoStack = [];
  var MAX_HISTORY = 40;
  var storageState = 'ok';       // 'ok' | 'session' | 'error'
  var storageMessage = '';
  var lastSavedAt = '';

  var persist = util.debounce(function () { persistNow(); }, 300);

  function persistNow() {
    if (!state) return;
    state.meta.updatedAt = util.nowISO();
    var result = storage.saveState(state);
    if (result.ok) {
      storageState = 'ok';
      storageMessage = '';
      lastSavedAt = util.nowISO();
    } else if (!storage.isAvailable()) {
      storageState = 'session';
      storageMessage = 'Der Browser erlaubt keine lokale Speicherung. Die Daten bleiben nur für diese Sitzung erhalten – bitte exportieren.';
    } else {
      storageState = 'error';
      storageMessage = result.quota
        ? 'Der lokale Speicher ist voll. Bitte exportieren und nicht mehr benötigte Einträge archivieren.'
        : 'Die Daten konnten nicht gespeichert werden.';
    }
    emitStorage();
  }

  function emitStorage() {
    document.dispatchEvent(new CustomEvent('bao:storage', {
      detail: { state: storageState, message: storageMessage, savedAt: lastSavedAt }
    }));
  }

  function notify(meta) {
    listeners.forEach(function (fn) {
      try { fn(state, meta || {}); } catch (err) { console.error('Fehler in einem Zustandsbeobachter:', err); }
    });
  }

  /* --- Initialisierung ---------------------------------------------------- */

  function init(options) {
    options = options || {};
    var loaded = storage.loadState();
    var startedFresh = false;

    if (loaded) {
      try {
        var migrated = BAO.migrations.migrate(loaded);
        if (migrated.error) {
          console.warn(migrated.error);
          storageState = 'error';
          storageMessage = migrated.error;
        }
        var checked = schema.validateState(migrated.state);
        state = checked.state;
        if (checked.warnings.length) console.warn('Daten repariert:', checked.warnings);
      } catch (err) {
        console.error('Der gespeicherte Bestand konnte nicht gelesen werden:', err);
        storage.saveSafetyCopy(loaded);
        state = schema.emptyState();
        startedFresh = true;
        storageState = 'error';
        storageMessage = 'Der gespeicherte Bestand war beschädigt. Eine Sicherungskopie liegt im Bereich „Daten“.';
      }
    } else {
      state = schema.emptyState();
      startedFresh = true;
      if (options.seed !== false && BAO.seed) BAO.seed.fill(state);
    }

    state.meta.appVersion = schema.APP_VERSION;
    if (!storage.isAvailable()) {
      storageState = 'session';
      storageMessage = 'Der Browser erlaubt keine lokale Speicherung. Die Daten bleiben nur für diese Sitzung erhalten – bitte exportieren.';
    }
    persistNow();

    window.addEventListener('beforeunload', function () { persist.cancel(); persistNow(); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') { persist.cancel(); persistNow(); }
    });

    notify({ reason: 'init', startedFresh: startedFresh });
    return state;
  }

  function getState() { return state; }

  function subscribe(fn) {
    listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  /* --- Veränderungen ------------------------------------------------------ */

  /**
   * commit('Eintrag gelöscht', function (draft) { … })
   * options.undoable = false  -> reine Ansichts-/Einstellungsänderung
   */
  function commit(label, mutator, options) {
    options = options || {};
    var undoable = options.undoable !== false;
    var before = undoable ? JSON.stringify(state) : null;
    var draft = util.clone(state);
    var result = mutator(draft);
    if (result === false) return null;           // Mutator hat abgebrochen
    draft.meta.updatedAt = util.nowISO();
    state = draft;

    if (undoable) {
      undoStack.push({ label: label, snapshot: before, at: util.nowISO() });
      if (undoStack.length > MAX_HISTORY) undoStack.shift();
      redoStack.length = 0;
    }

    persist();
    notify({ reason: 'commit', label: label, undoable: undoable, payload: options.payload });
    return result === undefined ? true : result;
  }

  /** Ersetzt den gesamten Bestand (Import, Wiederherstellung). */
  function replaceState(nextState, label) {
    var before = JSON.stringify(state);
    storage.saveSafetyCopy(JSON.parse(before));
    state = nextState;
    undoStack.push({ label: label || 'Bestand ersetzt', snapshot: before, at: util.nowISO() });
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack.length = 0;
    persist.cancel();
    persistNow();
    notify({ reason: 'replace', label: label });
  }

  function canUndo() { return undoStack.length > 0; }
  function canRedo() { return redoStack.length > 0; }
  function lastUndoLabel() { return undoStack.length ? undoStack[undoStack.length - 1].label : ''; }

  function undo() {
    if (!undoStack.length) return null;
    var entry = undoStack.pop();
    redoStack.push({ label: entry.label, snapshot: JSON.stringify(state), at: util.nowISO() });
    state = JSON.parse(entry.snapshot);
    persist.cancel();
    persistNow();
    notify({ reason: 'undo', label: entry.label });
    return entry.label;
  }

  function redo() {
    if (!redoStack.length) return null;
    var entry = redoStack.pop();
    undoStack.push({ label: entry.label, snapshot: JSON.stringify(state), at: util.nowISO() });
    state = JSON.parse(entry.snapshot);
    persist.cancel();
    persistNow();
    notify({ reason: 'redo', label: entry.label });
    return entry.label;
  }

  function storageInfo() {
    return {
      state: storageState,
      message: storageMessage,
      savedAt: lastSavedAt,
      bytes: storage.approximateSize(),
      available: storage.isAvailable()
    };
  }

  BAO.store = {
    init: init,
    getState: getState,
    subscribe: subscribe,
    commit: commit,
    replaceState: replaceState,
    undo: undo,
    redo: redo,
    canUndo: canUndo,
    canRedo: canRedo,
    lastUndoLabel: lastUndoLabel,
    flush: function () { persist.cancel(); persistNow(); },
    storageInfo: storageInfo
  };
})(window.BAO = window.BAO || {});
