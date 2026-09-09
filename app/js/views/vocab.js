/* ==========================================================================
   Wortschatz der Lerngruppe
   Der langfristige Bestand: suchen, filtern, ergänzen, Status pflegen und
   Einträge in Wortbanken übernehmen.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;
  var h = util.h;
  var ui = BAO.ui;
  var schema = BAO.schema;
  var select = BAO.select;

  var filters = { query: '', status: 'all', unitId: 'all', topic: 'all', sort: 'recent' };
  var selection = {};
  var lastGroupId = '';

  function selectedIds() { return Object.keys(selection).filter(function (id) { return selection[id]; }); }
  function clearSelection() { selection = {}; }

  /* --- Formular -------------------------------------------------------------- */

  /**
   * Öffnet den Eintragseditor. Wird auch aus anderen Ansichten verwendet.
   * @param {object|null} lexeme  vorhandener Eintrag oder null für einen neuen
   * @param {object} defaults     Vorgaben (groupId, subjectId, unitId, status)
   */
  function openEditor(lexeme, defaults) {
    var state = BAO.store.getState();
    defaults = defaults || {};
    var isNew = !lexeme;
    var data = lexeme ? util.clone(lexeme) : schema.makeLexeme({
      groupId: defaults.groupId, subjectId: defaults.subjectId,
      introducedUnitId: defaults.unitId || '', status: defaults.status || 'new',
      introducedSchoolYear: defaults.schoolYear || ''
    });

    var fieldTerm = ui.textField({ label: 'Zielwort oder Ausdruck', value: data.term, placeholder: 'le stage' });
    var fieldArticle = ui.textField({ label: 'Artikel / Genus', value: data.article, placeholder: 'le, la, l’ (m.)' });
    var fieldTranslation = ui.textField({ label: 'Deutsch (optional)', value: data.translation, placeholder: 'das Praktikum' });
    var fieldGram = ui.textField({ label: 'Form- oder Pluralhinweis', value: data.gram, placeholder: 'pl. les stages' });
    var fieldCollocation = ui.textField({ label: 'Typische Wortverbindung', value: data.collocation, placeholder: 'faire un stage en entreprise' });
    var fieldChunk = ui.textField({ label: 'Chunk', value: data.chunk, placeholder: 'J’ai fait un stage chez …' });
    var fieldExplanation = ui.textField({ label: 'Erklärung in der Zielsprache', value: data.explanation, full: true, placeholder: 'une période de travail pour découvrir un métier' });
    var fieldExample = ui.textField({ label: 'Beispielsatz', value: data.example, full: true, placeholder: 'J’ai fait un stage dans une boulangerie.' });
    var fieldPronunciation = BAO.ipa.field({
      label: 'Aussprache / Betonung',
      value: data.pronunciation,
      placeholder: '[staʒ]',
      hint: 'Ein Klick ins Feld öffnet die IPA-Tastatur.',
      subject: select.subject(state, data.subjectId),
      full: true
    });
    var fieldCefr = ui.textField({ label: 'Niveau', value: data.cefr, placeholder: 'A2, B1 …' });

    var topics = (data.topics || []).slice();
    var tags = (data.tags || []).slice();
    var fieldTopics = ui.tagEditor(topics, { label: 'Themen / Wortfelder', placeholder: 'le monde du travail', onChange: function (v) { topics = v; } });
    var fieldTags = ui.tagEditor(tags, { label: 'Schlagwörter', placeholder: 'mündlich, Klausur …', onChange: function (v) { tags = v; } });

    var fieldStatus = ui.selectField({ label: 'Status', value: data.status, options: ui.statusOptions() });
    var fieldUnit = ui.selectField({
      label: 'Eingeführt in Reihe', value: data.introducedUnitId,
      options: ui.unitOptions(state, data.groupId)
    });
    var fieldFunction = ui.functionField({
      state: state, value: data.functionId,
      label: 'Verwendung (kommunikative Funktion)'
    });

    function collect() {
      return {
        term: fieldTerm.input.value.trim(),
        article: fieldArticle.input.value.trim(),
        translation: fieldTranslation.input.value.trim(),
        gram: fieldGram.input.value.trim(),
        collocation: fieldCollocation.input.value.trim(),
        chunk: fieldChunk.input.value.trim(),
        explanation: fieldExplanation.input.value.trim(),
        example: fieldExample.input.value.trim(),
        pronunciation: fieldPronunciation.input.value.trim(),
        cefr: fieldCefr.input.value.trim(),
        topics: topics,
        tags: tags,
        status: util.$('select', fieldStatus).value,
        introducedUnitId: util.$('select', fieldUnit).value
      };
    }

    function save(values) {
      var unit = values.introducedUnitId ? select.unit(BAO.store.getState(), values.introducedUnitId) : null;
      BAO.store.commit(isNew ? 'Eintrag angelegt' : 'Eintrag bearbeitet', function (draft) {
        values.functionId = fieldFunction.resolve(draft);
        if (isNew) {
          draft.lexemes.push(Object.assign(data, values, {
            introducedSchoolYear: unit ? unit.schoolYear : data.introducedSchoolYear,
            updatedAt: util.nowISO()
          }));
        } else {
          var target = select.lexeme(draft, data.id);
          if (!target) return false;
          Object.assign(target, values, { updatedAt: util.nowISO() });
          if (unit) target.introducedSchoolYear = unit.schoolYear;
        }
      });
    }

    var actions = [
      { label: 'Abbrechen', value: null, kind: 'ghost' }
    ];
    if (isNew) {
      actions.push({
        label: 'Speichern und weiter', kind: 'ghost',
        onSelect: function (api) {
          var values = collect();
          if (!values.term) { fieldTerm.input.focus(); return false; }
          save(values);
          BAO.toast.undoable('„' + values.term + '“ gespeichert.');
          // Formular für den nächsten Eintrag leeren, Vorgaben behalten.
          [fieldTerm, fieldArticle, fieldTranslation, fieldGram, fieldCollocation, fieldChunk,
            fieldExplanation, fieldExample, fieldPronunciation].forEach(function (field) { field.input.value = ''; });
          data = schema.makeLexeme({
            groupId: data.groupId, subjectId: data.subjectId,
            introducedUnitId: values.introducedUnitId, status: values.status
          });
          fieldTerm.input.focus();
          return false;
        }
      });
    }
    actions.push({
      label: isNew ? 'Speichern' : 'Änderungen übernehmen', kind: 'primary',
      onSelect: function () {
        var values = collect();
        if (!values.term) { fieldTerm.input.focus(); return false; }
        save(values);
        BAO.toast.undoable(isNew ? '„' + values.term + '“ angelegt.' : 'Eintrag aktualisiert.');
        return true;
      }
    });

    return BAO.modal.open({
      title: isNew ? 'Neuer Wortschatzeintrag' : 'Eintrag bearbeiten',
      subtitle: 'Pflichtfeld ist nur das Zielwort. Alles andere ist optional – und wird nur projiziert, wenn es gebraucht wird.',
      width: '720px',
      initialFocus: 'input',
      body: h('div.stack', {},
        h('div.grid2.entry-form', {}, fieldTerm, fieldArticle, fieldTranslation, fieldGram,
          fieldCollocation, fieldChunk, fieldExplanation, fieldExample),
        h('details.form-more', { open: isNew ? null : true },
          h('summary', { text: 'Weitere Angaben: Aussprache, Themen, Status, Reihe' }),
          h('div.grid2.entry-form', {}, fieldCefr, fieldFunction, fieldStatus, fieldUnit,
            fieldTopics, fieldTags, fieldPronunciation)
        )
      ),
      actions: actions
    });
  }

  /* --- Schnelleingabe mehrerer Zeilen ---------------------------------------- */

  function openQuickAdd(groupId, subjectId, unitId) {
    var state = BAO.store.getState();
    var area = h('textarea', {
      rows: 9,
      placeholder: 'Eine Zeile je Eintrag, zum Beispiel:\n'
        + 'le stage = das Praktikum\n'
        + 'l’entreprise – das Unternehmen\n'
        + 'postuler; sich bewerben; postuler pour un poste'
    });
    var preview = h('div.import-preview');
    var fieldStatus = ui.selectField({ label: 'Status für alle', value: 'new', options: ui.statusOptions() });
    var fieldUnit = ui.selectField({ label: 'Reihe', value: unitId || '', options: ui.unitOptions(state, groupId) });

    function parsed() { return BAO.csv.parseQuickLines(area.value); }

    function refresh() {
      var rows = parsed();
      util.clear(preview);
      if (!rows.length) {
        preview.appendChild(h('span.hint', { text: 'Noch nichts erkannt.' }));
        return;
      }
      preview.appendChild(h('strong', { text: rows.length + ' ' + util.plural(rows.length, 'Eintrag', 'Einträge') + ' erkannt:' }));
      rows.slice(0, 6).forEach(function (row) {
        preview.appendChild(h('div.diffline', {},
          h('span.diffline__val', { text: row.term }),
          h('span.diffline__label', { text: row.translation || '—' }),
          row.collocation ? h('span.lex__chunk', { text: row.collocation }) : null
        ));
      });
      if (rows.length > 6) preview.appendChild(h('span.hint', { text: '… und ' + (rows.length - 6) + ' weitere.' }));
    }

    area.addEventListener('input', refresh);
    refresh();

    return BAO.modal.open({
      title: 'Mehrere Einträge einfügen',
      subtitle: 'Trennzeichen: „=“, „–“, „-“, Semikolon oder Tabulator. Ideal zum Einfügen aus einer Liste.',
      width: '640px',
      body: h('div.stack', {},
        h('div.field', {}, h('label', { text: 'Zeilen' }), area),
        h('div.grid2', {}, fieldStatus, fieldUnit),
        preview
      ),
      actions: [
        { label: 'Abbrechen', value: null, kind: 'ghost' },
        {
          label: 'Einträge anlegen', kind: 'primary',
          onSelect: function () {
            var rows = parsed();
            if (!rows.length) return false;
            var status = util.$('select', fieldStatus).value;
            var selectedUnit = util.$('select', fieldUnit).value;
            var unit = selectedUnit ? select.unit(BAO.store.getState(), selectedUnit) : null;
            BAO.store.commit(rows.length + ' Einträge angelegt', function (draft) {
              rows.forEach(function (row) {
                draft.lexemes.push(schema.makeLexeme({
                  groupId: groupId, subjectId: subjectId,
                  term: row.term, translation: row.translation, collocation: row.collocation,
                  status: status, introducedUnitId: selectedUnit,
                  introducedSchoolYear: unit ? unit.schoolYear : ''
                }));
              });
            });
            BAO.toast.undoable(rows.length + ' Einträge angelegt.');
            return true;
          }
        }
      ]
    });
  }

  /* --- In eine Wortbank übernehmen -------------------------------------------- */

  function openAddToBank(ids, kind, groupId, subjectId) {
    var state = BAO.store.getState();
    var banks = select.banksOfGroup(state, groupId);
    var bankSelect = ui.selectField({
      label: 'Wortbank',
      value: banks.length ? banks[0].id : '__new',
      options: banks.map(function (b) { return { value: b.id, label: b.title + ' (' + b.scene + ')' }; })
        .concat([{ value: '__new', label: '+ Neue Wortbank anlegen' }])
    });
    var sectionWrap = h('div');
    var titleField = ui.textField({ label: 'Titel der neuen Wortbank', value: 'Neue Wortbank' });

    function refreshSections() {
      util.clear(sectionWrap);
      var value = util.$('select', bankSelect).value;
      if (value === '__new') { sectionWrap.appendChild(titleField); return; }
      var bank = select.bank(BAO.store.getState(), value);
      if (!bank) return;
      var options = (bank.sections || []).map(function (s) { return { value: s.id, label: s.title }; });
      options.push({ value: '__newsection', label: '+ Neuer Abschnitt' });
      sectionWrap.appendChild(ui.selectField({ label: 'Abschnitt', value: options[0].value, options: options }));
    }
    util.$('select', bankSelect).addEventListener('change', refreshSections);
    refreshSections();

    return BAO.modal.open({
      title: ids.length + ' ' + util.plural(ids.length, 'Eintrag', 'Einträge') + ' übernehmen',
      width: '520px',
      body: h('div.stack', {}, bankSelect, sectionWrap),
      actions: [
        { label: 'Abbrechen', value: null, kind: 'ghost' },
        {
          label: 'Übernehmen', kind: 'primary',
          onSelect: function () {
            var bankValue = util.$('select', bankSelect).value;
            var sectionSelect = util.$('select', sectionWrap);
            var sectionValue = sectionSelect ? sectionSelect.value : '__newsection';
            var newBankId = null;
            BAO.store.commit('Einträge in Wortbank übernommen', function (draft) {
              var bank;
              if (bankValue === '__new') {
                bank = schema.makeBank({
                  groupId: groupId, subjectId: subjectId,
                  title: titleField.input.value.trim() || 'Neue Wortbank'
                });
                draft.banks.push(bank);
                newBankId = bank.id;
              } else {
                bank = select.bank(draft, bankValue);
              }
              if (!bank) return false;
              var section = null;
              if (sectionValue && sectionValue !== '__newsection') {
                section = (bank.sections || []).filter(function (s) { return s.id === sectionValue; })[0];
              }
              if (!section) {
                section = schema.makeSection({ title: kind === 'starter' ? 'Satzanfänge' : 'Wortschatz' });
                bank.sections.push(section);
              }
              var present = {};
              section.items.forEach(function (item) { present[item.kind + ':' + item.refId] = true; });
              ids.forEach(function (id) {
                if (present[kind + ':' + id]) return;
                section.items.push(schema.makeBankItem({ kind: kind, refId: id }));
              });
              bank.updatedAt = util.nowISO();
            });
            BAO.toast.undoable(ids.length + ' ' + util.plural(ids.length, 'Eintrag', 'Einträge') + ' übernommen.');
            if (newBankId) BAO.app.go('wortbank/' + newBankId);
            return true;
          }
        }
      ]
    });
  }

  /* --- Löschen ---------------------------------------------------------------- */

  function deleteLexemes(ids) {
    var state = BAO.store.getState();
    var usage = 0;
    ids.forEach(function (id) { usage += select.usageOfEntry(state, id, 'lex').length; });
    var first = select.lexeme(state, ids[0]);

    return BAO.modal.confirm({
      title: ids.length === 1 ? 'Eintrag löschen?' : ids.length + ' Einträge löschen?',
      text: ids.length === 1 && first
        ? '„' + ui.termLabel(first) + '“ wird aus dem Bestand der Lerngruppe entfernt.'
        : 'Die Einträge werden aus dem Bestand der Lerngruppe entfernt.',
      detail: usage
        ? 'Achtung: ' + usage + ' ' + util.plural(usage, 'Verwendung', 'Verwendungen')
          + ' in Wortbanken werden ebenfalls entfernt. Das lässt sich rückgängig machen.'
        : 'Das lässt sich direkt rückgängig machen.',
      confirmLabel: 'Löschen', danger: true
    }).then(function (confirmed) {
      if (!confirmed) return false;
      BAO.store.commit(ids.length === 1 ? 'Eintrag gelöscht' : ids.length + ' Einträge gelöscht', function (draft) {
        draft.lexemes = draft.lexemes.filter(function (l) { return ids.indexOf(l.id) < 0; });
        draft.banks.forEach(function (bank) {
          (bank.sections || []).forEach(function (section) {
            section.items = section.items.filter(function (item) {
              return !(item.kind === 'lex' && ids.indexOf(item.refId) >= 0);
            });
          });
        });
      });
      clearSelection();
      BAO.toast.undoable(ids.length === 1 ? 'Eintrag gelöscht.' : ids.length + ' Einträge gelöscht.');
      return true;
    });
  }

  function setStatus(ids, status) {
    BAO.store.commit('Status geändert', function (draft) {
      draft.lexemes.forEach(function (lex) {
        if (ids.indexOf(lex.id) >= 0) { lex.status = status; lex.updatedAt = util.nowISO(); }
      });
    });
    BAO.toast.undoable('Status „' + schema.statusInfo(status).label + '“ für '
      + ids.length + ' ' + util.plural(ids.length, 'Eintrag', 'Einträge') + ' gesetzt.');
  }

  /* --- Liste ------------------------------------------------------------------ */

  function applyFilters(state, list) {
    var needle = util.fold(filters.query);
    return list.filter(function (lex) {
      if (filters.status !== 'all' && lex.status !== filters.status) return false;
      if (filters.status === 'all' && !filters.query && lex.status === 'archived') return false;
      if (filters.unitId !== 'all' && lex.introducedUnitId !== filters.unitId) return false;
      if (filters.topic !== 'all' && (lex.topics || []).indexOf(filters.topic) < 0) return false;
      if (needle && !BAO.search.matchesLexeme(lex, needle)) return false;
      return true;
    }).sort(function (a, b) {
      if (filters.sort === 'alpha') return util.fold(a.term).localeCompare(util.fold(b.term), 'de');
      if (filters.sort === 'status') {
        var d = schema.STATUS_ORDER.indexOf(a.status) - schema.STATUS_ORDER.indexOf(b.status);
        return d !== 0 ? d : util.fold(a.term).localeCompare(util.fold(b.term), 'de');
      }
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });
  }

  function lexemeRow(state, lex, ctx, app) {
    var info = schema.statusInfo(lex.status);
    var unit = lex.introducedUnitId ? select.unit(state, lex.introducedUnitId) : null;

    var row = h('div.lex', {
      style: { '--status-color': 'var(--st-' + info.id + ')' },
      dataset: { selected: selection[lex.id] ? 'true' : 'false', id: lex.id }
    },
      h('input', {
        type: 'checkbox', 'aria-label': 'Auswählen: ' + lex.term,
        checked: selection[lex.id] ? true : null,
        onchange: function (event) {
          selection[lex.id] = event.target.checked;
          BAO.app.scheduleRender();
        }
      }),
      h('div.lex__mid', {},
        h('div.lex__term', {}, ui.termNode(lex, { gram: !!lex.gram })),
        lex.collocation ? h('div.lex__chunk', { text: lex.collocation }) : null,
        lex.chunk && !lex.collocation ? h('div.lex__chunk', { text: lex.chunk }) : null
      ),
      h('div.lex__mid.lex__col-hide', {},
        lex.translation ? h('div.lex__de', { text: lex.translation }) : null,
        lex.explanation ? h('div.lex__sub', { text: lex.explanation }) : null
      ),
      h('div.lex__mid.lex__col-hide', {},
        h('div', {}, ui.statusChip(lex.status)),
        h('div.lex__tags', {},
          (lex.topics || []).slice(0, 2).map(function (topic) { return h('span.chip.chip--tag', { text: topic }); }),
          unit ? h('span.chip.chip--tag', { title: 'eingeführt in', text: unit.title }) : null
        )
      ),
      h('div.lex__actions', {},
        h('button.btn.btn--ghost.btn--sm.btn--icon', {
          type: 'button', title: 'In eine Wortbank übernehmen',
          onclick: function () { openAddToBank([lex.id], 'lex', ctx.group.id, ctx.subject.id); }
        }, ui.icon('grid', 15)),
        h('button.btn.btn--ghost.btn--sm.btn--icon', {
          type: 'button', title: 'Bearbeiten',
          onclick: function () { openEditor(lex); }
        }, ui.icon('edit', 15)),
        h('button.btn.btn--ghost.btn--sm.btn--icon', {
          type: 'button', title: 'Löschen',
          onclick: function () { deleteLexemes([lex.id]); }
        }, ui.icon('trash', 15))
      )
    );
    row.addEventListener('dblclick', function () { openEditor(lex); });
    return row;
  }

  /* --- Ansicht ---------------------------------------------------------------- */

  function render(host, context) {
    var state = context.state;
    var ctx = context.ctx;
    var app = context.app;
    var view = h('div.view');

    if (!ctx.group) {
      view.appendChild(ui.emptyState({
        title: 'Noch keine Lerngruppe',
        text: 'Der Wortschatz gehört immer zu einer Lerngruppe – so wächst er über die Schuljahre mit.',
        actionLabel: 'Lerngruppe anlegen',
        onAction: function () { app.go('verwaltung'); }
      }));
      host.appendChild(view);
      return;
    }

    if (lastGroupId !== ctx.group.id) { clearSelection(); lastGroupId = ctx.group.id; }

    var all = select.lexemesOfGroup(state, ctx.group.id);
    var counts = select.statusCounts(state, ctx.group.id);
    var visible = applyFilters(state, all);

    // Vorausgewählter Eintrag aus der Schnellsuche
    if (context.params[0]) {
      var target = select.lexeme(state, context.params[0]);
      if (target) { setTimeout(function () { openEditor(target); }, 0); window.location.hash = '#/wortschatz'; }
    }

    view.appendChild(h('div.view__head', {},
      h('div.view__title', {},
        h('h1', { text: 'Wortschatz' }),
        h('span.sub', {
          text: ctx.subject.name + ' · ' + ctx.group.name + ' · Jahrgang ' + ctx.group.grade
            + ' · ' + all.length + ' ' + util.plural(all.length, 'Eintrag', 'Einträge')
        })
      ),
      h('div.spacer'),
      h('div.view__actions', {},
        h('button.btn.btn--sm', {
          type: 'button', text: 'Mehrere Zeilen einfügen',
          onclick: function () { openQuickAdd(ctx.group.id, ctx.subject.id, ctx.unit ? ctx.unit.id : ''); }
        }),
        h('button.btn.btn--primary', {
          type: 'button',
          onclick: function () {
            openEditor(null, {
              groupId: ctx.group.id, subjectId: ctx.subject.id,
              unitId: ctx.unit ? ctx.unit.id : '', schoolYear: ctx.group.schoolYear
            });
          }
        }, ui.icon('plus', 16), 'Neuer Eintrag')
      )
    ));

    /* --- Werkzeugleiste --------------------------------------------------- */
    var searchInput = h('input', {
      type: 'search', value: filters.query, placeholder: 'Im Bestand suchen …',
      'aria-label': 'Wortschatz durchsuchen',
      oninput: function (event) { filters.query = event.target.value; app.scheduleRender(); }
    });

    var statusButtons = h('div.filterbar', {});
    [{ id: 'all', label: 'Alle', count: counts.total }].concat(schema.STATUS.map(function (s) {
      return { id: s.id, label: s.short, count: counts[s.id] || 0 };
    })).forEach(function (entry) {
      statusButtons.appendChild(h('button.btn', {
        type: 'button',
        'aria-pressed': filters.status === entry.id ? 'true' : 'false',
        title: entry.id === 'all' ? 'Alle anzeigen (ohne Archiv)' : schema.statusInfo(entry.id).hint,
        onclick: function () { filters.status = entry.id; app.scheduleRender(); }
      }, entry.label + ' ' + entry.count));
    });

    var toolbar = h('div.toolbar', {},
      searchInput,
      statusButtons,
      ui.selectField({
        value: filters.unitId,
        ariaLabel: 'Nach Unterrichtsreihe filtern',
        options: [{ value: 'all', label: 'Alle Reihen' }].concat(select.unitsOfGroup(state, ctx.group.id).map(function (u) {
          return { value: u.id, label: u.title + ' (' + u.schoolYear + ')' };
        })),
        onChange: function (value) { filters.unitId = value; app.scheduleRender(); }
      }),
      ui.selectField({
        value: filters.topic,
        ariaLabel: 'Nach Thema filtern',
        options: [{ value: 'all', label: 'Alle Themen' }].concat(select.topicsOfGroup(state, ctx.group.id).map(function (t) {
          return { value: t, label: t };
        })),
        onChange: function (value) { filters.topic = value; app.scheduleRender(); }
      }),
      h('span.spacer'),
      ui.selectField({
        value: filters.sort,
        ariaLabel: 'Sortierung',
        options: [
          { value: 'recent', label: 'zuletzt bearbeitet' },
          { value: 'alpha', label: 'alphabetisch' },
          { value: 'status', label: 'nach Status' }
        ],
        onChange: function (value) { filters.sort = value; app.scheduleRender(); }
      })
    );
    view.appendChild(toolbar);

    /* --- Liste ------------------------------------------------------------- */
    if (!all.length) {
      view.appendChild(ui.emptyState({
        title: 'Der Bestand ist noch leer',
        text: 'Lege einzelne Einträge an oder füge mehrere Zeilen auf einmal ein. '
          + 'Ein Eintrag braucht nur ein Zielwort – alles Weitere kann später dazukommen.',
        actionLabel: 'Ersten Eintrag anlegen',
        onAction: function () {
          openEditor(null, { groupId: ctx.group.id, subjectId: ctx.subject.id, unitId: ctx.unit ? ctx.unit.id : '' });
        },
        secondaryLabel: 'Mehrere Zeilen einfügen',
        onSecondary: function () { openQuickAdd(ctx.group.id, ctx.subject.id, ctx.unit ? ctx.unit.id : ''); }
      }));
    } else if (!visible.length) {
      view.appendChild(ui.emptyState({
        title: 'Kein Treffer',
        text: 'Zu dieser Kombination aus Suche und Filtern gibt es keinen Eintrag.',
        actionLabel: 'Filter zurücksetzen',
        onAction: function () {
          filters = { query: '', status: 'all', unitId: 'all', topic: 'all', sort: filters.sort };
          app.scheduleRender();
        }
      }));
    } else {
      var list = h('div.lex-list');
      visible.forEach(function (lex) { list.appendChild(lexemeRow(state, lex, ctx, app)); });
      view.appendChild(list);
    }

    /* --- Sammelaktionen ----------------------------------------------------- */
    var chosen = selectedIds();
    if (chosen.length) {
      view.appendChild(h('div.bulkbar', {},
        h('strong', { text: chosen.length + ' ausgewählt' }),
        ui.selectField({
          value: '', ariaLabel: 'Status setzen',
          options: [{ value: '', label: 'Status setzen …' }].concat(ui.statusOptions()),
          onChange: function (value, node) {
            if (!value) return;
            setStatus(chosen, value);
            node.value = '';
            clearSelection();
            app.scheduleRender();
          }
        }),
        h('button.btn.btn--sm', {
          type: 'button', text: 'In Wortbank',
          onclick: function () { openAddToBank(chosen, 'lex', ctx.group.id, ctx.subject.id); }
        }),
        h('button.btn.btn--sm', {
          type: 'button', text: 'Löschen',
          onclick: function () { deleteLexemes(chosen).then(function () { app.scheduleRender(); }); }
        }),
        h('span.spacer'),
        h('button.btn.btn--sm', {
          type: 'button', text: 'Auswahl aufheben',
          onclick: function () { clearSelection(); app.scheduleRender(); }
        })
      ));
    }

    host.appendChild(view);
  }

  BAO.views = BAO.views || {};
  BAO.views.vocab = {
    render: render,
    openEditor: openEditor,
    openQuickAdd: openQuickAdd,
    openAddToBank: openAddToBank
  };
})(window.BAO = window.BAO || {});
