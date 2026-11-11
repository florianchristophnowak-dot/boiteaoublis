/* ==========================================================================
   Bestandspflege
   Alles, was mehrere Ansichten über den Bestand wissen müssen und was über
   eine reine Abfrage hinausgeht:

   - Einträge am Text wiedererkennen (damit beim Tippen keine Dubletten
     entstehen),
   - Lerngruppen und Fächer vollständig entfernen – mitsamt Tafeln und
     Whiteboards,
   - Tafeln, Whiteboards und Wortbanken für eine andere Lerngruppe kopieren
     (die Parallelklasse),
   - Einträge auf eine Tafel legen,
   - Wortlisten für Druck und Zwischenablage zusammenstellen.

   Die verändernden Funktionen erwarten den Entwurf eines commit-Mutators.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;
  var schema = BAO.schema;
  var select = BAO.select;

  /* --- Wiedererkennen --------------------------------------------------------- */

  /**
   * Vergleichsform eines Textes: Apostrophe und Leerraum vereinheitlicht,
   * Leerstellen in jeder Schreibweise gleich. Groß- und Kleinschreibung sowie
   * Akzente bleiben bedeutsam – „ou“ ist nicht „où“.
   */
  function normalize(text) {
    return String(text == null ? '' : text)
      .replace(/[‘’']/g, "'")
      .replace(/(_{2,}|\.{3,}|…)/g, '___')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** So, wie der Eintrag geschrieben dasteht: „le stage“, „l’entreprise“. */
  function labelOf(lex) { return BAO.ui.termLabel(lex); }

  /**
   * Sucht im Bestand einer Lerngruppe den Eintrag, der genau so geschrieben
   * wird. Die vollständige Form mit Artikel hat Vorrang vor dem bloßen
   * Zielwort.
   */
  function findLexeme(state, groupId, text, exceptId) {
    var needle = normalize(text);
    if (!needle || !groupId) return null;
    var byTerm = null;
    var list = select.lexemesOfGroup(state, groupId);
    for (var i = 0; i < list.length; i++) {
      var lex = list[i];
      if (lex.id === exceptId) continue;
      if (normalize(labelOf(lex)) === needle) return lex;
      if (!byTerm && normalize(lex.term) === needle) byTerm = lex;
    }
    return byTerm;
  }

  /** Dasselbe für Satzanfänge der Lerngruppe (einschließlich der fachweiten). */
  function findStarter(state, groupId, subjectId, text, exceptId) {
    var needle = normalize(text);
    if (!needle) return null;
    var list = select.startersOfGroup(state, groupId, subjectId);
    for (var i = 0; i < list.length; i++) {
      if (list[i].id !== exceptId && normalize(list[i].text) === needle) return list[i];
    }
    return null;
  }

  /**
   * Was steht zu einem getippten Text schon im Bestand?
   * @returns {{kind: 'lex'|'starter', ref: object}|null}
   */
  function findEntry(state, groupId, subjectId, text) {
    var lex = findLexeme(state, groupId, text);
    if (lex) return { kind: 'lex', ref: lex };
    var starter = findStarter(state, groupId, subjectId, text);
    return starter ? { kind: 'starter', ref: starter } : null;
  }

  /* --- Lerngruppen und Fächer entfernen ---------------------------------------- */

  function idMap(ids) {
    var map = Object.create(null);
    (ids || []).forEach(function (id) { map[id] = true; });
    return map;
  }

  /** Was hängt an diesen Lerngruppen? Für die Rückfrage vor dem Löschen. */
  function contentOfGroups(state, groupIds) {
    var gone = idMap(groupIds);
    function count(list) { return (list || []).filter(function (item) { return gone[item.groupId]; }).length; }
    return {
      groups: (groupIds || []).length,
      units: count(state.units),
      lexemes: count(state.lexemes),
      starters: count(state.starters),
      banks: count(state.banks),
      boards: count(state.boards),
      whiteboards: count(state.whiteboards)
    };
  }

  /** Dasselbe für ein ganzes Fach – fachweite Satzanfänge zählen mit. */
  function contentOfSubject(state, subjectId) {
    function count(list) { return (list || []).filter(function (item) { return item.subjectId === subjectId; }).length; }
    var groupIds = state.groups.filter(function (g) { return g.subjectId === subjectId; }).map(function (g) { return g.id; });
    var gone = idMap(groupIds);
    return {
      groups: groupIds.length,
      units: state.units.filter(function (u) { return gone[u.groupId]; }).length,
      lexemes: count(state.lexemes),
      starters: count(state.starters),
      banks: count(state.banks),
      boards: count(state.boards),
      whiteboards: count(state.whiteboards)
    };
  }

  /** „12 Wortschatzeinträge, 2 Tafeln und 1 Whiteboard“ – nur was vorhanden ist. */
  function describeContent(counts) {
    var parts = [];
    function add(n, one, many) { if (n) parts.push(n + ' ' + util.plural(n, one, many)); }
    add(counts.lexemes, 'Wortschatzeintrag', 'Wortschatzeinträge');
    add(counts.starters, 'Satzanfang', 'Satzanfänge');
    add(counts.banks, 'Wortbank', 'Wortbanken');
    add(counts.boards, 'Tafel', 'Tafeln');
    add(counts.whiteboards, 'Whiteboard', 'Whiteboards');
    add(counts.units, 'Unterrichtsreihe', 'Unterrichtsreihen');
    if (!parts.length) return '';
    if (parts.length === 1) return parts[0];
    return parts.slice(0, -1).join(', ') + ' und ' + parts[parts.length - 1];
  }

  function cleanRecents(draft) {
    var bankIds = idMap(draft.banks.map(function (b) { return b.id; }));
    var groupIds = idMap(draft.groups.map(function (g) { return g.id; }));
    draft.ui.recentBanks = (draft.ui.recentBanks || []).filter(function (id) { return bankIds[id]; });
    draft.ui.recentGroups = (draft.ui.recentGroups || []).filter(function (id) { return groupIds[id]; });
  }

  /**
   * Entfernt Lerngruppen mit allem, was ihnen gehört: Reihen, Wortschatz,
   * Satzanfänge, Wortbanken – und ebenso Tafeln und Whiteboards, die sonst
   * unsichtbar im Bestand zurückblieben.
   */
  function removeGroups(draft, groupIds) {
    var gone = idMap(groupIds);
    function keep(item) { return !gone[item.groupId]; }
    draft.groups = draft.groups.filter(function (g) { return !gone[g.id]; });
    draft.units = draft.units.filter(keep);
    draft.lexemes = draft.lexemes.filter(keep);
    draft.starters = draft.starters.filter(keep);
    draft.banks = draft.banks.filter(keep);
    draft.boards = (draft.boards || []).filter(keep);
    draft.whiteboards = (draft.whiteboards || []).filter(keep);
    if (gone[draft.ui.groupId]) draft.ui.groupId = '';
    cleanRecents(draft);
  }

  /** Entfernt ein Fach vollständig. */
  function removeSubject(draft, subjectId) {
    var groupIds = draft.groups.filter(function (g) { return g.subjectId === subjectId; })
      .map(function (g) { return g.id; });
    removeGroups(draft, groupIds);
    function keep(item) { return item.subjectId !== subjectId; }
    draft.subjects = draft.subjects.filter(function (s) { return s.id !== subjectId; });
    draft.lexemes = draft.lexemes.filter(keep);
    draft.starters = draft.starters.filter(keep);
    draft.banks = draft.banks.filter(keep);
    draft.boards = (draft.boards || []).filter(keep);
    draft.whiteboards = (draft.whiteboards || []).filter(keep);
    if (draft.ui.subjectId === subjectId) {
      draft.ui.subjectId = draft.subjects[0] ? draft.subjects[0].id : '';
      draft.ui.groupId = '';
    }
    cleanRecents(draft);
  }

  /** Löst die Zuordnung zu einer Unterrichtsreihe – überall, wo sie steht. */
  function detachUnit(draft, unitId) {
    draft.lexemes.forEach(function (l) { if (l.introducedUnitId === unitId) l.introducedUnitId = ''; });
    [draft.banks, draft.boards || [], draft.whiteboards || []].forEach(function (list) {
      list.forEach(function (item) { if (item.unitId === unitId) item.unitId = ''; });
    });
  }

  /* --- Beispieldaten ----------------------------------------------------------- */

  var SAMPLE_GROUPS = ['grp_fr9b', 'grp_en10a'];

  /** Die mitgelieferten Beispiel-Lerngruppen, soweit sie noch im Bestand liegen. */
  function sampleGroups(state) {
    if (!state || !state.meta || !state.meta.seededAt) return [];
    return state.groups.filter(function (g) { return SAMPLE_GROUPS.indexOf(g.id) >= 0; });
  }

  function hasSampleData(state) { return sampleGroups(state).length > 0; }

  /**
   * Entfernt die Beispiel-Lerngruppen mit allem, was ihnen gehört. Die Fächer
   * bleiben – unter ihnen liegen oft schon die eigenen Lerngruppen.
   */
  function removeSampleData(draft) {
    var ids = sampleGroups(draft).map(function (g) { return g.id; });
    removeGroups(draft, ids);
    // Der Arbeitskontext zeigt danach auf etwas Eigenes, falls vorhanden.
    var subject = select.subject(draft, draft.ui.subjectId);
    var own = subject ? select.groupsOfSubject(draft, subject.id) : [];
    if (!own.length) {
      var other = draft.groups.filter(function (g) { return !g.archived; })[0];
      if (other) { draft.ui.subjectId = other.subjectId; draft.ui.groupId = other.id; }
    } else if (!draft.ui.groupId) {
      draft.ui.groupId = own[0].id;
    }
    return ids.length;
  }

  /* --- Für eine andere Lerngruppe kopieren -------------------------------------- */

  /** Lerngruppen, in die sich etwas kopieren lässt: dasselbe Fach, nicht archiviert. */
  function siblingGroups(state, item) {
    return select.groupsOfSubject(state, item.subjectId).filter(function (g) { return g.id !== item.groupId; });
  }

  /**
   * Sucht zu einem Eintrag das Gegenstück in der Ziel-Lerngruppe oder legt es
   * dort an. Fachweite Satzanfänge gelten ohnehin für alle Lerngruppen.
   */
  function counterpart(draft, kind, refId, target, cache, report) {
    var key = kind + ':' + refId;
    if (cache[key] !== undefined) return cache[key];
    var now = util.nowISO();
    var unit = select.currentUnit(draft, target.id);

    if (kind === 'starter') {
      var starter = select.starter(draft, refId);
      if (!starter) return (cache[key] = null);
      if (!starter.groupId && starter.subjectId === target.subjectId) return (cache[key] = starter.id);
      var sameStarter = findStarter(draft, target.id, target.subjectId, starter.text);
      if (sameStarter) { report.reused += 1; return (cache[key] = sameStarter.id); }
      var starterCopy = Object.assign(util.clone(starter), {
        id: util.uid('sta'), subjectId: target.subjectId, groupId: target.id,
        createdAt: now, updatedAt: now
      });
      draft.starters.push(starterCopy);
      report.created += 1;
      return (cache[key] = starterCopy.id);
    }

    var lex = select.lexeme(draft, refId);
    if (!lex) return (cache[key] = null);
    var sameLexeme = findLexeme(draft, target.id, labelOf(lex));
    if (sameLexeme) { report.reused += 1; return (cache[key] = sameLexeme.id); }
    var lexCopy = Object.assign(util.clone(lex), {
      id: util.uid('lex'), subjectId: target.subjectId, groupId: target.id,
      status: 'new', favorite: false,
      introducedUnitId: unit ? unit.id : '', introducedSchoolYear: target.schoolYear || '',
      createdAt: now, updatedAt: now
    });
    draft.lexemes.push(lexCopy);
    report.created += 1;
    return (cache[key] = lexCopy.id);
  }

  function freshCopy(source, target, draft, prefix) {
    var now = util.nowISO();
    var unit = select.currentUnit(draft, target.id);
    return Object.assign(util.clone(source), {
      id: util.uid(prefix), subjectId: target.subjectId, groupId: target.id,
      unitId: unit ? unit.id : '', favorite: false, lastUsedAt: '',
      createdAt: now, updatedAt: now
    });
  }

  function newReport(target) { return { id: '', group: target, created: 0, reused: 0, items: 0 }; }

  /** Kopiert eine Tafel; ihre Elemente verweisen danach auf den Bestand der Zielgruppe. */
  function copyBoardTo(draft, boardId, targetGroupId) {
    var board = select.board(draft, boardId);
    var target = select.group(draft, targetGroupId);
    if (!board || !target) return null;
    var report = newReport(target);
    var cache = {};
    var copy = freshCopy(board, target, draft, 'brd');
    copy.items = (board.items || []).map(function (item) {
      var refId = counterpart(draft, item.kind, item.refId, target, cache, report);
      if (!refId) return null;
      return Object.assign(util.clone(item), { id: util.uid('bit'), refId: refId });
    }).filter(Boolean);
    draft.boards.push(copy);
    report.id = copy.id;
    report.items = copy.items.length;
    return report;
  }

  /** Kopiert eine Wortbank samt Abschnitten. */
  function copyBankTo(draft, bankId, targetGroupId) {
    var bank = select.bank(draft, bankId);
    var target = select.group(draft, targetGroupId);
    if (!bank || !target) return null;
    var report = newReport(target);
    var cache = {};
    var copy = freshCopy(bank, target, draft, 'bnk');
    copy.sections = (bank.sections || []).map(function (section) {
      var sectionCopy = Object.assign(util.clone(section), { id: util.uid('sec') });
      sectionCopy.items = (section.items || []).map(function (item) {
        var refId = counterpart(draft, item.kind, item.refId, target, cache, report);
        if (!refId) return null;
        report.items += 1;
        return Object.assign(util.clone(item), { id: util.uid('itm'), refId: refId });
      }).filter(Boolean);
      return sectionCopy;
    });
    draft.banks.push(copy);
    report.id = copy.id;
    return report;
  }

  /** Kopiert ein Whiteboard – Handschrift hängt an keinem Bestand. */
  function copyWhiteboardTo(draft, whiteboardId, targetGroupId) {
    var board = select.whiteboard(draft, whiteboardId);
    var target = select.group(draft, targetGroupId);
    if (!board || !target) return null;
    var report = newReport(target);
    var copy = freshCopy(board, target, draft, 'wbd');
    copy.strokes = (copy.strokes || []).map(function (stroke) {
      stroke.id = util.uid('stk');
      return stroke;
    });
    draft.whiteboards.push(copy);
    report.id = copy.id;
    report.items = copy.strokes.length;
    return report;
  }

  /* --- Zuletzt verwendet ----------------------------------------------------------- */

  var WORK_LABEL = { board: 'Tafel', whiteboard: 'Whiteboard', bank: 'Wortbank' };
  var WORK_ROUTE = { board: 'tafel/', whiteboard: 'whiteboard/', bank: 'wortbank/' };

  /**
   * Woran zuletzt gearbeitet wurde – Tafeln, Whiteboards und Wortbanken aller
   * Lerngruppen in einer Liste, das Jüngste zuerst. Für Startseite und
   * Schnellsuche: Der Weg in die nächste Stunde beginnt meist dort, wo die
   * letzte aufgehört hat.
   * options.banks === false lässt die Wortbanken aus (einfache Grundform).
   */
  function recentWork(state, limit, options) {
    options = options || {};
    var list = [];
    function collect(type, items) {
      (items || []).forEach(function (item) {
        var group = select.group(state, item.groupId);
        if (!group || group.archived) return;
        var at = item.lastUsedAt || item.updatedAt || item.createdAt || '';
        list.push({
          type: type, id: item.id, item: item, group: group, at: at,
          used: !!item.lastUsedAt,
          label: WORK_LABEL[type], path: WORK_ROUTE[type] + item.id
        });
      });
    }
    collect('board', state.boards);
    collect('whiteboard', state.whiteboards);
    if (options.banks !== false) collect('bank', state.banks);
    // Tatsächlich Verwendetes steht vor bloß Angelegtem.
    list.sort(function (a, b) {
      if (a.used !== b.used) return a.used ? -1 : 1;
      return String(b.at).localeCompare(String(a.at));
    });
    return list.slice(0, limit || 6);
  }

  /* --- Einträge auf eine Tafel legen ---------------------------------------------- */

  /** Die freieste Stelle eines Rasters – mit Abstand zu allem, was schon liegt. */
  function freeSpot(placed) {
    if (!placed.length) return { x: 0.5, y: 0.45 };
    var best = { x: 0.5, y: 0.5 };
    var bestDistance = -1;
    for (var col = 0; col < 6; col++) {
      for (var row = 0; row < 4; row++) {
        var x = 0.14 + col * 0.144;
        var y = 0.16 + row * 0.226;
        var nearest = Infinity;
        for (var i = 0; i < placed.length; i++) {
          var dx = placed[i].x - x;
          var dy = (placed[i].y - y) * 0.6;       // waagerecht ist mehr Platz
          nearest = Math.min(nearest, dx * dx + dy * dy);
        }
        if (nearest > bestDistance) { bestDistance = nearest; best = { x: x, y: y }; }
      }
    }
    return best;
  }

  /**
   * Legt Einträge auf eine Tafel. Was dort schon liegt oder nicht zur
   * Lerngruppe der Tafel gehört, wird ausgelassen.
   * refs: [{ kind: 'lex'|'starter', id }]
   * @returns {{added: number, skipped: number}}
   */
  function placeOnBoard(draft, board, refs) {
    var present = Object.create(null);
    (board.items || []).forEach(function (item) { present[item.kind + ':' + item.refId] = true; });
    var result = { added: 0, skipped: 0 };
    var wasEmpty = !(board.items || []).length;
    var fresh = [];

    (refs || []).forEach(function (ref) {
      var entry = ref.kind === 'starter' ? select.starter(draft, ref.id) : select.lexeme(draft, ref.id);
      if (!entry || present[ref.kind + ':' + ref.id] || !select.belongsToBoard(entry, board)) {
        result.skipped += 1;
        return;
      }
      present[ref.kind + ':' + ref.id] = true;
      var spot = freeSpot(board.items);
      var item = schema.makeBoardItem({ kind: ref.kind, refId: ref.id, x: spot.x, y: spot.y });
      board.items.push(item);
      fresh.push(item);
      result.added += 1;
    });

    // Eine eben erst gefüllte Tafel bekommt ein gleichmäßiges Raster.
    if (wasEmpty && fresh.length > 1) {
      var cols = Math.max(1, Math.min(5, Math.ceil(Math.sqrt(fresh.length * 1.6))));
      var rows = Math.max(1, Math.ceil(fresh.length / cols));
      fresh.forEach(function (item, index) {
        item.x = ((index % cols) + 0.5) / cols;
        item.y = (Math.floor(index / cols) + 0.5) / rows;
      });
    }
    if (result.added) board.updatedAt = util.nowISO();
    return result;
  }

  /* --- Wortlisten ----------------------------------------------------------------- */

  function rowOfLexeme(lex) {
    return {
      kind: 'lex',
      term: labelOf(lex),
      translation: lex.translation || '',
      extra: lex.collocation || lex.chunk || lex.example || '',
      sortKey: util.fold(lex.term)          // ohne Artikel: „le stage“ steht unter S
    };
  }

  function rowOfStarter(starter) {
    return {
      kind: 'starter', term: starter.text || '', translation: starter.translation || '',
      extra: '', sortKey: util.fold(starter.text)
    };
  }

  function rowsOfLexemes(lexemes) { return (lexemes || []).map(rowOfLexeme); }

  /**
   * Die Elemente einer Tafel als Liste – gelesen wie die Fläche selbst:
   * zeilenweise von oben nach unten, innerhalb einer Zeile von links nach
   * rechts. Zwölf Zeilen sind fein genug für jede sinnvolle Anordnung.
   */
  function rowsOfBoard(state, board) {
    function line(entry) { return Math.round(entry.item.y * 12); }
    var seen = Object.create(null);
    return select.boardEntries(state, board).slice().sort(function (a, b) {
      return (line(a) - line(b)) || (a.item.x - b.item.x);
    }).filter(function (entry) {
      // Liegt derselbe Eintrag zweimal auf der Fläche, steht er einmal in der Liste.
      var key = entry.kind + ':' + entry.ref.id;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    }).map(function (entry) {
      return entry.kind === 'starter' ? rowOfStarter(entry.ref) : rowOfLexeme(entry.ref);
    });
  }

  /** Die Abschnitte einer Wortbank als Liste von Listen. */
  function sectionsOfBank(state, bank) {
    return (bank.sections || []).map(function (section) {
      return {
        title: section.title || '',
        rows: (section.items || []).map(function (item) {
          var resolved = select.resolveItem(state, item);
          if (!resolved) return null;
          return resolved.kind === 'starter' ? rowOfStarter(resolved.ref) : rowOfLexeme(resolved.ref);
        }).filter(Boolean)
      };
    }).filter(function (section) { return section.rows.length; });
  }

  /** Reiner Text für die Zwischenablage: eine Zeile je Eintrag, Spalten per Tabulator. */
  function rowsToText(sections) {
    var lines = [];
    (sections || []).forEach(function (section, index) {
      if (section.title && sections.length > 1) {
        if (index) lines.push('');
        lines.push(section.title);
      }
      section.rows.forEach(function (row) {
        lines.push(row.translation ? row.term + '\t' + row.translation : row.term);
      });
    });
    return lines.join('\n');
  }

  BAO.stock = {
    normalize: normalize,
    findLexeme: findLexeme,
    findStarter: findStarter,
    findEntry: findEntry,
    contentOfGroups: contentOfGroups,
    contentOfSubject: contentOfSubject,
    describeContent: describeContent,
    removeGroups: removeGroups,
    removeSubject: removeSubject,
    detachUnit: detachUnit,
    sampleGroups: sampleGroups,
    hasSampleData: hasSampleData,
    removeSampleData: removeSampleData,
    siblingGroups: siblingGroups,
    copyBoardTo: copyBoardTo,
    copyBankTo: copyBankTo,
    copyWhiteboardTo: copyWhiteboardTo,
    recentWork: recentWork,
    freeSpot: freeSpot,
    placeOnBoard: placeOnBoard,
    rowsOfLexemes: rowsOfLexemes,
    rowsOfBoard: rowsOfBoard,
    sectionsOfBank: sectionsOfBank,
    rowsToText: rowsToText
  };
})(window.BAO = window.BAO || {});
