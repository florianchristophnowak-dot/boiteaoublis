/* ==========================================================================
   Wortbank zusammenstellen
   Links die Abschnitte der Wortbank (verschiebbar per Ziehen), rechts der
   Bestand der Lerngruppe zum Hinzufügen.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;
  var h = util.h;
  var ui = BAO.ui;
  var schema = BAO.schema;
  var select = BAO.select;

  var activeSectionByBank = {};
  var picker = { tab: 'lex', query: '', status: 'all', functionId: 'all' };

  function updateBank(bankId, label, mutator) {
    BAO.store.commit(label, function (draft) {
      var bank = select.bank(draft, bankId);
      if (!bank) return false;
      var result = mutator(bank, draft);
      bank.updatedAt = util.nowISO();
      return result;
    });
  }

  function itemLabel(state, item) {
    var resolved = select.resolveItem(state, item);
    if (!resolved) return { text: '(fehlender Eintrag)', meta: '' };
    if (resolved.kind === 'starter') {
      return { text: ui.plainStarterText(resolved.ref.text), meta: select.functionLabel(state, resolved.ref.functionId) };
    }
    return {
      text: ui.termLabel(resolved.ref),
      node: ui.termNode(resolved.ref),
      meta: resolved.ref.translation || resolved.ref.collocation || '',
      status: resolved.ref.status
    };
  }

  /* --- Ziehen und Ablegen ----------------------------------------------------- */

  function moveItem(bankId, fromSectionId, itemId, toSectionId, toIndex) {
    updateBank(bankId, 'Reihenfolge geändert', function (bank) {
      var from = bank.sections.filter(function (s) { return s.id === fromSectionId; })[0];
      var to = bank.sections.filter(function (s) { return s.id === toSectionId; })[0];
      if (!from || !to) return false;
      var index = from.items.findIndex(function (i) { return i.id === itemId; });
      if (index < 0) return false;
      var moved = from.items.splice(index, 1)[0];
      var target = toIndex;
      if (from === to && index < toIndex) target -= 1;
      to.items.splice(util.clamp(target, 0, to.items.length), 0, moved);
    });
  }

  function bindDragAndDrop(node, bankId, sectionId, itemId, index) {
    node.setAttribute('draggable', 'true');
    node.addEventListener('dragstart', function (event) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', JSON.stringify({ sectionId: sectionId, itemId: itemId }));
      node.classList.add('is-dragging');
    });
    node.addEventListener('dragend', function () {
      node.classList.remove('is-dragging');
      util.$$('.drop-before, .drop-after').forEach(function (el) { el.classList.remove('drop-before', 'drop-after'); });
    });
    node.addEventListener('dragover', function (event) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      var rect = node.getBoundingClientRect();
      var after = event.clientY > rect.top + rect.height / 2;
      node.classList.toggle('drop-after', after);
      node.classList.toggle('drop-before', !after);
    });
    node.addEventListener('dragleave', function () {
      node.classList.remove('drop-before', 'drop-after');
    });
    node.addEventListener('drop', function (event) {
      event.preventDefault();
      event.stopPropagation();
      var after = node.classList.contains('drop-after');
      node.classList.remove('drop-before', 'drop-after');
      var payload;
      try { payload = JSON.parse(event.dataTransfer.getData('text/plain')); } catch (err) { return; }
      if (!payload || !payload.itemId) return;
      moveItem(bankId, payload.sectionId, payload.itemId, sectionId, index + (after ? 1 : 0));
    });
  }

  function bindSectionDrop(node, bankId, sectionId) {
    node.addEventListener('dragover', function (event) {
      event.preventDefault();
      node.classList.add('is-dropzone');
    });
    node.addEventListener('dragleave', function () { node.classList.remove('is-dropzone'); });
    node.addEventListener('drop', function (event) {
      event.preventDefault();
      node.classList.remove('is-dropzone');
      var payload;
      try { payload = JSON.parse(event.dataTransfer.getData('text/plain')); } catch (err) { return; }
      if (!payload || !payload.itemId) return;
      var count = util.$$('.bitem', node).length;
      moveItem(bankId, payload.sectionId, payload.itemId, sectionId, count);
    });
  }

  /* --- Abschnitte -------------------------------------------------------------- */

  function sectionNode(state, bank, section, sectionIndex, app) {
    var isActive = activeSectionByBank[bank.id] === section.id;

    var titleInput = h('input', {
      type: 'text', value: section.title, 'aria-label': 'Titel des Abschnitts',
      onchange: function (event) {
        var value = event.target.value.trim() || 'Abschnitt';
        updateBank(bank.id, 'Abschnitt umbenannt', function (b) {
          var target = b.sections.filter(function (s) { return s.id === section.id; })[0];
          if (target) target.title = value;
        });
      }
    });

    var items = h('div.bsection__items');
    bindSectionDrop(items, bank.id, section.id);

    (section.items || []).forEach(function (item, index) {
      var label = itemLabel(state, item);
      var node = h('div.bitem', { dataset: { id: item.id } },
        h('span.bitem__grip', { text: '⠿', title: 'Zum Verschieben ziehen' }),
        item.kind === 'starter' ? ui.icon('quote', 14) : ui.icon('list', 14),
        h('span.bitem__label', { title: label.text + (label.meta ? ' – ' + label.meta : '') },
          label.node || label.text,
          label.meta ? h('span.bitem__kind', { text: '  ' + label.meta }) : null
        ),
        label.status ? ui.statusChip(label.status) : null,
        h('div.bitem__actions', {},
          h('button.btn.btn--ghost.btn--sm.btn--icon', {
            type: 'button', title: 'Aus der Wortbank entfernen',
            onclick: function () {
              updateBank(bank.id, 'Eintrag aus Wortbank entfernt', function (b) {
                var target = b.sections.filter(function (s) { return s.id === section.id; })[0];
                if (target) target.items = target.items.filter(function (i) { return i.id !== item.id; });
              });
              BAO.toast.undoable('Eintrag entfernt.');
            }
          }, '×')
        )
      );
      bindDragAndDrop(node, bank.id, section.id, item.id, index);
      items.appendChild(node);
    });

    if (!section.items.length) {
      items.appendChild(h('span.hint', {
        text: 'Noch leer – rechts Einträge anklicken oder Einträge hierher ziehen.'
      }));
    }

    return h('div.bsection', {
      dataset: { active: isActive ? 'true' : 'false' },
      style: isActive ? { 'border-color': 'var(--brand)' } : null,
      onclick: function () {
        if (activeSectionByBank[bank.id] === section.id) return;
        activeSectionByBank[bank.id] = section.id;
        app.scheduleRender();
      }
    },
      h('div.bsection__head', {},
        titleInput,
        ui.selectField({
          value: section.layout || 'auto', ariaLabel: 'Darstellung',
          options: [
            { value: 'auto', label: 'Darstellung: automatisch' },
            { value: 'cards', label: 'Darstellung: Einträge' },
            { value: 'impulse', label: 'Darstellung: Impulse' },
            { value: 'starters', label: 'Darstellung: Satzanfänge' }
          ],
          onChange: function (value) {
            updateBank(bank.id, 'Darstellung geändert', function (b) {
              var target = b.sections.filter(function (s) { return s.id === section.id; })[0];
              if (target) target.layout = value;
            });
          }
        }),
        h('span.chip', { text: section.items.length + '' }),
        h('button.btn.btn--ghost.btn--sm.btn--icon', {
          type: 'button', title: 'Nach oben', 'aria-label': 'Abschnitt nach oben',
          disabled: sectionIndex === 0 ? true : null,
          onclick: function () {
            updateBank(bank.id, 'Abschnitt verschoben', function (b) {
              util.moveInArray(b.sections, sectionIndex, sectionIndex - 1);
            });
          }
        }, '↑'),
        h('button.btn.btn--ghost.btn--sm.btn--icon', {
          type: 'button', title: 'Nach unten', 'aria-label': 'Abschnitt nach unten',
          disabled: sectionIndex === bank.sections.length - 1 ? true : null,
          onclick: function () {
            updateBank(bank.id, 'Abschnitt verschoben', function (b) {
              util.moveInArray(b.sections, sectionIndex, sectionIndex + 1);
            });
          }
        }, '↓'),
        h('button.btn.btn--ghost.btn--sm.btn--icon', {
          type: 'button', title: 'Abschnitt löschen',
          onclick: function () {
            BAO.modal.confirm({
              title: 'Abschnitt löschen?',
              text: '„' + section.title + '“ mit ' + section.items.length + ' Einträgen wird aus der Wortbank entfernt.',
              detail: 'Die Einträge selbst bleiben im Bestand erhalten.',
              confirmLabel: 'Löschen', danger: true
            }).then(function (confirmed) {
              if (!confirmed) return;
              updateBank(bank.id, 'Abschnitt gelöscht', function (b) {
                b.sections = b.sections.filter(function (s) { return s.id !== section.id; });
              });
              BAO.toast.undoable('Abschnitt gelöscht.');
            });
          }
        }, ui.icon('trash', 15))
      ),
      items
    );
  }

  /* --- Auswahlbereich ---------------------------------------------------------- */

  function addToActiveSection(bank, kind, refId, app) {
    var sectionId = activeSectionByBank[bank.id] || (bank.sections[0] && bank.sections[0].id);
    updateBank(bank.id, 'Eintrag hinzugefügt', function (b) {
      var section = b.sections.filter(function (s) { return s.id === sectionId; })[0];
      if (!section) {
        section = schema.makeSection({ title: kind === 'starter' ? 'Satzanfänge' : 'Wortschatz' });
        b.sections.push(section);
        activeSectionByBank[b.id] = section.id;
      }
      var exists = section.items.some(function (i) { return i.kind === kind && i.refId === refId; });
      if (exists) return false;
      section.items.push(schema.makeBankItem({ kind: kind, refId: refId }));
    });
  }

  function pickerCard(state, bank, ctx, app) {
    var inBank = {};
    (bank.sections || []).forEach(function (section) {
      (section.items || []).forEach(function (item) { inBank[item.kind + ':' + item.refId] = true; });
    });

    var list = h('div.picker__list');
    var needle = util.fold(picker.query);

    if (picker.tab === 'lex') {
      var lexemes = select.lexemesOfGroup(state, ctx.group.id).filter(function (lex) {
        if (picker.status !== 'all' && lex.status !== picker.status) return false;
        if (picker.status === 'all' && lex.status === 'archived') return false;
        if (needle && !BAO.search.matchesLexeme(lex, needle)) return false;
        return true;
      }).sort(function (a, b) { return util.fold(a.term).localeCompare(util.fold(b.term), 'de'); });

      if (!lexemes.length) {
        list.appendChild(h('span.hint', { text: 'Kein passender Eintrag im Bestand.' }));
      }
      lexemes.forEach(function (lex) {
        var used = inBank['lex:' + lex.id];
        list.appendChild(h('button.picker__item', {
          type: 'button', dataset: { inBank: used ? 'true' : 'false' },
          title: used ? 'Bereits in dieser Wortbank' : 'Zum aktiven Abschnitt hinzufügen',
          onclick: function () { addToActiveSection(bank, 'lex', lex.id, app); }
        },
          h('span.plus', { text: used ? '✓' : '+' }),
          h('span.bitem__label', { title: ui.termLabel(lex) }, ui.termNode(lex),
            lex.translation ? h('span.bitem__kind', { text: '  ' + lex.translation }) : null),
          ui.statusChip(lex.status)
        ));
      });
    } else {
      var starters = select.startersOfGroup(state, ctx.group.id, ctx.subject.id).filter(function (starter) {
        if (picker.functionId !== 'all' && starter.functionId !== picker.functionId) return false;
        if (needle && !BAO.search.matchesStarter(starter, needle)) return false;
        return true;
      });
      if (!starters.length) list.appendChild(h('span.hint', { text: 'Kein passender Satzanfang.' }));
      var byFunction = util.groupBy(starters, function (s) { return s.functionId; });
      select.functions(state).forEach(function (fn) {
        var group = byFunction.get(fn.id);
        if (!group) return;
        list.appendChild(h('div.palette__group', { text: fn.label }));
        group.forEach(function (starter) {
          var used = inBank['starter:' + starter.id];
          list.appendChild(h('button.picker__item', {
            type: 'button', dataset: { inBank: used ? 'true' : 'false' },
            onclick: function () { addToActiveSection(bank, 'starter', starter.id, app); }
          },
            h('span.plus', { text: used ? '✓' : '+' }),
            h('span.bitem__label', { text: ui.plainStarterText(starter.text) }),
            ui.variantPips(starter.variant)
          ));
        });
      });
    }

    var activeSection = (bank.sections || []).filter(function (s) {
      return s.id === (activeSectionByBank[bank.id] || (bank.sections[0] && bank.sections[0].id));
    })[0];

    return h('div.card.picker', {},
      h('div.card__head', {},
        h('h3', { text: 'Aus dem Bestand hinzufügen' })
      ),
      h('div.card__body', { style: { padding: 'var(--sp-3)', display: 'grid', gap: 'var(--sp-2)' } },
        h('div.row', {},
          h('button.btn.btn--sm', {
            type: 'button', 'aria-pressed': picker.tab === 'lex' ? 'true' : 'false',
            text: 'Wortschatz',
            onclick: function () { picker.tab = 'lex'; app.scheduleRender(); }
          }),
          h('button.btn.btn--sm', {
            type: 'button', 'aria-pressed': picker.tab === 'starter' ? 'true' : 'false',
            text: 'Satzanfänge',
            onclick: function () { picker.tab = 'starter'; app.scheduleRender(); }
          })
        ),
        h('input', {
          type: 'search', value: picker.query, placeholder: 'Suchen …', 'aria-label': 'Bestand durchsuchen',
          oninput: function (event) { picker.query = event.target.value; app.scheduleRender(); }
        }),
        picker.tab === 'lex'
          ? ui.selectField({
            value: picker.status, ariaLabel: 'Nach Status filtern',
            options: [{ value: 'all', label: 'Alle Status' }].concat(ui.statusOptions()),
            onChange: function (value) { picker.status = value; app.scheduleRender(); }
          })
          : ui.selectField({
            value: picker.functionId, ariaLabel: 'Nach Funktion filtern',
            options: [{ value: 'all', label: 'Alle Funktionen' }].concat(ui.functionOptions(state, false)),
            onChange: function (value) { picker.functionId = value; app.scheduleRender(); }
          }),
        h('div.note', {
          text: activeSection
            ? 'Neue Einträge kommen in den Abschnitt „' + activeSection.title + '“. Anderen Abschnitt anklicken, um dorthin zu ergänzen.'
            : 'Lege zuerst einen Abschnitt an.'
        })
      ),
      list
    );
  }

  /* --- Ansicht ------------------------------------------------------------------ */

  function render(host, context) {
    var state = context.state;
    var ctx = context.ctx;
    var app = context.app;
    var bank = select.bank(state, context.params[0]);
    var view = h('div.view');

    if (!bank) {
      view.appendChild(ui.emptyState({
        title: 'Wortbank nicht gefunden',
        text: 'Vielleicht wurde sie gelöscht oder die Adresse ist veraltet.',
        actionLabel: 'Zur Übersicht', onAction: function () { app.go('wortbanken'); }
      }));
      host.appendChild(view);
      return;
    }

    // Kontext an die Wortbank anpassen, damit der Bestand rechts passt.
    if (bank.groupId && state.ui.groupId !== bank.groupId) {
      app.setContext(bank.subjectId, bank.groupId);
      return;
    }
    if (!activeSectionByBank[bank.id] && bank.sections.length) {
      activeSectionByBank[bank.id] = bank.sections[0].id;
    }

    var count = select.bankItemCount(bank);

    view.appendChild(h('div.view__head', {},
      h('div.view__title', {},
        h('div.row', {},
          h('button.btn.btn--ghost.btn--sm', {
            type: 'button', text: '← Wortbanken', onclick: function () { app.go('wortbanken'); }
          }),
          ui.favButton(bank.favorite, function () {
            updateBank(bank.id, 'Favorit geändert', function (b) { b.favorite = !b.favorite; });
          })
        ),
        h('input', {
          type: 'text', value: bank.title, 'aria-label': 'Titel der Wortbank',
          style: {
            'font-size': 'var(--fs-2xl)', 'font-weight': '650', border: '1px solid transparent',
            background: 'transparent', padding: '2px 6px', 'font-family': 'var(--font-display)'
          },
          onchange: function (event) {
            var value = event.target.value.trim() || 'Wortbank';
            updateBank(bank.id, 'Wortbank umbenannt', function (b) { b.title = value; });
          }
        }),
        h('span.sub', {
          text: ctx.subject.name + ' · ' + ctx.group.name + ' · ' + count + ' '
            + util.plural(count, 'Eintrag', 'Einträge') + ' in ' + bank.sections.length + ' '
            + util.plural(bank.sections.length, 'Abschnitt', 'Abschnitten')
        })
      ),
      h('div.spacer'),
      h('div.view__actions', {},
        h('button.btn.btn--sm', {
          type: 'button', text: 'Duplizieren',
          onclick: function () { BAO.views.banks.duplicate(bank, app); }
        }),
        h('button.btn.btn--primary', {
          type: 'button',
          onclick: function () { app.projectBank(bank.id); }
        }, ui.icon('play', 16), 'Projizieren')
      )
    ));

    /* --- Eigenschaften ----------------------------------------------------- */
    var settings = h('div.card', {},
      h('div.card__body', {},
        h('div.grid3', {},
          ui.selectField({
            label: 'Unterrichtsszene', value: bank.scene, options: ui.sceneOptions(state),
            onChange: function (value) { updateBank(bank.id, 'Szene geändert', function (b) { b.scene = value; }); }
          }),
          ui.selectField({
            label: 'Unterrichtsreihe', value: bank.unitId, options: ui.unitOptions(state, bank.groupId),
            onChange: function (value) { updateBank(bank.id, 'Reihe geändert', function (b) { b.unitId = value; }); }
          }),
          ui.selectField({
            label: 'Start-Unterstützungsstufe', value: String(bank.defaultLevel),
            options: schema.LEVELS.map(function (l) { return { value: String(l.id), label: l.id + ' – ' + l.name }; }),
            onChange: function (value) {
              updateBank(bank.id, 'Stufe geändert', function (b) { b.defaultLevel = parseInt(value, 10) || 2; });
            }
          })
        ),
        ui.textField({
          label: 'Notiz für dich (erscheint nie auf dem Beamer)', value: bank.note, full: true,
          placeholder: 'z. B. Fishbowl, 20 Minuten, danach Stufe 1',
          onInput: util.debounce(function (value) {
            updateBank(bank.id, 'Notiz geändert', function (b) { b.note = value; });
          }, 600)
        })
      )
    );

    var sections = h('div.bank-sections');
    sections.appendChild(settings);
    (bank.sections || []).forEach(function (section, index) {
      sections.appendChild(sectionNode(state, bank, section, index, app));
    });
    sections.appendChild(h('button.btn.btn--wide', {
      type: 'button',
      onclick: function () {
        var newSectionId = null;
        updateBank(bank.id, 'Abschnitt angelegt', function (b) {
          var section = schema.makeSection({ title: 'Neuer Abschnitt' });
          b.sections.push(section);
          newSectionId = section.id;
        });
        if (newSectionId) activeSectionByBank[bank.id] = newSectionId;
      }
    }, ui.icon('plus', 15), 'Abschnitt hinzufügen'));

    view.appendChild(h('div.bank-editor', {}, sections, pickerCard(state, bank, ctx, app)));
    host.appendChild(view);
  }

  BAO.views = BAO.views || {};
  BAO.views.bankEditor = { render: render };
})(window.BAO = window.BAO || {});
