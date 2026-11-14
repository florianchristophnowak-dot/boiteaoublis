/* ==========================================================================
   Medienablage
   Klang- und Videodateien sowie eigene Bilder sind zu groß für den
   localStorage, in dem der Bestand liegt (rund fünf Millionen Zeichen für
   alles). Sie liegen deshalb in einer IndexedDB desselben Browsers; der
   Bestand merkt sich nur ihre Kennung.

   Erlaubt der Browser keine IndexedDB – manche sperren sie für direkt
   geöffnete Dateien (file://) –, bleiben die Dateien nur für diese Sitzung
   im Arbeitsspeicher. Die Oberfläche sagt das dann ausdrücklich.

   Damit ein Klang ohne Verzögerung startet, hält die Ablage alle Einträge
   bereit: url(id) antwortet sofort mit einer Adresse, die ein Audio- oder
   Videoelement direkt abspielen kann.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;

  var DB_NAME = 'bao-media';
  var STORE = 'files';
  var OPEN_TIMEOUT_MS = 4000;

  /* Gedacht für kurze Signale und Clips. Die Grenze schützt den Browser und
     hält die Sicherungsdatei handhabbar, in der die Dateien mitreisen. */
  var MAX_FILE_BYTES = 30 * 1024 * 1024;
  var MAX_BACKUP_BYTES = 100 * 1024 * 1024;
  var MAX_IMAGE_EDGE = 512;

  var db = null;
  var ready = false;
  var readyPromise = null;
  var storeBlobs = true;                  // false: Der Browser speichert nur Rohdaten
  var entries = Object.create(null);      // id -> { id, name, type, size, addedAt, blob, stored }
  var urls = Object.create(null);         // id -> Objekt-URL
  var listeners = [];

  function emit(reason) {
    listeners.forEach(function (fn) {
      try { fn(reason); } catch (err) { console.error('Fehler im Beobachter der Medienablage:', err); }
    });
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  /* --- Datenbank ------------------------------------------------------------- */

  function openDatabase() {
    return new Promise(function (resolve) {
      var settled = false;
      var guard = null;
      function finish(value) {
        if (settled) return;
        settled = true;
        if (guard) window.clearTimeout(guard);
        resolve(value);
      }
      var request;
      try {
        if (!window.indexedDB) { finish(null); return; }
        request = window.indexedDB.open(DB_NAME, 1);
      } catch (err) { finish(null); return; }
      // Manche Browser antworten für file:// gar nicht – dann nicht ewig warten.
      guard = window.setTimeout(function () { finish(null); }, OPEN_TIMEOUT_MS);
      request.onupgradeneeded = function () {
        var database = request.result;
        if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: 'id' });
      };
      request.onsuccess = function () {
        if (settled) { try { request.result.close(); } catch (err) { /* schon geschlossen */ } return; }
        finish(request.result);
      };
      request.onerror = function (event) { if (event && event.preventDefault) event.preventDefault(); finish(null); };
      request.onblocked = function () { finish(null); };
    });
  }

  function transact(mode, work) {
    return new Promise(function (resolve, reject) {
      var tx;
      var result;
      try {
        tx = db.transaction(STORE, mode);
        result = work(tx.objectStore(STORE));
      } catch (err) { reject(err); return; }
      tx.oncomplete = function () { resolve(result && result.result !== undefined ? result.result : undefined); };
      tx.onerror = function (event) { if (event && event.preventDefault) event.preventDefault(); reject(tx.error); };
      tx.onabort = function () { reject(tx.error || new Error('Vorgang abgebrochen')); };
    });
  }

  function toBlob(record) {
    if (record.blob instanceof Blob) return record.blob;
    if (record.buffer) return new Blob([record.buffer], { type: record.type || '' });
    return null;
  }

  function loadAll() {
    return transact('readonly', function (store) { return store.getAll(); }).then(function (records) {
      (records || []).forEach(function (record) {
        var blob = toBlob(record);
        if (!record.id || !blob) return;
        entries[record.id] = {
          id: record.id, name: record.name || '', type: record.type || blob.type || '',
          size: blob.size, addedAt: record.addedAt || '', blob: blob, stored: true
        };
      });
    });
  }

  /** Öffnet die Ablage. Mehrfach aufrufbar; liefert immer dasselbe Versprechen. */
  function init() {
    if (readyPromise) return readyPromise;
    readyPromise = openDatabase().then(function (database) {
      db = database;
      return db ? loadAll() : null;
    }).catch(function (err) {
      console.warn('Die Medienablage ließ sich nicht lesen:', err);
      db = null;
    }).then(function () {
      ready = true;
      emit('ready');
    });
    return readyPromise;
  }

  function writeRecord(entry) {
    if (!db) return Promise.resolve(false);
    var base = { id: entry.id, name: entry.name, type: entry.type, size: entry.size, addedAt: entry.addedAt };

    function putBuffer() {
      return readAsArrayBuffer(entry.blob).then(function (buffer) {
        return transact('readwrite', function (store) { return store.put(Object.assign({ buffer: buffer }, base)); });
      });
    }

    var attempt = storeBlobs
      ? transact('readwrite', function (store) { return store.put(Object.assign({ blob: entry.blob }, base)); })
        .catch(function (err) {
          // Ältere Browser legen in der IndexedDB keine Blobs ab – dann als Rohdaten.
          if (err && (err.name === 'QuotaExceededError')) throw err;
          storeBlobs = false;
          return putBuffer();
        })
      : putBuffer();

    return attempt.then(function () { return true; }, function (err) {
      console.warn('Datei konnte nicht dauerhaft gespeichert werden:', err);
      return false;
    });
  }

  /* --- Lesen und Schreiben --------------------------------------------------- */

  function readAsArrayBuffer(blob) {
    if (blob.arrayBuffer) return blob.arrayBuffer();
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsArrayBuffer(blob);
    });
  }

  function publicInfo(entry) {
    return entry ? {
      id: entry.id, name: entry.name, type: entry.type, size: entry.size,
      addedAt: entry.addedAt, stored: entry.stored
    } : null;
  }

  /**
   * Legt eine Datei ab.
   * @returns {Promise<{id, name, type, size, stored}>} stored = false heißt:
   *          nur für diese Sitzung (keine IndexedDB oder kein Platz).
   */
  function add(blob, meta) {
    meta = meta || {};
    var entry = {
      id: meta.id || util.uid('med'),
      name: String(meta.name || blob.name || 'Datei').slice(0, 200),
      type: meta.type || blob.type || '',
      size: blob.size,
      addedAt: util.nowISO(),
      blob: blob,
      stored: false
    };
    return init().then(function () {
      entries[entry.id] = entry;
      return writeRecord(entry);
    }).then(function (stored) {
      entry.stored = stored;
      emit('add');
      return publicInfo(entry);
    });
  }

  function remove(id) {
    if (!entries[id]) return Promise.resolve();
    delete entries[id];
    if (urls[id]) { try { URL.revokeObjectURL(urls[id]); } catch (err) { /* egal */ } delete urls[id]; }
    emit('remove');
    if (!db) return Promise.resolve();
    return transact('readwrite', function (store) { return store.delete(id); })
      .catch(function (err) { console.warn('Datei konnte nicht entfernt werden:', err); });
  }

  function has(id) { return !!(id && entries[id]); }
  function info(id) { return publicInfo(entries[id]); }
  function blobOf(id) { return entries[id] ? entries[id].blob : null; }

  /** Adresse zum Abspielen oder Anzeigen; leer, wenn die Datei fehlt. */
  function url(id) {
    if (!id || !entries[id]) return '';
    if (!urls[id]) urls[id] = URL.createObjectURL(entries[id].blob);
    return urls[id];
  }

  function usage() {
    var count = 0;
    var bytes = 0;
    Object.keys(entries).forEach(function (id) { count += 1; bytes += entries[id].size || 0; });
    return { count: count, bytes: bytes };
  }

  /**
   * Entfernt Dateien, auf die nichts mehr verweist. Läuft nur beim Start:
   * Innerhalb einer Sitzung kann „Rückgängig“ eine Zuweisung zurückholen.
   */
  function sweep(keepIds) {
    var keep = Object.create(null);
    (keepIds || []).forEach(function (id) { keep[id] = true; });
    var stale = Object.keys(entries).filter(function (id) { return !keep[id]; });
    return Promise.all(stale.map(remove)).then(function () { return stale.length; });
  }

  /* --- Sicherungsdatei --------------------------------------------------------- */

  function readAsBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var result = String(reader.result || '');
        resolve(result.slice(result.indexOf(',') + 1));
      };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsDataURL(blob);
    });
  }

  /** Base64 stückweise zurückwandeln – ohne die ganze Datei doppelt im Speicher. */
  function blobFromBase64(data, type) {
    var clean = String(data || '').replace(/[^A-Za-z0-9+/=]/g, '');
    var CHUNK = 4 * 65536;                 // Vielfaches von 4: jedes Stück ist für sich gültig
    var parts = [];
    for (var offset = 0; offset < clean.length; offset += CHUNK) {
      var binary = window.atob(clean.slice(offset, offset + CHUNK));
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      parts.push(bytes);
    }
    return new Blob(parts, { type: type || '' });
  }

  /**
   * Wählt aus, welche Dateien in die Sicherungsdatei passen: kleine zuerst,
   * bis die Obergrenze erreicht ist.
   * @returns {{included: object[], skipped: object[], missing: string[]}}
   */
  function planExport(ids) {
    var missing = [];
    var known = [];
    (ids || []).forEach(function (id) {
      if (entries[id]) known.push(entries[id]); else missing.push(id);
    });
    known.sort(function (a, b) { return a.size - b.size; });
    var included = [];
    var skipped = [];
    var total = 0;
    known.forEach(function (entry) {
      if (total + entry.size <= MAX_BACKUP_BYTES) { included.push(publicInfo(entry)); total += entry.size; }
      else skipped.push(publicInfo(entry));
    });
    return { included: included, skipped: skipped, missing: missing, bytes: total };
  }

  /** Eine Datei als Eintrag der Sicherungsdatei: { id, name, type, size, data }. */
  function exportEntry(id) {
    var entry = entries[id];
    if (!entry) return Promise.resolve(null);
    return readAsBase64(entry.blob).then(function (data) {
      return { id: entry.id, name: entry.name, type: entry.type, size: entry.size, data: data };
    });
  }

  /**
   * Übernimmt Dateien aus einer Sicherungsdatei. Schon vorhandene Kennungen
   * bleiben unberührt – dieselbe Kennung bedeutet dieselbe Datei.
   * @returns {Promise<{added: number, failed: number}>}
   */
  function importEntries(list, onlyIds) {
    var wanted = null;
    if (onlyIds) {
      wanted = Object.create(null);
      onlyIds.forEach(function (id) { wanted[id] = true; });
    }
    var report = { added: 0, failed: 0 };
    var chain = init();
    (Array.isArray(list) ? list : []).forEach(function (item) {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || typeof item.data !== 'string') return;
      if (wanted && !wanted[item.id]) return;
      chain = chain.then(function () {
        if (entries[item.id]) return null;
        var blob;
        try { blob = blobFromBase64(item.data, typeof item.type === 'string' ? item.type : ''); }
        catch (err) { report.failed += 1; return null; }
        if (!blob.size) { report.failed += 1; return null; }
        return add(blob, { id: item.id, name: item.name, type: blob.type }).then(function () { report.added += 1; });
      });
    });
    return chain.then(function () { return report; });
  }

  /* --- Bilder verkleinern -------------------------------------------------------
     Ein Symbol der Leiste ist auf der Leinwand selten größer als 150 Pixel.
     Ein Handyfoto mit 12 Megapixeln wäre verschwendeter Platz. */

  function loadImage(blob) {
    return new Promise(function (resolve, reject) {
      var source = URL.createObjectURL(blob);
      var image = new Image();
      image.onload = function () { resolve({ image: image, release: function () { URL.revokeObjectURL(source); } }); };
      image.onerror = function () { URL.revokeObjectURL(source); reject(new Error('Bild nicht lesbar')); };
      image.src = source;
    });
  }

  /** @returns {Promise<Blob>} höchstens 512 Pixel Kantenlänge; SVG bleibt Vektor. */
  function prepareImage(file) {
    var isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name || '');
    // Ohne Typangabe zeigte der Browser eine SVG-Datei nicht als Bild an.
    var source = isSvg && file.type !== 'image/svg+xml' ? new Blob([file], { type: 'image/svg+xml' }) : file;
    return loadImage(source).then(function (loaded) {
      var image = loaded.image;
      var width = image.naturalWidth;
      var height = image.naturalHeight;
      if (isSvg) { loaded.release(); return source; }
      if (!width || !height) { loaded.release(); throw new Error('Bild ohne Größe'); }
      var scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(width, height));
      if (scale >= 1 && file.size <= 400 * 1024) { loaded.release(); return file; }
      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      loaded.release();
      return new Promise(function (resolve, reject) {
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob); else reject(new Error('Bild konnte nicht umgerechnet werden'));
        }, 'image/png');
      });
    });
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0).replace('.', ',') + ' MB';
  }

  BAO.media = {
    MAX_FILE_BYTES: MAX_FILE_BYTES,
    MAX_BACKUP_BYTES: MAX_BACKUP_BYTES,
    init: init,
    isReady: function () { return ready; },
    /** false: Dateien bleiben nur für diese Sitzung erhalten. */
    isPersistent: function () { return !!db; },
    subscribe: subscribe,
    add: add,
    remove: remove,
    has: has,
    info: info,
    blob: blobOf,
    url: url,
    usage: usage,
    sweep: sweep,
    planExport: planExport,
    exportEntry: exportEntry,
    importEntries: importEntries,
    blobFromBase64: blobFromBase64,
    prepareImage: prepareImage,
    formatBytes: formatBytes
  };
})(window.BAO = window.BAO || {});
