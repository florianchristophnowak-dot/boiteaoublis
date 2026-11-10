/* ==========================================================================
   Weitergeben innerhalb des Bestands
   - Eine Tafel, ein Whiteboard oder eine Wortbank für eine andere Lerngruppe
     desselben Fachs kopieren – die Parallelklasse bekommt dieselbe Stunde.
   - Der Hinweis auf die mitgelieferten Beispieldaten.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;
  var h = util.h;
  var ui = BAO.ui;
  var select = BAO.select;

  var KINDS = {
    board: { label: 'Tafel', copy: 'copyBoardTo', path: 'tafel/', withStock: true },
    whiteboard: { label: 'Whiteboard', copy: 'copyWhiteboardTo', path: 'whiteboard/', withStock: false },
    bank: { label: 'Wortbank', copy: 'copyBankTo', path: 'wortbank/', withStock: true }
  };

  /** Gibt es eine Lerngruppe, für die sich eine Kopie anlegen ließe? */
  function canCopy(state, item) {
    return !!item && BAO.stock.siblingGroups(state, item).length > 0;
  }

  /**
   * Fragt die Ziel-Lerngruppe ab und legt die Kopie an.
   * kind: 'board' | 'whiteboard' | 'bank'
   */
  function copyToGroup(kind, item, app) {
    var info = KINDS[kind];
    var state = BAO.store.getState();
    var groups = info ? BAO.stock.siblingGroups(state, item) : [];
    if (!groups.length) return null;

    var groupSelect = ui.selectField({
      label: 'Für welche Lerngruppe?',
      value: groups[0].id,
      options: groups.map(function (g) { return { value: g.id, label: g.name + ' · Jg. ' + g.grade }; })
    });

    return BAO.modal.open({
      title: info.label + ' für eine andere Lerngruppe kopieren',
      subtitle: '„' + item.title + '“ – zum Beispiel für die Parallelklasse.',
      width: '520px',
      body: h('div.stack', {},
        groupSelect,
        h('div.note', {
          text: info.withStock
            ? 'Was es im Bestand der anderen Lerngruppe noch nicht gibt, kommt dort als „neu“ hinzu. '
              + 'Einträge, die dort schon stehen, werden verwendet – es entstehen keine Dubletten.'
            : 'Die Handschrift wird vollständig kopiert. Das Original bleibt unverändert.'
        })
      ),
      actions: [
        { label: 'Abbrechen', value: null, kind: 'ghost' },
        {
          label: 'Kopie anlegen', kind: 'primary',
          onSelect: function () {
            var targetId = util.$('select', groupSelect).value;
            var report = null;
            BAO.store.commit(info.label + ' für eine andere Lerngruppe kopiert', function (draft) {
              report = BAO.stock[info.copy](draft, item.id, targetId);
              if (!report) return false;
            });
            if (!report) { BAO.toast.error('Die Kopie ließ sich nicht anlegen.'); return false; }
            var target = { id: report.group.id, subjectId: report.group.subjectId, name: report.group.name };
            var parts = [];
            if (report.created) parts.push(report.created + ' ' + util.plural(report.created, 'Eintrag', 'Einträge') + ' neu im Bestand');
            if (report.reused) parts.push(report.reused + ' dort schon vorhanden');
            BAO.toast.show('Kopie für ' + target.name + ' angelegt' + (parts.length ? ' – ' + parts.join(', ') : '') + '.', {
              actionLabel: 'Öffnen', timeout: 9000,
              onAction: function () {
                app.setContext(target.subjectId, target.id);
                app.go(info.path + report.id);
              }
            });
            return true;
          }
        }
      ]
    });
  }

  /** Der Knopf für die Kacheln – nur dort, wo es eine zweite Lerngruppe gibt. */
  function copyButton(kind, item, state, app) {
    if (!canCopy(state, item)) return null;
    return h('button.btn.btn--sm.btn--icon', {
      type: 'button',
      title: 'Für eine andere Lerngruppe kopieren',
      'aria-label': 'Für eine andere Lerngruppe kopieren',
      onclick: function (event) { event.stopPropagation(); copyToGroup(kind, item, app); }
    }, ui.icon('share', 15));
  }

  /**
   * Solange die Beispiel-Lerngruppe geöffnet ist: ein Hinweis, dass dies
   * Beispiele sind – mit dem Weg zur eigenen Lerngruppe. Lässt sich ausblenden.
   */
  function sampleNote(state, app) {
    if (state.ui.sampleNoteHidden || !BAO.stock.hasSampleData(state)) return null;
    var open = BAO.stock.sampleGroups(state).some(function (g) { return g.id === state.ui.groupId; });
    if (!open) return null;
    return h('div.note.sample-note', { role: 'note' },
      h('span.sample-note__text', {},
        h('strong', { text: 'Das sind Beispieldaten zum Ausprobieren. ' }),
        'Für den eigenen Unterricht legst du unter „Lerngruppen“ deine Klassen an.'),
      h('button.btn.btn--sm', {
        type: 'button', text: 'Eigene Lerngruppe anlegen',
        onclick: function () { app.go('verwaltung'); }
      }),
      h('button.btn.btn--sm', {
        type: 'button', text: 'Beispiele entfernen',
        onclick: function () { BAO.views.data.removeSamples(); }
      }),
      h('button.btn.btn--ghost.btn--sm.btn--icon', {
        type: 'button', text: '×', title: 'Hinweis ausblenden', 'aria-label': 'Hinweis ausblenden',
        onclick: function () {
          BAO.store.commit('Hinweis ausgeblendet', function (draft) { draft.ui.sampleNoteHidden = true; }, { undoable: false });
        }
      })
    );
  }

  BAO.handover = {
    canCopy: canCopy,
    copyToGroup: copyToGroup,
    copyButton: copyButton,
    sampleNote: sampleNote
  };
})(window.BAO = window.BAO || {});
