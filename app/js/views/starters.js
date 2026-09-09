/* ==========================================================================
   Satzanfänge und kommunikative Sprachmittel
   Eigener Inhaltstyp, geordnet nach kommunikativen Funktionen und in drei
   Anspruchsvarianten. Leerstellen werden als "___" geschrieben und ruhig als
   Linie dargestellt.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;
  var h = util.h;
  var ui = BAO.ui;
  var schema = BAO.schema;
  var select = BAO.select;

  var filters = { query: '', variant: 'all', functionId: 'all' };

  function openEditor(starter, defaults) {
    var state = BAO.store.getState();
    defaults = defaults || {};
    var isNew = !starter;
    var data = starter ? util.clone(starter) : schema.makeStarter({
      subjectId: defaults.subjectId, groupId: defaults.groupId,
      functionId: defaults.functionId || (state.functions[0] && state.functions[0].id) || '',
      variant: defaults.variant || 'standard',
      text: defaults.text || ''
    });

    var fieldText = ui.textField({
      label: 'Satzanfang', value: data.text, full: true,
      placeholder: 'À mon avis, ___.',
      hint: 'Die Leerstelle erscheint in der Projektion als ruhige Linie. '
        + 'Auch „…“ oder „...“ werden als Leerstelle erkannt.',
      action: {
        label: 'Leerstelle einfügen',
        title: 'Setzt eine Leerstelle an der Cursorposition ein',
        onClick: function (input) { util.insertAtCursor(input, '___'); }
      }
    });
    var fieldTranslation = ui.textField({ label: 'Deutsche Entsprechung (optional)', value: data.translation, full: true });
    var fieldFunction = ui.functionField({
      state: state, value: data.functionId,
      label: 'Verwendung (kommunikative Funktion)',
      hint: 'Frei benennbar: vorhandene Bezeichnung wählen oder eine neue eintippen.'
    });
    var fieldVariant = ui.selectField({
      label: 'Anspruch', value: data.variant,
      options: schema.STARTER_VARIANTS.map(function (v) { return { value: v.id, label: v.label + ' – ' + v.hint }; })
    });
    var fieldScope = ui.selectField({
      label: 'Verfügbar für', value: data.groupId ? 'group' : 'subject',
      options: [
        { value: 'group', label: 'nur diese Lerngruppe' },
        { value: 'subject', label: 'alle Lerngruppen des Fachs' }
      ]
    });
    var tags = (data.tags || []).slice();
    var fieldTags = ui.tagEditor(tags, { label: 'Schlagwörter', onChange: function (v) { tags = v; } });

    var preview = h('div.starter', {}, h('div.starter__text'));
    function refreshPreview() {
      var node = util.$('.starter__text', preview);
      util.clear(node);
      node.appendChild(ui.gapText(fieldText.input.value || '…', document));
    }
    fieldText.input.addEventListener('input', refreshPreview);
    refreshPreview();

    return BAO.modal.open({
      title: isNew ? 'Neuer Satzanfang' : 'Satzanfang bearbeiten',
      width: '620px',
      initialFocus: 'input',
      body: h('div.stack', {},
        fieldText, preview, fieldTranslation,
        h('div.grid2', {}, fieldFunction, fieldVariant, fieldScope, fieldTags)
      ),
      actions: [
        { label: 'Abbrechen', value: null, kind: 'ghost' },
        {
          label: isNew ? 'Speichern' : 'Änderungen übernehmen', kind: 'primary',
          onSelect: function () {
            var text = fieldText.input.value.trim();
            if (!text) { fieldText.input.focus(); return false; }
            var values = {
              text: text,
              translation: fieldTranslation.input.value.trim(),
              variant: util.$('select', fieldVariant).value,
              groupId: util.$('select', fieldScope).value === 'group' ? (data.groupId || defaults.groupId) : '',
              tags: tags,
              updatedAt: util.nowISO()
            };
            BAO.store.commit(isNew ? 'Satzanfang angelegt' : 'Satzanfang bearbeitet', function (draft) {
              // Eine neu eingetippte Verwendung wird hier angelegt.
              values.functionId = fieldFunction.resolve(draft);
              if (isNew) draft.starters.push(Object.assign(data, values));
              else {
                var target = select.starter(draft, data.id);
                if (target) Object.assign(target, values);
              }
            });
            BAO.toast.undoable(isNew ? 'Satzanfang angelegt.' : 'Satzanfang aktualisiert.');
            return true;
          }
        }
      ]
    });
  }

  function duplicateAsVariant(starter) {
    var order = ['einfach', 'standard', 'anspruchsvoll'];
    var nextVariant = order[Math.min(order.indexOf(starter.variant) + 1, order.length - 1)];
    var copyId = null;
    BAO.store.commit('Variante angelegt', function (draft) {
      var copy = schema.makeStarter(Object.assign(util.clone(starter), {
        id: util.uid('sta'), variant: nextVariant, createdAt: util.nowISO(), updatedAt: util.nowISO()
      }));
      draft.starters.push(copy);
      copyId = copy.id;
    });
    BAO.toast.undoable('Variante angelegt – jetzt anpassen.');
    var created = select.starter(BAO.store.getState(), copyId);
    if (created) openEditor(created);
  }

  function remove(starter) {
    var usage = select.usageOfEntry(BAO.store.getState(), starter.id, 'starter').length;
    BAO.modal.confirm({
      title: 'Satzanfang löschen?',
      text: ui.plainStarterText(starter.text),
      detail: usage
        ? 'Er wird in ' + usage + ' ' + util.plural(usage, 'Wortbank', 'Wortbanken') + ' verwendet und dort ebenfalls entfernt.'
        : 'Das lässt sich direkt rückgängig machen.',
      confirmLabel: 'Löschen', danger: true
    }).then(function (confirmed) {
      if (!confirmed) return;
      BAO.store.commit('Satzanfang gelöscht', function (draft) {
        draft.starters = draft.starters.filter(function (s) { return s.id !== starter.id; });
        draft.banks.forEach(function (bank) {
          (bank.sections || []).forEach(function (section) {
            section.items = section.items.filter(function (item) {
              return !(item.kind === 'starter' && item.refId === starter.id);
            });
          });
        });
      });
      BAO.toast.undoable('Satzanfang gelöscht.');
    });
  }

  function starterRow(starter, ctx) {
    var text = h('div.starter__text');
    text.appendChild(ui.gapText(starter.text, document));

    return h('div.starter', {},
      ui.variantPips(starter.variant),
      h('div', { style: { flex: '1 1 auto', 'min-width': '0' } },
        text,
        starter.translation ? h('div.starter__de', { text: starter.translation }) : null
      ),
      !starter.groupId ? h('span.chip.chip--tag', { title: 'gilt für alle Lerngruppen des Fachs', text: 'fachweit' }) : null,
      h('div.starter__actions', {},
        h('button.btn.btn--ghost.btn--sm.btn--icon', {
          type: 'button', title: 'In eine Wortbank übernehmen',
          onclick: function () { BAO.views.vocab.openAddToBank([starter.id], 'starter', ctx.group.id, ctx.subject.id); }
        }, ui.icon('grid', 15)),
        h('button.btn.btn--ghost.btn--sm.btn--icon', {
          type: 'button', title: 'Variante mit anderem Anspruch anlegen',
          onclick: function () { duplicateAsVariant(starter); }
        }, ui.icon('copy', 15)),
        h('button.btn.btn--ghost.btn--sm.btn--icon', {
          type: 'button', title: 'Bearbeiten', onclick: function () { openEditor(starter); }
        }, ui.icon('edit', 15)),
        h('button.btn.btn--ghost.btn--sm.btn--icon', {
          type: 'button', title: 'Löschen', onclick: function () { remove(starter); }
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
        text: 'Satzanfänge gehören zu einem Fach und können einer Lerngruppe zugeordnet werden.',
        actionLabel: 'Lerngruppe anlegen', onAction: function () { app.go('verwaltung'); }
      }));
      host.appendChild(view);
      return;
    }

    var all = select.startersOfGroup(state, ctx.group.id, ctx.subject.id);
    var usedFunctions = util.unique(all.map(function (s) { return s.functionId || ''; })).length;
    var needle = util.fold(filters.query);
    var visible = all.filter(function (starter) {
      if (filters.variant !== 'all' && starter.variant !== filters.variant) return false;
      if (filters.functionId !== 'all' && starter.functionId !== filters.functionId) return false;
      if (needle && !BAO.search.matchesStarter(starter, needle)) return false;
      return true;
    });

    view.appendChild(h('div.view__head', {},
      h('div.view__title', {},
        h('h1', { text: 'Satzanfänge' }),
        h('span.sub', {
          text: ctx.subject.name + ' · ' + ctx.group.name + ' · '
            + all.length + ' ' + util.plural(all.length, 'Formulierung', 'Formulierungen')
            + ' in ' + usedFunctions + ' ' + util.plural(usedFunctions, 'Verwendung', 'Verwendungen')
        })
      ),
      h('div.spacer'),
      h('div.view__actions', {},
        h('button.btn.btn--primary', {
          type: 'button',
          onclick: function () {
            openEditor(null, {
              subjectId: ctx.subject.id, groupId: ctx.group.id,
              functionId: filters.functionId !== 'all' ? filters.functionId : ''
            });
          }
        }, ui.icon('plus', 16), 'Neuer Satzanfang')
      )
    ));

    view.appendChild(h('div.toolbar', {},
      h('input', {
        type: 'search', value: filters.query, placeholder: 'Satzanfänge durchsuchen …',
        'aria-label': 'Satzanfänge durchsuchen',
        oninput: function (event) { filters.query = event.target.value; app.scheduleRender(); }
      }),
      ui.selectField({
        value: filters.functionId, ariaLabel: 'Nach Verwendung filtern',
        options: [{ value: 'all', label: 'Alle Verwendungen' }].concat(ui.functionOptions(state, false)),
        onChange: function (value) { filters.functionId = value; app.scheduleRender(); }
      }),
      ui.selectField({
        value: filters.variant, ariaLabel: 'Nach Anspruch filtern',
        options: [{ value: 'all', label: 'Alle Varianten' }].concat(schema.STARTER_VARIANTS.map(function (v) {
          return { value: v.id, label: v.label };
        })),
        onChange: function (value) { filters.variant = value; app.scheduleRender(); }
      }),
      h('span.spacer'),
      h('span.hint', { style: { display: 'flex', gap: 'var(--sp-2)', 'align-items': 'center' } },
        schema.STARTER_VARIANTS.map(function (variant) {
          return h('span', { style: { display: 'flex', gap: '4px', 'align-items': 'center' } },
            ui.variantPips(variant.id), variant.label);
        })
      )
    ));

    if (!visible.length) {
      view.appendChild(ui.emptyState({
        title: all.length ? 'Kein Treffer' : 'Noch keine Satzanfänge',
        text: all.length
          ? 'Andere Funktion oder Variante wählen – oder die Suche leeren.'
          : 'Sammle typische Formulierungen: eine Meinung äußern, begründen, widersprechen, zusammenfassen …',
        actionLabel: all.length ? 'Filter zurücksetzen' : 'Ersten Satzanfang anlegen',
        onAction: function () {
          if (all.length) { filters = { query: '', variant: 'all', functionId: 'all' }; app.scheduleRender(); }
          else openEditor(null, { subjectId: ctx.subject.id, groupId: ctx.group.id });
        }
      }));
      host.appendChild(view);
      return;
    }

    var byFunction = util.groupBy(visible, function (s) { return s.functionId || ''; });
    select.functions(state).concat([{ id: '', label: 'ohne Funktion', order: 999 }]).forEach(function (fn) {
      var list = byFunction.get(fn.id);
      if (!list || !list.length) return;
      var order = { einfach: 0, standard: 1, anspruchsvoll: 2 };
      list = list.slice().sort(function (a, b) { return (order[a.variant] || 1) - (order[b.variant] || 1); });

      var group = h('section.func-group', {},
        h('div.func-group__head', {},
          h('h3', { text: fn.label }),
          h('span.chip', { text: list.length + ' ' + util.plural(list.length, 'Formulierung', 'Formulierungen') }),
          h('span.spacer'),
          h('button.btn.btn--sm', {
            type: 'button', text: 'Alle in Wortbank',
            title: 'Alle Formulierungen dieser Funktion in eine Wortbank übernehmen',
            onclick: function () {
              BAO.views.vocab.openAddToBank(list.map(function (s) { return s.id; }), 'starter', ctx.group.id, ctx.subject.id);
            }
          })
        )
      );
      list.forEach(function (starter) { group.appendChild(starterRow(starter, ctx)); });
      view.appendChild(group);
    });

    host.appendChild(view);
  }

  BAO.views = BAO.views || {};
  BAO.views.starters = { render: render, openEditor: openEditor };
})(window.BAO = window.BAO || {});
