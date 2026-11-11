/* ==========================================================================
   Drucken und Weitergeben
   Aus dem Bestand wird ein Blatt für die Lernenden: eine Wortliste zum
   Mitnehmen oder ein Vokabeltest mit einer leeren Spalte. Gedruckt wird über
   den Druckdialog des Browsers – dort lässt sich das Blatt auch als PDF
   speichern. Dieselben Zeilen gehen als Text in die Zwischenablage, etwa für
   ein Arbeitsblatt oder die Lernplattform.

   Eine Liste besteht aus Abschnitten mit Zeilen (siehe BAO.stock):
     { title, rows: [{ kind, term, translation, extra, sortKey }] }
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;
  var h = util.h;
  var ui = BAO.ui;

  var MODES = [
    { id: 'list', label: 'Wortliste – beide Spalten ausgefüllt' },
    { id: 'recall', label: 'Vokabeltest – Deutsch steht da, die Fremdsprache wird ergänzt' },
    { id: 'recognise', label: 'Vokabeltest – die Fremdsprache steht da, Deutsch wird ergänzt' }
  ];
  var ORDERS = [
    { id: 'given', label: 'wie angezeigt' },
    { id: 'alpha', label: 'alphabetisch' },
    { id: 'shuffle', label: 'gemischt' }
  ];

  // Die zuletzt gewählte Einstellung gilt für das nächste Blatt weiter.
  var last = { mode: 'list', order: 'given', extra: false };

  function isTest(mode) { return mode === 'recall' || mode === 'recognise'; }

  function countRows(sections) {
    return (sections || []).reduce(function (sum, section) { return sum + section.rows.length; }, 0);
  }

  /* Zufallszahlen aus einem Startwert: Dieselbe Mischung lässt sich so ein
     zweites Mal erzeugen – das gedruckte Blatt gleicht der Vorschau. */
  function randomFrom(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function newSeed() { return Math.floor(Math.random() * 4294967296); }

  function shuffled(list, random) {
    var copy = list.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(random() * (i + 1));
      var swap = copy[i]; copy[i] = copy[j]; copy[j] = swap;
    }
    return copy;
  }

  /**
   * Wendet Art und Reihenfolge auf die Zeilen an.
   * Für einen Test taugt nur, was eine deutsche Entsprechung hat – der Rest
   * wird ausgelassen und gezählt. options.seed legt die Mischung fest.
   * @returns {{sections: Array, total: number, skipped: number}}
   */
  function prepare(sections, options) {
    options = options || {};
    var skipped = 0;
    var random = options.seed === undefined ? Math.random : randomFrom(options.seed);
    var result = (sections || []).map(function (section) {
      var rows = section.rows.slice();
      if (isTest(options.mode)) {
        rows = rows.filter(function (row) {
          if (row.translation) return true;
          skipped += 1;
          return false;
        });
      }
      if (options.order === 'alpha') {
        rows.sort(function (a, b) {
          return String(a.sortKey || util.fold(a.term)).localeCompare(String(b.sortKey || util.fold(b.term)), 'de');
        });
      } else if (options.order === 'shuffle') {
        rows = shuffled(rows, random);
      }
      return { title: section.title || '', rows: rows };
    }).filter(function (section) { return section.rows.length; });
    return { sections: result, total: countRows(result), skipped: skipped };
  }

  /* --- Das Blatt ---------------------------------------------------------------- */

  function cell(className, content) {
    var td = h('td' + (className ? '.' + className : ''));
    if (content && content.nodeType) td.appendChild(content);
    else if (content) td.textContent = content;
    return td;
  }

  /** Text mit Leerstellen als Linien – wie auf der Tafel. */
  function withGaps(text) { return ui.gapText(text, document); }

  /**
   * Baut das Blatt. options: { mode, order, extra, title, seed }
   * Wird sowohl für die Vorschau im Dialog als auch für den Druck verwendet.
   */
  function buildSheet(config, options) {
    options = Object.assign({ mode: 'list', order: 'given', extra: false }, options || {});
    var prepared = prepare(config.sections, options);
    var test = isTest(options.mode);
    var showExtra = !test && options.extra && prepared.sections.some(function (section) {
      return section.rows.some(function (row) { return row.extra; });
    });

    var sheet = h('div.sheet', { dataset: { mode: options.mode } });
    var head = h('div.sheet__head', {},
      h('h1', { text: options.title || config.title || 'Wortliste' }),
      config.subtitle ? h('p.sheet__sub', { text: config.subtitle }) : null
    );
    if (test) {
      head.appendChild(h('div.sheet__name', {},
        h('span', { text: 'Name:' }),
        h('span', { text: 'Datum:' }),
        h('span.sheet__points', { text: 'Punkte:        / ' + prepared.total })
      ));
    }
    sheet.appendChild(head);

    var number = 0;
    prepared.sections.forEach(function (section) {
      var body = h('tbody');
      section.rows.forEach(function (row) {
        number += 1;
        var tr = h('tr', {}, cell('sheet__no', String(number)));
        if (options.mode === 'recall') {
          tr.appendChild(cell('sheet__term', row.translation));
          tr.appendChild(cell('sheet__blank', ''));
        } else if (options.mode === 'recognise') {
          tr.appendChild(cell('sheet__term', withGaps(row.term)));
          tr.appendChild(cell('sheet__blank', ''));
        } else {
          tr.appendChild(cell('sheet__term', withGaps(row.term)));
          tr.appendChild(cell('sheet__de', row.translation));
          if (showExtra) tr.appendChild(cell('sheet__extra', row.extra));
        }
        body.appendChild(tr);
      });
      sheet.appendChild(h('div.sheet__section', {},
        section.title && prepared.sections.length > 1 ? h('h2', { text: section.title }) : null,
        h('table.sheet__table', {}, body)
      ));
    });
    sheet.rowCount = prepared.total;
    sheet.skipped = prepared.skipped;
    return sheet;
  }

  /* --- Drucken ------------------------------------------------------------------ */

  /**
   * Übergibt einen Knoten an den Druckdialog. Solange gedruckt wird, zeigt
   * das Dokument nur ihn (siehe styles/print.css); danach ist alles wie zuvor.
   */
  function printNode(node, title) {
    var root = document.getElementById('print-root');
    if (!root) return false;
    var html = document.documentElement;
    var previousTitle = document.title;
    var done = false;

    function cleanup() {
      if (done) return;
      done = true;
      window.removeEventListener('afterprint', cleanup);
      document.removeEventListener('pointerdown', cleanup, true);
      document.removeEventListener('keydown', cleanup, true);
      html.classList.remove('is-printing');
      util.clear(root);
      document.title = previousTitle;
    }

    util.clear(root);
    root.appendChild(node);
    html.classList.add('is-printing');
    // Der Titel wird zum vorgeschlagenen Dateinamen beim Speichern als PDF.
    if (title) document.title = title;
    window.addEventListener('afterprint', cleanup);
    try {
      window.print();
    } catch (err) {
      cleanup();
      BAO.toast.error('Der Druckdialog ließ sich nicht öffnen.');
      return false;
    }
    // Manche Browser melden das Ende des Druckens nicht: Dann räumt die
    // nächste Eingabe auf.
    window.setTimeout(function () {
      if (done) return;
      document.addEventListener('pointerdown', cleanup, true);
      document.addEventListener('keydown', cleanup, true);
    }, 0);
    return true;
  }

  /* --- Dialog ------------------------------------------------------------------- */

  /**
   * Fragt Art und Reihenfolge ab und druckt oder kopiert die Liste.
   * config: { title, subtitle, sections: [{ title, rows }] }
   */
  function openWordList(config) {
    var total = countRows(config.sections);
    if (!total) {
      BAO.toast.show('Hier gibt es noch nichts zu drucken.');
      return null;
    }

    // Eine Mischung je Wahl der Reihenfolge: Gedruckt wird, was die Vorschau zeigt.
    var seed = newSeed();
    var fieldTitle = ui.textField({ label: 'Überschrift', value: config.title || 'Wortliste' });
    var fieldMode = ui.selectField({
      label: 'Art des Blatts', value: last.mode,
      options: MODES.map(function (mode) { return { value: mode.id, label: mode.label }; }),
      onChange: refresh
    });
    var fieldOrder = ui.selectField({
      label: 'Reihenfolge', value: last.order,
      options: ORDERS.map(function (order) { return { value: order.id, label: order.label }; }),
      onChange: function () { seed = newSeed(); refresh(); }
    });
    var extraId = util.uid('chk');
    var extraBox = h('input', { type: 'checkbox', id: extraId, checked: last.extra ? true : null, onchange: refresh });
    var extraRow = h('div.toggle-row', {}, extraBox,
      h('label', { for: extraId, text: 'Wortverbindung oder Beispiel als dritte Spalte' }));
    var info = h('span.hint');
    var preview = h('div.sheet-preview', { 'aria-label': 'Vorschau des Blatts' });

    function options() {
      return {
        mode: util.$('select', fieldMode).value,
        order: util.$('select', fieldOrder).value,
        extra: extraBox.checked,
        title: fieldTitle.input.value.trim() || config.title || 'Wortliste',
        seed: seed
      };
    }

    function refresh() {
      var chosen = options();
      last = { mode: chosen.mode, order: chosen.order, extra: chosen.extra };
      extraRow.hidden = isTest(chosen.mode);
      var sheet = buildSheet(config, chosen);
      util.clear(preview);
      preview.appendChild(sheet);
      info.textContent = sheet.rowCount + ' ' + util.plural(sheet.rowCount, 'Zeile', 'Zeilen')
        + (sheet.skipped
          ? ' · ' + sheet.skipped + ' ohne deutsche Entsprechung '
            + util.plural(sheet.skipped, 'bleibt', 'bleiben') + ' im Test außen vor'
          : '');
      return sheet;
    }

    fieldTitle.input.addEventListener('input', refresh);
    refresh();

    return BAO.modal.open({
      title: 'Wortliste drucken',
      subtitle: 'Als Liste zum Mitnehmen oder als Vokabeltest. Im Druckdialog lässt sich das Blatt auch als PDF speichern.',
      width: '680px',
      body: h('div.stack', {},
        fieldTitle,
        h('div.grid2', {}, fieldMode, fieldOrder),
        extraRow,
        preview,
        info
      ),
      actions: [
        { label: 'Abbrechen', value: null, kind: 'ghost' },
        {
          label: 'Als Text kopieren',
          onSelect: function () {
            var prepared = prepare(config.sections, { mode: 'list', order: options().order, seed: seed });
            util.copyText(BAO.stock.rowsToText(prepared.sections)).then(function (ok) {
              if (ok) {
                BAO.toast.ok(prepared.total + ' ' + util.plural(prepared.total, 'Zeile', 'Zeilen')
                  + ' kopiert – einfügen in Textverarbeitung, Tabelle oder Lernplattform.');
              } else {
                BAO.toast.error('Der Browser hat das Kopieren nicht erlaubt.');
              }
            });
            return false;
          }
        },
        {
          label: 'Drucken', kind: 'primary',
          onSelect: function () {
            var chosen = options();
            var sheet = buildSheet(config, chosen);
            if (!sheet.rowCount) {
              BAO.toast.error('Für einen Test braucht jeder Eintrag eine deutsche Entsprechung.');
              return false;
            }
            // Erst schließen, dann drucken – der Druckdialog hält die Seite an.
            window.setTimeout(function () { printNode(sheet, chosen.title); }, 30);
            return true;
          }
        }
      ]
    });
  }

  BAO.print = {
    MODES: MODES,
    prepare: prepare,
    buildSheet: buildSheet,
    printNode: printNode,
    openWordList: openWordList
  };
})(window.BAO = window.BAO || {});
