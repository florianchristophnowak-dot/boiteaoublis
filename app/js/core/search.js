/* ==========================================================================
   Suche
   Eine einfache, aber akzentunempfindliche Volltextsuche über den gesamten
   Bestand. Kein Index nötig: bei realistischen Größen (einige Tausend
   Einträge) ist die lineare Suche schnell genug und bleibt nachvollziehbar.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;
  var select = BAO.select;

  function haystackLexeme(lex) {
    return [lex.term, lex.article, lex.translation, lex.collocation, lex.chunk,
      lex.explanation, lex.example, lex.gram, (lex.topics || []).join(' '), (lex.tags || []).join(' ')]
      .join('  ');
  }

  function haystackStarter(sta) {
    return [sta.text, sta.translation, sta.note, (sta.tags || []).join(' ')].join('  ');
  }

  /** Bewertung: Treffer am Wortanfang wiegen schwerer als irgendwo im Text. */
  function score(haystack, needle) {
    var hay = util.fold(haystack);
    var pos = hay.indexOf(needle);
    if (pos < 0) return 0;
    if (pos === 0) return 100;
    var before = hay.charAt(pos - 1);
    if (/[\s'’(\[«-]/.test(before)) return 70;
    return 40;
  }

  function matchesLexeme(lex, needle) { return score(haystackLexeme(lex), needle) > 0; }
  function matchesStarter(sta, needle) { return score(haystackStarter(sta), needle) > 0; }

  /**
   * Globale Suche über Lerngruppen, Wortbanken, Wortschatz und Satzanfänge.
   * Liefert eine flache, nach Relevanz sortierte Liste mit Sprungzielen.
   */
  function global(state, query, options) {
    options = options || {};
    var needle = util.fold(query);
    var results = [];
    if (needle.length < 1) return results;
    var limit = options.limit || 40;

    state.groups.forEach(function (g) {
      var sub = select.subject(state, g.subjectId);
      var s = score((sub ? sub.name + ' ' : '') + g.name + ' Klasse ' + g.grade, needle);
      if (s) results.push({ type: 'group', score: s + 12, title: g.name + ' · ' + (sub ? sub.name : ''),
        meta: 'Lerngruppe · Jahrgang ' + g.grade + ' · ' + g.schoolYear, id: g.id, groupId: g.id, subjectId: g.subjectId });
    });

    state.banks.forEach(function (b) {
      var g = select.group(state, b.groupId);
      var s = score(b.title + ' ' + b.scene + ' ' + (b.note || ''), needle);
      if (s) results.push({ type: 'bank', score: s + 16, title: b.title,
        meta: 'Wortbank · ' + b.scene + (g ? ' · ' + g.name : ''), id: b.id, groupId: b.groupId, subjectId: b.subjectId });
    });

    state.units.forEach(function (u) {
      var g = select.group(state, u.groupId);
      var s = score(u.title + ' ' + (u.description || ''), needle);
      if (s) results.push({ type: 'unit', score: s, title: u.title,
        meta: 'Unterrichtsreihe · ' + (g ? g.name + ' · ' : '') + u.schoolYear, id: u.id, groupId: u.groupId,
        subjectId: g ? g.subjectId : '' });
    });

    state.lexemes.forEach(function (l) {
      var s = score(haystackLexeme(l), needle);
      if (s) {
        var g = select.group(state, l.groupId);
        results.push({ type: 'lexeme', score: s, title: (l.article ? l.article + ' ' : '') + l.term,
          meta: [l.translation, g ? g.name : '', BAO.schema.statusInfo(l.status).short].filter(Boolean).join(' · '),
          id: l.id, groupId: l.groupId, subjectId: l.subjectId });
      }
    });

    state.starters.forEach(function (sta) {
      var s = score(haystackStarter(sta), needle);
      if (s) {
        results.push({ type: 'starter', score: s - 4, title: sta.text.replace(/_{2,}/g, '…'),
          meta: 'Satzanfang · ' + select.functionLabel(state, sta.functionId),
          id: sta.id, groupId: sta.groupId, subjectId: sta.subjectId });
      }
    });

    results.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.title.localeCompare(b.title, 'de');
    });
    return results.slice(0, limit);
  }

  BAO.search = {
    global: global,
    matchesLexeme: matchesLexeme,
    matchesStarter: matchesStarter,
    score: score
  };
})(window.BAO = window.BAO || {});
