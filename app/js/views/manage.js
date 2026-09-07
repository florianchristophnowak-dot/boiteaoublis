/* ==========================================================================
   Verwaltung: Fächer, Lerngruppen, Unterrichtsreihen
   Hier entsteht die Struktur, in der der Wortschatz über Jahre wächst –
   einschließlich der Übernahme einer Lerngruppe in das nächste Schuljahr.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;
  var h = util.h;
  var ui = BAO.ui;
  var schema = BAO.schema;
  var select = BAO.select;

  var PALETTE = [
    { color: '#2b5c8a', soft: '#e6eef7' },
    { color: '#a4552f', soft: '#f8e9e1' },
    { color: '#3d7a5c', soft: '#e5f1ec' },
    { color: '#6d4b96', soft: '#eee8f7' },
    { color: '#a3792a', soft: '#f8f0dd' },
    { color: '#8a3a52', soft: '#f8e6ea' }
  ];

  /* --- Fach -------------------------------------------------------------------- */

  function editSubject(subject) {
    var isNew = !subject;
    var data = subject ? util.clone(subject) : schema.makeSubject({ order: BAO.store.getState().subjects.length });
    var fieldName = ui.textField({ label: 'Fach oder Fremdsprache', value: data.name, placeholder: 'z. B. Spanisch' });
    var fieldShort = ui.textField({ label: 'Kürzel', value: data.short, placeholder: 'ES' });

    var chosen = { color: data.color, soft: data.colorSoft };
    var swatches = h('div.row');
    PALETTE.forEach(function (entry) {
      var button = h('button.btn.btn--icon', {
        type: 'button',
        title: 'Farbe wählen',
        'aria-label': 'Farbe wählen',
        style: { background: entry.color, 'border-color': entry.color, width: '34px', 'min-height': '30px' },
        onclick: function () {
          chosen = { color: entry.color, soft: entry.soft };
          util.$$('button', swatches).forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
          button.setAttribute('aria-pressed', 'true');
        }
      });
      button.setAttribute('aria-pressed', entry.color === data.color ? 'true' : 'false');
      swatches.appendChild(button);
    });

    return BAO.modal.open({
      title: isNew ? 'Neues Fach' : 'Fach bearbeiten',
      subtitle: 'Jedes Fach hat eigene Lerngruppen, eigenen Wortschatz und eigene Satzanfänge.',
      width: '520px',
      initialFocus: 'input',
      body: h('div.stack', {}, h('div.grid2', {}, fieldName, fieldShort),
        h('div.field', {}, h('label', { text: 'Farbe' }), swatches)),
      actions: [
        { label: 'Abbrechen', value: null, kind: 'ghost' },
        {
          label: isNew ? 'Anlegen' : 'Übernehmen', kind: 'primary',
          onSelect: function () {
            var name = fieldName.input.value.trim();
            if (!name) { fieldName.input.focus(); return false; }
            var values = {
              name: name,
              short: (fieldShort.input.value.trim() || name.slice(0, 2)).toUpperCase().slice(0, 3),
              color: chosen.color, colorSoft: chosen.soft
            };
            BAO.store.commit(isNew ? 'Fach angelegt' : 'Fach bearbeitet', function (draft) {
              if (isNew) draft.subjects.push(Object.assign(data, values));
              else {
                var target = select.subject(draft, data.id);
                if (target) Object.assign(target, values);
              }
            });
            BAO.toast.undoable(isNew ? 'Fach angelegt.' : 'Fach aktualisiert.');
            return true;
          }
        }
      ]
    });
  }

  function removeSubject(subject) {
    var state = BAO.store.getState();
    var groups = select.groupsOfSubject(state, subject.id, true);
    var lexemes = state.lexemes.filter(function (l) { return l.subjectId === subject.id; }).length;
    BAO.modal.confirm({
      title: 'Fach „' + subject.name + '“ löschen?',
      text: 'Damit verschwinden auch alle zugehörigen Inhalte.',
      detail: groups.length + ' ' + util.plural(groups.length, 'Lerngruppe', 'Lerngruppen') + ', '
        + lexemes + ' Wortschatzeinträge und alle zugehörigen Wortbanken werden entfernt. '
        + 'Rückgängig machen ist möglich, ein Export vorher schadet trotzdem nicht.',
      confirmLabel: 'Fach löschen', danger: true
    }).then(function (confirmed) {
      if (!confirmed) return;
      var groupIds = groups.map(function (g) { return g.id; });
      BAO.store.commit('Fach gelöscht', function (draft) {
        draft.subjects = draft.subjects.filter(function (s) { return s.id !== subject.id; });
        draft.groups = draft.groups.filter(function (g) { return g.subjectId !== subject.id; });
        draft.units = draft.units.filter(function (u) { return groupIds.indexOf(u.groupId) < 0; });
        draft.lexemes = draft.lexemes.filter(function (l) { return l.subjectId !== subject.id; });
        draft.starters = draft.starters.filter(function (s) { return s.subjectId !== subject.id; });
        draft.banks = draft.banks.filter(function (b) { return b.subjectId !== subject.id; });
        if (draft.ui.subjectId === subject.id) {
          draft.ui.subjectId = draft.subjects[0] ? draft.subjects[0].id : '';
          draft.ui.groupId = '';
        }
      });
      BAO.toast.undoable('Fach gelöscht.');
    });
  }

  /* --- Lerngruppe --------------------------------------------------------------- */

  function editGroup(group, subjectId) {
    var isNew = !group;
    var data = group ? util.clone(group) : schema.makeGroup({ subjectId: subjectId, schoolYear: util.currentSchoolYear() });
    var fieldName = ui.textField({ label: 'Bezeichnung', value: data.name, placeholder: 'z. B. 9b oder Q1 GK' });
    var fieldGrade = ui.textField({ label: 'Jahrgangsstufe', value: String(data.grade), type: 'number' });
    var fieldYear = ui.textField({ label: 'Schuljahr', value: data.schoolYear, placeholder: '2025/26' });
    var fieldNote = ui.textField({ label: 'Notiz', value: data.note, full: true, placeholder: 'z. B. zweite Fremdsprache, drei Wochenstunden' });

    return BAO.modal.open({
      title: isNew ? 'Neue Lerngruppe' : 'Lerngruppe bearbeiten',
      width: '560px',
      initialFocus: 'input',
      body: h('div.stack', {}, h('div.grid3', {}, fieldName, fieldGrade, fieldYear), fieldNote),
      actions: [
        { label: 'Abbrechen', value: null, kind: 'ghost' },
        {
          label: isNew ? 'Anlegen' : 'Übernehmen', kind: 'primary',
          onSelect: function () {
            var name = fieldName.input.value.trim();
            if (!name) { fieldName.input.focus(); return false; }
            var values = {
              name: name,
              grade: util.clamp(parseInt(fieldGrade.input.value, 10) || 5, 1, 13),
              schoolYear: fieldYear.input.value.trim() || util.currentSchoolYear(),
              note: fieldNote.input.value.trim(),
              updatedAt: util.nowISO()
            };
            var newId = null;
            BAO.store.commit(isNew ? 'Lerngruppe angelegt' : 'Lerngruppe bearbeitet', function (draft) {
              if (isNew) {
                var created = Object.assign(data, values);
                draft.groups.push(created);
                newId = created.id;
              } else {
                var target = select.group(draft, data.id);
                if (target) Object.assign(target, values);
              }
            });
            BAO.toast.undoable(isNew ? 'Lerngruppe angelegt.' : 'Lerngruppe aktualisiert.');
            if (newId) BAO.app.setContext(data.subjectId, newId);
            return true;
          }
        }
      ]
    });
  }

  /** Übernahme in das nächste Schuljahr – der Bestand wächst weiter. */
  function promoteGroup(group) {
    var state = BAO.store.getState();
    var counts = select.statusCounts(state, group.id);
    var currentUnit = select.currentUnit(state, group.id);
    var nextYear = util.nextSchoolYear(group.schoolYear);
    var nextGrade = group.grade + 1;

    var optCore = h('input', { type: 'checkbox', id: 'promo_core', checked: true });
    var optRevisit = h('input', { type: 'checkbox', id: 'promo_revisit', checked: true });
    var optClose = h('input', { type: 'checkbox', id: 'promo_close', checked: true });
    var optUnit = h('input', { type: 'checkbox', id: 'promo_unit' });
    var unitTitle = ui.textField({ label: 'Titel der neuen Reihe', value: '', placeholder: 'z. B. Auftakt ' + nextYear });

    return BAO.modal.open({
      title: 'Lerngruppe ' + group.name + ' ins nächste Schuljahr übernehmen',
      subtitle: 'Jahrgang ' + group.grade + ' → ' + nextGrade + '  ·  Schuljahr ' + group.schoolYear + ' → ' + nextYear,
      width: '600px',
      body: h('div.stack', {},
        h('div.note', {
          text: 'Der gesamte Wortschatz bleibt erhalten und wird nicht dupliziert. '
            + 'Es ändern sich nur Jahrgang, Schuljahr und – wenn gewünscht – der Status der Einträge.'
        }),
        h('div.stack.stack--tight', {},
          h('div.toggle-row', {}, optCore,
            h('label', { for: 'promo_core', text: 'Aktuellen Wortschatz als Grundbestand sichern (' + (counts.new + counts.active) + ' Einträge: neu/aktiv → Grundbestand)' })),
          h('div.toggle-row', {}, optRevisit,
            h('label', {
              for: 'promo_revisit',
              text: currentUnit
                ? 'Wortschatz der Reihe „' + currentUnit.title + '“ zum Wiederaufgreifen markieren'
                : 'Wortschatz der letzten Reihe zum Wiederaufgreifen markieren (keine laufende Reihe gefunden)'
            })),
          h('div.toggle-row', {}, optClose,
            h('label', { for: 'promo_close', text: 'Laufende Unterrichtsreihen als abgeschlossen markieren' })),
          h('div.toggle-row', {}, optUnit,
            h('label', { for: 'promo_unit', text: 'Neue Unterrichtsreihe für ' + nextYear + ' anlegen' }))
        ),
        unitTitle
      ),
      actions: [
        { label: 'Abbrechen', value: null, kind: 'ghost' },
        {
          label: 'Übernehmen', kind: 'primary',
          onSelect: function () {
            var markCore = optCore.checked;
            var markRevisit = optRevisit.checked;
            var closeUnits = optClose.checked;
            var createUnit = optUnit.checked;
            var title = unitTitle.input.value.trim() || ('Auftakt ' + nextYear);

            BAO.store.commit('Lerngruppe ins nächste Schuljahr übernommen', function (draft) {
              var target = select.group(draft, group.id);
              if (!target) return false;

              if (markCore) {
                draft.lexemes.forEach(function (lex) {
                  if (lex.groupId !== group.id) return;
                  if (lex.status === 'new' || lex.status === 'active') {
                    lex.status = 'core';
                    lex.updatedAt = util.nowISO();
                  }
                });
              }
              if (markRevisit && currentUnit) {
                draft.lexemes.forEach(function (lex) {
                  if (lex.groupId !== group.id) return;
                  if (lex.introducedUnitId === currentUnit.id && lex.status !== 'archived') {
                    lex.status = 'revisit';
                    lex.updatedAt = util.nowISO();
                  }
                });
              }
              if (closeUnits) {
                draft.units.forEach(function (unit) {
                  if (unit.groupId === group.id && unit.status === 'current') unit.status = 'done';
                });
              }

              target.history = (target.history || []).concat([{
                schoolYear: target.schoolYear, grade: target.grade,
                at: util.nowISO(), note: 'Übernahme in Jahrgang ' + nextGrade
              }]);
              target.grade = nextGrade;
              target.schoolYear = nextYear;
              target.updatedAt = util.nowISO();

              if (createUnit) {
                draft.units.push(schema.makeUnit({
                  groupId: group.id, title: title, schoolYear: nextYear,
                  status: 'current', order: draft.units.filter(function (u) { return u.groupId === group.id; }).length
                }));
              }
            });
            BAO.toast.undoable(group.name + ' ist jetzt in Jahrgang ' + nextGrade + ' (' + nextYear + ').');
            return true;
          }
        }
      ]
    });
  }

  function removeGroup(group) {
    var state = BAO.store.getState();
    var lexemes = select.lexemesOfGroup(state, group.id).length;
    var banks = select.banksOfGroup(state, group.id).length;
    BAO.modal.confirm({
      title: 'Lerngruppe „' + group.name + '“ löschen?',
      text: 'Der gesamte Bestand dieser Lerngruppe wird entfernt.',
      detail: lexemes + ' Wortschatzeinträge und ' + banks + ' Wortbanken sind betroffen. '
        + 'Alternative: die Lerngruppe archivieren – dann bleibt alles erhalten.',
      confirmLabel: 'Endgültig löschen', danger: true
    }).then(function (confirmed) {
      if (!confirmed) return;
      BAO.store.commit('Lerngruppe gelöscht', function (draft) {
        draft.groups = draft.groups.filter(function (g) { return g.id !== group.id; });
        draft.units = draft.units.filter(function (u) { return u.groupId !== group.id; });
        draft.lexemes = draft.lexemes.filter(function (l) { return l.groupId !== group.id; });
        draft.starters = draft.starters.filter(function (s) { return s.groupId !== group.id; });
        draft.banks = draft.banks.filter(function (b) { return b.groupId !== group.id; });
        if (draft.ui.groupId === group.id) draft.ui.groupId = '';
      });
      BAO.toast.undoable('Lerngruppe gelöscht.');
    });
  }

  /* --- Unterrichtsreihe --------------------------------------------------------- */

  function editUnit(unit, group) {
    var isNew = !unit;
    var data = unit ? util.clone(unit) : schema.makeUnit({
      groupId: group.id, schoolYear: group.schoolYear,
      order: select.unitsOfGroup(BAO.store.getState(), group.id).length
    });
    var fieldTitle = ui.textField({ label: 'Titel der Reihe', value: data.title, placeholder: 'z. B. Le stage en entreprise' });
    var fieldYear = ui.textField({ label: 'Schuljahr', value: data.schoolYear });
    var fieldStatus = ui.selectField({
      label: 'Stand', value: data.status,
      options: [
        { value: 'planned', label: 'geplant' },
        { value: 'current', label: 'läuft gerade' },
        { value: 'done', label: 'abgeschlossen' }
      ]
    });
    var fieldDescription = ui.textField({ label: 'Kurzbeschreibung', value: data.description, full: true, multiline: true, rows: 3 });

    return BAO.modal.open({
      title: isNew ? 'Neue Unterrichtsreihe' : 'Unterrichtsreihe bearbeiten',
      width: '560px',
      initialFocus: 'input',
      body: h('div.stack', {}, fieldTitle, h('div.grid2', {}, fieldYear, fieldStatus), fieldDescription),
      actions: [
        { label: 'Abbrechen', value: null, kind: 'ghost' },
        {
          label: isNew ? 'Anlegen' : 'Übernehmen', kind: 'primary',
          onSelect: function () {
            var title = fieldTitle.input.value.trim();
            if (!title) { fieldTitle.input.focus(); return false; }
            var values = {
              title: title,
              schoolYear: fieldYear.input.value.trim() || group.schoolYear,
              status: util.$('select', fieldStatus).value,
              description: fieldDescription.input.value.trim()
            };
            BAO.store.commit(isNew ? 'Unterrichtsreihe angelegt' : 'Unterrichtsreihe bearbeitet', function (draft) {
              if (isNew) draft.units.push(Object.assign(data, values));
              else {
                var target = select.unit(draft, data.id);
                if (target) Object.assign(target, values);
              }
              if (values.status === 'current') {
                draft.units.forEach(function (u) {
                  if (u.groupId === group.id && u.id !== data.id && u.status === 'current') u.status = 'done';
                });
              }
            });
            BAO.toast.undoable(isNew ? 'Unterrichtsreihe angelegt.' : 'Unterrichtsreihe aktualisiert.');
            return true;
          }
        }
      ]
    });
  }

  function removeUnit(unit) {
    var state = BAO.store.getState();
    var affected = state.lexemes.filter(function (l) { return l.introducedUnitId === unit.id; }).length;
    BAO.modal.confirm({
      title: 'Unterrichtsreihe löschen?',
      text: '„' + unit.title + '“ wird entfernt.',
      detail: affected
        ? affected + ' Wortschatzeinträge verlieren ihre Reihenzuordnung, bleiben aber im Bestand.'
        : 'Es sind keine Einträge zugeordnet.',
      confirmLabel: 'Löschen', danger: true
    }).then(function (confirmed) {
      if (!confirmed) return;
      BAO.store.commit('Unterrichtsreihe gelöscht', function (draft) {
        draft.units = draft.units.filter(function (u) { return u.id !== unit.id; });
        draft.lexemes.forEach(function (l) { if (l.introducedUnitId === unit.id) l.introducedUnitId = ''; });
        draft.banks.forEach(function (b) { if (b.unitId === unit.id) b.unitId = ''; });
      });
      BAO.toast.undoable('Unterrichtsreihe gelöscht.');
    });
  }

  /* --- Ansicht ------------------------------------------------------------------- */

  var UNIT_STATUS = { planned: 'geplant', current: 'läuft', done: 'abgeschlossen' };

  function groupCard(state, subject, group, app) {
    var units = select.unitsOfGroup(state, group.id);
    var counts = select.statusCounts(state, group.id);
    var banks = select.banksOfGroup(state, group.id).length;

    var unitList = h('div.grp__units');
    if (!units.length) {
      unitList.appendChild(h('span.hint', { text: 'Noch keine Unterrichtsreihe angelegt.' }));
    }
    units.forEach(function (unit) {
      var entries = state.lexemes.filter(function (l) { return l.introducedUnitId === unit.id; }).length;
      unitList.appendChild(h('div.unit-row', {},
        h('span.chip.chip--outline', { text: unit.schoolYear }),
        h('span.unit-row__title', { text: unit.title }),
        h('span.chip', { text: UNIT_STATUS[unit.status] || unit.status }),
        h('span.hint', { text: entries + ' ' + util.plural(entries, 'Eintrag', 'Einträge') }),
        h('span.spacer'),
        h('button.btn.btn--ghost.btn--sm.btn--icon', {
          type: 'button', title: 'Reihe bearbeiten', onclick: function () { editUnit(unit, group); }
        }, ui.icon('edit', 14)),
        h('button.btn.btn--ghost.btn--sm.btn--icon', {
          type: 'button', title: 'Reihe löschen', onclick: function () { removeUnit(unit); }
        }, ui.icon('trash', 14))
      ));
    });

    var history = h('div.timeline');
    (group.history || []).forEach(function (entry) {
      history.appendChild(h('div.timeline__row', {},
        h('span.timeline__year', { text: entry.schoolYear }),
        h('span', { text: 'Jahrgang ' + entry.grade + (entry.note ? ' · ' + entry.note : '') })
      ));
    });
    history.appendChild(h('div.timeline__row', {},
      h('span.timeline__year', { text: group.schoolYear }),
      h('span', { text: 'Jahrgang ' + group.grade + ' · aktuell' })
    ));

    return h('div.grp', {},
      h('div.grp__head', {},
        ui.favButton(group.favorite, function () {
          BAO.store.commit('Favorit geändert', function (draft) {
            var target = select.group(draft, group.id);
            if (target) target.favorite = !target.favorite;
          });
        }),
        h('span.grp__name', { text: group.name }),
        h('span.chip', { text: 'Jahrgang ' + group.grade }),
        h('span.chip.chip--outline', { text: group.schoolYear }),
        group.archived ? h('span.chip.chip--st-archived', {}, h('i.dot'), 'archiviert') : null,
        h('span.hint', {
          text: counts.total + ' Wörter · ' + banks + ' ' + util.plural(banks, 'Wortbank', 'Wortbanken')
        }),
        h('span.spacer'),
        h('button.btn.btn--sm', {
          type: 'button', text: 'Öffnen',
          onclick: function () { app.setContext(subject.id, group.id); app.go('wortschatz'); }
        }),
        h('button.btn.btn--sm', {
          type: 'button', text: 'Ins nächste Schuljahr',
          title: 'Jahrgangsstufe erhöhen und den Bestand mitnehmen',
          onclick: function () { promoteGroup(group); }
        }),
        h('button.btn.btn--ghost.btn--sm.btn--icon', {
          type: 'button', title: 'Lerngruppe bearbeiten', onclick: function () { editGroup(group, subject.id); }
        }, ui.icon('edit', 15)),
        h('button.btn.btn--ghost.btn--sm.btn--icon', {
          type: 'button', title: group.archived ? 'Aus dem Archiv holen' : 'Archivieren',
          onclick: function () {
            BAO.store.commit(group.archived ? 'Lerngruppe reaktiviert' : 'Lerngruppe archiviert', function (draft) {
              var target = select.group(draft, group.id);
              if (target) target.archived = !target.archived;
            });
            BAO.toast.undoable(group.archived ? 'Lerngruppe ist wieder aktiv.' : 'Lerngruppe archiviert.');
          }
        }, group.archived ? '↺' : ui.icon('archive', 15)),
        h('button.btn.btn--ghost.btn--sm.btn--icon', {
          type: 'button', title: 'Lerngruppe löschen', onclick: function () { removeGroup(group); }
        }, ui.icon('trash', 15))
      ),
      group.note ? h('div.hint', { text: group.note }) : null,
      h('details.form-more', {},
        h('summary', { text: 'Unterrichtsreihen und Verlauf' }),
        unitList,
        h('button.btn.btn--sm', {
          type: 'button', text: '+ Unterrichtsreihe', style: { 'margin-top': 'var(--sp-2)' },
          onclick: function () { editUnit(null, group); }
        }),
        h('div.section__head', { style: { 'margin-top': 'var(--sp-3)' } }, h('span.label', { text: 'Verlauf' })),
        history
      )
    );
  }

  function render(host, context) {
    var state = context.state;
    var app = context.app;
    var view = h('div.view');

    view.appendChild(h('div.view__head', {},
      h('div.view__title', {},
        h('h1', { text: 'Fächer und Lerngruppen' }),
        h('span.sub', { text: 'Fach → Lerngruppe → Unterrichtsreihe. Der Wortschatz gehört zur Lerngruppe und wächst mit ihr.' })
      ),
      h('div.spacer'),
      h('div.view__actions', {},
        h('button.btn', { type: 'button', onclick: function () { editSubject(null); } },
          ui.icon('plus', 16), 'Neues Fach')
      )
    ));

    if (!state.subjects.length) {
      view.appendChild(ui.emptyState({
        title: 'Noch kein Fach angelegt',
        text: 'Lege zuerst ein Fach an – zum Beispiel Französisch oder Englisch.',
        actionLabel: 'Fach anlegen', onAction: function () { editSubject(null); }
      }));
      host.appendChild(view);
      return;
    }

    var tree = h('div.tree');
    select.subjects(state).forEach(function (subject) {
      var groups = select.groupsOfSubject(state, subject.id, true);
      var node = h('div.tree__subject', { style: ui.subjectVars(subject) },
        h('div.tree__subjectHead', {},
          h('span.ctx-flag', { text: subject.short }),
          h('h2', { text: subject.name }),
          h('span.hint', { text: groups.length + ' ' + util.plural(groups.length, 'Lerngruppe', 'Lerngruppen') }),
          h('span.spacer'),
          h('button.btn.btn--sm', {
            type: 'button', text: '+ Lerngruppe', onclick: function () { editGroup(null, subject.id); }
          }),
          h('button.btn.btn--ghost.btn--sm.btn--icon', {
            type: 'button', title: 'Fach bearbeiten', onclick: function () { editSubject(subject); }
          }, ui.icon('edit', 15)),
          h('button.btn.btn--ghost.btn--sm.btn--icon', {
            type: 'button', title: 'Fach löschen', onclick: function () { removeSubject(subject); }
          }, ui.icon('trash', 15))
        )
      );
      var list = h('div.tree__groups');
      if (!groups.length) {
        list.appendChild(h('span.hint', { text: 'Noch keine Lerngruppe in diesem Fach.' }));
      }
      groups.forEach(function (group) { list.appendChild(groupCard(state, subject, group, app)); });
      node.appendChild(list);
      tree.appendChild(node);
    });

    view.appendChild(tree);
    host.appendChild(view);
  }

  BAO.views = BAO.views || {};
  BAO.views.manage = {
    render: render,
    editSubject: editSubject,
    editGroup: editGroup,
    editUnit: editUnit,
    promoteGroup: promoteGroup
  };
})(window.BAO = window.BAO || {});
