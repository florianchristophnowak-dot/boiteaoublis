/* ==========================================================================
   Sicherung: Export, Prüfung, Wiederherstellen und Zusammenführen
   Grundsatz: Ein Import darf niemals unbemerkt etwas zerstören. Vor jedem
   Schreibvorgang wird der bisherige Bestand als Sicherungskopie abgelegt und
   in den Rückgängig-Verlauf gestellt.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;
  var schema = BAO.schema;

  function counts(state) {
    return {
      subjects: (state.subjects || []).length,
      groups: (state.groups || []).length,
      units: (state.units || []).length,
      lexemes: (state.lexemes || []).length,
      starters: (state.starters || []).length,
      banks: (state.banks || []).length,
      boards: (state.boards || []).length,
      whiteboards: (state.whiteboards || []).length,
      presets: (state.presets || []).length
    };
  }

  var COUNT_LABELS = {
    subjects: 'Fächer', groups: 'Lerngruppen', units: 'Unterrichtsreihen',
    lexemes: 'Wortschatzeinträge', starters: 'Satzanfänge', banks: 'Wortbanken',
    boards: 'Tafeln', whiteboards: 'Whiteboards', presets: 'Phasen-Presets'
  };

  function buildExport(state) {
    return {
      kind: schema.EXPORT_KIND,
      appVersion: schema.APP_VERSION,
      schemaVersion: state.schemaVersion,
      exportedAt: util.nowISO(),
      counts: counts(state),
      data: util.clone(state)
    };
  }

  function suggestFilename(state) {
    var d = new Date();
    var stamp = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    var time = String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
    return 'boite-a-oublis_' + stamp + '_' + time + '.json';
  }

  /**
   * Erstellt die Sicherungsdatei und übergibt sie dem Browser zum Speichern.
   *
   * Die Klang- und Bilddateien des Soundboards reisen mit: Sie liegen nicht
   * im Bestand, sondern in der Medienablage, und stehen in der Datei als
   * eigener Abschnitt „media“ neben „data“. Ohne solche Dateien entsteht die
   * Datei sofort – mit ihnen erst, nachdem sie gelesen sind.
   *
   * @returns {object} der Inhalt der Datei (ohne die Mediendaten). payload.done
   *   ist ein Versprechen, das sich erfüllt, sobald die Datei übergeben ist:
   *   { files, bytes, skipped: [Namen zu großer Dateien] }.
   */
  function exportToFile(state) {
    var payload = buildExport(state);
    // Die Datei trägt ihren Zeitpunkt in sich: Wer sie später
    // wiederherstellt, sieht einen Bestand, der genau so gesichert ist.
    payload.data.meta = Object.assign({}, payload.data.meta, {
      lastBackupAt: payload.exportedAt, unsavedSince: ''
    });
    var filename = suggestFilename(state);
    var current = !!BAO.store && BAO.store.getState() === state;
    var plan = BAO.media ? BAO.media.planExport(BAO.classroomModel.mediaIds(state)) : { included: [], skipped: [], bytes: 0 };
    var summary = {
      files: plan.included.length, bytes: plan.bytes,
      skipped: plan.skipped.map(function (entry) { return entry.name; })
    };
    var done;

    if (!plan.included.length) {
      util.downloadText(filename, JSON.stringify(payload, null, 2), 'application/json');
      if (current) markBackedUp(payload.exportedAt);
      done = Promise.resolve(summary);
    } else {
      // Stück für Stück zusammensetzen: Eine einzige Zeichenkette mit allen
      // Dateien wäre für den Browser unnötig schwer.
      var head = JSON.stringify(payload, null, 2);
      var parts = [head.slice(0, head.lastIndexOf('}')).replace(/\s+$/, '') + ',\n  "media": [\n'];
      done = plan.included.reduce(function (chain, entry, index) {
        return chain.then(function () { return BAO.media.exportEntry(entry.id); }).then(function (item) {
          if (item) parts.push((index ? ',\n' : '') + '    ' + JSON.stringify(item));
        });
      }, Promise.resolve()).then(function () {
        parts.push('\n  ]\n}\n');
        util.downloadBlob(filename, new Blob(parts, { type: 'application/json;charset=utf-8' }));
        if (current && BAO.store.getState().meta) markBackedUp(payload.exportedAt);
        return summary;
      });
    }
    // Nicht aufzählbar: gehört nicht in die Datei.
    Object.defineProperty(payload, 'done', { value: done, enumerable: false });
    return payload;
  }

  /* --- Stand der Sicherung ---------------------------------------------------
     Alles liegt nur im Browser dieses Rechners. Eine Sicherungsdatei ist der
     einzige Schutz vor einem geleerten Browserspeicher – und der Weg auf einen
     anderen Rechner. Deshalb merkt sich der Bestand, wann zuletzt exportiert
     wurde und seit wann es ungesicherte Änderungen gibt. */

  var DAY = 24 * 60 * 60 * 1000;
  var REMIND_AFTER_DAYS = 7;

  function markBackedUp(at) {
    BAO.store.commit('Sicherung erstellt', function (draft) {
      draft.meta.lastBackupAt = at || util.nowISO();
      draft.meta.unsavedSince = '';
    }, { undoable: false });
  }

  /**
   * @returns {{last: string, never: boolean, dirty: boolean, ageDays: number|null,
   *            unsavedDays: number, due: boolean}}
   * due = es gibt seit mindestens einer Woche Änderungen ohne Sicherungsdatei.
   */
  function status(state, now) {
    var meta = (state && state.meta) || {};
    var nowMs = now ? new Date(now).getTime() : Date.now();
    var last = meta.lastBackupAt || '';
    var since = meta.unsavedSince || '';
    function daysSince(iso) {
      var t = new Date(iso).getTime();
      return isNaN(t) ? 0 : Math.max(0, Math.floor((nowMs - t) / DAY));
    }
    var unsavedDays = since ? daysSince(since) : 0;
    return {
      last: last,
      never: !last,
      dirty: !!since,
      ageDays: last ? daysSince(last) : null,
      unsavedDays: unsavedDays,
      due: !!since && unsavedDays >= REMIND_AFTER_DAYS
    };
  }

  /** Kurze Auskunft für Fußzeile und Datenansicht. */
  function statusLabel(info) {
    if (info.never) return info.dirty ? 'Noch keine Sicherungsdatei' : 'Noch nichts zu sichern';
    var when = util.relativeDate(info.last);
    return info.dirty ? 'Letzte Sicherungsdatei: ' + when : 'Sicherungsdatei: ' + when;
  }

  /**
   * Liest und prüft eine Sicherungsdatei.
   * @returns {{ok:boolean, errors:string[], warnings:string[], incoming:object|null, meta:object, media:object[]}}
   *          media = die mitgesicherten Klang- und Bilddateien des Soundboards
   */
  function analyse(text, currentState) {
    var parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      return { ok: false, errors: ['Die Datei ist keine gültige JSON-Datei. (' + err.message + ')'], warnings: [], incoming: null, meta: {} };
    }

    var payload = parsed;
    var meta = {};
    var media = [];

    if (parsed && parsed.kind === schema.EXPORT_KIND && parsed.data) {
      payload = parsed.data;
      if (Array.isArray(parsed.media)) media = parsed.media;
      meta = {
        exportedAt: parsed.exportedAt || '',
        appVersion: parsed.appVersion || '',
        schemaVersion: parsed.schemaVersion
      };
    } else if (parsed && parsed.schemaVersion !== undefined && parsed.lexemes !== undefined) {
      meta = { exportedAt: (parsed.meta && parsed.meta.updatedAt) || '', appVersion: (parsed.meta && parsed.meta.appVersion) || '' };
    } else {
      return {
        ok: false,
        errors: ['Die Datei stammt nicht aus Boîte à Oublis (Kennzeichen „' + schema.EXPORT_KIND + '“ fehlt).'],
        warnings: [], incoming: null, meta: {}
      };
    }

    var migrated;
    try {
      migrated = BAO.migrations.migrate(util.clone(payload));
    } catch (err) {
      return { ok: false, errors: [err.message], warnings: [], incoming: null, meta: meta };
    }
    if (migrated.error) {
      return { ok: false, errors: [migrated.error], warnings: [], incoming: null, meta: meta };
    }

    var checked = schema.validateState(migrated.state);
    if (!checked.ok) {
      return { ok: false, errors: checked.errors, warnings: checked.warnings, incoming: null, meta: meta };
    }

    meta.migrations = migrated.applied;
    meta.counts = counts(checked.state);
    meta.currentCounts = counts(currentState);
    return { ok: true, errors: [], warnings: checked.warnings, incoming: checked.state, meta: meta, media: media };
  }

  /**
   * Übernimmt aus einer eingelesenen Sicherung die Dateien, die der neue
   * Bestand braucht – nicht mehr. Was schon in der Medienablage liegt, bleibt.
   * @returns {Promise<{added: number, failed: number}>}
   */
  function restoreMedia(media, state) {
    if (!BAO.media || !media || !media.length) return Promise.resolve({ added: 0, failed: 0 });
    return BAO.media.importEntries(media, BAO.classroomModel.mediaIds(state));
  }

  /* --- Zusammenführen ------------------------------------------------------ */

  var MERGE_COLLECTIONS = ['subjects', 'groups', 'units', 'lexemes', 'starters', 'banks', 'boards', 'whiteboards', 'presets', 'functions'];

  function newerThan(a, b) {
    var ta = (a && (a.updatedAt || a.createdAt)) || '';
    var tb = (b && (b.updatedAt || b.createdAt)) || '';
    return ta > tb;
  }

  /**
   * Fügt den eingelesenen Bestand in den vorhandenen ein.
   * Regeln:
   *  - unbekannte Kennung  -> wird hinzugefügt
   *  - bekannte Kennung    -> der jüngere Datensatz gewinnt
   *  - Einstellungen bleiben lokal erhalten – auch die des Soundboards
   *    (Klangtasten, Symbole, Leiste); nur seine Phasen-Presets kommen hinzu
   */
  function merge(currentState, incoming) {
    var result = util.clone(currentState);
    var report = { added: {}, updated: {}, kept: {} };

    MERGE_COLLECTIONS.forEach(function (name) {
      var index = new Map();
      (result[name] || []).forEach(function (item, i) { index.set(item.id, i); });
      report.added[name] = 0;
      report.updated[name] = 0;
      report.kept[name] = 0;

      (incoming[name] || []).forEach(function (item) {
        if (!index.has(item.id)) {
          result[name].push(util.clone(item));
          index.set(item.id, result[name].length - 1);
          report.added[name] += 1;
          return;
        }
        var position = index.get(item.id);
        var existing = result[name][position];
        if (newerThan(item, existing)) {
          result[name][position] = util.clone(item);
          report.updated[name] += 1;
        } else {
          report.kept[name] += 1;
        }
      });
    });

    // Verwaiste Wortbank-Positionen nach dem Zusammenführen bereinigen.
    var checked = schema.validateState(result);
    report.warnings = checked.warnings;
    return { state: checked.state, report: report };
  }

  function summariseReport(report) {
    var lines = [];
    MERGE_COLLECTIONS.forEach(function (name) {
      if (name === 'functions') return;
      var added = report.added[name] || 0;
      var updated = report.updated[name] || 0;
      if (!added && !updated) return;
      lines.push((COUNT_LABELS[name] || name) + ': ' + added + ' neu, ' + updated + ' aktualisiert');
    });
    return lines;
  }

  BAO.backup = {
    buildExport: buildExport,
    exportToFile: exportToFile,
    markBackedUp: markBackedUp,
    status: status,
    statusLabel: statusLabel,
    REMIND_AFTER_DAYS: REMIND_AFTER_DAYS,
    suggestFilename: suggestFilename,
    analyse: analyse,
    restoreMedia: restoreMedia,
    merge: merge,
    counts: counts,
    COUNT_LABELS: COUNT_LABELS,
    summariseReport: summariseReport
  };
})(window.BAO = window.BAO || {});
