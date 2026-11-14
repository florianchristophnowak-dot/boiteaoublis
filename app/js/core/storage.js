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

  /* Kleine Nebenablagen neben dem Bestand – etwa der Augenblickszustand der
     Unterrichtsleiste (gewählte Sozialform, laufender Timer). Sie gehören
     nicht in die Sicherungsdatei und nicht in den Rückgängig-Verlauf. */
  function readJSON(key) {
    var raw = read(key);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (err) { return null; }
  }

  function writeJSON(key, value) { return write(key, JSON.stringify(value)); }

  function approximateSize() {
    var raw = read(KEY);
    return raw ? raw.length : 0;
  }

  /** Entfernt die Sicherheitskopie, um Platz zu schaffen. true, wenn es eine gab. */
  function dropSafetyCopy() {
    var had = read(SAFETY_KEY) !== null;
    if (had) remove(SAFETY_KEY);
    return had;
  }

  /* Browser gewähren dem lokalen Speicher rund fünf Millionen Zeichen je
     Herkunft. Genau abfragen lässt sich die Grenze nicht – als Richtwert für
     die Anzeige „so viel ist belegt“ genügt sie. */
  var QUOTA_ESTIMATE = 5 * 1024 * 1024;

  /**
   * Belegung durch alles, was diese App abgelegt hat (Bestand,
   * Sicherheitskopie, beiseitegelegte beschädigte Stände).
   * @returns {{used: number, quota: number, share: number}}
   */
  function usage() {
    var used = 0;
    if (probe()) {
      try {
        for (var i = 0; i < window.localStorage.length; i++) {
          var key = window.localStorage.key(i);
          if (key && key.indexOf('bao.') === 0) used += key.length + (window.localStorage.getItem(key) || '').length;
        }
      } catch (err) { lastError = err; }
    } else {
      Object.keys(memory).forEach(function (key) { used += key.length + String(memory[key]).length; });
    }
    return { used: used, quota: QUOTA_ESTIMATE, share: Math.min(1, used / QUOTA_ESTIMATE) };
  }

  BAO.storage = {
    KEY: KEY,
    isAvailable: probe,
    lastError: function () { return lastError; },
    loadState: loadState,
    saveState: saveState,
    saveSafetyCopy: saveSafetyCopy,
    loadSafetyCopy: loadSafetyCopy,
    readJSON: readJSON,
    writeJSON: writeJSON,
    approximateSize: approximateSize,
    usage: usage,
    dropSafetyCopy: dropSafetyCopy,
    clearAll: function () { remove(KEY); remove(SAFETY_KEY); }
  };
})(window.BAO = window.BAO || {});
