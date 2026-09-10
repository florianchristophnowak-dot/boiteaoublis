/* ==========================================================================
   Abfragen auf dem Bestand
   Reine Lesefunktionen ohne Nebenwirkungen – sie halten die Ansichten frei
   von Suchlogik.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function subjects(state) { return util.sortBy(state.subjects, function (s) { return s.order; }); }
  function subject(state, id) { return byId(state.subjects, id); }
  function group(state, id) { return byId(state.groups, id); }
  function unit(state, id) { return byId(state.units, id); }
  function lexeme(state, id) { return byId(state.lexemes, id); }
  function starter(state, id) { return byId(state.starters, id); }
  function bank(state, id) { return byId(state.banks, id); }
  function board(state, id) { return byId(state.boards || [], id); }

  function functions(state) { return util.sortBy(state.functions, function (f) { return f.order; }); }
  function functionLabel(state, id) {
    var fn = byId(state.functions, id);
    return fn ? fn.label : 'ohne Funktion';
  }

  function groupsOfSubject(state, subjectId, includeArchived) {
    return state.groups.filter(function (g) {
      return g.subjectId === subjectId && (includeArchived || !g.archived);
    }).sort(function (a, b) {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      if (a.grade !== b.grade) return a.grade - b.grade;
      return a.name.localeCompare(b.name, 'de');
    });
  }

  function unitsOfGroup(state, groupId) {
    return state.units.filter(function (u) { return u.groupId === groupId; })
      .sort(function (a, b) {
        if (a.schoolYear !== b.schoolYear) return a.schoolYear < b.schoolYear ? -1 : 1;
        return (a.order || 0) - (b.order || 0);
      });
  }

  function currentUnit(state, groupId) {
    var list = unitsOfGroup(state, groupId);
    for (var i = list.length - 1; i >= 0; i--) if (list[i].status === 'current') return list[i];
    return list[list.length - 1] || null;
  }

  function lexemesOfGroup(state, groupId) {
    return state.lexemes.filter(function (l) { return l.groupId === groupId; });
  }

  /** Satzanfänge der Lerngruppe plus fachweite Einträge (groupId leer). */
  function startersOfGroup(state, groupId, subjectId) {
    return state.starters.filter(function (s) {
      if (s.groupId && s.groupId === groupId) return true;
      return !s.groupId && s.subjectId === subjectId;
    });
  }

  function banksOfGroup(state, groupId) {
    return state.banks.filter(function (b) { return b.groupId === groupId; })
      .sort(function (a, b) {
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
        var la = a.lastUsedAt || a.updatedAt || '';
        var lb = b.lastUsedAt || b.updatedAt || '';
        return lb.localeCompare(la);
      });
  }

  function boardsOfGroup(state, groupId) {
    return (state.boards || []).filter(function (b) { return b.groupId === groupId; })
      .sort(function (a, b) {
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
        var la = a.lastUsedAt || a.updatedAt || '';
        var lb = b.lastUsedAt || b.updatedAt || '';
        return lb.localeCompare(la);
      });
  }

  /**
   * Löst ein Tafel-Element in den Datensatz auf und liefert gleich den Text,
   * unabhängig davon, ob dahinter ein Wortschatzeintrag oder ein Satzanfang
   * steht. Genau diese Gleichbehandlung macht die Tafel einfach.
   */
  function resolveBoardItem(state, item) {
    if (!item) return null;
    var ref = item.kind === 'starter' ? starter(state, item.refId) : lexeme(state, item.refId);
    if (!ref) return null;
    return {
      kind: item.kind,
      item: item,
      ref: ref,
      text: item.kind === 'starter' ? (ref.text || '') : (ref.term || '')
    };
  }

  function boardEntries(state, boardObj) {
    if (!boardObj) return [];
    return (boardObj.items || []).map(function (item) { return resolveBoardItem(state, item); })
      .filter(Boolean);
  }

  /**
   * Gehört ein Eintrag auf diese Tafel?
   * Eine Tafel gehört einer Lerngruppe und damit einem Fach. Ein Eintrag aus
   * einer anderen Sprache hat darauf nichts zu suchen – sonst stünde etwa ein
   * französischer Artikel farbig auf einer englischen Tafel.
   * Fachweite Satzanfänge (ohne Lerngruppe) gehören dazu.
   */
  function belongsToBoard(ref, boardObj) {
    if (!ref || !boardObj) return false;
    if (ref.subjectId && boardObj.subjectId && ref.subjectId !== boardObj.subjectId) return false;
    if (ref.groupId && boardObj.groupId && ref.groupId !== boardObj.groupId) return false;
    return true;
  }

  /** Trägt ein Eintrag außer dem Text schon weitere Angaben? */
  function isBareEntry(ref) {
    if (!ref) return true;
    var extras = ['article', 'gram', 'collocation', 'chunk', 'explanation',
      'translation', 'example', 'pronunciation', 'functionId'];
    return !extras.some(function (key) { return String(ref[key] || '').trim(); });
  }

  function statusCounts(state, groupId) {
    var counts = { new: 0, active: 0, revisit: 0, core: 0, archived: 0, total: 0 };
    lexemesOfGroup(state, groupId).forEach(function (l) {
      if (counts[l.status] === undefined) counts[l.status] = 0;
      counts[l.status] += 1;
      counts.total += 1;
    });
    return counts;
  }

  function bankItemCount(bankObj) {
    if (!bankObj || !bankObj.sections) return 0;
    return bankObj.sections.reduce(function (sum, s) { return sum + (s.items ? s.items.length : 0); }, 0);
  }

  /** Löst eine Wortbank-Position in den tatsächlichen Datensatz auf. */
  function resolveItem(state, item) {
    if (!item) return null;
    var ref = item.kind === 'starter' ? starter(state, item.refId) : lexeme(state, item.refId);
    if (!ref) return null;
    return { kind: item.kind, item: item, ref: ref };
  }

  function bankIsEmpty(state, bankObj) {
    if (!bankObj) return true;
    return !bankObj.sections.some(function (section) {
      return (section.items || []).some(function (item) { return !!resolveItem(state, item); });
    });
  }

  /** Alle in einer Lerngruppe vergebenen Themen bzw. Schlagwörter. */
  function topicsOfGroup(state, groupId) {
    var set = new Set();
    lexemesOfGroup(state, groupId).forEach(function (l) {
      (l.topics || []).forEach(function (t) { if (t) set.add(t); });
    });
    return Array.from(set).sort(function (a, b) { return a.localeCompare(b, 'de'); });
  }

  function tagsOfGroup(state, groupId) {
    var set = new Set();
    lexemesOfGroup(state, groupId).forEach(function (l) {
      (l.tags || []).forEach(function (t) { if (t) set.add(t); });
    });
    return Array.from(set).sort(function (a, b) { return a.localeCompare(b, 'de'); });
  }

  /** Wo wird ein Eintrag verwendet? Wichtig vor dem Löschen. */
  function usageOfEntry(state, id, kind) {
    var used = [];
    state.banks.forEach(function (b) {
      (b.sections || []).forEach(function (section) {
        (section.items || []).forEach(function (item) {
          if (item.kind === kind && item.refId === id) used.push({ bank: b, section: section });
        });
      });
    });
    (state.boards || []).forEach(function (b) {
      (b.items || []).forEach(function (item) {
        if (item.kind === kind && item.refId === id) used.push({ board: b });
      });
    });
    return used;
  }

  /** Der aktuell gewählte Arbeitskontext, mit belastbaren Rückfallebenen. */
  function context(state) {
    var subjectList = subjects(state);
    var current = subject(state, state.ui.subjectId) || subjectList[0] || null;
    var groupList = current ? groupsOfSubject(state, current.id) : [];
    var currentGroup = group(state, state.ui.groupId);
    if (!currentGroup || (current && currentGroup.subjectId !== current.id) || currentGroup.archived) {
      currentGroup = groupList[0] || null;
    }
    return {
      subject: current,
      group: currentGroup,
      subjects: subjectList,
      groups: groupList,
      unit: currentGroup ? currentUnit(state, currentGroup.id) : null
    };
  }

  function recentBanks(state, limit) {
    return (state.ui.recentBanks || [])
      .map(function (id) { return bank(state, id); })
      .filter(Boolean)
      .slice(0, limit || 6);
  }

  function favouriteBanks(state) {
    return state.banks.filter(function (b) { return b.favorite; });
  }

  function totals(state) {
    return {
      subjects: state.subjects.length,
      groups: state.groups.filter(function (g) { return !g.archived; }).length,
      units: state.units.length,
      lexemes: state.lexemes.length,
      starters: state.starters.length,
      banks: state.banks.length,
      boards: (state.boards || []).length
    };
  }

  BAO.select = {
    byId: byId,
    subjects: subjects, subject: subject, group: group, unit: unit,
    lexeme: lexeme, starter: starter, bank: bank, board: board,
    functions: functions, functionLabel: functionLabel,
    groupsOfSubject: groupsOfSubject, unitsOfGroup: unitsOfGroup, currentUnit: currentUnit,
    lexemesOfGroup: lexemesOfGroup, startersOfGroup: startersOfGroup, banksOfGroup: banksOfGroup,
    boardsOfGroup: boardsOfGroup, resolveBoardItem: resolveBoardItem, boardEntries: boardEntries,
    belongsToBoard: belongsToBoard, isBareEntry: isBareEntry,
    statusCounts: statusCounts, bankItemCount: bankItemCount, resolveItem: resolveItem, bankIsEmpty: bankIsEmpty,
    topicsOfGroup: topicsOfGroup, tagsOfGroup: tagsOfGroup, usageOfEntry: usageOfEntry,
    context: context, recentBanks: recentBanks, favouriteBanks: favouriteBanks, totals: totals
  };
})(window.BAO = window.BAO || {});
