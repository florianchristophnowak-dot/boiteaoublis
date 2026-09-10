/* ==========================================================================
   Tafeln der Lerngruppe
   Die einfache Grundform: eine Fläche, Elemente darauf, sonst nichts.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;
  var h = util.h;
  var ui = BAO.ui;
  var schema = BAO.schema;
  var select = BAO.select;

  function createBoard(ctx, app, options) {
    options = options || {};
    var fieldTitle = ui.textField({
      label: 'Titel', value: options.title || '',
      placeholder: 'z. B. Wörter für das Partnergespräch'
    });

    return BAO.modal.open({
      title: 'Neue Tafel',
      subtitle: 'Eine leere Fläche. Elemente entstehen später einfach dort, wo sie stehen sollen.',
      width: '480px',
      initialFocus: 'input',
      body: h('div.stack', {}, fieldTitle,
        h('div.note', { text: 'Auf der Fläche genügt ein Doppelklick, um ein Element anzulegen – '
          + 'auch unmittelbar im Beamerfenster.' })
      ),
      actions: [
        { label: 'Abbrechen', value: null, kind: 'ghost' },
        {
          label: 'Anlegen und öffnen', kind: 'primary',
          onSelect: function () {
            var title = fieldTitle.input.value.trim();
            if (!title) { fieldTitle.input.focus(); return false; }
            var newId = null;
            BAO.store.commit('Tafel angelegt', function (draft) {
              var board = schema.makeBoard({
                subjectId: ctx.subject.id,
                groupId: ctx.group.id,
                unitId: ctx.unit ? ctx.unit.id : '',
                title: title
              });
              draft.boards.push(board);
              newId = board.id;
            });
            BAO.toast.undoable('Tafel „' + title + '“ angelegt.');
            if (newId) app.go('tafel/' + newId);
            return true;
          }
        }
      ]
    });
  }

  /** Übernimmt alle Einträge einer Wortbank auf eine neue Tafel. */
  function fromBank(ctx, app) {
    var state = BAO.store.getState();
    var banks = select.banksOfGroup(state, ctx.group.id);
    if (!banks.length) {
      BAO.toast.show('Für diese Lerngruppe gibt es noch keine Wortbank.');
      return null;
    }
    var fieldBank = ui.selectField({
      label: 'Wortbank', value: banks[0].id,
      options: banks.map(function (bank) {
        return { value: bank.id, label: bank.title + ' (' + select.bankItemCount(bank) + ')' };
      })
    });

    return BAO.modal.open({
      title: 'Tafel aus einer Wortbank',
      subtitle: 'Die Einträge werden gleichmäßig auf der Fläche verteilt und lassen sich danach frei verschieben.',
      width: '480px',
      body: h('div.stack', {}, fieldBank),
      actions: [
        { label: 'Abbrechen', value: null, kind: 'ghost' },
        {
          label: 'Tafel anlegen', kind: 'primary',
          onSelect: function () {
            var bankId = util.$('select', fieldBank).value;
            var newId = null;
            BAO.store.commit('Tafel aus Wortbank angelegt', function (draft) {
              var bank = select.bank(draft, bankId);
              if (!bank) return false;
              var flat = [];
              (bank.sections || []).forEach(function (section) {
                (section.items || []).forEach(function (item) {
                  if (select.resolveItem(draft, item)) flat.push(item);
                });
              });
              var cols = Math.max(1, Math.min(5, Math.ceil(Math.sqrt(flat.length * 1.6))));
              var rows = Math.max(1, Math.ceil(flat.length / cols));
              var board = schema.makeBoard({
                subjectId: bank.subjectId, groupId: bank.groupId, unitId: bank.unitId,
                title: bank.title,
                items: flat.map(function (item, index) {
                  return schema.makeBoardItem({
                    kind: item.kind, refId: item.refId,
                    x: ((index % cols) + 0.5) / cols,
                    y: (Math.floor(index / cols) + 0.5) / rows
                  });
                })
              });
              draft.boards.push(board);
              newId = board.id;
            });
            if (!newId) return true;
            BAO.toast.undoable('Tafel angelegt.');
            app.go('tafel/' + newId);
            return true;
          }
        }
      ]
    });
  }

  function duplicate(board, app) {
    var newId = null;
    BAO.store.commit('Tafel dupliziert', function (draft) {
      var copy = util.clone(board);
      copy.id = util.uid('brd');
      copy.title = board.title + ' (Kopie)';
      copy.favorite = false;
      copy.lastUsedAt = '';
      copy.createdAt = util.nowISO();
      copy.updatedAt = util.nowISO();
      copy.items = (copy.items || []).map(function (item) {
        item.id = util.uid('bit');
        return item;
      });
      draft.boards.push(copy);
      newId = copy.id;
    });
    BAO.toast.undoable('Kopie angelegt.');
    if (newId && app) app.go('tafel/' + newId);
  }

  function remove(board) {
    return BAO.modal.confirm({
      title: 'Tafel löschen?',
      text: '„' + board.title + '“ wird entfernt.',
      detail: 'Die Elemente selbst bleiben im Bestand der Lerngruppe erhalten.',
      confirmLabel: 'Löschen', danger: true
    }).then(function (confirmed) {
      if (!confirmed) return;
      BAO.store.commit('Tafel gelöscht', function (draft) {
        draft.boards = draft.boards.filter(function (b) { return b.id !== board.id; });
      });
      BAO.toast.undoable('Tafel gelöscht.');
    });
  }

  function boardTile(state, board, app) {
    var count = (board.items || []).length;
    var subject = select.subject(state, board.subjectId);

    return h('div.tile', {
      style: ui.subjectVars(subject),
      onclick: function () { app.go('tafel/' + board.id); }
    },
      h('span.tile__accent'),
      h('div.tile__top', {},
        h('span.tile__title', { text: board.title }),
        h('span.spacer'),
        ui.favButton(board.favorite, function () {
          BAO.store.commit('Favorit geändert', function (draft) {
            var target = select.board(draft, board.id);
            if (target) target.favorite = !target.favorite;
          });
        })
      ),
      h('div.row', {},
        h('span.chip', { text: count + ' ' + util.plural(count, 'Element', 'Elemente') }),
        board.showTranslation ? h('span.chip.chip--outline', { text: 'mit Deutsch' }) : null
      ),
      board.note ? h('div.tile__meta', { text: board.note }) : null,
      h('div.tile__foot', {},
        h('button.btn.btn--primary.btn--sm', {
          type: 'button',
          onclick: function (event) { event.stopPropagation(); app.projectBoard(board.id); }
        }, ui.icon('beamer', 15), 'Zeigen'),
        h('button.btn.btn--sm.btn--icon', {
          type: 'button', title: 'Duplizieren',
          onclick: function (event) { event.stopPropagation(); duplicate(board, app); }
        }, ui.icon('copy', 15)),
        h('button.btn.btn--sm.btn--icon', {
          type: 'button', title: 'Löschen',
          onclick: function (event) { event.stopPropagation(); remove(board); }
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
        text: 'Eine Tafel gehört zu einer Lerngruppe – so bleibt der Bestand über die Jahre beieinander.',
        actionLabel: 'Lerngruppe anlegen', onAction: function () { app.go('verwaltung'); }
      }));
      host.appendChild(view);
      return;
    }

    var all = select.boardsOfGroup(state, ctx.group.id);

    view.appendChild(h('div.view__head', {},
      h('div.view__title', {},
        h('h1', { text: 'Tafeln' }),
        h('span.sub', {
          text: ctx.subject.name + ' · ' + ctx.group.name + ' · '
            + all.length + ' ' + util.plural(all.length, 'Tafel', 'Tafeln')
        })
      ),
      h('div.spacer'),
      h('div.view__actions', {},
        select.banksOfGroup(state, ctx.group.id).length
          ? h('button.btn', { type: 'button', onclick: function () { fromBank(ctx, app); } },
            'Aus einer Wortbank')
          : null,
        h('button.btn.btn--primary', {
          type: 'button', onclick: function () { createBoard(ctx, app); }
        }, ui.icon('plus', 16), 'Neue Tafel')
      )
    ));

    if (!all.length) {
      view.appendChild(ui.emptyState({
        title: 'Noch keine Tafel',
        text: 'Eine Tafel ist eine leere Fläche für den Unterricht. Wörter und Sätze werden dort '
          + 'gleich behandelt: Ein Doppelklick legt ein Element an, Ziehen setzt es an seinen Platz – '
          + 'auch unmittelbar im Beamerfenster.',
        actionLabel: 'Erste Tafel anlegen',
        onAction: function () { createBoard(ctx, app); }
      }));
    } else {
      var tiles = h('div.tiles.tiles--wide');
      all.forEach(function (board) { tiles.appendChild(boardTile(state, board, app)); });
      tiles.appendChild(h('button.tile.tile--add', {
        type: 'button', onclick: function () { createBoard(ctx, app); }
      }, ui.icon('plus', 22), h('span', { text: 'Neue Tafel' })));
      view.appendChild(tiles);
    }

    host.appendChild(view);
  }

  BAO.views = BAO.views || {};
  BAO.views.boards = {
    render: render, createBoard: createBoard, fromBank: fromBank,
    duplicate: duplicate, remove: remove
  };
})(window.BAO = window.BAO || {});
