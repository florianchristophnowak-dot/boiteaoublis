/* ==========================================================================
   Kurzmeldungen
   Rückmeldung nach jeder Aktion – bei verändernden Aktionen mit direkter
   Möglichkeit zum Rückgängigmachen.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var h = BAO.util.h;
  var root = null;

  function ensureRoot() {
    if (!root) root = document.getElementById('toast-root');
    return root;
  }

  function show(message, options) {
    options = options || {};
    var host = ensureRoot();
    if (!host) return function () {};

    var node = h('div.toast' + (options.kind ? '.toast--' + options.kind : ''), {},
      h('span.toast__text', { text: message })
    );

    var timer = null;
    function close() {
      if (timer) clearTimeout(timer);
      if (node.parentNode) node.parentNode.removeChild(node);
    }

    if (options.actionLabel) {
      node.appendChild(h('button.btn.btn--sm', {
        type: 'button',
        text: options.actionLabel,
        onclick: function () {
          close();
          if (options.onAction) options.onAction();
        }
      }));
    }

    node.appendChild(h('button.btn.btn--sm.btn--icon', {
      type: 'button', 'aria-label': 'Meldung schließen', text: '×', onclick: close
    }));

    host.appendChild(node);
    var duration = options.timeout === 0 ? 0 : (options.timeout || (options.actionLabel ? 8000 : 4000));
    if (duration) timer = setTimeout(close, duration);
    return close;
  }

  /** Meldung mit „Rückgängig“, die direkt auf den Verlauf des Speichers wirkt. */
  function undoable(message, options) {
    options = options || {};
    return show(message, {
      kind: options.kind,
      actionLabel: 'Rückgängig',
      timeout: options.timeout || 8000,
      onAction: function () {
        var label = BAO.store.undo();
        if (label) show('Rückgängig gemacht: ' + label, { kind: 'ok', timeout: 2600 });
      }
    });
  }

  BAO.toast = {
    show: show,
    undoable: undoable,
    ok: function (message, options) { return show(message, Object.assign({ kind: 'ok' }, options || {})); },
    error: function (message, options) { return show(message, Object.assign({ kind: 'danger', timeout: 9000 }, options || {})); }
  };
})(window.BAO = window.BAO || {});
