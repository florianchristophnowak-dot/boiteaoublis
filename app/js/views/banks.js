/* ==========================================================================
   Wortbanken der Lerngruppe
   Übersicht aller zusammengestellten Wortbanken samt Unterrichtsszene.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;
  var h = util.h;
  var ui = BAO.ui;
  var schema = BAO.schema;
  var select = BAO.select;

  var filters = { query: '', scene: 'all', unitId: 'all' };

  function createBank(ctx, app) {
    var state = BAO.store.getState();
    var fieldTitle = ui.textField({ label: 'Titel', value: '', placeholder: 'z. B. Partnergespräch über das Praktikum' });
    var fieldScene = ui.selectField({ label: 'Unterrichtsszene', value: 'Partnergespräch', options: ui.sceneOptions(state) });
    var fieldUnit = ui.selectField({
      label: 'Unterrichtsreihe', value: ctx.unit ? ctx.unit.id : '',
      options: ui.unitOptions(state, ctx.group.id)
    });
    var fieldLevel = ui.selectField({
      label: 'Start-Unterstützungsstufe', value: '2',
      options: schema.LEVELS.map(function (l) { return { value: String(l.id), label: l.id + ' – ' + l.name + ' (' + l.hint + ')' }; })
    });

    return BAO.modal.open({
      title: 'Neue Wortbank',
      subtitle: 'Eine Wortbank ist die Zusammenstellung für eine konkrete Unterrichtsphase.',
      width: '560px',
      initialFocus: 'input',
      body: h('div.stack', {}, fieldTitle, h('div.grid2', {}, fieldScene, fieldUnit), fieldLevel),
      actions: [
        { label: 'Abbrechen', value: null, kind: 'ghost' },
        {
          label: 'Anlegen und öffnen', kind: 'primary',
          onSelect: function () {
            var title = fieldTitle.input.value.trim();
            if (!title) { fieldTitle.input.focus(); return false; }
            var newId = null;
            BAO.store.commit('Wortbank angelegt', function (draft) {
              var bank = schema.makeBank({
                subjectId: ctx.subject.id, groupId: ctx.group.id,
                title: title,
                scene: util.$('select', fieldScene).value,
                unitId: util.$('select', fieldUnit).value,
                defaultLevel: parseInt(util.$('select', fieldLevel).value, 10) || 2,
                sections: [schema.makeSection({ title: 'Wortschatz' })]
              });
              draft.banks.push(bank);
              newId = bank.id;
            });
            BAO.toast.undoable('Wortbank „' + title + '“ angelegt.');
            if (newId) app.go('wortbank/' + newId);
            return true;
          }
        }
      ]
    });
  }

  function duplicate(bank, app) {
    var newId = null;
    BAO.store.commit('Wortbank dupliziert', function (draft) {
      var copy = util.clone(bank);
      copy.id = util.uid('bnk');
      copy.title = bank.title + ' (Kopie)';
      copy.favorite = false;
      copy.lastUsedAt = '';
      copy.createdAt = util.nowISO();
      copy.updatedAt = util.nowISO();
      copy.sections = (copy.sections || []).map(function (section) {
        section.id = util.uid('sec');
        section.items = (section.items || []).map(function (item) {
          item.id = util.uid('itm');
          return item;
        });
        return section;
      });
      draft.banks.push(copy);
      newId = copy.id;
    });
    BAO.toast.undoable('Kopie angelegt.');
    if (newId && app) app.go('wortbank/' + newId);
  }

  function remove(bank) {
    return BAO.modal.confirm({
      title: 'Wortbank löschen?',
      text: '„' + bank.title + '“ wird entfernt.',
      detail: 'Die enthaltenen Wortschatzeinträge und Satzanfänge bleiben im Bestand der Lerngruppe erhalten.',
      confirmLabel: 'Löschen', danger: true
    }).then(function (confirmed) {
      if (!confirmed) return;
      BAO.store.commit('Wortbank gelöscht', function (draft) {
        draft.banks = draft.banks.filter(function (b) { return b.id !== bank.id; });
        draft.ui.recentBanks = (draft.ui.recentBanks || []).filter(function (id) { return id !== bank.id; });
      });
      BAO.toast.undoable('Wortbank gelöscht.');
    });
  }

  function bankTile(state, bank, app) {
    var count = select.bankItemCount(bank);
    var unit = bank.unitId ? select.unit(state, bank.unitId) : null;
    var subject = select.subject(state, bank.subjectId);
    var sections = (bank.sections || []).length;

    return h('div.tile', {
      style: ui.subjectVars(subject),
      onclick: function () { app.go('wortbank/' + bank.id); }
    },
      h('span.tile__accent'),
      h('div.tile__top', {},
        h('span.tile__title', { text: bank.title }),
        h('span.spacer'),
        ui.favButton(bank.favorite, function () {
          BAO.store.commit('Favorit geändert', function (draft) {
            var target = select.bank(draft, bank.id);
            if (target) target.favorite = !target.favorite;
          });
        })
      ),
      h('div.row', {},
        h('span.chip.chip--outline', { text: bank.scene }),
        h('span.chip', { text: 'Stufe ' + bank.defaultLevel }),
        h('span.chip', { text: count + ' ' + util.plural(count, 'Eintrag', 'Einträge') }),
        h('span.chip', { text: sections + ' ' + util.plural(sections, 'Abschnitt', 'Abschnitte') })
      ),
      unit ? h('div.tile__meta', { text: 'Reihe: ' + unit.title }) : null,
      bank.note ? h('div.tile__meta', { text: bank.note }) : null,
      h('div.tile__foot', {},
        h('button.btn.btn--primary.btn--sm', {
          type: 'button',
          onclick: function (event) { event.stopPropagation(); app.projectBank(bank.id); }
        }, ui.icon('play', 15), 'Projizieren'),
        h('button.btn.btn--sm.btn--icon', {
          type: 'button', title: 'Duplizieren',
          onclick: function (event) { event.stopPropagation(); duplicate(bank, app); }
        }, ui.icon('copy', 15)),
        h('button.btn.btn--sm.btn--icon', {
          type: 'button', title: 'Löschen',
          onclick: function (event) { event.stopPropagation(); remove(bank); }
        }, ui.icon('trash', 15))
      )
    );
  }

  function render(host, context) {
    var state = context.state;
    var ctx = context.ctx;
    var app = context.app;
    var view = h('div.view');

    if (!ctx.group) {
      view.appendChild(ui.emptyState({
        title: 'Noch keine Lerngruppe',
        text: 'Wortbanken werden für eine Lerngruppe zusammengestellt.',
        actionLabel: 'Lerngruppe anlegen', onAction: function () { app.go('verwaltung'); }
      }));
      host.appendChild(view);
      return;
    }

    var all = select.banksOfGroup(state, ctx.group.id);
    var needle = util.fold(filters.query);
    var visible = all.filter(function (bank) {
      if (filters.scene !== 'all' && bank.scene !== filters.scene) return false;
      if (filters.unitId !== 'all' && bank.unitId !== filters.unitId) return false;
      if (needle && util.fold(bank.title + ' ' + bank.scene + ' ' + (bank.note || '')).indexOf(needle) < 0) return false;
      return true;
    });

    view.appendChild(h('div.view__head', {},
      h('div.view__title', {},
        h('h1', { text: 'Wortbanken' }),
        h('span.sub', {
          text: ctx.subject.name + ' · ' + ctx.group.name + ' · '
            + all.length + ' ' + util.plural(all.length, 'Wortbank', 'Wortbanken')
        })
      ),
      h('div.spacer'),
      h('div.view__actions', {},
        h('button.btn.btn--primary', {
          type: 'button', onclick: function () { createBank(ctx, app); }
        }, ui.icon('plus', 16), 'Neue Wortbank')
      )
    ));

    if (all.length) {
      view.appendChild(h('div.toolbar', {},
        h('input', {
          type: 'search', value: filters.query, placeholder: 'Wortbanken durchsuchen …',
          'aria-label': 'Wortbanken durchsuchen',
          oninput: function (event) { filters.query = event.target.value; app.scheduleRender(); }
        }),
        ui.selectField({
          value: filters.scene, ariaLabel: 'Nach Szene filtern',
          options: [{ value: 'all', label: 'Alle Szenen' }].concat(ui.sceneOptions(state)),
          onChange: function (value) { filters.scene = value; app.scheduleRender(); }
        }),
        ui.selectField({
          value: filters.unitId, ariaLabel: 'Nach Reihe filtern',
          options: [{ value: 'all', label: 'Alle Reihen' }].concat(select.unitsOfGroup(state, ctx.group.id).map(function (u) {
            return { value: u.id, label: u.title };
          })),
          onChange: function (value) { filters.unitId = value; app.scheduleRender(); }
        })
      ));
    }

    if (!all.length) {
      view.appendChild(ui.emptyState({
        title: 'Noch keine Wortbank',
        text: 'Eine Wortbank ist eine kleine, gezielte Auswahl aus dem Gesamtbestand – '
          + 'für ein Partnergespräch, eine Diskussion oder eine Schreibphase.',
        actionLabel: 'Erste Wortbank anlegen',
        onAction: function () { createBank(ctx, app); }
      }));
    } else if (!visible.length) {
      view.appendChild(ui.emptyState({
        title: 'Kein Treffer',
        text: 'Mit diesen Filtern gibt es keine Wortbank.',
        actionLabel: 'Filter zurücksetzen',
        onAction: function () { filters = { query: '', scene: 'all', unitId: 'all' }; app.scheduleRender(); }
      }));
    } else {
      var tiles = h('div.tiles.tiles--wide');
      visible.forEach(function (bank) { tiles.appendChild(bankTile(state, bank, app)); });
      tiles.appendChild(h('button.tile.tile--add', {
        type: 'button', onclick: function () { createBank(ctx, app); }
      }, ui.icon('plus', 22), h('span', { text: 'Neue Wortbank' })));
      view.appendChild(tiles);
    }

    host.appendChild(view);
  }

  BAO.views = BAO.views || {};
  BAO.views.banks = { render: render, duplicate: duplicate, remove: remove, createBank: createBank };
})(window.BAO = window.BAO || {});
