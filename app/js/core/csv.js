/* ==========================================================================
   CSV-Import und -Export für Wortschatzlisten
   Bewusst tolerant: erkennt Trennzeichen selbst, akzeptiert Anführungszeichen
   und ordnet gängige Spaltennamen automatisch zu. Die Zuordnung bleibt aber
   sichtbar und veränderbar.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;

  /** Erkennt das wahrscheinlichste Trennzeichen der ersten Zeilen. */
  function detectDelimiter(text) {
    var sample = text.split(/\r?\n/).slice(0, 5).join('\n');
    var candidates = [';', ',', '\t', '|'];
    var best = ';';
    var bestCount = 0;
    candidates.forEach(function (d) {
      var count = sample.split(d).length - 1;
      if (count > bestCount) { bestCount = count; best = d; }
    });
    return bestCount === 0 ? ';' : best;
  }

  /** Vollständiger CSV-Parser (Anführungszeichen, eingebettete Zeilenumbrüche). */
  function parse(text, delimiter) {
    var d = delimiter || detectDelimiter(text);
    var rows = [];
    var row = [];
    var value = '';
    var inQuotes = false;
    var i = 0;

    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);   // BOM entfernen

    while (i < text.length) {
      var ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { value += '"'; i += 2; continue; }
          inQuotes = false; i += 1; continue;
        }
        value += ch; i += 1; continue;
      }
      if (ch === '"' && value === '') { inQuotes = true; i += 1; continue; }
      if (ch === d) { row.push(value); value = ''; i += 1; continue; }
      if (ch === '\r') { i += 1; continue; }
      if (ch === '\n') { row.push(value); rows.push(row); row = []; value = ''; i += 1; continue; }
      value += ch; i += 1;
    }
    row.push(value);
    rows.push(row);

    rows = rows.filter(function (r) {
      return r.some(function (cell) { return String(cell).trim() !== ''; });
    }).map(function (r) {
      return r.map(function (cell) { return String(cell).trim(); });
    });

    return { delimiter: d, rows: rows };
  }

  /* --- Spaltenzuordnung ---------------------------------------------------- */

  var ALIASES = {
    term:          ['zielwort', 'wort', 'vokabel', 'begriff', 'ausdruck', 'term', 'word', 'expression', 'fremdsprache'],
    article:       ['artikel', 'article', 'genus'],
    gram:          ['form', 'formhinweis', 'grammatik', 'plural', 'grammar'],
    collocation:   ['wortverbindung', 'kollokation', 'collocation', 'verbindung'],
    chunk:         ['chunk', 'baustein', 'wendung'],
    explanation:   ['erklaerung', 'erklärung', 'definition', 'explanation', 'umschreibung'],
    translation:   ['deutsch', 'uebersetzung', 'übersetzung', 'translation', 'german', 'bedeutung'],
    example:       ['beispiel', 'beispielsatz', 'example', 'satz'],
    pronunciation: ['aussprache', 'lautschrift', 'pronunciation', 'ipa', 'betonung'],
    topics:        ['thema', 'themen', 'topic', 'topics', 'wortfeld'],
    tags:          ['tag', 'tags', 'schlagwort', 'schlagwoerter', 'schlagwörter'],
    cefr:          ['niveau', 'level', 'cefr', 'ger'],
    status:        ['status', 'zustand']
  };

  var FIELD_LABELS = {
    term: 'Zielwort', article: 'Artikel', gram: 'Formhinweis', collocation: 'Wortverbindung',
    chunk: 'Chunk', explanation: 'Erklärung', translation: 'Deutsch', example: 'Beispielsatz',
    pronunciation: 'Aussprache', topics: 'Themen', tags: 'Tags', cefr: 'Niveau', status: 'Status'
  };

  /** Ordnet Kopfzeilen automatisch Feldern zu. Rückgabe: { feld: spaltenindex } */
  function guessMapping(header) {
    var mapping = {};
    header.forEach(function (name, index) {
      var folded = util.fold(name).replace(/[^a-z0-9äöüß]/g, '');
      Object.keys(ALIASES).forEach(function (field) {
        if (mapping[field] !== undefined) return;
        var hit = ALIASES[field].some(function (alias) {
          var a = util.fold(alias).replace(/[^a-z0-9äöüß]/g, '');
          return a === folded || (folded.length > 3 && folded.indexOf(a) === 0);
        });
        if (hit) mapping[field] = index;
      });
    });
    return mapping;
  }

  /** Sieht die erste Zeile nach Spaltenüberschriften aus? */
  function looksLikeHeader(row) {
    var mapping = guessMapping(row);
    return Object.keys(mapping).length >= 2;
  }

  var VALID_STATUS = ['new', 'active', 'revisit', 'core', 'archived'];
  var STATUS_ALIASES = {
    neu: 'new', new: 'new', aktiv: 'active', active: 'active',
    auffrischen: 'revisit', wiederaufgreifen: 'revisit', revisit: 'revisit',
    grundbestand: 'core', gesichert: 'core', core: 'core',
    archiviert: 'archived', archived: 'archived'
  };

  function normaliseStatus(value, fallback) {
    if (!value) return fallback;
    var key = util.fold(value).replace(/[^a-z]/g, '');
    return STATUS_ALIASES[key] || (VALID_STATUS.indexOf(value) >= 0 ? value : fallback);
  }

  function splitList(value) {
    if (!value) return [];
    return value.split(/[;,/]/).map(function (t) { return t.trim(); }).filter(Boolean);
  }

  /**
   * Wandelt Datenzeilen in Wortschatzeinträge um.
   * @returns {{entries: object[], skipped: number, duplicates: object[]}}
   */
  function toLexemes(rows, mapping, defaults, existing) {
    var entries = [];
    var duplicates = [];
    var skipped = 0;
    var known = new Map();
    (existing || []).forEach(function (l) { known.set(util.fold(l.term), l); });

    rows.forEach(function (row) {
      function cell(field) {
        var index = mapping[field];
        if (index === undefined || index === null) return '';
        return (row[index] || '').trim();
      }
      var term = cell('term');
      if (!term) { skipped += 1; return; }

      var entry = BAO.schema.makeLexeme({
        subjectId: defaults.subjectId,
        groupId: defaults.groupId,
        term: term,
        article: cell('article'),
        gram: cell('gram'),
        collocation: cell('collocation'),
        chunk: cell('chunk'),
        explanation: cell('explanation'),
        translation: cell('translation'),
        example: cell('example'),
        pronunciation: cell('pronunciation'),
        topics: splitList(cell('topics')),
        tags: splitList(cell('tags')),
        cefr: cell('cefr'),
        status: normaliseStatus(cell('status'), defaults.status || 'new'),
        introducedUnitId: defaults.unitId || '',
        introducedSchoolYear: defaults.schoolYear || ''
      });

      var clash = known.get(util.fold(term));
      if (clash) duplicates.push({ entry: entry, existing: clash });
      entries.push(entry);
    });

    return { entries: entries, skipped: skipped, duplicates: duplicates };
  }

  /* --- Export --------------------------------------------------------------- */

  var EXPORT_FIELDS = ['term', 'article', 'gram', 'collocation', 'chunk', 'explanation',
    'translation', 'example', 'pronunciation', 'topics', 'tags', 'cefr', 'status'];

  function escapeCell(value) {
    var text = value === null || value === undefined ? '' : String(value);
    if (/["\n;]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  function lexemesToCsv(lexemes) {
    var lines = [EXPORT_FIELDS.map(function (f) { return FIELD_LABELS[f]; }).join(';')];
    lexemes.forEach(function (lex) {
      lines.push(EXPORT_FIELDS.map(function (field) {
        var value = lex[field];
        if (Array.isArray(value)) value = value.join(', ');
        return escapeCell(value);
      }).join(';'));
    });
    return lines.join('\r\n');
  }

  /* --- Schnelleingabe mehrerer Zeilen -------------------------------------- */

  /**
   * Zerlegt eingefügte Zeilen der Form
   *   "le stage = das Praktikum"  |  "le stage - das Praktikum"
   *   "le stage;das Praktikum;faire un stage"
   * in Zielwort, Übersetzung und (optional) Wortverbindung.
   */
  function parseQuickLines(text) {
    var out = [];
    String(text).split(/\r?\n/).forEach(function (line) {
      var trimmed = line.trim();
      if (!trimmed) return;
      var parts;
      if (trimmed.indexOf('\t') >= 0) parts = trimmed.split('\t');
      else if (trimmed.indexOf(';') >= 0) parts = trimmed.split(';');
      else if (trimmed.indexOf(' = ') >= 0) parts = trimmed.split(' = ');
      else if (trimmed.indexOf(' – ') >= 0) parts = trimmed.split(' – ');
      else if (trimmed.indexOf(' — ') >= 0) parts = trimmed.split(' — ');
      else if (trimmed.indexOf(' - ') >= 0) parts = trimmed.split(' - ');
      else parts = [trimmed];
      parts = parts.map(function (p) { return p.trim(); });
      if (!parts[0]) return;
      out.push({ term: parts[0], translation: parts[1] || '', collocation: parts[2] || '' });
    });
    return out;
  }

  BAO.csv = {
    detectDelimiter: detectDelimiter,
    parse: parse,
    guessMapping: guessMapping,
    looksLikeHeader: looksLikeHeader,
    toLexemes: toLexemes,
    lexemesToCsv: lexemesToCsv,
    parseQuickLines: parseQuickLines,
    FIELD_LABELS: FIELD_LABELS,
    EXPORT_FIELDS: EXPORT_FIELDS
  };
})(window.BAO = window.BAO || {});
