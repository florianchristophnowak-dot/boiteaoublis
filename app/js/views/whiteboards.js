/* ==========================================================================
   Whiteboards der Lerngruppe
   Eine unbegrenzte Fläche für Handschrift – mit dem Stift geschrieben, mit
   dem Finger verschoben und gezoomt. Jedes Whiteboard gehört wie eine Tafel
   einer Lerngruppe, damit es dort wieder auftaucht, wo es hingehört.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;
  var h = util.h;
  var ui = BAO.ui;
  var schema = BAO.schema;
  var select = BAO.select;

  function backgroundLabel(id) {
    var found = schema.WHITEBOARD_BACKGROUNDS.filter(function (b) { return b.id === id; })[0];
    return found ? found.label : 'Blanko';
  }

  /**
   * Neues Whiteboard. Fach und Lerngruppe werden ausdrücklich gewählt;
   * vorgeschlagen wird der aktuelle Arbeitskontext.
   */
  function createWhiteboard(ctx, app, options) {
    options = options || {};
    var state = BAO.store.getState();

    var fieldTitle = ui.textField({
      label: 'Titel', value: options.title || '',
      placeholder: 'z. B. Tafelbild zur Stunde am Montag'
    });

    var groupSelect = h('select', { 'aria-label': 'Lerngruppe wählen' });
    var fieldGroup = h('div.field', {}, h('label', { text: 'Lerngruppe (Klasse)' }), groupSelect);

    function fillGroups(subjectId, preferred) {
      util.clear(groupSelect);
      var groups = select.groupsOfSubject(state, subjectId);
      if (!groups.length) {
        groupSelect.appendChild(h('option', { value: '', text: 'keine Lerngruppe in diesem Fach' }));
        return;
      }
      groups.forEach(function (group) {
        groupSelect.appendChild(h('option', {
          value: group.id,
          text: group.name + ' · Jg. ' + group.grade + (group.favorite ? ' ★' : ''),
          selected: group.id === preferred ? true : null
        }));
      });
    }

    var fieldSubject = ui.selectField({
      label: 'Fach (Sprache)',
      value: ctx.subject.id,
      options: select.subjects(state).map(function (subject) {
        return { value: subject.id, label: subject.name };
      }),
      onChange: function (value) { fillGroups(value, ''); }
    });
    fillGroups(ctx.subject.id, ctx.group ? ctx.group.id : '');

    var fieldBackground = ui.selectField({
      label: 'Hintergrund',
      value: options.background || 'plain',
      options: schema.WHITEBOARD_BACKGROUNDS.map(function (b) { return { value: b.id, label: b.label }; })
    });

    return BAO.modal.open({
      title: 'Neues Whiteboard',
      subtitle: 'Eine unbegrenzte Fläche für Handschrift. Der Stift schreibt, der Finger verschiebt und zoomt.',
      width: '520px',
      initialFocus: 'input',
      body: h('div.stack', {}, fieldTitle,
        h('div.grid2', {}, fieldSubject, fieldGroup),
        fieldBackground,
        h('div.note', { text: 'Alles bleibt in jeder Vergrößerung scharf, und die Fläche hat keinen Rand: '
          + 'Wer nach rechts oder unten schiebt, bekommt einfach mehr Platz.' })
      ),
      actions: [
        { label: 'Abbrechen', value: null, kind: 'ghost' },
        {
          label: 'Anlegen und öffnen', kind: 'primary',
          onSelect: function () {
            var title = fieldTitle.input.value.trim();
            if (!title) { fieldTitle.input.focus(); return false; }
            var subjectId = util.$('select', fieldSubject).value;
            var groupId = groupSelect.value;
            if (!groupId) {
              BAO.toast.error('Dieses Fach hat noch keine Lerngruppe. Bitte zuerst unter „Lerngruppen“ eine anlegen.');
              return false;
            }
            var newId = null;
            BAO.store.commit('Whiteboard angelegt', function (draft) {
              var board = schema.makeWhiteboard({
                subjectId: subjectId,
                groupId: groupId,
                unitId: (select.currentUnit(draft, groupId) || {}).id || '',
                title: title,
                background: util.$('select', fieldBackground).value
              });
              draft.whiteboards.push(board);
              newId = board.id;
            });
            BAO.toast.undoable('Whiteboard „' + title + '“ angelegt.');
            app.setContext(subjectId, groupId);
            if (newId) app.go('whiteboard/' + newId);
            return true;
          }
        }
      ]
    });
  }

  function duplicate(board, app) {
    var newId = null;
    BAO.store.commit('Whiteboard dupliziert', function (draft) {
      var copy = util.clone(board);
      copy.id = util.uid('wbd');
      copy.title = board.title + ' (Kopie)';
      copy.favorite = false;
      copy.lastUsedAt = '';
      copy.createdAt = util.nowISO();
      copy.updatedAt = util.nowISO();
      copy.strokes = (copy.strokes || []).map(function (stroke) {
        stroke.id = util.uid('stk');
        return stroke;
      });
      draft.whiteboards.push(copy);
      newId = copy.id;
    });
    BAO.toast.undoable('Kopie angelegt.');
    if (newId && app) app.go('whiteboard/' + newId);
  }

  function remove(board) {
    var count = (board.strokes || []).length;
    return BAO.modal.confirm({
      title: 'Whiteboard löschen?',
      text: '„' + board.title + '“ wird entfernt.',
      detail: count ? count + ' ' + util.plural(count, 'Strich', 'Striche') + ' gehen damit verloren. Rückgängig ist möglich.' : '',
      confirmLabel: 'Löschen', danger: true
    }).then(function (confirmed) {
      if (!confirmed) return;
      BAO.store.commit('Whiteboard gelöscht', function (draft) {
        draft.whiteboards = draft.whiteboards.filter(function (b) { return b.id !== board.id; });
      });
      BAO.toast.undoable('Whiteboard gelöscht.');
    });
  }

  function thumbnail(board) {
    var canvas = BAO.whiteboard.thumbnail(board, 340, 170);
    canvas.className = 'wb-thumb';
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    return canvas;
  }

  function tile(state, board, app) {
    var count = (board.strokes || []).length;
    var subject = select.subject(state, board.subjectId);

    return h('div.tile', {
      style: ui.subjectVars(subject),
      dataset: { whiteboardId: board.id },
      onclick: function () { app.go('whiteboard/' + board.id); }
    },
      h('span.tile__accent'),
      h('div.tile__top', {},
        h('span.tile__title', { text: board.title }),
        h('span.spacer'),
        ui.favButton(board.favorite, function () {
          BAO.store.commit('Favorit geändert', function (draft) {
            var target = select.whiteboard(draft, board.id);
            if (target) target.favorite = !target.favorite;
          });
        })
      ),
      thumbnail(board),
      h('div.row', {},
        h('span.chip', { text: count + ' ' + util.plural(count, 'Strich', 'Striche') }),
        h('span.chip.chip--outline', { text: backgroundLabel(board.background) }),
        board.lastUsedAt ? h('span.tile__meta', { text: 'zuletzt ' + util.relativeDate(board.lastUsedAt) }) : null
      ),
      board.note ? h('div.tile__meta', { text: board.note }) : null,
      h('div.tile__foot', {},
        h('button.btn.btn--primary.btn--sm', {
          type: 'button',
          onclick: function (event) { event.stopPropagation(); app.go('whiteboard/' + board.id); }
        }, ui.icon('pen', 15), 'Öffnen'),
        count ? h('button.btn.btn--sm.btn--icon', {
          type: 'button', title: 'Als Bild speichern (PNG)', 'aria-label': 'Als Bild speichern',
          onclick: function (event) { event.stopPropagation(); BAO.whiteboardImage.savePng(board); }
        }, ui.icon('download', 15)) : null,
        h('button.btn.btn--sm.btn--icon', {
          type: 'button', title: 'Duplizieren',
          onclick: function (event) { event.stopPropagation(); duplicate(board, app); }
        }, ui.icon('copy', 15)),
        BAO.handover.copyButton('whiteboard', board, state, app),
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
        text: 'Ein Whiteboard gehört zu einer Lerngruppe – so bleibt alles über die Jahre beieinander.',
        actionLabel: 'Lerngruppe anlegen', onAction: function () { app.go('verwaltung'); }
      }));
      host.appendChild(view);
      return;
    }

    var all = select.whiteboardsOfGroup(state, ctx.group.id);

    view.appendChild(h('div.view__head', {},
      h('div.view__title', {},
        h('h1', { text: 'Whiteboards' }),
        h('span.sub', {
          text: ctx.subject.name + ' · ' + ctx.group.name + ' · '
            + all.length + ' ' + util.plural(all.length, 'Whiteboard', 'Whiteboards')
        })
      ),
      h('div.spacer'),
      h('div.view__actions', {},
        h('button.btn.btn--primary', {
          type: 'button', onclick: function () { createWhiteboard(ctx, app); }
        }, ui.icon('plus', 16), 'Neues Whiteboard')
      )
    ));

    if (!all.length) {
      view.appendChild(ui.emptyState({
        title: 'Noch kein Whiteboard',
        text: 'Ein Whiteboard ist eine unbegrenzte Fläche für Handschrift: Mit dem Stift schreiben, '
          + 'mit einem Finger verschieben, mit zwei Fingern zoomen. Dazu Textmarker, Radierer, '
          + 'Unterstreichungen und Korrekturzeichen wie Häkchen.',
        actionLabel: 'Erstes Whiteboard anlegen',
        onAction: function () { createWhiteboard(ctx, app); }
      }));
    } else {
      var tiles = h('div.tiles.tiles--wide');
      all.forEach(function (board) { tiles.appendChild(tile(state, board, app)); });
      tiles.appendChild(h('button.tile.tile--add', {
        type: 'button', onclick: function () { createWhiteboard(ctx, app); }
      }, ui.icon('plus', 22), h('span', { text: 'Neues Whiteboard' })));
      view.appendChild(tiles);
    }

    host.appendChild(view);
  }

  BAO.views = BAO.views || {};
  BAO.views.whiteboards = {
    render: render, createWhiteboard: createWhiteboard, duplicate: duplicate, remove: remove
  };
})(window.BAO = window.BAO || {});
