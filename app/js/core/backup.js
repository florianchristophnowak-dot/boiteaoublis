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
      boards: (state.boards || []).length
    };
  }

  var COUNT_LABELS = {
    subjects: 'Fächer', groups: 'Lerngruppen', units: 'Unterrichtsreihen',
    lexemes: 'Wortschatzeinträge', starters: 'Satzanfänge', banks: 'Wortbanken',
    boards: 'Tafeln'
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

  function exportToFile(state) {
    var payload = buildExport(state);
    util.downloadText(suggestFilename(state), JSON.stringify(payload, null, 2), 'application/json');
    return payload;
  }

  /**
   * Liest und prüft eine Sicherungsdatei.
   * @returns {{ok:boolean, errors:string[], warnings:string[], incoming:object|null, meta:object}}
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

    if (parsed && parsed.kind === schema.EXPORT_KIND && parsed.data) {
      payload = parsed.data;
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
    return { ok: true, errors: [], warnings: checked.warnings, incoming: checked.state, meta: meta };
  }

  /* --- Zusammenführen ------------------------------------------------------ */

  var MERGE_COLLECTIONS = ['subjects', 'groups', 'units', 'lexemes', 'starters', 'banks', 'boards', 'functions'];

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
   *  - Einstellungen bleiben lokal erhalten
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
    suggestFilename: suggestFilename,
    analyse: analyse,
    merge: merge,
    counts: counts,
    COUNT_LABELS: COUNT_LABELS,
    summariseReport: summariseReport
  };
})(window.BAO = window.BAO || {});
