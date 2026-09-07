/* ==========================================================================
   Steuerungsansicht der Projektion
   Links die Vorschau dessen, was die Lernenden sehen, rechts alles, was nur
   die Lehrkraft sieht: Unterstützungsstufen, Abschnitte, Automatik und
   Live-Hilfe.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;
  var h = util.h;
  var ui = BAO.ui;
  var schema = BAO.schema;
  var select = BAO.select;

  var refs = {};
  var isRendering = false;
  var keysBound = false;

  var FULL_RENDER_REASONS = {
    start: true, rebuild: true, level: true, fields: true, focus: true, stop: true,
    'live-added': true, 'live-removed': true, 'live-cleared': true,
    'window-opened': true, 'window-closed': true, 'overlay-opened': true, 'overlay-closed': true
  };

  /* --- Tastatursteuerung ------------------------------------------------------ */

  function isTyping(event) {
    var target = event.target;
    if (!target) return false;
    var tag = (target.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
  }

  function handleKey(event, source) {
    var session = BAO.session.getState();
    if (!session.active) return;
    if (source !== 'window') {
      var route = BAO.app.currentRoute();
      if (route.path !== 'projektion' && !BAO.output.isOverlayOpen()) return;
      if (isTyping(event)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      // Solange ein Dialog offen ist, gehört die Tastatur dem Dialog.
      var modalRoot = document.getElementById('modal-root');
      if (modalRoot && modalRoot.firstChild) return;
    }

    var key = event.key;
    var handled = true;
    switch (key) {
      case 'ArrowRight': case 'PageDown': BAO.session.next(false); break;
      case 'ArrowLeft': case 'PageUp': BAO.session.prev(); break;
      case 'Home': BAO.session.goTo(0); break;
      case 'End': BAO.session.goTo(BAO.session.totalSlides() - 1); break;
      case ' ': case 'Spacebar':
        if (!BAO.session.toggleAuto() && !BAO.session.getState().auto.playing) {
          BAO.toast.show('Die Automatik startet nicht: letzte Seite erreicht oder Abschreibmodus aktiv.', { timeout: 3000 });
        }
        break;
      case 'b': case 'B': BAO.session.toggleBlank(); break;
      case 'c': case 'C': BAO.session.toggleCopyMode(); break;
      case 'f': case 'F':
        if (source === 'window') BAO.output.requestWindowFullscreen();
        else if (BAO.output.isOverlayOpen()) BAO.output.toggleOverlayFullscreen();
        else BAO.output.openOverlay();
        break;
      case '1': BAO.session.setLevel(1); break;
      case '2': BAO.session.setLevel(2); break;
      case '3': BAO.session.setLevel(3); break;
      case '+': BAO.session.setScale(BAO.session.getState().scale + 0.1); break;
      case '-': BAO.session.setScale(BAO.session.getState().scale - 0.1); break;
      case 'Escape':
        if (source === 'window') { handled = false; break; }
        if (BAO.output.isOverlayOpen()) BAO.output.closeOverlay(); else handled = false;
        break;
      default: handled = false;
    }
    if (handled) event.preventDefault();
  }

  function bindKeys() {
    if (keysBound) return;
    keysBound = true;
    document.addEventListener('keydown', function (event) { handleKey(event, 'document'); });
    BAO.output.onKey(handleKey);
    BAO.session.subscribe(function (state, reason) {
      if (isRendering) return;
      if (FULL_RENDER_REASONS[reason]) {
        if (BAO.app.currentRoute().path === 'projektion') BAO.app.scheduleRender();
        return;
      }
      syncControls();
    });
  }

  /* --- Laufende Aktualisierung ohne Neuaufbau --------------------------------- */

  function syncControls() {
    var session = BAO.session.getState();
    var deck = BAO.session.getDeck();
    if (!refs.position || !deck) return;
    var total = deck.slides.length;
    var slide = deck.slides[session.index];

    refs.position.textContent = total ? 'Seite ' + (session.index + 1) + ' von ' + total : 'keine Seite';
    if (refs.sectionInfo) {
      refs.sectionInfo.textContent = slide
        ? 'Abschnitt ' + (slide.sectionIndex + 1) + ' von ' + deck.sections.length + ': ' + slide.sectionTitle
        : '';
    }
    if (refs.progressBar) {
      refs.progressBar.style.width = total ? Math.round(((session.index + 1) / total) * 100) + '%' : '0%';
    }
    if (refs.playButton) {
      refs.playButton.setAttribute('aria-pressed', session.auto.playing ? 'true' : 'false');
      util.clear(refs.playButton);
      refs.playButton.appendChild(document.createTextNode(session.auto.playing ? '❚❚' : '▶'));
      refs.playButton.title = session.auto.playing ? 'Automatik anhalten (Leertaste)' : 'Automatik starten (Leertaste)';
    }
    if (refs.countdown) {
      refs.countdown.textContent = session.auto.playing
        ? 'nächste Seite in ' + Math.max(0, Math.ceil(session.auto.remaining)) + ' s'
        : (session.copyMode ? 'Abschreibmodus – Seite bleibt stehen' : 'Automatik aus');
    }
    if (refs.sectionMap) {
      util.$$('.section-map__item', refs.sectionMap).forEach(function (node) {
        node.setAttribute('aria-current', slide && node.dataset.sectionId === slide.sectionId ? 'true' : 'false');
      });
    }
  }

  /* --- Live-Hilfe dauerhaft speichern ------------------------------------------ */

  function saveLiveEntry(item, ctx, bank) {
    var state = BAO.store.getState();
    var isStarter = item.type === 'starter';
    var fieldText = ui.textField({ label: isStarter ? 'Satzanfang' : 'Zielwort', value: item.text, full: true });
    var fieldTranslation = ui.textField({ label: 'Deutsch (optional)', value: item.translation, full: true });
    var fieldStatus = ui.selectField({ label: 'Status', value: 'new', options: ui.statusOptions() });
    var fieldFunction = ui.selectField({ label: 'Kommunikative Funktion', value: '', options: ui.functionOptions(state, true) });
    var addToBank = h('input', { type: 'checkbox', checked: bank ? true : null, disabled: bank ? null : true });

    return BAO.modal.open({
      title: 'Live-Hilfe dauerhaft speichern',
      subtitle: 'Der Eintrag wandert in den Bestand von ' + ctx.group.name + '.',
      width: '560px',
      body: h('div.stack', {},
        fieldText, fieldTranslation,
        h('div.grid2', {}, isStarter ? fieldFunction : fieldStatus),
        h('label.switch', {}, addToBank,
          h('span', { text: bank ? 'zusätzlich in die Wortbank „' + bank.title + '“ aufnehmen' : 'keine Wortbank geöffnet' }))
      ),
      actions: [
        { label: 'Abbrechen', value: null, kind: 'ghost' },
        {
          label: 'Speichern', kind: 'primary',
          onSelect: function () {
            var text = fieldText.input.value.trim();
            if (!text) { fieldText.input.focus(); return false; }
            var newId = null;
            BAO.store.commit('Live-Hilfe gespeichert', function (draft) {
              if (isStarter) {
                var starter = schema.makeStarter({
                  subjectId: ctx.subject.id, groupId: ctx.group.id, text: text,
                  translation: fieldTranslation.input.value.trim(),
                  functionId: util.$('select', fieldFunction).value
                });
                draft.starters.push(starter);
                newId = starter.id;
              } else {
                var lex = schema.makeLexeme({
                  subjectId: ctx.subject.id, groupId: ctx.group.id, term: text,
                  translation: fieldTranslation.input.value.trim(),
                  status: util.$('select', fieldStatus).value,
                  introducedUnitId: ctx.unit ? ctx.unit.id : '',
                  introducedSchoolYear: ctx.group.schoolYear
                });
                draft.lexemes.push(lex);
                newId = lex.id;
              }
              if (bank && addToBank.checked) {
                var target = select.bank(draft, bank.id);
                if (target) {
                  var section = target.sections[target.sections.length - 1];
                  if (!section) {
                    section = schema.makeSection({ title: 'Live ergänzt' });
                    target.sections.push(section);
                  }
                  section.items.push(schema.makeBankItem({ kind: isStarter ? 'starter' : 'lex', refId: newId }));
                  target.updatedAt = util.nowISO();
                }
              }
            });
            BAO.session.removeLive(item.id);
            BAO.toast.undoable('Im Bestand gespeichert.');
            return true;
          }
        }
      ]
    });
  }

  /* --- Bausteine der Steuerung -------------------------------------------------- */

  function levelCard(session) {
    var card = h('div.ctrl-card', {},
      h('h3', {}, 'Unterstützungsstufe', h('span.spacer'),
        h('span.chip.chip--outline', { text: 'Tasten 1 – 3' }))
    );
    var levels = h('div.levels');
    schema.LEVELS.forEach(function (level) {
      levels.appendChild(h('button.level-btn', {
        type: 'button',
        'aria-pressed': session.level === level.id ? 'true' : 'false',
        onclick: function () { BAO.session.setLevel(level.id); }
      },
        h('strong', { text: level.id + ' · ' + level.name }),
        h('small', { text: level.hint })
      ));
    });
    card.appendChild(levels);

    var toggles = h('div.toggles', { style: { 'margin-top': 'var(--sp-3)' } });
    schema.FIELDS.forEach(function (field) {
      var id = 'fld_' + field.key;
      toggles.appendChild(h('div.toggle-row', {},
        h('input', {
          type: 'checkbox', id: id,
          checked: session.fields && session.fields[field.key] ? true : null,
          onchange: function () { BAO.session.toggleField(field.key); }
        }),
        h('label', { for: id, text: field.label })
      ));
    });
    card.appendChild(h('details.form-more', { open: true },
      h('summary', { text: 'Einzelne Hilfen ein- oder ausblenden' }),
      toggles,
      h('span.hint', { text: 'Ein Wechsel der Stufe setzt diese Schalter wieder auf die Voreinstellung.' })
    ));
    return card;
  }

  function sectionCard(session, app) {
    var deck = BAO.session.getDeck();
    var summary = BAO.session.summary();
    var slide = BAO.session.currentSlide();
    var map = h('div.section-map');
    refs.sectionMap = map;

    if (!summary.length) {
      map.appendChild(h('span.hint', { text: 'Diese Wortbank enthält noch keine Einträge.' }));
    }

    summary.forEach(function (section, index) {
      map.appendChild(h('button.section-map__item', {
        type: 'button',
        dataset: { sectionId: section.id },
        'aria-current': slide && slide.sectionId === section.id ? 'true' : 'false',
        onclick: function () { BAO.session.goToSection(section.id); }
      },
        h('span.section-map__idx', { text: (index + 1) + '.' }),
        h('span', { text: section.title }),
        h('span.section-map__count', {
          text: section.items + ' · ' + section.slides + ' ' + util.plural(section.slides, 'Seite', 'Seiten')
        })
      ));
    });

    return h('div.ctrl-card', {},
      h('h3', {}, 'Abschnitte', h('span.spacer'),
        h('button.btn.btn--sm', {
          type: 'button',
          'aria-pressed': session.focusSectionId ? 'true' : 'false',
          title: 'Fokusmodus: nur den aktuellen Abschnitt groß zeigen',
          onclick: function () {
            var current = BAO.session.currentSlide();
            if (session.focusSectionId) BAO.session.toggleFocus(session.focusSectionId);
            else if (current) BAO.session.toggleFocus(current.sectionId);
          }
        }, ui.icon('focus', 14), 'Fokus')
      ),
      map,
      session.focusSectionId
        ? h('div.note', { text: 'Fokusmodus aktiv: Es wird nur ein Abschnitt gezeigt – dafür deutlich größer.' })
        : null
    );
  }

  function autoCard(session) {
    var progress = h('div.progress-track', {}, h('div.progress-bar'));
    refs.progressBar = util.$('.progress-bar', progress);
    var countdown = h('span.hint');
    refs.countdown = countdown;

    var secondsInput = h('input', {
      type: 'number', min: '5', max: '600', step: '5', value: String(session.auto.seconds),
      'aria-label': 'Intervall in Sekunden',
      onchange: function (event) { BAO.session.setSeconds(parseInt(event.target.value, 10) || 45); }
    });

    var presets = h('div.filterbar');
    [20, 30, 45, 60, 90].forEach(function (value) {
      presets.appendChild(h('button.btn.btn--sm', {
        type: 'button',
        'aria-pressed': session.auto.seconds === value ? 'true' : 'false',
        text: value + ' s',
        onclick: function () { BAO.session.setSeconds(value); BAO.app.scheduleRender(); }
      }));
    });

    var loopId = 'auto_loop';
    return h('div.ctrl-card', {},
      h('h3', {}, 'Automatisches Weiterschalten'),
      h('div.stack.stack--tight', {},
        presets,
        h('div.row', {},
          h('span.label', { text: 'Intervall' }), secondsInput, h('span.hint', { text: 'Sekunden' })
        ),
        progress,
        countdown,
        h('div.toggle-row', {},
          h('input', {
            type: 'checkbox', id: loopId,
            checked: BAO.store.getState().settings.autoAdvanceLoop ? true : null,
            onchange: function (event) {
              var value = event.target.checked;
              BAO.store.commit('Automatik-Wiederholung', function (draft) {
                draft.settings.autoAdvanceLoop = value;
              }, { undoable: false });
            }
          }),
          h('label', { for: loopId, text: 'am Ende wieder von vorn beginnen' })
        ),
        h('span.hint', {
          text: 'Ohne Wiederholung bleibt die letzte Seite stehen – kein überraschender Neustart mitten im Abschreiben.'
        })
      )
    );
  }

  function liveCard(session, ctx, bank) {
    var input = h('input', { type: 'text', placeholder: 'Ausdruck oder Satzanfang …', 'aria-label': 'Live-Hilfe eingeben' });
    var typeSelect = ui.selectField({
      value: 'word', ariaLabel: 'Art der Live-Hilfe',
      options: [{ value: 'word', label: 'Ausdruck' }, { value: 'starter', label: 'Satzanfang' }]
    });

    function add() {
      var text = input.value.trim();
      if (!text) return;
      BAO.session.addLive({ type: typeSelect.value, text: text });
      input.value = '';
      input.focus();
    }
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') { event.preventDefault(); add(); }
      event.stopPropagation();
    });

    var list = h('div.live-list');
    session.live.forEach(function (item) {
      list.appendChild(h('div.live-item', {},
        h('span.live-item__text', { text: (item.type === 'starter' ? '❝ ' : '') + item.text }),
        h('button.btn.btn--sm', {
          type: 'button', text: 'Speichern',
          title: 'Dauerhaft in den Bestand übernehmen',
          onclick: function () { saveLiveEntry(item, ctx, bank); }
        }),
        h('button.btn.btn--sm.btn--icon', {
          type: 'button', text: '×', title: 'Nur ausblenden',
          onclick: function () { BAO.session.removeLive(item.id); }
        })
      ));
    });

    return h('div.ctrl-card', {},
      h('h3', {}, 'Live-Hilfe', h('span.spacer'),
        session.live.length
          ? h('button.btn.btn--sm', {
            type: 'button', text: 'Alle entfernen', onclick: function () { BAO.session.clearLive(); }
          })
          : null
      ),
      h('div.live-form', {},
        h('div.row', {}, input),
        h('div.row', {}, typeSelect,
          h('button.btn.btn--primary.btn--sm', { type: 'button', text: 'Einblenden', onclick: add })
        )
      ),
      session.live.length ? list : h('span.hint', {
        text: 'Spontane Hilfen erscheinen sofort am Beamer und pausieren die Automatik. '
          + 'Sie verschwinden mit dem Ende der Stunde – außer du speicherst sie.'
      })
    );
  }

  function appearanceCard(session) {
    var scaleValue = h('span.chip', { text: Math.round(session.scale * 100) + ' %' });
    return h('div.ctrl-card', {},
      h('h3', {}, 'Darstellung am Beamer'),
      h('div.stack.stack--tight', {},
        h('div.row', {},
          h('span.label', { text: 'Schrift' }),
          h('button.btn.btn--sm.btn--icon', {
            type: 'button', text: '−', 'aria-label': 'Schrift kleiner',
            onclick: function () { BAO.session.setScale(session.scale - 0.1); BAO.app.scheduleRender(); }
          }),
          scaleValue,
          h('button.btn.btn--sm.btn--icon', {
            type: 'button', text: '+', 'aria-label': 'Schrift größer',
            onclick: function () { BAO.session.setScale(session.scale + 0.1); BAO.app.scheduleRender(); }
          }),
          h('span.hint', { text: 'Größere Schrift verteilt die Inhalte auf mehr Seiten.' })
        ),
        h('div.row', {},
          h('span.label', { text: 'Hintergrund' }),
          h('button.btn.btn--sm', {
            type: 'button', text: 'hell', 'aria-pressed': session.theme === 'light' ? 'true' : 'false',
            onclick: function () { BAO.session.setTheme('light'); BAO.app.scheduleRender(); }
          }),
          h('button.btn.btn--sm', {
            type: 'button', text: 'dunkel', 'aria-pressed': session.theme === 'dark' ? 'true' : 'false',
            onclick: function () { BAO.session.setTheme('dark'); BAO.app.scheduleRender(); }
          })
        ),
        h('div.toggle-row', {},
          h('input', {
            type: 'checkbox', id: 'stage_progress',
            checked: BAO.store.getState().settings.showProgressOnStage !== false ? true : null,
            onchange: function (event) {
              var value = event.target.checked;
              BAO.store.commit('Fortschritt am Beamer', function (draft) {
                draft.settings.showProgressOnStage = value;
              }, { undoable: false });
              BAO.session.renderAll({ reason: 'render', relayout: false });
            }
          }),
          h('label', { for: 'stage_progress', text: 'Fortschritt dezent am Beamer zeigen' })
        ),
        h('div.row', {},
          h('span.label', { text: 'Höchstens' }),
          h('input', {
            type: 'number', min: '3', max: '24', step: '1',
            value: String(BAO.store.getState().settings.maxItemsPerSlide),
            style: { width: '80px' }, 'aria-label': 'Einträge je Seite',
            onchange: function (event) {
              var value = util.clamp(parseInt(event.target.value, 10) || 12, 3, 24);
              BAO.store.commit('Einträge je Seite', function (draft) {
                draft.settings.maxItemsPerSlide = value;
              }, { undoable: false });
              BAO.session.rebuild({ reason: 'rebuild' });
            }
          }),
          h('span.hint', { text: 'Einträge je Seite' })
        )
      )
    );
  }

  /* --- Ansicht ------------------------------------------------------------------ */

  function render(host, context) {
    bindKeys();
    isRendering = true;
    refs = {};

    var state = context.state;
    var ctx = context.ctx;
    var app = context.app;
    var session = BAO.session.getState();
    var view = h('div.view');

    var banks = ctx.group ? select.banksOfGroup(state, ctx.group.id) : [];
    var bank = session.bankId ? select.bank(state, session.bankId) : null;

    if (!session.active) {
      view.appendChild(h('div.view__head', {},
        h('div.view__title', {}, h('h1', { text: 'Projektion' }),
          h('span.sub', { text: 'Wortbank auswählen und am Beamer einblenden' }))
      ));
      if (!banks.length) {
        view.appendChild(ui.emptyState({
          title: 'Noch keine Wortbank vorhanden',
          text: 'Stelle zuerst eine Wortbank zusammen – oder blende spontan eine Live-Hilfe ein.',
          actionLabel: 'Wortbank anlegen', onAction: function () { app.go('wortbanken'); },
          secondaryLabel: 'Live-Hilfe starten', onSecondary: function () { app.openLiveHelp(); }
        }));
      } else {
        var tiles = h('div.tiles');
        banks.forEach(function (item) {
          tiles.appendChild(h('button.tile', {
            type: 'button', onclick: function () { app.projectBank(item.id); }
          },
            h('div.tile__title', { text: item.title }),
            h('div.tile__meta', { text: item.scene + ' · ' + select.bankItemCount(item) + ' Einträge' }),
            h('div.tile__foot', {}, h('span.chip', { text: 'Stufe ' + item.defaultLevel }))
          ));
        });
        view.appendChild(tiles);
      }
      host.appendChild(view);
      isRendering = false;
      return;
    }

    /* --- Kopfzeile ---------------------------------------------------------- */
    var windowOpen = BAO.output.isWindowOpen();
    view.appendChild(h('div.view__head', {},
      h('div.view__title', {},
        h('h1', { text: bank ? bank.title : 'Live-Hilfe' }),
        h('span.sub', {
          text: [ctx.subject && ctx.subject.name, ctx.group && ctx.group.name, bank && bank.scene]
            .filter(Boolean).join(' · ')
        })
      ),
      h('div.spacer'),
      h('div.view__actions', {},
        banks.length > 1 ? ui.selectField({
          value: session.bankId, ariaLabel: 'Wortbank wechseln',
          options: [{ value: '', label: 'nur Live-Hilfe' }].concat(banks.map(function (b) {
            return { value: b.id, label: b.title };
          })),
          onChange: function (value) { BAO.session.start(value, { keepLive: true }); }
        }) : null,
        h('button.btn', {
          type: 'button',
          'aria-pressed': windowOpen ? 'true' : 'false',
          title: 'Eigenes Beamerfenster öffnen oder schließen (Strg + B)',
          onclick: function () {
            if (BAO.output.isWindowOpen()) {
              BAO.output.closeWindow();
            } else {
              var result = BAO.output.openWindow();
              if (!result.ok) {
                BAO.toast.error('Das Beamerfenster wurde blockiert. Bitte Pop-ups erlauben – ersatzweise startet der Vollbildmodus.');
                BAO.output.openOverlay();
              } else {
                BAO.toast.ok('Beamerfenster geöffnet: auf den zweiten Bildschirm ziehen, dort F für Vollbild.');
              }
            }
            BAO.session.renderAll({ reason: 'window-opened' });
          }
        }, ui.icon('beamer', 16), windowOpen ? 'Beamerfenster schließen' : 'Beamerfenster'),
        h('button.btn', {
          type: 'button',
          title: 'Vollbild auf diesem Bildschirm (Rückfallebene ohne zweites Fenster)',
          onclick: function () {
            if (BAO.output.isOverlayOpen()) BAO.output.closeOverlay();
            else BAO.output.openOverlay();
            BAO.session.renderAll({ reason: 'overlay-opened' });
          }
        }, ui.icon('focus', 16), BAO.output.isOverlayOpen() ? 'Vollbild beenden' : 'Vollbild'),
        h('button.btn.btn--ghost', {
          type: 'button', text: 'Beenden',
          onclick: function () {
            BAO.session.stop();
            BAO.output.closeOverlay();
            app.scheduleRender();
          }
        })
      )
    ));

    if (!windowOpen && !BAO.output.isOverlayOpen()) {
      view.appendChild(h('div.note', {
        text: 'Noch keine Ausgabefläche geöffnet. „Beamerfenster“ öffnet ein eigenes Fenster für den zweiten '
          + 'Bildschirm; „Vollbild“ blendet die Projektion auf diesem Bildschirm ein.'
      }));
    }

    /* --- Vorschau und Steuerung ---------------------------------------------- */
    var frame = h('div.stage-frame', { dataset: { mirrored: windowOpen ? 'true' : 'false' } });

    var playButton = h('button.btn.btn--icon', {
      type: 'button', 'aria-pressed': session.auto.playing ? 'true' : 'false',
      onclick: function () {
        if (!BAO.session.toggleAuto() && !BAO.session.getState().auto.playing) {
          BAO.toast.show(session.copyMode
            ? 'Im Abschreibmodus bleibt die Seite bewusst stehen.'
            : 'Letzte Seite erreicht – zum Fortsetzen zurückblättern.', { timeout: 3200 });
        }
      }
    }, session.auto.playing ? '❚❚' : '▶');
    refs.playButton = playButton;

    var position = h('strong');
    refs.position = position;
    var sectionInfo = h('span.hint');
    refs.sectionInfo = sectionInfo;

    var preview = h('div.stage-preview', {},
      frame,
      h('div.stage-preview__bar', {},
        h('div.transport', {},
          h('button.btn.btn--icon', {
            type: 'button', title: 'Erste Seite', 'aria-label': 'Erste Seite',
            onclick: function () { BAO.session.goTo(0); }
          }, '⏮'),
          h('button.btn.btn--icon', {
            type: 'button', title: 'Zurück (Pfeil links)', 'aria-label': 'Vorherige Seite',
            onclick: function () { BAO.session.prev(); }
          }, '◀'),
          playButton,
          h('button.btn.btn--icon', {
            type: 'button', title: 'Weiter (Pfeil rechts)', 'aria-label': 'Nächste Seite',
            onclick: function () { BAO.session.next(false); }
          }, '▶'),
          h('button.btn.btn--icon', {
            type: 'button', title: 'Letzte Seite', 'aria-label': 'Letzte Seite',
            onclick: function () { BAO.session.goTo(BAO.session.totalSlides() - 1); }
          }, '⏭')
        ),
        h('div', { style: { display: 'flex', 'flex-direction': 'column' } }, position, sectionInfo),
        h('span.spacer'),
        h('button.btn.btn--sm', {
          type: 'button', 'aria-pressed': session.copyMode ? 'true' : 'false',
          title: 'Abschreibmodus: Seite bleibt stehen, Automatik bleibt aus (Taste C)',
          text: 'Abschreiben',
          onclick: function () { BAO.session.toggleCopyMode(); BAO.app.scheduleRender(); }
        }),
        h('button.btn.btn--sm', {
          type: 'button', 'aria-pressed': session.blank ? 'true' : 'false',
          title: 'Bildschirm leeren (Taste B)',
          text: session.blank ? 'Bildschirm zeigen' : 'Bildschirm leeren',
          onclick: function () { BAO.session.toggleBlank(); BAO.app.scheduleRender(); }
        })
      )
    );

    var panel = h('div.ctrl-panel', {},
      levelCard(session),
      sectionCard(session, app),
      autoCard(session),
      liveCard(session, ctx, bank),
      appearanceCard(session),
      h('div.ctrl-card', {},
        h('h3', {}, 'Tastenkürzel'),
        h('div.kv', {},
          h('dt', { text: '← →' }), h('dd', { text: 'blättern' }),
          h('dt', { text: 'Leertaste' }), h('dd', { text: 'Automatik an/aus' }),
          h('dt', { text: '1 2 3' }), h('dd', { text: 'Unterstützungsstufe' }),
          h('dt', { text: 'B' }), h('dd', { text: 'Bildschirm leeren' }),
          h('dt', { text: 'C' }), h('dd', { text: 'Abschreibmodus' }),
          h('dt', { text: 'F' }), h('dd', { text: 'Vollbild' }),
          h('dt', { text: '+ −' }), h('dd', { text: 'Schriftgröße' })
        )
      )
    );

    view.appendChild(h('div.present', {}, preview, panel));
    host.appendChild(view);

    // Vorschau anhängen und alle Flächen zeichnen, sobald das Layout steht.
    var slidesBefore = BAO.session.getDeck() ? BAO.session.getDeck().slides.length : 0;
    BAO.output.attachPreview(frame);
    window.requestAnimationFrame(function () {
      BAO.session.renderAll({ reason: 'render' });
      var deck = BAO.session.getDeck();
      if (deck && deck.slides.length !== slidesBefore) {
        // Die Messung auf der echten Fläche hat die Seitenzahl verändert –
        // die Abschnittsübersicht muss den gleichen Stand zeigen.
        app.scheduleRender();
        return;
      }
      syncControls();
    });

    isRendering = false;
  }

  BAO.views = BAO.views || {};
  BAO.views.present = { render: render };
})(window.BAO = window.BAO || {});
