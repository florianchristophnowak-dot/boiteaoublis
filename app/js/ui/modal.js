/* ==========================================================================
   Dialoge
   Ein einziger, schlichter Dialogtyp für Formulare, Rückfragen und
   Entscheidungen. Tastaturbedienung inklusive (Esc, Tabulatorfalle, Enter).
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;
  var h = util.h;
  var openStack = [];

  function focusables(node) {
    return util.$$('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', node)
      .filter(function (el) { return el.offsetParent !== null || el === document.activeElement; });
  }

  /**
   * open({ title, subtitle, body, actions, width, initialFocus, dismissable })
   * actions: [{ label, value, kind: 'primary'|'danger'|'ghost', shortcut: 'enter' }]
   * Rückgabe: Promise mit dem Wert der gewählten Aktion (null bei Abbruch).
   * Ein Aktions-Handler kann false liefern, um den Dialog offen zu halten.
   */
  function open(config) {
    config = config || {};
    var previousFocus = document.activeElement;

    return new Promise(function (resolve) {
      var backdrop = h('div.modal-backdrop', { role: 'presentation' });
      var dialog = h('div.modal', {
        role: 'dialog', 'aria-modal': 'true', 'aria-label': config.title || 'Dialog',
        style: config.width ? { '--modal-w': config.width } : null
      });

      var head = h('div.modal__head', {}, h('h2', { text: config.title || '' }));
      if (config.subtitle) head.appendChild(h('p', { text: config.subtitle }));
      dialog.appendChild(head);

      var api = {
        dialog: dialog,
        body: null,
        close: function (value) { finish(value); },
        setBusy: function (busy) {
          util.$$('button', dialog).forEach(function (b) { b.disabled = !!busy; });
        }
      };

      var body = h('div.modal__body');
      api.body = body;
      var content = typeof config.body === 'function' ? config.body(api) : config.body;
      util.append(body, content);
      dialog.appendChild(body);

      var actions = config.actions || [{ label: 'Schließen', value: null, kind: 'primary' }];
      var foot = h('div.modal__foot');
      actions.forEach(function (action) {
        var cls = 'button.btn';
        if (action.kind === 'primary') cls += '.btn--primary';
        if (action.kind === 'danger') cls += '.btn--danger';
        if (action.kind === 'ghost') cls += '.btn--ghost';
        foot.appendChild(h(cls, {
          type: 'button',
          text: action.label,
          dataset: { value: String(action.value) },
          onclick: function () { choose(action); }
        }));
      });
      dialog.appendChild(foot);
      backdrop.appendChild(dialog);

      var closed = false;
      function finish(value) {
        if (closed) return;
        closed = true;
        document.removeEventListener('keydown', onKey, true);
        if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        var i = openStack.indexOf(api);
        if (i >= 0) openStack.splice(i, 1);
        if (previousFocus && previousFocus.focus) {
          try { previousFocus.focus(); } catch (err) { /* Fokusziel verschwunden */ }
        }
        resolve(value);
      }

      function choose(action) {
        if (action.onSelect) {
          var outcome = action.onSelect(api);
          if (outcome === false) return;
          if (outcome && typeof outcome.then === 'function') {
            outcome.then(function (value) { if (value !== false) finish(value === undefined ? action.value : value); });
            return;
          }
          if (outcome !== undefined && outcome !== true) { finish(outcome); return; }
        }
        finish(action.value === undefined ? null : action.value);
      }

      function onKey(event) {
        if (openStack[openStack.length - 1] !== api) return;
        if (event.key === 'Escape') {
          // Nicht an die Projektionssteuerung durchreichen.
          event.preventDefault();
          event.stopPropagation();
          if (config.dismissable === false) return;
          finish(null);
          return;
        }
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          var primary = actions.filter(function (a) { return a.kind === 'primary'; })[0];
          if (primary) { event.preventDefault(); event.stopPropagation(); choose(primary); }
          return;
        }
        if (event.key === 'Tab') {
          var list = focusables(dialog);
          if (!list.length) return;
          var first = list[0];
          var last = list[list.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      }

      backdrop.addEventListener('mousedown', function (event) {
        if (event.target === backdrop && config.dismissable !== false) finish(null);
      });

      openStack.push(api);
      document.getElementById('modal-root').appendChild(backdrop);
      document.addEventListener('keydown', onKey, true);

      window.requestAnimationFrame(function () {
        var target = config.initialFocus ? util.$(config.initialFocus, dialog) : focusables(body)[0] || focusables(dialog)[0];
        if (target && target.focus) target.focus();
        if (target && target.select && target.tagName === 'INPUT') target.select();
      });
    });
  }

  function confirm(config) {
    return open({
      title: config.title || 'Wirklich fortfahren?',
      subtitle: config.subtitle,
      width: config.width || '460px',
      body: h('div.stack', {},
        config.text ? h('p', { text: config.text }) : null,
        config.detail ? h('div.note' + (config.danger ? '.note--danger' : ''), { text: config.detail }) : null
      ),
      actions: [
        { label: config.cancelLabel || 'Abbrechen', value: false, kind: 'ghost' },
        { label: config.confirmLabel || 'Fortfahren', value: true, kind: config.danger ? 'danger' : 'primary' }
      ]
    }).then(function (value) { return value === true; });
  }

  function prompt(config) {
    var input = h('input', {
      type: 'text', value: config.value || '', placeholder: config.placeholder || ''
    });
    return open({
      title: config.title || 'Eingabe',
      subtitle: config.subtitle,
      width: '460px',
      body: h('div.field', {}, config.label ? h('label', { text: config.label }) : null, input),
      actions: [
        { label: 'Abbrechen', value: null, kind: 'ghost' },
        {
          label: config.confirmLabel || 'Übernehmen', kind: 'primary',
          onSelect: function () {
            var value = input.value.trim();
            if (!value && config.required !== false) { input.focus(); return false; }
            return value;
          }
        }
      ]
    });
  }

  BAO.modal = { open: open, confirm: confirm, prompt: prompt };
})(window.BAO = window.BAO || {});
