/* ==========================================================================
   Tafel – die einfache Grundform der Projektion
   Eine Fläche, auf der Elemente frei stehen. Ein Element ist ein Eintrag des
   Bestands; ob dahinter ein einzelnes Wort oder ein ganzer Satzanfang steht,
   spielt für die Bedienung keine Rolle.

   Alles, was hier geschieht, geschieht auf jeder Ausgabefläche gleichzeitig:
   in der Vorschau der Lehreransicht, in der Vollbild-Überlagerung und im
   eigenen Beamerfenster. Verschieben und Anlegen funktionieren auf allen
   dreien – auch direkt auf dem Beamerbild.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;
  var ui = BAO.ui;
  var output = BAO.output;
  var select = BAO.select;
  var schema = BAO.schema;

  var MIN_SCALE = 0.6;
  var MAX_SCALE = 2.2;
  var NUDGE = 0.012;              // Pfeiltaste: knapp über einem Prozent

  var BOARD_HINT = [
    ['Doppelklick', 'Element anlegen'],
    ['Ziehen', 'verschieben'],
    ['F', 'Vollbild'],
    ['B', 'Bildschirm leeren']
  ];

  var state = {
    active: false,
    boardId: '',
    selectedId: '',
    theme: 'light',
    scale: 1,
    blank: false
  };

  var listeners = [];
  var drag = null;                // { itemId, node, grabX, grabY, box, moved }
  var composer = null;            // { surface, node, input, itemId, x, y, closing }
  var keysBound = false;

  function subscribe(fn) {
    listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  function emit(reason) {
    listeners.forEach(function (fn) {
      try { fn(state, reason); } catch (err) { console.error('Fehler im Tafelbeobachter:', err); }
    });
  }

  /* --- Zugriff auf den Bestand --------------------------------------------- */

  function currentBoard(source) {
    var store = source || BAO.store.getState();
    if (!store || !state.boardId) return null;
    return select.board(store, state.boardId);
  }

  function entries(board) {
    return board ? select.boardEntries(BAO.store.getState(), board) : [];
  }

  function itemOf(board, itemId) {
    if (!board) return null;
    return (board.items || []).filter(function (item) { return item.id === itemId; })[0] || null;
  }

  /* --- Aufbau eines Elements ------------------------------------------------ */

  function cardNode(doc, entry, board) {
    var node = doc.createElement('div');
    node.className = 'bcard';
    node.dataset.itemId = entry.item.id;
    node.dataset.selected = entry.item.id === state.selectedId ? 'true' : 'false';
    node.tabIndex = 0;
    node.setAttribute('role', 'button');
    node.setAttribute('aria-label', entry.text + ' – ziehen zum Verschieben');
    node.style.left = (entry.item.x * 100) + '%';
    node.style.top = (entry.item.y * 100) + '%';
    node.style.setProperty('--card-scale', entry.item.scale || 1);

    var text = doc.createElement('div');
    text.className = 'bcard__text';
    // Ein vorhandener Artikel wird farbig nach Genus mitgezeigt – aber nur,
    // wenn einer gepflegt ist. Elemente ohne weitere Angaben bleiben schlicht.
    if (board.showArticle && entry.kind === 'lex') {
      var article = ui.articleNode(entry.ref, doc);
      if (article) {
        text.appendChild(article);
        var written = article.textContent;
        if (written.charAt(written.length - 1) !== '’') text.appendChild(doc.createTextNode(' '));
      }
    }
    text.appendChild(ui.gapText(entry.text, doc));
    node.appendChild(text);

    if (board.showTranslation && entry.ref.translation) {
      var translation = doc.createElement('div');
      translation.className = 'bcard__de';
      translation.textContent = entry.ref.translation;
      node.appendChild(translation);
    }
    return node;
  }

  /**
   * Holt ein Element vollständig in die Fläche zurück.
   * Gespeichert ist die Mitte als Anteil der Fläche; wie breit ein Element
   * dabei tatsächlich wird, hängt von Text und Auflösung ab. Deshalb wird die
   * Anzeige nach dem Messen nachjustiert – der gespeicherte Wert bleibt.
   */
  function fitIntoSurface(body) {
    var width = body.clientWidth;
    var height = body.clientHeight;
    if (!width || !height) return;
    util.$$('.bcard', body).forEach(function (node) {
      var halfX = (node.offsetWidth / 2) / width;
      var halfY = (node.offsetHeight / 2) / height;
      var x = parseFloat(node.style.left) / 100;
      var y = parseFloat(node.style.top) / 100;
      if (halfX < 0.5) node.style.left = (util.clamp(x, halfX, 1 - halfX) * 100) + '%';
      if (halfY < 0.5) node.style.top = (util.clamp(y, halfY, 1 - halfY) * 100) + '%';
    });
  }

  /* --- Zeichnen ------------------------------------------------------------- */

  /** Grundeinheit der Schriftgröße aus der tatsächlichen Flächengröße. */
  function applyUnit(surface) {
    var root = surface.stage.root;
    var width = root.clientWidth || 960;
    var height = root.clientHeight || 540;
    var unit = Math.min(width * 0.0105, height * 0.0185);
    root.style.setProperty('--u', Math.max(unit, 2) + 'px');
  }

  function renderSurface(surface, board, store) {
    var stage = surface.stage;
    var doc = stage.doc;

    stage.root.dataset.stageTheme = state.theme;
    stage.root.dataset.blank = state.blank ? 'true' : 'false';
    stage.root.dataset.focus = 'false';
    stage.root.setAttribute('data-blank-hint', 'Bildschirm geleert – Taste B zeigt die Tafel wieder');
    stage.root.style.setProperty('--user-scale', state.scale);

    var subject = board ? select.subject(store, board.subjectId) : null;
    var group = board ? select.group(store, board.groupId) : null;

    util.clear(stage.crumb);
    if (subject) {
      var strong = doc.createElement('b');
      strong.textContent = subject.name;
      stage.crumb.appendChild(strong);
      if (group) stage.crumb.appendChild(doc.createTextNode(' · ' + group.name));
    }
    stage.title.textContent = board ? board.title : 'Tafel';

    var list = board ? entries(board) : [];
    stage.pos.textContent = list.length
      ? list.length + ' ' + util.plural(list.length, 'Element', 'Elemente')
      : '';
    stage.foot.dataset.hidden = 'true';

    util.clear(stage.body);
    stage.body.dataset.layout = 'board';
    stage.body.style.removeProperty('--cols');

    if (!list.length) {
      var empty = doc.createElement('div');
      empty.className = 'stage__empty';
      empty.textContent = 'Doppelklick auf die Fläche legt ein Element an.';
      stage.body.appendChild(empty);
    } else {
      list.forEach(function (entry) { stage.body.appendChild(cardNode(doc, entry, board)); });
      fitIntoSurface(stage.body);
    }

    bindSurface(surface);
  }

  function renderAll(reason) {
    var store = BAO.store.getState();
    var board = currentBoard(store);
    var surfaces = output.surfaces();
    surfaces.forEach(function (surface) {
      applyUnit(surface);
      renderSurface(surface, board, store);
    });
    restoreFocus();
    emit(reason || 'render');
  }

  /** Nach einem Neuaufbau steht die Auswahl wieder unter der Tastatur. */
  var focusWanted = false;
  function restoreFocus() {
    if (!focusWanted || !state.selectedId) return;
    focusWanted = false;
    var surfaces = output.surfaces();
    for (var i = 0; i < surfaces.length; i++) {
      var node = cardIn(surfaces[i], state.selectedId);
      if (node) { try { node.focus({ preventScroll: true }); } catch (err) { node.focus(); } return; }
    }
  }

  function cardIn(surface, itemId) {
    return surface.stage.body.querySelector('.bcard[data-item-id="' + itemId + '"]');
  }

  function eachCard(itemId, fn) {
    output.surfaces().forEach(function (surface) {
      var node = cardIn(surface, itemId);
      if (node) fn(node, surface);
    });
  }

  /* --- Auswahl -------------------------------------------------------------- */

  function select_(itemId) {
    state.selectedId = itemId || '';
    output.surfaces().forEach(function (surface) {
      util.$$('.bcard', surface.stage.body).forEach(function (node) {
        node.dataset.selected = node.dataset.itemId === state.selectedId ? 'true' : 'false';
      });
    });
    emit('select');
  }

  /* --- Verschieben ---------------------------------------------------------- */

  function beginDrag(event, node, surface) {
    if (event.button !== undefined && event.button !== 0) return;
    var body = surface.stage.body;
    var box = body.getBoundingClientRect();
    var rect = node.getBoundingClientRect();
    drag = {
      itemId: node.dataset.itemId,
      // Abstand vom Mittelpunkt: Das Element springt beim Anfassen nicht.
      grabX: event.clientX - (rect.left + rect.width / 2),
      grabY: event.clientY - (rect.top + rect.height / 2),
      halfX: (rect.width / 2) / box.width,
      halfY: (rect.height / 2) / box.height,
      box: box,
      moved: false
    };
    select_(drag.itemId);
    eachCard(drag.itemId, function (twin) { twin.dataset.dragging = 'true'; });
    try { node.setPointerCapture(event.pointerId); } catch (err) { /* ältere Browser */ }
    event.preventDefault();
  }

  function moveDrag(event) {
    if (!drag) return;
    var x = (event.clientX - drag.grabX - drag.box.left) / drag.box.width;
    var y = (event.clientY - drag.grabY - drag.box.top) / drag.box.height;
    drag.x = util.clamp(x, Math.min(drag.halfX, 0.5), Math.max(1 - drag.halfX, 0.5));
    drag.y = util.clamp(y, Math.min(drag.halfY, 0.5), Math.max(1 - drag.halfY, 0.5));
    drag.moved = true;
    // Während des Ziehens folgen alle Flächen sofort – ohne Umweg über den
    // Bestand, damit das Bild auf dem Beamer nicht ruckelt.
    eachCard(drag.itemId, function (twin) {
      twin.style.left = (drag.x * 100) + '%';
      twin.style.top = (drag.y * 100) + '%';
    });
  }

  function endDrag() {
    if (!drag) return;
    var finished = drag;
    drag = null;
    eachCard(finished.itemId, function (twin) { delete twin.dataset.dragging; });
    if (!finished.moved || finished.x === undefined) return;
    moveItem(finished.itemId, finished.x, finished.y);
  }

  function moveItem(itemId, x, y) {
    return BAO.store.commit('Element verschoben', function (draft) {
      var board = select.board(draft, state.boardId);
      var item = itemOf(board, itemId);
      if (!item) return false;
      item.x = util.clamp(x, 0, 1);
      item.y = util.clamp(y, 0, 1);
      board.updatedAt = util.nowISO();
    });
  }

  /* --- Eingabe unmittelbar auf der Fläche ------------------------------------ */

  function closeComposer(commitText) {
    if (!composer || composer.closing) return;
    composer.closing = true;
    var text = composer.input.value;
    var target = composer;
    if (target.node.parentNode) target.node.parentNode.removeChild(target.node);
    composer = null;
    if (commitText && text.trim()) {
      if (target.itemId) setText(target.itemId, text.trim());
      else addAt(text, target.x, target.y);
    } else if (!commitText) {
      emit('composer-cancelled');
    }
  }

  /**
   * Öffnet ein Eingabefeld mitten auf der Fläche – auch im Beamerfenster.
   * options: { x, y } für ein neues Element, { itemId } zum Ändern.
   */
  function openComposer(surface, options) {
    closeComposer(false);
    if (!state.active) return null;
    var doc = surface.stage.doc;
    var board = currentBoard();
    if (!board) return null;

    var x = options.x;
    var y = options.y;
    var value = '';
    if (options.itemId) {
      var entry = select.resolveBoardItem(BAO.store.getState(), itemOf(board, options.itemId));
      if (!entry) return null;
      x = entry.item.x;
      y = entry.item.y;
      value = entry.text;
    }

    var input = doc.createElement('input');
    input.type = 'text';
    input.className = 'bcomposer__input';
    input.value = value;
    input.setAttribute('aria-label', options.itemId ? 'Element ändern' : 'Neues Element');
    input.placeholder = options.itemId ? '' : 'Wort oder Satz …';

    var node = doc.createElement('div');
    node.className = 'bcomposer';
    node.style.left = (x * 100) + '%';
    node.style.top = (y * 100) + '%';
    node.appendChild(input);

    var hint = doc.createElement('div');
    hint.className = 'bcomposer__hint';
    hint.textContent = 'Enter übernimmt · Esc bricht ab';
    node.appendChild(hint);

    surface.stage.body.appendChild(node);
    composer = { surface: surface, node: node, input: input, itemId: options.itemId || '', x: x, y: y, closing: false };

    input.addEventListener('keydown', function (event) {
      // Die Tastatur gehört jetzt dem Eingabefeld – nicht der Projektion.
      event.stopPropagation();
      if (event.key === 'Enter') { event.preventDefault(); closeComposer(true); }
      else if (event.key === 'Escape') { event.preventDefault(); closeComposer(false); }
    });
    input.addEventListener('blur', function () { closeComposer(true); });
    input.addEventListener('paste', function (event) {
      var text = event.clipboardData ? event.clipboardData.getData('text') : '';
      if (!/[\r\n]/.test(text)) return;
      // Mehrere Zeilen auf einmal: jede Zeile wird ein eigenes Element.
      event.preventDefault();
      var target = composer;
      closeComposer(false);
      addAt(text, target.x, target.y);
    });

    try { input.focus({ preventScroll: true }); } catch (err) { input.focus(); }
    input.select();
    emit('composer-opened');
    return composer;
  }

  function isComposing() { return !!composer; }

  /* --- Elemente anlegen, ändern, entfernen ----------------------------------- */

  /**
   * Legt aus einem oder mehreren Textzeilen Elemente an.
   * Jedes Element ist ein gewöhnlicher Eintrag des Bestands und lässt sich
   * später um Artikel, Übersetzung, Beispiel und alles Weitere ergänzen.
   */
  function addAt(text, x, y) {
    var lines = String(text || '').split(/\r?\n/).map(function (line) { return line.trim(); })
      .filter(Boolean);
    if (!lines.length) return null;

    var created = [];
    var ok = BAO.store.commit(lines.length > 1 ? lines.length + ' Elemente angelegt' : 'Element angelegt', function (draft) {
      var board = select.board(draft, state.boardId);
      if (!board) return false;
      var group = select.group(draft, board.groupId);
      var unit = board.unitId ? select.unit(draft, board.unitId) : select.currentUnit(draft, board.groupId);
      lines.forEach(function (line, index) {
        var lexeme = schema.makeLexeme({
          subjectId: board.subjectId,
          groupId: board.groupId,
          term: line,
          status: 'new',
          introducedUnitId: unit ? unit.id : '',
          introducedSchoolYear: group ? group.schoolYear : ''
        });
        draft.lexemes.push(lexeme);
        var item = schema.makeBoardItem({
          kind: 'lex',
          refId: lexeme.id,
          // Mehrere Zeilen legen sich versetzt ab, statt sich zu verdecken.
          x: util.clamp(x + index * 0.035, 0.05, 0.95),
          y: util.clamp(y + index * 0.075, 0.06, 0.94)
        });
        board.items.push(item);
        created.push(item.id);
      });
      board.updatedAt = util.nowISO();
    });
    if (!ok) return null;
    select_(created[created.length - 1] || '');
    emit('added');
    return created;
  }

  /** Legt ein Element an einer noch freien Stelle der Fläche an. */
  function add(text) {
    var spot = freeSpot();
    return addAt(text, spot.x, spot.y);
  }

  /** Setzt einen vorhandenen Eintrag des Bestands auf die Tafel. */
  function place(kind, refId, position) {
    var spot = position || freeSpot();
    var newId = null;
    var ok = BAO.store.commit('Element auf die Tafel gelegt', function (draft) {
      var board = select.board(draft, state.boardId);
      if (!board) return false;
      var item = schema.makeBoardItem({ kind: kind, refId: refId, x: spot.x, y: spot.y });
      board.items.push(item);
      board.updatedAt = util.nowISO();
      newId = item.id;
    });
    if (!ok) return null;
    select_(newId);
    emit('added');
    return newId;
  }

  function setText(itemId, text) {
    var value = String(text || '').trim();
    if (!value) return false;
    return BAO.store.commit('Element geändert', function (draft) {
      var board = select.board(draft, state.boardId);
      var item = itemOf(board, itemId);
      if (!item) return false;
      var ref = item.kind === 'starter' ? select.starter(draft, item.refId) : select.lexeme(draft, item.refId);
      if (!ref) return false;
      if (item.kind === 'starter') ref.text = value; else ref.term = value;
      ref.updatedAt = util.nowISO();
      board.updatedAt = util.nowISO();
    });
  }

  /** Nimmt ein Element von der Tafel – der Eintrag selbst bleibt im Bestand. */
  function removeItem(itemId) {
    var removed = null;
    var ok = BAO.store.commit('Element von der Tafel genommen', function (draft) {
      var board = select.board(draft, state.boardId);
      if (!board) return false;
      var before = board.items.length;
      board.items = board.items.filter(function (item) {
        if (item.id !== itemId) return true;
        removed = item;
        return false;
      });
      if (board.items.length === before) return false;
      board.updatedAt = util.nowISO();
    });
    if (!ok) return null;
    if (state.selectedId === itemId) state.selectedId = '';
    return removed;
  }

  function setScaleOf(itemId, scale) {
    return BAO.store.commit('Elementgröße geändert', function (draft) {
      var board = select.board(draft, state.boardId);
      var item = itemOf(board, itemId);
      if (!item) return false;
      item.scale = util.clamp(Math.round(scale * 20) / 20, MIN_SCALE, MAX_SCALE);
      board.updatedAt = util.nowISO();
    });
  }

  /* --- Freie Stelle und Ordnen ---------------------------------------------- */

  /** Sucht die Stelle mit dem größten Abstand zu allem, was schon dasteht. */
  function freeSpot() {
    var board = currentBoard();
    var placed = board ? (board.items || []) : [];
    if (!placed.length) return { x: 0.5, y: 0.45 };
    var best = { x: 0.5, y: 0.5 };
    var bestDistance = -1;
    for (var col = 0; col < 6; col++) {
      for (var row = 0; row < 4; row++) {
        var x = 0.14 + col * 0.144;
        var y = 0.16 + row * 0.226;
        var nearest = Infinity;
        placed.forEach(function (item) {
          var dx = item.x - x;
          var dy = (item.y - y) * 0.6;      // waagerecht ist mehr Platz
          nearest = Math.min(nearest, dx * dx + dy * dy);
        });
        if (nearest > bestDistance) { bestDistance = nearest; best = { x: x, y: y }; }
      }
    }
    return best;
  }

  /** Verteilt alle Elemente gleichmäßig – der Weg zurück aus dem Durcheinander. */
  function arrange() {
    return BAO.store.commit('Tafel geordnet', function (draft) {
      var board = select.board(draft, state.boardId);
      if (!board || !board.items.length) return false;
      var count = board.items.length;
      var cols = Math.max(1, Math.min(5, Math.ceil(Math.sqrt(count * 1.6))));
      var rows = Math.ceil(count / cols);
      board.items.forEach(function (item, index) {
        var col = index % cols;
        var row = Math.floor(index / cols);
        item.x = (col + 0.5) / cols;
        item.y = (row + 0.5) / rows;
      });
      board.updatedAt = util.nowISO();
    });
  }

  /* --- Ereignisse einer Ausgabefläche ---------------------------------------- */

  function positionInBody(event, body) {
    var box = body.getBoundingClientRect();
    return {
      x: util.clamp((event.clientX - box.left) / box.width, 0.06, 0.94),
      y: util.clamp((event.clientY - box.top) / box.height, 0.08, 0.92)
    };
  }

  function bindSurface(surface) {
    var stage = surface.stage;
    if (stage.__boardBound) return;
    stage.__boardBound = true;
    var body = stage.body;

    body.addEventListener('pointerdown', function (event) {
      if (!state.active || !event.target.closest) return;
      if (event.target.closest('.bcomposer')) return;
      var card = event.target.closest('.bcard');
      var itemId = card ? card.dataset.itemId : '';
      // Eine offene Eingabe wird zuerst übernommen – das kann die Fläche neu
      // aufbauen, deshalb wird das angefasste Element danach neu gesucht.
      if (composer) closeComposer(true);
      if (itemId) { beginDrag(event, cardIn(surface, itemId) || card, surface); return; }
      select_('');
    });
    body.addEventListener('pointermove', function (event) {
      if (state.active) moveDrag(event);
    });
    body.addEventListener('pointerup', function () { if (state.active) endDrag(); });
    body.addEventListener('pointercancel', function () { if (state.active) endDrag(); });

    body.addEventListener('dblclick', function (event) {
      if (!state.active) return;
      var card = event.target.closest ? event.target.closest('.bcard') : null;
      event.preventDefault();
      if (card) { openComposer(surface, { itemId: card.dataset.itemId }); return; }
      if (event.target.closest && event.target.closest('.bcomposer')) return;
      var spot = positionInBody(event, body);
      openComposer(surface, spot);
    });
  }

  /* --- Tastatur -------------------------------------------------------------- */

  function isTyping(event) {
    var target = event.target;
    if (!target) return false;
    var tag = (target.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
  }

  function surfaceFor(source) {
    if (source === 'window') return output.getSurface('window');
    return output.getSurface('overlay') || output.getSurface('preview');
  }

  function handleKey(event, source) {
    if (!state.active || composer) return;
    if (source !== 'window') {
      var route = BAO.app.currentRoute();
      if (route.path !== 'tafel' && !output.isOverlayOpen()) return;
      if (isTyping(event)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      var modalRoot = document.getElementById('modal-root');
      if (modalRoot && modalRoot.firstChild) return;
    }

    var step = event.shiftKey ? NUDGE * 4 : NUDGE;
    var board = currentBoard();
    var selected = itemOf(board, state.selectedId);
    var handled = true;

    switch (event.key) {
      case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown':
        if (!selected) { handled = false; break; }
        focusWanted = true;
        moveItem(selected.id,
          selected.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
          selected.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0));
        break;
      case 'Delete': case 'Backspace':
        if (!selected) { handled = false; break; }
        removeItem(selected.id);
        break;
      case 'Enter': case 'F2':
        if (!selected) { handled = false; break; }
        openComposer(surfaceFor(source), { itemId: selected.id });
        break;
      case '+':
        if (!selected) { handled = false; break; }
        focusWanted = true;
        setScaleOf(selected.id, (selected.scale || 1) + 0.1);
        break;
      case '-':
        if (!selected) { handled = false; break; }
        focusWanted = true;
        setScaleOf(selected.id, (selected.scale || 1) - 0.1);
        break;
      case 'b': case 'B': toggleBlank(); break;
      case 'f': case 'F':
        if (source === 'window') output.requestWindowFullscreen();
        else if (output.isOverlayOpen()) output.toggleOverlayFullscreen();
        else output.openOverlay();
        break;
      case 'Escape':
        if (state.selectedId) { select_(''); break; }
        if (source === 'window') { handled = false; break; }
        if (output.isOverlayOpen()) output.closeOverlay(); else handled = false;
        break;
      default:
        // Einfach lostippen: Ein druckbares Zeichen öffnet die Eingabe.
        if (event.key.length === 1 && event.key !== ' '
          && !event.ctrlKey && !event.metaKey && !event.altKey) {
          var surface = surfaceFor(source);
          if (!surface) { handled = false; break; }
          var made = openComposer(surface, freeSpot());
          if (made) made.input.value = event.key;
          else handled = false;
        } else {
          handled = false;
        }
    }
    if (handled) event.preventDefault();
  }

  function bindKeys() {
    if (keysBound) return;
    keysBound = true;
    document.addEventListener('keydown', function (event) { handleKey(event, 'document'); });
    output.onKey(handleKey);
  }

  /* --- Darstellung ----------------------------------------------------------- */

  function setTheme(theme) {
    state.theme = theme === 'dark' ? 'dark' : 'light';
    BAO.store.commit('Darstellung der Projektion', function (draft) {
      draft.settings.stageTheme = state.theme;
    }, { undoable: false });
    renderAll('theme');
  }

  function setScale(scale) {
    state.scale = util.clamp(scale, 0.7, 1.8);
    BAO.store.commit('Schriftgröße der Projektion', function (draft) {
      draft.settings.stageScale = state.scale;
    }, { undoable: false });
    renderAll('scale');
  }

  function toggleBlank() {
    state.blank = !state.blank;
    renderAll('blank');
  }

  function setOption(key, value) {
    return BAO.store.commit('Tafel-Einstellung geändert', function (draft) {
      var board = select.board(draft, state.boardId);
      if (!board) return false;
      board[key] = !!value;
      board.updatedAt = util.nowISO();
    }, { undoable: false });
  }

  /* --- Sitzung --------------------------------------------------------------- */

  function start(boardId) {
    var store = BAO.store.getState();
    var board = select.board(store, boardId);
    if (!board) return null;

    if (BAO.session && BAO.session.getState().active) BAO.session.stop();
    output.setHint(BOARD_HINT);

    state.active = true;
    state.boardId = board.id;
    state.selectedId = '';
    state.blank = false;
    state.theme = store.settings.stageTheme || 'light';
    state.scale = store.settings.stageScale || 1;
    bindKeys();

    BAO.store.commit('Tafel geöffnet', function (draft) {
      var target = select.board(draft, board.id);
      if (target) target.lastUsedAt = util.nowISO();
    }, { undoable: false });

    renderAll('start');
    return state;
  }

  function stop() {
    closeComposer(false);
    state.active = false;
    state.boardId = '';
    state.selectedId = '';
    emit('stop');
  }

  function isActive() { return state.active; }
  function getState() { return state; }

  output.onChange(function (reason) {
    if (!state.active) return;
    if (reason === 'window-opened' || reason === 'overlay-opened') closeComposer(true);
    renderAll(reason);
  });

  BAO.store.subscribe(function (nextState, meta) {
    if (!state.active) return;
    if (meta.reason === 'commit' && meta.label === 'Tafel geöffnet') return;
    if (drag) return;                       // Während des Ziehens nicht dazwischenfunken
    renderAll('store');
  });

  BAO.board = {
    subscribe: subscribe,
    start: start,
    stop: stop,
    isActive: isActive,
    getState: getState,
    getBoard: function () { return currentBoard(); },
    entries: function () { return entries(currentBoard()); },
    renderAll: renderAll,
    select: select_,
    add: add,
    addAt: addAt,
    place: place,
    setText: setText,
    removeItem: removeItem,
    moveItem: moveItem,
    setScaleOf: setScaleOf,
    arrange: arrange,
    freeSpot: freeSpot,
    setTheme: setTheme,
    setScale: setScale,
    toggleBlank: toggleBlank,
    setOption: setOption,
    openComposer: openComposer,
    isComposing: isComposing,
    MIN_SCALE: MIN_SCALE,
    MAX_SCALE: MAX_SCALE
  };
})(window.BAO = window.BAO || {});
