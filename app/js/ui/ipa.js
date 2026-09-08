/* ==========================================================================
   Virtuelle IPA-Tastatur
   Lautschrift lässt sich auf einer gewöhnlichen Tastatur nicht eingeben.
   Deshalb öffnet sich beim Anklicken des Aussprachefelds eine Tastatur mit
   den im Französisch-, Englisch- und Spanischunterricht üblichen Zeichen.

   Grundsätze
   - Zeichen werden an der Cursorposition eingefügt, der Fokus bleibt im Feld.
   - Zu jedem Zeichen gehört ein Beispielwort; es erscheint in der Hinweiszeile,
     sobald man ein Zeichen berührt oder anspringt.
   - Tippen bleibt jederzeit möglich; die Tastatur ist eine Ergänzung,
     kein Ersatz.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;
  var h = util.h;

  /* --- Zeichenvorrat ------------------------------------------------------
     Jede Taste ist entweder "Zeichen" oder [Zeichen, Beispiel] oder
     { ins, show, hint, caret }. */

  var LAYOUTS = [
    {
      id: 'fr',
      label: 'Französisch',
      groups: [
        {
          label: 'Vokale',
          keys: [['i', 'ici'], ['e', 'été'], ['ɛ', 'mère'], ['a', 'patte'], ['ɑ', 'pâte'],
            ['ɔ', 'sortir'], ['o', 'mot'], ['u', 'vous'], ['y', 'tu'], ['ø', 'deux'],
            ['œ', 'sœur'], ['ə', 'le']]
        },
        {
          label: 'Nasalvokale',
          keys: [['ɛ̃', 'vin'], ['ɑ̃', 'dans'], ['ɔ̃', 'bon'], ['œ̃', 'brun']]
        },
        {
          label: 'Halbvokale',
          keys: [['j', 'yeux'], ['ɥ', 'huit'], ['w', 'oui']]
        },
        {
          label: 'Konsonanten',
          keys: [['p', 'père'], ['b', 'bon'], ['t', 'tout'], ['d', 'deux'], ['k', 'car'],
            ['ɡ', 'gare'], ['f', 'fille'], ['v', 'vous'], ['s', 'six'], ['z', 'zéro'],
            ['ʃ', 'chat'], ['ʒ', 'jour'], ['m', 'mère'], ['n', 'nous'], ['ɲ', 'agneau'],
            ['ŋ', 'parking'], ['l', 'lit'], ['ʁ', 'rue']]
        },
        {
          label: 'Verbindung',
          keys: [['‿', 'Liaison: les‿amis']]
        }
      ]
    },
    {
      id: 'en',
      label: 'Englisch',
      groups: [
        {
          label: 'Kurze Vokale',
          keys: [['ɪ', 'sit'], ['e', 'bed'], ['æ', 'cat'], ['ʌ', 'cup'], ['ɒ', 'hot (BrE)'],
            ['ʊ', 'book'], ['ə', 'about'], ['ɑ', 'lot (AmE)']]
        },
        {
          label: 'Lange Vokale',
          keys: [['iː', 'see'], ['ɑː', 'car'], ['ɔː', 'door'], ['uː', 'blue'], ['ɜː', 'bird']]
        },
        {
          label: 'Diphthonge',
          keys: [['eɪ', 'day'], ['aɪ', 'my'], ['ɔɪ', 'boy'], ['əʊ', 'go (BrE)'], ['oʊ', 'go (AmE)'],
            ['aʊ', 'now'], ['ɪə', 'here'], ['eə', 'hair'], ['ʊə', 'tour']]
        },
        {
          label: 'Konsonanten',
          keys: [['p', 'pen'], ['b', 'book'], ['t', 'ten'], ['d', 'day'], ['k', 'cat'], ['ɡ', 'go'],
            ['tʃ', 'chair'], ['dʒ', 'jam'], ['f', 'five'], ['v', 'very'], ['θ', 'think'],
            ['ð', 'this'], ['s', 'see'], ['z', 'zoo'], ['ʃ', 'she'], ['ʒ', 'measure'],
            ['h', 'how'], ['m', 'man'], ['n', 'no'], ['ŋ', 'sing'], ['l', 'leg'],
            ['r', 'red (BrE)'], ['ɹ', 'red (AmE)'], ['j', 'yes'], ['w', 'wet']]
        },
        {
          label: 'Amerikanisches Englisch',
          keys: [['ɚ', 'teacher'], ['ɝ', 'bird'], ['ɾ', 'better (Flap)']]
        }
      ]
    },
    {
      id: 'es',
      label: 'Spanisch',
      groups: [
        {
          label: 'Vokale',
          keys: [['a', 'casa'], ['e', 'mesa'], ['i', 'vivir'], ['o', 'como'], ['u', 'luna']]
        },
        {
          label: 'Konsonanten',
          keys: [['p', 'padre'], ['b', 'boca'], ['β', 'haber'], ['t', 'todo'], ['d', 'dos'],
            ['ð', 'nada'], ['k', 'casa'], ['ɡ', 'gato'], ['ɣ', 'lago'], ['tʃ', 'mucho'],
            ['f', 'fácil'], ['s', 'sala'], ['θ', 'cinco (kast.)'], ['x', 'jamón'],
            ['ʝ', 'ayer'], ['m', 'mano'], ['n', 'nada'], ['ɲ', 'año'], ['ŋ', 'tango'],
            ['l', 'luna'], ['ʎ', 'llave (regional)'], ['ɾ', 'pero'], ['r', 'perro'],
            ['j', 'tiene'], ['w', 'cuatro']]
        }
      ]
    },
    {
      id: 'zeichen',
      label: 'Zeichen',
      groups: [
        {
          label: 'Klammern',
          keys: [
            { ins: '[]', show: '[ ]', hint: 'phonetische Umschrift', caret: -1 },
            { ins: '//', show: '/ /', hint: 'phonologische Umschrift', caret: -1 }
          ]
        },
        {
          label: 'Betonung und Länge',
          keys: [['ˈ', 'Hauptbetonung'], ['ˌ', 'Nebenbetonung'], ['ː', 'lang'],
            ['ˑ', 'halblang'], ['.', 'Silbengrenze'], ['‿', 'Bindung / Liaison']]
        },
        {
          label: 'Diakritika',
          keys: [
            { ins: '̃', show: '◌̃', hint: 'Nasalierung (auf das vorige Zeichen)' },
            { ins: '̯', show: '◌̯', hint: 'nicht silbisch' },
            { ins: '̩', show: '◌̩', hint: 'silbisch' },
            { ins: '̥', show: '◌̥', hint: 'stimmlos' },
            ['ʰ', 'behaucht'], ['ʔ', 'Knacklaut']
          ]
        }
      ]
    }
  ];

  /* Diese Zeichen braucht man in jeder Sprache – sie stehen deshalb über
     allen Sprachansichten, nicht nur im Zeichen-Register. */
  var COMMON = {
    label: 'Häufig gebraucht',
    keys: [
      { ins: '[]', show: '[ ]', hint: 'phonetische Umschrift', caret: -1 },
      { ins: '//', show: '/ /', hint: 'phonologische Umschrift', caret: -1 },
      ['ˈ', 'Hauptbetonung'],
      ['ˌ', 'Nebenbetonung'],
      ['ː', 'lang'],
      ['.', 'Silbengrenze']
    ]
  };

  var lastLayoutId = '';

  function layoutById(id) {
    for (var i = 0; i < LAYOUTS.length; i++) if (LAYOUTS[i].id === id) return LAYOUTS[i];
    return null;
  }

  /** Passendes Tastaturbild zum Fach: „FR“ → Französisch usw. */
  function layoutForSubject(subject) {
    if (!subject) return LAYOUTS[0].id;
    var text = util.fold(subject.name + ' ' + (subject.short || ''));
    if (/franz|french|francais|\bfr\b/.test(text)) return 'fr';
    if (/engl|\ben\b/.test(text)) return 'en';
    if (/span|espan|\bes\b/.test(text)) return 'es';
    return 'zeichen';
  }

  function normaliseKey(key) {
    if (Array.isArray(key)) return { ins: key[0], show: key[0], hint: key[1] || '' };
    if (typeof key === 'string') return { ins: key, show: key, hint: '' };
    return { ins: key.ins, show: key.show || key.ins, hint: key.hint || '', caret: key.caret || 0 };
  }

  /* --- Einfügen ------------------------------------------------------------ */

  function insert(input, text, caretOffset) {
    var start = input.selectionStart === null ? input.value.length : input.selectionStart;
    var end = input.selectionEnd === null ? start : input.selectionEnd;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    var position = start + text.length + (caretOffset || 0);
    input.focus();
    try { input.setSelectionRange(position, position); } catch (err) { /* Feldtyp ohne Auswahl */ }
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /** Kombinierende Zeichen (Tilde, Ring, Bogen …) gehören zum Laut davor. */
  function isCombining(code) {
    return (code >= 0x0300 && code <= 0x036F)
      || (code >= 0x1AB0 && code <= 0x1AFF)
      || (code >= 0x1DC0 && code <= 0x1DFF)
      || (code >= 0x20D0 && code <= 0x20FF);
  }

  function backspace(input) {
    var start = input.selectionStart === null ? input.value.length : input.selectionStart;
    var end = input.selectionEnd === null ? start : input.selectionEnd;
    if (start === end) {
      if (start === 0) { input.focus(); return; }
      // Ein Klick auf die Taste hat ein Zeichen eingefügt – ein Klick auf
      // „Löschen“ nimmt es vollständig zurück, samt Kombinationszeichen.
      while (start > 0 && isCombining(input.value.charCodeAt(start - 1))) start -= 1;
      start -= 1;
      var code = input.value.charCodeAt(start);
      if (start > 0 && code >= 0xDC00 && code <= 0xDFFF) start -= 1;   // Ersatzzeichenpaar
    }
    input.value = input.value.slice(0, start) + input.value.slice(end);
    input.focus();
    try { input.setSelectionRange(start, start); } catch (err) { /* egal */ }
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /* --- Feld mit Tastatur --------------------------------------------------- */

  /**
   * field({ label, value, placeholder, hint, subject, full })
   * Rückgabe: Feldelement mit .input (wie ui.textField).
   */
  function field(config) {
    config = config || {};
    var input = h('input', {
      type: 'text',
      value: config.value || '',
      placeholder: config.placeholder || '[staʒ]',
      autocomplete: 'off',
      spellcheck: 'false',
      'aria-describedby': 'ipa-hint'
    });

    var currentId = lastLayoutId || layoutForSubject(config.subject);
    if (!layoutById(currentId)) currentId = LAYOUTS[0].id;

    var tabs = h('div.ipa-board__tabs', { role: 'tablist' });
    var groups = h('div.ipa-board__groups');
    var hintLine = h('div.ipa-board__hint', {
      id: 'ipa-hint',
      text: 'Zeichen werden an der Cursorposition eingefügt.'
    });

    var board = h('div.ipa-board', { hidden: true },
      tabs,
      groups,
      h('div.ipa-board__foot', {},
        h('button.btn.btn--sm', {
          type: 'button', title: 'Leerzeichen einfügen',
          onmousedown: function (event) { event.preventDefault(); },
          onclick: function () { insert(input, ' '); }
        }, 'Leerzeichen'),
        h('button.btn.btn--sm', {
          type: 'button', title: 'Letztes Zeichen löschen',
          onmousedown: function (event) { event.preventDefault(); },
          onclick: function () { backspace(input); }
        }, '⌫ Löschen'),
        h('span.spacer'),
        hintLine,
        h('button.btn.btn--sm.btn--ghost', {
          type: 'button', text: 'Fertig',
          onclick: function () { close(); input.focus(); }
        })
      )
    );

    function setHint(text) {
      hintLine.textContent = text || 'Zeichen werden an der Cursorposition eingefügt.';
    }

    function keyButton(raw) {
      var key = normaliseKey(raw);
      var describe = key.hint ? key.show + ' – ' + key.hint : key.show;
      return h('button.ipa-key', {
        type: 'button',
        title: describe,
        'aria-label': describe,
        // Der Fokus muss im Eingabefeld bleiben, sonst geht die Cursorposition verloren.
        onmousedown: function (event) { event.preventDefault(); },
        onclick: function () { insert(input, key.ins, key.caret); },
        onmouseenter: function () { setHint(describe); },
        onmouseleave: function () { setHint(''); },
        onfocus: function () { setHint(describe); },
        onblur: function () { setHint(''); }
      }, key.show);
    }

    function drawGroups() {
      var layout = layoutById(currentId) || LAYOUTS[0];
      util.clear(groups);
      var visible = layout.id === 'zeichen' ? layout.groups : [COMMON].concat(layout.groups);
      visible.forEach(function (group) {
        var keys = h('div.ipa-keys');
        group.keys.forEach(function (key) { keys.appendChild(keyButton(key)); });
        groups.appendChild(h('div.ipa-group', {},
          h('div.ipa-group__label', { text: group.label }),
          keys
        ));
      });
      util.$$('button', tabs).forEach(function (button) {
        button.setAttribute('aria-selected', button.dataset.layout === currentId ? 'true' : 'false');
      });
    }

    LAYOUTS.forEach(function (layout) {
      tabs.appendChild(h('button.btn.btn--sm', {
        type: 'button',
        role: 'tab',
        dataset: { layout: layout.id },
        text: layout.label,
        onmousedown: function (event) { event.preventDefault(); },
        onclick: function () {
          currentId = layout.id;
          lastLayoutId = layout.id;
          drawGroups();
        }
      }));
    });
    drawGroups();

    var releaseEscape = null;

    function open() {
      if (!board.hidden) return;
      board.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      // Im Dialog steht das Feld weit unten – die Tastatur muss sichtbar werden.
      window.requestAnimationFrame(function () {
        try {
          board.scrollIntoView({
            block: 'end',
            behavior: util.prefersReducedMotion() ? 'auto' : 'smooth'
          });
        } catch (err) { board.scrollIntoView(false); }
      });
      if (BAO.modal && BAO.modal.onEscape) {
        releaseEscape = BAO.modal.onEscape(function () {
          if (board.hidden) return false;
          close();
          input.focus();
          return true;
        });
      }
    }

    function close() {
      if (board.hidden) return;
      board.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      if (releaseEscape) { releaseEscape(); releaseEscape = null; }
    }

    var toggle = h('button.btn.btn--sm.ipa-toggle', {
      type: 'button',
      'aria-expanded': 'false',
      title: 'Virtuelle Tastatur für Lautschrift ein- und ausblenden',
      onclick: function () { if (board.hidden) { open(); input.focus(); } else { close(); } }
    }, 'IPA-Tastatur');

    input.addEventListener('focus', open);
    input.addEventListener('click', open);

    var wrapper = h('div.field.ipa-field' + (config.full ? '.full' : ''), {},
      h('label', {},
        h('span', { text: config.label || 'Aussprache / Betonung' }),
        toggle
      ),
      input,
      config.hint ? h('span.hint', { text: config.hint }) : null,
      board
    );

    // Ein Klick weit außerhalb schließt die Tastatur wieder.
    wrapper.addEventListener('focusout', function (event) {
      if (!event.relatedTarget || !wrapper.contains(event.relatedTarget)) {
        window.setTimeout(function () {
          if (!wrapper.contains(document.activeElement)) close();
        }, 0);
      }
    });

    wrapper.input = input;
    wrapper.openBoard = open;
    wrapper.closeBoard = close;
    return wrapper;
  }

  BAO.ipa = {
    LAYOUTS: LAYOUTS,
    field: field,
    insert: insert,
    backspace: backspace,
    layoutForSubject: layoutForSubject
  };
})(window.BAO = window.BAO || {});
