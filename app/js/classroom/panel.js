/* ==========================================================================
   Unterrichtsleiste
   Die textfreie Leiste des Soundboards am rechten Rand der Leinwand: Münzen,
   Projektion, Sozialform, Material, Timer. Sie hängt an jeder Ausgabefläche
   (Beamerfenster, Vollbild, Vorschau) und am Whiteboard – überall dieselbe
   Leiste mit demselben Stand.

   Bedienung wie im Teacher Soundboard:
     Münze        spielt ihren Klang, ein zweiter Klick stoppt
     Projektion   blendet die Sprachhilfe aus und ein; der kleine Knopf
                  daneben öffnet Blättern, Stufen und die Phasen-Presets
     Sozialform   öffnet die Auswahl (eine)
     Material     öffnet die Auswahl (mehrere)
     Scheibe      öffnet die Zeitwahl; darunter Minus, Start/Pause, Plus
     Griff        verschiebt die Leiste senkrecht

   Die Leiste nimmt der Tastatur nichts weg: Ein Klick verschiebt den Fokus
   nicht, damit Projektion, Tafel und Whiteboard ihre Tasten behalten.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;
  var icons = BAO.classroomIcons;
  var classroom = BAO.classroom;
  var sounds = BAO.sounds;

  var panels = [];
  var reflowScheduled = false;

  /** h() für ein bestimmtes Dokument – die Leiste entsteht auch im Beamerfenster. */
  function builder(doc) {
    return function (tag, props) {
      var args = [tag, Object.assign({ ownerDocument: doc }, props || {})];
      for (var i = 2; i < arguments.length; i++) args.push(arguments[i]);
      return util.h.apply(null, args);
    };
  }

  /* --- Bausteine (auch für die Ansicht „Soundboard“) ----------------------------- */

  /** Kachel einer Sozialform oder eines Materials: eigenes Bild oder Symbol. */
  function tileNode(doc, item, options) {
    options = options || {};
    var h = builder(doc);
    var node = h('button.cr-tile' + (options.big ? '.cr-tile--big' : ''), {
      type: 'button', title: options.title || item.name || null, 'aria-label': options.label || item.name || null
    });
    node.style.setProperty('--tile', icons.tileColor(item.icon));
    if (item.imageId && BAO.media.has(item.imageId)) {
      var image = h('img.cr-tile__image', { alt: '', draggable: 'false' });
      image.src = BAO.media.url(item.imageId);
      node.appendChild(image);
    } else {
      node.appendChild(icons.glyph(doc, item.icon));
    }
    if (options.selected) node.dataset.selected = 'true';
    return node;
  }

  /** Münze einer Klangtaste: eigenes Bild oder nummerierte Münze. */
  function coinNode(doc, index, button, options) {
    options = options || {};
    var h = builder(doc);
    var number = index + 1;
    var name = button && button.mediaId ? (button.name || 'Klang') : 'noch kein Klang';
    var node = h('button.cr-coin', {
      type: 'button', title: options.title || ('Münze ' + number + ': ' + name),
      'aria-label': 'Münze ' + number + ': ' + name, dataset: { index: String(index) }
    });
    if (button && button.imageId && BAO.media.has(button.imageId)) {
      var image = h('img.cr-coin__image', { alt: '', draggable: 'false' });
      image.src = BAO.media.url(button.imageId);
      node.appendChild(image);
    } else {
      node.appendChild(icons.coin(doc, number));
    }
    if (!button || !button.mediaId) node.dataset.empty = 'true';
    if (sounds.playingIndex() === index) node.dataset.playing = 'true';
    return node;
  }

  /* --- Stand der Projektion ---------------------------------------------------------- */

  function projectionStatus() {
    var store = BAO.store.getState();
    var session = BAO.session.getState();
    if (session.active) {
      var bank = session.bankId ? BAO.select.bank(store, session.bankId) : null;
      var bankGroup = bank ? BAO.select.group(store, bank.groupId) : null;
      return {
        kind: 'bank', active: true, blank: !!session.blank, level: session.level,
        title: bank ? bank.title : 'Live-Hilfe', group: bankGroup ? bankGroup.name : '',
        page: session.index + 1, pages: BAO.session.totalSlides()
      };
    }
    if (BAO.board.isActive()) {
      var board = BAO.board.getBoard();
      var boardGroup = board ? BAO.select.group(store, board.groupId) : null;
      return {
        kind: 'board', active: true, blank: !!BAO.board.getState().blank, level: 0,
        title: board ? board.title : 'Tafel', group: boardGroup ? boardGroup.name : '',
        page: 0, pages: 0
      };
    }
    return { kind: '', active: false, blank: false, level: 0, title: '', group: '', page: 0, pages: 0 };
  }

  function projectionSignature(status) {
    return [status.kind, status.active, status.blank, status.level, status.title, status.group, status.page, status.pages].join('|');
  }

  function toggleProjectionBlank() {
    if (BAO.session.getState().active) BAO.session.toggleBlank();
    else if (BAO.board.isActive()) BAO.board.toggleBlank();
  }

  function stopProjection() {
    if (BAO.session.getState().active) BAO.session.stop();
    if (BAO.board.isActive()) BAO.board.stop();
    BAO.output.closeOverlay();
    if (BAO.app) BAO.app.scheduleRender();
  }

  /* --- Leinwand neu einteilen ------------------------------------------------------------
     Ändert sich die Breite der Leiste, hat der Inhalt mehr oder weniger Platz.
     Wortbank und Tafel teilen ihre Fläche dann neu ein. */

  function scheduleReflow() {
    if (reflowScheduled) return;
    reflowScheduled = true;
    window.requestAnimationFrame(function () {
      reflowScheduled = false;
      if (BAO.session.getState().active) BAO.session.renderAll({ reason: 'resize' });
      else if (BAO.board.isActive()) BAO.board.renderAll('resize');
    });
  }

  /* --- Die Leiste ---------------------------------------------------------------------------- */

  /**
   * Hängt eine Leiste in eine Fläche.
   * @param {HTMLElement} host  Leinwand (.bao-stage) oder Zeichenfläche (.wb)
   * @param {{kind: 'stage'|'whiteboard', surface?: object}} options
   */
  function mount(host, options) {
    options = options || {};
    var kind = options.kind || 'stage';
    var doc = host.ownerDocument;
    var win = doc.defaultView || window;
    var h = builder(doc);

    BAO.render.ensureStyle(doc, false);
    sounds.bindDocument(doc);

    // Die Leiste hängt nur in der Fläche, solange sie etwas zeigt: Ohne
    // eingeschalteten Baustein bleibt die Projektion frei von Bedienelementen.
    var node = h('div.cr-panel', { dataset: { host: kind }, hidden: true });
    var groups = h('div.cr-groups');
    var grip = h('button.cr-grip', {
      type: 'button', title: 'Leiste verschieben', 'aria-label': 'Unterrichtsleiste senkrecht verschieben'
    });
    node.appendChild(grip);
    node.appendChild(groups);

    var destroyed = false;
    var dial = null;
    var toggleButton = null;
    var lastTimerPhase = '';
    var lastProjection = '';
    var popup = null;
    var ownTicker = null;
    var reserve = -1;
    var dragging = false;
    var anchors = {};

    /* Ein Klick auf die Leiste darf den Fokus nicht verschieben – sonst
       gehörten Leertaste und Eingabetaste plötzlich der Leiste. */
    function keepFocus(event) {
      if (event.target.closest && event.target.closest('button')) event.preventDefault();
    }
    function ownKeys(event) {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') event.stopPropagation();
    }
    node.addEventListener('mousedown', keepFocus);
    node.addEventListener('keydown', ownKeys);

    /* --- Aufbau ------------------------------------------------------------------------ */

    function buildCoins(settings) {
      var row = h('div.cr-row');
      for (var i = 0; i < settings.sounds.visible; i++) {
        (function (index) {
          var coin = coinNode(doc, index, settings.sounds.buttons[index]);
          coin.addEventListener('click', function () { sounds.triggerWithFeedback(index); });
          row.appendChild(coin);
        })(i);
      }
      return h('div.cr-group', { dataset: { module: 'sounds' } }, row);
    }

    function buildProjection() {
      var status = projectionStatus();
      lastProjection = projectionSignature(status);
      var state = !status.active ? 'ready' : (status.blank ? 'blank' : 'live');
      var label = !status.active ? 'Projektion: nichts läuft – Steuerung öffnen'
        : (status.blank ? 'Sprachhilfe wieder einblenden' : 'Sprachhilfe ausblenden');
      var tile = h('button.cr-tile.cr-tile--big', {
        type: 'button', title: label, 'aria-label': label, dataset: { state: state },
        onclick: function () {
          if (projectionStatus().active) toggleProjectionBlank(); else openPopup('projection', tile);
        },
        oncontextmenu: function (event) { event.preventDefault(); openPopup('projection', tile); }
      }, icons.boite(doc, state, status.level));
      tile.style.setProperty('--tile', icons.BOITE_COLORS[state]);
      var menu = h('button.cr-round', {
        type: 'button', title: 'Projektion steuern und Phasen-Presets starten',
        'aria-label': 'Projektion steuern und Phasen-Presets starten',
        onclick: function () { openPopup('projection', tile); }
      }, icons.action(doc, 'menu'));
      anchors.projection = tile;
      return h('div.cr-group', { dataset: { module: 'projection' } },
        h('div.cr-timer__row', {}, menu, tile));
    }

    function buildPhase() {
      var item = classroom.phaseItem();
      var tile = tileNode(doc, item || { name: 'Sozialform wählen', icon: 'phase-placeholder' }, {
        big: true, title: item ? item.name + ' – ändern' : 'Sozialform oder Methode wählen'
      });
      tile.addEventListener('click', function () { openPopup('phase', tile); });
      anchors.phase = tile;
      return h('div.cr-group', { dataset: { module: 'phase' } }, tile);
    }

    function buildMaterials() {
      var items = classroom.materialItems();
      var row = h('div.cr-row');
      if (!items.length) items = [{ name: 'Material wählen', icon: 'material-placeholder' }];
      items.forEach(function (item) {
        var tile = tileNode(doc, item, { title: item.id ? item.name + ' – Material ändern' : 'Material wählen' });
        tile.addEventListener('click', function () { openPopup('materials', row); });
        row.appendChild(tile);
      });
      anchors.materials = row;
      return h('div.cr-group', { dataset: { module: 'materials' } }, row);
    }

    function buildTimer() {
      dial = icons.dial(doc);
      var face = h('button.cr-dial', {
        type: 'button', title: 'Zeit wählen', 'aria-label': 'Timer: Zeit wählen',
        onclick: function () { openPopup('timer', face); }
      }, dial.node);
      toggleButton = h('button.cr-round.cr-round--main', {
        type: 'button', onclick: function () { classroom.toggleTimer(); }
      });
      anchors.timer = face;
      lastTimerPhase = '';
      return h('div.cr-group', { dataset: { module: 'timer' } },
        face,
        h('div.cr-timer__row', {},
          h('button.cr-round', {
            type: 'button', title: 'Eine Minute weniger', 'aria-label': 'Eine Minute weniger',
            onclick: function () { classroom.adjustTimer(-1); }
          }, icons.action(doc, 'minus')),
          toggleButton,
          h('button.cr-round', {
            type: 'button', title: 'Eine Minute mehr', 'aria-label': 'Eine Minute mehr',
            onclick: function () { classroom.adjustTimer(1); }
          }, icons.action(doc, 'plus'))
        ));
    }

    function updateTimer() {
      if (!dial) return;
      var view = classroom.timerView();
      dial.set(view.progress, view.phase);
      if (view.phase === lastTimerPhase) return;
      lastTimerPhase = view.phase;
      var running = view.phase === 'running';
      var label = running ? 'Timer anhalten'
        : view.phase === 'paused' ? 'Timer fortsetzen'
        : view.phase === 'done' ? 'Timer von vorn beginnen'
        : 'Timer starten (' + view.defaultMinutes + ' Minuten)';
      util.clear(toggleButton);
      toggleButton.appendChild(icons.action(doc, running ? 'pause' : 'play'));
      toggleButton.title = label;
      toggleButton.setAttribute('aria-label', label);
      node.dataset.timer = view.phase;
    }

    function render() {
      if (destroyed) return;
      var settings = classroom.settings();
      var show = settings.show;
      util.clear(groups);
      dial = null;
      toggleButton = null;
      anchors = {};

      if (show.sounds) groups.appendChild(buildCoins(settings));
      if (show.projection) groups.appendChild(buildProjection());
      if (show.phase) groups.appendChild(buildPhase());
      if (show.materials) groups.appendChild(buildMaterials());
      if (show.timer) groups.appendChild(buildTimer());

      var visible = !!groups.firstChild;
      node.hidden = !visible;
      if (visible && node.parentNode !== host) host.appendChild(node);
      else if (!visible && node.parentNode) node.parentNode.removeChild(node);
      updateTimer();
      syncTicker();
      layout();
      if (popup) {
        // Der Baustein eines offenen Auswahlfelds ist verschwunden? Dann schließen.
        if (!show[popup.module] || node.hidden) closePopup(); else popup.render();
      }
    }

    function updateCoins() {
      var playing = sounds.playingIndex();
      util.$$('.cr-coin', groups).forEach(function (coin) {
        if (Number(coin.dataset.index) === playing) coin.dataset.playing = 'true';
        else delete coin.dataset.playing;
      });
    }

    /* --- Größe und Lage -------------------------------------------------------------------
       Grundeinheit aus der Höhe der Fläche (wie im Soundboard: 6,2 %). Passt
       die Leiste nicht, schrumpft sie in Schritten, bis sie passt. */

    function freeSpan() {
      var height = host.clientHeight;
      var top = 0;
      var bottom = 0;
      if (kind === 'whiteboard') {
        // Werkzeugleisten der Zeichenfläche freihalten, soweit sie am rechten Rand liegen.
        var box = host.getBoundingClientRect();
        var left = box.right - node.offsetWidth - 8;
        var options_ = host.querySelector('.wb-options');
        var zoom = host.querySelector('.wb-zoom');
        if (options_) {
          var o = options_.getBoundingClientRect();
          if (o.right > left) top = Math.max(top, o.bottom - box.top + 6);
        }
        if (zoom) {
          var z = zoom.getBoundingClientRect();
          if (z.right > left) bottom = Math.max(bottom, box.bottom - z.top + 6);
        }
      }
      return { top: top, bottom: bottom, height: Math.max(0, height - top - bottom) };
    }

    function layout() {
      if (destroyed) return;
      if (node.hidden) { setReserve(0); return; }
      var height = host.clientHeight;
      if (!height) return;                       // noch nicht im Dokument – der Beobachter meldet sich

      var unit = util.clamp(height * 0.062, 14, 96);
      node.style.setProperty('--cu', unit.toFixed(2) + 'px');
      var span = freeSpan();
      var guard = 0;
      while (node.offsetHeight > span.height && unit > 9 && guard < 24) {
        unit *= 0.92;
        node.style.setProperty('--cu', unit.toFixed(2) + 'px');
        guard += 1;
      }
      if (kind === 'whiteboard' && guard) span = freeSpan();

      if (!dragging) {
        var room = Math.max(0, span.height - node.offsetHeight);
        node.style.top = Math.round(span.top + room * classroom.settings().panelY) + 'px';
      }
      setReserve(node.offsetWidth);
      if (popup) popup.place();
    }

    function setReserve(width) {
      if (kind !== 'stage' || width === reserve) return;
      reserve = width;
      if (width) host.style.setProperty('--cr-reserve', width + 'px');
      else host.style.removeProperty('--cr-reserve');
      scheduleReflow();
    }

    /* --- Verschieben ---------------------------------------------------------------------- */

    grip.addEventListener('pointerdown', function (event) {
      if (event.button !== undefined && event.button !== 0) return;
      var span = freeSpan();
      var room = Math.max(0, span.height - node.offsetHeight);
      var startTop = parseFloat(node.style.top) || span.top;
      var startY = event.clientY;
      dragging = true;
      node.dataset.dragging = 'true';
      closePopup();
      try { grip.setPointerCapture(event.pointerId); } catch (err) { /* ältere Browser */ }
      event.preventDefault();

      function move(moveEvent) {
        var top = util.clamp(startTop + moveEvent.clientY - startY, span.top, span.top + room);
        node.style.top = Math.round(top) + 'px';
      }
      function end() {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', end);
        grip.removeEventListener('pointercancel', end);
        dragging = false;
        delete node.dataset.dragging;
        var top = parseFloat(node.style.top) || span.top;
        classroom.setPanelY(room > 0 ? (top - span.top) / room : 0);
        layout();
      }
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', end);
      grip.addEventListener('pointercancel', end);
    });

    /* --- Auswahlfelder ---------------------------------------------------------------------- */

    function closePopup() {
      if (!popup) return;
      var closing = popup;
      popup = null;
      doc.removeEventListener('pointerdown', closing.onOutside, true);
      doc.removeEventListener('keydown', closing.onKey, true);
      if (closing.node.parentNode) closing.node.parentNode.removeChild(closing.node);
    }

    function openPopup(module, anchor) {
      if (popup && popup.module === module) { closePopup(); return; }
      closePopup();
      var box = h('div.cr-pop', { role: 'dialog', dataset: { module: module } });
      box.addEventListener('mousedown', keepFocus);
      box.addEventListener('keydown', ownKeys);
      var local = {};                           // Zwischenstand eines Felds (z. B. gewählte Minuten)

      var current = {
        module: module,
        node: box,
        render: function () {
          util.clear(box);
          POPUPS[module](box, local);
          current.place();
        },
        place: function () {
          var area = host.getBoundingClientRect();
          var unit = util.clamp(area.height * 0.11, 30, 66);
          box.style.setProperty('--pu', unit.toFixed(1) + 'px');
          var target = (anchors[module] && anchors[module].isConnected ? anchors[module] : anchor);
          var at = target && target.isConnected ? target.getBoundingClientRect() : node.getBoundingClientRect();
          var panelBox = node.getBoundingClientRect();
          var gap = Math.round(unit * 0.18);
          var right = Math.max(6, area.right - panelBox.left + gap);
          right = Math.min(right, Math.max(6, area.width - box.offsetWidth - 6));
          var top = util.clamp(at.top - area.top, 6, Math.max(6, area.height - box.offsetHeight - 6));
          box.style.right = Math.round(right) + 'px';
          box.style.top = Math.round(top) + 'px';
        },
        onOutside: function (event) {
          var target = event.target;
          if (box.contains(target) || node.contains(target)) return;
          closePopup();
        },
        onKey: function (event) {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          event.stopImmediatePropagation();
          closePopup();
        }
      };
      popup = current;
      host.appendChild(box);
      doc.addEventListener('pointerdown', current.onOutside, true);
      doc.addEventListener('keydown', current.onKey, true);
      current.render();
    }

    function key(label, title, onClick, extra) {
      var button = h('button.cr-key', Object.assign({ type: 'button', title: title, 'aria-label': title }, extra || {}));
      if (typeof label === 'string') button.textContent = label; else button.appendChild(label);
      button.addEventListener('click', onClick);
      return button;
    }

    var POPUPS = {
      /* Sozialform: genau eine. Die Wahl schließt das Feld. */
      phase: function (box) {
        var grid = h('div.cr-pop__grid');
        var selected = classroom.live().phaseId;
        classroom.catalog('phases').forEach(function (item) {
          var tile = tileNode(doc, item, { selected: item.id === selected });
          tile.addEventListener('click', function () { classroom.setPhase(item.id); closePopup(); });
          grid.appendChild(tile);
        });
        var clear = tileNode(doc, { name: 'Auswahl löschen', icon: 'clear' });
        clear.addEventListener('click', function () { classroom.setPhase(''); closePopup(); });
        grid.appendChild(clear);
        box.appendChild(grid);
      },

      /* Material: mehrere. Das Feld bleibt offen, bis daneben geklickt wird. */
      materials: function (box) {
        var grid = h('div.cr-pop__grid');
        var selected = classroom.live().materialIds;
        classroom.catalog('materials').forEach(function (item) {
          var tile = tileNode(doc, item, { selected: selected.indexOf(item.id) >= 0 });
          tile.addEventListener('click', function () { classroom.toggleMaterial(item.id); });
          grid.appendChild(tile);
        });
        var clear = tileNode(doc, { name: 'Auswahl löschen', icon: 'clear' });
        clear.addEventListener('click', function () { classroom.clearMaterials(); });
        grid.appendChild(clear);
        box.appendChild(grid);
      },

      /* Timer: Schnellwahl, eigene Dauer, von vorn, löschen. */
      timer: function (box, local) {
        var settings = classroom.settings();
        var view = classroom.timerView();
        if (!local.minutes) local.minutes = view.totalMinutes || settings.timerMinutes;

        var presets = h('div.cr-pop__row.cr-pop__row--wrap');
        settings.timerPresets.forEach(function (minutes) {
          presets.appendChild(key(String(minutes), minutes + ' Minuten starten', function () {
            classroom.startTimer(minutes);
            closePopup();
          }));
        });
        box.appendChild(presets);

        var value = h('div.cr-pop__value', {}, String(local.minutes), h('small', { text: 'Minuten' }));
        function step(delta) {
          return function () {
            local.minutes = util.clamp(local.minutes + delta, 1, 999);
            popup.render();
          };
        }
        box.appendChild(h('div.cr-pop__row', {},
          key('−5', 'Fünf Minuten weniger', step(-5)),
          key(icons.action(doc, 'minus'), 'Eine Minute weniger', step(-1)),
          value,
          key(icons.action(doc, 'plus'), 'Eine Minute mehr', step(1)),
          key('+5', 'Fünf Minuten mehr', step(5)),
          key(icons.action(doc, 'play'), 'Mit dieser Dauer starten', function () {
            classroom.startTimer(local.minutes);
            closePopup();
          }, { 'aria-pressed': 'true' })
        ));

        box.appendChild(h('div.cr-pop__row', {},
          key(icons.action(doc, 'reset'), 'Von vorn beginnen', function () {
            classroom.resetTimer();
            closePopup();
          }, { disabled: !view.hasValue }),
          key(icons.action(doc, 'stop'), 'Timer löschen', function () {
            classroom.clearTimer();
            closePopup();
          }, { disabled: !view.hasValue })
        ));
      },

      /* Projektion: ausblenden, blättern, Stufe, beenden – und die Phasen-Presets. */
      projection: function (box) {
        var status = projectionStatus();
        var detail = [];
        if (status.group) detail.push(status.group);
        if (status.kind === 'bank' && status.pages) detail.push('Seite ' + status.page + ' von ' + status.pages);
        if (status.blank) detail.push('ausgeblendet');
        box.appendChild(h('div', {},
          h('div.cr-pop__head', { text: status.active ? status.title : 'Keine Projektion' }),
          h('div.cr-pop__detail', { text: status.active ? detail.join(' · ') : 'Wortbank oder Tafel öffnen – oder ein Preset starten.' })
        ));

        var paging = status.kind === 'bank' && status.pages > 1;
        box.appendChild(h('div.cr-pop__row', {},
          key(icons.action(doc, 'prev'), 'Vorherige Seite', function () { BAO.session.prev(); }, { disabled: !paging }),
          key(icons.action(doc, status.blank ? 'eye-off' : 'eye'),
            status.blank ? 'Sprachhilfe wieder einblenden' : 'Sprachhilfe ausblenden',
            toggleProjectionBlank, { disabled: !status.active }),
          key(icons.action(doc, 'next'), 'Nächste Seite', function () { BAO.session.next(false); }, { disabled: !paging })
        ));

        var levels = h('div.cr-pop__row');
        [1, 2, 3].forEach(function (level) {
          levels.appendChild(key(icons.action(doc, 'level' + level), 'Unterstützungsstufe ' + level,
            function () { BAO.session.setLevel(level); },
            { disabled: status.kind !== 'bank', 'aria-pressed': status.kind === 'bank' && status.level === level ? 'true' : 'false' }));
        });
        box.appendChild(levels);

        box.appendChild(h('div.cr-pop__row', {},
          key(icons.action(doc, 'live'), 'Live-Hilfe einblenden', function () {
            closePopup();
            // Der Dialog steht in der Lehreransicht – im Vollbild wäre er unsichtbar.
            if (document.fullscreenElement && document.exitFullscreen) {
              var leaving = document.exitFullscreen();
              if (leaving && leaving.catch) leaving.catch(function () {});
            }
            BAO.app.openLiveHelp();
          }),
          key(icons.action(doc, 'stop'), 'Projektion beenden', function () {
            closePopup();
            stopProjection();
          }, { disabled: !status.active })
        ));

        var list = classroom.presets();
        box.appendChild(h('div.cr-pop__sep'));
        box.appendChild(h('div.cr-pop__label', { text: 'Gemeinsam starten' }));
        if (!list.length) {
          box.appendChild(h('div.cr-pop__detail', { text: 'Noch kein Phasen-Preset angelegt.' }));
        } else {
          var presetList = h('div.cr-pop__list');
          list.forEach(function (item) {
            var info = classroom.presetStatus(item);
            var label = (info.missing ? '⚠ ' : '') + BAO.classroomModel.presetLabel(item);
            presetList.appendChild(key(label, info.missing
              ? 'Das Ziel ist nicht mehr vorhanden – Sozialform, Material und Timer werden trotzdem eingestellt.'
              : 'Projektion, Sozialform, Material und Timer gemeinsam starten',
              function () { closePopup(); startPreset(item.id); },
              { 'class': 'cr-key--wide', dataset: { warn: info.missing ? 'true' : null } }));
          });
          box.appendChild(presetList);
        }
        box.appendChild(key('Presets verwalten …', 'Zur Ansicht „Soundboard“', function () {
          closePopup();
          BAO.app.go('soundboard');
        }, { 'class': 'cr-key--wide' }));
      }
    };

    /* --- Beobachten ------------------------------------------------------------------------- */

    /* Im Beamerfenster tickt die Uhr zusätzlich im eigenen Fenster: Browser
       bremsen ein verdecktes Hauptfenster aus, das sichtbare Beamerfenster nicht. */
    function syncTicker() {
      var needed = !destroyed && win !== window && classroom.live().timer.running;
      if (needed && !ownTicker) {
        ownTicker = win.setInterval(function () { classroom.tick(); }, classroom.TICK_MS);
      } else if (!needed && ownTicker) {
        win.clearInterval(ownTicker);
        ownTicker = null;
      }
    }

    function onProjection() {
      if (destroyed || !classroom.settings().show.projection) return;
      if (projectionSignature(projectionStatus()) === lastProjection) return;
      render();
    }

    var unsubscribe = [
      classroom.subscribe(function (reason) {
        if (destroyed) return;
        if (reason === 'tick') { updateTimer(); return; }
        render();
      }),
      sounds.subscribe(function () { if (!destroyed) updateCoins(); }),
      BAO.session.subscribe(onProjection),
      BAO.board.subscribe(onProjection)
    ];

    var observer = null;
    if (win.ResizeObserver) {
      observer = new win.ResizeObserver(function () { layout(); });
      observer.observe(host, { box: 'border-box' });
    } else {
      win.addEventListener('resize', layout);
    }

    var controller = {
      kind: kind,
      host: host,
      node: node,
      surface: options.surface || null,
      render: render,
      layout: layout,
      isAlive: function () { return !destroyed; },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        closePopup();
        unsubscribe.forEach(function (off) { if (off) off(); });
        if (observer) observer.disconnect(); else win.removeEventListener('resize', layout);
        try { if (ownTicker) win.clearInterval(ownTicker); } catch (err) { /* Fenster ist schon zu */ }
        ownTicker = null;
        if (node.parentNode) node.parentNode.removeChild(node);
        try { host.style.removeProperty('--cr-reserve'); } catch (err) { /* Fenster ist schon zu */ }
        var index = panels.indexOf(controller);
        if (index >= 0) panels.splice(index, 1);
      }
    };
    panels.push(controller);
    render();
    return controller;
  }

  /** Startet ein Preset und meldet ein fehlendes Ziel in Worten. */
  function startPreset(id) {
    var item = classroom.preset(id);
    var result = classroom.startPreset(id);
    if (result.ok && result.missing && item) {
      BAO.toast.show('„' + BAO.classroomModel.presetLabel(item) + '“: Das Ziel ist nicht mehr vorhanden. '
        + 'Sozialform, Material und Timer sind eingestellt.', { timeout: 6000 });
    }
    return result;
  }

  /* --- An die Ausgabeflächen hängen -------------------------------------------------------------- */

  /** Entfernt Leisten, deren Fläche es nicht mehr gibt (Vorschau neu gebaut, Fenster zu). */
  function prune() {
    var alive = BAO.output.surfaces();
    panels.slice().forEach(function (panel) {
      if (panel.kind === 'stage' && alive.indexOf(panel.surface) < 0) panel.destroy();
    });
  }

  BAO.output.onSurface(function (surface) {
    prune();
    try {
      mount(surface.stage.root, { kind: 'stage', surface: surface });
    } catch (err) {
      console.error('Die Unterrichtsleiste konnte nicht aufgebaut werden:', err);
    }
  });
  BAO.output.onChange(function (reason) {
    if (reason === 'window-closed' || reason === 'overlay-closed') prune();
  });

  BAO.classroomPanel = {
    mount: mount,
    tileNode: tileNode,
    coinNode: coinNode,
    projectionStatus: projectionStatus,
    startPreset: startPreset,
    /** Für Prüfungen: alle gerade hängenden Leisten. */
    panels: function () { return panels.slice(); }
  };
})(window.BAO = window.BAO || {});
