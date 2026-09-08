/* ==========================================================================
   Lokale Speicherung
   Bewusst schlicht: ein JSON-Dokument im localStorage. Damit funktioniert die
   App auch, wenn sie direkt als Datei geöffnet wird (file://), wo IndexedDB in
   manchen Browsern gesperrt ist. Fällt die Speicherung aus, arbeitet die App
   weiter – dann aber sichtbar im Nur-Sitzung-Modus.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var KEY = 'bao.state.v1';
  var SAFETY_KEY = 'bao.safety.v1';   // Sicherungskopie vor riskanten Aktionen

  var memory = Object.create(null);
  var available = null;
  var lastError = null;

  function probe() {
    if (available !== null) return available;
    try {
      var probeKey = 'bao.probe';
      window.localStorage.setItem(probeKey, '1');
      window.localStorage.removeItem(probeKey);
      available = true;
    } catch (err) {
      lastError = err;
      available = false;
    }
    return available;
  }

  function read(key) {
    if (probe()) {
      try { return window.localStorage.getItem(key); }
      catch (err) { lastError = err; }
    }
    return key in memory ? memory[key] : null;
  }

  function write(key, value) {
    if (probe()) {
      try {
        window.localStorage.setItem(key, value);
        memory[key] = value;
        return { ok: true };
      } catch (err) {
        lastError = err;
        memory[key] = value;
        var quota = err && (err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014);
        return { ok: false, quota: !!quota, error: err };
      }
    }
    memory[key] = value;
    return { ok: false, error: lastError };
  }

  function remove(key) {
    delete memory[key];
    if (probe()) { try { window.localStorage.removeItem(key); } catch (err) { lastError = err; } }
  }

  function loadState() {
    var raw = read(KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); }
    catch (err) {
      // Beschädigte Daten niemals stillschweigend überschreiben.
      write(KEY + '.broken.' + Date.now(), raw);
      lastError = err;
      return null;
    }
  }

  function saveState(state) { return write(KEY, JSON.stringify(state)); }

  function saveSafetyCopy(state) {
    return write(SAFETY_KEY, JSON.stringify({ savedAt: new Date().toISOString(), state: state }));
  }

  function loadSafetyCopy() {
    var raw = read(SAFETY_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (err) { return null; }
  }

  function approximateSize() {
    var raw = read(KEY);
    return raw ? raw.length : 0;
  }

  BAO.storage = {
    KEY: KEY,
    isAvailable: probe,
    lastError: function () { return lastError; },
    loadState: loadState,
    saveState: saveState,
    saveSafetyCopy: saveSafetyCopy,
    loadSafetyCopy: loadSafetyCopy,
    approximateSize: approximateSize,
    clearAll: function () { remove(KEY); remove(SAFETY_KEY); }
  };
})(window.BAO = window.BAO || {});
