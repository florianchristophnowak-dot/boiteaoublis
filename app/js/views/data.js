/* ==========================================================================
   Daten: Sicherung, Import, CSV, Einstellungen, Programminformationen
   Grundsatz: Nichts geht unbemerkt verloren. Vor jedem Import wird der
   bisherige Bestand gesichert und der Vorgang lässt sich rückgängig machen.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;
  var h = util.h;
  var ui = BAO.ui;
  var schema = BAO.schema;
  var select = BAO.select;

  /* --- Export ------------------------------------------------------------------ */

  function exportAll() {
    var payload = BAO.backup.exportToFile(BAO.store.getState());
    BAO.toast.ok('Sicherung erstellt: ' + payload.counts.lexemes + ' Wortschatzeinträge, '
      + payload.counts.starters + ' Satzanfänge, ' + payload.counts.banks + ' Wortbanken.');
  }

  function exportCsv(ctx) {
    if (!ctx.group) return;
    var lexemes = select.lexemesOfGroup(BAO.store.getState(), ctx.group.id);
    if (!lexemes.length) { BAO.toast.error('Diese Lerngruppe hat noch keinen Wortschatz.'); return; }
    var csv = BAO.csv.lexemesToCsv(lexemes);
    var name = 'wortschatz_' + util.fold(ctx.subject.name).slice(0, 3) + '_' + util.fold(ctx.group.name) + '.csv';
    util.downloadText(name, '﻿' + csv, 'text/csv');
    BAO.toast.ok(lexemes.length + ' Einträge als CSV gespeichert.');
  }

  /* --- Import einer Sicherung --------------------------------------------------- */

  function countRow(label, before, after) {
    return h('tr', {},
      h('td', { text: label }),
      h('td', { text: String(before) }),
      h('td', { text: String(after) }),
      h('td', { text: (after - before >= 0 ? '+' : '') + (after - before) })
    );
  }

  function showImportDialog(result) {
    var state = BAO.store.getState();
    var incoming = result.incoming;
    var before = BAO.backup.counts(state);
    var after = BAO.backup.counts(incoming);

    var table = h('table.mini', {},
      h('thead', {}, h('tr', {},
        h('th', { text: 'Inhalt' }), h('th', { text: 'jetzt' }),
        h('th', { text: 'in der Datei' }), h('th', { text: 'Differenz' })
      )),
      h('tbody', {},
        Object.keys(BAO.backup.COUNT_LABELS).map(function (key) {
          return countRow(BAO.backup.COUNT_LABELS[key], before[key], after[key]);
        })
      )
    );

    return BAO.modal.open({
      title: 'Sicherung einlesen',
      subtitle: result.meta.exportedAt
        ? 'Erstellt am ' + util.formatDateTime(result.meta.exportedAt)
          + (result.meta.appVersion ? ' mit Version ' + result.meta.appVersion : '')
        : 'Herkunft der Datei unbekannt.',
      width: '640px',
      dismissable: true,
      body: h('div.stack', {},
        h('div.table-wrap', {}, table),
        result.meta.migrations && result.meta.migrations.length
          ? h('div.note', { text: 'Die Datei wurde auf die aktuelle Datenversion angehoben: ' + result.meta.migrations.join('; ') })
          : null,
        result.warnings.length
          ? h('div.note.note--warn', {}, h('strong', { text: 'Hinweise beim Prüfen:' }),
            h('ul', {}, result.warnings.slice(0, 6).map(function (w) { return h('li', { text: w }); })))
          : null,
        h('div.stack.stack--tight', {},
          h('strong', { text: 'Wie sollen die Daten übernommen werden?' }),
          h('div.note', {
            text: 'Zusammenführen: Vorhandenes bleibt erhalten, Neues kommt hinzu, bei gleicher Kennung gewinnt '
              + 'der jüngere Stand. Wiederherstellen: Der jetzige Bestand wird vollständig ersetzt.'
          }),
          h('span.hint', { text: 'Beides lässt sich mit Strg + Z rückgängig machen; zusätzlich wird eine Sicherheitskopie abgelegt.' })
        )
      ),
      actions: [
        { label: 'Abbrechen', value: null, kind: 'ghost' },
        {
          label: 'Zusammenführen', kind: 'primary',
          onSelect: function () {
            var merged = BAO.backup.merge(BAO.store.getState(), incoming);
            BAO.store.replaceState(merged.state, 'Sicherung zusammengeführt');
            var lines = BAO.backup.summariseReport(merged.report);
            BAO.toast.undoable(lines.length ? 'Zusammengeführt – ' + lines.join(', ') : 'Nichts Neues gefunden.', { timeout: 12000 });
            return true;
          }
        },
        {
          label: 'Wiederherstellen (ersetzen)', kind: 'danger',
          onSelect: function () {
            return BAO.modal.confirm({
              title: 'Bestand wirklich ersetzen?',
              text: 'Der jetzige Bestand wird durch den Inhalt der Datei ersetzt.',
              detail: 'Eine Sicherheitskopie des jetzigen Standes wird angelegt, und der Schritt lässt sich rückgängig machen.',
              confirmLabel: 'Ersetzen', danger: true
            }).then(function (confirmed) {
              if (!confirmed) return false;
              BAO.store.replaceState(incoming, 'Sicherung wiederhergestellt');
              BAO.toast.undoable('Bestand aus der Sicherung wiederhergestellt.', { timeout: 12000 });
              return true;
            });
          }
        }
      ]
    });
  }

  function handleBackupFile(file) {
    if (!file) return;
    util.readFileAsText(file).then(function (text) {
      var result = BAO.backup.analyse(text, BAO.store.getState());
      if (!result.ok) {
        BAO.modal.open({
          title: 'Diese Datei kann nicht eingelesen werden',
          width: '520px',
          body: h('div.stack', {},
            h('div.note.note--danger', {}, h('ul', {}, result.errors.map(function (e) { return h('li', { text: e }); }))),
            h('p', { text: 'Der vorhandene Bestand wurde nicht verändert.' })
          ),
          actions: [{ label: 'Verstanden', value: null, kind: 'primary' }]
        });
        return;
      }
      showImportDialog(result);
    }).catch(function (err) {
      BAO.toast.error('Die Datei konnte nicht gelesen werden: ' + err.message);
    });
  }

  /* --- CSV-Import ---------------------------------------------------------------- */

  function showCsvDialog(text, ctx) {
    var parsed = BAO.csv.parse(text);
    if (!parsed.rows.length) { BAO.toast.error('Die CSV-Datei enthält keine Daten.'); return; }

    var hasHeader = BAO.csv.looksLikeHeader(parsed.rows[0]);
    var header = hasHeader ? parsed.rows[0] : parsed.rows[0].map(function (_, i) { return 'Spalte ' + (i + 1); });
    var dataRows = hasHeader ? parsed.rows.slice(1) : parsed.rows;
    var mapping = hasHeader ? BAO.csv.guessMapping(parsed.rows[0]) : { term: 0, translation: 1 };

    var fieldStatus = ui.selectField({ label: 'Status für alle neuen Einträge', value: 'new', options: ui.statusOptions() });
    var fieldUnit = ui.selectField({
      label: 'Unterrichtsreihe', value: ctx.unit ? ctx.unit.id : '',
      options: ui.unitOptions(BAO.store.getState(), ctx.group.id)
    });

    var mappingGrid = h('div.grid3');
    var previewWrap = h('div.table-wrap');

    function refreshPreview() {
      util.clear(previewWrap);
      var fields = Object.keys(mapping).filter(function (key) { return mapping[key] !== null && mapping[key] !== undefined; });
      var table = h('table.mini', {},
        h('thead', {}, h('tr', {}, fields.map(function (f) { return h('th', { text: BAO.csv.FIELD_LABELS[f] }); }))),
        h('tbody', {}, dataRows.slice(0, 5).map(function (row) {
          return h('tr', {}, fields.map(function (f) { return h('td', { text: row[mapping[f]] || '' }); }));
        }))
      );
      previewWrap.appendChild(table);
    }

    Object.keys(BAO.csv.FIELD_LABELS).forEach(function (field) {
      var options = [{ value: '', label: '– nicht übernehmen –' }].concat(header.map(function (name, index) {
        return { value: String(index), label: name };
      }));
      mappingGrid.appendChild(ui.selectField({
        label: BAO.csv.FIELD_LABELS[field] + (field === 'term' ? ' *' : ''),
        value: mapping[field] === undefined ? '' : String(mapping[field]),
        options: options,
        onChange: function (value) {
          if (value === '') delete mapping[field];
          else mapping[field] = parseInt(value, 10);
          refreshPreview();
        }
      }));
    });
    refreshPreview();

    return BAO.modal.open({
      title: 'CSV-Datei einlesen',
      subtitle: dataRows.length + ' Datenzeilen erkannt · Trennzeichen „'
        + (parsed.delimiter === '\t' ? 'Tabulator' : parsed.delimiter) + '“'
        + (hasHeader ? ' · mit Kopfzeile' : ' · ohne Kopfzeile'),
      width: '760px',
      body: h('div.stack', {},
        h('div.note', {
          text: 'Die Einträge werden der Lerngruppe ' + ctx.group.name + ' (' + ctx.subject.name + ') hinzugefügt.'
        }),
        h('div.grid2', {}, fieldStatus, fieldUnit),
        h('details.form-more', { open: true },
          h('summary', { text: 'Spaltenzuordnung prüfen' }),
          mappingGrid
        ),
        h('div.field', {}, h('label', { text: 'Vorschau' }), previewWrap)
      ),
      actions: [
        { label: 'Abbrechen', value: null, kind: 'ghost' },
        {
          label: 'Einträge importieren', kind: 'primary',
          onSelect: function () {
            if (mapping.term === undefined) {
              BAO.toast.error('Bitte eine Spalte für das Zielwort zuordnen.');
              return false;
            }
            var state = BAO.store.getState();
            var unitId = util.$('select', fieldUnit).value;
            var unit = unitId ? select.unit(state, unitId) : null;
            var outcome = BAO.csv.toLexemes(dataRows, mapping, {
              subjectId: ctx.subject.id, groupId: ctx.group.id,
              status: util.$('select', fieldStatus).value,
              unitId: unitId, schoolYear: unit ? unit.schoolYear : ctx.group.schoolYear
            }, select.lexemesOfGroup(state, ctx.group.id));

            if (!outcome.entries.length) { BAO.toast.error('Keine Zeile enthielt ein Zielwort.'); return false; }

            BAO.store.commit(outcome.entries.length + ' Einträge importiert', function (draft) {
              outcome.entries.forEach(function (entry) { draft.lexemes.push(entry); });
            });
            var message = outcome.entries.length + ' Einträge importiert.';
            if (outcome.duplicates.length) message += ' ' + outcome.duplicates.length + ' davon gibt es bereits ähnlich.';
            if (outcome.skipped) message += ' ' + outcome.skipped + ' Zeilen ohne Zielwort übersprungen.';
            BAO.toast.undoable(message, { timeout: 12000 });
            return true;
          }
        }
      ]
    });
  }

  function handleCsvFile(file, ctx) {
    if (!file) return;
    if (!ctx.group) { BAO.toast.error('Bitte zuerst eine Lerngruppe wählen.'); return; }
    util.readFileAsText(file).then(function (text) { showCsvDialog(text, ctx); })
      .catch(function (err) { BAO.toast.error('Die Datei konnte nicht gelesen werden: ' + err.message); });
  }

  /* --- Einstellungen -------------------------------------------------------------- */

  function settingsCard(state) {
    var levelGrid = h('div.grid2');
    schema.FIELDS.forEach(function (field) {
      var levelSelect = ui.selectField({
        value: String(state.settings.fieldLevels[field.key] === undefined ? field.level : state.settings.fieldLevels[field.key]),
        ariaLabel: 'Ab Stufe: ' + field.label,
        options: schema.LEVELS.map(function (l) { return { value: String(l.id), label: 'ab Stufe ' + l.id + ' (' + l.name + ')' }; }),
        onChange: function (value) {
          BAO.store.commit('Zuordnung der Unterstützungsstufen', function (draft) {
            draft.settings.fieldLevels[field.key] = parseInt(value, 10);
          });
          if (BAO.session.getState().active) BAO.session.setLevel(BAO.session.getState().level);
        }
      });
      levelSelect.style.width = 'auto';
      levelSelect.style.minWidth = '13rem';
      levelGrid.appendChild(h('div.row', {},
        h('span', { style: { flex: '1 1 auto', 'min-width': '8ch' }, text: field.label }),
        levelSelect
      ));
    });

    var scenes = h('div.row');
    (state.settings.scenes || []).forEach(function (scene) {
      scenes.appendChild(h('span.chip.chip--tag', {}, scene,
        h('button', {
          type: 'button', text: '×', 'aria-label': 'Szene entfernen: ' + scene,
          onclick: function () {
            BAO.store.commit('Szene entfernt', function (draft) {
              draft.settings.scenes = draft.settings.scenes.filter(function (s) { return s !== scene; });
            });
          }
        })
      ));
    });
    scenes.appendChild(h('button.btn.btn--sm', {
      type: 'button', text: '+ Szene',
      onclick: function () {
        BAO.modal.prompt({ title: 'Neue Unterrichtsszene', label: 'Bezeichnung', placeholder: 'z. B. Debatte' })
          .then(function (value) {
            if (!value) return;
            BAO.store.commit('Szene ergänzt', function (draft) {
              if (draft.settings.scenes.indexOf(value) < 0) draft.settings.scenes.push(value);
            });
          });
      }
    }));

    var functions = h('div.row');
    select.functions(state).forEach(function (fn) {
      functions.appendChild(h('span.chip.chip--tag', {}, fn.label,
        h('button', {
          type: 'button', text: '×', 'aria-label': 'Funktion entfernen: ' + fn.label,
          onclick: function () {
            var used = state.starters.filter(function (s) { return s.functionId === fn.id; }).length;
            BAO.modal.confirm({
              title: 'Funktion entfernen?',
              text: '„' + fn.label + '“ wird aus der Liste entfernt.',
              detail: used ? used + ' Satzanfänge verlieren ihre Zuordnung, bleiben aber erhalten.' : '',
              confirmLabel: 'Entfernen', danger: true
            }).then(function (confirmed) {
              if (!confirmed) return;
              BAO.store.commit('Funktion entfernt', function (draft) {
                draft.functions = draft.functions.filter(function (f) { return f.id !== fn.id; });
                draft.starters.forEach(function (s) { if (s.functionId === fn.id) s.functionId = ''; });
              });
            });
          }
        })
      ));
    });
    functions.appendChild(h('button.btn.btn--sm', {
      type: 'button', text: '+ Funktion',
      onclick: function () {
        BAO.modal.prompt({ title: 'Neue kommunikative Funktion', label: 'Bezeichnung', placeholder: 'z. B. eine Vermutung äußern' })
          .then(function (value) {
            if (!value) return;
            BAO.store.commit('Funktion ergänzt', function (draft) {
              draft.functions.push({ id: util.uid('fn'), label: value, order: draft.functions.length });
            });
          });
      }
    }));

    return h('div.card', {},
      h('div.card__head', {}, h('h2', { text: 'Einstellungen' })),
      h('div.card__body.stack', {},
        h('div.field', {},
          h('label', { text: 'Welche Angaben ab welcher Unterstützungsstufe erscheinen' }),
          h('span.hint', { text: 'Gilt für alle Wortbanken. Im Unterricht lässt sich jede Angabe zusätzlich einzeln ein- und ausblenden.' }),
          levelGrid
        ),
        h('div.field', {}, h('label', { text: 'Unterrichtsszenen' }), scenes),
        h('div.field', {}, h('label', { text: 'Kommunikative Funktionen' }), functions)
      )
    );
  }

  /* --- Ansicht -------------------------------------------------------------------- */

  function render(host, context) {
    var state = context.state;
    var ctx = context.ctx;
    var app = context.app;
    var view = h('div.view');
    var storage = BAO.store.storageInfo();
    var totals = select.totals(state);
    var safety = BAO.storage.loadSafetyCopy();

    view.appendChild(h('div.view__head', {},
      h('div.view__title', {},
        h('h1', { text: 'Daten und Sicherung' }),
        h('span.sub', { text: 'Alles bleibt auf diesem Rechner. Exportieren, einlesen, einstellen.' })
      )
    ));

    var dropzone = h('div.dropzone', {},
      h('strong', { text: 'Sicherungsdatei hierher ziehen' }),
      h('p', { text: 'oder Datei auswählen (.json)' }),
      h('button.btn', {
        type: 'button', text: 'Datei auswählen',
        onclick: function () { util.pickFile('application/json,.json').then(handleBackupFile); }
      })
    );
    ['dragenter', 'dragover'].forEach(function (type) {
      dropzone.addEventListener(type, function (event) {
        event.preventDefault();
        dropzone.classList.add('is-over');
      });
    });
    ['dragleave', 'drop'].forEach(function (type) {
      dropzone.addEventListener(type, function (event) {
        event.preventDefault();
        dropzone.classList.remove('is-over');
        if (type === 'drop' && event.dataTransfer.files && event.dataTransfer.files[0]) {
          handleBackupFile(event.dataTransfer.files[0]);
        }
      });
    });

    var grid = h('div.data-grid', {},
      h('div.card', {},
        h('div.card__head', {}, h('h2', { text: 'Sicherung erstellen' })),
        h('div.card__body.stack', {},
          h('p', {
            text: 'Der Export enthält alle Fächer, Lerngruppen, Reihen, Wortschatzeinträge, Satzanfänge, '
              + 'Wortbanken und Einstellungen in einer einzigen Datei.'
          }),
          h('dl.kv', {},
            h('dt', { text: 'Fächer' }), h('dd', { text: String(totals.subjects) }),
            h('dt', { text: 'Lerngruppen' }), h('dd', { text: String(totals.groups) }),
            h('dt', { text: 'Wortschatz' }), h('dd', { text: String(totals.lexemes) }),
            h('dt', { text: 'Satzanfänge' }), h('dd', { text: String(totals.starters) }),
            h('dt', { text: 'Wortbanken' }), h('dd', { text: String(totals.banks) })
          ),
          h('button.btn.btn--primary.btn--wide', { type: 'button', text: 'Alle Daten exportieren', onclick: exportAll }),
          h('button.btn.btn--wide', {
            type: 'button',
            text: ctx.group ? 'Wortschatz von ' + ctx.group.name + ' als CSV' : 'CSV-Export (Lerngruppe wählen)',
            disabled: ctx.group ? null : true,
            onclick: function () { exportCsv(ctx); }
          })
        )
      ),

      h('div.card', {},
        h('div.card__head', {}, h('h2', { text: 'Sicherung einlesen' })),
        h('div.card__body.stack', {},
          dropzone,
          h('p.hint', {
            text: 'Nach dem Prüfen entscheidest du: zusammenführen, vollständig wiederherstellen oder abbrechen.'
          }),
          safety
            ? h('div.note.note--warn', {},
              h('div', { text: 'Sicherheitskopie vorhanden vom ' + util.formatDateTime(safety.savedAt) + '.' }),
              h('button.btn.btn--sm', {
                type: 'button', text: 'Sicherheitskopie wiederherstellen',
                style: { 'margin-top': 'var(--sp-2)' },
                onclick: function () {
                  BAO.modal.confirm({
                    title: 'Sicherheitskopie wiederherstellen?',
                    text: 'Der jetzige Bestand wird durch den Stand vom ' + util.formatDateTime(safety.savedAt) + ' ersetzt.',
                    confirmLabel: 'Wiederherstellen', danger: true
                  }).then(function (confirmed) {
                    if (!confirmed) return;
                    var checked = schema.validateState(safety.state);
                    BAO.store.replaceState(checked.state, 'Sicherheitskopie wiederhergestellt');
                    BAO.toast.undoable('Sicherheitskopie wiederhergestellt.');
                  });
                }
              }))
            : null
        )
      ),

      h('div.card', {},
        h('div.card__head', {}, h('h2', { text: 'Wortschatzliste als CSV einlesen' })),
        h('div.card__body.stack', {},
          h('p', {
            text: 'Für vorhandene Listen aus Tabellenprogrammen. Trennzeichen und Spalten werden erkannt '
              + 'und lassen sich vor dem Import prüfen.'
          }),
          h('button.btn.btn--wide', {
            type: 'button',
            text: ctx.group ? 'CSV-Datei auswählen' : 'Erst eine Lerngruppe wählen',
            disabled: ctx.group ? null : true,
            onclick: function () {
              util.pickFile('.csv,text/csv,text/plain').then(function (file) { handleCsvFile(file, ctx); });
            }
          }),
          h('span.hint', {
            text: 'Erkannte Spaltennamen: Zielwort, Artikel, Deutsch, Wortverbindung, Chunk, Erklärung, '
              + 'Beispiel, Aussprache, Thema, Tags, Niveau, Status.'
          })
        )
      )
    );
    view.appendChild(grid);

    view.appendChild(h('div', { style: { 'margin-top': 'var(--sp-5)' } }, settingsCard(state)));

    /* --- Programminformationen ---------------------------------------------- */
    view.appendChild(h('div.card', { style: { 'margin-top': 'var(--sp-5)' } },
      h('div.card__head', {}, h('h2', { text: 'Über Boîte à Oublis' })),
      h('div.card__body', {},
        h('dl.kv', {},
          h('dt', { text: 'Version' }), h('dd', { text: schema.APP_VERSION }),
          h('dt', { text: 'Datenversion' }), h('dd', { text: String(state.schemaVersion) }),
          h('dt', { text: 'Speicherung' }), h('dd', {
            text: storage.available
              ? 'lokal im Browser (localStorage), etwa ' + Math.round(storage.bytes / 1024) + ' kB'
              : 'nicht verfügbar – bitte regelmäßig exportieren'
          }),
          h('dt', { text: 'Zuletzt gespeichert' }), h('dd', { text: util.formatDateTime(storage.savedAt) || '–' }),
          h('dt', { text: 'Datenschutz' }), h('dd', {
            text: 'Keine Konten, keine Server, keine Übertragung. Alles bleibt auf diesem Rechner.'
          }),
          h('dt', { text: 'Urheber' }), h('dd', { text: '© Florian Nowak' })
        ),
        h('div.row', { style: { 'margin-top': 'var(--sp-4)' } },
          h('button.btn.btn--danger.btn--sm', {
            type: 'button', text: 'Alle lokalen Daten zurücksetzen',
            onclick: function () {
              BAO.modal.confirm({
                title: 'Wirklich alles zurücksetzen?',
                text: 'Der gesamte lokale Bestand wird gelöscht und die Beispieldaten werden neu angelegt.',
                detail: 'Bitte vorher exportieren. Der Schritt lässt sich mit Strg + Z rückgängig machen.',
                confirmLabel: 'Zurücksetzen', danger: true
              }).then(function (confirmed) {
                if (!confirmed) return;
                var fresh = schema.emptyState();
                BAO.seed.fill(fresh);
                BAO.store.replaceState(fresh, 'Alles zurückgesetzt');
                BAO.toast.undoable('Zurückgesetzt – die Beispieldaten sind wieder da.');
                app.go('start');
              });
            }
          })
        )
      )
    ));

    host.appendChild(view);
  }

  BAO.views = BAO.views || {};
  BAO.views.data = { render: render, exportAll: exportAll, handleBackupFile: handleBackupFile };
})(window.BAO = window.BAO || {});
