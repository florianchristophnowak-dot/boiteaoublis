/* ==========================================================================
   Tafel – Steuerung neben der Fläche
   Links das, was die Lernenden sehen, rechts alles Weitere. Die Fläche selbst
   ist an beiden Stellen bedienbar: Ziehen verschiebt, Doppelklick legt an –
   in der Vorschau ebenso wie im Beamerfenster.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;
  var h = util.h;
  var ui = BAO.ui;
  var select = BAO.select;

  var pick = { query: '' };
  var listenerBound = false;
  var refs = {};
  // Was im Feld „Element hinzufügen“ steht, überdauert einen Neuaufbau der
  // Ansicht – etwa wenn gleichzeitig am Beamer ein Element verschoben wird.
  var draft = { boardId: '', text: '' };

  /** Rückmeldung nach dem Anlegen – mit dem Hinweis, was schon im Bestand stand. */
  function announceAdded(created) {
    if (!created) return;
    var known = created.reused || 0;
    var message = created.length > 1 ? created.length + ' Elemente auf der Tafel.' : 'Element auf der Tafel.';
    if (known) {
      message += created.length === 1
        ? ' Der Eintrag stand schon im Bestand und wurde von dort geholt.'
        : ' ' + known + ' davon ' + util.plural(known, 'stand', 'standen') + ' schon im Bestand.';
    }
    BAO.toast.undoable(message);
  }

  /* --- Panel: Elemente hinzufügen -------------------------------------------- */

  function addCard(board) {
    if (draft.boardId !== board.id) draft = { boardId: board.id, text: '' };
    var input = h('textarea', {
      rows: 2, placeholder: 'Wort oder Satz … (mehrere Zeilen sind möglich)',
      'aria-label': 'Neues Element',
      oninput: function () { draft.text = input.value; }
    });
    input.value = draft.text;

    function submit() {
      var text = input.value;
      if (!text.trim()) { input.focus(); return; }
      var created = BAO.board.add(text);
      input.value = '';
      draft.text = '';
      input.focus();
      announceAdded(created);
    }

    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); }
    });

    return h('div.ctrl-card', {},
      h('h3', {}, 'Element hinzufügen'),
      h('div.stack', {},
        input,
        h('button.btn.btn--primary.btn--sm', { type: 'button', onclick: submit },
          ui.icon('plus', 15), 'Auf die Tafel'),
        h('div.note', { text: 'Enter legt an, Umschalt + Enter macht eine neue Zeile. '
          + 'Auf der Fläche selbst genügt ein Doppelklick.' })
      )
    );
  }

  /* --- Panel: was auf der Tafel liegt ---------------------------------------- */

  function entryRow(entry, board) {
    var bare = select.isBareEntry(entry.ref);
    var foreign = !select.belongsToBoard(entry.ref, board);
    var row = h('div.belem', {
      dataset: { itemId: entry.item.id, selected: BAO.board.getState().selectedId === entry.item.id ? 'true' : 'false' },
      onclick: function () { BAO.board.select(entry.item.id); }
    },
      h('span.belem__text', { text: entry.kind === 'lex' ? ui.termLabel(entry.ref) : entry.text }),
      foreign ? h('span.chip.chip--warn', {
        title: 'Dieser Eintrag gehört einer anderen Lerngruppe und passt sprachlich nicht auf diese Tafel.',
        text: 'andere Lerngruppe'
      }) : null,
      bare && !foreign ? h('span.chip.chip--outline', { title: 'Bisher nur Text – Artikel, Übersetzung und mehr lassen sich ergänzen', text: 'nur Text' }) : null,
      h('span.spacer'),
      h('div.belem__actions', {},
        h('button.btn.btn--sm.btn--icon', {
          type: 'button', title: 'Um weitere Angaben ergänzen',
          onclick: function (event) {
            event.stopPropagation();
            if (entry.kind === 'starter') BAO.views.starters.openEditor(entry.ref);
            else BAO.views.vocab.openEditor(entry.ref);
          }
        }, ui.icon('edit', 15)),
        h('button.btn.btn--sm.btn--icon', {
          type: 'button', title: 'Von der Tafel nehmen (der Eintrag bleibt im Bestand)',
          onclick: function (event) {
            event.stopPropagation();
            BAO.board.removeItem(entry.item.id);
            BAO.toast.undoable('Element von der Tafel genommen.');
          }
        }, ui.icon('trash', 15))
      )
    );
    return row;
  }

  function elementsCard(entries, board) {
    var list = h('div.belem-list');
    if (!entries.length) {
      list.appendChild(h('div.note', { text: 'Die Tafel ist noch leer.' }));
    } else {
      entries.forEach(function (entry) { list.appendChild(entryRow(entry, board)); });
    }
    refs.list = list;

    return h('div.ctrl-card', {},
      h('h3', {}, 'Auf der Tafel',
        h('span.spacer'),
        h('span.chip', { text: String(entries.length) })
      ),
      list,
      entries.length > 1 ? h('button.btn.btn--sm', {
        type: 'button', title: 'Alle Elemente gleichmäßig verteilen',
        onclick: function () { BAO.board.arrange(); BAO.toast.undoable('Tafel geordnet.'); }
      }, 'Ordnen') : null
    );
  }

  /* --- Panel: vorhandene Einträge holen -------------------------------------- */

  function pickCard(state, board) {
    var group = select.group(state, board.groupId);
    var used = {};
    (board.items || []).forEach(function (item) { used[item.kind + ':' + item.refId] = true; });

    // Die Trefferliste zeichnet sich selbst neu. Das Suchfeld bleibt dabei
    // stehen – sonst verlöre es nach jedem Buchstaben den Fokus.
    var results = h('div.picker__list');

    function drawResults() {
      util.clear(results);
      var needle = util.fold(pick.query);
      if (!needle) {
        results.appendChild(h('div.note', { text: 'Suchbegriff eingeben – gefunden wird alles, was diese Lerngruppe schon kennt.' }));
        return;
      }
      var candidates = [];
      select.lexemesOfGroup(state, board.groupId).forEach(function (lex) {
        if (used['lex:' + lex.id]) return;
        if (util.fold(ui.termLabel(lex) + ' ' + (lex.translation || '')).indexOf(needle) < 0) return;
        candidates.push({ kind: 'lex', id: lex.id, text: ui.termLabel(lex), meta: lex.translation || '' });
      });
      select.startersOfGroup(state, board.groupId, board.subjectId).forEach(function (starter) {
        if (used['starter:' + starter.id]) return;
        if (util.fold(starter.text + ' ' + (starter.translation || '')).indexOf(needle) < 0) return;
        candidates.push({ kind: 'starter', id: starter.id, text: starter.text, meta: starter.translation || '' });
      });
      if (!candidates.length) {
        results.appendChild(h('div.note', { text: 'Kein Treffer. Neue Elemente entstehen oben oder direkt auf der Fläche.' }));
        return;
      }
      candidates.slice(0, 12).forEach(function (candidate) {
        results.appendChild(h('button.picker__item', {
          type: 'button',
          onclick: function () {
            BAO.board.place(candidate.kind, candidate.id);
            BAO.toast.undoable('Element auf der Tafel.');
          }
        },
          h('span.plus', { text: '+' }),
          h('span', {}, h('strong', { text: candidate.text }),
            candidate.meta ? h('small', { text: ' · ' + candidate.meta }) : null)
        ));
      });
      if (candidates.length > 12) {
        results.appendChild(h('span.hint', { text: '… und ' + (candidates.length - 12) + ' weitere. Genauer suchen grenzt ein.' }));
      }
    }
    drawResults();

    return h('div.ctrl-card', {},
      h('h3', {}, 'Aus dem Bestand holen',
        h('span.spacer'),
        h('span.chip.chip--outline', { text: group ? group.name : '' })
      ),
      h('input', {
        type: 'search', value: pick.query, placeholder: 'Suchen …',
        'aria-label': 'Im Bestand suchen',
        oninput: function (event) { pick.query = event.target.value; drawResults(); }
      }),
      results
    );
  }

  /* --- Panel: Darstellung ------------------------------------------------------ */

  function appearanceCard(board, session, app) {
    function toggle(label, value, hint, onChange) {
      var id = util.uid('chk');
      return h('div.toggle-row', {},
        h('input', {
          type: 'checkbox', id: id, checked: value ? true : null,
          onchange: function (event) { onChange(event.target.checked); }
        }),
        h('label', { for: id, text: label, title: hint || '' })
      );
    }

    return h('div.ctrl-card', {},
      h('h3', {}, 'Darstellung'),
      h('div.stack', {},
        toggle('Artikel zeigen', board.showArticle,
          'Vorhandene Artikel erscheinen farbig nach Genus.',
          function (value) { BAO.board.setOption('showArticle', value); }),
        toggle('Deutsch zeigen', board.showTranslation,
          'Zeigt die deutsche Entsprechung, sofern eine gepflegt ist.',
          function (value) { BAO.board.setOption('showTranslation', value); }),
        h('div.row', {},
          h('button.btn.btn--sm', {
            type: 'button', text: session.theme === 'dark' ? 'Hell' : 'Dunkel',
            title: 'Helligkeit der Projektion',
            onclick: function () { BAO.board.setTheme(session.theme === 'dark' ? 'light' : 'dark'); app.scheduleRender(); }
          }),
          h('button.btn.btn--sm.btn--icon', {
            type: 'button', title: 'Schrift kleiner', 'aria-label': 'Schrift kleiner',
            onclick: function () { BAO.board.setScale(BAO.board.getState().scale - 0.1); }
          }, '−'),
          h('button.btn.btn--sm.btn--icon', {
            type: 'button', title: 'Schrift größer', 'aria-label': 'Schrift größer',
            onclick: function () { BAO.board.setScale(BAO.board.getState().scale + 0.1); }
          }, '+')
        )
      )
    );
  }

  /* --- Auswahl ohne vollen Neuaufbau spiegeln --------------------------------- */

  function bindSelection() {
    if (listenerBound) return;
    listenerBound = true;
    BAO.board.subscribe(function (state, reason) {
      if (reason !== 'select' || !refs.list || !refs.list.isConnected) return;
      util.$$('.belem', refs.list).forEach(function (row) {
        row.dataset.selected = row.dataset.itemId === state.selectedId ? 'true' : 'false';
      });
    });
  }

  /* --- Ansicht ------------------------------------------------------------------ */

  function render(host, context) {
    var state = context.state;
    var ctx = context.ctx;
    var app = context.app;
    var boardId = context.params[0];
    var board = boardId ? select.board(state, boardId) : null;
    var view = h('div.view');

    if (!board) {
      view.appendChild(ui.emptyState({
        title: 'Tafel nicht gefunden',
        text: 'Diese Tafel gibt es nicht mehr.',
        actionLabel: 'Zur Übersicht', onAction: function () { app.go('tafeln'); }
      }));
      host.appendChild(view);
      return;
    }

    // Die Tafel bestimmt den Arbeitskontext, nicht umgekehrt. Sonst böte die
    // Ansicht den Bestand einer anderen Lerngruppe an – und ein französischer
    // Artikel landete farbig auf einer englischen Tafel.
    var session = BAO.board.getState();
    var arriving = !session.active || session.boardId !== board.id;
    if (!ctx.group || ctx.group.id !== board.groupId) {
      if (!arriving) {
        // Oben wurde die Lerngruppe gewechselt: Diese Tafel gehört nicht dazu.
        BAO.board.stop();
        app.go('tafeln');
        return;
      }
      app.setContext(board.subjectId, board.groupId);
      state = BAO.store.getState();
      ctx = select.context(state);
      board = select.board(state, boardId);
    }

    bindSelection();
    if (arriving) {
      BAO.board.start(board.id);
      session = BAO.board.getState();
    }

    var subject = select.subject(state, board.subjectId);
    var group = select.group(state, board.groupId);
    var entries = BAO.board.entries();
    var frame = h('div.stage-frame', {
      dataset: { mirrored: BAO.output.isWindowOpen() ? 'true' : 'false' }
    });

    var preview = h('div.stage-preview', {}, frame,
      h('div.stage-preview__bar', {},
        h('button.btn.btn--sm', {
          type: 'button',
          title: BAO.output.isWindowOpen() ? 'Beamerfenster schließen' : 'Eigenes Fenster für den Beamer öffnen',
          onclick: function () {
            if (BAO.output.isWindowOpen()) BAO.output.closeWindow();
            else if (!BAO.output.openWindow().ok) {
              BAO.toast.error('Der Browser hat das zweite Fenster blockiert. Bitte Pop-ups für diese Seite erlauben – '
                + 'oder das Vollbild verwenden.');
            }
            app.scheduleRender();
          }
        }, ui.icon('beamer', 15), BAO.output.isWindowOpen() ? 'Fenster schließen' : 'Beamerfenster'),
        h('button.btn.btn--sm', {
          type: 'button', title: 'Vollbild auf diesem Bildschirm (Taste F)',
          onclick: function () {
            if (BAO.output.isOverlayOpen()) BAO.output.closeOverlay(); else BAO.output.openOverlay();
            app.scheduleRender();
          }
        }, ui.icon('focus', 15), BAO.output.isOverlayOpen() ? 'Vollbild beenden' : 'Vollbild'),
        h('span.spacer'),
        h('button.btn.btn--sm', {
          type: 'button', 'aria-pressed': session.blank ? 'true' : 'false',
          text: session.blank ? 'Tafel zeigen' : 'Bildschirm leeren',
          title: 'Taste B',
          onclick: function () { BAO.board.toggleBlank(); app.scheduleRender(); }
        })
      )
    );

    var panel = h('div.ctrl-panel', {},
      addCard(board),
      elementsCard(entries, board),
      pickCard(state, board),
      appearanceCard(board, session, app),
      h('div.ctrl-card', {},
        h('h3', {}, 'Auf der Fläche'),
        h('div.kv', {},
          h('dt', { text: 'Doppelklick' }), h('dd', { text: 'Element anlegen oder ändern' }),
          h('dt', { text: 'Ziehen' }), h('dd', { text: 'verschieben' }),
          h('dt', { text: 'Tippen' }), h('dd', { text: 'öffnet die Eingabe' }),
          h('dt', { text: '← ↑ ↓ →' }), h('dd', { text: 'ausgewähltes Element rücken' }),
          h('dt', { text: '+ −' }), h('dd', { text: 'Element größer / kleiner' }),
          h('dt', { text: 'Entf' }), h('dd', { text: 'von der Tafel nehmen' }),
          h('dt', { text: 'B / F' }), h('dd', { text: 'leeren / Vollbild' })
        )
      )
    );

    view.appendChild(h('div.view__head', {},
      h('div.view__title', {},
        h('h1', { text: board.title }),
        h('span.sub', {
          text: [subject ? subject.name : '', group ? group.name + ' · Jg. ' + group.grade : '',
            entries.length + ' ' + util.plural(entries.length, 'Element', 'Elemente')]
            .filter(Boolean).join(' · ')
        })
      ),
      h('div.spacer'),
      h('div.view__actions', {},
        h('button.btn', { type: 'button', onclick: function () { app.go('tafeln'); } }, 'Alle Tafeln'),
        entries.length ? h('button.btn.btn--sm', {
          type: 'button', title: 'Die Elemente der Tafel als Wortliste oder Vokabeltest drucken',
          onclick: function () {
            var now = BAO.store.getState();
            var latest = select.board(now, board.id) || board;
            BAO.print.openWordList({
              title: latest.title,
              subtitle: [subject ? subject.name : '', group ? group.name : ''].filter(Boolean).join(' · '),
              sections: [{ title: '', rows: BAO.stock.rowsOfBoard(now, latest) }]
            });
          }
        }, ui.icon('print', 15), h('span.btn__label', { text: 'Drucken' })) : null,
        h('button.btn.btn--sm.btn--icon', {
          type: 'button', title: 'Titel ändern',
          onclick: function () {
            BAO.modal.prompt({
              title: 'Titel der Tafel', label: 'Titel', value: board.title
            }).then(function (value) {
              if (value === null) return;
              var title = String(value).trim();
              if (!title) return;
              BAO.store.commit('Tafel umbenannt', function (draft) {
                var target = select.board(draft, board.id);
                if (target) { target.title = title; target.updatedAt = util.nowISO(); }
              });
            });
          }
        }, ui.icon('edit', 15))
      )
    ));

    view.appendChild(h('div.present', {}, preview, panel));
    host.appendChild(view);

    BAO.output.attachPreview(frame);
    window.requestAnimationFrame(function () { BAO.board.renderAll('view'); });
  }

  BAO.views = BAO.views || {};
  BAO.views.board = { render: render };
})(window.BAO = window.BAO || {});
