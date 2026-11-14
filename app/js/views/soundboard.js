/* ==========================================================================
   Ansicht „Soundboard“
   Die Schaltzentrale für alles, was aus dem Teacher Soundboard stammt:

     Klänge             acht Münzen spielen Klänge und kurze Videos
     Unterrichtsleiste  welche Bausteine die Leinwand zeigt – und ihr Stand:
                        Sozialform, Material, Timer
     Phasen-Presets     eine Unterrichtsphase auf einen Klick
     Symbole            Sozialformen und Materialien verwalten

   Die Leiste auf der Leinwand kommt ohne Schrift aus. Hier stehen die Namen
   dabei – diese Ansicht sieht nur die Lehrkraft.

   Wie jede Ansicht baut sie sich nach einer Änderung am Bestand neu auf. Was
   sich im Augenblick ändert (Timer, Auswahl, laufender Klang), tauscht sie
   selbst aus, ohne alles neu zu zeichnen.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;
  var h = util.h;
  var ui = BAO.ui;
  var schema = BAO.schema;
  var select = BAO.select;
  var model = BAO.classroomModel;
  var icons = BAO.classroomIcons;
  var classroom = BAO.classroom;
  var sounds = BAO.sounds;
  var panel = BAO.classroomPanel;

  var active = null;                 // was die gerade gezeichnete Ansicht zum Aufräumen braucht
  var local = { minutes: null };     // Eingaben, die einen Neuaufbau überstehen
  var muted = 0;
  var keysBound = false;

  /**
   * Stellt etwas um, das die Bedienelemente schon zeigen (Schalter, Regler).
   * Die Ansicht muss sich dafür nicht neu aufbauen – der Fokus bliebe sonst
   * nicht auf dem Schalter stehen.
   */
  function quietly(work) {
    muted += 1;
    try { return work(); } finally { muted -= 1; }
  }

  /** Meldet einen abgelehnten Dateiwunsch in Worten. true = hat geklappt. */
  function report(result) {
    if (!result) return false;
    if (!result.ok) {
      if (result.message) BAO.toast.error(result.message);
      return false;
    }
    if (result.info && !result.info.stored && BAO.media.isPersistent()) {
      BAO.toast.error('Der Browser hat keinen Platz mehr: „' + result.info.name
        + '“ bleibt nur bis zum Schließen dieses Fensters erhalten.');
    }
    return true;
  }

  function isImageFile(file) {
    return /^image\//.test(file.type || '') || /\.(png|jpe?g|svg|webp|gif)$/i.test(file.name || '');
  }

  function carriesFiles(event) {
    var types = event.dataTransfer && event.dataTransfer.types;
    return !!types && Array.prototype.indexOf.call(types, 'Files') >= 0;
  }

  /** Symbol einer Sozialform oder eines Materials – nur zum Ansehen. */
  function symbolFace(item, className) {
    var node = h('span.cr-tile' + (className ? '.' + className : ''), { title: item.name || null, 'aria-hidden': 'true' });
    node.style.setProperty('--tile', icons.tileColor(item.icon));
    if (item.imageId && BAO.media.has(item.imageId)) {
      var image = h('img.cr-tile__image', { alt: '', draggable: 'false' });
      image.src = BAO.media.url(item.imageId);
      node.appendChild(image);
    } else {
      node.appendChild(icons.glyph(document, item.icon));
    }
    return node;
  }

  /** „Tablet/Computer“ darf am Schrägstrich umbrechen statt mitten im Wort. */
  function breakable(name) {
    return String(name || '').replace(/\//g, '/\u200b');
  }

  /** Kopf einer Karte: Titel, darunter eine Zeile Erklärung, rechts Knöpfe. */
  function cardHead(title, sub) {
    var head = h('div.card__head', {},
      h('div.sb-card__title', {}, h('h2', { text: title }), sub ? h('span.sb-card__sub', { text: sub }) : null));
    for (var i = 2; i < arguments.length; i++) util.append(head, arguments[i]);
    return head;
  }

  function iconButton(name, title, onClick, extra) {
    return h('button.btn.btn--sm.btn--icon', Object.assign({
      type: 'button', title: title, 'aria-label': title, onclick: onClick
    }, extra || {}), ui.icon(name, 15));
  }

  /* --- Klänge: die Münzen ------------------------------------------------------- */

  function takeMedia(index, file) {
    return classroom.assignMedia(index, file).then(function (result) {
      if (!report(result)) return;
      BAO.toast.undoable('Münze ' + (index + 1) + ' spielt jetzt „' + result.info.name + '“'
        + (result.kind === 'video' ? ' – als Video über der Leinwand.' : '.'));
    });
  }

  function takeImage(index, file) {
    return classroom.assignImage(index, file).then(function (result) {
      if (report(result)) BAO.toast.undoable('Münze ' + (index + 1) + ' trägt jetzt ein eigenes Bild.');
    });
  }

  function chooseMedia(index) {
    return util.pickFile(sounds.MEDIA_ACCEPT).then(function (file) { if (file) return takeMedia(index, file); });
  }

  function chooseImage(index) {
    return util.pickFile(sounds.IMAGE_ACCEPT).then(function (file) { if (file) return takeImage(index, file); });
  }

  /** Spielt oder stoppt eine Münze; ohne Klang erklärt eine Meldung den Weg. */
  function play(index, fromKeyboard) {
    var result = sounds.trigger(index);
    var button = classroom.button(index) || {};
    if (result === 'empty') {
      if (fromKeyboard) {
        BAO.toast.show('Münze ' + (index + 1) + ' hat noch keinen Klang. Ein Klick auf die Münze weist einen zu.', { timeout: 3200 });
      } else {
        chooseMedia(index);
      }
    } else if (result === 'missing') {
      BAO.toast.error('Die Datei „' + (button.name || 'ohne Namen') + '“ liegt in diesem Browser nicht mehr vor. '
        + 'Bitte neu zuweisen oder die Sicherungsdatei wiederherstellen.');
    }
    return result;
  }

  function coinCard(index, settings) {
    var button = settings.sounds.buttons[index];
    var number = index + 1;
    var hasMedia = !!button.mediaId;
    var missing = hasMedia && BAO.media.isReady() && !BAO.media.has(button.mediaId);
    var info = hasMedia ? BAO.media.info(button.mediaId) : null;

    var coin = panel.coinNode(document, index, button, {
      title: hasMedia ? 'Münze ' + number + ' spielen oder stoppen (Taste ' + number + ')'
        : 'Münze ' + number + ': Klang- oder Videodatei zuweisen'
    });
    coin.dataset.key = 'coin:' + index;
    coin.addEventListener('click', function () { play(index, false); });

    var chips = h('div.sb-coin__chips', {},
      hasMedia ? h('span.chip', { text: button.kind === 'video' ? 'Video' : 'Klang' }) : null,
      info ? h('span.chip.chip--outline', { text: BAO.media.formatBytes(info.size) }) : null,
      missing ? h('span.chip.chip--warn', { title: 'Die Datei liegt in diesem Browser nicht mehr vor.', text: 'Datei fehlt' }) : null,
      h('span.chip.chip--outline.sb-coin__off', {
        title: 'Die Leiste zeigt nur die ersten Münzen – die Anzahl steht unter den Münzen.', text: 'nicht in der Leiste'
      })
    );

    var card = h('div.sb-coin', {
      dataset: { index: String(index), inBar: index < settings.sounds.visible ? 'true' : 'false' }
    },
      coin,
      h('div.sb-coin__name', {
        title: hasMedia ? button.name : null,
        text: hasMedia ? (button.name || 'Klang ohne Namen') : 'noch kein Klang'
      }),
      chips,
      h('div.sb-coin__actions', {},
        h('button.btn.btn--sm', {
          type: 'button', text: hasMedia ? 'Datei …' : 'Datei wählen …',
          title: 'Klang- oder Videodatei zuweisen', dataset: { key: 'coin-file:' + index },
          onclick: function () { chooseMedia(index); }
        }),
        iconButton('image', 'Münzbild zuweisen', function () { chooseImage(index); }, { dataset: { key: 'coin-image:' + index } }),
        button.imageId ? iconButton('undo', 'Münzbild zurücksetzen', function () {
          if (classroom.resetImage(index) !== false) BAO.toast.undoable('Münze ' + number + ' zeigt wieder ihre Zahl.');
        }) : null,
        (hasMedia || button.imageId) ? iconButton('trash', 'Zuweisungen löschen', function () {
          if (classroom.clearButton(index) !== false) BAO.toast.undoable('Münze ' + number + ' ist wieder leer.');
        }) : null
      )
    );

    // Eine Datei lässt sich auch einfach auf die Münze ziehen.
    card.addEventListener('dragover', function (event) {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      card.dataset.over = 'true';
    });
    card.addEventListener('dragleave', function () { delete card.dataset.over; });
    card.addEventListener('drop', function (event) {
      delete card.dataset.over;
      var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (!file) return;
      event.preventDefault();
      if (isImageFile(file)) takeImage(index, file); else takeMedia(index, file);
    });
    return card;
  }

  function soundOptions(settings, coins) {
    var options = settings.sounds;
    var percent = Math.round(options.volume * 100);

    var volumeValue = h('span.sb-range__value', { text: percent + ' %' });
    var volume = h('input', {
      type: 'range', min: '0', max: '100', step: '1', value: String(percent),
      'aria-label': 'Lautstärke', dataset: { key: 'volume' }
    });
    volume.addEventListener('input', function () {
      sounds.applyVolume(volume.value / 100);          // sofort hörbar, noch während des Ziehens
      volumeValue.textContent = volume.value + ' %';
    });
    volume.addEventListener('change', function () {
      quietly(function () { classroom.setSoundOption('volume', volume.value / 100); });
    });

    var visible = ui.selectField({
      label: 'Münzen in der Leiste', value: options.visible,
      options: Array.apply(null, { length: model.MAX_BUTTONS }).map(function (unused, i) {
        return { value: i + 1, label: String(i + 1) };
      }),
      onChange: function (value) {
        var count = parseInt(value, 10);
        quietly(function () { classroom.setSoundOption('visible', count); });
        util.$$('.sb-coin', coins).forEach(function (card) {
          card.dataset.inBar = Number(card.dataset.index) < count ? 'true' : 'false';
        });
      }
    });

    var burst = h('input', {
      type: 'number', min: '0.2', max: '10', step: '0.1', value: String(options.burstSeconds),
      'aria-label': 'Sekunden bildfüllend', disabled: options.videoMode !== 'burst', dataset: { key: 'burst' }
    });
    burst.addEventListener('change', function () {
      var seconds = parseFloat(String(burst.value).replace(',', '.'));
      if (isFinite(seconds)) quietly(function () { classroom.setSoundOption('burstSeconds', seconds); });
      burst.value = String(classroom.settings().sounds.burstSeconds);
    });

    var mode = ui.selectField({
      label: 'Ein Video erscheint', value: options.videoMode,
      options: model.VIDEO_MODES.map(function (entry) { return { value: entry.id, label: entry.label }; }),
      onChange: function (value) {
        quietly(function () { classroom.setSoundOption('videoMode', value); });
        burst.disabled = value !== 'burst';
      }
    });

    return h('div.sb-options', {},
      h('div.field', {}, h('label', { text: 'Lautstärke' }), h('div.sb-range', {}, volume, volumeValue)),
      visible,
      mode,
      h('div.field', {}, h('label', { text: 'Sekunden bildfüllend' }), burst)
    );
  }

  function soundsCard(settings) {
    var coins = h('div.sb-coins');
    for (var i = 0; i < model.MAX_BUTTONS; i++) coins.appendChild(coinCard(i, settings));

    return h('section.card.sb-card', { dataset: { card: 'sounds' } },
      cardHead('Klänge', 'Münzen für Signale, Jingles und kurze Clips'),
      h('div.card__body.stack', {},
        coins,
        soundOptions(settings, coins),
        h('p.sb-hint', {
          text: 'Ein Klick spielt, ein zweiter stoppt; eine andere Münze löst die laufende ab. Dateien lassen sich '
            + 'auch auf eine Münze ziehen. ' + sounds.FORMAT_TIP + ' Je Datei höchstens '
            + BAO.media.formatBytes(BAO.media.MAX_FILE_BYTES) + '.'
        })
      )
    );
  }

  /* --- Unterrichtsleiste: Bausteine --------------------------------------------- */

  function moduleSwitches(settings) {
    var row = h('div.sb-modules');
    model.MODULES.forEach(function (module) {
      var box = h('input', {
        type: 'checkbox', checked: settings.show[module.id], dataset: { module: module.id, key: 'module:' + module.id }
      });
      box.addEventListener('change', function () {
        quietly(function () { classroom.setShow(module.id, box.checked); });
      });
      row.appendChild(h('label.switch.sb-module', { title: module.hint }, box,
        h('span', {}, h('strong', { text: module.label }), h('small', { text: module.hint }))));
    });
    return row;
  }

  /* --- Unterrichtsleiste: der Stand des Augenblicks ------------------------------- */

  function pickItem(item, selected, key, onClick) {
    var tile = panel.tileNode(document, item, { selected: selected });
    tile.dataset.key = key;
    tile.setAttribute('aria-pressed', selected ? 'true' : 'false');
    tile.addEventListener('click', onClick);
    return h('div.sb-pick__item', { dataset: { selected: selected ? 'true' : 'false' } },
      tile, h('span.sb-pick__name', { text: breakable(item.name) }));
  }

  function phasePicker() {
    var chosen = classroom.live().phaseId;
    var list = h('div.sb-pick', { dataset: { pick: 'phase' } });
    classroom.catalog('phases').forEach(function (item) {
      list.appendChild(pickItem(item, item.id === chosen, 'phase:' + item.id, function () { classroom.togglePhase(item.id); }));
    });
    if (!list.firstChild) list.appendChild(h('span.sb-hint', { text: 'Keine Sozialform angelegt – siehe „Symbole“.' }));
    return list;
  }

  function materialPicker() {
    var chosen = classroom.live().materialIds;
    var list = h('div.sb-pick', { dataset: { pick: 'materials' } });
    classroom.catalog('materials').forEach(function (item) {
      list.appendChild(pickItem(item, chosen.indexOf(item.id) >= 0, 'material:' + item.id, function () { classroom.toggleMaterial(item.id); }));
    });
    if (!list.firstChild) list.appendChild(h('span.sb-hint', { text: 'Kein Material angelegt – siehe „Symbole“.' }));
    return list;
  }

  var PHASE_LABELS = { idle: 'nicht gestellt', running: 'läuft', paused: 'angehalten', done: 'abgelaufen' };

  function minutesValue() {
    return local.minutes || classroom.settings().timerMinutes;
  }

  function timerBlock() {
    var settings = classroom.settings();
    var view = classroom.timerView();
    var dial = icons.dial(document);
    var clock = h('strong.sb-timer__clock', { dataset: { bind: 'timer-clock' } });
    var stateLabel = h('span.sb-timer__state', { dataset: { bind: 'timer-state' } });

    function update() {
      var now = classroom.timerView();
      dial.set(now.progress, now.phase);
      clock.textContent = now.hasValue ? now.clock : '–';
      stateLabel.textContent = PHASE_LABELS[now.phase] || '';
      block.dataset.timer = now.phase;
    }

    var quick = h('div.row.sb-timer__quick', {}, h('span.label', { text: 'Schnellwahl' }));
    settings.timerPresets.forEach(function (minutes) {
      quick.appendChild(h('button.btn.btn--sm', {
        type: 'button', text: minutes + ' min', title: minutes + ' Minuten starten',
        dataset: { key: 'quick:' + minutes, minutes: String(minutes) },
        onclick: function () {
          local.minutes = null;
          quietly(function () { classroom.startTimer(minutes); });
        }
      }));
    });

    var minutes = h('input', {
      type: 'number', min: '1', max: '999', step: '1', value: String(minutesValue()),
      'aria-label': 'Dauer in Minuten', dataset: { key: 'minutes' }
    });
    function start() {
      var wanted = BAO.classroomTimer.clampMinutes(minutes.value, settings.timerMinutes);
      local.minutes = null;
      quietly(function () { classroom.startTimer(wanted); });
    }
    minutes.addEventListener('input', function () {
      var typed = parseInt(minutes.value, 10);
      local.minutes = isFinite(typed) && typed > 0 ? typed : null;
    });
    minutes.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') { event.preventDefault(); start(); }
    });

    var running = view.phase === 'running';
    var toggleLabel = running ? 'Anhalten' : view.phase === 'paused' ? 'Weiter' : 'Von vorn';
    var block = h('div.sb-timer', { dataset: { timer: view.phase } },
      h('div.sb-timer__face', {},
        h('div.cr-dial.sb-dial', { title: 'So sieht die Klasse den Timer: eine Scheibe ohne Ziffern.' }, dial.node),
        h('div.sb-timer__read', {}, clock, stateLabel)
      ),
      h('div.sb-timer__controls', {},
        quick,
        h('div.row', {},
          h('label.label', { text: 'Minuten' }), minutes,
          h('button.btn.btn--primary.btn--sm', {
            type: 'button', title: 'Timer mit dieser Dauer starten', dataset: { key: 'timer-start' }, onclick: start
          }, ui.icon('play', 15), 'Starten')
        ),
        h('div.row', {},
          h('button.btn.btn--sm', {
            type: 'button', disabled: !view.hasValue, dataset: { key: 'timer-toggle' },
            title: running ? 'Timer anhalten' : view.phase === 'paused' ? 'Timer fortsetzen' : 'Timer von vorn beginnen',
            onclick: function () { classroom.toggleTimer(); }
          }, ui.icon(running ? 'pause' : 'play', 15), toggleLabel),
          h('button.btn.btn--sm', {
            type: 'button', text: '− 1 min', title: 'Eine Minute weniger', disabled: !view.hasValue,
            dataset: { key: 'timer-minus' }, onclick: function () { classroom.adjustTimer(-1); }
          }),
          h('button.btn.btn--sm', {
            type: 'button', text: '+ 1 min', title: 'Eine Minute mehr', disabled: !view.hasValue,
            dataset: { key: 'timer-plus' }, onclick: function () { classroom.adjustTimer(1); }
          }),
          h('button.btn.btn--sm.btn--ghost', {
            type: 'button', text: 'Timer löschen', disabled: !view.hasValue,
            dataset: { key: 'timer-clear' }, onclick: function () { classroom.clearTimer(); }
          })
        )
      )
    );
    block.update = update;
    update();
    return block;
  }

  /** Sozialform, Material und Timer – wird nach jeder Änderung des Augenblicks ersetzt. */
  function liveBlock() {
    var materialCount = classroom.live().materialIds.length;
    var timer = timerBlock();
    var block = h('div.sb-live', {},
      h('div.sb-live__part', {},
        h('div.sb-live__head', {}, h('h3', { text: 'Sozialform oder Methode' }),
          h('span.sb-hint', { text: 'eine – ein zweiter Klick nimmt sie zurück' })),
        phasePicker()
      ),
      h('div.sb-live__part', {},
        h('div.sb-live__head', {}, h('h3', { text: 'Material' }),
          h('span.sb-hint', { text: 'beliebig viele' }),
          h('span.spacer'),
          materialCount ? h('button.btn.btn--sm.btn--ghost', {
            type: 'button', text: 'Auswahl löschen', dataset: { key: 'materials-clear' },
            onclick: function () { classroom.clearMaterials(); }
          }) : null),
        materialPicker()
      ),
      h('div.sb-live__part', {},
        h('div.sb-live__head', {}, h('h3', { text: 'Timer' })),
        timer
      )
    );
    block.updateTimer = timer.update;
    return block;
  }

  /* --- Unterrichtsleiste: Timer einrichten ------------------------------------------ */

  function editTimerPresets() {
    var current = classroom.settings().timerPresets;
    return BAO.modal.prompt({
      title: 'Schnellwahl des Timers',
      subtitle: 'Diese Dauern stehen in der Leiste und hier als Knöpfe bereit.',
      label: 'Minuten, durch Komma getrennt (höchstens ' + model.MAX_TIMER_PRESETS + ')',
      value: current.join(', '), placeholder: '5, 8, 10'
    }).then(function (value) {
      if (value === null || value === undefined) return;
      var list = String(value).split(/[^0-9]+/).filter(Boolean).map(function (part) { return parseInt(part, 10); });
      if (!list.length) { BAO.toast.error('Bitte mindestens eine Dauer in Minuten angeben, zum Beispiel 5, 8, 10.'); return; }
      var next = classroom.setTimerPresets(list);
      BAO.toast.undoable('Schnellwahl: ' + next.join(', ') + ' Minuten.');
    });
  }

  function timerSetup(settings) {
    var sound = settings.timerSound;
    var hasSound = !!sound.mediaId;
    var missing = hasSound && BAO.media.isReady() && !BAO.media.has(sound.mediaId);
    var listen = h('button.btn.btn--sm', {
      type: 'button', disabled: !hasSound || missing, dataset: { bind: 'timer-sound-listen', key: 'timer-sound-listen' },
      onclick: function () {
        if (sounds.isTimerSoundPlaying()) sounds.stopTimerSound(); else sounds.playTimerSound();
      }
    });

    return h('div.sb-setup', {},
      h('div.sb-setup__row', {},
        h('span.label', { text: 'Schnellwahl' }),
        h('span', { dataset: { bind: 'timer-presets' }, text: settings.timerPresets.join(', ') + ' Minuten' }),
        h('span.spacer'),
        h('button.btn.btn--sm', { type: 'button', text: 'Ändern …', dataset: { key: 'timer-presets-edit' }, onclick: editTimerPresets })
      ),
      h('div.sb-setup__row', {},
        h('span.label', { text: 'Klang am Ende' }),
        h('span.sb-setup__value', {
          dataset: { bind: 'timer-sound' }, title: hasSound ? sound.name : null,
          text: hasSound ? (sound.name || 'Klang ohne Namen') : 'kein Klang – die Scheibe wird nur rot'
        }),
        missing ? h('span.chip.chip--warn', { text: 'Datei fehlt' }) : null,
        h('span.spacer'),
        listen,
        h('button.btn.btn--sm', {
          type: 'button', text: hasSound ? 'Anderer Klang …' : 'Klang wählen …', dataset: { key: 'timer-sound-choose' },
          onclick: function () {
            util.pickFile(sounds.AUDIO_ACCEPT).then(function (file) {
              if (!file) return;
              classroom.assignTimerSound(file).then(function (result) {
                if (report(result)) BAO.toast.undoable('Am Ende des Timers erklingt „' + result.info.name + '“.');
              });
            });
          }
        }),
        hasSound ? iconButton('trash', 'Klang am Ende entfernen', function () {
          if (classroom.removeTimerSound() !== false) BAO.toast.undoable('Der Timer endet wieder ohne Klang.');
        }) : null
      )
    );
  }

  /* Ohne Wortbank oder Tafel zeigt das Beamerfenster die Leiste allein – etwa
     nur Timer und Sozialform. Dafür braucht es hier einen Knopf. */
  function windowLabel(button) {
    var open = BAO.output.isWindowOpen();
    util.clear(button);
    button.appendChild(ui.icon('beamer', 15));
    button.appendChild(document.createTextNode(open ? 'Beamerfenster schließen' : 'Beamerfenster öffnen'));
    button.setAttribute('aria-pressed', open ? 'true' : 'false');
    button.title = (open ? 'Das Beamerfenster schließen' : 'Ein eigenes Fenster für Beamer oder Tafel öffnen')
      + ' (Strg + B)';
  }

  function windowButton() {
    var button = h('button.btn.btn--sm', {
      type: 'button', dataset: { action: 'toggle-window', key: 'toggle-window' },
      onclick: function () {
        if (BAO.output.isWindowOpen()) { BAO.output.closeWindow(); return; }
        var result = BAO.output.openWindow();
        if (!result.ok) {
          BAO.toast.error('Der Browser hat das Beamerfenster blockiert. Bitte Pop-ups für diese Seite erlauben.');
        }
      }
    });
    windowLabel(button);
    return button;
  }

  function barCard(settings) {
    var live = liveBlock();
    var card = h('section.card.sb-card', { dataset: { card: 'bar' } },
      cardHead('Unterrichtsleiste', 'ohne Schrift, am rechten Rand der Leinwand', h('span.spacer'), windowButton()),
      h('div.card__body.stack', {},
        h('div.stack.stack--tight', {},
          h('h3', { text: 'Auf der Leinwand zeigen' }),
          moduleSwitches(settings),
          h('p.sb-hint', {
            text: 'Die Leiste erscheint auf Projektion, Tafel und Whiteboard – auch im Beamerfenster – und lässt sich '
              + 'dort direkt bedienen. Am Griff über den Symbolen verschiebt man sie nach oben oder unten. Läuft '
              + 'gerade keine Wortbank oder Tafel, zeigt das Beamerfenster die Leiste allein.'
          })
        ),
        live,
        timerSetup(settings)
      )
    );
    card.live = live;
    return card;
  }

  /* --- Phasen-Presets ----------------------------------------------------------------- */

  /** Was gerade projiziert wird – als Vorschlag für ein neues Preset. */
  function runningTarget() {
    var session = BAO.session.getState();
    if (session.active && session.bankId) return 'bank:' + session.bankId;
    var board = BAO.board.isActive() ? BAO.board.getBoard() : null;
    return board ? 'board:' + board.id : '';
  }

  function editPreset(id) {
    var state = BAO.store.getState();
    var existing = id ? classroom.preset(id) : null;
    var live = classroom.live();
    var timerNow = classroom.timerView();
    var running = existing ? '' : runningTarget();
    var session = BAO.session.getState();
    var draft = existing ? util.clone(existing) : model.makePreset({
      // Vorbelegt mit dem, was gerade eingestellt ist: erst einrichten, dann festhalten.
      level: running.indexOf('bank:') === 0 ? session.level : 2,
      phaseId: live.phaseId,
      materialIds: live.materialIds.slice(),
      timerMinutes: timerNow.hasValue ? timerNow.totalMinutes : 0
    });
    var targets = classroom.presetTargets(state);
    var phases = classroom.catalog('phases');
    var materials = classroom.catalog('materials');
    // Die Szene einer Wortbank schlägt eine Sozialform vor – aber nur, solange
    // keine gewählt ist. Ein gespeichertes Preset ändert sich nicht beim Öffnen.
    var phaseTouched = !!existing || !!draft.phaseId;

    var nameField = ui.textField({
      label: 'Name', value: draft.name, placeholder: 'z. B. Partnerinterview, erste Runde',
      hint: 'Bleibt das Feld leer, heißt das Preset wie sein Ziel.'
    });

    /* Ziel: Wortbank, Tafel oder Whiteboard – nach Lerngruppen geordnet. */
    var targetSelect = h('select', { 'aria-label': 'Ziel wählen', dataset: { field: 'target' } });
    var byValue = Object.create(null);
    targetSelect.appendChild(h('option', { value: '', text: '– nichts öffnen: nur die Leiste einstellen –' }));
    var wanted = existing ? (existing.targetKind && existing.targetId ? existing.targetKind + ':' + existing.targetId : '')
      : running;
    var groupNode = null;
    var groupName = null;
    targets.forEach(function (target) {
      var value = target.kind + ':' + target.id;
      byValue[value] = target;
      if (target.group !== groupName) {
        groupName = target.group;
        groupNode = h('optgroup', { label: groupName || 'ohne Lerngruppe' });
        targetSelect.appendChild(groupNode);
      }
      groupNode.appendChild(h('option', {
        value: value, text: target.kindLabel + ': ' + (target.title || 'ohne Titel'),
        selected: value === wanted ? true : null
      }));
    });
    var lost = !!(existing && wanted && !byValue[wanted]);
    if (lost) {
      targetSelect.appendChild(h('option', {
        value: wanted, selected: true,
        text: '⚠ nicht mehr vorhanden: ' + (existing.targetTitle || 'unbekanntes Ziel')
      }));
    }
    if (!existing && wanted && !byValue[wanted]) wanted = '';
    targetSelect.value = wanted;

    var levelField = ui.selectField({
      label: 'Unterstützungsstufe der Wortbank', value: draft.level,
      options: schema.LEVELS.map(function (level) { return { value: level.id, label: level.id + ' – ' + level.name }; })
    });
    var levelSelect = util.$('select', levelField);

    var phaseSelect = h('select', { 'aria-label': 'Sozialform wählen', dataset: { field: 'phase' } });
    phaseSelect.appendChild(h('option', { value: '', text: '– keine: die Leiste bleibt, wie sie ist –' }));
    phases.forEach(function (item) {
      phaseSelect.appendChild(h('option', { value: item.id, text: item.name, selected: item.id === draft.phaseId ? true : null }));
    });
    var phaseHint = h('span.hint', { dataset: { bind: 'phase-hint' } });
    phaseSelect.addEventListener('change', function () { phaseTouched = true; phaseHint.textContent = ''; });

    var rememberBox = h('input', { type: 'checkbox', dataset: { field: 'remember' } });
    var rememberText = h('span');
    var rememberRow = h('label.switch', { hidden: true }, rememberBox, rememberText);

    var materialBoxes = [];
    var materialList = h('div.sb-checks');
    materials.forEach(function (item) {
      var box = h('input', {
        type: 'checkbox', value: item.id, checked: draft.materialIds.indexOf(item.id) >= 0, dataset: { field: 'material' }
      });
      materialBoxes.push(box);
      materialList.appendChild(h('label.switch.sb-check', {}, box, symbolFace(item, 'sb-mini'),
        h('span', { text: breakable(item.name) })));
    });
    if (!materials.length) materialList.appendChild(h('span.hint', { text: 'Kein Material angelegt.' }));

    var minutesInput = h('input', {
      type: 'number', min: '0', max: '999', step: '1', value: String(draft.timerMinutes || 0),
      'aria-label': 'Timer in Minuten', dataset: { field: 'minutes' }
    });
    var autoBox = h('input', { type: 'checkbox', checked: draft.timerAutostart, dataset: { field: 'autostart' } });

    function currentTarget() { return byValue[targetSelect.value] || null; }

    function syncTarget(changed) {
      var target = currentTarget();
      var isBank = !!target && target.kind === 'bank';
      levelSelect.disabled = !isBank;
      // Eine neu gewählte Wortbank bringt ihre übliche Stufe mit.
      if (changed && isBank) levelSelect.value = String(target.level);
      var scene = isBank ? target.scene : '';
      if (scene && !phaseTouched) {
        var suggestion = classroom.suggestPhase(scene);
        phaseSelect.value = suggestion || '';
        phaseHint.textContent = suggestion ? 'Vorschlag zur Szene „' + scene + '“ – lässt sich ändern.' : '';
      }
      rememberRow.hidden = !scene;
      if (!scene) rememberBox.checked = false;
      rememberText.textContent = scene ? 'Diese Sozialform künftig für die Szene „' + scene + '“ vorschlagen' : '';
    }
    targetSelect.addEventListener('change', function () {
      if (!phaseSelect.value) phaseTouched = false;
      syncTarget(true);
    });
    syncTarget(false);

    return BAO.modal.open({
      title: existing ? 'Phasen-Preset bearbeiten' : 'Neues Phasen-Preset',
      subtitle: existing
        ? 'Ein Klick startet alles gemeinsam: das Ziel, Sozialform, Material und Timer.'
        : 'Ein Klick startet alles gemeinsam. Vorbelegt ist, was gerade eingestellt ist.',
      width: '600px',
      initialFocus: 'input',
      body: h('div.stack.sb-ui', {},
        nameField,
        h('div.field', {}, h('label', { text: 'Öffnet' }), targetSelect,
          h('span.hint', { text: 'Eine Wortbank startet in der Projektion, eine Tafel und ein Whiteboard öffnen sich.' })),
        h('div.grid2', {},
          levelField,
          h('div.field', {}, h('label', { text: 'Sozialform oder Methode' }), phaseSelect, phaseHint)
        ),
        rememberRow,
        h('div.field', {}, h('label', { text: 'Material' }), materialList),
        h('div.grid2', {},
          h('div.field', {}, h('label', { text: 'Timer (Minuten)' }), minutesInput,
            h('span.hint', { text: '0 = kein Timer' })),
          h('div.field', {}, h('label', { text: 'Beim Start' }),
            h('label.switch', {}, autoBox, h('span', { text: 'Timer sofort starten' })),
            h('span.hint', { text: 'Sonst steht die Dauer bereit, und der Timer startet auf Knopfdruck.' }))
        )
      ),
      actions: [
        { label: 'Abbrechen', value: null, kind: 'ghost' },
        {
          label: existing ? 'Speichern' : 'Anlegen', kind: 'primary',
          onSelect: function () {
            var target = currentTarget();
            var keepLost = lost && targetSelect.value === wanted;
            var minutes = util.clamp(parseInt(minutesInput.value, 10) || 0, 0, BAO.classroomTimer.MAX_MINUTES);
            var data = {
              name: nameField.input.value.trim(),
              targetKind: target ? target.kind : (keepLost ? existing.targetKind : ''),
              targetId: target ? target.id : (keepLost ? existing.targetId : ''),
              targetTitle: target ? target.title : (keepLost ? existing.targetTitle : ''),
              targetGroup: target ? target.group : (keepLost ? existing.targetGroup : ''),
              level: parseInt(levelSelect.value, 10) || 2,
              phaseId: phaseSelect.value,
              materialIds: materialBoxes.filter(function (box) { return box.checked; }).map(function (box) { return box.value; }),
              timerMinutes: minutes,
              timerAutostart: minutes > 0 && autoBox.checked
            };
            if (existing) data.id = existing.id;
            if (!data.name && !data.targetTitle) {
              BAO.toast.error('Ein Preset ohne Ziel braucht einen Namen.');
              nameField.input.focus();
              return false;
            }
            if (!existing && classroom.presets().length >= model.MAX_PRESETS) {
              BAO.toast.error('Mehr als ' + model.MAX_PRESETS + ' Phasen-Presets sind nicht vorgesehen. Bitte zuerst eines löschen.');
              return false;
            }
            var scene = target && target.kind === 'bank' ? target.scene : '';
            var savedId = classroom.savePreset(data, { rememberScene: rememberBox.checked ? scene : '' });
            var saved = classroom.preset(savedId);
            BAO.toast.undoable('Preset „' + model.presetLabel(saved) + '“ ' + (existing ? 'gespeichert.' : 'angelegt.'));
            return savedId;
          }
        }
      ]
    });
  }

  function startPreset(item) {
    var result = panel.startPreset(item.id);
    var status = classroom.presetStatus(item);
    if (result.ok && !status.hasTarget) {
      BAO.toast.ok('„' + model.presetLabel(item) + '“ gestartet: Die Leiste ist eingestellt.', { timeout: 3200 });
    }
    return result;
  }

  function presetRow(item, index, total, state) {
    var status = classroom.presetStatus(item, state);
    var phase = item.phaseId ? classroom.catalog('phases').filter(function (entry) { return entry.id === item.phaseId; })[0] : null;
    var materials = classroom.catalog('materials').filter(function (entry) { return item.materialIds.indexOf(entry.id) >= 0; });
    var label = model.presetLabel(item);

    var meta;
    if (!status.hasTarget) {
      meta = h('span', { text: 'öffnet nichts – stellt nur die Leiste ein' });
    } else if (status.missing) {
      meta = h('span', {},
        h('span.chip.chip--warn', { text: 'Ziel fehlt' }), ' ',
        status.kindLabel + ' „' + (status.title || 'ohne Titel') + '“ gibt es nicht mehr.');
    } else {
      var group = select.group(state, status.target.groupId);
      meta = h('span', {
        text: [status.kindLabel + ' „' + (status.title || 'ohne Titel') + '“', group ? group.name : '',
          item.targetKind === 'bank' ? 'Stufe ' + item.level : ''].filter(Boolean).join(' · ')
      });
    }

    var faces = h('div.sb-preset__faces');
    if (phase) faces.appendChild(symbolFace(phase, 'sb-mini'));
    materials.forEach(function (entry) { faces.appendChild(symbolFace(entry, 'sb-mini')); });
    if (item.timerMinutes > 0) {
      faces.appendChild(h('span.chip.chip--outline', {
        title: item.timerAutostart ? 'Der Timer startet sofort.' : 'Die Dauer steht bereit; der Timer startet auf Knopfdruck.'
      }, ui.icon('clock', 13), item.timerMinutes + ' min' + (item.timerAutostart ? ', startet sofort' : '')));
    }

    return h('div.sb-preset', { dataset: { presetId: item.id, missing: status.missing ? 'true' : null } },
      h('div.sb-preset__main', {},
        h('div.sb-preset__name', { text: label }),
        h('div.sb-preset__meta', {}, meta),
        faces.firstChild ? faces : null
      ),
      h('div.sb-preset__actions', {},
        h('button.btn.btn--primary.btn--sm', {
          type: 'button', dataset: { action: 'start-preset' },
          title: status.missing ? 'Das Ziel fehlt – Sozialform, Material und Timer werden trotzdem eingestellt.'
            : 'Alles gemeinsam starten',
          onclick: function () { startPreset(item); }
        }, ui.icon('play', 15), 'Starten'),
        iconButton('edit', 'Bearbeiten', function () { editPreset(item.id); }),
        iconButton('up', 'Nach oben', function () { classroom.movePreset(item.id, -1); }, { disabled: index === 0 }),
        iconButton('down', 'Nach unten', function () { classroom.movePreset(item.id, 1); }, { disabled: index === total - 1 }),
        iconButton('trash', 'Löschen', function () {
          if (classroom.removePreset(item.id) !== false) BAO.toast.undoable('Preset „' + label + '“ gelöscht.');
        })
      )
    );
  }

  function presetsCard(state) {
    var list = classroom.presets();
    var body = h('div.card__body.stack');
    if (!list.length) {
      body.appendChild(h('p.sb-hint', {
        text: 'Ein Phasen-Preset startet eine Unterrichtsphase auf einen Klick: Es öffnet eine Wortbank, eine Tafel oder '
          + 'ein Whiteboard und stellt dazu Sozialform, Material und Timer ein. In der Leiste liegen die Presets hinter '
          + 'dem runden Knopf neben der Projektion.'
      }));
    } else {
      var rows = h('div.sb-presets');
      list.forEach(function (item, index) { rows.appendChild(presetRow(item, index, list.length, state)); });
      body.appendChild(rows);
      body.appendChild(h('p.sb-hint', {
        text: 'In der Leiste liegen die Presets hinter dem runden Knopf neben der Projektion – auch im Beamerfenster.'
      }));
    }

    return h('section.card.sb-card', { dataset: { card: 'presets' } },
      cardHead('Phasen-Presets', 'Projektion, Sozialform, Material und Timer gemeinsam starten',
        h('span.spacer'),
        h('button.btn.btn--primary.btn--sm', {
          type: 'button', dataset: { action: 'new-preset' }, onclick: function () { editPreset(''); }
        }, ui.icon('plus', 15), 'Neues Preset')
      ),
      body
    );
  }

  /* --- Symbole: Sozialformen und Materialien -------------------------------------------- */

  var CATALOGS = {
    phases: {
      title: 'Sozialformen und Methoden', one: 'Sozialform', added: 'Neue Sozialform',
      placeholder: 'z. B. Kugellager',
      defaults: 'Die Liste wird durch die sechs mitgelieferten Sozialformen ersetzt.'
    },
    materials: {
      title: 'Material', one: 'Material', added: 'Neues Material',
      placeholder: 'z. B. Wörterbuch',
      defaults: 'Die Liste wird durch die sieben mitgelieferten Materialien ersetzt.'
    }
  };

  function symbolRow(kind, item, index, total) {
    var info = CATALOGS[kind];
    return h('div.sb-symbol', { dataset: { itemId: item.id } },
      symbolFace(item, 'sb-mini'),
      h('span.sb-symbol__name', { text: item.name }),
      h('span.spacer'),
      h('div.sb-symbol__actions', {},
        iconButton('edit', 'Bezeichnung ändern', function () {
          BAO.modal.prompt({
            title: 'Bezeichnung', label: info.one, value: item.name, confirmLabel: 'Übernehmen'
          }).then(function (name) {
            if (name && classroom.renameItem(kind, item.id, name) !== false) BAO.toast.undoable('Umbenannt in „' + name + '“.');
          });
        }),
        iconButton('image', 'Bild oder Symbol austauschen', function () {
          util.pickFile(sounds.IMAGE_ACCEPT).then(function (file) {
            if (!file) return;
            classroom.setItemImage(kind, item.id, file).then(function (result) {
              if (report(result)) BAO.toast.undoable('„' + item.name + '“ zeigt jetzt das eigene Bild.');
            });
          });
        }),
        item.imageId ? iconButton('undo', 'Standardbild wiederherstellen', function () {
          if (classroom.resetItemImage(kind, item.id) !== false) BAO.toast.undoable('„' + item.name + '“ zeigt wieder das Standardbild.');
        }) : null,
        iconButton('up', 'Nach oben', function () { classroom.moveItem(kind, item.id, -1); }, { disabled: index === 0 }),
        iconButton('down', 'Nach unten', function () { classroom.moveItem(kind, item.id, 1); }, { disabled: index === total - 1 }),
        iconButton('trash', 'Entfernen', function () {
          if (classroom.removeItem(kind, item.id) !== false) BAO.toast.undoable('„' + item.name + '“ entfernt.');
        })
      )
    );
  }

  function catalogBlock(kind) {
    var info = CATALOGS[kind];
    var list = classroom.catalog(kind);
    var rows = h('div.sb-symbols', { dataset: { catalog: kind } });
    list.forEach(function (item, index) { rows.appendChild(symbolRow(kind, item, index, list.length)); });
    if (!list.length) rows.appendChild(h('span.sb-hint', { text: 'Diese Liste ist leer.' }));

    return h('div.sb-catalog', {},
      h('div.sb-live__head', {},
        h('h3', { text: info.title }),
        h('span.spacer'),
        h('button.btn.btn--sm', {
          type: 'button', dataset: { action: 'add-' + kind },
          onclick: function () {
            BAO.modal.prompt({
              title: info.added, label: 'Bezeichnung', placeholder: info.placeholder, confirmLabel: 'Hinzufügen'
            }).then(function (name) {
              if (!name) return;
              classroom.addItem(kind, name);
              BAO.toast.undoable('„' + name + '“ hinzugefügt. Über das Bildsymbol in der Zeile bekommt es ein eigenes Bild.');
            });
          }
        }, ui.icon('plus', 15), 'Hinzufügen'),
        h('button.btn.btn--sm.btn--ghost', {
          type: 'button', text: 'Standards wiederherstellen',
          onclick: function () {
            BAO.modal.confirm({
              title: 'Standards wiederherstellen?', text: info.defaults,
              detail: 'Eigene Einträge dieser Liste gehen dabei verloren. Rückgängig ist möglich.',
              confirmLabel: 'Wiederherstellen'
            }).then(function (confirmed) {
              if (!confirmed) return;
              classroom.restoreDefaults(kind);
              BAO.toast.undoable('Standards wiederhergestellt.');
            });
          }
        })
      ),
      rows
    );
  }

  function symbolsCard() {
    return h('section.card.sb-card', { dataset: { card: 'symbols' } },
      cardHead('Symbole', 'was die Leiste zur Auswahl anbietet'),
      h('div.card__body.stack', {},
        catalogBlock('phases'),
        catalogBlock('materials'),
        h('p.sb-hint', {
          text: 'Die Bezeichnungen stehen nur hier. Auf der Leinwand erscheinen allein die Symbole – lesbar bis in die '
            + 'letzte Reihe. Eigene Bilder (PNG, JPG, SVG) ersetzen ein Symbol, am besten freigestellt und weiß.'
        })
      )
    );
  }

  /* --- Gut zu wissen ----------------------------------------------------------------------- */

  function notesCard() {
    var usage = BAO.media.usage();
    var where = !BAO.media.isReady() ? 'Die Ablage für Klänge und Bilder wird geöffnet …'
      : BAO.media.isPersistent()
        ? 'Klänge und Bilder liegen im Browser dieses Rechners, nicht im Internet. Belegt: ' + usage.count + ' '
          + util.plural(usage.count, 'Datei', 'Dateien') + ', ' + BAO.media.formatBytes(usage.bytes) + '.'
        : 'Dieser Browser erlaubt hier keine dauerhafte Ablage für Dateien. Klänge und Bilder bleiben nur, bis das '
          + 'Fenster geschlossen wird – die Sicherungsdatei bringt sie zurück.';

    return h('section.card.sb-card', { dataset: { card: 'notes' } },
      cardHead('Gut zu wissen'),
      h('div.card__body.stack', {},
        h('div.note' + (BAO.media.isReady() && !BAO.media.isPersistent() ? '.note--warn' : ''), {
          dataset: { bind: 'media-note' }, text: where
        }),
        h('p.sb-hint', {
          text: 'Die Sicherungsdatei nimmt Münzen, Symbole, Presets und alle Dateien mit (zusammen bis '
            + BAO.media.formatBytes(BAO.media.MAX_BACKUP_BYTES) + '). So zieht das Soundboard auch auf einen anderen Rechner um.'
        }),
        h('dl.kv.sb-keys', {},
          h('dt', {}, h('kbd', { text: '1' }), ' … ', h('kbd', { text: '8' })),
          h('dd', { text: 'in dieser Ansicht: Münze spielen oder stoppen' }),
          h('dt', {}, h('kbd', { text: 'Esc' }), ' ', h('kbd', { text: 'Leertaste' }), ' ', h('kbd', { text: 'S' })),
          h('dd', { text: 'in dieser Ansicht: laufenden Klang stoppen' }),
          h('dt', {}, h('kbd', { text: 'Alt' }), ' + ', h('kbd', { text: 'Umschalt' }), ' + ', h('kbd', { text: '1 … 8' })),
          h('dd', { text: 'überall in der App und im Beamerfenster: Münze der Leiste spielen oder stoppen' }),
          h('dt', {}, h('kbd', { text: 'Alt' }), ' + ', h('kbd', { text: 'Umschalt' }), ' + ', h('kbd', { text: '0' })),
          h('dd', { text: 'überall: alles stoppen' }),
          h('dt', {}, h('kbd', { text: 'Alt' }), ' + ', h('kbd', { text: '0' })),
          h('dd', { text: 'diese Ansicht öffnen' })
        ),
        h('p.sb-hint', {
          text: 'Der Ton kommt aus diesem Fenster; ein Video läuft im Beamerfenster stumm mit. Die Tastenkürzel wirken, '
            + 'solange die App oder das Beamerfenster im Vordergrund ist.'
        })
      )
    );
  }

  /* --- Tastatur ------------------------------------------------------------------------------ */

  function isTyping(event) {
    var target = event.target;
    if (!target) return false;
    var tag = (target.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
  }

  function onKeyDown(event) {
    if (!active || BAO.app.currentRoute().path !== 'soundboard') return;
    if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event)) return;
    // Dialog, Schnellsuche oder Vollbild liegen darüber – dann gehören die Tasten ihnen.
    var modalRoot = document.getElementById('modal-root');
    if ((modalRoot && modalRoot.firstChild) || document.querySelector('.palette-backdrop') || BAO.output.isOverlayOpen()) return;

    if (/^[1-8]$/.test(event.key)) {
      event.preventDefault();
      if (!event.repeat) play(parseInt(event.key, 10) - 1, true);
      return;
    }
    if (event.key === 'Escape' || event.key === ' ' || event.key === 'Spacebar' || event.key === 's' || event.key === 'S') {
      if (sounds.stopAll()) event.preventDefault();
    }
  }

  /* --- Zeichnen und Beobachten ------------------------------------------------------------------ */

  function teardown() {
    if (!active) return;
    active.off.forEach(function (off) { off(); });
    active = null;
  }

  /** Tauscht den Stand des Augenblicks aus und lässt den Fokus, wo er war. */
  function refreshLive() {
    if (!active || !active.bar.live.parentNode) return;
    var old = active.bar.live;
    var focused = document.activeElement;
    var key = focused && old.contains(focused) ? focused.dataset.key : '';
    var caret = null;
    if (key && focused.tagName === 'INPUT') {
      try { caret = [focused.selectionStart, focused.selectionEnd]; } catch (err) { /* Zahlenfeld */ }
    }
    var next = liveBlock();
    old.parentNode.replaceChild(next, old);
    active.bar.live = next;
    if (!key) return;
    var target = util.$$('[data-key]', next).filter(function (node) { return node.dataset.key === key; })[0];
    if (!target || target.disabled) return;
    try { target.focus({ preventScroll: true }); } catch (err) { target.focus(); }
    if (caret && caret[0] !== null) {
      try { target.setSelectionRange(caret[0], caret[1]); } catch (err) { /* Zahlenfeld */ }
    }
  }

  function refreshPlaying() {
    if (!active) return;
    var playing = sounds.playingIndex();
    util.$$('.sb-coin .cr-coin', active.node).forEach(function (coin) {
      if (Number(coin.dataset.index) === playing) coin.dataset.playing = 'true';
      else delete coin.dataset.playing;
    });
    var ringing = sounds.isTimerSoundPlaying();
    active.stopButton.disabled = playing < 0 && !ringing;
    var listen = util.$('[data-bind="timer-sound-listen"]', active.node);
    if (listen) {
      util.clear(listen);
      listen.appendChild(ui.icon(ringing ? 'stop' : 'play', 15));
      listen.appendChild(document.createTextNode(ringing ? 'Stopp' : 'Anhören'));
      listen.title = ringing ? 'Wiedergabe beenden' : 'Den Klang am Ende des Timers anhören';
    }
  }

  function render(host, context) {
    teardown();
    var state = context.state;
    var settings = classroom.settings();

    var stopButton = h('button.btn', {
      type: 'button', title: 'Alle Klänge stoppen (Esc, Leertaste oder S)', dataset: { action: 'stop-all' },
      onclick: function () { sounds.stopAll(); }
    }, ui.icon('stop', 16), 'Alles stoppen');

    var bar = barCard(settings);
    var view = h('div.view.sb.sb-ui', {},
      h('div.view__head', {},
        h('div.view__title', {},
          h('h1', { text: 'Soundboard' }),
          h('span.sub', { text: 'Klänge, Unterrichtsleiste und Phasen-Presets' })
        ),
        h('div.spacer'),
        h('div.view__actions', {}, stopButton)
      ),
      h('div.sb-cols', {},
        h('div.sb-col', {}, soundsCard(settings), presetsCard(state)),
        h('div.sb-col', {}, bar, symbolsCard(), notesCard())
      )
    );
    host.appendChild(view);

    active = {
      node: view,
      bar: bar,
      stopButton: stopButton,
      off: [
        classroom.subscribe(function (reason) {
          if (!active) return;
          if (reason === 'tick') { active.bar.live.updateTimer(); return; }
          if (reason === 'live') { refreshLive(); return; }
          // Eigene stille Änderungen zeigen die Bedienelemente schon.
          if (muted) return;
          BAO.app.scheduleRender();
        }),
        sounds.subscribe(refreshPlaying)
      ]
    };
    refreshPlaying();

    if (!keysBound) {
      keysBound = true;
      document.addEventListener('keydown', onKeyDown);
      // Das Beamerfenster kann auch von außen geschlossen werden.
      BAO.output.onChange(function (reason) {
        if (!active || (reason !== 'window-opened' && reason !== 'window-closed')) return;
        var button = util.$('[data-action="toggle-window"]', active.node);
        if (button) windowLabel(button);
      });
    }
  }

  BAO.views = BAO.views || {};
  BAO.views.soundboard = { render: render, unmount: teardown, editPreset: editPreset };
})(window.BAO = window.BAO || {});
